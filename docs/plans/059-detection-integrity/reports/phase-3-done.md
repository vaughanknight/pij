# Phase 3 done — requested-vs-unrequested death observability

- **Status**: ACCEPTED by `pij-reasonable-dove` compensating keystone review, 2026-07-20.
- **Review grade**: compensating approve with acknowledged orchestrator accept-bias; not independent.
- **Candidate content hash**: `6cc07dcfc3546182afd3d1e52bf19c04b248775f550344446c41a6955533a560`.
- **Runtime**: no daemon restart, live destructive canary, commit, or merge.

## Accepted outcome

- Every peer launch family persists a bounded, spawn-id-keyed expectation before launch; no descriptor is required for no-show evidence.
- Owned closes persist intent before teardown and requested terminal truth after successful/idempotent absence observation, before dissolve.
- Cross-harness reducer distinguishes registered PID absence, missing recorded pane, expectation expiry, and unavailable probes without inferring cause.
- `unrequested-by-pij` means only absence of persisted pij close intent.
- Historical boot reconciliation and live observations carry `observedAt`, optional `lastSeenAt`, disposition, and source-specific evidence.
- Spawn-id correlation and durable latches suppress descriptor/expectation and restart duplicates.
- Pi replacement reasons remain non-terminal; quit stays observable.
- State/list human and JSON surfaces expose durable terminal evidence.

## Proof

- Final hardening RED: 7 failed / 388 passed; GREEN: 395/395.
- Landed detector regressions: 61/61.
- Lead source mutations RED→restore GREEN: evidence relabel, spawn correlation removal, historical flag inversion, requested-terminal removal.
- Lead full suite: 3,078 passed / 1 unchanged channel cleanup-hook timeout / 11 skipped. Exact candidate and clean-base cases passed.
- Final `harness checks --quick`: all seven runnable sensors PASS; smoke held.
- Typecheck, lint, diff-check: PASS.
- Dove deep pass re-ran 127 focused tests and verified unrequested semantics, two-latch separation, timestamped history, and malformed-time degrade-and-declare.

## Adjudication

Latch-before-delivery / at-most-once proactive death notices are accepted. A missed push is recoverable from durable terminal history; a duplicate stale notice is actively misleading. Exactly-once is not claimed.

## Held convergence gates

- one genuine cross-provider independent review of combined P2+P3 if fd/quota recover;
- Stream 3 deconfliction;
- o-prime-owned batched merge;
- C6 daemon restart window and live canaries.

No worktree convergence action was taken.
