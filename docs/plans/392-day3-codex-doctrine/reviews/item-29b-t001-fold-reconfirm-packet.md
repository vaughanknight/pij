# 29b-T001 fold — re-confirm (hunk only, cold)

**Candidate**: `87a0c135d09d12a958dd14c4daaeff7bf47805a1` — owner-via-watchers (816a726) PLUS the fold. Cherry-pick onto FRESH main (COORD-004).
**Prior**: 29b-T001 APPROVE at 816a726 (`reviews/item-29b-t001-review.md`) — stands; this re-confirms the fold that closes its ADV-1 (E28 vacuous test) + ADV-2 (E29 silent-loss honesty). **Write to** `reviews/item-29b-t001-fold-reconfirm.md`.

## The fold (o-prime ruling)
- **(a) ADV-1 (E28)**: the old 3-primes test was structurally vacuous (took no registry). A new `createBridgeRestartNotifier` FACTORY is extracted and driven by a REAL behavioural test with a registry (3 primes + a watcher); production uses that exact factory. A notify-nobody impl now REDs the behavioural test EVEN WITH the source-pin grep intact. The grep stays as a 2nd independent sensor.
- **(b) ADV-2 (E29 honesty)**: a `store.read` returning undefined now distinguishes ABSENT sidecar (valid "no watchers" skip) from an EXISTING unreadable/malformed one → logs "watchers file unreadable/malformed (N entries rejected)", never falsely "has no watchers".

## Dim-0 (MANDATORY, sha-verify RED→GREEN; lines CODER-CLAIMED — verify)
- **MUT-OWNER-BEHAV** (claimed daemon.test.ts:230): a notify-nobody closure ⇒ RED on the BEHAVIOURAL test — **even with the source-pin grep NOT deleted**. This is the E28 fix: prove the behavioural test alone catches it. (Contrast the pre-fold state where only the grep caught it.)
- **MUT-HONESTLOG** (claimed daemon.test.ts:276): revert the honest-log branch to "has no watchers" ⇒ RED (a malformed-sidecar case is no longer misreported as none).

## Dim-1
1. The behavioural test drives the REAL production factory (`createBridgeRestartNotifier`), not a stub — 3 primes + 1 watcher ⇒ exactly the watcher notified, primes NOT, and it FAILS a notify-nobody impl (the vacuity is gone). Confirm production calls the same factory.
2. ABSENT vs MALFORMED distinction is correct: an absent sidecar still logs the honest "no watchers" (valid); only an unreadable/malformed existing file logs "unreadable/malformed (N rejected)". Confirm N is the rejected-entry count.
3. The source-pin grep is retained as a 2nd sensor (belt-and-braces), not removed.
4. No behaviour change beyond observability + the test (the owner resolution itself is unchanged from the APPROVED 816a726).
5. No collateral (E17): cherry-pick onto fresh main; vitest list + line-diff.

Report verdict + the 2 mutation shas/RED lines + Dim-1 to me. Then I run two green full runs → 29b-T001's own small PR.
