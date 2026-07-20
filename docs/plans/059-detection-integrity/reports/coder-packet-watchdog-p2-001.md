# Coder packet — 059 Phase 2 watchdog exemption re-arm

**Owner**: `pij-professional-capybara` · **Grant**: `reports/phase-grant-002.md`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
**Branch/base**: `round/detection-state-v2` @ `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`

## Owned outcome

Replace permanent incident exemptions with a durable, visible expiry/re-arm contract. No daemon restart or live runtime mutation.

Recommended minimal shape (source may refine without changing semantics):

- additive `WatchdogSidecar.exemptUntilMs?: number`;
- `DEFAULT_WATCHDOG_EXEMPT_TTL_MS = 60m` next to watchdog data;
- one pure `applyWatchdogExemption(sidecar, nowMs, ttlMs)` used by CLI and `PIJ_NO_WATCHDOG` boot;
- one pure injected-clock reconciliation function returning the normalized sidecar/effective pause. At `now < deadline` it remains exempt; at `now === deadline` and after it is re-armed;
- legacy exempt sidecar with `pausedAtMs` but no deadline derives `pausedAtMs + default TTL`; invalid/missing time expires immediately rather than silently extending safety-off;
- watchdog manager persists normalized/cleared expiry state **before** scheduler/effective active behavior can fire; prove write-before-fire order;
- `pij watchdog exempt <id> [duration]` accepts the existing duration grammar with a default TTL; `reset` remains immediate explicit un-exempt; `resume` must not downgrade a live exemption;
- human/JSON status exposes deadline and remaining/effective state truthfully.

Self and compact pause semantics are frozen: self requires explicit resume; compact clears only on working transition. Relay behavior remains dominated by `relay:true` and must not regress.

## Required RED-first proof

1. Exact value-pinned boundary tests: `deadline-1` exempt/no fire; `deadline` active/re-armed; `deadline+1` active.
2. Restart persistence: store reload retains exact deadline; restart never extends it.
3. Persist ordering: on expiry manager/store writes cleared/normalized sidecar before any due fire/effective mutation.
4. Legacy missing/invalid deadline behavior.
5. CLI parse/default/custom duration, text and JSON fields.
6. Self/compact/reset/resume/relay non-regression.
7. `PIJ_NO_WATCHDOG` boot creates a bounded exemption through the shared helper.

## Allowed writes

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/watchdog.ts`
- `.pi/extensions/pij/core/watchdog.test.ts`
- `.pi/extensions/pij/core/daemon/watchdog-manager.ts`
- `.pi/extensions/pij/core/daemon/watchdog-manager.test.ts`
- `.pi/extensions/pij/adapters/watchdog-store.ts`
- `.pi/extensions/pij/adapters/watchdog-store.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/core/session.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `docs/how/pij-watchdog.md`
- `docs/how/pij.md` only if CLI table needs one exact update
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/plans/059-detection-integrity/tasks/phase-2-watchdog-rearm/execution.log.md`

Everything else is read-only. In particular do not touch daemon.ts, death/close/spawn-expectation code, plan 060, flow files, package/config/government, or git state.

## Forbidden

`.the-flow-state.json`, any `the-flow.json`/`the-flow.md`, `.flow-pair/**`, `government/**`, package manifests/settings; no commit, restart, daemon command, close/adopt/register, or new peer.

## Gates

- focused watchdog/store/manager/CLI/session tests;
- `just typecheck`, `just lint`, `git diff --check`;
- `just test` if focused green;
- report environmental flakes separately; do not fix outside fence.

## Done signal

Send parent `COMPLETE WATCHDOG P2` with changed paths, exact RED→GREEN results, ordering/boundary evidence, gates, and unknowns. Stop after reporting.
