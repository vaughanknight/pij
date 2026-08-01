# PROPOSAL — `pij chore`: a first-class change-detector + duty roster for PAs

**Filed**: 2026-08-02 · **By**: pij-wee-albatross (o-prime) · **Proposed by**: Jordan, in
conversation, from the PA value survey's convergent findings · **Status**: LOGGED, NOT STARTED

## Jordan's framing (near-verbatim)

> "a first class pij command that just goes 'no change' or 'these changes' — then later we can
> add more chores in there too, which can double up with helping PA to remember to do jobs"

## What it is

A verb family that turns the sweep from model-work into tool-work:

```
pij chore add <name> --probe '<cmd>' [--full '<cmd>'] [--full-every N]
pij chore run [--dry]        # run every probe, diff vs stored fingerprint
pij chore list               # duty roster: chore, last run, last delta
pij chore ack <name>         # advance the baseline AFTER the delta was relayed
pij chore remove <name>
```

`chore run` prints either `NO CHANGE — 7 chores probed, 0 moved` or per-chore
`CHANGED <name>: <old> → <new>` lines plus the unchanged list. Fingerprints persist per-seat
(e.g. `~/.pij/<seat>/chores.json`).

## Why first-class, not a PA-side script — the survey evidence

1. **Kills composed receipts by construction.** Survey measured 28/28 clean on
   instrument-pointed chores vs 0/2 on transcription chores (marlin ×2, centipede ×2,
   gazelle's Z-label near-miss). If the tool computes the diff, the PA can only classify and
   relay output it cannot have invented. Damselfly's law — "point a cheap seat at instruments,
   never make it BE one" — enforced, not advised.
2. **The registry IS the PA's durable memory.** Today the duty roster lives in model context
   and dies with compaction/death/revive, and drifts under message-amendments. A registered
   roster survives all three; a revived PA runs `chore list` and inherits everything; the
   prime can INSPECT what its PA actually checks instead of trusting a briefing stuck.
3. **The baseline becomes inspectable — fixes delta-blindness.** Seahorse reported a truthful
   "0 deltas" for ~10h over 3 red PRs because reds present at briefing became silent baseline.
   Here the fingerprint store is readable, and `--full-every N` implements meadowlark's
   periodic absolute-state report at the platform level.
4. **Denominators for free** — "7 probed, 0 moved" is recipe rule 10's
   positive-heartbeat-with-a-denominator, emitted by the tool.
5. **Kills the frozen-board burn without touching the interval** — gazelle's ~1218 prem /
   1 true finding, ~50 of 72 empty sweeps → one-line ticks. The interval (death-detection
   window, capture sampling rate, and Jordan's three-government cadence comparison) is
   untouched.

## Design points to settle before dispatch

- **Baseline advance semantics**: `chore run` must NOT auto-commit the new fingerprint, or a
  delta the PA fails to relay is lost forever (next run reads "no change"). A delta stays OPEN
  until `chore ack` — snooze-vs-resolution doctrine at the platform layer. `--dry` for probes
  with no state change at all.
- **Probe commands are arbitrary shell** run as the seat's own user — no new privilege (the PA
  already runs commands), but the roster file inherits the sidecar problem: who may edit whose
  roster? Default: the seat itself plus its watchers/prime. Role `pa` must be able to run and
  ack its OWN chores (do not repeat the watchdog-verb-family gap).
- **Fingerprint = superset signal**: each probe's output must be unable to stay identical while
  the guarded thing changes (commit hash, PR number+mergeable set, anomaly count, card
  statusAt). Document this as the probe-authoring rule.
- **Verify by driving it**: register a chore, mutate the watched thing, assert `chore run`
  reports the delta, assert un-acked deltas re-surface, assert `NO CHANGE` after ack — not by
  reading the diff code.

## Relation to /builder chores — adjacent, NOT the same primitive (Jordan, 2026-08-02)

Jordan: chores here and chores in `/builder` are "adjacent, but not replacing — chores in
builder are more like gates." Pinned so nobody builds one on the other's machinery:

| | /builder chore | pij chore |
|---|---|---|
| anchored to | a NODE in a finite flight plan | a SEAT |
| fires | positionally, when `nav` arrives (`orient` → `due_chores`) | on a cadence, forever |
| resolves | ONCE — `done` + receipt, or human's two-call decline | never — `ack` advances a baseline, completes nothing |
| purpose | make a quality step un-skippable on a journey (GATE) | notice change nobody is watching (SENSOR) |
| motto | "do this before you pass here" | "keep checking this; tell me when it moves" |

**Shared DNA (why they rhyme):** both move the duty roster out of model context into a durable
store; both surface mechanically, not by recall; both make the RECORD the arbiter of whether
work happened. Builder's unresolved chore blocks nav; pij's un-acked delta re-surfaces. Same
doctrine, two tenses.

**Borrow from builder's field-tested model:**
1. **"Un-run, not absent"** — a failing probe reports `NOT-PROBEABLE`, never silently drops
   from the roster (mastodon's PA proved this is where the value hides).
2. **Mandatory-for-agent, declinable-only-by-human** — a PA never skips a registered chore by
   its own judgment; only the prime removes one, and removal is a recorded event.
3. **Receipt-first decline** — dropping a chore writes the reason into the record BEFORE the
   status changes.

## Relations

- Answers the survey's #1 convergent ask (change-detector: mastodon, damselfly, meadowlark
  independently) and #2 (periodic full-state: meadowlark) in one primitive.
- Complements, does not replace, the PA watchdog verb grant (separate open ruling).
- `marlin`'s `sweep.log` + "no delta vs 08:46" pattern is the field-embryo of this design.
