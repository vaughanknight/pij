# Item 20: transport post-write ack — no duplicate on ack-loss (T1/T2)

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 20) · **Ruling**: `../../rulings.md` (2026-08-28, OBS-04) · **Order**: 18 → 20 → 21
**Base**: origin/main (fetch tip at dispatch) · **This is CODE** (no skill text) → gate: `npx vitest run .pi/extensions/pij/` + `just typecheck`.
**Fence**: `.pi/extensions/pij/adapters/claude-socket.ts` (+test), `.pi/extensions/pij/adapters/copilot-rpc.ts` (+test), `.pi/extensions/pij/adapters/daemon-tmux.ts`, `.pi/extensions/pij/core/daemon/loop.ts` (+`loop.test.ts`), `adapters/fakes.ts`. Additive to `SendOutcome` union? NO — `unverified` already exists (`core/ports.ts:47`).

### Executive Briefing — the two windows
`SendOutcome = "confirmed" | "unverified" | "held" | "failed" | "gone"` (`ports.ts:47`). The PANE path already uses `unverified` correctly: bytes typed but submission unconfirmed → `drainTmuxInbox` CONSUMES (does not re-enqueue), because replaying could duplicate an accepted turn (`loop.ts:748-756`). The SOCKET/RPC path does NOT — it only ever returns `confirmed` or `failed`, and `failed` re-enqueues (`loop.ts:697-706`). So a `failed` that actually means "delivered, ack lost" causes a duplicate on the next drain.
- **T1 = pre-write failure**: ENOENT / connect-timeout / connect-error / the `c.write` callback itself erroring → nothing left the daemon → `failed` → re-enqueue is CORRECT (retry-safe). KEEP.
- **T2 = post-write ack loss**: the `c.write` callback succeeded (bytes flushed to the kernel; the recipient may already have rendered the message) but THEN the socket errors/closes, or the ack-wait elapses without a positive/negative status, or (copilot) the RPC response is lost after the request was sent → today returns `failed` → re-enqueue → DUPLICATE. Must return `unverified` instead.
- A `dropped` status (`claude-socket.ts:177`, an explicit NAK from the recipient) is genuinely-not-delivered → stays `failed` (retry-safe), NOT `unverified`. This distinction is load-bearing: NAK = retry, silence-after-write = don't.

