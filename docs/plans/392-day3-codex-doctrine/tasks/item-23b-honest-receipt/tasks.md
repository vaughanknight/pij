# Item 23b: honest receipt redone (marker-origin) — o-prime ruling (a)+(b)

**Source**: item-23 cold review FINDING-1 (`../../reviews/item-23-review.md`) + o-prime ruling 2026-08-28. **After** the current tail (21→22→24→E22), unless o-prime resequences.
**Base**: main (fetch at dispatch; cherry-pick fresh-from-main, COORD-004). CODE.
**Fence (provisional)**: `core/types.ts` (InboxReadMarker gains origin), `channel*`/`markRead` sites, `daemon.ts emitSendReceipt`, `core/cli.ts` (pij queue/receipts render), + tests.

### The defect item 23 could NOT fix (ruling-2 premise was circular)
`emitSendReceipt`'s "defer to durable ack" made the receipt UNCONDITIONALLY `delivered` — `durablyAcked` is true for both InboxMark variants, and the ack is DAEMON-written at delivery (daemon.ts:691/:1260 markRead), not reader-written. So the deference is circular; the `unverified` arm was dead (MUT-CONST no-RED).

### Design (o-prime (a)+(b))
- **(a) Record marker ORIGIN**: `InboxReadMarker` carries `origin: "daemon-inject" | "reader"`. Daemon delivery-time markRead (daemon.ts:691/:1260) writes `daemon-inject`; genuine reader reads (inbox.ts:339, cli.ts:764, index.ts:413) write `reader`.
- **(b) Receipt defers ONLY to a reader-origin ack**: emitSendReceipt reads `delivered` ONLY when a READER-origin marker exists (or outcome === confirmed / a real positive ack); a daemon-inject marker alone → the honest transport word (`sent`→`sent`/`unverified`, per the taxonomy). A later REAL reader ack UPGRADES the receipt (delivered).
- **Copilot RPC messageId IS a real positive ack** → maps to `confirmed` (not `sent`) — the RPC response is reader-side truth, unlike the claude socket.
- **Make origin VISIBLE**: `pij queue --to <id>` / receipts must SHOW daemon-inject vs reader so nobody reads "acked" as reader confirmation. (Ties to item-24 spec §14.)
- **MANDATORY test**: pin a NON-delivered receipt (a daemon-inject-only, unconfirmed send reads NOT delivered) — the constant-fold mutant (`const state = "delivered"`) MUST die. This is the guard whose absence let ruling-2 ship dead code.

### Cold-review Dim-0
- **MUT-CONST**: `const state = "delivered"` ⇒ the non-delivered-receipt test RED (the guard that was missing in item 23).
- **MUT-ORIGIN**: make a daemon-inject marker count as reader ⇒ the wedge test RED.
