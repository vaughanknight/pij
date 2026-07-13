# Cold review brief — s046 T001-T004

**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0001`
**Base**: `347b6dd732110bc76b3d421e61a401cc228149d6`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s046-pij-real-trees`
**Reviewer profile**: separate Copilot `gpt-5.6-sol` xhigh

## Review target

Review only the T001-T004 implementation diff in:

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/tree.ts`
- `.pi/extensions/pij/core/tree.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/ports.ts`
- `.pi/extensions/pij/adapters/git-repository.ts`
- `.pi/extensions/pij/adapters/git-repository.test.ts`
- `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/execution.log.md`

Read:

- `docs/plans/046-pij-real-trees/pij-real-trees-plan.md` — T001-T004, AC-02/04/05/06/07/08/09/10/14
- `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/tasks.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0001.md`
- `skills/flow-pair/references/review-rubrics.md`
- current unchanged `core/close.ts`, `core/types.ts`, `core/discovery.ts`, `core/ports.ts`

## Mandatory checks

1. **Scope**: no modified path outside the target list.
2. **Contract**:
   - `parentId?: SessionId | null`;
   - effective parent precedence is explicit id → explicit root `null` → legacy `spawnedBy`;
   - write-time cycle refusal and render-time graph traversal share the same effective-parent function;
   - corrupt legacy cycles terminate explicitly;
   - `filterByFolder` remains exact-cwd and repository selection is additive;
   - git adapter uses argv-only process execution and canonical absolute `--git-common-dir`.
3. **TDD/ACs**: negative/state assertions cover self/unknown/cycle/no-write, null suppressing fallback, orphan/filtered-parent/cycle output, linked-worktree equality, unrelated/non-git/missing-folder behavior.
4. **Regression**: targeted tests, close ownership tests, typecheck, and lint.
5. **Dimension 0 — required**: empirically mutate at least one load-bearing graph guard and one repository guard; prove RED, restore byte-identical, prove GREEN. Use a safe temporary backup/restore method or `just flow-pair-mutate` with targeted tests. Never leave a mutation applied.

## Verdict

Write `docs/plans/046-pij-real-trees/reviews/review-t001-t004.md` with:

- `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`;
- findings by severity with exact path:line evidence;
- commands and results;
- mutation guard, expression/edit, RED evidence, restored GREEN evidence, and load-bearing assertion;
- scope diff list;
- remaining uncertainty.

Do not modify product code. Do not edit `.flow-pair/**`, flow-state files, government, skill, docs, smoke, or any T005+ path.
