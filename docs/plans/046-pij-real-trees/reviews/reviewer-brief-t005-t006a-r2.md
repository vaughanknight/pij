# Focused re-review — s046 T005-T006A R2

**Original review**: `reviews/review-t005-t006a.md`
**Fix**: `reviews/fix-t005-t006a-r1.md`
**Current diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0005.patch`

## Question

Does the new daemon failure regression close the sole blocking finding without scope or regression?

## Required checks

1. Verify table coverage includes explicit parent id and `parentId:null`.
2. Verify each case also asserts `gitCommonDir`, `spawnedBy`, lifecycle `failed`, and existing failure behavior.
3. Reapply the exact metadata-strip mutation inside daemon `fail()`:
   - new tests RED;
   - restore implementation byte-identical;
   - daemon tests GREEN.
4. Verify R1 changed only `core/daemon/loop.test.ts` plus execution evidence.
5. Run daemon suite, focused six-file tranche suite, close suite, typecheck, and lint.

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t005-t006a-r2.md` with verdict, mutation evidence, scope, and remaining uncertainty. No product edits.
