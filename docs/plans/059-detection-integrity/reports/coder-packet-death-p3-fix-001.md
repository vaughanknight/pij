# Completion fix packet — Plan 059 Phase 3

**Owner**: `pij-professional-capybara`
**Worktree/base**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state` · `round/detection-state-v2` · `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`
**Mode**: bounded completion of the existing P3 cut. RED first. No daemon/runtime/tmux mutation or commit.

## Lead findings — all must close

### F1 — Requested closures never acquire terminal truth (CRITICAL)
CLI, in-process, and once-mode write `closeIntent`, then kill+dissolve. The death sweep excludes dissolved descriptors, so no `terminal.disposition=requested` is ever stored and history cannot report requested.

Fix with one shared pure transition:
1. persist close intent;
2. perform owned teardown;
3. after successful/idempotent kill observation, persist `terminal:{disposition:"requested", observedAt, evidence,...}` plus durable notice disposition as appropriate;
4. then dissolve.
A failed kill retains intent but must not claim observed terminal absence. Tests must use one exact ordered trace for intent-write → kill → terminal-write → dissolve in standalone CLI, `PijSession.close`, and daemon once-mode. Surface terminal in `state/list --json` and human state/history projection.

### F2 — Most launch paths have no expectation (CRITICAL)
Only `PijSession.spawn` writes the new store. Instrument every peer launch path before pane/window creation:

- standalone `pij spawn --harness pi`;
- standalone daemon-bound `pij spawn --harness claude|copilot|codex`;
- `pij agent spawn`;
- `pij focus launch`;
- retain `PijSession.spawn`.

Persist before tmux launch, update pane afterward, stamp `spawnId` on any descriptor, remove/resolve only the owned expectation on synchronous launch failure. Daemon binding/reconciliation must correlate by `spawnId` for daemon-bound peers. The daemon's own control window is not a peer expectation.

### F3 — Historical and unavailable are dead code (HIGH)
`DeathNotice.historical` is always false; no unavailable observation reaches the reducer. Add tagged observation inputs/results:

- first death sweep after daemon construction is `historical/boot reconciliation`; later sweeps are live;
- notice text explicitly says historical boot reconciliation vs live observation and always includes `observedAt` plus last-seen when known;
- thrown/unavailable PID/pane probes yield persisted `terminal.disposition="unavailable"`, evidence `observation-unavailable`, and a concrete `unavailableReason`, never `unrequested` or cause;
- tests reconstruct a daemon/store and prove historical wording and once-only behavior.

### F4 — No expiry and double-alert correlation gaps (HIGH)
Add a named expectation registration TTL/deadline with injected-clock tests. At deadline, a never-registered expectation becomes a no-show from expectation expiry without claiming runtime harness/cause. A missing pane before registration is also no-show. Runtime harness stays undefined when no descriptor existed.

Correlate/suppress by `descriptor.spawnId === expectation.spawnId`, not only `expectation.sessionId`; descriptor materialization must prevent a parallel expectation no-show even if the bind-side write was interrupted. Bound expectations must not be ignored forever when close/history needs correlation.

### F5 — Pi replacement/terminal shutdown not implemented (HIGH)
`session_shutdown` still ignores reason and always dissolves. Pass installed Pi shutdown reason into a pure decision:

- replacement/reload/new/resume/fork equivalents never terminalize the predecessor;
- unknown/terminal quit does not silently dissolve before the daemon can observe absence (or explicitly stores honest terminal evidence if the SDK gives it);
- successor boot consumes/reconciles predecessor expectation without a false death.

Pin exact reasons from the installed type contract/source—do not guess names. Keep one `session_start` handler.

### F6 — Tests/active docs are incomplete
Add non-vacuous wiring tests in `daemon.test.ts`, `cli.integration.test.ts`, `index.test.ts`, `core/cli.test.ts`, and relevant focus/agent tests. Existing new reducer tests (3 cases) are insufficient. Update docs/domain/active routing guide. Also fix the active top-level `WATCHDOG_USAGE` stale phrase `non-expiring exempt` and its JSON field list from P2.

## Evidence laws

- `unrequested-by-pij` = observed/expired expected absence without close intent, never cause.
- requested harness ≠ observed runtime harness.
- persist intent before teardown; persist terminal/latch before notice according to the chosen at-most/at-least-once rule, document the power-loss tradeoff honestly.
- no duplicate notice across ordinary ticks and reconstructed daemon/store.
- provider-stuck live PID remains non-terminal.
- no placeholder descriptor for no-show.
- legacy descriptors/store remain readable.

## Allowed writes

All paths from `coder-packet-death-p3-001.md`, plus:

- `.pi/extensions/pij/core/focus.ts`
- `.pi/extensions/pij/core/focus.test.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/daemon-push.test.ts` only if a direct compatibility assertion is required

Do not change any other file without asking.

## Gates and done signal

Focused reducer/store/close/session/daemon/CLI/index/focus/agent tests; thread-1 regressions; typecheck/lint/diff; full tests. Send `COMPLETE DEATH P3 FIX` with changed paths, exact RED→GREEN counts, how F1–F6 closed, gates, and unknowns. Stop.
