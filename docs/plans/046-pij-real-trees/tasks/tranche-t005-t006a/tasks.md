# T005-T006A tranche — parent/repository core persistence

**Grant**: Spine Seq 152
**Plan**: `docs/plans/046-pij-real-trees/pij-real-trees-plan.md`
**Scope authority**: `reports/t005-t006a-grant-request.md`
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`

## Exact write paths

### Tests first

- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `.pi/extensions/pij/adapters/fs-registry.test.ts`
- `.pi/extensions/pij/index.test.ts`

### Implementation

- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/core/session.ts`
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`
- `.pi/extensions/pij/adapters/fs-registry.ts`
- `.pi/extensions/pij/index.ts`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t005-t006a/execution.log.md`

## Tasks

| Status | ID | Task | Done When |
|--------|----|------|-----------|
| [ ] | T005A | Write RED pending-descriptor tests for explicit `parentId` id/null and `gitCommonDir`, preserving `spawnedBy`, model, effort, branch, and merged GPT-5.6 effort fixtures. | Tests fail only on absent parent/repository persistence. |
| [ ] | T005B | Write RED Pi registration/reload/durable-snapshot tests for parent/repository metadata while preserving durable unread/receipt mark-read behavior. | New assertions fail; merged inbox tests remain diagnostic and unchanged. |
| [ ] | T005C | Write RED reattachment tests for repository refresh/preservation beside merged `deliveryMode` and Codex phonehome behavior. | Fresh non-null key replaces prior; absent input preserves prior; delivery mode remains intact. |
| [ ] | T005D | Write RED daemon merge tests proving latest-disk `parentId:null` beats stale parent id and latest non-null `gitCommonDir` beats stale repository identity. | Both stale-snapshot directions fail before implementation without weakening prime/reportedAt/dissolve tests. |
| [ ] | T005E | Write RED filesystem identity-snapshot tests proving parent/repository metadata survive publish, descriptor removal, hydration, and dissolve. | Arbitrary optional metadata survives without migration writes. |
| [ ] | T006A | Implement pending/session/binding/daemon/registry persistence with durable tri-state parent semantics and repository refresh/preservation. | T005A-E green; legacy descriptors remain compatible; `spawnedBy` is unchanged. |
| [ ] | T006B | Wire Pi registration to compute `gitCommonDir` through the existing argv-only `GitRepositoryAdapter` before `session.boot`. | Index wiring tests green; merged unread/mark-read/receipt tests stay green. |

## Merged-main preservation

- Preserve `DeliveryMode` and `ReattachIdentityInput.deliveryMode`.
- Preserve Codex `CODEX_THREAD_ID` phonehome behavior.
- Preserve daemon post-outcome tmux delivery contract.
- Preserve durable inbox listing, injection, mark-read, and receipt replay behavior in `index.ts`.
- Preserve merged GPT-5.6 effort tests.
- Preserve `spawnedBy` close ownership.

## Forbidden

- Every path outside the exact list above.
- Old-prime fields/services/CLI/projections.
- Top-level control-plane spawn/adopt/link/tree CLI wiring.
- `core/types.ts`, `core/ports.ts`, `core/cli*`, `.pi/extensions/pij/cli.ts`, orchestration prime/session-join files.
- Active s044 five files, all skill/docs/smoke/package/schema/dependency/government paths.
- `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.flow-pair/**`.
- Daemon restart, live proof, commit, push, PR update, merge.

## Proof

- focused tests for all six granted test files
- `just test .pi/extensions/pij/core/close.test.ts`
- `just typecheck`
- `just lint`
- `harness checks --quick`
- exact changed-path scope
- report RED→GREEN counts and merged-invariant checks

