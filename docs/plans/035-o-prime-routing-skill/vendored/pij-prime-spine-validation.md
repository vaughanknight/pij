# Validation — 035 requirements spine (r3, "CONVERGED")
**Validator**: pij-uec99o (o-prime, domain source) via /validate-v2 (adaptive: lead + deterministic proof + one independent critic) · **Date**: 2026-07-11 · **Target**: `/Users/jordanknight/pi-hacking/pij/docs/plans/035-o-prime-routing-skill/requirements-spine.md` (r3) · **Consumer**: Jordan's builder flow for plan 035.

## RE-CHECK (r4, 2026-07-11 ~05:35Z): ✅ **VALIDATED WITH FIXES**

All five findings folded and re-verified at source: R4.5 carries E-16's three rules intact (scratch-until-builds · yield-point compile check · non-owner-never-fixes + urgent-owner-fix escalation, both SEQ-06 receipts); R3.5 names the mandatory structure-tree field + tree-push; R7.3 captures dogfood-then-formalize *including its application to the route's own authoring*; R5.4 wires freeze+hash to AC-0's own audit; R8.6 legitimizes workshop-first. The **seed-ledger coverage map is complete**: E-01..E-16 each → requirement id (spot-read faithful), P-01..P-08 → R9.1..R9.8 1:1, H-01..H-06 → named exclusion. One optional rowlet: add E-17 → "§ convergence checklist rule" for self-reference completeness. Re-run scope was the failed check only (coverage), per contract.

---

*Original r3 verdict below, retained as history:*

❌ **NEEDS ATTENTION** — 0 critical, 1 high, 4 medium. **All five are OMISSIONS; zero misrepresentations found** — everything the spine states is accurate and receipt-true (deterministic checks below all passed). The r3 "CONVERGED" call was premature by one mechanical sweep: an E-coverage map (every encode-candidate → a requirement or a named exclusion). 11/16 E-entries are covered; the critic found exactly the missing 5.

## Deterministic proof (lead-run, all PASS)

- R8.3 schema statuses + nodeTypes match `prime-flow.schema.json` verbatim · R3.5 runbook = 16 steps · AC-0.4's self-grant receipt exists in the baton grant log · R2.6's digest-channel directive exists in the spine · the convergence quote matches answers-r1 exactly · E-15/E-16/P-08 exist in encode-candidates · pij `skills/pij/SKILL.md:17` carries "Progressive disclosure is the contract" verbatim + `references/routes/` structure matches R1.1 · `docs/fixes/FX002-*` exists (R9.4).

## Findings

| Severity | Finding | Evidence | Impact | Smallest fix |
|---|---|---|---|---|
| HIGH | **E-16 absent** (shared tree must COMPILE at every yield point; non-owner never fixes sibling's file; o-prime routes urgent owner-fix) — R4 covers only write-path partitioning | encode-candidates.md E-16 (proven bidirectionally 05:07Z + 05:23Z); spine grep compile/yield = 0 hits | The multi-stream yield/stop ritual — the collision class that bit run-01 TWICE in one hour — goes un-designed; fences read as sufficient and are not | New R4.5 encoding E-16's three rules, cite SEQ-06 both incidents. *(Chronology note, no fault: E-16's final direction-neutral form landed ~05:23Z, essentially simultaneous with r3.)* |
| MEDIUM | **E-04 elided in R3.5's summary** (structure tree in every brief + tree-push on roster change) | bootstrap steps 4/5.2 + encode-candidates E-04; R3.5's parenthetical omits both. Softener: R3.5 incorporates runbook 1–16 by reference (tree = step 14) — but the summary is what a skimming planner reads | Brief template + roster-change ritual planned without the tree and its fence-hygiene trigger | Name the structure-tree brief field + tree-push in R3.5/R2.3 text |
| MEDIUM | **E-13 lost by conflation** — the 04:45Z ruling appears only as R6.4's traffic exception; the author-teaches-consumer-before-checklist SEQUENCING pattern (and its never-sideways waiver shape) is unstated | encode-candidates E-13 vs spine R6.4 | Planner defaults to doc-first authoring for the route itself; the proven dogfood-then-formalize sequence is dropped | New clause near R1/R7 for E-13, distinct from R6.4 |
| MEDIUM | **E-11 absent** (plan-freeze+hash when a validator's target mutates mid-read) despite AC-0 being a validation run | encode-candidates E-11 (WIN-005); spine grep freeze/hash = 0 | AC-0's verify machinery vulnerable to mid-read target mutation | Add freeze+hash guard to R5 or AC-0 |
| MEDIUM | **E-14 absent** (workshop-before-flow-creation legitimate; record as pre-existing input at flow create) | encode-candidates E-14 (s020 preamble proof); spine grep workshop = 0 | Flow-create ritual rejects the proven workshop-first path | One builder-integration clause under R8.3/Non-goals |

**Thesis**: partial — the spine faithfully captures everything it contains (target proof = Contract, and its receipts are real), but its completeness claim (checklist row "non-negotiables covered") overreached: 5/16 encode-candidates unmapped.
**Consumers**: Jordan's builder flow — actionable after the five folds; nothing here re-opens the r1/r2 resolutions (payload home, P-splits, granularity, R2.6, R10 all stand).
**Open decision**: none for humans — all five fixes are 3vetx8-fence document additions with grounded receipts.

## Process note (self-finding, ledgered)

The domain source declared convergence green while missing five entries of ITS OWN ledger — the independent cold critic out-audited the author (E-12 proven at yet another layer). Encode candidate for the skill: **convergence checklists must include a mechanical coverage map** (every seed-ledger entry → requirement id or named exclusion) — completeness is checkable, don't leave it to the author's glow.
