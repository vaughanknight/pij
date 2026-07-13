# Cold Plan Revalidation R9 Request

**Artifact**: `/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch/docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md`
**Frozen sha256**: `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`
**Prior verdict**: `validation/compact-before-redispatch-plan-validation-r8.md`
**Post-PR9 base**: `1336291a5a2285d37487cf83bda86b7438ba93c4`
**Validator**: `/validate-v2`
**Mode**: cold, read-only

Revalidate the single R8 finding:

- AC-05/T001/T002/T004 now protect always-loaded root invariant 5 independently from C7.
- Required root markers cover `Delivery-owned waiting`, external `pij inbox --wait`, and prohibition on a `pij state` wait loop.
- T002 adds a new root completion invariant without altering invariant 5.
- T004 includes a root-invariant removal mutation that must fail.
- Compact no-`--wait` checks remain narrowly scoped and must not reject root/C7 inbox waiting.
- Domain and post-PR9 checklist preserve both root and C7 delivery contracts.

This follow-up is dispatched without waiting for the fire-and-forget compact sent at R8 completion. Product and skill files remain read-only.

Write the verdict under this plan's `validation/` directory and report its path plus the exact artifact sha judged.
