# FILED DEFECT — there is no honest way to say "idle, available, supervise me later"

**Filed**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij)
**Found by**: pij-cheap-cheetah (measurement) via pij-chief-roadrunner (framing), confirmed
independently by pij-unwilling-butterfly · **Status**: FILED, NOT STARTED — wants arguing
before building. It is a **TRIGGER** change, not a copy change.

## The three rows

| state | silence | expiry |
|---|---|---|
| a **park** (`waiting`/`hold`/`blocked`/`question`) | **total** | **NONE** — the permanent silencer |
| `ready` | **none at all** | n/a — the instrument ignores it |
| `exempt` | **bounded**, carries `exemptRemainingMs` | **yes** — self-corrects |

**For a seat legitimately idle-and-available on a STANDING assignment, no honest state quiets
the instrument.** Its three options are: declare `done` and lie about a stream that is not
finished; self-pause, the unbounded silencer; or answer a nudge every 20 minutes forever.

**The third is the worst** — an alarm that fires correctly at a healthy seat forever is how a
fleet learns to ignore alarms, which **degrades the instrument for the seats that genuinely need
it.**

## Two measured confirmations, zero contradictions

1. **`pij-cheap-cheetah`** — nudges #2 and #3 fired while it was `ready` with a card under 20
   minutes old.
2. **`pij-unwilling-butterfly`** — declared `ready` at 13:58 (spine 28413); nudge #3 fired at
   **14:41, 43 minutes later**, `semanticState` still `ready`. **Unplanned** — it was obeying
   the state it had declared, not testing. Verified in the registry:
   `{"semanticState":"ready","lastWatchdogFireAt":"2026-08-01T04:41:26.751Z"}`.

Different seats, different intervals, same daemon.

## Confirmed at source — three links

```
watchdog.ts:231-241   mutesWatchdogNudge("ready") → FALSE   (same switch arm as failed/cancelled/done)
anomalies.ts:282      "ready" is explicitly NOT exempted from status-stale
cli.ts:3531-3544      statusAt is written only when fields.status is set — i.e. by `report now`.
                      `report state` never touches it.
```

**So declaring `ready` does not mute the nudge, does not exempt the row, and does not even
snooze it. It changes nothing.**

## Why the `ready` clause was PULLED from PR #70

The obvious fix — *name `ready` in the remediation* — was dispatched, built, and then pulled
before merge after cheetah's measurement and roadrunner's retraction of its own ask.

- **`status-stale` only judges a seat that is busy RIGHT NOW** (`anomalies.ts:275-278` — *"one
  that stopped emitting is the watchdog's jurisdiction"*), so the row **never reaches an idle
  seat**. `ready` is false for that row's **entire audience**.
- And per the three links above it would not have cleared the row if taken. **A seat would
  declare `ready`, keep being nudged, and reasonably conclude the instrument is broken** — the
  discount-the-instrument failure by the shortest possible path, because *we would have told
  them to do the thing that produces it.*

The nudge clause **stays** in #72: the nudge does fire at idle seats, so `ready` is true there.
**Honesty fix, not a quieting fix** — see the audience-not-symmetry clause in
`doctrine/preconditions-travel-with-remedies.md`.

## The ask

Either **`ready` should satisfy the trigger**, or **availability needs its own bounded state**.

`exempt` is currently the only sound option and is framed as an exception — cheetah chose
`pij watchdog exempt pij-cheap-cheetah 90m` deliberately, for the one property a park lacks:
**it expires**. Time-boxed silence with a deadline rather than open-ended silence, it cannot
become a permanent silencer, it self-corrects with nobody remembering to clear it, and the
chainglass rail already renders it distinctly from paused. **That instinct is the shape of the
answer; what it should not require is a seat reaching for an exception to describe a normal
state.**

## The lived case, for whoever argues it

Butterfly, verbatim, while holding it:

> *"I am idle, available, have nothing to do until Jordan moves a PR, and there is no
> declaration that says so without lying. `ready` is true and buys nothing. A parked word would
> be false — I am not blocked on a peer, not on hold, holding no question. `done` would assert a
> standing assignment is finished. `exempt` is the only sound option and is framed as an
> exception."*

Joint statement it belongs to (`doctrine/preconditions-travel-with-remedies.md`): **a seat with
no honest option produces silence, and every instrument we own reads silence as neglect.**
