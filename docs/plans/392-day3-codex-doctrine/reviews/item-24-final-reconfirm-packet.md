# Item-24 FINAL fold (bubblesHash) — re-confirm AS A SET (cold; RE-RUN the W2 differential)

**Candidate**: `b1f0e0a8e9d1626d64552ee08c3566b0b658d192` — chain a27ab58→6641943→588dd0e→a6151aa→b1f0e0a. **Cherry-pick onto FRESH main** (b1f0e0a REPLACES the 3-component identity with bubbles_hash). Full-suite on the PR worktree (E35). **Write to** `reviews/item-24-final-reconfirm.md`.
**Your prior REQUEST CHANGES (W1 media dup, W2 distribution-alias omission) drove this.** Confirm both are CLOSED — RE-RUN your exact differentials, don't read.

## THE CORRECTED INVARIANT (o-prime, verbatim — verify it now HOLDS as a set)
"Delivering a message means executing an ORDERED PLAN of bubbles (text parts, oversize/fallback notices, media — everything that would be sent); the identity is sha256 of the serialized plan; each bubble is marked by index after its positive Telegram ack; a redelivery whose plan hash matches sends exactly the unmarked bubbles; any other hash sends the whole plan."
Confirmed structurally by me: bubbles_hash TEXT (additive ALTER; old part_count/prefix_length/prefix_hash are ignored placeholders); the serialized plan includes MEDIA (`["media", mediaKind, path, caption]`) + text + notices + captions; mark-on-ack.

## Dim-0 mutant SET (RUN each, greps deleted; lines CODER-CLAIMED — verify)
- **MUT-HASH** (claimed bridge.test.ts:1261) — **THE W2 FIX**: ignore the plan-hash mismatch ⇒ RED the SAME-SUM DISTRIBUTION-ALIAS test (the exact W2 scenario: pass1 {oversize-A, media-B, oversize-C-fails}; pass2 {media-A, oversize-B, oversize-C}; same old-partCount) — under the mutant a bubble is silently skipped/omitted. **I did NOT independently re-apply this (my regex missed the comparison); YOU are the authoritative W2 check — re-run your original W2 differential and confirm a6151aa's silent omission is GONE on b1f0e0a.**
- **MUT-MEDIA-UNMARKED** (claimed :1309) — THE W1 FIX: resend a marked media bubble on same-hash redelivery ⇒ RED. Re-run your W1 differential (body + in-limit media, body fails once → media delivered ONCE now, not 2x).
- **MUT-NOMARK** (claimed :1204); **MUT-PARTIAL** (claimed :1346, mark-on-send-not-ack → a failed bubble skipped ⇒ RED — load-bearing for the live-hang acceptance (c)).
- Confirm MUT-DRIFT/IDEMPOTENT/RETRY/LOGID still RED-able.

## Dim-1 (as a SET — the invariant should now HOLD)
1. W2 CLOSED: the same-sum-different-distribution case now differs in hash → send-all, NO silent omission (re-run the a6151aa differential).
2. W1 CLOSED: media is indexed + marked + skipped on same-hash redelivery → NO media dup (re-run the sendMedia differential you built).
3. Mark-on-ack: a bubble that sent but whose ack outran the window is MARKED (or not, if it truly didn't ack) — MUT-PARTIAL pins mark-on-ACK not on-send.
4. Accepted degradation holds: plan nondeterminism → hash change → send-all (a DUP, never an omission).
5. Legacy/null-hash → send-all (migration-safe).
6. **A 5th finding, if any, must be a WRONG INVARIANT (a determinant not in the serialized plan / a member not in the plan). The plan is now the full ordered bubble set — is anything sent to the operator NOT in it?** (This is the terminal check.)

Report verdict + the mutant results + the W1/W2 differential outcomes. Then I run two green full runs on the PR worktree → item-24 PR (base current main; §14 provenance for #311). NOTE: the live multi-bubble-HANG (≥417B acks only on attempt 2) is a SEPARATE item-24 fix pass — NOT in this fold; (c) of its acceptance relies on this fold's mark-on-ack.
