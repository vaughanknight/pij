# Validation R6 — compact-before-redispatch-plan.md

- **Validated**: 2026-07-13T09:00:22+10:00
- **Target**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` (sha256 `35d9edb35aab5a2a10b3cdf389acb6a7ff3943bc3074295b237aae4c60e5d645`)
- **Contract sources**: `validation/plan-revalidation-r6-request.md`, `validation/compact-before-redispatch-plan-validation-r5.md`, `rulings.md` R5, `thesis.md`, `research-dossier.md`, `backpressure-coverage.md`, `reports/post-pr9-rebase-reread-checklist.md`, and current C3/pair contracts
- **Checks**: frozen sha256 match; unified-plan heading/AC/task/coverage/manifest checks; exact R5-finding cross-artifact search; current C3/pair source match; targeted compact-contract history lookup; `just pij-skill-check`; independent cold critique
- **Verdict**: NEEDS ATTENTION
- **Thesis / proof**: The plan body now cleanly specifies first-action, fire-and-forget compaction and resolves the C3 preservation boundary, but the dispatch checklist still ambiguously identifies the superseded R5-validated revision as the implementation contract.
- **Consumers**: T001–T006 are actionable; the post-PR9 operator remains blocked until the non-material branch unambiguously retains the current cold-validated v1.6 sha.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | The non-material-drift branch says to retain the “current R5-validated plan sha,” which can resolve to superseded v1.5 instead of current v1.6. | R5 validation records sha `5a4114d…` for v1.5, while the R6 request binds v1.6 sha `35d9edb…`; `reports/post-pr9-rebase-reread-checklist.md:6,55-56` acknowledges v1.6 needs a new cold validation but still labels the retained contract “R5-validated.” Replace that label with “current cold-validated plan sha” or explicitly name the current validation round/version/hash. | Open |
