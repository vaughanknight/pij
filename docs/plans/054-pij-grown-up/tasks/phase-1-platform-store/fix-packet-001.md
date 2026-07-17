# P1 fix packet 001 — resolve review findings (cycle 1)
**From**: pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-dizzy-angelfish (you were compacted after P1 completion — re-ground from this packet, not memory)

## Who you are
- s054 P1 coder. Worktree (all work here, never the canonical repo): `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up`, branch `s054/pij-grown-up`.
- Report ONLY via `pij send pij-civilian-takin "<message>"` — checkpoint on completion, or BLOCKED with the smallest unblocking question.

## Mission
Cold cross-model review returned **FINDINGS (7)**: `docs/plans/054-pij-grown-up/reviews/p1-review-001.md` — read it in full; it carries evidence (`file:line`), failure scenarios, and suggested smallest fixes. Resolve ALL seven, severity order (3 HIGH first, then 4 MED). TDD discipline as in P1: failing test proving the defect first, then the fix, per finding.

## Authorities (precedence)
1. `docs/plans/054-pij-grown-up/pij-grown-up-plan.md` §Phase 1 (incl. AC-03 coupling law)
2. `docs/plans/054-pij-grown-up/workshops/001-data-model.md` (WS-1..6, human-ruled)
3. `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/tasks.md`
4. The review file — findings are ratified hypotheses: verify each against code before fixing; if you can genuinely disprove one, don't paper over it — log the disproof with evidence in the execution log and report it in your checkpoint.

## Per-finding routing (scope guardrails)
- **HIGH-1 (seq race)**: make allocation atomic *inside* the `SpineLogPort` append operation (callers stop stamping from `lastSeq()+1`). Do NOT build Phase-2 daemon/writer machinery — smallest cross-process-safe port-level fix. Contract test: two writers, second same-seq append after a consumer advanced its cursor, no event lost.
- **HIGH-2 (unaudited mutation)**: hard requirements — (a) no committed project state without its spine event surviving any single append failure, (b) no exception escaping `dispatch`; every failure is a `CliResult`. The reviewer suggests event-first + journal/replay; choose the SMALLEST mechanism meeting (a)+(b) and record the design decision + rationale in the execution log. Spine-failure injection tests required.
- **HIGH-3 (prev/next)**: populate `prev`/`next` on both project events (incl. `next` on create) with canonical before/after values; pin in pure + CLI coupling tests.
- **MED-4..7**: apply the reviewer's smallest fixes (purity sensor: production-scope fs/process rejection; fake↔fs parity on non-finite state incl. shared contract case; own-property guard checks with `Object.create` cases; checked ISO timestamp returning `E-ARG` through every fallible constructor).

## Gates (all must pass before your checkpoint)
`just typecheck` · `npx vitest run .pi/extensions/pij/core/platform .pi/extensions/pij/adapters` · full `npx vitest run` (known baseline flake OUTSIDE scope: `harness/scripts/release-age-policy.test.ts` may time out under load — verify isolated pass if hit, do not fix it).

## Fence (unchanged from coder-packet.md)
Same P1 fence: `.pi/extensions/pij/core/platform/**`, `.pi/extensions/pij/adapters/**`, `.pi/extensions/pij/core/cli.ts`, their tests, and `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/**` (execution log + dossier). NEW paths need a checkpoint notification (NEW PATH: <path> — why).

## Logging + commits
- Append per-finding progress to `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/execution.log.md` (F1..F7 ids mapping to the review's finding order).
- Commit in your worktree per logical fix (or small coherent groups). NO push, NO PR — orchestrator owns both.

## Forbidden
`.the-flow-state.json` / `the-flow.json` / `the-flow.md` · `government/**` · canonical repo writes · push/PR · daemon/tmux mutation · edits outside the fence.

## Checkpoint (on completion)
`pij send pij-civilian-takin "P1 FIX CYCLE 1 COMPLETE · <n> commits <shas> · F1..F7 status · gates: tsc <r>, vitest <r> · <disproofs/deviations if any>"`
