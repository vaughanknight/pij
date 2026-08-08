# `#125` — what actually advances `lastEventAt`

**Stream**: `silent-detectors` (s097) · **Author**: `pij-annual-lemur` · **Date**: 2026-08-08
**Status**: **RESOLVED** — mechanism identified in source *and* corroborated by measurement.
**Deliverable type**: findings only. **No patch**, per the prime's ruling and the issue's own
instruction.

> `#125`, closing note: *"go read the emitter, and do not trust any mechanism stated above —
> including the best-supported one."*

That instruction was followed literally. Nothing below is asserted that was not either read in
the source or measured.

---

## 1. Answer

**`lastEventAt` has three writers, and none of them means "this seat did work".**

| # | writer | `file:line` | when it fires |
|---|---|---|---|
| 1 | `observeActivity` | `core/daemon/loop.ts:158-176` | **the daemon**, on its ~600ms tick, whenever it observes the seat's tmux pane readiness as **`busy`** — throttled to at most once per `ACTIVITY_REFRESH_MS = 10_000` (`loop.ts:143`) |
| 2 | `stampSenderActivity` | `core/cli.ts:2166-2183` | after a **successful outbound `pij send`**, stamping the **sender** |
| 3 | `PijSession.capture` | `core/session.ts:531-537` | the **in-process pi receiver**, on every captured pi-activity event |

**Writer 1 dominates for every tmux-resident seat**, and it is the one the issue's samples were
seeing. The load-bearing line:

```ts
// core/daemon/loop.ts
const ACTIVITY_REFRESH_MS = 10_000;

export function observeActivity(descriptor, readiness, nowMs): SessionDescriptor | null {
    if (readiness !== "busy" && readiness !== "ready") return null;
    const state: "working" | "idle" = readiness === "busy" ? "working" : "idle";
    let lastEventAt = descriptor.lastEventAt;
    if (readiness === "busy") {
        const ageMs = lastEventAt ? nowMs - Date.parse(lastEventAt) : Number.POSITIVE_INFINITY;
        if (ageMs >= ACTIVITY_REFRESH_MS) lastEventAt = new Date(nowMs).toISOString();
    }
    ...
}
```

**In one sentence**: `lastEventAt` records *"the daemon saw this seat's pane busy within the last
~10 seconds"* — an **observation of a terminal pane by a third party**, not a record of work, not
a turn boundary, and not an event the seat emitted.

## 2. The four candidates in `#125`, adjudicated

| candidate | verdict | why |
|---|---|---|
| **(1)** any `pij` read emits telemetry | **refuted** — the issue was right | no read path writes. Only `send` writes (writer 2), and it is explicitly a *send*-side stamp. The issue's own refutation (`pij whoami` left the value byte-identical) is exactly what the source predicts. |
| **(2)** only a turn boundary advances it; it equals turn start | **refuted** — the issue was right | writer 1 is a throttled **wall-clock** refresh with no knowledge of turns. The three samples that "each equalled a turn start to the millisecond" were coincidence: a turn start makes the pane busy, and the first post-idle refresh therefore lands near it. |
| **(3)** periodic heartbeat ~10–12s | **correct as to period, misleading as to name** | the period is real and is `ACTIVITY_REFRESH_MS = 10_000` plus daemon-tick jitter. But "heartbeat" implies *process liveness*, and this tick **stops entirely** when the pane is not busy. It is not a heartbeat. |
| **(4)** heartbeat gated on the system axis | **closest to correct, and now refined** | the *correlation* it predicts is real, but the causality is not gating. `observeActivity` derives `state` **and** the refresh from the **same** input (`readiness`): `busy` → `state:"working"` **and** refresh. `lastEventAt` is not gated *on* the system axis — **the two are siblings computed from one source.** |

**The refinement on (4) matters** for anything that reasons about the pair: they cannot disagree
in the way an independent gate could, and neither corroborates the other. They are one
measurement reported twice.

## 3. Measurement — 27 seats, 933 samples, 5s cadence

A fixed-cadence sampler polled `pij list --json` every 5s across every live seat, recording
`lastEventAt` against wall clock. **No work was performed in any observed seat by the sampler**;
seats were doing whatever they were already doing.

**Result — a perfect split on the activity axis:**

| cohort | seats | advancements over ~197s | observed deltas |
|---|---|---|---|
| `activity = working` | 13 | 13–17 each | **10.7 – 15.2s** |
| `activity = done` / `idle` | 13 | **0** | — |
| `working` but frozen | 1 (`pij-weak-gurgeh`) | **0** | — |

- The `working` cohort's deltas cluster tightly around the predicted 10s throttle plus tick
  jitter, matching `ACTIVITY_REFRESH_MS` and the issue's independent 9.5s / 11.8–12.1s samples.
