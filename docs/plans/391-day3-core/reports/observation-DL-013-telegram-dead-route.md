# DL-013 — Telegram bridge routes bare human text to a dead seat; message strands forever

**When**: 2026-08-27T21:01:26Z (seq 4231). **Observed by**: pij-associated-louse (s391), on Vaughan's report "i talk via telegram and dont get responses".

**Facts** (queue `~/.pij/queue/pij.sqlite`, `messages`+`deliveries`):
- 4216 21:59:24Z pij-telegram → pij-associated-louse — acked (the one message that reached a live seat).
- 4231 21:01:26Z pij-telegram → **pij-icy-jernau** — `queued`, never delivered. Target is an s392 seat, **dead since 20:12:02Z** (`pid-missing`). Body: "suspect things stalled a lot overnight the progress is slow".
- Daemon pane shows only `→ pij-icy-jernau` for the route — no liveness check, no "target dead" line, no fallback, no bounce to the operator.
- Routing rule (README § Telegram bridge): bare text follows "the last session whose non-receipt bubble successfully reached that chat"; swipe-reply → the bubble's sender. Neither path checks that the session is still alive; `match.ts resolveTarget` orders by `lastEventAt` but takes whatever descriptor list it is given.

**Effect**: the human's message strands on a dead inbox with zero feedback in either direction; the human concludes "nobody answers".

**Encode candidates** (o-prime's call):
1. Bridge: before routing inbound, drop dead/closed sessions from the candidate set; if the followed/swiped session is dead, bounce a bubble "pij-X is dead — swipe-reply a live session or prefix an id" and route to the effective prime instead of queueing.
2. Daemon: a `queued` row whose recipient is terminal should be retired-with-notice (item 1's `retireForClosedRecipients` covers *closed*; check it covers `dead`/pid-missing) and the sender (pij-telegram) told, so the bridge can echo it.
3. Operator-facing: `pij anomalies` row for "human message stranded on dead seat".

**Interim**: I answered Vaughan on Telegram (bubble from this seat, so bare text now follows me) and forwarded his question verbatim to the o-prime. Row 4231 left untouched (s392 inbox, not mine to retire).
