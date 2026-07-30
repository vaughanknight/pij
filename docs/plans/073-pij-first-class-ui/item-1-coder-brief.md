# Coder brief — item 1: plan linkage (`--plan-id`) + `pij attest`

**Status: READY.** All six rulings landed — `dove-rulings-01.md` (commit `c4b6fb5`) is binding; read it.
**Plan**: 073 · **PM**: pij-exclusive-whitefish · **o-prime**: pij-reasonable-dove · **Consumer**: pij-cheap-cheetah (chainglass)

## Your stream

| | |
|---|---|
| worktree | `/Users/jordanknight/pi-hacking/pij-worktrees/s073-pij-first-class-ui` |
| branch | `s073/pij-first-class-ui` |
| base | `c4b6fb5` |
| allocation | `alloc-s073-pij-first-class-ui` |
| fence | `fence-alloc-s073-pij-first-class-ui`, **notify-only** |

Work **only** in that worktree. `~/pi-hacking/pij` is canonical and **shared with other fleets** —
Jordan is working in it personally. `cli.ts` and `types.ts` are declared **shared** on the fence:
you may edit them, but you are not their sole owner, so keep diffs minimal and localised.

## Load first, before touching anything

Both skills, in this order: **`pij`**, then **`builder`**. Work from their contracts. Do **not**
improvise the CLI surface from `pij --help`.

## The job

