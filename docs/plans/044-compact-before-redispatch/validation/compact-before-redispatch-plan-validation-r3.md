# Validation R3 — compact-before-redispatch-plan.md

- **Validated**: 2026-07-12T21:29:46+10:00
- **Target**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` (sha256 `6d72eeb8fc0766b074de29e4e920f0902b554f67e709a923caf8ce422efb3736`)
- **Contract sources**: `validation/plan-revalidation-r3-request.md`, `validation/compact-before-redispatch-plan-validation-r2.md`, `rulings.md` R2-R4, current root/C3/pair/C7 skill boundaries, and the plan's manifest/tasks/coverage map
- **Checks**: frozen sha256 match; R2 finding closure; five-file manifest/task/path/grant consistency; AC-01..AC-10 and T001..T006 resolution; exact root/C3/pair/C7 ownership cross-check; `just pij-skill-check`; implementation-file worktree status
- **Verdict**: NEEDS ATTENTION
- **Thesis / proof**: The R2 five-file implementation deadlock is repaired, but the frozen READY plan still contradicts its exact C3/C7 ownership contract in a stated Goal.
- **Consumers**: Implementation remains blocked until the Goal matches AC-05/T001/T002/T004 and the plan is frozen and revalidated again.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | The Goals section assigns push-not-poll ownership to C3, while the exact implementation contract and live skill assign it to C7. Change the Goal to keep C3 responsible for timing/lifecycle/reuse/receipt and C7 responsible for push-not-poll. | `compact-before-redispatch-plan.md:22` says C3 owns push-not-poll; AC-05 (`:82`), T001 (`:185`), T002 (`:186`), T004 (`:188`), and the coverage map (`:200`) assign it to C7. Current `skills/pij/references/00-routing.md:45-47,61-63` confirms C3 and C7 are distinct owners. The R3 request explicitly requires exact ownership. | Open |
