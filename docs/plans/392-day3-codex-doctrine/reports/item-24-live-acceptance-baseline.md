# Item-24 live-acceptance — PRE-FIX baseline

**Source**: o-prime `pij-relative-panther` cross-session message, 2026-08-28 (spine 30341).
**Status**: durable evidence — recorded per iron rule 1. No ack was owed (o-prime said so); this is a disk record, not a reply.

## Baseline (pre-fix, main @ 188c877)

Attempt-2 rows to `pij-telegram` (the >249-char failures that only landed on retry):

| seq  | created | body chars | outcome |
|------|---------|-----------|---------|
| 4951 | 23:23Z  | 629 | acked ~65 s after creation on attempt 2 |
| 5014 | 23:37Z  | 417 | acked ~65 s after creation on attempt 2 |
| 5087 | 23:47Z  | 524 | acked ~65 s after creation on attempt 2 |
| 5386 | 00:35Z  | 351 | acked ~65 s after creation on attempt 2 |

- Every row **≤249 chars acked on attempt 1**; every row above the threshold needed attempt 2.
- **Four of ~12 sends in 75 min** required a retry.
- Signature: `deliveries.attempt == 2`, ~65 s gap between creation and ack — the positional-idempotency / partition-drift story (E29), the root cause item 24 fixes.

## Post-restart-#6 comparison contract

- Measure `deliveries.attempt` over **≥ 1 h** after restart #6 (which loads the item-24 fix + log-sink fold).
- The PA's **chore-6** line reports this every 20 min.
- **Acceptance**: no >249-char row should require attempt 2 once the fix is live; the log-sink tee (`telegram-bridge.log`) makes each attempt-2 event provable (mtime advances on first forward; a retried row carries its attempt-1 error line in the durable file).

## Links
- Log-sink fold cold-review packet: `reviews/item-24-log-sink-packet.md`
- Log-sink mechanical oracle: `tasks/item-24-log-sink/MUT-LOGSINK.patch`
