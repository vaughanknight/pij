# s040 reviewer brief
**Run**: `2026-07-11T12-47-50Z-github.com-AI-Substr`
**Delegation**: `dlg-0001`
**Acquire**: only after coder completion
**Model**: separate cold Copilot `gpt-5.6-sol` xhigh peer

## Review sources

- `docs/plans/040-memorable-pij-session-ids/memorable-pij-session-ids-plan.md`
- `docs/plans/040-memorable-pij-session-ids/validations/memorable-pij-session-ids-plan-validation.md`
- `docs/plans/040-memorable-pij-session-ids/rulings.md`
- `docs/plans/040-memorable-pij-session-ids/execution.log.md`
- `docs/plans/040-memorable-pij-session-ids/reviews/review-input.patch`
- `skills/flow-pair/references/review-rubrics.md`

## Mandatory review focus

- Primary-id replacement is complete across Pi, spawn, agent spawn, adopt, registry,
  filesystem, env, wire, telemetry, and Telegram surfaces.
- Existing opaque ids never migrate or rename.
- Deterministic two-word candidates do not repeat before corpus exhaustion.
- Claims are atomic; collisions retry without overwrite.
- Spawner death alone never reclaims a reservation that a launched child may hold.
- `adopt --id` is reattachment-only; unknown id is `E-NOID`.
- s038 `prime?: boolean`, FX001/FX002, baton, broadcast, and prime regressions remain.
- Package change is exactly one pinned dependency plus npm-generated lock closure.
- No PoC-only recipe/script returns.

## Verdict contract

- Apply the full 10-dimension rubric.
- CODE Dim-0 is mandatory: mutation-prove at least the collision/retry guard or the
  legacy-id preservation guard RED -> restore -> GREEN.
- Write `docs/plans/040-memorable-pij-session-ids/reviews/review.phase-1.md`.
- Report `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED` with exact findings and
  evidence. Do not edit product code.

## Patch evidence

- SHA-256: `5750000067f3f94e381f211972fb6cddd17bd067c85cf9c77d89adcbc3b956d5`
- Scope: only the coder packet's allowed product/documentation paths.
- The standard whole-worktree `flow-pair observe` artifact is intentionally not used
  because unrelated government and generated flight-plan changes are concurrently dirty.
