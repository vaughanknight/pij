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

Fetched `origin/main` and rebased cleanly after Item 15-FX merged.

- Rebased implementation commit: `16d02db0b0b2e44fee4a7dd37f4326e876e6541c`
- Re-derived merge-base / `origin/main`:
  `58c9cf100bea4a4b1348ae12ffa3e9763f0a6c3a`
- The branch differs from that merge-base in exactly the eleven fenced files.

Authoritative full extension suite:

```text
Test Files  172 passed | 2 skipped (174)
Tests       4121 passed | 15 skipped (4136)
Duration    198.90s
```

Logs:

- `.harness/temp/s391/vitest-phase13.log`
- `/Users/vaughanknight/.pij/pij-jolly-moose/bg-mtca1ah4-bvzzze.log`

Post-rebase root TypeScript typecheck passed. Scoped Biome passed on all nine
changed TypeScript files.

## Engineering-harness result

`harness checks` was also run as the repository-wide done gate. Its JSON result
was non-zero with four failures, all outside this phase's fence:

1. `lint`: pre-existing Biome findings in unchanged
   `.pi/extensions/pij/producers/osc-7337-producer.ts`.
2. `test`: `harness/scripts/release-age-policy.test.ts` requires `pwsh`, which
   is not installed on this machine (`spawnSync pwsh ENOENT`).
3. `windows-compat`: the same unchanged producer-file Biome finding.
4. `smoke`: the unchanged watchdog proof calls async `daemon.tick()` without
   awaiting it, then immediately checks the post-await scheduler result
   (`smoke first fire was not queued`).

The packet-required gates remain green: full `.pi/extensions/pij/` Vitest,
root typecheck, and scoped Biome. Harness log:
`.harness/temp/s391/harness-checks-phase13.log`; wrapper log:
`/Users/vaughanknight/.pij/pij-jolly-moose/bg-mtca6dps-qio58o.log`.

## FX-02 — sustained-liveness near-miss and review guards

Cold review found that T006 had accidentally widened the independent
`reportSustainedLiveness` clear window from the original 60-second ceiling to
the seat's configured stall threshold. That was outside AC-29, undisclosed, and
unsensored.

RED:

```text
does not clear stalled from a five-minute-old event on a 20-minute interval
Expected: stalled
Received: undefined
```

The production line was restored byte-for-byte to
`Math.min(cfg.intervalMs, STALE_AFTER_MS)`. The new test uses a 20-minute
interval and an event five minutes old, proving sustained liveness does not
clear the pinned stall. Mutating the window back to `staleAfterMsFor` reproduces
the RED above. Evidence: `.harness/temp/s391/fx02-m1-red.log`.

The death reconciler now has an explicit fixed-candidate guard proving bounded
withheld summaries retain observed `subjectId` values (`s-dead-0..2`) rather
than the `pij-daemon` sender. The watcher tests also restore the s097
assertion-discipline rationale and a positive always-watcher delivery anchor
for a measured verdict. The watchdog docblock records that item 31 / AC-28
reversed pij#161's unknown-delivery choice because of attention cost, with the
bounded log line as compensating evidence.

F-2 mutation: changing the fixed death candidate's `subjectId` to
`pij-daemon` made the guard RED with three received `pij-daemon` subjects
instead of `s-dead-0`, `s-dead-1`, and `s-dead-2`. Evidence:
`.harness/temp/s391/fx02-subject-id-red.log`.

The restored production line was compared directly with the merge-base copy
and is byte-identical:

```ts
const livenessWindowMs = Math.min(cfg.intervalMs, STALE_AFTER_MS);
```

FX-02 gates:

```text
Test Files  172 passed | 2 skipped (174)
Tests       4123 passed | 15 skipped (4138)
Duration    186.45s
```

Full-suite log: `.harness/temp/s391/vitest-phase13-fx02.log`.
Root TypeScript typecheck passed. Scoped Biome passed on all changed
TypeScript files.
