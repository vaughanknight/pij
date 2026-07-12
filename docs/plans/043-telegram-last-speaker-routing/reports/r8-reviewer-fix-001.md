# s043 R8 targeted re-review — prefix budgets

**Reviewer**: `pij-teenage-bee`
**Prior**: `reviews/review.r8.md` F-01 Medium
**Output**: `docs/plans/043-telegram-last-speaker-routing/reviews/review.r8-r2.md`

## Mission

Re-review only F-01 plus regression/scope. Do not edit source/tests/docs/plan/flow/ledger.

## Required proof

1. Repeat the full-body-budget mutation; boundary tests must go RED, restore `bridge.ts` byte-identical, then GREEN.
2. Prove every text send path is `<=4096` after prefix: ordinary body, chunked reply, oversize notice, attachment fallback, caption overflow.
3. Prove every media caption is `<=1024`.
4. Prove overflow captions reassemble losslessly as text before prefix-only media.
5. Confirm first-bubble reply threading, one `onSpoke`, one sender-context lookup, sender-tag parsing, and routing remain unchanged.
6. Run targeted Telegram tests, diff check, package cleanliness, and bounded scope.

## Verdict

- Unresolved limit/content/threading regression -> `FIX_REQUIRED`.
- Medium-only -> `APPROVE_WITH_NOTES`.
- Otherwise -> `APPROVE`.
