# Phase 2 fix3 re-review - dd743cae

**Verdict: REQUEST_CHANGES**

Deleting the marker protocol removes both prior P1 mechanisms: a fresh
descriptor is no longer suppressed by a `forgetAt` comparison, and no
cross-process wall-clock ordering remains. The new lifecycle gate correctly
blocks a *synthetic* map overlay for an ordinary dissolved descriptor, and
`failed` parity is intentional: `list()` and the daemon's owned-set pass both
continue to include failed seats.

Two P1s remain in the restated AC-13' boundary.

## P1 - the lifecycle gate returns a legacy terminal tick stamp unchanged

`FsRegistry.read()` returns `hot` unchanged when
`hot.lifecycle === "dissolved"` (`fs-registry.ts:250-253`). That avoids
`overlayTick`, but it does not remove a `lastTickAt` already present in the
descriptor. This is a supported migration state: the final overlay spec writes
a raw pre-migration descriptor with `lastTickAt` and asserts that `read()`
honours it until a rewrite (`fs-registry.overlay.test.ts:489-500`).

Consequently, a raw pre-migration dissolved `<id>.json` with a fresh
`lastTickAt` is returned as live. I added an ephemeral review probe with that
exact descriptor; it failed with:

```text
expected '2026-06-28T11:59:59.000Z' to be undefined
```

The archive fallback has the same gap: it directly returns
`readFile(archivePathFor(id))`, so a pre-migration archived descriptor can
also expose its persisted tick. The current AC-04d covers only a modern
descriptor produced through `write()`/`archive()`, which `scrubTick` has
already cleaned.

This contradicts AC-13' ("never shows a dissolved seat as live") precisely on
the migration data the implementation deliberately supports. Strip
`lastTickAt` on terminal results at both the hot dissolved branch and the
archive fallback, without removing the compatibility behavior for live legacy
descriptors. Add raw legacy hot-dissolved and archived fixtures.

## P1 - "one tick (~600ms)" is not the bound when the daemon stops

The residual is bounded by the **next successful heartbeat write**, not by one
tick or 600ms. If the daemon stops immediately after its old-incarnation tick,
then a CLI/seat process revives the id before that map entry ages out, no next
write occurs to replace the map. `read()` overlays the old stamp onto the new
live descriptor until it becomes stale after
`DAEMON_TICK_STALE_AFTER_MS` (30 seconds), not 600ms
(`core/receipts.ts:11-42`).

This is user-visible: the real `send` receipt called immediately after that
revival reported `receipt: "queued", daemonTickStale: false` in my ephemeral
review probe, although the daemon had never ticked the replacement. The probe
sets a fresh map entry, dissolves and revives the target, then deliberately
does not perform another heartbeat write. Its expected `unverified`/stale
result failed exactly as stated.

The existing AC-13' BOUND tests prove only the conditional statement "after a
later tick, the whole-map rebuild ends the inheritance." Either revise AC-13'
and its documentation to make that conditional residual explicit, or restore
a safe incarnation fence that cannot create the defects removed in this round.
The current unconditional one-tick claim and user-visible fresh receipt are
not correct.

## Adjudications and independent evidence

- **Dissolved overlay path:** Current-map overlays are gated for hot dissolved
  records; `list()` already has the matching gate. Direct raw access itself
  does not overlay, but legacy persisted tick stamps defeat the requested
  result as above.
- **Failed parity:** Correct to preserve. `list()` excludes only `dissolved`,
  the daemon builds its map from that list, and the prior per-descriptor tick
  likewise reached failed seats. I found no basis to silently redefine
  `failed` as terminal in this fix.
- **Reincarnation visibility:** The deleted marker can no longer suppress a
  genuine new-incarnation map write. The surviving residual is real, but only
  conditionally bounded by the next daemon tick.
- **Unarchive coverage:** The coder's composite framing is honest.
  `unarchive()` alone returns a still-dissolved hot record, which the gate
  intentionally refuses; there is no public live observation before
  `revive()`. The archived-to-revived scenario covers the observable path,
  rather than claiming a fictitious per-site proof.
- **Newly reachable after deletion:** Legacy descriptor stamps now bypass the
  map-only gate, and a stopped daemon can leave a new incarnation looking
  freshly ticked for the 30-second stale grace.

All reviewer mutation runs used `--expect`:

| Reviewer mutation | Required criterion | Observed result |
| --- | --- | --- |
| Remove the hot dissolved gate | AC-13' dissolved + gate-not-prune | Killed both |
| Also gate `failed` | AC-13' PARITY | Killed exactly that criterion |
| Overlay the archive fallback | AC-04d archived has no overlay | Killed exactly that criterion |
| Merge rather than replace heartbeat sessions | AC-13' BOUND unowned | Killed exactly that criterion |

The focused overlay/store suites pass on the unmodified diff: 49 tests.
