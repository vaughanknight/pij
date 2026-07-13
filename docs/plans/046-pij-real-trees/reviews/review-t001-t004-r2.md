# T001-T004 focused re-review R2

## Verdict

**APPROVE_WITH_NOTES**

H1 and M1 are fixed at the T001-T004 core-projection boundary. The required regressions, ownership check, typecheck, and lint pass; both new guards proved load-bearing under mutation; the immutable product diff remains the original eight allowed paths; and `.pi/packages.yaml` is byte-identical to `HEAD`.

## Finding disposition

### H1 — FIXED

`.pi/extensions/pij/core/tree.ts:84-95` now classifies a visible node against the full registry before considering whether its parent remains selected or visible:

- a selected subtree root whose effective parent is absent retains `problem:"orphan"`;
- a selected subtree root whose effective parent exists but is excluded reports `problem:"filtered-parent"`.

The focused assertions at `.pi/extensions/pij/core/tree.test.ts:137-154` cover both cases. A direct probe returned the expected metadata for both selected roots.

### M1 — FIXED

`.pi/extensions/pij/core/tree.ts:184-250` replaces recursive rendering with an explicit frame stack and active-path cycle detection. A direct 8,000-node corrupt-cycle probe completed in memory without throwing and produced a finite forest of 8,001 projected nodes with explicit cycle metadata.

The test at `.pi/extensions/pij/core/tree.test.ts:267-288` makes the projection call itself a no-throw guard, traverses the result iteratively, bounds projected output to `count + 1`, and requires at least one cycle marker. Ordinary root/child ordering, subtree projection, raw descriptor fields, orphan/filtered-parent behavior, and the small corrupt-cycle fixture remain green.

## Non-blocking downstream note

Direct `JSON.stringify` of the 8,000-level nested forest still throws `RangeError: Maximum call stack size exceeded`. This does not reopen M1 for this tranche: T002's contract is a finite in-memory forest with stable JSON-shaped nodes, while CLI human/JSON rendering is owned by T009-T010 and was explicitly forbidden in T001-T004. T009-T010 must nevertheless prove bounded serialization or deliberately bound/truncate corrupt-cycle output before claiming end-to-end AC-10 JSON output.

## Commands and results

| Command | Result |
|---|---|
| `harness boot --json` | Ready; typecheck and full unit-test stages passed. |
| `just test .pi/extensions/pij/core/tree.test.ts` | 17/17 passed. |
| `just test .pi/extensions/pij/core/tree.test.ts .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/adapters/git-repository.test.ts` | 45/45 passed. |
| `just test .pi/extensions/pij/core/close.test.ts` | 15/15 passed; close ownership remains based on `spawnedBy`. |
| `just typecheck` | Passed. |
| `just lint` | Exited 0 with the repository's existing nine warnings and schema-version notice, all outside the reviewed paths. |
| Direct orphan/filtered-parent probe | Selected orphan retained `problem:"orphan"`; selected child with an excluded existing parent reported `problem:"filtered-parent"`. |
| Direct 8,000-node projection probe | `projectSessionForest` completed without `RangeError`; finite count 8,001; cycle markers present. |
| `harness checks --quick --json` | Typecheck, lint, full tests, package audit, and snapshots passed; smoke intentionally skipped by `--quick`. |

## Dimension 0 mutation proof

### Orphan classification guard

- **Guard**: `.pi/extensions/pij/core/tree.ts:89`, `if (!byId.has(parentId))`.
- **Mutation**: `s/if \(!byId\.has\(parentId\)\)/if (false)/`
- **Command**: `bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/tree.ts 's/if \(!byId\.has\(parentId\)\)/if (false)/' 'just test .pi/extensions/pij/core/tree.test.ts'`
- **RED**: two tree tests failed under mutation, including the selected-subtree-root classification coverage.
- **GREEN after restore**: 17/17 tree tests passed.
- **Byte-identical restore**: SHA-256 `5162c4023736d14232718de72d1140ddb05dea2c972b77e7045065a44909b64f`.

The mutation routes a missing parent into the excluded-parent branch, changing `orphan` to `filtered-parent`; the new regression therefore directly guards H1.

### Iterative traversal guard

- **Guard**: `.pi/extensions/pij/core/tree.ts:218`, `while (stack.length > 0)`.
- **Mutation**: `s/while \(stack\.length > 0\)/while (false)/`
- **Command**: `bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/tree.ts 's/while \(stack\.length > 0\)/while (false)/' "just test .pi/extensions/pij/core/tree.test.ts -t 'projects an 8,000-node corrupt cycle'"`
- **RED**: the targeted 8,000-node test failed under mutation.
- **GREEN after restore**: the targeted test passed.
- **Byte-identical restore**: SHA-256 `5162c4023736d14232718de72d1140ddb05dea2c972b77e7045065a44909b64f`.

The load-bearing deep-cycle proof is the no-throw projection call at `.pi/extensions/pij/core/tree.test.ts:274`, followed by iterative finite-output and cycle-marker assertions at lines 275-287. Reverting `renderNode` to the reviewed recursive implementation deterministically recreates the previously reproduced 8,000-node `RangeError`; the current explicit stack avoids that JavaScript call-stack dependency.

## Scope

Immutable patch SHA-256: `204313e6c78be408978d13fdb00ece403f7cb542698f7c267cbd3cb84ff36cde`.

The immutable patch contains exactly the original eight allowed product/test paths:

- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/ports.ts`
- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/adapters/git-repository.test.ts`
- `.pi/extensions/pij/adapters/git-repository.ts`
- `.pi/extensions/pij/core/tree.test.ts`
- `.pi/extensions/pij/core/tree.ts`

The R1 product delta is confined to `.pi/extensions/pij/core/tree.ts` and `.pi/extensions/pij/core/tree.test.ts`; the execution log update is the allowed review evidence path. `.pi/packages.yaml` has identical `HEAD` and worktree blob id `f2551e983fa1aeb7545b66cdfc9a0c1871a89576`.

## Remaining uncertainty

This re-review covers only the focused H1/M1 repair and T001-T004 regressions. T005+ persistence and wiring remain outside scope. Full smoke was not rerun because the known T012-owned Pi project-trust prompt still blocks that sensor; the quick deterministic gate is green. End-to-end JSON serialization of pathological deep trees remains an explicit T009-T010 proof obligation as noted above.
