# Validation record — pij-data-dogfood-migration-plan.md

**Validator**: pij-civilian-takin (lead) + one independent critic (adaptive scope)
**Date**: 2026-07-18 · **Verdict**: ✅ **VALIDATED WITH FIXES** (5 findings, all folded)

- **Target**: `docs/plans/057-pij-data-dogfood-migration/pij-data-dogfood-migration-plan.md`
- **Proof**: real-data survey (191 spine.md events @ Seq 195; 14 prime-flow nodes; 1394 registry descriptors, read-only); s054 store contract read from shipped source (`buildSpineEvent`, `resolvePijHome`, append-only spine); upstream = accepted proposal `docs/plans/054-pij-grown-up/reports/migration-dogfood-proposal.md` + Jordan's cutover ruling.
- **Thesis**: advanced — plan makes the equivalence proof (not the importer) the load-bearing deliverable, matching the proposal o-prime accepted.
- **Consumers**: o-prime (plan acceptance), Jordan (P1 workshop), s057 build fleet.

## Findings → disposition

| # | Sev | Finding (essence) | Fold |
|---|---|---|---|
| F1 | CRITICAL | `resolvePijHome({})` defaults LIVE `~/.pij`; empty env silently falls back — "staging" by convention is a hard-stop leak | Non-Goals mechanical-gate text + **AC-09** (assert-and-abort, test-proven) |
| F2 | CRITICAL | Completeness/soundness/round-trip all project through ONE ruled extractor → omitted fact class is symmetrically invisible (wrong-but-green) | **AC-10** residue ledger: all 191 paragraphs fact-mapped or residue-classified with reason; equivalence-design §1 amended |
| F3 | HIGH | `actor` mandatory but the 191 events predate attribution; unruled placeholder policy → importer either fabricates or crashes | P1 workshop item 3 (placeholder-actor + provenance policy); **AC-05** amended (`asserted` ≠ fabrication) |
| F4 | HIGH | Prose ts is `HH:MMZ` only (no date); platform `seq` is append-allocated ≠ governance Seq — AC-06 was uncheckable as written | P1 workshop item 4 (date-reconstruction + Seq-as-own-field); **AC-06** amended (pinned granularity) |
| F5 | MED | Registry source imported but never proven — silently out of the equivalence frame | **AC-11** registry completeness/soundness incl. collision honesty (11 known pane+pid collisions surface, never reconciled) |

## Open (human) items — by design, not defects
- P1 workshop rulings 1–4 are Jordan's (contract territory; plan explicitly gates coder dispatch on them).
- Plan acceptance is o-prime's; cutover flip remains a separate Jordan ruling (out of scope, AC-08 stops at checklist).
