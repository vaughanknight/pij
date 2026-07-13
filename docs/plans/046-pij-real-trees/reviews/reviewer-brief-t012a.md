# Cold review brief — s046 T012 Stage A

**Grant**: Spine Seq 188 + refreshed Seq 191
**Delegation**: `dlg-0006`
**Immutable cumulative diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0010.patch`
**Stage A product delta**: `harness/scripts/smoke.ts`, `harness/scripts/smoke.test.ts`

## Mandatory checks

1. Default smoke command uses official `pi --approve --no-extensions`.
2. It loads every top-level project-local `.pi/extensions/*/index.ts` exactly once
   using deterministic sorted, safely quoted `--extension` entries.
3. No hardcoded machine/worktree path.
4. Explicit scenario `cmd` remains byte-for-byte authoritative.
5. Importing smoke resolver is side-effect free.
6. Full smoke scenarios pass, including cross-extension `todo` -> `/sql`.
7. Scratch topology proof used explicit reviewed-worktree CLI and isolated `PIJ_HOME`;
   source registry remained unchanged.
8. Scratch before/after hashes prove only `parentId` changed; `spawnedBy` and unrelated
   fields unchanged.
9. Scratch repository/global/subtree/filter/human/JSON outputs satisfy the contract.
10. All five mutations are real RED→restore→GREEN:
    - no approve;
    - override precedence;
    - spawnedBy corruption;
    - repository inversion;
    - deep serializer regression.
11. Accepted full harness checks include smoke and every other sensor; package audit
    date churn was restored owner-side without rerun.
12. No Driver/product/skill/domain/package/real-registry/restart/git/Stage B change.

## Commands

- `just test harness/scripts/smoke.test.ts`
- `npm run smoke -- pij`
- full `harness checks`
- relevant T001-T011 regressions
- inspect `.harness/temp/s046/evidence/` hashes/outputs

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t012a.md` with terminal verdict,
findings, mutation matrix, scratch proof assessment, full-gate evidence, exact scope,
and remaining Stage B uncertainty. No edits.
