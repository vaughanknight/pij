# Phase 2 execution log — daemon manager and CLI surface

**Date:** 2026-07-17  
**Delegation:** `dlg-0002`  
**Depends on:** Phase 1 pure watchdog core (`bb863b0`)

## Outcome by task

| Task | Outcome | Evidence |
|---|---|---|
| T001 | Complete | Wrote the fake-port manager suite before the manager/store existed. Initial RED was `Cannot find module '../../adapters/watchdog-store.js'`. Coverage includes registry reconciliation, tmux/pi delivery ownership, pre-bind/dead/paused/exempt behavior, ordinals, disposal, revision caching, and pre-injection capture ordering. |
| T002 | Complete | Added `WatchdogManager` with an injected `WatchdogStorePort` and `FsWatchdogStore` for validated `watchdog.json` read/write/revision plus capture pointer writes. The manager composes Phase 1 decisions and reads no event stream. |
| T003 | Complete | Mounted one manager in `Daemon.tick()`, stamped `lastWatchdogFireAt` via `writeMerged`, supplied descriptor-derived activity/attribution, and excluded the first watchdog-caused pane mutation from `paneSig` heartbeat refresh. `core/daemon/loop.ts` was not read or modified. |
| T004 | Complete | Watchdog `stalled` feeds the existing `this.pushed` latch and `failureReason:"stalled"`; the existing whole-life detector and watchdog cannot double-push. Idle/real-activity recovery clears the shared latch and descriptor reason. The `DeathReason` comment now names both detectors. |
| T005 | Complete | Both compact seams persist `pausedBy:"compact"` before mutation: daemon tmux injection uses the router helper before `drainTmuxInbox`; pi inbound writes before `ports.pi.compact()`. Real working transitions auto-resume compact, while self/exempt tiers remain stronger. Bare `/compact` still normalizes to the same command path. |
| T006 | Complete | Per-watcher policy drives anomaly capture through `shouldCapture`/`captureSlice`; pointer files land under the watcher's `watchdog-captures/`, notices inline at most five lines, and paneless targets explicitly report capture unavailable. |
| T007 | Complete | Added `watchdog status|pause|resume|exempt|watch|unwatch|list`, JSON watchdog blocks on status/state/list, documented help, and `spawn --no-watchdog`. Control spawns write an exempt sidecar; pi spawns carry `PIJ_NO_WATCHDOG=1` and persist exemption on first boot. |
| T008 | Complete | Required typecheck, test, lint, and quick harness gates passed in the isolated s055 worktree. |

## Files changed

