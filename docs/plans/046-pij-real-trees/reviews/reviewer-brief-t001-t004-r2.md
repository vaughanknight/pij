# Focused re-review brief — s046 T001-T004 R2

**Reviewer**: `pij-minimal-whale` · Copilot `gpt-5.6-sol` xhigh
**Original review**: `reviews/review-t001-t004.md`
**Fix packet**: `reviews/fix-t001-t004-r1.md`
**Current immutable diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0003.patch`

## Question

Are H1 and M1 fully fixed without regression or scope breach?

## Required checks

1. Verify selected orphan roots retain `problem:"orphan"` and selected roots with existing excluded parents explicitly report `filtered-parent`.
2. Verify an 8,000-node corrupt cycle completes without `RangeError`, produces finite output, and includes a cycle marker.
3. Verify iterative traversal preserves deterministic root/child order, ordinary subtree behavior, raw descriptor fields, orphan/filtered-parent semantics, and small-cycle output.
4. Verify current product diff remains the original eight allowed T001-T004 files; `.pi/packages.yaml` is byte-identical to HEAD after date-only churn restoration.
5. Run:
   - `just test .pi/extensions/pij/core/tree.test.ts`
   - `just test .pi/extensions/pij/core/tree.test.ts .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/adapters/git-repository.test.ts`
   - `just test .pi/extensions/pij/core/close.test.ts`
   - `just typecheck`
   - `just lint`
6. Dimension 0:
   - empirically mutate the orphan classification guard and prove the new subtree-root test RED→restore→GREEN;
   - for iterative deep-cycle safety, use a safe empirical mutation if available; otherwise name the exact load-bearing 8,000-node assertions and explain why reverting to recursion deterministically recreates the already reproduced `RangeError`.

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t001-t004-r2.md` with verdict, findings, commands, mutation/reasoned Dim-0 evidence, scope, and remaining uncertainty. Do not modify product code or any other artifact.
