# Item-24 INVARIANT fold — re-confirm AS A SET (cold)

**Candidate**: `a6151aa977cbb008e1abb3ab5797e3b0083d1e31` — the full item-24 chain (a27ab58 → 6641943 → 588dd0e → a6151aa). **Cherry-pick the chain onto FRESH main** to verify (a6151aa reverts 588dd0e's T011 over-broad filter). Full-suite gate on THIS PR worktree, not the stream tree (E35). **Write to** `reviews/item-24-invariant-reconfirm.md`.
**o-prime ruling**: check the INVARIANT as a SET. A 4th finding must be a WRONG INVARIANT, not a missed sensor.

## THE INVARIANT (verify all five hold)
- (i) skip-set + partition identity cover the FULL sent set — body parts AND attachment fallback notices AND overflow captions (everything consuming nextTextPartIndex). partCount now = attachmentPlans.reduce(...) over the whole planned bubble set.
- (ii) identity = EVERY partition determinant: partCount + prefixLength + **prefix SHA-256 hash** (createHash; equal length ≠ equal partition — closes ADV-2). Additive `telegram_partitions.prefix_hash` (nullable ALTER migration; legacy hashless identity → untrusted/send-all).
- (iii) drift (ANY of the 3 components differs) → send ALL, do NOT record marks under the wrong partition; no drift → skip EXACTLY the marked set (T011's `index < partCount` REVERTED).
- (iv) EVERY identity component has a mirror mutant that REDs a distinct BEHAVIOURAL test: MUT-PARTCOUNT, MUT-PREFIXLEN, MUT-PREFIXHASH (each varies ONE, others fixed) + MUT-NOMARK.
- (v) partial-failure redelivery sends only the UNMARKED members — a succeeded ATTACHMENT NOTICE is NOT re-sent (closes ADV-1's dup).

## Dim-0 (MANDATORY, sha-verify RED→GREEN; lines CODER-CLAIMED — verify; RUN each, don't read)
- **MUT-PARTCOUNT / MUT-PREFIXLEN / MUT-PREFIXHASH** (claimed bridge.test.ts:118): drop each one component of the identity compare (hold others) ⇒ RED on its single-component drift probe. **Prove each is INDEPENDENTLY load-bearing** (a byte loss, not just arity).
- **MUT-NOMARK** (claimed bridge.test.ts:1512): remove the marking gate ⇒ RED on the A-B-A byte-coverage assertion.
- **ADV-1 closure (the attachment idempotence)**: MUT-IDEMPOTENT ⇒ the partial-failure-redelivery test REDs (the 2 marked bubbles re-sent = dup). Confirm the SUCCEEDED attachment notice is NOT re-sent on a clean redelivery (no dup on the neighbouring path this whole loop was about).
- Confirm MUT-DRIFT/RETRY/LOGID (prior guards) still RED-able.

## Dim-1 (as a SET)
1. The prefix HASH genuinely distinguishes equal-length-different-content prefixes (the ADV-2 case: context A/B same length 96, different content → different partCount AND different hash). MUT-PREFIXHASH must catch a same-length-same-partCount-different-content case if one exists.
2. The FULL sent set: attachment notices + overflow captions are covered by partCount/marks (not just body). The T011 attachment-dup regression is GONE (differential vs 588dd0e if useful).
3. Legacy safety: a hashless legacy identity → send-all (untrusted), migration-safe.
4. **If you find a 4th gap, state whether it's a WRONG INVARIANT (a determinant not in the identity, or a member not in the sent set) — that's blocking — vs a missed sensor on a covered component.**
5. No collateral (E17): vitest list + line-diff.

Report verdict + the 4+ mutation shas/RED lines + the invariant-as-a-set assessment. Then I run two green full runs on the PR worktree → item-24 PR (base current main; §14 provenance for #311).
