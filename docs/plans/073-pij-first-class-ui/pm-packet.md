# PM packet — pij first-class support for the chainglass observatory

**To**: pij-exclusive-whitefish (PM) · **From**: pij-reasonable-dove (pij o-prime)
**Consumer**: pij-cheap-cheetah (PM, chainglass) — a NAMED consumer, not a hypothetical.
**Jordan is working this personally.** Sequencing is his; the rulings below are mine and settled.

## Why this exists

chainglass's fleet page shipped 2026-07-26 and reads the pij CLI on an **8s loop**. Every gap
here is a visible hole in a live UI in Jordan's browser. The binding constraint on every item:

> **A per-row fan-out is fatal.** 179 seats × `pij node show` ≈ **80s** per refresh.
> Judge every ask by *does this cost a field read or a join*, and measure before you assume.

Their brief: `/Users/jordanknight/substrate/chainglass/scratch/pij-firstclass-packets/dove-enhancement-brief.md`
Their answers: `.../cheetah-answers-to-dove.md`
My replies (rulings, with file:line evidence): `/private/tmp/claude-501/-Users-jordanknight-pi-hacking-pij/12b8e242-0200-4cae-8b53-3e67ebe54dc7/scratchpad/dove-reply-to-cheetah.md` and `.../dove-ruling-designation.md`

## Already shipped by me — do NOT rebuild, DO copy the pattern

| item | commit | measured |
|---|---|---|
| `currentTask` + `currentAssignment` in `list --json` | `24edcba` | 0.43s = baseline |
| opt-in `list --badge` (hoisted AC-05) | `afdb839` | 0.61–0.66s |
| `list --archived` reachable (was E-ARG since plan 071) | `afdb839` | tier was dead |

All pushed. `main` = `afdb839`, in sync with origin.

**The pattern I want continued**, because both defects it catches are invisible to ordinary tests:
every guard was verified load-bearing by *injecting the exact regression it claims to catch*.
For `--badge`, inlining the hoist back to a per-row spine read left **all four correctness tests
green** and failed only a call-count control. Baseline-green first, then inject, then restore.

## Work — in Jordan's order

### 1. Plan linkage (`--plan-id`) — NEXT

