# Validation R5 — compact-before-redispatch-plan.md

- **Validated**: 2026-07-13T08:36:00+10:00
- **Target**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` (sha256 `5a4114d474d3f02eb03987da263b61034c586792c1ceefefaf76593abd9d0676`)
- **Contract sources**: `validation/plan-revalidation-r5-request.md`, `rulings.md` R5, `thesis.md`, `research-dossier.md`, `backpressure-coverage.md`, `reports/post-pr9-rebase-reread-checklist.md`, current C3/pair contracts, and the historical compact-early section
- **Checks**: frozen sha256 match; unified-plan heading/AC/task/coverage/manifest checks; R5 cross-artifact consistency search; current C3/pair source match; historical `2d49d7^`/`eee2367` comparison; `just pij-skill-check`; independent cold critique; full harness inventory (all non-smoke sensors passed; smoke exposed pre-existing worktree trust/path assumptions)
- **Verdict**: NEEDS ATTENTION
- **Thesis / proof**: The plan's ACs and implementation tasks encode first-action, no-`--wait`, immediate-continuation behavior, but two retained pre-R5 handoff statements can restore the superseded receipt gate.
- **Consumers**: Implementation tasks are actionable, but the post-PR9 dispatch checklist is unsafe until it retains the validated v1.5 contract and the C3 summary is made unambiguous.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | The non-material-drift branch retains superseded plan v1.4 instead of the R5 v1.5 contract. | `reports/post-pr9-rebase-reread-checklist.md:5-6,55-56` distinguishes v1.4 from v1.5, then tells the operator to preserve v1.4. Retain v1.5 sha `5a4114d…` and its R5 validation instead. | Open |
| MEDIUM | The plan and dossier still describe current C3 as semantically correct/preservable even though its receipt-before-pointer ordering is what R5 supersedes. | `compact-before-redispatch-plan.md:12,164`, `thesis.md:7`, and `research-dossier.md:60` conflict with the explicit replacement contract at plan lines 81, 152, 185-189 and dossier line 22. Preserve C3 ownership, completion timing, and safety, but explicitly replace receipt gating. | Open |
