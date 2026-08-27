# Item-24 ADV-1 fold — re-confirm (hunk only, cold)

**Candidate**: `664194366ea0086f404c200dc2489583015645f2` — the item-24 idempotency (a27ab58) PLUS the ADV-1 fold. Cherry-pick onto FRESH main to verify (COORD-004).
**Prior verdict**: item-24 APPROVE at a27ab58 (`reviews/item-24-review.md`) — that stands; this re-confirms ONLY the ADV-1 fold hunk. **Write to** `reviews/item-24-adv1-fold-reconfirm.md`.

## The fold (o-prime ruling: silent-loss must not ship)
The positional part_index skip-set was only valid under the partition it was recorded against; a live git-context hiccup (prefix 43↔12ch) between original send and lease redelivery changed the part COUNT → the skip-set skipped the WRONG parts → silent TAIL LOSS + acked (652 chars lost on 7000-char body).
Fix: additive write-once `telegram_partitions` table records the FIRST `{partCount, prefixLength}` per message. On redelivery, positional skip applies ONLY when BOTH partCount AND prefixLength still match; on ANY mismatch (or legacy/missing identity), IGNORE the skip-set, SEND ALL parts, and do not write new marks under the wrong partition. Degrades to main's noisy-dup, NEVER silent loss.

## Dim-0 (MANDATORY, sha-verify RED→GREEN; line CODER-CLAIMED — verify against file)
- **MUT-DRIFT** (claimed bridge.test.ts:1255): mark a MISMATCHED partition valid (skip anyway) ⇒ RED — the drift test sends only 1 of 2 recomputed parts (the tail loss returns). THE headline.
- Confirm MUT-IDEMPOTENT / MUT-RETRY / MUT-LOGID still RED-able (the item-24 base guards survive the fold — same-partition idempotency intact).

## Dim-1
1. **Drift acceptance**: record parts under prefix A (3 parts, len 96), redeliver under prefix B (2 parts, len 13) ⇒ ALL parts sent, row acked, ZERO tail loss (all 8100 chars reassembled). Confirm this is the FOLD's behaviour, not the base's.
2. **Write-once**: the partition identity is recorded on FIRST send and NEVER overwritten (a redelivery under a drifted partition must not clobber the original identity — else drift becomes undetectable). Confirm INSERT-OR-IGNORE / write-once semantics.
3. **Legacy safety**: a message with NO partition identity (legacy row, or the sent-parts recorded before this table existed) falls through to SEND-ALL, not skip — migration-safe, never silent loss on the upgrade boundary.
4. **Same-partition unchanged**: when the partition matches, item-24's idempotent skip still fires (no regression to noisy-dup in the common case).
5. **Schema additive**: `telegram_partitions` is additive (CHECK constraints valid); fs backend untouched.
6. **No collateral** (E17): cherry-pick onto fresh main; vitest list + line-diff on the two test files; nothing removed/weakened.

Report verdict + MUT-DRIFT sha/RED line + Dim-1 findings to me. Then I run two green full runs → item-24 PR.
