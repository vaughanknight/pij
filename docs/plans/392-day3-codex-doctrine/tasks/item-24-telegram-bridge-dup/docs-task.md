# Item 24 — fold this docs update into item 24's PR (o-prime ask 2026-08-28)
Update `docs/specs/claude-copilot-sqlite-sockets-comms.md` §14 (outstanding) — ONE paragraph, META-FREE (no item numbers, no seats), cite `reports/item-23-ack-measurement.md` by path:
- Measured answer: a real Claude receiver does NOT positively-ack a successful socket delivery (1000ms probe, 2026-08-27, pid-bound); `sent` + the durable reader-ack is the ceiling; `confirmed` is reachable only if a runtime emits a positive `orig_msg_id` status.
- The receipt taxonomy: sent / confirmed / failed / unverified.
- The durable-ack-wins rule (a successful markRead ⇒ receipt reads delivered regardless of transport).
