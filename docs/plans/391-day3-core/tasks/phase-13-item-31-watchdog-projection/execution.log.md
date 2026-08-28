# Phase 13 execution log — watchdog projection and sensor verdicts

## Starting point

- Branch: `s391/item31-watchdog-projection`
- Original base and `HEAD`: `8f5dd3a90b11c8f8443d43c0d0dccd41e5209f9e`
- Scope followed: the exact fence in `packet-addendum.md` §8.
- Shared daemon was not restarted or stopped.

## T001–T002 — one live fire clock

RED:

```text
projects the live fire clock and keeps statusAt re-anchoring
Expected: 1970-01-01T00:00:00.200Z
Received: 1970-01-01T00:00:00.100Z
```

`nextFireDueAtMs` now computes `max(lastFireAtMs, scheduleAnchorAtMs) +
intervalMs` and returns `null` when the watchdog is disabled, paused, or has no
finite anchor. `isFireDue` and `schedulerProjection` both consume that helper.
The manager test proves the projection advances after two fires and still
re-anchors when `statusAt` moves.

Mutation: projecting `scheduleAnchorAtMs + intervalMs` made the T001 test RED
with the same `100Z` versus `200Z` mismatch. Evidence:
`.harness/temp/s391/dlg-0029-mutations/t002-anchor-only.log`.

## T003–T004 — unknown is local diagnostic evidence

RED:

```text
logs a first-fire unknown without delivering it to watchers
Expected watcher outbox: []
Received: one "watchdog unknown: peer" notice with a capture
```

A fire with no response outstanding still sends the next watchdog turn and
arms response tracking, but it logs exactly
`watchdog unknown: <id> (not delivered)` and creates no watcher notice or
capture. A sibling case keeps the prior always-mode capture/notice intent on a
real `suspect` verdict.

Mutation: re-enabling `notifyWatchers` in the `unknown` branch made the inverted
test RED and recreated the watcher notice/capture. Evidence:
`.harness/temp/s391/dlg-0029-mutations/t004-unknown-delivery.log`.

## T005–T006 — interval-aware legacy stall threshold

RED:

```text
waits for a 20-minute seat interval before reporting legacy stalled
Expected owner messages: []
Received: one gone-quiet notice at five minutes
```

`WatchdogManager.staleAfterMsFor(id)` now returns 60 seconds for a seat with no
sidecar, otherwise `max(60 seconds, effective intervalMs)`. The legacy daemon
detector consumes that seam. Tests cover five versus twenty-one minutes on a
20-minute sidecar, the no-sidecar 61-second rule, and a live exemption.

Mutation: restoring the detector's bare `STALE_AFTER_MS` comparison made the
five-minute case RED. Evidence:
`.harness/temp/s391/dlg-0029-mutations/t006-bare-stale.log`.

## T007 — sensor provenance

The pre-implementation provenance run produced eight RED assertions across
legacy stall, watchdog-derived stall, provider failure, both bind paths, bind
refusal, bind failure, descriptor death, and expectation death.

Shared sensor ids now sign notices:

- `pij-watchdog`: watchdog-derived stall and watchdog turns/verdicts.
- `pij-daemon`: legacy stall, provider failure, bind/refusal/failure, and death.

The observed seat remains in notice text. Death candidates retain a separate
`subjectId`, so aggregate withheld-death summaries still name the observed
seat rather than the sensor. A daemon delivery from unregistered `pij-daemon`
is consumed without attempting a receipt back to that sensor.

Mutation: changing the provider-failure sender back to the observed descriptor
made its provenance assertion RED (`pij-routed-provider-failure` versus
`pij-daemon`). Evidence:
`.harness/temp/s391/dlg-0029-mutations/t007-provider-sender.log`.

## Pre-rebase proof

```text
Test Files  5 passed (5)
Tests       375 passed | 2 skipped (377)
```

Affected-suite log: `.harness/temp/s391/dlg-0029-targeted.log`.
Root TypeScript typecheck passed. Scoped Biome found two formatting-only
differences, which were applied before the rebase boundary.

## Rebase and final gates

Pending the required fetch/rebase onto the current `origin/main`, followed by
the authoritative full extension suite, root typecheck, and scoped Biome.
