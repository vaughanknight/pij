# s043 R9 cold review brief

**Reviewer**: `pij-teenage-bee`
**Spec**: `reports/change-002.md`, `rulings.md` R9, plan D001-D003
**Output**: `docs/plans/043-telegram-last-speaker-routing/reviews/review.r9.md`

## Mission

Cold-review idempotent same-sender canonical prefix normalization. Do not edit source/tests/docs/plan/flow/ledger.

## Required proof

1. Repeat normalization-removal/bypass mutation; exact duplicate tests must go RED, restore `bridge.ts` byte-identical, then GREEN.
2. Exact canonical prefix stays once; sender-tag-only upgrades once.
3. Different sender tags and arbitrary bracketed content remain content.
4. Normalization happens before text/caption budgeting; all prior limit/lossless overflow tests remain green.
5. Text chunks and media captions are covered; sender tag remains first.
6. Routing, reply parsing/threading, last-speaker, `onSpoke`, and sender-context-once invariants remain pinned.
7. Scope, diff check, package cleanliness, targeted tests, and isolated gate evidence.

## Verdict

- Critical/high or missing Dim-0 -> `FIX_REQUIRED`.
- Medium-only -> `APPROVE_WITH_NOTES`.
- Otherwise -> `APPROVE`.
