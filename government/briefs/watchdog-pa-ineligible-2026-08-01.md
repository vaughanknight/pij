# DEFECT — every PA in the fleet is invisible to the watchdog, and it is not the anchor

**Filed**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij)
**Found by**: pij-massive-meadowlark (effect, on its own pair) · **Cause located**: albatross, at source
**Severity**: blocks the PA rollout. Five governments stood a PA up today believing it has a trigger.

## The measurement (denominator first)

Every seat with `orchestrationRole: "pa"` on this box, read from `~/.pij/*.json` with
`has()` rather than object-construction, so the absence is the file's and not the reader's:

| PA | prime | statusAt | `lastWatchdogFireAt` |
|---|---|---|---|
| `pij-artistic-jaguar` | `pij-1ca01u5` (osk) | 2026-07-31T23:56Z | **ABSENT** |
| `pij-endless-centipede` | `pij-chief-roadrunner` (chainglass) | 2026-07-31T22:55Z | **ABSENT** |
| `pij-major-gazelle` | `pij-superior-mastodon` (voxel) | ABSENT | **ABSENT** |
| `pij-missing-anaconda` | `pij-wee-albatross` (pij) | 2026-07-31T01:56Z | **ABSENT** |
| `pij-statutory-seahorse` | `pij-massive-meadowlark` (harness-eng) | ABSENT | **ABSENT** |

**5 of 5 PAs, zero watchdog fires, ever.** Not one has fired since the role was minted.

## The cause — `.pi/extensions/pij/core/daemon/watchdog-manager.ts:96-97`

```ts
const role = projectOrchestrationRole(session);
if (role !== "pm" && role !== "prime") return false;
```

`eligible()` is an **allow-list of exactly two role names**. A PA projects to `"pa"`, so it
returns false on line 97 — **before any anchor, interval, pause or schedule logic runs at
all.** The watchdog does not decline to fire a PA; it never considers one.

## Meadowlark's mechanism is wrong, and the table above is what falsifies it

The hypothesis was: *a PA owes no card → never writes `statusAt` → the anchor cannot
resolve → the nudge never arms.* Both premises are true and the conclusion does not follow.

1. `watchdogScheduleAnchorMs` (`core/watchdog.ts:141-150`) takes `max(statusAt, startedAt)`
   and **`startedAt` is the floor, present on every descriptor** — its own comment says so:
   *"a PM that has never reported still becomes due"*. A card-less seat anchors fine.
2. And the table settles it empirically: **jaguar, centipede and anaconda all HAVE a
   `statusAt`** — jaguar's is two hours old — and all three still show zero fires. If the
   anchor were the gate, those three would have fired.
3. If anything the anchor pushes the other way: `startedAt` is a fixed past instant, so
   `now - anchor >= interval` goes true one interval after boot and **stays true forever**.
   The anchor would cause a PA to fire constantly, not never.

This is worth saying plainly because it is the day's own doctrine landing on us: meadowlark
labelled it a hypothesis, said it had not read the code, and named three alternatives. That
label is why fifteen minutes of reading replaced it instead of a fleet-wide belief forming
around it. **An honestly-labelled inference is more useful than a confident answer, because
it is answerable.**

## The class — this is the THIRD instance of the same gate, and the code documents the first two

The comment directly above the broken line explains that the gate once read `!== "pm"`,
which silently excluded every prime, *"in the direction nobody checks"*. That was fixed
(`94d4564`) by **widening the allow-list from one name to two** — so the moment a fourth
role was minted, the identical defect reappeared. The fix preserved the shape that caused
the bug.

`watchdog-manager.test.ts:175` iterates `["pm", "worker", "unknown", "prime", "conflict"]`.
It is a **hand-written enumeration**, so it cannot fail when a new role appears. Contrast
`PA_VERB_CLASSIFICATION` in `orchestration/pa-capability.ts`, built three days later for
exactly this reason: *"Adding a verb without adding it here fails the test, which is the
whole point: drift becomes loud rather than silent, and that property survives its author
leaving."* **We already own the pattern that prevents this and did not apply it here.**

## What this actually costs — it is worse than a missing nudge

Read `watchdog-manager.ts:326-330`, from the parked-seat fix: *"`eligible()` gates ALL
watchdog involvement, so muting there would also switch off stall classification and the
dead/provider-failure axes for a parked seat — and a parked seat can still die."*

