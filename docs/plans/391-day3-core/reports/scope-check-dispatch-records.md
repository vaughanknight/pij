# Scope check — do `delivered-unacked-stale` DISPATCH records fall inside item 1?
**From**: pij-associated-louse · **To**: pij-relative-panther · **2026-08-27T09:32Z** · answer to the 09:18Z scope check (not a ruling request unless you re-scope)

## claim
**No.** Item 1 as briefed (sqlite `deliveries` retire verb + closed-recipient sweep) does not reach platform DISPATCH records; a complete close does not settle them, and `pij queue retire` cannot touch them. Shipping item 1 alone leaves the anomaly board rotting on exactly the rows that motivated it.

## evidence (2953d75)
- Dispatch records are a separate platform-store entity: `core/platform/types.ts:103` `DISPATCH_STATES = ["undelivered","delivered-unacked","acked"]` — no terminal retire/cancel state. `core/platform/types.ts:167-185` `Dispatch { id, packetPath, packetSha256, from, to, messageId?, deliveryState?, state, ack?, canary?, created, updated }`.
- Only two pure transitions exist: `markDispatchDelivered` (`core/platform/dispatch.ts:73`) and `acknowledgeDispatch` (`:87`, driven by the seat's `pij ack`). Writers: `core/cli.ts:4536/4557/4592/4664/4698` (dispatch-packet + ack-dispatch verbs). Nothing on `pij close`, `unbindGonePane`, or any daemon tick writes a dispatch record.
- The detector `core/anomalies.ts:695-707` keys ONLY on `state === "delivered-unacked"` and `updated.ts` age (15 min); it never reads the recipient descriptor, so a dissolved `to` keeps flagging forever.
- `deliveryState` on the record (`queued|delivered|unverified`, `types.ts:107`) is a copy of the send receipt, not a link into the sqlite `deliveries` table; retiring the sqlite row leaves `state: "delivered-unacked"` untouched.

## honest re-scope options (your call)
- **(i) recommended — item 1b, separate small PR `s391/item1b-dispatch-retire`**: additive `DISPATCH_STATES` member `retired` + pure `retireDispatch(dispatch, {reason, actor})` (idempotent; `acked`/`retired` terminal); `pij dispatch retire <id|--to <seat>> --reason "<text>"` (PA-classified `refuse` like `queue retire`); the SAME daemon sweep from item 1 (complete deliberate close: dissolved + closeIntent + terminal.requested) also retires that seat's `delivered-unacked` dispatches with reason `recipient-closed`; the detector skips `retired`; `pij revive` does NOT un-retire dispatches (a brief dispatched to a dead incarnation is not owed by the new one — re-dispatch is the o-prime's act). Mirrors the ruled deliveries design; ~1 state + 1 pure fn + 1 verb + sweep arm + tests.
- **(ii)** detector-only: skip `delivered-unacked` dispatches whose `to` is dissolved-with-terminal. Stops the board rotting but hides rather than settles; no audit trail. Not recommended.
- **(iii)** leave dispatch records to a later plan; item 1 ships as briefed and the brief's motivation is explicitly noted as unmet.

## open
- Re-scope decision: (i), (ii), or (iii). If (i), I add Phase 2b to the plan (one more PR after item 1) without disturbing Phase 1, which is dispatching now.
