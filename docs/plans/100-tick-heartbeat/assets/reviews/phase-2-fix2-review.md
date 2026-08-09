# Phase 2 fix2 re-review - dlg-0003-fix2

**Verdict: REQUEST_CHANGES**

The timestamp fence correctly closes the original P1a stale-snapshot
interleaving when the shared clock is monotonic, and the permanent marker
directory closes the prior mkdir/rmdir loss. It still has two P1 correctness
holes.

## P1 - a fresh revived or unarchived incarnation can be suppressed as stale

The temporal marker says that every tick with `tickAt <= forgetAt` describes
the departed incarnation. That is false at the two lifecycle sites that make
the replacement descriptor visible *before* writing the marker:

- `unarchive()` writes the hot descriptor and only then calls
  `forgetTick(id)` (`fs-registry.ts:787-791`).
- `revive()` likewise writes the fresh descriptor and only then calls
  `forgetTick(revived.id)` (`:329-336`). An archived revival does both paths.

This permitted ordering loses a genuine new-incarnation tick:

1. The daemon stamps `tickAt = T0`.
2. `unarchive()` or `revive()` publishes the replacement descriptor.
3. The daemon's subsequent `registry.list()` observes that replacement.
4. The lifecycle path writes `forgetAt = T1 > T0`.
5. The daemon publishes the genuinely observed replacement under `T0`.

`applyForgotten()` removes the id because `T1 >= T0`. This is not merely an
internal conservative result: an absent `lastTickAt` makes
`daemonTickStatus()` stale, and the delivery receipt becomes `unverified`
(`core/receipts.ts:26-42`, `cli.ts:3398-3401`) despite a real daemon tick of
the new seat.

The existing reincarnation test only covers a tick whose timestamp is after
the marker. It does not cover a tick that begins before the marker but lists
the descriptor after its publication. Write the fence before publishing a
replacement descriptor in both `unarchive()` and `revive()`, then add a
deterministic test for this ordering. The same observation also qualifies the
source claim that tie suppression can only cost a harmless stale read: it can
hide a real replacement tick.

## P1 - one machine and one wall clock do not provide the required ordering

The claimed clock assumption is insufficient. Production wires daemon
`ports.now` to `Date.now()` (`cli.ts:3933-3936`) and `forget()` defaults to
the same wall clock. Sharing that clock does not make it monotonic.

The original P1a returns if the wall clock moves backward between the daemon
stamp and the lifecycle marker:

1. The daemon records `tickAt = 10:00:00.000`, then snapshots the old seat.
2. NTP, a manual correction, or VM resume moves the realtime clock backward.
3. The seat dissolves and records `forgetAt = 09:59:55.000`.
4. The daemon publishes its old snapshot with `tickAt = 10:00:00.000`.

The marker is treated as inert (`forgetAt < tickAt`), so the departed seat
receives a live overlay. This directly contradicts the source comment's
claim that a backward step only causes extra suppression; in this ordering it
causes a false pass. A large forward step can also expire the newly written
marker during `forget()`'s hygiene pass before the stale tick publishes.

The protocol needs an ordering primitive that survives wall-clock adjustments,
such as serialization/revalidation or a persisted monotonic fence/generation.
`Date.now()` timestamps alone cannot provide it across independent processes.

## Independent evidence

The requested original P1a timeline is now covered under its stated clock
assumption, including the born-and-dissolved-inside-one-tick case. The
directory is retained, and a reachable reintroduced cleanup using the already
imported `rmSync` was killed by the named P1b criterion; this avoids the
previous missing-import/absorbed-`ReferenceError` mutant shape.

All reviewer mutation runs used `--expect`:

| Reviewer mutation | Required criterion | Result |
| --- | --- | --- |
| Change `marker.forgetAt >= tickAtMs` to equality only | `P1a: a tick republishing its PRE-DISSOLVE snapshot leaves no live stamp` | Killed |
| Cause a `registry.list()` before daemon `ports.now()` | `stamps tickAt BEFORE it reads the registry` | Killed with `expected 1 to be less than 0` |
| Reintroduce reachable directory removal with imported `rmSync` | `P1b: the sweep NEVER removes the marker directory` | Killed |

The recorded M13-M19 targets otherwise reference existing expressions or
imports; I found no second missing-symbol-inside-catch mutant shape. Focused
store, overlay, and daemon suites pass: 129 tests, 2 skipped.

`harness boot` typechecked successfully but its full test stage hit unrelated,
intermittent `ENOTEMPTY` cleanup failures outside this change. I recorded that
as harness difficulty `DL-002`.