`pij spawn --plan-id <id>` stamps `planId` on the seat descriptor and exports it to the child as
**`HARNESS_PLAN_ID`** (plus `PIJ_PLAN_ID`), closing the seat→flow join in one operator act. The
harness half is already deployed and verified: `~/substrate/harness-engineering` `2253f8c7`
(PR #81, on `main`) honours `$HARNESS_PLAN_ID` as the fallback for `provenance.plan_id`.

Plus **one** retro-attest verb, because ~179 extant seats will never respawn and a spawn-only
field leaves a ~95%-empty column that reads *broken* rather than *unattested*:

```
pij attest <id> [--plan-id <id>] [--designation pm|coder|reviewer]
```

## Deliverables

1. `--plan-id <id>` on **`pij spawn`**.
2. `planId?: string` on `SessionDescriptor` (`core/types.ts`, near `currentTask` at :315).
   **Opaque identifier** — not a path, no path-shaped validation of its *shape*.
3. Env export in **both** builders — `HARNESS_PLAN_ID` **and** `PIJ_PLAN_ID`:
   - `core/spawn.ts:186` — pi path
   - `core/spawn.ts:457` — external-harness path (claude/copilot/codex)
   Miss one and it works for pi and silently not for the others, or the reverse.
4. `DESCRIPTOR_FIELD_OWNER.planId = "cli"` in `core/registry-write.ts`.
   **Do NOT add it to `APPEND_ONLY_FIELDS`** — append-only would freeze the first value and make
   `attest` impossible. Owner-wins is what makes correction work.
5. Projection into all three surfaces — **field read, no join, no per-row fan-out**, emitted
   **explicitly null** when unset:
   - `list --json` row projection — `core/cli.ts:~2072` (beside `currentTask`)
   - `node show` card — `core/cli.ts:~4094`
   - `tree` — `core/cli.ts:2125`
6. Validation: resolve `docs/plans/<id>` against the **spawning seat's cwd at spawn time**;
   **warn and proceed** when it does not resolve; **never hard-fail** — repos without the
   convention must still work.
   **Do NOT store the resolved-vs-warned outcome on the descriptor** (dove ruled against my
   proposal). Resolution is a pure function of `(planId, repo)`, recomputable at read time;
   stored, it goes stale in the worst direction — someone creates `docs/plans/<id>` an hour later
   and the seat reads `unresolved` forever, which a UI renders as permanently broken. Emit the
   warning in the **spawn receipt** (JSON *and* human line) — the record of the *act* — and let
   readers re-resolve the *state*. Spine answers "then", registry answers "now".
7. `pij attest <id> --plan-id <X>` — CLI-owned write, same ownership story, absent = unattested.

## What is explicitly OUT of scope

- **`--plan-id` on `dispatch`. Dropped entirely.** Dispatch targets an *existing* seat, so a
  `--plan-id` there is retro-attest in disguise and a third write path to reason about forever.
  **Two writers, both CLI: `spawn` creates, `attest` corrects.**
- **`planId` on the `Dispatch` record** (`platform/types.ts:167`). Its fields are delivery truth —
  `packetPath`, `packetSha256`, `from`, `to`, `deliveryState`, `ack`, `canary`. A plan id is not a
  fact about delivery.
- Note there is only **one** dispatch verb: `pij dispatch` parses at `core/cli.ts:899` and emits
  `verb: "dispatch-packet"`; the string at `cli.ts:2577` is that same verb's routing case, not a
  second verb. If you thought you saw two, you saw one.
- **Deriving `planId` from `Project.planPath`** (`platform/types.ts:43`). Different axes
  (project-level vs seat-now), different types (path vs opaque id). If both exist and disagree
  **that is not an error** and not a reconciliation — they answer different questions.
- **Ambient inheritance.** Never populate `planId` by reading an inherited `$HARNESS_PLAN_ID`
  from the spawner's own env. A value that is correct only when someone remembered to export a
  var is wrong *silently*. Explicit flag only.
- **`--designation`** ships with item 2, not now — Jordan owns sequencing. But build `attest` so
  adding it is a pure addition (one flag row, one field write), never a refactor. One verb, one
  ownership story, one place for the next attested field. If you find a reason the two must
  separate into different verbs, bring it to me — do not ship two.

## Verification gate — non-negotiable

Every guard must be **proven load-bearing by injecting the exact regression it claims to catch**.
Per guard: baseline green → inject → confirm **only** that guard fails → restore → re-verify
green. Report the injection and what failed under it in the commit message. **A guard whose
injection you did not run does not count as a guard.**

This is not ceremony. On the shipped `--badge` item, inlining the hoist back to a per-row spine
read left **all four correctness tests green** and failed only a call-count control.

Three controls are required here:

1. **The write-law control — write this one carefully, it is the whole reason this brief exists.**
   A test that sets `planId` and reads it back **passes whether or not the field is declared in
   `DESCRIPTOR_FIELD_OWNER`**, because first-write always lands (with no `latest` on disk the
   proposal stands). It proves nothing. The discriminating case is a **SECOND write, by a
   non-owner, over an existing value** — that is what silently drops today. Prove it: baseline
   green → **remove `planId` from the table** → confirm *only* that test fails → restore.
2. **A fan-out control** on each projection, so a future refactor deriving `planId` via a per-row
   join fails loudly instead of silently costing ~80s/refresh against chainglass's 8s UI loop.
3. **Both harness paths.** A test covering only pi does not cover this change.

Also assert **key presence**, not just value, on all three projections: a consumer must be able to
distinguish "this seat has no plan" from "this surface does not carry the field".

## Traps that have already cost this fleet time

- **`tsconfig` excludes `**/*.test.ts`** (task #12). A green typecheck says **nothing** about test
  files; `cli.test.ts` already carries 30 pre-existing errors. Check every test file you touch
  with a temporary tsconfig that includes it, explicitly.
- **5s subprocess budgets assume an unloaded machine** (D-035). A "flaky" failure under load is
  usually the budget, not your code — check that before chasing it.
- **A test failing on a fixture pid** — check whether that pid is alive on this host.
- **Never read `$?` through a pipe** — it reports the last command in the pipeline, not yours.

## Working rules

- **Commit to `s073/pij-first-class-ui` as you go.** Only push/merge affects merge order; do not
  let rounds of work sit uncommitted. Verify `git rev-parse --abbrev-ref HEAD` before every commit.
- **Never destroy uncommitted WIP** — back up before any reset or stash.
- **Forward-only. Never `git revert`** — remove with code.
- **Do not restart the daemon.** `spawn.ts` changes require one; it is dove's, from canonical main
  only. Tell me when you are ready and I sequence it.
- **Do not merge to main.** Dove's.
- Never touch `min-release-age=7` in `.npmrc`; never weaken `audit=true`; never add `--force` or
  `--ignore-scripts`; never commit credentials or proxy URLs.
- Never `tmux send-keys` into a pane a human is using. Jordan is in this repo personally.
- Questions go to whoever owns the answer — ask me directly, do not proxy through dove.

## Definition of done

Baseline green; all three controls injection-proven; both harness paths covered; all three
projections carrying the key; validation warns (never fails) on an unresolvable id and the warning
appears in the spawn receipt; `pij attest --plan-id` corrects an existing seat; and `list --json`
measured at fleet scale showing **no** regression from its ~0.43–0.54s baseline.

**Merged is ADOPTED, not VERIFIED.** The end-to-end proof — a live spawn stamping both env vars in
the child and landing `planId` on the descriptor, on **both** paths — happens only after dove's
restart from canonical main. Everything that fooled this fleet today was green at exactly the
merge stage. **Do not report "shipped" off a merge.**
