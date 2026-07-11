# Ship checkpoint — s039 dependency chores audit

## claim

Plan 039 is locally ship-ready. Two scope-clean dependency commits reduce root npm audit from 34 findings / 1 critical to 26 findings / 0 critical, with every residual rooted in pinned minih 0.2.4. Cross-model review approved, the orchestrator accepted the verdict, and the quiescent full harness gate passed.

## artifacts[]

- `docs/plans/039-dependency-chores-audit/reports/phase-1-checkpoint.md`
- `docs/plans/039-dependency-chores-audit/reviews/review.phase-1.md`
- `docs/plans/039-dependency-chores-audit/tasks/phase-1-dependency-audit/execution.log.md`
- `.harness/records/retro/2026-07-11/006-039-dependency-chores-audit.md`
- `docs/plans/039-dependency-chores-audit/the-flow.json`
- `docs/plans/039-dependency-chores-audit/the-flow.md`

## shas[]

- Commit `6cd65060ded75704307da1d0525554de0bb52f9e` — Vitest/tsx plus granted live-test reorder.
- Commit `16a57e1b7ebb77b7101b65ec1403f40fee3a29c4` — Pi/ws plus Node 22/24 CI.
- `phase-1-checkpoint.md` — `b9d8f2504202149695461d1c3a9d8602b2e67a662d985137214614411d2428e5`
- `review.phase-1.md` — `4ad6ae449bb0471d44db23c3c326f7cdf241d140c6d263d43f5b2981565781bf`
- `006-039-dependency-chores-audit.md` — `8687fa53b51e9e6171076b8af88bba7b09b4630ea9aed753dd7402dc5022dac5`
- `the-flow.json` — `c4debe79ae19f5d86a65f502e2efc4d944f30da62471d012c1ffc0f7536a78c1`
- `the-flow.md` — `1cb06b9933c4c8db36ae1ced7122528efb7217cbb560261856351ad787003806`

## gates[]

- Final `npm audit --json` — 26 total, 0 critical; minih is the only direct vulnerable package and all vulnerable node paths are in its lock closure.
- Fresh `npm ci` — passed.
- Cross-model review — **APPROVE** with independent RED→GREEN, three committed-state audits, lock closure analysis, clean install, and full gate.
- Orchestrator sanity pass — accepted; manifest/lock/CI contract and reorder-only diff rechecked.
- Quiescent `harness checks` — all six sensors passed, none skipped.
- Git-index return — verified by o-prime; index empty.

## observations[]

- The per-bump expected-red discriminator correctly stopped a real Vitest 4 compatibility failure before scope expansion.
- Two transient npm brownouts interrupted pij/minih or subprocess output while `node_modules` repopulated; both recovered at quiescence.
- `flow-pair observe` cannot capture one delegation cleanly in a shared dirty worktree because unrelated forbidden paths poison its whole-worktree diff.
- Future baton returns should pass commit SHAs with `--evidence`.
- Highest-leverage harness improvement: concurrent-stream expected-red declarations plus baseline-SHA/allowed-path delegation diff capture.

## open[]

- Node 22/24 GitHub Actions remains the remote ship proof.
- The 26 minih-root findings remain monitor-only pending a green released upstream fix and new ruling.
- Plan 039 evidence artifacts and its retro are untracked and need the governed metadata commit before push.
- Push-main remains double-gated by the o-prime and Jordan.
