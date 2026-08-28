# 23b — honest transport receipt: record marker ORIGIN (injected vs reader-read)

**Item id / stream at handover:** 23b (split from #23) · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** designed, NOT started. Item 23 (transport `sent` outcome + defer to durable ack) landed; 23b is the honest-receipt remainder.
**Size estimate:** S–M, ~3–5 h · **Order / dependencies:** after item 23. Touches the daemon markRead path + `pij queue`/receipt render.

## 1. Why this exists (the observed failure, with evidence)
On the Claude-socket path, a durable `acked (reader=X)` receipt row is written BY THE DAEMON at injection, not when the reader processed the message. So "reader=X" reads as reader-confirmation but only means "injected to the socket".
- Code proof: `daemon.ts:824-850` is the injection path; it flushes text to the socket and immediately calls `this.channel.markRead(current.id, message.messageId, { reader: current.id })` (`:847-850`). The `reader` is the injecting seat, stamped at inject time.
- Incident: `docs/plans/392-day3-codex-doctrine/rulings.md:207` — the o-prime ruling #2 ("defer to the durable reader-ack") was circular because the daemon writes that ack; a constant-fold mutant proved every receipt would read "delivered" (E26). Every `acked (reader=X)` cited for Claude-socket sends is daemon-origin ("injected"), NOT reader-read. Copilot RPC (server messageId) and the Telegram bridge acks ARE real positive acks and stand.

## 2. What is ruled (design / spec) — `docs/plans/392-day3-codex-doctrine/rulings.md:204-207`
- Record marker ORIGIN: daemon-inject vs reader. The receipt defers ONLY to a reader-ORIGIN ack.
- A later REAL reader ack UPGRADES the receipt (injected to confirmed) — written by the reader's own read path; see §3 for who that is on each path.
- Make origin VISIBLE in `pij queue` / receipts so no one reads an injected mark as reader confirmation again.
- Copilot RPC: the server messageId IS a real positive ack, may map to `confirmed`.
- A test pins a NON-delivered receipt so the constant-fold mutant MUST die (else the dead-arm regression recurs, E26).

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/daemon.ts` — there are THREE daemon-origin `markRead(..., { reader: id })` sites: `:847` (socket injection), `:1386`, `:1447`. Add the origin flag ("injected" vs "reader") at ALL THREE — fixing only `:847` leaves `:1386`/`:1447` still rendering reader-confirmed, the exact bug 23b kills. These paths are harness-GENERIC (`id`'s harness is a parameter), so the flag is stamped regardless of harness; the Claude-socket case is where no reader ack ever follows (§ below).
- `.pi/extensions/pij/adapters/sqlite-queue.ts` — `DeliveryState` `:39` (`queued|claimed|injected|acked|parked|retired`), `receipts` table `:131`, receipt kind `:171-175`. The render must surface origin.
- `core/message.ts` `receiptBody` (imported `daemon.ts:102`) — the string a reader/pane sees; add origin so `pij tail`/`pij queue` show injected vs confirmed.
- The Copilot RPC path (grep `rpcPort` / server messageId in `core/daemon/loop.ts`) — map a real server messageId to `confirmed`.
- **Who writes the reader-origin ack, per path:** pi in-process receiver marks read on consume; Copilot RPC returns a server messageId (a real positive ack → `confirmed`); the Telegram bridge acks on forward. **On the CLAUDE-SOCKET path there is NO reader ack today** — the Claude runtime emits no positive read signal (item 23 measurement), so a Claude-socket row honestly stays `injected` (never auto-upgrades). That is the correct end state, not a bug: 23b's job is to STOP rendering it as `confirmed` / `acked (reader=X)`. The `injected → confirmed` upgrade fires ONLY where a reader-origin ack exists; if a Claude read-ack is ever added (an in-process receiver hook or an echo reply), that becomes its upgrade source.

## 4. Acceptance (behavioural, mechanical)
- Test: an injected-only send shows `injected` (not `confirmed`); a subsequent reader-origin ack UPGRADES it to `confirmed`; a Copilot RPC send with a server messageId shows `confirmed`.
- Mutant `MUT-RECEIPT-CONSTANT-FOLD`: force the receipt origin to a constant "reader"/"confirmed" so the injected-only test REDs (E26 dead-arm guard). The mutated line must be one no existing test drives (E40).
- Gates: full suite at merge product (fresh worktree), `just typecheck`, two green runs, logs kept (E22/E35).

## 5. Live verification (after a daemon restart carrying it)
`pij queue --to <claude-seat>` (or `pij tail`) on a real Claude-socket send: the row reads `injected` until the seat actually reads it, then `confirmed`. A Copilot RPC send reads `confirmed` immediately. Failure looks like: a socket send reading `confirmed` / `acked (reader=X)` before the reader touched it.

## 6. Risks / gotchas that already bit us
- E26 — a receipt that always reads "delivered" is the dead-arm the constant-fold mutant must kill.
- "State your instrument" (spine rule 2, `docs/plans/392-day3-codex-doctrine/rulings.md:207`) — a ruling that names an instrument (the ack) must state WHO WRITES it; the whole bug was not asking.
- Additive schema only — an origin column must be migration-safe (legacy receipts load as injected/unknown, never crash).

## 7. Open questions for the human
- Legacy receipts (no origin) render as `injected` (unknown) or a distinct `legacy`? (Recommend `injected` — conservative, never over-claims.)
