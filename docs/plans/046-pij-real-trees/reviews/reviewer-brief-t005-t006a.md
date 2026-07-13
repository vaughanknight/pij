# Cold review brief — s046 T005-T006A

**Grant**: Spine Seq 152
**Run / delegation**: `2026-07-12T21-53-55Z-github.com-AI-Substr` / `dlg-0002`
**Base**: `940557a3881837a91225508c9290fbcc10764e3d`
**Immutable diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0004.patch`
**Reviewer**: reusable cold Copilot `gpt-5.6-sol` xhigh

## Review target

Review the coder-owned changes in the exact Seq152 grant:

- six test paths and six implementation paths listed in `tasks/tranche-t005-t006a/tasks.md`;
- note that `fs-registry.ts` is allowed but intentionally unchanged because its characterization test was already green;
- ignore orchestrator-owned `fleet-roster.md` and task-contract creation as coder scope.

Read:

- `reports/t005-t006a-grant-request.md`
- `tasks/tranche-t005-t006a/tasks.md`
- `tasks/tranche-t005-t006a/execution.log.md`
- original packet `.flow-pair/.../prompts/dlg-0002.md`
- current merged `types.ts`, `ports.ts`, close behavior, delivery/inbox tests
- `skills/flow-pair/references/review-rubrics.md`

## Mandatory checks

1. **Tri-state parent**: pending, Pi registration/reload, reattach, daemon write, snapshot/hydration, failure, and dissolve preserve explicit id/null; absence retains durable/legacy metadata.
2. **Repository identity**: fresh non-null key refreshes stale state; absent input preserves durable key; no accidental empty/null clear.
3. **Concurrent daemon merge**: latest persisted `parentId:null` beats stale parent id and latest persisted `gitCommonDir` beats stale value without changing `prime`, `reportedAt`, or dissolved truth.
4. **Ownership**: `spawnedBy` is unchanged by every new path and existing close tests remain load-bearing.
5. **Merged invariants**: `deliveryMode`, Codex phonehome, daemon post-outcome routing, durable inbox injection/mark-read/receipt replay, and GPT-5.6 effort coverage remain intact.
6. **Scope**: no old-prime, top-level CLI/wiring, T011, smoke/live, package, schema, dependency, or s044 file.
7. **FsRegistry**: verify the new test genuinely characterizes snapshot removal/hydration/dissolve and does not merely restate an object literal.
8. **Dimension 0**:
   - empirically mutate the daemon merge behavior that preserves latest `parentId:null`; prove RED, restore byte-identical, GREEN;
   - empirically mutate repository refresh/preservation at the most load-bearing session/binding seam; prove RED, restore byte-identical, GREEN;
   - name the negative assertion proving `spawnedBy` remains unchanged.

## Commands

- focused tests for all six granted test files
- `just test .pi/extensions/pij/core/close.test.ts`
- `just typecheck`
- `just lint`
- `harness checks --quick`

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t005-t006a.md` with verdict, findings, commands, mutation evidence, exact scope, merged-invariant assessment, and remaining uncertainty. Do not modify product code or any other artifact.
