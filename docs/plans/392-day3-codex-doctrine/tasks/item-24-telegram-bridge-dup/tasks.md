# Item 24: Telegram bridge — idempotent parts (no dup on redelivery) + spec §14

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 24) · **Ruling**: `../../rulings.md` (2026-08-28 item 24) · **Docs**: `docs-task.md` (spec §14). **Order**: after 29.
**Base**: main (fetch at dispatch; cherry-pick fresh-from-main, COORD-004). CODE + DOCS.
**Fence**: `telegram/bridge.ts` (+test); the per-part persistence store — likely `adapters/sqlite-queue.ts` (+test) or a receipts-like side-record (additive schema ONLY); `docs/specs/claude-copilot-sqlite-sockets-comms.md` (§14). Evidence: `~/.pij/telegram-bridge.log:99-102`, receipts seq 3263.

### Root cause (verified)
`forwardOne` (`bridge.ts:562-655`): loops chunked parts, `await deps.send(bubble, replyTo)` (`:583`); on failure `undeliveredText += 1` (`:587`); returns `{undeliveredText}`. The SQLite consumer (`:665-667`): `if (undeliveredText > 0) throw ForwardIncomplete` → the row stays CLAIMED (never acked) → lease sweep redelivers → `forwardOne` re-sends EVERY part with NO memory of which already sent → duplicate. At-least-once (item-3b) became at-least-TWICE.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (c: log msg id — cheapest, do first) | every "forwarded" log line carries the messageId (+ part index/total). Today they carry none, so the log cannot prove one vs two forwards. RED-first: a test asserting the forwarded log line includes the messageId. | pij-control-plane | `telegram/bridge.ts` (+test) | RED→GREEN; forwarded lines are attributable | this alone makes the next dup diagnosable |
| [ ] | T002 (a: retry-survives accounting) | within one `forwardOne`, a part that EVENTUALLY sends (after `deps.send`'s internal retry) is NOT counted undelivered — count undelivered only for a part that TRULY did not land. RED-first with a fake `send` that throws once then succeeds ⇒ undeliveredText 0 (today it may be 1). | pij-control-plane | `telegram/bridge.ts` (+test) | RED→GREEN | be precise about what "internal retry" is: if `deps.send` itself retries, its resolve == sent; if forwardOne must retry, add a bounded per-part retry and count undelivered only after it's exhausted |
| [ ] | T003 (b: idempotent parts — the core) | persist per-message which chunk indices SUCCEEDED; on a redelivered claim, `forwardOne` SKIPS already-sent parts and sends only the remainder. Additive persistence (a `sent_parts`/bitmap column on the queue row, or a side-record keyed by messageId) — a legacy row with no record behaves as today. RED-first: send msg with 3 parts, part 2 fails → redeliver → ONLY part 2 (+3) re-sent, parts already sent are NOT duplicated. | pij-control-plane | `telegram/bridge.ts` (+test), `adapters/sqlite-queue.ts` (+test) if the store lives there | RED→GREEN; redelivery sends exactly the unsent parts | additive schema; legacy/fs backend unchanged; state the store choice in the report |
| [ ] | T004 (headline test — the ruling's) | a fake Telegram client that FAILS ONCE then SUCCEEDS ⇒ exactly ONE bubble delivered, the row ACKED (not redelivered). This is seq-3263 reproduced + fixed. | pij-control-plane | `telegram/bridge.test.ts` | one bubble, row acked | the acceptance test |
| [ ] | T005 (docs §14) | apply `docs-task.md`: update `docs/specs/claude-copilot-sqlite-sockets-comms.md` §14 outstanding — the measured ack answer + receipt taxonomy + durable-ack-wins + the daemon-origin-vs-reader note. META-FREE, one paragraph, cite `reports/item-23-ack-measurement.md`. | pij-skill/docs | `docs/specs/claude-copilot-sqlite-sockets-comms.md` | §14 updated per docs-task.md | no item numbers/seats |
| [ ] | T006 | gates + pathspec commit + `reports/item-24-report.md` | pij-control-plane | reports/ | recorded | one PR |

### Cold-review Dim-0 (mandatory)
- **MUT-IDEMPOTENT**: make the redelivered claim NOT skip already-sent parts ⇒ T003/T004 RED (the duplicate returns).
- **MUT-RETRY**: count a retried-then-sent part as undelivered ⇒ T002 RED.
- **MUT-LOGID**: drop the messageId from the forwarded line ⇒ T001 RED.
- Verdict artifact records sha + RED line each.

### Open
- The persistence store for (b): additive column on the sqlite message/delivery row vs a receipts-like side-record. Prefer whichever keeps the fs backend and legacy rows unchanged; state the choice.
- Crash-mid-forward: if the bridge dies AFTER sending part 1 but BEFORE recording it (item 29's die-loud helps observe this), redelivery would still re-send part 1. Bound the exposure honestly — the record must be written as-soon-as each part acks, not batched at the end. Note the residual window.
- fs backend: the legacy `FsChannel.watch` log-and-continue path (`bridge.ts:676-680`) does not throw ForwardIncomplete — confirm the idempotency fix targets the SQLite claim→ack path (the default) and leaves fs unchanged.

## ADV-1 FOLD (o-prime ruling 2026-08-28 — HOLD merge until done)
The positional part_index skip-set is only valid under the partition it was recorded against; the partition is recomputed live from `resolveRepositoryContext()` (git subprocs, undefined on any hiccup), so a prefix drift (43ch↔12ch) between original send and lease redelivery changes the part COUNT → the skip-set skips the WRONG parts → silent TAIL LOSS + row acked (reproduced: 652 chars lost on 7000-char body). Worse than main (silent loss vs noisy-but-complete dup).
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | T007 (ADV-1) | persist the partition IDENTITY alongside the sent-parts set — the part COUNT and the prefix LENGTH (so a partition recorded under prefix A is detectable when redelivering under prefix B). On ANY mismatch (count or prefix-length differs), IGNORE the skip-set and send ALL parts — degrade to main's noisy-dup, NEVER a silent loss. | `telegram/bridge.ts`, `adapters/sqlite-queue.ts` (+tests) | RED→GREEN | additive schema (extend telegram_sent_parts or a sibling record); legacy rows (no identity) fall through to send-all safely |
| [ ] | T008 (drift test — the ruling's) | record parts under prefix A, redeliver under prefix B (different part count) ⇒ ALL parts sent, row acked, ZERO tail loss. Mutation-prove MUT-DRIFT (remove the mismatch→send-all guard ⇒ this test RED with a lost tail). | `telegram/bridge.test.ts` | drift → send-all, no loss | the o-prime's acceptance test |

Then: re-review THE FOLD HUNK + two green full runs → the item-24 PR. ADV-2/3/4 → item 24b.

## ADV-1 FOLD HARDENING (o-prime ruling — pre-merge; E28 unsensored guards never ship on the silent-loss path)
The fold CODE is correct (differential-proven zero loss) but 2 guards have NO test (both mutations green). Add the tests + one correctness one-liner. Base = the fold candidate 6641943.
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | T009 (MUT-PREFIXLEN sensor) | STABLE-COUNT drift test: a body where partCount is EQUAL under both prefixes but prefixLength DIFFERS (7000 chars = 2 parts under prefix 96 AND prefix 12, boundaries 3993 vs 4077) → redelivery must SEND ALL, zero loss. MUT-PREFIXLEN (compare partCount only, drop prefixLength) MUST RED on THIS test. | `telegram/bridge.test.ts` | RED→GREEN; MUT-PREFIXLEN reds | today it's fully green — 84 chars lost |
| [ ] | T010 (MUT-NOMARK sensor) | 3-pass A→B→A marking probe: pass1 short-prefix fails entirely; pass2 drifts to long-prefix, only 1/3 lands (writes a mark under B's partition); pass3 drifts back to A → the tail must still send (pass3 must not read B's mark as A's part). MUT-NOMARK (remove the `if (positionalPartsValid)` marking gate) MUST RED. | `telegram/bridge.test.ts` | RED→GREEN; MUT-NOMARK reds | measures byte coverage, not part count |
| [ ] | T011 (ADV-3 one-liner + test) | scope the skip-set to `index < partCount` so caption/attachment sendText (which shares nextTextPartIndex) cannot drift under a matching identity. Add a test: attachment-index drift with a matching body identity → the caption text is NOT wrongly skipped. | `telegram/bridge.ts` (+test) | RED→GREEN | body was already safe; this pins caption text |
| [ ] | T012 | re-run gates; the same item-24 PR ALSO carries the §14 provenance note (for issue #311). Base bab9854. | — | recorded | ADV-4 → 24b |

Then: cold re-review of the fold hunk + two green full runs → item-24 PR fresh from main (base bab9854).