`HARNESS_PLAN_ID` is **not pij's** — verified zero hits repo-wide. It belongs to the
harness/the-flow CLI. The seat→flow join was designed two-sided and **only the harness half
landed**: `~/substrate/harness-engineering` commit **`2253f8c7`** (PR #81, on `main`), which
honours `$HARNESS_PLAN_ID` as the fallback for `provenance.plan_id`. I verified it myself.
**pij's half was never built. That is this item.**

- `pij spawn --plan-id <id>` (and `dispatch`), stamped on the descriptor as `planId`.
- At spawn, export the same value as **`HARNESS_PLAN_ID`** into the child env (plus `PIJ_PLAN_ID`
  for pij's own record). One operator act closes the join from both sides.
- Project `planId` in `list --json`, `tree`, `node show`. Field read — **no join**.
- **Validation (Jordan ruled)**: validate when `docs/plans/<id>…` resolves; **warn and proceed**
  when it does not. Never hard-fail — repos without the convention must still work.
- **Explicit flag, NOT ambient inheritance.** A value that is correct only when someone
  remembered to export a var is wrong *silently*. cheetah's half of the contract is automating
  the flag into the pair/prime dispatch rituals, which already hold the plan path.

Two env builders in `core/spawn.ts` need it — the pi path (~line 186) **and** the external-harness
path (~line 457). Miss one and it works for pi and silently not for claude/copilot/codex.

### 2. Designation (item 4)

**RULED: a separate axis. `role` is NOT widened.** `Role` stays `parent | worker`.

`role` is load-bearing in the boot path — spawn (`spawn.ts:132,194`), revive (`revive.ts:487`),
session-join (`session-join.ts:79`), boot identity (`index.ts:282`). A reviewer is structurally a
`worker` AND functionally a `reviewer`; one enum cannot hold both, and UI vocabulary must never
sit inside rehydration. Precedent: `2253f8c7` itself refused the `$HARNESS_AGENT` fallback
because that var carries the model name — same refusal to let a field mean two things.

- `designation?: "pm" | "coder" | "reviewer"` — closed set; **absent = unattested, never inferred**.
- Three values, including `pm`: cheetah's argument, accepted — a PM that has not yet dispatched
  derives as Worker under pure structure, which is a real state they hit this week.
- Needs **BOTH** a spawn flag **and** a post-hoc `pij designate <id> <value>` verb. Most of the
  179 seats predate the field and will never respawn; spawn-only leaves the column ~95% empty and
  it reads as *broken* rather than *unattested*. **This generalises: every new seat field needs a
  retro-attest verb.**

### 3. needs-human (their item 5)

Contract already accepted; build to it as written in their brief. Seat-level
`paneObservation {state, at, reason?}`, episode `since` + `observationGaps[]` **never smoothed**,
cleared-cause vocab with cannot-confirm-dead as a fourth outcome, `answered` only via an
attributable channel. Entangled with the modal-wedge defect (task #26) — coordinate with me.

### 4. `ask`/`answer`/`questions`/`status` (their items 6–9)

Threads not records; `ask` auto-declares `question` state; clarification is an in-thread
transition; terminal causes `answered·dismissed·expired·seat-died-holding-it`. **`pij answer` is
the ONLY marker of `answered` and the only write path — never keystrokes into a pane.**

## DEFINITION OF DONE: a verb without its route is NOT done

Jordan's ruling, and mine: **the UI renders only what records attest, so every item here is only
as good as the automation that makes agents WRITE it.** A field whose correctness depends on an
unautomated act will be wrong silently — that is the house law, and it is the reason `--plan-id`
is an explicit flag rather than ambient inheritance.

**The routes are in this repo.** `skills/pij` is the source of truth and both deployed paths are
symlinks to it:

    ~/.claude/skills/pij → ~/.agents/skills/pij → ~/pi-hacking/pij/skills/pij

So route text rides the SAME commit as the verb. There is no deploy step, no sync, and no way for
the two to drift. **Ship them together or the item is not done.** Per item:

- `--plan-id` → `references/routes/pair.md`, `delegate.md`, `prime.md`: dispatch passes it
  mechanically when dispatching against a plan (the orchestrator already holds the plan path;
  zero human memory involved).
- `designation` → the spawn/fleet-standing ritual attests `coder`/`reviewer`/`pm`; `pij designate`
  folds into `adopt`/`ready` for pre-existing seats.
- `ask`/`answer` → becomes THE question path in the routes, replacing ad-hoc `pij send` for
  questions, so threads and the `question` state exist for the UI to render at all.
- `--badge` → documented in `ops.md`/`node.md` as the fleet-consumer read path.

**⚠ A route edit in canonical is LIVE IMMEDIATELY, machine-wide.** The symlink targets the
canonical *working tree*, not a merged artifact — so the instant canonical `main` carries a route
change, every agent on this box reads it, before any push. Treat route text with the same care as
a daemon change: never leave a half-written route sitting in canonical. Coders edit routes in
their stream worktree (not live); it goes live when I merge.

## Standing constraints — non-negotiable

1. **Forward-only on `main`. Never `git revert`.** Remove with code.
2. **The canonical checkout `~/pi-hacking/pij` is SHARED** with other fleets. Verify
   `git rev-parse --abbrev-ref HEAD` before every commit/merge. Coders work in stream worktrees.
3. **Never destroy uncommitted WIP.** Back up before any reset/stash.
4. **Never touch `min-release-age=7` in `.npmrc`** — deliberate supply-chain policy (#22). Do not
   weaken `audit=true`, add `--force`/`--ignore-scripts`, or commit credentials/proxy URLs.
5. **Daemon restarts are MINE**, from canonical main only — never from a worktree. `spawn.ts`
   changes need one. Tell me; do not restart it yourself.
6. **Never `tmux send-keys` into a pane a human is using.**
7. Provider-qualify copilot models for pi (`github-copilot/gpt-5.6-terra`).
8. Every spawned coder/reviewer **must load BOTH the `pij` skill AND the `builder` skill**, and
   act from contracts rather than improvising from CLI `--help`.
9. Commit to the stream branch as you go — only push/merge affects merge order. Do not let rounds
   of work sit uncommitted.

## Known traps that have already cost this fleet time

- **`tsconfig` excludes `**/*.test.ts`** (task #12). A green typecheck says NOTHING about test
  files; `cli.test.ts` carries 30 pre-existing errors. Check yours explicitly with a temporary
  tsconfig that includes the file.
- **Test suite 5s subprocess budgets assume an unloaded machine** (D-035). A "flaky" failure under
  load is usually the budget, not the code.
- **A `pij` test failing on a fixture pid** — check whether that pid is alive on the host.
- **Never read `$?` through a pipe**; it reports the last command in the pipeline, not yours.

Report to me. Questions go to whoever needs the answer — do not proxy them through me to Jordan.

— dove
