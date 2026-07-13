# Validation R9 — compact-before-redispatch-plan.md

- **Validated**: 2026-07-13T10:18:22+10:00
- **Target**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` (sha256 `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`)
- **Contract sources**: `validation/plan-revalidation-r9-request.md`, prior R8 verdict, post-PR9 base `1336291a5a2285d37487cf83bda86b7438ba93c4`, root `SKILL.md` invariant 5, C1/C7, `pij-skill-check.sh`, `pij-skill/domain.md`, and `reports/post-pr9-rebase-reread-checklist.md`
- **Checks**: frozen sha256 and base/HEAD match; focused AC-05/T001/T002/T004 marker and mutation-contract checks; root-vs-C7 ownership and compact-no-`--wait` scoping review; acceptance/task count checks; `harness boot`; baseline `just pij-skill-check`; independent focused compatibility critique; `harness checks` (all sensors pass except the pre-existing D-032 fresh-worktree Pi trust-prompt smoke timeout)
- **Verdict**: VALIDATED
- **Thesis / proof**: Plan v1.8 independently protects root invariant 5 through exact root markers, preservation wording, and a root-removal mutation while separately protecting C7. Compact no-`--wait` checks are scoped to compact dispatch and explicitly prove that required root/C7 `pij inbox --wait` delivery remains green.
- **Consumers**: T001–T006 are actionable and cover AC-01–AC-10; implementation remains gated by the plan's exact five-file grant and build-profile preconditions.

## Findings

No material findings.
