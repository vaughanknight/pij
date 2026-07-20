# Phase 2 done — watchdog exemption expiry/re-arm

- **Status**: ACCEPTED by `pij-reasonable-dove` compensating review, 2026-07-20.
- **Review grade**: compensating approve with acknowledged orchestrator accept-bias; not independent.
- **Candidate content hash**: `b5cec72c7988d28c8adcd91025db7da25cbebffbc6f70b6e81de91dbe7b3e21a`.
- **Runtime**: no daemon restart or live runtime mutation.

## Outcome

- Additive durable `exemptUntilMs` deadline with a 1h default and custom CLI duration.
- Exact contract: exempt only while `now < deadline`; re-armed at and after deadline.
- Legacy `pausedAtMs` derives one bounded deadline; missing/invalid/overflow time fails closed to safety ON.
- Watchdog manager persists cleared/normalized expiry before capture, delivery, or fire.
- Shared helper governs CLI, standalone spawn, and Pi boot exemption creation.
- Human/JSON status exposes effective pause, deadline, and remaining milliseconds.
- Self, compact, reset/resume, relay, and global-switch semantics remain distinct.

## Proof

- RED-first execution: `tasks/phase-2-watchdog-rearm/execution.log.md`.
- Focused source/manager/real CLI: 129/129.
- Full suite: 168 files / 3,051 passed; 4 files / 11 tests skipped.
- `harness checks --quick`: all seven runnable sensors PASS; smoke skipped.
- Mutations RED→restore GREEN: exclusive deadline; persist-before-capture; self/compact tier separation.
- Intermediate unchanged daemon-push timeout passed immediately on candidate and clean base (`reports/daemon-push-flake-{candidate,clean-base}.log`).
- Dove source review independently re-ran core suites 80/80 and verified fail-closed behavior, boundary, ordering, legacy migration, and tier separation.

## Standing gate

Before combined P2+P3 daemon-facing delta lands on main, attempt one genuine cross-provider independent review if fd headroom and Sakana quota recover. Unavailability must be declared. No commit/merge/restart occurred in this phase.
