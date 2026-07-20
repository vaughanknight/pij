# Final hardening packet — Plan 059 Phase 3

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
**Owner**: `pij-professional-capybara`
**Mode**: RED-first test hardening + smallest source corrections. No runtime/restart/commit/peer.

The F1–F6 product paths are now present. P3 is still rejected because the load-bearing wiring is insufficiently pinned and one expiry evidence label is dishonest.

## Required fixes

1. **Expectation expiry evidence**: add/use distinct `expectation-expired` terminal evidence. A deadline-only no-show must not say `pane-missing` when no pane was ever recorded. Pane disappearance continues to say `pane-missing`.
2. **Deadline robustness**: compare parsed epoch values, not raw ISO strings. Malformed/unparseable persisted deadline/request time must degrade to reachable `unavailable(reason)` (or an equally explicit durable unavailable record), never immortal pending and never guessed absence. Keep the named 5m constant/value-pinned boundary.
3. **Failure-reason probe containment**: `failureReasonFor`/pane capture throwing after PID absence must not escape the reducer/daemon tick and erase the already-observed absence; persist an honest unavailable reason or omit compatibility failureReason while retaining terminal observation. Add RED test.
4. **Exact ordered traces**:
   - `PijSession.spawn`: expectation write with exact deadline occurs before tmux split/new-window; pane update follows launch.
   - `PijSession.close`: intent write → kill → requested-terminal write → dissolve; failed kill stops before terminal/dissolve.
   - daemon once close: same exact sequence.
5. **Real CLI producer proof** in `cli.integration.test.ts`:
   - standalone Pi spawn expectation preexists/carries printed pane and deadline, no descriptor required;
   - standalone daemon-bound spawn expectation correlates spawnId/pane/sessionId/requested harness and descriptor carries same spawnId;
   - agent spawn same;
   - synchronous pane launch failure removes only the owned expectation;
   - CLI close leaves dissolved requested terminal history.
   The fake tmux log plus store state must make prelaunch ordering non-vacuous. Add a test-only logging seam only if unavoidable; do not weaken production API.
6. **Focus proof**: expose a local trace in `focus.test.ts` and assert expectation write → tmux launch → pane/bind update, exact deadline, plus cleanup on synchronous launch failure.
7. **Daemon/index wiring proof**:
   - first daemon sweep over durable dead descriptor/no-show emits text containing `historical boot reconciliation` and timestamp, persists terminal/latch; reconstructed daemon emits no duplicate;
   - second/live sweep wording is live;
   - unavailable probe is contained/persisted;
   - exact Pi `session_shutdown` contract: replacement reason dissolves/no false terminal; quit remains observable for daemon. Add assertions in `index.test.ts`, not only coordinator tests.
8. **Projection proof**: `core/cli.test.ts` pins terminal disposition/times/unavailableReason in `state/list --json` and human state wording.
9. Update execution log with final RED→GREEN counts and the actual test matrix.

## Allowed writes

Existing P3 packet allowlist only. Expected touched tests: `core/spawn-expectation.test.ts`, `core/daemon/death-reconciler.test.ts`, `core/session.test.ts`, `daemon.test.ts`, `cli.integration.test.ts`, `core/focus.test.ts`, `index.test.ts`, `core/cli.test.ts`; source corrections limited to their paired allowed files.

## Gates

Focused new/P3/daemon/index/CLI/focus tests; anomaly/channel/daemon-push regressions; typecheck, lint, diff; full tests. Report environmental timeout flakes separately.

Reply `COMPLETE P3 HARDEN` with exact RED count, focused counts, ordered-trace evidence, full gates, and unknowns. Stop.
