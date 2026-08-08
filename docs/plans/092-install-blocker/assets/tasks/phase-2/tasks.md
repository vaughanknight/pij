# Phase 2 tasks — `pij daemon start` must report a **verified** daemon, not a launched one

Plan: [`../../../install-blocker-plan.md`](../../../install-blocker-plan.md) · Issue: pij#118 (defect 2)

## The principle

**A created tmux window is evidence that tmux made a window. Nothing else.**

`ensureDaemonRunning()` returns its success note the moment `tmux.newWindow()` succeeds, so *every*
crash-on-boot is reported as a successful start — including the one Phase 1 just fixed. On a fresh
install the user is told *"⚙ started one … it will drive control-plane sessions to bound"* **by the
code that just failed to start it**, and then nothing ever binds.

This is the third instance of one shape found in this repo today (pij#165: reports success for a
seat it spawned that never bound; pij#161: the watchdog's `responsive` is the initialisation value,
so a dead seat is certified healthy; this one). Every one **reports success for something it
LAUNCHED rather than something it VERIFIED.** Fixing the reporting is worth more than the `mkdir`.

## Files

**Allowed**: `.pi/extensions/pij/core/daemon/lifecycle.ts`,
`.pi/extensions/pij/core/daemon/lifecycle.test.ts`, `.pi/extensions/pij/cli.ts`
(**`ensureDaemonRunning()` only**), `docs/plans/092-install-blocker/**`.

**Forbidden**: everything else. Specifically `core/message.ts`, `core/state.ts`,
`core/watchdog.ts`, `core/daemon/watchdog-manager.ts`, `core/anomalies.ts`,
`core/orchestration/pa-capability.ts`, `core/platform/types.ts`, `core/cli.ts`, `.flow-pair/**`,
`the-flow.json`, `the-flow.md`, `.the-flow-state.json`.

`cli.ts` is 5k+ lines and other work is in flight against this repo. Touch **only**
`ensureDaemonRunning()`. Do not reformat, do not tidy neighbours.

## Tasks

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Add a **pure** `daemonStartOutcome(status: DaemonStatus): DaemonStartOutcome` to `core/daemon/lifecycle.ts`, where `DaemonStartOutcome = { kind: "verified"; pid: number } \| { kind: "unverified" }`. `running` → verified; `stale` and `absent` → unverified | No I/O, no timers, no imports beyond `./lock.js` | AC-08 |
| 2 | Add cases to `lifecycle.test.ts` for all three statuses | Green | AC-08 |
| 3 | In `ensureDaemonRunning()`, after a successful `newWindow`, poll `readDaemonStatus()` on a **short bounded budget** and branch on `daemonStartOutcome()` | Happy path returns the `⚙` note, now carrying the **verified pid** | AC-08 |
| 4 | On `unverified`, return a failure note that includes the pane's last output, captured with `capturePane(paneId, {}, runner)` from `adapters/tmux-keys.ts` (a standalone exported function — you do **not** need the daemon adapter) | The operator sees the real cause instead of a success line | AC-09 |
| 5 | Run the full daemon + lifecycle + cli test suites | No new failures | AC-03 |
| 6 | `just typecheck && just lint` | Clean | AC-06 |

## Design constraints

- **Keep the decision pure and the loop thin.** The repo's pattern is logic in `core/`, tested
  there; the bin owns I/O. `daemonStartOutcome` must be testable without a filesystem or a clock.
- **Bounded wait, short.** `pij send` and friends call `ensureDaemonRunning()` on the hot path. The
  daemon writes its lock before it does anything else, so the happy path resolves almost
  immediately. Keep the total budget well under a second and name the constant.
- **Do not over-claim failure.** The `unverified` note must say the daemon **may still be coming
  up**, and show the pane output rather than asserting a cause. Reporting a *verified* state is the
  goal; asserting death you have not established would repeat the original sin in the opposite
  direction.

## Do NOT change

- `needsAutoStart()`, `daemonStatus()`, `planStop()` — existing pure functions, other callers.
- The `DAEMON_WINDOW_NAME` convention or the double-start guard
  (`if (daemonWindows().length > 0) return null`).
- The not-in-tmux branch (`cli.ts:1137-1140`). It is tracked separately as **pij#170** and is
  explicitly **not** this stream's fix.
- The `newWindow` failure branch (`if (!res.ok) …`) — already honest.

## Search trap

`rg` skips hidden paths and **all** the source is under `.pi/`. Always pass `--hidden`.

## Enumeration trap (bit this stream today — see ledger F-103)

**Never pipe an enumeration through `head`.** A truncated list that ends exactly at the limit is
indistinguishable from a complete one. Count with `wc -l` first, or `tee` the whole set.
