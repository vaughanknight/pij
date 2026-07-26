# Coder brief — item 1: plan linkage (`--plan-id`)

**Plan**: 073 pij first-class UI · **PM**: pij-exclusive-whitefish · **o-prime**: pij-reasonable-dove
**Status**: DRAFT — slots marked `[RULING]` are awaiting dove. Do not start until this line says READY.

## Load first, before touching anything

Both skills, in this order: the **`pij`** skill and the **`builder`** skill. Work from their
contracts. Do **not** improvise the CLI surface from `pij --help`.

## The job in one sentence

`pij spawn --plan-id <id>` stamps `planId` on the seat descriptor and exports it to the child as
**`HARNESS_PLAN_ID`** (plus `PIJ_PLAN_ID`), so one operator act closes the seat→flow join from
both sides — the harness half is already deployed and verified
(`~/substrate/harness-engineering` `2253f8c7`, PR #81, on `main`, honours `$HARNESS_PLAN_ID` as
the fallback for `provenance.plan_id`).

## Why this is not a one-line change — read this part twice

The two spawn paths write the descriptor by **different mechanisms**, not just different env:

- **External-harness path** (`core/spawn.ts:457`) — the *spawner* writes a `pending` descriptor
  (see the comment at `core/spawn.ts:296`). `planId` can be stamped directly by the spawner.
- **Pi path** (`core/spawn.ts:186`) — the *child self-registers* at boot from `PIJ_*` env
  (`index.ts:282`). `planId` reaches the descriptor as a **seat** write.

Miss one builder and it works for pi and silently not for claude/copilot/codex, or the reverse.

Because a retro-attest verb adds a third writer, **`planId` is a contested field** and must be
declared in `DESCRIPTOR_FIELD_OWNER` (`core/registry-write.ts`). That table's own comment is
explicit: a contested field you carry but do not own is discarded whenever disk already holds a
value — **no error, no log line**. Undeclared, this ships a stamp that intermittently vanishes.

- Owner: `[RULING 1 — proposed: "cli", pi-path boot fills only where absent, following the
  `windowId` precedent already in that table]`

## Deliverables

1. `--plan-id <id>` on `pij spawn`, and on `[RULING 4 — which dispatch: platform verb
   `core/cli.ts:899` vs `dispatch-packet` `cli.ts:2577`/`3018`; and whether the dispatch RECORD
   carries it or only the seats]`.
2. `planId?: string` on `SessionDescriptor` (`core/types.ts`, alongside `currentTask` at :315).
3. Env export in **both** builders: `HARNESS_PLAN_ID` **and** `PIJ_PLAN_ID`.
4. Declaration in `DESCRIPTOR_FIELD_OWNER` per ruling 1.
5. Projection into all three surfaces — **field read, no join, no per-row fan-out**:
   - `list --json` row projection — `core/cli.ts:~2072` (next to `currentTask`)
   - `node show` card — `core/cli.ts:~4094`
   - `tree` — `core/cli.ts:2125`
   Emit **explicitly null** when unset. The consumer must be able to distinguish "this seat has
   no plan" from "this surface does not carry the field", so tests assert key **presence**.
6. Validation: resolve `docs/plans/<id>`; **warn and proceed** when it does not resolve; **never
   hard-fail** — repos without the convention must still work. Resolution root:
   `[RULING 3 — proposed: spawning seat's cwd at spawn time, with resolved-vs-warned recorded so
   the warning is auditable rather than a lost stderr line]`.
7. Retro-attest verb: `[RULING 5 — proposed in scope]`. ~179 extant seats will never respawn;
   spawn-only leaves the column ~95% empty and it reads as *broken* rather than *unattested*.

**Explicit flag, NOT ambient inheritance.** Do not read an inherited `$HARNESS_PLAN_ID` from the
spawner's own env to populate this. A value that is correct only when someone remembered to
export a var is wrong *silently*. `planId` is also **not derived** from `Project.planPath`
(`core/platform/types.ts:43`) — `[RULING 2 — proposed: independent axis, never inferred]`.

## Verification gate — non-negotiable, this is how the last two items shipped

Every guard you write must be **proven load-bearing by injecting the exact regression it claims
to catch**. Sequence, per guard: baseline green → inject the regression → confirm **only** that
guard fails → restore → re-verify green. Report the injection and what failed under it in the
commit message; a guard whose injection you did not run does not count as a guard.

This is not ceremony. On the shipped `--badge` item, inlining the hoist back to a per-row spine
read left **all four correctness tests green** and failed only a call-count control.

Required specifically here:
- A **fan-out control** on each projection, so a future refactor that derives `planId` via a
  per-row join fails loudly rather than silently costing 80s/refresh against an 8s UI loop.
- A control that proves the field survives the write law — i.e. that a non-owner write does not
  clobber or drop it. This is the defect class most likely to reach production invisibly.
- Both harness paths exercised. A test that only covers pi does not cover this change.

## Traps that have already cost this fleet time

- **`tsconfig` excludes `**/*.test.ts`** (task #12). A green typecheck says **nothing** about
  test files; `cli.test.ts` already carries 30 pre-existing errors. Check your touched test file
  explicitly with a temporary tsconfig that includes it.
- **5s subprocess budgets assume an unloaded machine** (D-035). A "flaky" failure under load is
  usually the budget, not your code — check before you chase it.
- **A test failing on a fixture pid** — check whether that pid is alive on this host.
- **Never read `$?` through a pipe.** It reports the last command in the pipeline, not yours.

## Working rules

- Work in your **stream worktree**. The canonical checkout `~/pi-hacking/pij` is **shared with
  other fleets** — verify `git rev-parse --abbrev-ref HEAD` before every commit.
- **Commit to your branch as you go.** Only push/merge affects merge order; do not let rounds of
  work sit uncommitted. Never destroy uncommitted WIP — back up before any reset or stash.
- **Forward-only. Never `git revert`** — remove with code.
- Do **not** restart the daemon. `spawn.ts` changes require one and it is dove's, from canonical
  main only. Tell me when you are ready and I will sequence it.
- Do **not** merge to main. That is dove's.
- Never touch `min-release-age=7` in `.npmrc`, never weaken `audit=true`, never add `--force` or
  `--ignore-scripts`, never commit credentials or proxy URLs.
- Never `tmux send-keys` into a pane a human is using. Jordan is working this repo personally.
- Questions go to whoever owns the answer — ask me directly, do not proxy through dove.

## Definition of done

Green baseline, every guard injection-proven, both harness paths covered, all three projections
carrying the key, validation warning (never failing) on an unresolvable id, and a measured
confirmation that `list --json` at fleet scale has **not** regressed from its ~0.43–0.54s
baseline. The end-to-end proof that a live spawn stamps `HARNESS_PLAN_ID` in the child lands
**after** dove's daemon restart — the item stays open until it does.
