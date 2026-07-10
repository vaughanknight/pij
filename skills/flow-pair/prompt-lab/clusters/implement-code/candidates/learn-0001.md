# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-07-09T01-36-49Z-github.com-AI-Substr
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-07-09T02:12:59.549Z

## Summary

Tested one of two AND-ed thresholds: the pointer-vs-inline decision guards on (lineCount<=MAX && byteCount<=MAX), but only the line-cap branch had a test — the byte-cap branch was vacuous (a mutation survived GREEN).

## Evidence

- review-dlg-0001: mutating 'byteCount<=DIFF_INLINE_MAX_BYTES'->true left all tests green
- fix added a <=60-line but >4KiB diff test asserting pointer delivery (AC-05).

## Candidate prompt delta

When a decision ANDs two independent thresholds, write a test that trips EACH guard in isolation (one case that exceeds only threshold A, one only B) — a case that trips the first short-circuits the second.

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
