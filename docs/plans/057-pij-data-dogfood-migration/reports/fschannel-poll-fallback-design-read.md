# FsChannel prod poll-fallback — design read (STUB, constraints locked)

**Status**: NOT STARTED — sequenced after DL-004 test surgery. o-prime
deconfliction required before implement (touches every delivery path).
**Origin**: the flake chase — a test that would not stay green pointed at the
observation substrate itself. channel.ts:7,67 self-documents fs.watch drops
"notably while a session is busy" = production conditions on the busiest seats.

## o-prime constraints (dove, 2026-07-19 — locked, the read starts here)

- **(A) Health-signal coupling**: the watcher-miss counter FEEDS the anomaly
  evaluator, not just daemon status — a starving watcher must be
  distinguishable from genuinely-idle AND falsely-working; the miss-counter is
  the ground truth that stops the evaluator guessing. Design the seam between
  them (or the pair together).
- **(B) Poll scope**: LIVE BOUND seats only — naive poll over ~1395
  never-reaped descriptors is the cost trap; the measured poll cost becomes one
  more argument for the reaping work (Stream-3).
- **(C) Latency ceiling, chosen not inherited**: worst case = a watch-missed
  event surfaces within ≤ poll-interval; the design STATES the interval as the
  honest delivery-latency ceiling under load.

## Facts already in hand

- Hybrid watch+poll is likely safe by construction: FsChannel already dedupes
  by message id and debounces bursts (channel.ts:8-9) — poll doubles collapse.
- `pollMs` + `watchFactory` seams exist (built for tests/telegram); promotion,
  not invention.
- Symptom cluster this may root: stale-tick reports, queued-but-not-processed,
  held-vs-swallowed ambiguity (dove's prime-feedback triage).

## Open questions for the read

1. Poll cadence vs (C)'s ceiling vs (B)'s fleet cost — one number, justified.
2. Miss-detection mechanism: how does the channel KNOW watch missed (poll finds
   unseen id → increment; is that sufficient ground truth for (A)?).
3. Failure isolation: watcher death vs slow-drops — same signal or two?
4. Restart-rider packaging: rides with what window, verified how live.
