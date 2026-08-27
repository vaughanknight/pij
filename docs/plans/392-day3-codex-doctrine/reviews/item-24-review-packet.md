# Item 24 review packet — bridge idempotent parts + spec §14 (cold, CODE)

**Candidate**: `a27ab584b7ae15f351e3c5099cb1b4014c598971` (base reconciled to main; cherry-pick onto FRESH main to verify — COORD-004).
**Dossier**: `../tasks/item-24-telegram-bridge-dup/tasks.md`. **Write verdict to** `reviews/item-24-review.md`.
**Files**: telegram/bridge.ts(+test), adapters/sqlite-queue.ts(+test), docs/specs/claude-copilot-sqlite-sockets-comms.md.

## What this lands (fixes the dup on the operator's phone, seq 3263)
- **(b) idempotent parts**: an additive `telegram_sent_parts` side table (message_id + zero-based part_index). `forwardOne` reads `telegramSentParts(messageId)`, SKIPS already-sent chunk indices on redelivery, and `markTelegramPartSent` after each send. Legacy rows have no records ⇒ behave as before; fs backend unchanged.
- **(a) retry-survives**: a transient text-part failure gets ONE bounded retry; only a truly-failed part counts undelivered.
- **(c) log id**: every forwarded line carries `<messageId> part N/M`.
- **§14**: a "Transport receipt provenance" paragraph (measured ack ceiling + taxonomy sent/confirmed/failed/unverified + durable-reader-outranks rule + the daemon-origin "acked(reader=)" caveat), citing item-23-ack-measurement.md, meta-free.
- Honest residual: a crash AFTER Telegram accepts a part but BEFORE markTelegramPartSent commits can still repeat that part.

## Dim-0 mutation gate — MANDATORY, sha-verify RED→restore→GREEN (lines CODER-CLAIMED — verify against file [DL-011])
- **MUT-IDEMPOTENT** (claimed bridge.test.ts:1204) — headline: make redelivery NOT skip already-sent parts ⇒ RED (the seq-3263 duplicate returns). Verify hardest.
- **MUT-RETRY** (claimed :1159): count a retried-then-sent part as undelivered ⇒ RED.
- **MUT-LOGID** (claimed :1124): drop the messageId from the forwarded line ⇒ RED.

## Semantic checks (Dim-1)
1. **Additive schema**: `telegram_sent_parts` is additive; a legacy DB with no table/rows still forwards correctly (migration-safe); the fs backend (`bridge.ts:676-680` log-and-continue) is untouched — the idempotency targets the SQLite claim→ack path only.
2. **markTelegramPartSent timing**: the record is written AS SOON AS each part acks (not batched at the end) — else the crash window is wider than stated. Confirm the residual is exactly "accept-then-crash-before-commit", not broader.
3. **Redelivery correctness**: on redelivery only UNSENT parts are re-sent AND reply/speaker state is restored (a partial resend must still thread correctly). Confirm no part is dropped (under-send) nor duplicated (over-send).
4. **Retry bound**: the one retry is bounded (no infinite retry loop on a persistently-failing part → it eventually counts undelivered → ForwardIncomplete → lease redeliver, which now skips the sent parts).
5. **§14 accuracy**: the paragraph matches the measured facts (item-23-ack-measurement.md) and the durable-ack/marker-origin ruling; no item numbers/seats.
6. **No collateral** (E17): cherry-pick onto fresh main; vitest list + line-diff, nothing removed/weakened. gatesClean:false = pre-existing only.

Report verdict + the 3 mutation shas/RED lines + Dim-1 findings to me.
