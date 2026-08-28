# Item-24 live-acceptance — PRE-FIX baseline

**Source**: o-prime `pij-relative-panther` cross-session messages (spine 30341 @ 2026-08-28 00:3xZ; UPDATE spine ~01:0xZ).
**Status**: durable evidence — recorded per iron rule 1. No ack owed (o-prime said so both times); this is a disk record, not a reply.

## UPDATE (spine ~01:0xZ) — supersedes the length hypothesis below

Since 23:15Z:
- **attempt-1 = 12 rows** (51–463 ch)
- **attempt-2 = 5 rows** (351–629 ch) — the four below **plus new seq 5439**
- **Ranges OVERLAP (attempt-1 up to 463, attempt-2 down to 351) → the failure is NOT length-correlated.** The earlier "≤249-char rows ack on attempt 1" reading is **refuted** — do not carry it forward.
- **~29% of sends fail attempt 1.**

### Consequence for 24b
If the ~29% attempt-1 failure rate **survives the single retry** after restart #6 (i.e. some rows still miss after retry, or the retry itself is unreliable), **24b's backoff becomes a PRE-TAG item** — it must land before the release tag rather than as a tail follow-up. Watched via `deliveries.attempt` over ≥1 h post-restart-#6.

## Initial baseline (spine 30341, pre-fix, main @ 188c877)

Attempt-2 rows to `pij-telegram` first reported:

| seq  | created | body chars | outcome |
|------|---------|-----------|---------|
| 4951 | 23:23Z  | 629 | acked ~65 s after creation on attempt 2 |
| 5014 | 23:37Z  | 417 | acked ~65 s after creation on attempt 2 |
| 5087 | 23:47Z  | 524 | acked ~65 s after creation on attempt 2 |
| 5386 | 00:35Z  | 351 | acked ~65 s after creation on attempt 2 |
| 5439 | (01:0xZ update) | (in 351–629 band) | attempt 2 |

- Signature (attempt-2): `deliveries.attempt == 2`, ~65 s gap between creation and ack — the positional-idempotency / partition-drift story (E29), the root cause item 24 addresses. **The trigger is NOT body length** (see UPDATE).

## Post-restart-#6 comparison contract

- Measure `deliveries.attempt` over **≥ 1 h** after restart #6 (loads the item-24 fix + log-sink fold).
- The PA's **chore-6** line reports this every 20 min.
- **Acceptance**: attempt-2 rate should collapse once the fix is live; the log-sink tee (`telegram-bridge.log`) makes each attempt-2 event provable (mtime advances on first forward; a retried row carries its attempt-1 error line in the durable file).
- **If the ~29% attempt-1 rate persists post-fix** (survives the single retry) → 24b backoff is pre-tag (above).

## Links
- Log-sink fold cold-review packet: `reviews/item-24-log-sink-packet.md`
- Log-sink mechanical oracle: `tasks/item-24-log-sink/MUT-LOGSINK.patch`
