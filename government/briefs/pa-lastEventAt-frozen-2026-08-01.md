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

**This seat's activity does not advance `lastEventAt`.** It reads its inbox, runs sweeps, and
replies — none of which registers. So `eventAdvanced` is permanently false,
`consecutiveSilentFires` climbs without bound, and the seat is pinned at `stalled` **for as long
as it keeps working correctly.**

## 🔴 SECOND CORRECTION — THE FIELD IS NOT FROZEN. IT IS SAMPLED, AND SHORT BURSTS ARE MISSED.

The mechanism section above is **wrong**, and the test that killed it took 40 seconds: I sent the
seat a message and sampled its pane every 2 seconds.

```
tick 4: BUSY marker MATCHED — "esc interrupt"
lastEventAt after: 2026-08-01T08:29:11.393Z   (was frozen at 05:49 for 160 minutes)
```

**The pane DOES render a `BUSY_RE`-matching marker when the seat works, and `lastEventAt` DOES
advance.** Nothing is broken in the path I described.

**The real shape is a SAMPLING ALIAS.** `daemon.ts:568` refreshes `lastEventAt` only when the
daemon's tick observes the pane changing *while the derived state is `working`*. A seat whose
duty cycle is **a short burst inside a long idle** — a PA sweeping for seconds once per 20-minute
interval — can have every burst fall between samples. It is then indistinguishable from a dead
seat, **not because the field cannot advance, but because nobody was looking when it did.**

That also explains the spread I misread as a role property: 4 / 9 / 29 / 82 / 109 minutes is not
two populations, it is **one distribution of luck**.

**So the surviving defect is narrower and different in kind**: liveness is inferred from a
*sampled* signal with no allowance for bursty duty cycles, and the escalation ladder
(`responsive → suspect → stalled`) treats consecutive misses as evidence. A fix must credit
something that persists between samples — inbox reads, outbound sends, the seat's own transcript
advancing — rather than requiring the daemon to catch a burst in the act.

**Two corrections to one brief in one hour, both mine, both from generalising a single
observation.** The first (role) died to comparing seats; the second (frozen field) died to
changing the input. Neither needed a source read to falsify — only an experiment.

## SCOPE CORRECTION — THIS IS NOT "PAs", AND MY FIRST FILING SAID IT WAS

I filed this as *"a PA's activity never advances `lastEventAt`"*. **Measured across every PA and
one PM, that is false:**

| seat | harness | role | `lastEventAt` age |
|---|---|---|---|
| `pij-missing-anaconda` | copilot | pa | **109 min** ← the only frozen one |
| `pij-endless-centipede` | copilot | pa | 82 min |
| `pij-statutory-seahorse` | copilot | pa | 29 min |
| `pij-major-gazelle` | copilot | pa | **9 min — fresh** |
| `pij-artistic-jaguar` | claude | pa | **4 min — fresh** |
| `pij-unwilling-butterfly` | copilot | pm | **0 min — fresh** |

**It follows neither ROLE nor HARNESS.** Copilot PAs appear both fresh and stale; a copilot PM
is fresh; a claude PA is fresh. So the generalisation is dead and **the defect is currently
scoped to one seat**, with `pij-endless-centipede` a possible second instance and the middle rows
plausibly just idle.

**Recorded as an error of mine, and the third of the same kind in one night**: I measured one
seat, reached for the population I had been thinking about (*"PAs"*), and filed it as a property
of the role. The correct next step is the one that falsified it — *change the input and observe
the output*, i.e. compare seats that differ on the axes you are proposing.

**What survives, and it is still worth fixing**: one seat is demonstrably alive, working, and
pinned at `stalled`, and each fire writes a capture. **The consequences below hold for that seat
regardless of how many others share the cause** — but nobody should build a fix for "PAs" on
this evidence.

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
