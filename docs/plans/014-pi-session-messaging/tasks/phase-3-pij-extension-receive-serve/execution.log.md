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

## T003–T010 — wire `index.ts` (thin translator, typecheck-only)

Rewrote `index.ts` as a pi-event→PijSession translator. Construction + boot happen in the single `session_start` handler (P10, all reasons); capture/turn_start/shutdown listeners are registered **top-level once** (reload-safe — registering them inside `session_start` would duplicate on `/reload`). The receive watcher is the one per-session resource: `session_start` disposes any prior watcher then opens a fresh one, `session_shutdown` disposes it + `registry.remove(self)`.

- **T003 boot id source** (validation HIGH fix): `self = pij-${process.pid}` — a stable id derived from the OS process (present on first boot, identical across `/reload` since it's the same process, distinct per session in a shared cwd). `resolveSelf` is NOT used here. `boot()` is idempotent: reload reuses the descriptor.
- **T004 announce**: handled by `boot()` (fires once on a fresh session via `PiRuntimeAdapter.inject(…,"immediate")`; skipped on reload).
- **T005 capture**: `tool_call`/`tool_result`/`message_end`→`capture`. **No `pi.on("usage")`** (C1 fix — there is no such event).
- **T006 injector**: `channel.watch(self, dm => session.onInbound(dm, dm.messageId), seen)`; `seen` is a `Set<string>` seeded with the inbox's current `msg-*.json` filenames so reload doesn't replay. idle/steer is decided inside the coordinator via `ctx.isIdle()` at inject time — so the `input`/`streamingBehavior` event is **not needed** (the receipt classification reads live idle state directly, the same signal the proven prototype used).
- **T007 command exec**: rides the same `onInbound` path — `validateCommand` gates `compact`; unknown is rejected (`E-CMD`) before any pi call.
- **T008 env export**: `process.env.PIJ_SESSION_ID = boot.id` (+ `PIJ_ROLE`), re-exported on reload.
- **T009 receipts**: `turn_start.timestamp` (a number) → ISO → `onTurnStart` resolves queued→delivered; receipts are events + `kind:receipt` messages (never re-injected).
- **T010 shutdown**: dispose watcher + remove descriptor.
- **/pij command** (T011 prep): pinned status line `pij: <id> · role=<role> · peers <n> · events <m>`; smoke `expect` regex updated to match.

**Evidence**: pij typecheck-clean (`tsc` errors confined to the stray untracked `skill-runner/`); pij Biome clean (import-order auto-fix); single-pi-importer invariant holds (`index.ts` + `adapters/pi-runtime.ts` only; `core/` zero); coordinator suite 10/10 green.

| D4 | Classifying receipts via `ctx.isIdle()` at inject time (not `input.streamingBehavior`) makes the `input` event subscription unnecessary and sidesteps the `undefined`/`followUp` nuance entirely — the coordinator reads the same live idle signal the prototype used. | Simpler wiring; `turn_start` is the only receipt-correlation event needed. |
| D5 | Listeners must be top-level (once), not inside `session_start`, or `/reload` double-registers capture handlers. The watcher is the lone per-session resource (dispose-then-recreate on reload). | Reload-safety; P10 one-handler honoured. |
