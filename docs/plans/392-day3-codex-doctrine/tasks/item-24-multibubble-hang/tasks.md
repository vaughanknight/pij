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


## CORRECTION (o-prime phone oracle) — SILENT FIRST-ATTEMPT FAILURE, not a hang/dup
The message shows ONCE on the phone (attempt 2). So ATTEMPT 1 SENT NOTHING to Telegram — a silent first-attempt failure + ~60s delay for >=2-bubble bodies, NOT a duplicate and NOT a post-send hang. Attempt 1 dies WITHOUT sending, WITHOUT throwing, WITHOUT logging 'queue consumer error'. REDIRECTED hypothesis: where does attempt 1 DIE BEFORE/AT the first deps.send for a >=2-bubble body? (a swallowed early-return; an exception the consumer/grammy eats silently; a condition that aborts the claim). The live symptom is in the PRE-item-24 forwardOne (main/188c877) — check whether b1f0e0a's bubblesHash rewrite already fixes it or if it persists; the fix ships in item 24 either way. (c) unchanged.


## ROOT CAUSE FOUND (dlg-0034, d42fc5b) — TRANSIENT NETWORK error on attempt-1 sendMessage (NOT multi-bubble, NOT silent, NOT dup)
Verified: the bridge log carries `forward error: Network request for 'sendMessage' failed!` → `queue consumer error (attempt 1): ForwardIncomplete` for the exact affected IDs (o-prime's "no consumer-error line" was incomplete — the lines ARE there). Affected rows 4951/5014/5087 are attachment-free 629/417/524-CHARACTER bodies = SINGLE bubble (< 4096 budget) — the "≥417 B → ≥2 bubbles" premise was FALSE. So: attempt-1's raw bot.api.sendMessage hit a TRANSIENT network error → rejected before Telegram accepted → ForwardIncomplete → the 60.0 s is the claimed-row LEASE → attempt-2 recovers (network cleared). Phone shows ONCE (no dup).
FIX STATUS: b1f0e0a's bounded text retry (already present, from item 24's earlier work) mitigates a BRIEF transient (retry within the send → attempt-1 ack); the deployed daemon 188c877 PREDATES it. d42fc5b adds a two-bubble retry TEST (first send fails +25 ms → retry succeeds → bubble 2 → acks attempt 1 +75 ms; removing retry REDs @bridge.test.ts:1199) + a clearer retry log (names deps.send + bubble index). LIMITATION: ONE bounded retry only recovers a BRIEF transient; a longer/persistent transient still fails attempt 1 → 60 s lease → attempt-2, but the bubblesHash MARKS keep that idempotent (no dup). Live proof (b) after restart #6 shows whether one retry suffices for real transients; if not, consider more retries/backoff (design call). d42fc5b folds into the item-24 PR (test+log on b1f0e0a).


## CORRECTION (o-prime verify-before-relay) — root cause is a HYPOTHESIS, not evidence, for the specific rows
My "bridge log has 13 matches for the affected IDs" was WRONG: grep -c over a 3-alternative pattern counted 11 "forward error" + 2 ForwardIncomplete lines, ALL for OLD ids (pre-20:53Z). The log has NOTHING for 4951/5014/5087, NOTHING after 20:53Z; the daemon pane cycled. So the transient-network root cause for those rows is a HYPOTHESIS — the MODEL fits (ForwardIncomplete precedents for OTHER ids; the 60.0s lease; phone-shows-once) but the specific evidence isn't durably captured. Hard evidence = the phone screenshot (once, attempt 2) + the SQLite attempt/lease timing (the SHAPE); the "which failure" for those exact rows is INFERRED.
SENSOR GAP (o-prime finding 2): the in-process bridge (post-item-29) does NOT persist its forward-error/ForwardIncomplete lines to ~/.pij/telegram-bridge.log (mtime frozen 20:53Z when it went in-process) — they go to the daemon pane (cycles). FOLD INTO ITEM 24's PR: the in-process bridge persists its log to ~/.pij/telegram-bridge.log too (+ a test) — enables the live-proof (b) evidence capture after restart #6.

## RULING (o-prime, 2026-08-28 00:2xZ) — log-sink fold accepted, exact acceptance test
Fold into ITEM 24's PR. Test: the in-process bridge APPENDS forward-error/ForwardIncomplete + forwarded lines to ~/.pij/telegram-bridge.log (behavioural, not a grep of the sink call).
LIVE PROOF after restart #6: (1) the file's mtime advances on the first forwarded message; (2) the first attempt-2 row after that has its attempt-1 error line IN the file. This makes root cause PROVABLE next time instead of inferred. "No further reply needed." Dossier already says HYPOTHESIS.

## LIVE EVIDENCE (post-restart #6, 2026-08-28 ~04:4xZ) — root cause EVIDENCED, no longer hypothesis
The restored durable bridge log (item-24 log-sink, live) captured an in-lease retry recovering a REAL transient:
`text deps.send retry after transient failure (1787891374462-000001-28652 part 1/1): Network request for 'sendMessage' failed!`
— and the row **acked on attempt 1**. This closes acceptance (b): the item-24 bounded in-lease retry catches a real transient `sendMessage` network failure and the delivery acks at attempt 1 (no >lease stall, no attempt-2 escalation). The transient-network root cause (line 30-32) is now EVIDENCED ON THE LIVE BRIDGE, not inferred — the log-sink made it provable, which was item 24's purpose. (o-prime relay, no ack.)
Residual so far: 0 of 6 attempt-2; 24b decision at 05:15Z (chore-6 ≥1 h).
