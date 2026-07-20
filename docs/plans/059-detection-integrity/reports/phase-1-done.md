# Phase 1 done — mechanical modal-tool guard

- **Claim**: DONE within grant 001; restart-free; no watchdog/daemon/death path changed.
- **Candidate hash**: `69c0da479a93dddd88087e766e2abe7cec7cc698a2fed6af0a682c08cac4c172` (tracked diff plus new guard file hashes).
- **Review**: independent review unavailable after declared attempts; no APPROVE claimed. Accepted degrade-and-declare per Dove. See `docs/plans/060-state-model-v2/reviews/review.combined-001.md`.

## Artifacts

- `.pi/extensions/pij/core/invariant-guard.ts`
- `.pi/extensions/pij/core/invariant-guard.test.ts`
- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/index.test.ts`
- `tasks/phase-1-modal-guard/execution.log.md`
- `reports/phase-grant-001.md`

## Outcome

Exact `ask_user_question` is blocked before execution only when the live descriptor proves a managed Pi peer (`harness:pi` plus explicit parent/spawner/prime-history evidence). Generic auto-loaded Pi and non-Pi sessions pass through. The attempted call remains captured; the reason directs inline `pij_send`, durable pending-decision capture, and dependent-only blocking.

## Gates

- Focused modal tests: 2 files / 10 tests PASS.
- Independent mutation: managed-Pi predicate inversion RED; restore GREEN.
- Final solution suite: 168 files / 3,046 tests PASS; 4 files / 11 tests skipped.
- `harness checks --quick`: all 7 runnable sensors PASS; smoke intentionally skipped.
- Full worker `harness checks`: nonzero on environmental timeout/smoke behavior; no owned failure. Clean-base timeout classification: `docs/plans/060-state-model-v2/reports/clean-base-timeout-proof.log` = 85/85 GREEN.
- `just typecheck`, `just lint`, `git diff --check`: PASS.

## Observations

- Cross-provider reviewer spawn vanished before descriptor creation: `reports/reviewer-canary-no-show-001.md`.
- Twin descriptor on pid 49627 emitted a false stall while this seat was responsive: `reports/twin-watchdog-false-stall-2026-07-20.md`.
- Reviewer reliability/resource evidence is preserved in the combined review record.

## Open

Phase 2 watchdog exemption re-arm and Phase 3 death observability remain **HELD** pending a new explicit grant; no daemon restart occurred.
