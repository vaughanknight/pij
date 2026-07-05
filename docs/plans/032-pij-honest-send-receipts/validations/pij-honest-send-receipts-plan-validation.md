# Validation Record — Plan 032 (pij honest send receipts)

- **Target**: `docs/plans/032-pij-honest-send-receipts/pij-honest-send-receipts-plan.md`
- **Date**: 2026-07-05
- **Method**: lead deterministic pass (signatures/domains/gates) + **independent cross-model critic** — copilot `gpt-5.5` peer `pij-r8pkbp` (the user-requested validator, standing in for `/validate-v2`'s adaptive critic).
- **Verdict**: ❌ **NEEDS ATTENTION → RESOLVED** (4 findings, all confirmed real against source, all folded into the plan).

## Lead deterministic checks (passed)
- Cited signatures accurate: `ReceiptState` (types.ts:180), receipt-from-state (cli.ts:548), `sendText(...):void` (ports.ts:52), `deliver():Result` (ports.ts:44).
- Both target domains exist in `docs/domains/registry.md` (`pij-messaging`, `pij-control-plane`).
- Gates G1–G7 structurally PASS.

## Findings (cross-model critic — all CONFIRMED by lead against source)

| # | Sev | Finding | Evidence (lead-verified) | Resolution in plan |
|---|-----|---------|--------------------------|--------------------|
| F1 | HIGH | Receipt can't be emitted at the drain site — `drainTmuxInbox` (loop.ts:406) has no `DeliveryPort`/`EventLogPort`. | `drainTmuxInbox(target, messages, ports, buffer)` returns consumed ids; `daemon.ts drainInbox` holds `this.channel` + from/messageId; house pattern = `channel.deliver({body: receiptBody(...)})` (session.ts:157). | Key Finding 07; T006 rewritten (drain returns per-message `SendOutcome`s; `daemon.ts` emits the receipt); Manifest +`daemon.ts`. |
| F2 | HIGH | `RECEIPT_RE` (message.ts:38) parses only `queued\|delivered` → `unverified` body fails `parseReceiptBody` → `--wait` times out. | `RECEIPT_RE = /^\[pij receipt ([^\]]+)\] (queued\|delivered)$/`; `receiptBody` is type-driven. | Key Finding 08; T005 +`core/message.ts` (widen regex + round-trip); Manifest +`message.ts`; Risk row (High/High). |
| F3 | MED | Three `sendText` sites, not one: loop.ts:362 (watchdog), loop.ts:424 (drain), daemon.ts:125 (buffer flush, no harness/pid). | `rg 'sendText('` — 3 non-test call sites confirmed. | Key Finding 09; T004 inventories all 3 + buffer-flush handling; assumption in business half corrected. |
| F4 | MED | Confirm oracle can miss a short `ready→busy→ready` turn (no cadence / transcript fallback) → spurious `unverified` vs AC-02. | T001/T003 Done-When lacked a sampling cadence + event fallback. | Key Finding 10; T003 (+cadence +transcript fallback), T009 (measure smallest turn); Risk row. |

**Scope call (critic + lead agree)**: Simple-is-right — the gaps are missing task/file coverage in the same dependency chain, not evidence for a second phase.

## Post-resolution status
All four findings folded into the plan (Key Findings 07–10, Domain Manifest +2 files, T003–T009 revised, Risks + Coverage updated). Plan remains **Simple / CS-3 / Status: READY**. Re-review optional — the reviewer peer (`pij-r8pkbp`) is compacted and available for a re-validation of the revised plan on request.
