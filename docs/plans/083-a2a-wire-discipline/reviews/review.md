# Code Review: A2A Wire Discipline (Simple Mode)

**Plan**: /Users/jordanknight/pi-hacking/pij/docs/plans/083-a2a-wire-discipline/a2a-wire-discipline-plan.md
**Spec**: same file, § Business Specification
**Phase**: Simple Mode (single phase)
**Date**: 2026-08-04
**Reviewer**: Automated (review verb; 3 parallel lenses — content quality, domain/drift/anti-reinvention, testing evidence; doctrine folded in, N/A-heavy)
**Testing Approach**: Manual

## A) Verdict

**APPROVE** (with notes — 2 MEDIUM + 4 LOW findings, all fixed post-review or accepted with rationale; zero HIGH/CRITICAL)

## B) Summary

The C10 convention text satisfies AC-01..AC-04 verbatim (rule-by-rule verified, including the post-T008 rule 7); all 13 citation surfaces cite without restating; drift grep across signature phrases finds a single canonical copy; no citation contradicts its host module's report contract (first-line-then-detail composes with delegate/skill/reports shapes; receiver-verification duty is a local record, not a send, so the silence norm is compatible). Evidence coverage re-verified independently at 92%. The material findings were consistency edges of the convention itself: rule 1's "stop at line 1" could legally re-enact the incident rule 7 exists to prevent, and protocol.md's "clean verification sends nothing" needed scoping so it can't be read as skipping contract-mandated reports.

## C) Checklist

**Testing Approach: Manual**
- [x] Manual verification steps documented (T008 sweep, commands in log)
- [x] Results recorded with observed outcomes (grep counts, checks output)
- [x] Evidence artifacts present (execution.log.md, _computed.diff)
- [x] Only in-scope files changed (2 bookkeeping deviations, adjudicated in F004)
- [x] `harness checks --quick` ok (re-run by reviewer)
- [x] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | skills/pij/references/00-routing.md (C10 r1 vs r7) | consistency | "Reader may stop at line 1" lets a clean-sounding summary bury the verbatim contradiction rule 7 preserves | Require the summary line to NAME the contradiction — **fixed** |
| F002 | MEDIUM | skills/pij/references/prime/protocol.md:111 | wording | "A clean verification sends nothing" unscoped could excuse skipping contract-mandated checkpoint reports | Scope to received-claim verification; mandated reports still send pointers — **fixed** |
| F003 | LOW | skills/pij/references/00-routing.md (C10 r5) | wording | Sole flag `confidence: low` mislabels high-confidence corrections/dissent | Flag the trigger (`correction:` / `dissent:` / `confidence: low`) — **fixed** |
| F004 | LOW | execution.log.md T008 | evidence | Diff-confinement proof omitted the .harness retro record (2nd bookkeeping deviation) | Disclose in Noteworthy — **fixed** |
| F005 | LOW | skills/pij/references/prime/protocol.md:111-117 | drift | Paragraph restates substance of C10 r3/r5 beyond one-line fragments | **Accepted** — AC-07 mandates the fold-in; cites C10; flagged at implement time |
| F006 | LOW | docs/domains/domain-map.md pij-skill node | domain-map | Node label "shared conventions C1-C7" pre-existing stale, now 3 behind | Update to C1–C10 — **fixed** |

## E) Detailed Findings

Full reviewer outputs are summarized in D; anti-reinvention clean (C1–C9 and dispatch invariant 2 are orthogonal; invariant 8 was upgraded, not duplicated); domain compliance clean (no orphans; domain.md § History row present; registry skip matches plan-044 precedent for pure within-domain changes); doctrine N/A (harness.md/agent-harness.md impose nothing on prose edits).

## F) Coverage Map

| AC | Evidence | Confidence |
|----|----------|------------|
| AC-01..AC-07 | C10 text + 13 citation surfaces, independently re-grepped and read in context | 100% |
| AC-08 | Diff = skills/pij/** + plan folder + 2 disclosed bookkeeping files (domain.md, retro record) | spirit met; letter carved out in F004 |

**Overall coverage confidence**: 92% (reviewer-recomputed)

## G) Commands Executed

```bash
git diff main..HEAD > reviews/_computed.diff
grep -c "C10" <13 manifest files>            # 13/13
grep -rn "<signature phrases>" skills/pij/    # canonical copy only
harness checks --quick                        # ok (7 pass, smoke skipped)
```

## H) Handover Brief

**Review result**: APPROVE
**Plan / log / review**: docs/plans/083-a2a-wire-discipline/{a2a-wire-discipline-plan.md, execution.log.md, reviews/review.md}
**Files reviewed**: the 23-file commit b6271b5 on s083/a2a-wire-discipline (+ post-review fix commit).
**Handback**: Implementation complete — post-review fixes committed; ship is next (push + PR behind confirms).
