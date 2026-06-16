# Phase 3 — Execution Log (pij extension: receive + serve)

Plan: `docs/plans/014-pi-session-messaging/pi-session-messaging-plan.md`
Mode: Full · Companion: `code-review-companion` run `2026-06-16T15-59-13-231Z-5219` (Power On Mode)

---

## T000 — Harness pre-flight (`--event pre-implement`)

Engineering-harness router is installed (`~/.pi/agent/skills/eng-harness-flow`), but the pij repo is **unadopted** (no harness governance docs) — the same `degraded` posture as Phases 1–2. Per the flow's best-effort contract: **proceed with standard testing** (vitest tests-first for the coordinator, `just` gates at T011). No boot verdict to narrate verbatim (router not invoked as a tool in this session); recorded once here, not re-warned.

## T001 — Tests first for `PijSession` (RED)

Wrote `.pi/extensions/pij/core/session.test.ts` (10 specs vs fakes, Pattern P8): fresh boot (descriptor + single announce + fresh=true), reload (no re-announce, startedAt preserved, pid refreshed, fresh=false), seq reseed from `lastSeq()` (finding 04), capture monotonic seq + ISO timestamp, idle inject→single `delivered` receipt, busy inject→`queued`→`delivered` at next `turn_start` (finding 08), compact executed / unknown `E-CMD` rejected with no pi call (finding 05), `kind:receipt` recorded-not-injected (receipt never wakes the peer), shutdown removes descriptor.

## T002 — Implement `core/session.ts` `PijSession` (GREEN)

Pure coordinator (P2 pi-free, P3 ports-by-DI, P4 tagged-union returns). Constructor takes the 5 ports; methods `boot(BootInput)→BootResult`, `capture(type,data?)`, `onInbound(msg,messageId)→InboundResult`, `onTurnStart(iso)`, `shutdown()`. Reuses Phase-1 helpers verbatim (`announceText`/`frame`/`receiptBody`, `validateCommand`, `classifyOnInject`/`initialReceipt`/`markDelivered`/`correlateDeliveredAt`, `SeqCounter`, `buildEvent`). Two additive, backward-compatible core extensions: `PijMessage.kind?:"receipt"` (types.ts) + `message.receiptBody()` — so a receipt is recorded as an event AND delivered back to the sender as a `kind:receipt` message that the receiver records but never injects (the receipt-doesn't-wake-the-parent fix from validation).

**Evidence**: `npx vitest run core/session.test.ts` → 10/10 green. Full suite 403 pass / 4 skip. pij typecheck clean (`tsc` errors are confined to a stray untracked `.pi/extensions/skill-runner/` dir — not pij; to be quarantined before the T011 gate).

## Discoveries & Learnings

| # | Discovery | Impact |
|---|-----------|--------|
| D1 | Stray untracked `.pi/extensions/skill-runner/` appeared in the worktree this session and breaks repo-wide `just typecheck` (`smoke.ts(1,…) TS1003`). Not pij, not committed. | Must quarantine/move before T011's `just self-check` gate can be green. |
| D2 | `correlateDeliveredAt` is 3-arg `(injectIso, steer, turnStartIsos)`; `markDelivered` carries `deliveredAt` — the coordinator passes a single-element `[iso]` per `onTurnStart` so each turn resolves at most the queued receipts older than it. | Matches finding 08; verified by the busy-peer spec (second turn_start does not re-deliver). |
| D3 | Receipts are modelled as first-class events (`type:"receipt"`) + `kind:"receipt"` channel messages, keeping AC-13 (visible in tail/state) AND the North-Star (never wake the billed parent) without touching the frozen `ports.ts`. | Additive-only to `types.ts`/`message.ts`. |
