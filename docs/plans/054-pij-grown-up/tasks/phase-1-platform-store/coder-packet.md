# Phase 1 coder packet — pij-dizzy-angelfish
**From**: pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-16 · **Immutable once dispatched**

## Who you are (control-plane facts — you are pij-blind at boot)
- Your pij id: `pij-dizzy-angelfish`. Your orchestrator (me): `pij-civilian-takin`.
- Report/reply ONLY via: `pij send pij-civilian-takin "<message>"` — never assume I see your terminal.
- You are in **ultracode mode**: use multi-agent workflow orchestration for substantive work — **hard cap 5 agents per workflow** (human ruling R5). Verify adversarially; token cost is not a constraint; correctness is.

## The job
Implement **exactly Phase 1** ("Platform store") of plan 054 — nothing more. TDD, task by task, in dossier order.

- **Worktree (work HERE)**: `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up`
- ⚠️ **Your cwd is the CANONICAL repo (`/Users/jordanknight/pi-hacking/pij`, branch main) — NEVER edit, run tests, or git-commit there.** Use absolute worktree paths for every file op; prefix every git command with `git -C /Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up`; run just/vitest from the worktree (`cd` in the same shell line). One canonical write = STOP and report.
- **Branch**: `s054/pij-grown-up` · **Parent SHA**: `8d89497` (verify with `git -C <worktree> log --oneline -1` before starting; STOP if different)
- **Task dossier (the authority)**: `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/tasks.md` — T001–T011, execute in order, TDD (red test task before its impl task, always)
- **Design authority**: `docs/plans/054-pij-grown-up/pij-grown-up-plan.md` §Phase 1 (incl. the Assignment binding spec) + `workshops/001-data-model.md` (WS-1..6 are human-ruled — NEVER contradict)
- **Execution log**: append to `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/execution.log.md` as you go (task, what changed, proof output, discoveries); tick the dossier's Status column per task.

## Fence
- **Allowed paths**: `.pi/extensions/pij/core/platform/**` (new) · `.pi/extensions/pij/adapters/project-store.ts|assignment-store.ts|spine-store.ts` (+ their `.test.ts`) · `.pi/extensions/pij/adapters/fakes.ts` (append-only additions) · `.pi/extensions/pij/core/cli.ts` (additive verb entries) · `.pi/extensions/pij/cli.ts` (USAGE + `deps()` wiring only) · `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/**`
- **Forbidden**: everything else. Explicitly: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `government/**`, `skills/**`, `package.json`, `package-lock.json`, `harness/**`, `docs/how/**`, any other stream's worktree, the pij daemon, git push, PR.
- **Tests never touch the real `~/.pij`** — temp `PIJ_HOME` via `mkdtempSync` only (pattern: `adapters/fs-registry.test.ts:114`).
- A newly needed path inside the worktree = tell me (`pij send pij-civilian-takin`) and continue; a path outside the fence = STOP and ask.
- Commits: allowed on this branch, pathspec-mandatory (`git commit -- <paths>`), conventional message + `Co-Authored-By` trailer for your harness. NO push.

## Proof commands (green = done)
- Per task: targeted `npx vitest run <test-file>`
- Phase gate (T011): `just typecheck` && `just test` both exit 0 from the worktree root.

## Done schema (send as your completion report)
`pij send pij-civilian-takin "P1 COMPLETE|CONTINUING|BLOCKED · claim: <one line> · artifacts: <paths> · shas: <commit(s)> · gates: <typecheck/test outputs summarized> · observations: <frictions> · open: <questions>"`
- Report BLOCKED immediately when stuck ≥2 attempts on one task — never grind silently.
- Questions that need Jordan go through me (persist your question in the execution log, send me the pointer).