- **Every `done`/`idle` seat advanced exactly zero times over 197 seconds.** This is the decisive
  observation: a pure process-level heartbeat is impossible, and it is the direct explanation of
  the `pij-missing-anaconda` counter-example that `#125` filed as unexplained (*live, and 83
  minutes stale*) — anaconda was `idle`/`done`, so writer 1 never fired.
- **`pij-weak-gurgeh` reads `working` with zero advancement**, which looks like a contradiction
  and is not: `observeActivity` returns `null` unless readiness is `busy`/`ready`, so a
  descriptor whose `state` froze at `working` (pane gone, seat not tmux-resident, or the daemon
  no longer observing it) **keeps a stale `working` forever with no refresh**. That is precisely
  the `#141` `pij-unwilling-butterfly` shape, independently reproduced here.

## 4. Consequence for `#125`'s own claim — **confirmed, with mechanism**

> Responding to the sensor satisfies the sensor's own activity test.

**True, and now provable rather than observed.** `status-stale` gate 1 (`anomalies.ts:402`):

```ts
if (inputs.nowMs - lastEventMs > statusStaleMs) continue;   // "only judge a seat busy RIGHT NOW"
```

A seat cannot answer the row without taking a turn; taking a turn makes its pane `busy`; the
daemon refreshes `lastEventAt` within ~10s. **Answering the row therefore guarantees the seat
remains inside gate 1.** The three-turns-of-pure-compliance trace in `#125` is the expected
behaviour of this code, not an anomaly in it.

Note what gate 1's comment *claims*: *"Only judge a seat that is busy RIGHT NOW."* Given writer
1, what it actually selects is **"a seat whose pane the daemon observed as busy in the last 30
minutes"** — which includes a seat doing nothing but draining a nudge queue.

## 5. Consequence for `#141` — **strengthened, and its wording must change**

This is the finding the prime asked to hear before Phase 2 is implemented.

`#141` proposes labelling a stale card as **discipline** (working, not reporting) when
`lastEventAt` is fresh. **`lastEventAt` cannot support that label.** It does not measure work; it
measures pane busy-ness, which a seat exhibits while *draining nudges* just as much as while
working.

**`#141` already contains the proof, and did not know it was one:**

> The *"last event 8 seconds ago"* used to justify the discipline reading was **the seat draining
> that queue.**

That misdiagnosis was not a reading error. It is what this field does. **The issue's remedy is
therefore more right than its reasoning** — `consecutiveSilentFires` is the correct disambiguator
*precisely because* `lastEventAt` is pane-derived and structurally cannot separate work from
drain.

**Adjustment carried into Phase 2**: the row must not assert *discipline*. Unanswered nudges
support **availability** positively (the watchdog's own data, unaffected by whether the seat can
report). Answered nudges support only *"the seat is reachable and its pane has been busy"* —
which is **not** the same as "it is working and choosing not to report", and the row must not say
that it is. Claiming discipline from this field would re-commit the exact error `#141` documents.

## 6. Consequence for `#115` — explained

`#115` reports `lastEventAt` reading `null` while a transcript shows completed turns. All three
writers explain it: a seat that is not tmux-resident (writer 1 never observes it), has sent
nothing (writer 2), and is not an in-process pi receiver (writer 3) **writes the field never** —
however many turns its harness actually took. The field is **pij's observation of a pane**, not
the agent's transcript. Not a bug in the emitter; a mis-set expectation of what it emits.

## 7. Why five seats produced five mechanisms

**There are genuinely three writers with different trigger conditions**, and which one a seat
observes depends on what kind of seat it is and what it was doing. Every one of the five earlier
mechanisms was a locally-valid generalisation of one write path, tested against samples drawn
from a seat where that path happened to dominate. The disagreement was not carelessness — it was
**five correct partial observations of a three-writer system**, each stated as though it were the
whole.

The general lesson, which is the same shape as this stream's other four issues: **a field with
multiple writers cannot be characterised from one seat's samples**, and the confidence a clean
sample series produces is not evidence about the writers you did not sample.

## 8. Open

- **Not measured**: the relative frequency of writers 2 and 3 in the field. Writer 1's dominance
  for tmux seats is established; the mix for non-tmux seats is not, and no claim is made.
- **Recommended, not filed here**: `lastEventAt` is a poor name for "pane observed busy". Any
  rename is a `core/state.ts` / `core/platform/types.ts` change and belongs to stream `s095`, not
  this one.
- **Filed separately**: the park-predicate divergence at `anomalies.ts:406` vs
  `mutesWatchdogNudge` (see the plan, § F-3) — unrelated to `lastEventAt`, found alongside it.

## Reproduction

```bash
# sampler: every live seat, 5s cadence, no work induced in the observed seats
pij list --json | jq -r '.[] | select(.liveness=="active")
                          | [.id, .lastEventAt, .activity] | @tsv'
```

Raw samples for this run: `/tmp/s097/lastevent-samples.tsv` (933 rows, 27 seats). The source
citations in § 1 are the durable evidence; the samples corroborate and do not carry the argument
alone.
