# Findings — plan 111 anti-step-on

Honest record, instrument failures included. Appended as work lands.

## Carried into composition (ph-1112), before any live smoke

**F-1111 — a claude seat parked at the folder-trust modal publishes a live socket but NO
session record.** Source: pij-dominant-vicuna (o-prime), 2026-08-31, from plan 110's live
findings. Consequence for our smoke test: a smoke recipient that reads as *unreachable* may
be sitting at the trust modal, not suffering a transport fault. **Capture the pane before
diagnosing transport** — otherwise the nearest signal (unreachable) gets mistaken for the
fact (transport broken), and the smoke produces a false negative about our gate.

## Known limits to state, not paper over

**F-1112 — `permits_injection_fresh` is fresh in its COMPOSER half only.** Its tap half is
tick-derived: `drain_pane_tap` is destructive and owned by the observer loop, so the fresh
path must not drain it. Ruled at the PM ack (O4, accepted). The staleness window shrinks from
the observer interval to capture-to-inject; it is bounded, not eliminated. Do not claim zero.

**F-1113 — the fresh path costs two tmux round-trips per gated send, one of them fleet-wide.**
Cursor coordinates come from `TmuxPort::list_panes()`, which takes no filter and enumerates
every pane on the machine. Accepted as a cost, recorded rather than hidden. Cache or scope
only if measurement forces it.

## Instrument failures (recorded, not swallowed)

**F-1114 — both wave-1 omp coders could not post a status card before adoption.**
pij-extensive-echidna (u-gate) and pij-scrawny-crawdad (u-observer), 2026-08-31, independently:
the first `pij report now` failed, and each had to adopt its OMP pane before it could report.
Two for two on freshly spawned omp seats. This is the same pre-bind/registration window PRD
req-0003 already tracks (its third face: omp seats that cannot register at birth). Recorded
here as a second and third data point for whoever owns that row — not diagnosed by us, and
not a defect in this plan's work.

**F-1115 — the fan-out rationale was wrong: u-gate could not compile without the seam.**
Raised by pij-extensive-echidna at its ACK. The impl-guide's fan-out says "neither reads the
other's unfinished code", which is true but assumed u-gate could BUILD without
`composer_region` existing. It cannot: `permits_injection_fresh` is a non-test public method,
and a test-only double cannot satisfy the pij-gate build. Resolved WITHOUT a stub — a
production placeholder returning `Unrecognized` would have been a fleet-wide conservative veto
that turns no test red if the real extraction never lands. Instead: u-gate splits at the seam
(idle expiry + self-echo now, carrying ac-1111/1112/1113 and both mutation proofs), and
u-observer lands the real extracted `composer_region` as its first push, which releases the
blocked third. Wave 1 stays parallel in its valuable half.
