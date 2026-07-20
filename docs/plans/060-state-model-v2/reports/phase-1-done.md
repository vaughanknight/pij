# Stream 2 done — State-Model v2 clear verb

- **Claim**: DONE within the granted Simple phase; restart-free.
- **Tracked diff hash**: `13910567f4e1d362fe69929a218e059e14ddf5fa4500fc780bb949f6916b0063`.
- **Review**: independent review unavailable after declared attempts; no APPROVE claimed. Accepted degrade-and-declare per Dove. See `../reviews/review.combined-001.md`.

## Artifacts

- `state-model-v2-plan.md`
- `tasks/phase-1-state-clear/execution.log.md`
- Core/parser/state-chain/journal/renderer source and tests named in the plan Domain Manifest.
- `docs/how/pij.md`; `docs/domains/pij-{messaging,control-plane}/domain.md`.

## Outcome

`pij state clear <node> [--assignment <id>] [--actor <label>] [--json]` now:

- refuses missing assignments (`E-NOREG`) and already-undeclared assignments (`E-ARG`) without a clear event;
- appends one journal-first, assignment-coupled `state-cleared` event under the existing write lock;
- reconciles the stamped seq exactly once through the shared journal resolver;
- uses `chainStateOf` as the single latest-declaration answer for clear and verify;
- returns the assignment to undeclared while preserving task/history/mechanical/identity fields and removing only descriptor `semanticState`;
- treats a foreign clear after `hold` as foreign-hold-clear evidence;
- leaves `SEMANTIC_STATES` byte-identical—clear is a verb/event, never `working` or another state.

## Gates

- RED-first parser/reducer/dispatch/recovery/CLI tests recorded.
- Clear-specific cut points cover journal record, assignment write, append/replay, journal clear, and denorm failure.
- Final solution suite: 168 files / 3,046 tests PASS; 4 files / 11 tests skipped.
- `harness checks --quick`: local paths, typecheck, lint, tests, Windows compatibility, package audit, snapshots all PASS; smoke skipped.
- Full worker `harness checks`: nonzero only on environmental timeout/smoke behavior; clean-base channel+Telegram proof `reports/clean-base-timeout-proof.log` is 85/85 GREEN.
- Mutations: remove clear from shared chain reducer → RED; remove clear from journal recovery kinds → RED; restore combined suite GREEN.
- `just typecheck`, `just lint`, `git diff --check`: PASS.

## Open

No Stream 2 product work remains. No commit, push, PR, merge, or daemon restart was performed.