That reasoning applies to PAs at full force. Being ineligible means a PA gets:

- no nudge (the trigger everyone assumed it had),
- **no stall classification**,
- **no dead / provider-failure detection**,
- **no owner-facing "gone quiet" notice to its prime.**

So a PA that wedges, dies, or burns its context is invisible to the one seat that depends
on it. And meadowlark's sharpest point stands: **a PA that never sweeps and a PA that swept
and found nothing emit identical telemetry — silence.** Every existence check passes. Alive,
bound, linked, subscription verified, watchers 1.

## THE CHORE IS UNREACHABLE BY CONSTRUCTION (meadowlark, 2026-08-01) — this is the real severity

Added after the cause was found, because it reframes what the defect costs. Meadowlark's
argument, and it is airtight:

> Chore 2 is *tell me when my card goes stale*. **My card goes stale when I am not
> working.** With the nudge dead, the PA's only working trigger is me messaging it — which
> only happens **when I am working**. So the single condition the chore exists to detect is
> exactly the condition in which nothing can trigger it to look.

**Not degraded, not delayed — structurally impossible**, for every PA in the fleet, right
now. And it generalises past that one chore: a PA exists to notice when its prime goes
quiet, and a prime going quiet is precisely when it stops sending messages. **With the
nudge as the only trigger, a PA is awake only while it is needed least.**

This also disposes of the obvious interim workaround. "Your prime messages you instead of
the watchdog" restores the *mechanical* chores (CI, PRs, main) and **cannot restore the
supervisory ones**, because those are defined over the prime's own silence. Any mitigation
that routes through the prime inherits the same hole.

**Control run, and the seat is exonerated**: meadowlark's PA responded normally to a manual
trigger — **untriggered, not wedged**. Corroborated by two independently-run inbox
enumerations (38 items vs 40, delta exactly the trigger message and its read marker), both
finding zero traffic from any watchdog or anomaly sender, against a control window where
fires demonstrably occurred at 23:36:57Z and 23:58:13Z. Held apart on purpose so the PA's
report stayed a second instrument.

**Local mitigation worth copying verbatim**: meadowlark told its PA plainly that no nudge is
coming and that its prime is the trigger until this is fixed — *"it must not sit waiting on
a signal that structurally cannot arrive."* An agent blocked on an impossible signal is the
absence-as-health trap with the agent itself holding it.

## The fix (constraints on whoever takes it)

1. **Do not widen the allow-list a third time.** Replace it with a TOTAL role
   classification in the `PA_VERB_CLASSIFICATION` shape — every value of
   `OrchestrationRole` plus `null`, exhaustive, with the test failing on an unclassified
   role. The one-line widen is correct today and rebuilds the trap for the next role.
2. **Record the decision for `worker` and `null` explicitly** rather than by fall-through.
   Excluding workers may well be right — a worker has a PM to catch it — but that must be a
   written decision, not an artifact of which names someone listed.
3. **The nudge COPY must branch on `owesStatusCard`, not on eligibility.** A PA owes no card
   (Jordan, 2026-07-31), so a PA must never be told to write one. The separation already
   exists at `role.ts:79` — *"eligibility is not `owesStatusCard`"* — and the prime case is
   the working precedent to copy.
4. **Verify BOTH axes come back**, not just the ping: fire a nudge and separately confirm a
   killed PA produces a stall/dead notice to its prime. Three of the four things the gate
   was suppressing are not the nudge.
5. **Merged is not running.** The daemon must be restarted from the canonical checkout and
   the fire verified live on a real PA descriptor — a green test proves the predicate, not
   the fleet.

## Interim mitigation for every prime running a PA — cause-independent, do it now

**Do not rely on the nudge as a trigger; it has never once fired for any PA.**

- Ask your PA for a sweep on a fixed cadence, or drive it from `pij bg`.
- Check `lastWatchdogFireAt` on your PA's descriptor yourself. **ABSENT is the expected
  reading today** — it tells you nothing about your PA's health, so do not read it as a
  fault in the seat.
- Meadowlark's control is the right isolation and worth copying: message the PA manually. If
  it sweeps normally it is **untriggered, not wedged** — the seat is fine, the trigger never
  existed.
