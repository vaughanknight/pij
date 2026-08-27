# Item 23: transport receipt honesty — `sent` outcome + defer to durable ack

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 23) · **Ruling**: `../../rulings.md` (2026-08-28 resequence+ruling) · **Order**: 23 FIRST → 21 → 22 → 24
**Base**: origin/main (fetch tip at dispatch; fence reconciled to current main pre-dispatch). BUILD PR AS CHERRY-PICK ONTO FRESH MAIN (COORD-004). **CODE** → gate `npx vitest run .pi/extensions/pij/` + `just typecheck`.
**Fence**: `core/ports.ts` (SendOutcome), `adapters/claude-socket.ts`(+test), `adapters/copilot-rpc.ts`(+test), `adapters/daemon-tmux.ts`(+test), `core/daemon/loop.ts`(+test), `daemon.ts` (emitSendReceipt), `adapters/fakes.ts`. `core/cli.ts` only if the sender-side classify needs the new word (verify; likely daemon.ts is enough).

### The defect (measured live, restart #3)
item-20 correctly made a flushed-but-unacked socket write `unverified` (consume, no retry) — but the sender-side transport RECEIPT then reads `unverified` (`daemon.ts:1456` `state = outcome==="confirmed" ? "delivered" : "unverified"`), which is pessimistic: the durable queue shows the message `acked` (delivered + read). Post-restart ~45% of transport receipts read unverified though durable delivery was intact. Two honesty fixes + one measurement.

### Anchors (verify at dispatch)
- `SendOutcome` union: `core/ports.ts:47` = `"confirmed"|"unverified"|"held"|"failed"|"gone"` — ADD `"sent"`.
- `claude-socket.ts`: the `wrote?"unverified":"failed"` decisions (item-20) — a POST-write no-ack path must now yield `sent` (not `unverified`); the `dropped` NAK (`:~191`) stays `failed`; a positive `orig_msg_id` status → `confirmed`. ackWaitMs = `:136 ?? 150`.
- `copilot-rpc.ts`: mirror — a flushed request with a lost RESPONSE → `sent`; pre-send fail → `failed`; positive → `confirmed`.
- `daemon-tmux.ts:273` `socketAckWaitMs ?? 150` — the measurement knob.
- `loop.ts drainTmuxInbox` socket branch (`:~697-706`): `sent` must CONSUME exactly like `unverified`/`confirmed` (no re-enqueue).
- `daemon.ts:1441 emitSendReceipt` + `:1456` mapping; the durable ack is the `marked` result of `channel.markRead(...reader:id)` at `:1219`/`:1232` just before the emit call.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (RULING 1 — `sent`) | add `"sent"` to `SendOutcome`; `claude-socket.ts`: a flushed write with no positive ack and no NAK → `sent` (was `unverified`); `dropped` NAK → `failed`; positive `orig_msg_id` → `confirmed`. Same reframe in `copilot-rpc.ts`. RED-first: a fake receiver that never acks success → `sent`; one that NAKs → `failed`; one that positively acks → `confirmed`. | pij-control-plane | ports.ts, claude-socket.ts(+test), copilot-rpc.ts(+test) | RED→GREEN all three | `sent` is NOT pessimistic; distinct from `unverified` (which now means "we truly don't know" — keep for the genuine no-flush-evidence case if any, else `sent` supersedes it on the socket path — state which in the report) |
| [ ] | T002 (drain) | `daemon-tmux.ts` passes `sent` through; `loop.ts drainTmuxInbox` consumes `sent` alongside `confirmed`/`unverified` (no re-enqueue). | pij-control-plane | daemon-tmux.ts, loop.ts(+test) | a `sent` outcome CONSUMES; `failed` still enqueues | mirror the item-20 unverified case |
| [ ] | T003 (RULING 2 — defer to durable ack) | `daemon.ts emitSendReceipt`: thread the `marked` (durable markRead) result in; a message with a durable reader-ack ⇒ receipt `delivered` REGARDLESS of transport; only a NON-acked message falls to transport (`sent`→`sent`, `confirmed`→`delivered`, else `unverified`). RED-first: a `sent` transport + successful markRead ⇒ receipt reads `delivered`. | pij-control-plane | daemon.ts(+ its test) | RED→GREEN; a durably-acked `sent` send reads `delivered` | this is THE fix for the ~45% pessimism |
| [ ] | T004 (RULING 3 — measure) | set `socketAckWaitMs` to 1000ms for ONE measurement window (or add a temporary probe/log): does a real claude receiver EVER emit `peer_message_status` w/ `orig_msg_id` on SUCCESS? Record the answer (yes/no + evidence) in the spec's outstanding list (`reports/pij-comms-review-2026-08-27.md` outstanding, or a new `reports/item-23-ack-measurement.md`). If NO → note that `confirmed` is unreachable on success and `sent`+durable-ack IS the ceiling; revert ackWaitMs to 150 after measuring (don't ship 1000ms unless justified). | pij-control-plane | daemon-tmux.ts (transient), `reports/item-23-ack-measurement.md` | the yes/no is recorded with evidence | measurement, not a permanent 1000ms |
| [ ] | T005 | gates + pathspec commit + `reports/item-23-report.md` with the 3 ruling points' mutation records + the ackWaitMs measurement result | pij-control-plane | reports/ | recorded | one PR |

### Cold-review Dim-0 (mandatory)
- **MUT-SENT**: revert the flushed-write `sent` back to `unverified` ⇒ T001 RED.
- **MUT-NAK**: make the `dropped` NAK return `sent` ⇒ a NAK test RED (NAK must stay `failed`, retry-safe).
- **MUT-DEFER**: remove the durable-ack deference in emitSendReceipt ⇒ T003 RED (a durably-acked `sent` wrongly reads pessimistic).
- Verdict artifact records sha + RED line each.

### Open
- Does `unverified` survive at all after `sent` lands? If every consumed socket outcome is now `sent`/`confirmed`/`delivered`, `unverified` may only remain for the pane path's genuine no-confirmation case. State the final outcome taxonomy in the report; do NOT remove `unverified` if any path still needs it.
- Whether to keep any 1000ms — default NO (measure then revert to 150); the durable-ack deference (T003), not a longer wait, is the real fix.
- ADV-2 (item-20): the fake was taught to actively confirm — with `sent` as the honest default, add a fake comment citing the prior-art source (d-prior-art.md:36) so the fake's confirm-mode is understood as a protocol assumption, not ground truth.
