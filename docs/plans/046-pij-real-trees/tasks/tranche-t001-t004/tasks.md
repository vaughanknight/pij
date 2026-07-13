# T001-T004 tranche — real-tree core and repository identity

**Plan**: `docs/plans/046-pij-real-trees/pij-real-trees-plan.md`
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Scope**: T001-T004 only

## Allowed product paths

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/tree.ts`
- `.pi/extensions/pij/core/tree.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/ports.ts`
- `.pi/extensions/pij/adapters/git-repository.ts`
- `.pi/extensions/pij/adapters/git-repository.test.ts`

## Forbidden paths

- `.the-flow-state.json`
- `docs/plans/046-pij-real-trees/the-flow.json`
- `docs/plans/046-pij-real-trees/the-flow.md`
- `.flow-pair/**` except the delivered packet file
- All product, skill, government, docs, smoke, and test paths not explicitly allowed above
- In particular every T005+ path: spawn/session/binding/daemon/prime/CLI/index/skill/docs/smoke surfaces

## Tasks

| Status | ID | Task | Done When |
|--------|----|------|-----------|
| [ ] | T001 | Write RED descriptor/tree fixtures for explicit parent, explicit-root `null`, absent-field legacy fallback, deterministic children, arbitrary subtree, orphan, filtered parent, mixed-edge cycles, and cycle-safe output. | Tests compile and fail only because tri-state tree vocabulary/projection is absent. |
| [ ] | T002 | Implement additive descriptor fields and one pure `effectiveParent` used by both link-cycle validation and forest rendering; add tri-state root, selector/filter composition, and stable JSON nodes. | T001 green; self/unknown/effective-cycle mutations return tagged errors without writes; `null` roots suppress fallback; corrupt legacy cycles terminate explicitly. |
| [ ] | T003 | Write RED repository identity/filter tests using a temporary git repository with a linked worktree and legacy descriptors. | Main and worktree resolve one key; unrelated/non-git paths and missing legacy folders are explicit. |
| [ ] | T004 | Implement the injected argv-only git repository adapter and repository-aware descriptor selection while leaving exact `filterByFolder` behavior unchanged. | T003 green; adapter uses no shell; existing `--here` discovery tests remain compatible. |

## Required proof

- `just test .pi/extensions/pij/core/tree.test.ts .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/adapters/git-repository.test.ts`
- `just test .pi/extensions/pij/core/close.test.ts`
- `just typecheck`
- `just lint`
- Report exact RED→GREEN evidence and files changed.

