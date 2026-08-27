# Cold review packet — item 11 (pij-skill-check order-check fix + R1) · HARNESS · terminal-once
**Reviewer**: pij-joint-nightingale · **Commit**: `f6d3734` (+ `609c596` report) · **Diff**: `git show f6d3734` · **Base**: fa6378a (rebase to bc71a4b8 is the orchestrator's job post-review) · **C10**
**Fence**: `harness/scripts/pij-skill-check.sh` + `pij-skill-check.test.ts` + `orchestrator.md` (F5 revert). Blast radius: this gate runs on EVERY skill PR machine-wide.
**Allowed**: READ anything; WRITE only `reviews/item-11-review.md`.

## What to establish
1. **Req 1 (broken check fixed)**: the order loop no longer resolves a marker to an incidental backward cross-reference — it anchors to the canonical Ordered-entry section. Confirm a doc with a legit backward "human preamble" cross-ref now PASSES, and a genuine journey inversion still FAILS. (`marker_position` scopes to `ordered_entry`; verify the scoping is correct and can't be fooled by a marker outside the section.)
2. **R1 (missing check added) — the point of this item**: the check now asserts, in the Ordered-entry section, that `back verbatim` AND `confirm inline` both precede `After the human confirms the fleet` (line×100000+col). **Orchestrator already proved back-pressure**: a faithful mutant (step 11 reordered so fleet-confirm precedes read-back) now yields `✗ read-back precondition is out of order` — the EXACT inversion that stayed green through two prior passes. Verify the check can't be trivially bypassed (e.g. a second "back verbatim" mention gaming `marker_position`'s first-occurrence).
3. **Tests**: `pij-skill-check.test.ts` 3 cases (correct-order-with-cross-ref PASS, R1-mutant FAIL, genuine-inversion FAIL). Dim-0: confirm each test genuinely fails if its guard is removed (the fixtures are real, not vacuous).
4. **F5 revert call**: the coder restored "human preamble checkpoint" clarity, moved no ordered-entry step. Confirm reading order is not harmed and the real `just pij-skill-check` is 0 ✗.

## Verdict → `reviews/item-11-review.md`; report {summary,verdict,path}. Terminal-once.