### Precise anchors (verify at dispatch)
- `claude-socket.ts:155-160`: `c.on("connect")` → `c.write(frame, cb)`; cb `err` → `failed` (T1); else `setTimeout(confirmed, ackWaitMs)` (optimistic). `c.on("error")` (`:153`) fires `failed` even AFTER a successful write → this is the T2 leak. `:177` `dropped` → `failed` (keep).
- `copilot-rpc.ts:39-98`: `sendCopilotRpc`; outcome type `:22` = `"confirmed"|"failed"`; `:67` response-timeout, `:71` socket-error, `:83-98` bad/absent frame → all `failed`. Post-request timeout (`:67`) after the request was written = T2.
- `daemon-tmux.ts:272-306`: `sendSocket` maps copilot RPC (`:301-305`) and claude socket (`:307-329`) → currently `confirmed` or `failed`; must pass `unverified` through.
- `loop.ts:697-706`: the socket branch in `drainTmuxInbox` — add the `unverified` case (consume, `via:"socket"`), keep `failed` → enqueue.
- Sender receipt: `core/cli.ts` `classifySendReceipt`/`daemonReceiptAuthoritative`/`effectiveDeliveryMode` (`:697,:2222,:2277`) already special-case `unverified` receipts (`:618` "delivered/unverified receipts remove only their correlated message") — confirm an `unverified` socket delivery yields a delivered-unconfirmed receipt, NOT a `queued` that implies a pending retry. Likely no change; VERIFY with a test and note it.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (T2 RED, claude) | `claude-socket.test.ts`: after a successful `c.write`, simulate a socket `error`/`close` before ack (and separately an ack-wait elapse with no status) ⇒ `sendClaudeFrame` returns **`unverified`**, NOT `failed`. RED on current code. | pij-control-plane | `.pi/extensions/pij/adapters/claude-socket.ts` (+test) | RED | use a fake socket/server; the `dropped` NAK case must still return `failed` (assert both) |
| [ ] | T002 (T2 GREEN, claude) | `sendClaudeFrame`: track `let wrote = false`; set it in the `c.write` success callback; in `c.on("error")`/close and the no-status ack path, return `wrote ? "unverified" : "failed"`. `dropped` status stays `failed`. Widen the return outcome type to include `unverified`. | pij-control-plane | `.pi/extensions/pij/adapters/claude-socket.ts` | T001 GREEN | minimal; do not change ackWaitMs |
| [ ] | T003 (T2, copilot) | `copilot-rpc.ts`: outcome type gains `"unverified"`; track that the request was written; a lost/timed-out RESPONSE after a successful send ⇒ `unverified` (T2); a pre-send failure (connect error, bad port) ⇒ `failed` (T1). Test both. | pij-control-plane | `.pi/extensions/pij/adapters/copilot-rpc.ts` (+test) | RED→GREEN both windows | `mode:"enqueue"` means server-side landing is plausible before the response |
| [ ] | T004 (adapter passthrough) | `daemon-tmux.ts sendSocket`: return `unverified` where the underlying claude/copilot call now returns it (both branches). No collapse to `failed`. | pij-control-plane | `.pi/extensions/pij/adapters/daemon-tmux.ts` | passthrough proven by a fake | |
| [ ] | T005 (drain decision — the headline) | `loop.ts drainTmuxInbox` socket branch: add `if (outcome === "unverified") { consumed.push({..., outcome, via:"socket"}); continue; }` BEFORE the `failed`→enqueue. `unverified` CONSUMES (no re-enqueue), mirroring the pane path. | pij-control-plane | `.pi/extensions/pij/core/daemon/loop.ts` (+`loop.test.ts`) | T2 fake: one drain returns `unverified` → message consumed → a SECOND drain sends nothing (zero duplicate); T1 fake: `failed` → re-enqueued → second drain retries | THE proof of no-dup |
| [ ] | T006 (receipt) | test: an `unverified` socket delivery yields the sender a delivered-unconfirmed receipt via `classifySendReceipt`, not a `queued`/pending-retry classification. | pij-control-plane | `.pi/extensions/pij/core/cli.ts` (test only if no code change) | receipt reflects delivered-unconfirmed | likely no code change — VERIFY + note |
| [ ] | T007 | gates (`npx vitest run .pi/extensions/pij/`, `just typecheck`), pathspec commit, `reports/item-20-report.md` with the T1/T2 mutation records | pij-control-plane | `reports/item-20-report.md` | recorded | |

### Cold-review Dim-0 (mandatory)
- **MUT-T2-claude**: revert `wrote ? "unverified" : "failed"` to always `"failed"` ⇒ T001 RED (proves T2 is pinned).
- **MUT-T2-copilot**: same for copilot-rpc ⇒ T003 RED.
- **MUT-DRAIN**: change the drain's `unverified` case back to `buffer.enqueue` ⇒ T005 no-dup test RED (a second drain re-sends → duplicate observed). THIS is the OBS-04 proof.
- **MUT-NAK**: make the `dropped` status return `unverified` instead of `failed` ⇒ a NAK-retry test RED (proves NAK stays retry-safe, not swallowed as delivered).
- Verdict artifact must record sha + RED line for each.

### Open
- Exact real-world T2 trigger (which socket event fires after a flushed write) is environment-dependent; the fake-driven `wrote`-flag reproduction is the deterministic proof regardless — note honestly, as item 10b did.
- If widening `copilot-rpc`'s outcome type ripples to other callers, keep it additive (default unchanged); grep callers first.
- Decide (and state in the report) whether `unverified` should also feed a bounded single re-verify (a receipt round-trip) vs plain consume. Default: consume, mirroring the pane path's accepted at-most-once-after-unverified tradeoff. The o-prime's ruling says "single verify/receipt path, never blind re-send" — plain consume satisfies "never blind re-send"; a receipt round-trip is a stretch goal, flag it.
