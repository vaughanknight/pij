# Item-24 multi-bubble HANG — investigate + fix (live-acceptance pass; own PR)

**Source**: o-prime LIVE FINDING (bridge 188c877) — see `../item-24-telegram-bridge-dup/tasks.md` § LIVE FINDING. **Base**: b1f0e0a (the bubblesHash final fold — mark-on-ack is load-bearing for acceptance (c)). Own PR, fresh-from-main at build (E35). Fence: `telegram/bridge.ts`(+test), `telegram/index.ts`(+test) if the send wiring is implicated.

## Evidence
Every body ≥ ~417 B (splits into ≥2 bubbles) acks ONLY on attempt 2, ~68-69 s after creation (= 60 s lease + poll): deliveries.attempt=2 for rows 4951/5014/5087; ≤249 B (1-bubble) rows ack on attempt 1. Attempt 1 evidently SENDS (bubbles reach the phone) but forwardOne never reaches claimUnread/ack within the 60 s lease; NO "queue consumer error" line.

## Root-cause analysis (TEST, don't assume — my code read narrows it)
- **The o-prime's leading hypothesis (grammy 429 retry_after) is WEAKENED**: text sends are RAW `bot.api.sendMessage` (index.ts:242) with ONLY `hydrateFiles` (index.ts:209) — NO `@grammyjs/auto-retry` / `apiThrottler` installed. So a 429 would THROW FAST (→ deps.send rejects → forwardOne returns undelivered → ForwardIncomplete = a FAILURE, not a 60 s HANG). A silent 60 s hang is inconsistent with a fast throw.
- **Investigate instead**: (1) the 2nd `deps.send`'s response wait — does Telegram (or grammy's internal request queue / long-poll contention) stall the 2nd rapid sendMessage for ~60 s? (2) `takeReplyTo` / `noteSpoke` (reply-threading / speaker recording) between/after bubbles — a blocking await? (3) the per-bubble `markTelegramPartSent` (SQLite write) on the 2nd bubble — a lock/contention with the daemon's own writes? (4) is the ~60 s exactly the lease (a coincidence of when redelivery fires) or a real 60 s timeout somewhere?
- METHOD: read forwardOne's send-execution loop end-to-end; add temporary timing/log around each await in the 2-bubble path; correlate with the bridge log (~/.pij/telegram-bridge.log) timestamps for rows 4951/5014/5087.

## Acceptance (o-prime; live proof after restart #6)
- (a) root cause NAMED with evidence (not the 429 guess unless you PROVE auto-retry exists).
- (b) a 2-bubble body acks on ATTEMPT 1 (deliveries.attempt=1) live after restart #6 — the fix removes the >lease stall.
- (c) if attempt 1 LEGITIMATELY exceeds the lease, the b1f0e0a plan-hash MARKS make attempt 2 send ONLY unmarked bubbles — prove LIVE (mark-on-ack is why a sent-but-late bubble is marked).

## Tasks
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | H001 | reproduce/localize the 2-bubble stall with a fake `deps.send` that mimics the live timing (or timing logs on the real path) → NAME the awaited step that eats the lease | bridge.test.ts (harness) | root cause pinned | evidence, not the 429 guess |
| [ ] | H002 | fix so a 2-bubble forwardOne acks within the lease (e.g. don't serialize/block on a slow post-send step; bound any wait; if a send genuinely can exceed the lease, ensure mark-on-ack already lets the redelivery skip the sent bubble) | bridge.ts (+test) | 2-bubble acks attempt-1 in a fake-timed test; live proof after restart #6 | keep the bubblesHash marks intact |
| [ ] | H003 | gates + report reports/item-24-multibubble-hang-report.json | — | recorded | |
