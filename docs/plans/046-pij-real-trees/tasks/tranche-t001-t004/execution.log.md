# Execution log — T001-T004 tranche

**Status**: complete
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0001`

## Checkpoints

| At | Actor | State | Evidence |
|----|-------|-------|----------|
| 2026-07-13T07:53:55+10:00 | orchestrator | tranche opened | Spine Seq 110 grant; T001-T004 only |
| 2026-07-13T07:54:00+10:00 | orchestrator | packet frozen | `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0001.md` · hash `85740e4d` |
| 2026-07-13T08:01:01+10:00 | coder | RED | 17 intended failures, 25 passes: tree/link projection, repository selection, and git adapter stubs were the only failing surfaces |
| 2026-07-13T08:02:08+10:00 | coder | GREEN | 42/42 tranche tests passed after implementation; the only intermediate retry aligned the macOS `/var` symlink assertion with git's canonical `/private/var` output |
| 2026-07-13T08:03:11+10:00 | coder | selector proof | Added direct repository-preselection plus filter composition coverage; tranche suite finished 43/43 |
| 2026-07-13T08:23:20+10:00 | coder | required gates clean | close ownership 15/15; flow-pair 148/148; typecheck and lint exited 0 |
| 2026-07-13T08:47:24+10:00 | coder | R1 RED | 2 intended failures, 15 passes: selected orphan roots lost problem metadata and an 8,000-node corrupt cycle overflowed the JavaScript stack |
| 2026-07-13T08:47:46+10:00 | coder | R1 GREEN | focused tree suite 17/17; iterative projection returned a finite cycle-marked forest and selected roots retained orphan/filtered-parent metadata |
| 2026-07-13T08:47:51+10:00 | coder | R1 gates clean | tranche regression 45/45; close ownership 15/15; typecheck and lint exited 0 |
| 2026-07-13T08:54:00+10:00 | reviewer | R2 APPROVE_WITH_NOTES | H1/M1 fixed; two mutation guards RED→restore→GREEN; deep JSON serialization obligation assigned to T009-T010 |
| 2026-07-13T08:56:13+10:00 | orchestrator | tranche accepted | 60/60 targeted+ownership tests; `harness checks --quick` passed typecheck, lint, full tests, package audit, snapshots; smoke intentionally deferred to T012 |

## Delivered

- Added migration-safe `parentId?: SessionId | null` and `gitCommonDir?: string`.
- Added one shared `effectiveParent` for legacy fallback, link-cycle refusal, and projection.
- Added pure no-write link planning with tagged self/unknown/cycle errors.
- Added deterministic, filterable, cycle-safe forest/subtree JSON nodes with orphan and filtered-parent annotations.
- Added repository selection with persisted-key preference, legacy folder probes, and explicit unresolved descriptors.
- Added an injected argv-only `GitRepositoryAdapter` using canonical absolute `--git-common-dir`.
- R1: classified selected subtree roots against the full registry, so a missing parent is `orphan` and an existing excluded parent is `filtered-parent`.
- R1: replaced recursive node rendering with iterative post-order traversal and active-path cycle detection.
- Review note promoted to plan: T009-T010 must prove bounded/truncated human and JSON serialization for pathological deep/cyclic forests.

## Files changed

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/tree.ts`
- `.pi/extensions/pij/core/tree.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/ports.ts`
- `.pi/extensions/pij/adapters/git-repository.ts`
- `.pi/extensions/pij/adapters/git-repository.test.ts`
- `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/execution.log.md`

## R1 files changed

- `.pi/extensions/pij/core/tree.ts`
- `.pi/extensions/pij/core/tree.test.ts`
- `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/execution.log.md`

## R1 decision

- A `rootId` projection does not erase graph integrity metadata: absent full-registry parents remain `orphan`; parents excluded by subtree selection or filters produce `filtered-parent`.
- Projection preserves the existing depth-first node shape and deterministic sibling order while using an explicit stack instead of JavaScript recursion.

## Proof

- `just test .pi/extensions/pij/core/tree.test.ts .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/adapters/git-repository.test.ts` -> 43/43 passed.
- `just test .pi/extensions/pij/core/close.test.ts` -> 15/15 passed; `spawnedBy` remains close authorization.
- `just flow-pair-test` -> 148/148 passed.
- `just typecheck` -> passed.
- `just lint` -> passed with only the repository's pre-existing warnings.
- `harness checks` passed typecheck, lint, full unit tests, package audit, and snapshots; smoke stopped at Pi's unresolved interactive project-trust prompt before scenario execution. Smoke remains T012-owned and was not modified.
- R1 RED: `just test .pi/extensions/pij/core/tree.test.ts` -> 2 intended failures, 15 passes.
- R1 GREEN: `just test .pi/extensions/pij/core/tree.test.ts` -> 17/17 passed.
- R1 tranche regression: `just test .pi/extensions/pij/core/tree.test.ts .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/adapters/git-repository.test.ts` -> 45/45 passed.
- R1 ownership regression: `just test .pi/extensions/pij/core/close.test.ts` -> 15/15 passed.
- R1 `just typecheck` -> passed.
- R1 `just lint` -> passed with only the repository's pre-existing nine warnings and schema-version notice.
- Reviewer mutation: disabling the orphan classification guard made two tree tests RED; restore returned 17/17 GREEN.
- Reviewer mutation: disabling the iterative traversal loop made the 8,000-node test RED; restore returned GREEN byte-identical.
- Orchestrator targeted checkpoint: tree/discovery/git/close -> 60/60 passed.
- Orchestrator `harness checks --quick --json` -> typecheck, lint, full tests, package audit, snapshots passed; smoke skipped.

## Deferred

- T005+ remains read-only and unstarted.
