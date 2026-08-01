# DEFECT — a working PA is classified `stalled` forever, because its activity never advances `lastEventAt`

**Filed**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij) · **Status**: FILED, NOT STARTED
**Surfaced by**: the seat it is about — `pij-missing-anaconda`, my own PA, within two hours of
PR #71 making PA watchdogs work at all.

## The observation

| | |
|---|---|
| classification | **`stalled`** (escalated from `suspect` after consecutive silent fires) |
| process | **ALIVE**, pid 84718, up 48h |
| `state` | `idle` (at a ready prompt) |
| `lastEventAt` | **`2026-08-01T05:49:17.486Z` — frozen for 100 minutes** |
| actual work in that window | **sweeps 9 and 10 completed; nudges 5, 6 and 7 all answered** |

The seat is doing exactly what its brief asks, with the heartbeat discipline rule 10 demands:

> *"Swept 3 open PRs (3 green, 0 red, 0 conflict), 5 main branch runs (0 red, 5 completed
> green), 1 prime card (fresh)…"*

**A cheap flash-tier seat producing positive-heartbeat-with-a-denominator, unprompted, every
cycle — and the instrument reads it as dead.**

## The mechanism

`WatchdogManager.reconcileSession` derives `eventAdvanced` from
`session.lastEventAt !== state.lastEventAt`, and `evaluateResponse` escalates
`responsive → suspect → stalled` on consecutive fires with no observed advance.

**The PA's activity does not advance `lastEventAt`.** It reads its inbox, runs sweeps, and
replies — none of which registers. So `eventAdvanced` is permanently false, `consecutiveSilentFires`
climbs without bound, and the seat is pinned at `stalled` **for as long as it keeps working
correctly.**

## Why it matters more than a noisy label

1. **It is unfalsifiable in the dangerous direction.** A healthy PA and a genuinely dead PA now
   produce **identical** classifications. The supervision #71 restored is, for this role,
   returning a constant — and a detector that always fires carries no information.
2. **Every fire writes a capture.** At a 20-minute interval that is ~72 disclosure events per
   day per PA, generated entirely by a false alarm. My own directory is accumulating from this
   and nothing else.
3. **It will teach the fleet to discount the instrument**, which is the failure mode this
   government has spent a week naming — and it will do so on the *first* week PA supervision
   has ever worked.

## Second, smaller defect in the same traffic — the nudge copy has the wrong AUDIENCE

The nudge delivered to a **PA** reads:

> *"You do NOT owe a status card — **a prime reports to its human in-pane**, so a card there
> duplicates a richer channel."*

Two things wrong: the **retired ruling** (Jordan reversed it 2026-07-31; PR #72 fixes that half),
and the **audience** — `owesStatusCard` is false for a PA, so a PA falls into the card-less arm
whose prose was written for primes. **#72 does not fix the audience half.** A PA is being told
why a *prime* owes no card.

## What NOT to do

- **Do not pause or exempt the PA to quiet it.** That trades a supervision leg for silence and
  is the unbounded-silencer move ruled against 2026-08-01.
- **Do not widen the interval to reduce noise.** Interval is also the death-detection window and
  the capture sampling rate.

## Fix shape (unstarted, wants arguing)

The honest question is **what counts as evidence of life for a seat whose work is neither a pij
event nor a card.** Candidates: credit inbox reads or outbound sends as activity; derive
liveness from the pane signature the watchdog already captures; or give the PA an explicit
heartbeat verb. **Whichever is chosen, verify it by driving a real PA through several cycles and
asserting the classification stays `responsive`** — not by reading the predicate.
