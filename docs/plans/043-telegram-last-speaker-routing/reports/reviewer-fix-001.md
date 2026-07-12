# s043 targeted re-review — fix round 1

**Reviewer**: `pij-teenage-bee`
**Target**: `diff-0002`
**Prior**: `reviews/review.phase-1.md` (`FIX_REQUIRED`)
**Output**: `docs/plans/043-telegram-last-speaker-routing/reviews/review.phase-1-r2.md`

## Mission

Re-review only prior F-01/F-02, plus regression and scope. Do not edit source/tests/docs/plan/flow/ledger. Write the output artifact and send its path to `pij-rigid-minnow`.

## Required proof

1. F-01: verify the pi-peacock git subprocess has an explicit bounded timeout and exact footer assertions remain strong.
2. F-02: repeat the first-write-only production mutation; the strengthened A→B composition test must go RED, restore byte-identical, then GREEN.
3. Re-run targeted Telegram tests and targeted pi-peacock smoke.
4. Confirm `.pi/packages.yaml` clean and changed source files remain inside the fence/addendum.
5. State full-gate status from fresh evidence; separate environment-only failures from code findings.

## Verdict

- Any unresolved F-01/F-02, failed mutation, or regression -> `FIX_REQUIRED`.
- Medium-only -> `APPROVE_WITH_NOTES`.
- Otherwise -> `APPROVE`.
