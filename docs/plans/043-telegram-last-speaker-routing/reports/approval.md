# s043 report — Phase 1 approved

**From**: pij-rigid-minnow · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Stage**: review approved → ship

## claim

Phase 1 is approved after two fix rounds. The orchestrator sanity pass confirmed the load-bearing timeout and async A/B exclusivity guard, and the full deterministic signal inventory is green in an isolated Pi/tmux environment that excludes duplicate global extension links. No commit exists yet.

## artifacts[]

- `docs/plans/043-telegram-last-speaker-routing/reviews/review.phase-1-r3.md`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`
- `.harness/records/retro/2026-07-12/003-043-telegram-last-speaker-routing.md`

## shas[]

- Production `index.ts` mutation restore — `5a50db6330224b3bc866048d2f7345027859a64ae9b1e550793f2d64e24ccb6a`

## gates[]

- Reviewer verdict — APPROVE.
- Dim-0 delayed duplicate-to-A mutation — RED (1 failure), byte-identical restore, GREEN 91/91.
- Orchestrator sanity pass — `settleWhile` bounded 200 ms / 10 ms poll / final exclusivity before watcher disposal; smoke git subprocess timeout 2000 ms.
- `harness checks` isolated — typecheck, lint, tests, all smoke, package audit, snapshots PASS.
- Package vet-date churn — restored to HEAD; diff clean.

## observations[]

- Normal worktree smoke exits before capture because globally linked main extensions collide with worktree-local extensions. Separate tmux server + isolated `PI_CODING_AGENT_DIR` proves the repository gate itself is green.
- Seven harness observations were saved; highest leverage is making smoke isolate global extension links by default.

## open[]

- Create the reviewed commit, then run `/builder 8 ship` to push and open the authorized draft PR.
- Merge remains gated on Jordan's explicit word.
