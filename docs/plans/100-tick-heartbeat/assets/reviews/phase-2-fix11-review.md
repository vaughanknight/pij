# Phase 2 fix11 re-review - a993783e

**Verdict: REQUEST_CHANGES**

## P1 - an equally dispatched Phase 1 approval still states the false repair premise

`assets/reviews/phase-1-review.md:20-21` says the fixed-temp collision produces
a telemetry miss “repaired on the next tick.” Its no-fsync adjudication at
`:24-27` then concludes that a lost stamp is “regenerated on the next 600 ms
tick.” Both are the falsified premise: `runDaemon()` merely registers a
`setInterval` (`daemon.ts:1186-1192`); a stopped or crashed daemon has no
subsequent callback, and an event-loop-delayed callback has no 600 ms bound.

This is not a reason to rewrite the Phase 1 review. It is a dispatched review
record, and its `APPROVE_WITH_NOTES` verdict makes preserving the fact that the
review endorsed the wrong rationale especially valuable. But it needs the same
adjacent annotation now added to `review-packet-phase-1.md`: the original
assertion was falsified; a later tick may rebuild a missing stamp **if one
runs**; and no-fsync remains sound because the missing stamp reads
`unverified`, not because regeneration is guaranteed.

The new distinction is otherwise correct:

- `assets/research-dossier.md:31-42` is a live rationale, so replacing the
  claim and retaining a correction note is right.
- `assets/reviews/review-packet-phase-1.md:62-67` is evidence of what was
  dispatched, so annotating rather than rewriting it is right.

The durable rule is artifact role, not who authored the claim: preserve a
historical dispatch verbatim, but annotate any falsified technical conclusion
that otherwise stands uncorrected for a reader of that artifact. The Phase 1
review is such a dispatch and presently lacks that annotation.

## Confirmed

- The corrected dossier uses the conditional form and identifies
  missing-stamp-to-`unverified` degradation as the actual safety property,
  which `core/receipts.ts:31-33` proves.
- The packet annotation is immediately adjacent to the retained false claim,
  clearly distinguishes the old position from the correction, and preserves
  the record rather than silently revising it.
- I derived the audit set from `git diff origin/main...HEAD --name-only`
  (40 paths), rather than enumerating filenames from memory. This finding is
  outside the claimed nine framed hits.

No reviewer-authored mutant was warranted: this commit changes documentation
only, and the finding is a source-verifiable claim about scheduler progress.
