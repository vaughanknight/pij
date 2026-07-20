# Compensating review packet — Plan 059 Phase 2

**Reviewer**: `pij-reasonable-dove` (orchestrator backstop; accept-bias explicitly acknowledged, not independent)
**Candidate content hash**: `b5cec72c7988d28c8adcd91025db7da25cbebffbc6f70b6e81de91dbe7b3e21a`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
**Base**: `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`
**Mode**: read-only; no daemon restart/runtime mutation.

## Load-bearing delta

- `core/types.ts`: additive `WatchdogSidecar.exemptUntilMs`.
- `core/watchdog.ts`: 1h default TTL; shared exemption constructor; injected-clock legacy/deadline reconciliation; safe duration parsing.
- `adapters/watchdog-store.ts`: durable deadline parse/write.
- `core/daemon/watchdog-manager.ts`: reconcile and persist normalized expiry before any scheduler/capture/delivery path.
- `core/cli.ts`, top-level `cli.ts`, `core/session.ts`: bounded default/custom CLI exemption; effective deadline/remaining projection; bounded spawn/boot exemptions.
- Tests: `core/watchdog.test.ts`, `core/daemon/watchdog-manager.test.ts`.
- Operator/domain docs and `skills/pij/references/00-routing.md`.

## Questions

1. At `deadline-1`, `deadline`, and `deadline+1`, do effective pause and scheduler behavior match the exact inclusive/exclusive contract?
2. Can restart, legacy migration, invalid timestamps, status/list, or revision caching extend an exemption silently?
3. Is cleared/normalized sidecar persistence guaranteed before capture/delivery/fire after expiry?
4. Can `resume`, `pause`, working transition, compact, reset, relay exclusion, or `PIJ_NO_WATCHDOG` weaken/extend the wrong tier?
5. Can duration overflow or malformed time create a permanent safety-off or dishonest output?

## Lead proof

- RED-first recorded in `tasks/phase-2-watchdog-rearm/execution.log.md`.
- Focused watchdog/manager/real-CLI: 129/129.
- Full suite: 168 files / 3,051 passed; 4 files / 11 tests skipped.
- `harness checks --quick`: all 7 runnable sensors PASS; smoke skipped.
- Mutations RED then restore GREEN:
  - `now < deadline` → `<=`;
  - normalized write moved after capture;
  - working transition allowed to clear self.
- Intermediate unrelated daemon-push timeout passed isolated on candidate and clean base; logs in this reports directory.

## Review status

No independent per-phase reviewer was spawned under fd discipline. Before batched P2+P3 daemon-facing merge, one genuine cross-provider review remains a convergence-time gate if fd/quota recover. Return `P2 COMPENSATING APPROVE` or `P2 COMPENSATING FIX_REQUIRED` with material evidence only.