- `.pi/extensions/pij/core/daemon/watchdog-manager.ts`
- `.pi/extensions/pij/core/daemon/watchdog-manager.test.ts`
- `.pi/extensions/pij/adapters/watchdog-store.ts`
- `.pi/extensions/pij/daemon.ts`
- `.pi/extensions/pij/core/daemon/router.ts`
- `.pi/extensions/pij/core/session.ts`
- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/cli.ts` (fence amendment 001: additive composition/help/spawn sidecar only)
- `docs/plans/055-pij-watchdog/tasks/phase-2-daemon-manager-cli-surface/tasks.md`
- `docs/plans/055-pij-watchdog/tasks/phase-2-daemon-manager-cli-surface/execution.log.md`

## Key decisions

- **Descriptor axis truth:** `lastEventAt` movement is the sole activity input for `isFireDue` anchoring and `evaluateResponse.eventAdvanced`, including paneless pi. `events.ndjson` is never read by the manager. Watchdog-attributable descriptor movement is observed but does not re-anchor scheduling.
- **Honest attribution:** the first pane/event/working transition after a delivered turn is typed watchdog-attributable. The pane attribution is consumed on the daemon's first observation; later movement can prove real recovery.
- **One shared stalled episode:** owner notices and `failureReason` use the daemon's existing `this.pushed` latch. Watcher capture delivery remains bounded and policy-specific.
- **Persist before mutate:** compact sidecars are written before tmux injection or pi compaction.
- **Merge discipline:** `types.ts` changes are additive (`lastWatchdogFireAt`, watcher/capture sidecar fields) and deliberately avoid s054's concurrent `systemState`/`semanticState`/assignment/context contract. The `daemon.ts` diff is additive and `core/daemon/loop.ts` remains untouched per SW-6.
- **Fence amendment:** the orchestrator authorized minimal additive `.pi/extensions/pij/cli.ts` changes after discovery proved the real bin had to inject `FsWatchdogStore` and own spawn-time sidecar writes.

## Honest execution history

1. Tests-first manager run went RED because the new adapter/manager modules did not exist.
2. The first focused implementation run had four failures. They exposed: paused/exempt sessions must remain reconciled for revision/resume; watchdog-caused descriptor movement must not fabricate recovery; pane attribution must be consumed on first observation; and clearing an optional descriptor field must explicitly write `undefined` through `writeMerged`.
3. The focused suite then passed.
4. The first full repository run had one compatibility failure: a paneless pull peer with no `lastEventAt` received a first fire because `startedAt` was used as fallback. The binding contract requires descriptor `lastEventAt`; removing the fallback fixed the issue.
5. Final pre-gate full suite: 2,065 passed, 11 skipped (2,076 total).
6. The first exact final chain hit one unrelated Flow-Pair subprocess timeout (`fix --json`, 5-second budget under full-suite load). Its focused rerun passed in 970 ms; the unchanged full chain then passed all 2,065 tests and every required gate.

## Observed gates

- Focused Phase 2 suite — `Tests 20 passed (20)`.
- `just typecheck` — PASS.
- `just test` — PASS: 2,065 passed, 11 skipped (2,076 total).
- `just lint` — PASS.
- `harness checks --quick` — PASS.

## Discoveries

- The task's original fence omitted the actual CLI composition root. Fence amendment 001 added only adapter injection, watchdog usage/help wiring, and `--no-watchdog` sidecar persistence.
- A descriptor event can be watchdog-caused: descriptor truth and watchdog attribution must both be honored. Using descriptor truth does not mean treating every descriptor movement as real peer activity.
- A required harness package audit may rewrite out-of-scope vetting timestamps; Phase 2 uses `harness checks --quick`, and worktree status must still be inspected immediately afterward.
- Cross-stream contract received during implementation: s054 adds system/semantic/assignment/context fields and state constants to `types.ts`; this phase stays additive and merge-friendly for convergence.

## Fix cycle `fix-0002`

The authoritative review returned three critical and two high findings. The fixes were executed through the binding direct jump:

```text
/builder 6 implement --plan "docs/plans/055-pij-watchdog/pij-watchdog-plan.md" --phase "Phase 2: Daemon manager + CLI surface"
```

| Finding | Disposition | Regression proof |
|---|---|---|
| CRITICAL-1 | **Fixed.** Added explicit watchdog ownership for the shared stalled episode. Legacy `not stalled` can release only a legacy-owned latch; a watchdog-owned latch/reason survives idle ticks until typed real recovery. Root sessions are stamped regardless of `spawnedBy`; only owner delivery is conditional. | Idle-frozen daemon fixture stays `failureReason:"stalled"` across a non-due tick and emits one owner notice; paneless root fixture receives the persisted stalled verdict. |
| CRITICAL-2 | **Fixed.** Pane attribution is determined from the observed state before any descriptor write. One guard protects both `observeActivity`'s timestamp and the pane heartbeat; attributed observations retain the prior descriptor `lastEventAt`. Manager state carries attribution across the watchdog-caused working→idle return edge, including its idle pane return. | Persisted descriptor `lastEventAt` remains byte-identical on the busy edge; paneless busy→idle sequence produces no responsive event and reaches `suspect` at the next due fire. |
| CRITICAL-3 | **Fixed and mutation-proven.** Added isolated paneless descriptor-only and daemon persisted-pane fixtures so neither can be rescued by another attribution axis. | Event assignment mutation: **2 failed / 25 passed**, restored **27/27**. Pane guard mutation: **1 failed / 26 passed**, restored **27/27**. |
| HIGH-1 | **Fixed.** Watchers are evaluated on every due fire with the real anomaly boolean. Healthy fires remain silent for default anomaly policy; `mode:"always"` writes and delivers its bounded pre-injection capture. | Healthy first-fire `always` fixture writes the pointer capture and a `watchdog responsive` notice. |
| HIGH-2 | **Fixed.** `watchdog pause` rejects an exempt target with clear `E-ARG` rather than weakening the non-expiring tier. | Exempt→pause fixture asserts non-zero result, explanatory stderr, and unchanged sidecar. |

### Tests-first and mutation evidence

- New tests initially produced **5 failed / 22 passed**; after correcting the pane fixture to cross the existing 10-second activity throttle, the isolated pane test also reproduced the review's exact timestamp pollution.
- Focused suite after implementation and formatting: **27 passed (27)**.
- Exact review mutation 1 (`eventAdvanceWasWatchdog = false`): focused suite went RED (**2 failed / 25 passed**), then restored GREEN (**27/27**).
- Exact review mutation 2 (`!watchdogAttributedPaneChange → true`): focused suite went RED (**1 failed / 26 passed**), then restored GREEN (**27/27**).
- **Noteworthy proof-harness trap:** `just flow-pair-mutate` expands its variadic suite command unless the command is preserved as one quoted shell argument. A bare invocation silently ran `npx` rather than Vitest and falsely reported green. The successful commands preserved `"npx vitest run .pi/extensions/pij/core/daemon/watchdog-manager.test.ts"` as the third argument. The out-of-scope harness recipe was not changed.

### Domain and scope

- Behavioral corrections only; no new public contract, domain, dependency edge, or component. Domain registry/history updates remain Phase 3 work and are outside this fix fence.
- `core/daemon/loop.ts`, `types.ts`, `.pi/packages.yaml`, and flight-plan files were not modified by this fix cycle.
- Final fix gate: `just typecheck && just test && just lint` — **PASS**. Full suite: **2,072 passed, 11 skipped (2,083 total)**; Biome exited 0 with the repository's existing warnings/info.

## Post-review fix cycle `fix-0003`

The Phase 3 temp-daemon proof exposed a remaining D8 split: daemon-owned owner notification used the shared episode latch, but manager-owned watcher notification ran on every due stalled fire. `fix-0003` was executed through the binding Phase 2 direct jump; Phase 3 remains paused until this fix is approved.

### Tests first

Two delivered-count assertions went RED before production changes:

- manager cycle: consecutive stalled fires expected one anomaly-watcher stalled notice; received two;
- isolated daemon cycle: owner count remained one, while watcher count expected one and received two.

Focused RED: **2 failed / 26 passed**.

### Correction

`WatchdogManager.RuntimeState` now owns `anomalyWatcherStallsNotified: Set<SessionId>`. A successful anomaly-mode stalled delivery records that watcher; later stalled fires in the same episode skip it. `reportRealRecovery()` is the only reset seam. Per-watcher state lets all subscribed watchers receive one notice and permits a newly added watcher one notice without replaying to prior watchers. Explicit `capture.mode:"always"` bypasses the guard and retains every-due-fire delivery/capture.

The recovery test first consumes a watchdog-attributed descriptor movement, then advances the descriptor again to prove typed real recovery resets the guard; a new silent episode produces exactly one further stalled notice.

### Mutation and isolated proof

The load-bearing guard mutation was:

```text
just flow-pair-mutate .pi/extensions/pij/core/daemon/watchdog-manager.ts \
  's/!state\.anomalyWatcherStallsNotified\.has\(watcher\.watcherId\)/true/' \
  "npx vitest run .pi/extensions/pij/core/daemon/watchdog-manager.test.ts"
```

- Mutated RED: **2 failed / 26 passed**.
- Restored GREEN: **28 passed / 28**.
- A first unescaped sed expression matched nothing and was rejected by the wrapper, proving nothing; the recorded command escapes regex punctuation and preserves the complete suite as one argument.

The isolated temp-home runner then returned **PASS** and exit 0:

```text
descriptorFailureReason: stalled
ownerStalledNotices: 1
watcherStalledNotices: 1
```

`reports/proof-log.md` now marks AC-06 PASS and AC-09 pending/SKIP until the remaining Phase 3 scenarios run after review. No live daemon, real `~/.pij`, `events.ndjson`, `daemon.ts`, or `core/daemon/loop.ts` was touched.

### Gate status

- `just typecheck` — **PASS**.
- `just test` — **PASS**: 2,073 passed, 11 skipped (2,084 total).
- `just lint` — **PASS** with the repository's existing warnings/info only.
- Focused manager/daemon suite — **28 passed / 28**.
- Isolated AC-06 proof runner — **PASS**, exit 0.
- `daemon.ts` and `core/daemon/loop.ts` — zero-diff for `fix-0003`.
