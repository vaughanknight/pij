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
