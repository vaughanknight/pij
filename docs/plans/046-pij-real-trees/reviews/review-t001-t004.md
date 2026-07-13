# T001-T004 cold review

## Verdict

**FIX_REQUIRED**

The immutable diff is in scope and the required gates pass, but two graph-honesty cases violate AC-10. The mandatory graph and repository mutations both proved that their existing guards are load-bearing.

## Findings

### High — An orphan loses its annotation when requested as a subtree root

`.pi/extensions/pij/core/tree.ts:85-90` handles `id === options.rootId` before checking whether the effective parent exists. Consequently, `projectSessionForest(..., { rootId: "orphan" })` emits the node with `effectiveParentId:"missing"` but no `problem:"orphan"`.

This violates AC-10's requirement that missing-parent nodes render with an orphan annotation. The tests exercise arbitrary subtrees at `.pi/extensions/pij/core/tree.test.ts:115-128` and ordinary orphan projection at `.pi/extensions/pij/core/tree.test.ts:137-155`, but not their combination.

Direct probe result:

```json
{"ok":true,"value":{"roots":[{"id":"orphan","parentId":"missing","effectiveParentId":"missing","activity":"idle","liveness":"active","children":[]}]}}
```

### Medium — Deep corrupt graphs throw instead of terminating explicitly

`.pi/extensions/pij/core/tree.ts:185-206` renders children recursively. The path set terminates small cycles, but it can only detect the repeated node after recursively traversing the whole cycle. An 8,000-node corrupt legacy cycle throws `RangeError: Maximum call stack size exceeded` before producing the explicit cycle marker required by AC-10.

The existing cycle fixture at `.pi/extensions/pij/core/tree.test.ts:235-245` contains only two cycle nodes, so it does not guard bounded traversal at realistic large-registry depth.

## Commands and results

| Command | Result |
|---|---|
| `harness boot --json` | Ready; typecheck and full test stages passed. |
| `just test .pi/extensions/pij/core/tree.test.ts .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/adapters/git-repository.test.ts` | 43/43 passed. |
| `just test .pi/extensions/pij/core/close.test.ts` | 15/15 passed; close ownership remains based on `spawnedBy`. |
| `just typecheck` | Passed. |
| `just lint` | Passed with nine pre-existing warnings and one schema-version info message, all outside reviewed paths. |
| Direct `npx tsx` orphan/deep-cycle probe | Orphan subtree omitted `problem`; 8,000-node cycle threw `RangeError`. |
| `harness checks --json` | Typecheck, lint, full tests, package audit, and snapshots passed; smoke failed waiting at Pi's interactive project-trust prompt. |

## Dimension 0 mutation proof

### Graph guard

- **Guard**: `.pi/extensions/pij/core/tree.ts:37`, `cursor === childId`.
- **Mutation**: `s/if \(cursor === childId\)/if (false)/`
- **Command**: `bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/tree.ts 's/if \(cursor === childId\)/if (false)/' 'just test .pi/extensions/pij/core/tree.test.ts'`
- **RED**: one test failed under mutation. The load-bearing assertion is `.pi/extensions/pij/core/tree.test.ts:108-110`, which requires the mixed explicit/legacy cycle to return `E-ARG` and leave the input unchanged.
- **GREEN after restore**: targeted tree suite passed.
- **Byte-identical restore**: SHA-256 `bd1136cc6b67d443fa9d753dd624f26d05d27375c4c10564df9cf60492f72c88`.
- **Assertion**: the guard is load-bearing because removing it changes the cycle attempt from an error to a successful link plan.

### Repository guard

- **Guard**: `.pi/extensions/pij/core/discovery.ts:98`, `descriptorRepository === gitCommonDir`.
- **Mutation**: `s/descriptorRepository === gitCommonDir/descriptorRepository !== gitCommonDir/`
- **Command**: `bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/discovery.ts 's/descriptorRepository === gitCommonDir/descriptorRepository !== gitCommonDir/' 'just test .pi/extensions/pij/core/discovery.test.ts'`
- **RED**: one test failed under mutation. The load-bearing assertions are `.pi/extensions/pij/core/discovery.test.ts:65-71`, which require the persisted main descriptor and legacy linked-worktree descriptor to match while excluding the unrelated repository.
- **GREEN after restore**: targeted discovery suite passed.
- **Byte-identical restore**: SHA-256 `2e36fe8a5d61fed2ccd407362d108f816bfbb9b23e2a62bb06dc4d99336e0546`.
- **Assertion**: the equality guard is load-bearing because inversion excludes both same-repository descriptors and admits the unrelated repository.

## Scope

Immutable patch SHA-256: `faeda95dd9829f6f8dc69ee126aca1a5af4cd9bf9edc980ba5c3478158601440`.

The patch contains only:

- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/ports.ts`
- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/adapters/git-repository.test.ts`
- `.pi/extensions/pij/adapters/git-repository.ts`
- `.pi/extensions/pij/core/tree.test.ts`
- `.pi/extensions/pij/core/tree.ts`

No path outside the allowed target list is present. The current `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/execution.log.md` was reviewed separately because it is not embedded in `diff-0001.patch`; it contains the changed-file list, decisions, RED/GREEN checkpoints, and required gate results.

## Remaining uncertainty

This review covers T001-T004 only. T005+ persistence and production CLI wiring remain outside scope. The deep-graph failure threshold depends on the JavaScript runtime stack, but the confirmed 8,000-node cycle already demonstrates that traversal is not structurally bounded. The full done gate remains red on the pre-existing, T012-owned smoke trust prompt; no smoke files were modified.
