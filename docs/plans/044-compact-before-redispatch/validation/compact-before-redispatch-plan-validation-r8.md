# Validation R8 — compact-before-redispatch-plan.md

- **Validated**: 2026-07-13T10:10:23+10:00
- **Target**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` (sha256 `435783c5baa68d83b858afc4f0ea3866cef7926f5250862c50830784fc3b3dd5`)
- **Contract sources**: `validation/plan-revalidation-r8-request.md`, `rulings.md` R5, `thesis.md`, `research-dossier.md`, `backpressure-coverage.md`, `reports/post-pr9-rebase-reread-checklist.md`, and post-PR9 base `1336291a5a2285d37487cf83bda86b7438ba93c4`
- **Checks**: frozen sha256 and base/HEAD match; unified-plan heading, AC, task, coverage, and five-file manifest checks; old-base-to-PR9 diff of root/C1/C7/pair/gate/domain surfaces; historical `2d49d7^` and `eee2367` compact-first evidence; `harness boot`; `just pij-skill-check`; independent post-PR9 compatibility critique; `harness checks` (all sensors pass except the pre-existing D-032 fresh-worktree Pi trust-prompt smoke timeout)
- **Verdict**: NEEDS ATTENTION
- **Thesis / proof**: The plan correctly separates compact fire-and-forget from required inbox waiting, but its claimed post-PR9 preservation proof is incomplete because the root delivery-owned-waiting invariant is edited without deterministic protection.
- **Consumers**: T001-T006 are otherwise actionable; T001/T002/T004 need the root PR #9 invariant added to their marker, preservation, and mutation contract before implementation dispatch.

## Findings

| Severity | Finding | Evidence | Impact | Smallest fix | Status |
|---|---|---|---|---|---|
| MEDIUM | The plan protects C7's external-pull contract but does not mechanically protect the distinct root `SKILL.md` delivery-owned-waiting invariant required to remain intact. | The R8 request requires root/C1/C7/domain preservation. PR #9 changed `skills/pij/SKILL.md` invariant 5 to require external peers to block on `pij inbox --wait` and forbid a `pij state` wait loop. T001 and T004 protect only C7 push/pull markers; T002 edits the root while naming only C1/C7 as byte-faithful. The current `pij-skill-check.sh` has no root delivery/inbox/state marker. | T002 or a later refactor could remove the always-loaded PR #9 invariant while C7 and the structural gate remain green, recreating the silent-compression failure the plan is intended to prevent. | Extend T001 with an exact root marker for delivery-owned waiting, T004 with a root-removal mutation that must fail, and AC-05/T002 with explicit preservation of root invariant 5. | OPEN |
