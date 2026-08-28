# Cold RE-review — item 9 FIX (orchestrator.md semantic restorations) · new file, terminal-once
**Reviewer**: pij-joint-nightingale · **Prior**: `reviews/item-9-review.md` FIX_REQUIRED (F1 inverted read-back, F2 deleted roster-authority, F3 false C7 cite) · **Fix commit**: `346c19f` (+ `0aabb1c` report) · **Diff**: `git show 346c19f`
**Base for the fix**: bfbb08d (item 9). Do NOT re-review the APPROVED files (peer/prime/kickoff) or the unchanged 26/29 consolidations.

## Confirm ONLY the restorations (orchestrator.md + node.md)
- **F1**: read-back+confirm-inline now PRECEDES the human's confirmation/fleet-creation (a precondition, catching a mis-transcribed model before "yes") — verify the ORDER, not just the string's presence.
- **F2**: "the plan roster remains the durable configuration truth" (or equivalent authority clause) restored — the flow-pair-vs-roster conflict now has a rule.
- **F3**: `§ C7` now claims ONLY push-not-poll; outage-first is inline, not attributed to C7. Verify C7 actually contains push-not-poll and not outage-first.
- **F4** (was your medium): node.md "Size your text; do not discover the cap by hitting it" restored within 150/150.
- Gate still 0 ✗ (orchestrator 114/120, node 150/150). Confirm no NEW loss was introduced by the restorations.

## Verdict → `reviews/item-9-rereview.md`; report {summary,verdict,path}. Terminal-once.
