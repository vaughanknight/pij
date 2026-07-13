# T009-T010 cold review

## Verdict

**APPROVE**

No correctness, compatibility, scope, or mutation-resistance findings remain. The production tree/link/adopt/spawn wiring matches the grant, all six required mutations produced RED, and every temporary mutation was restored byte-identically before the final gates.

## Findings

None.

## Behavior assessment

- `.pi/extensions/pij/core/cli.ts:496-558` adds strict tree/link grammar. Repository, global, and arbitrary-subtree selectors are mutually coherent; repeatable filters retain OR-within-axis and AND-across-axis projection semantics; valued booleans, invalid values, missing link operands, conflicting parent/root forms, and excess positionals fail with `E-ARG`.
- `.pi/extensions/pij/core/cli.ts:888-941` selects a bare tree through the injected repository identity port, delegates filtering and cycle/orphan/filtered-parent projection to the established iterative tree core, and delegates link validation to `planLink()` before the only registry write. The planned descriptor is a spread of the existing descriptor, so only `parentId` changes and `spawnedBy` remains close ownership.
- `.pi/extensions/pij/core/cli.ts:1247-1309` renders both human and nested JSON trees iteratively. Human indentation is capped while retaining true depth order, and JSON serializes one node head at a time rather than recursively stringifying the forest. The 8,000-level corruption case remains finite and exposes cycle metadata.
- `.pi/extensions/pij/cli.ts:337-368` supplies the full descriptor set, including dissolved history, and the argv-only `GitRepositoryAdapter`. The real scratch integration proves that a main checkout and linked worktree share a bare repository tree while an unrelated repository is excluded.
- `.pi/extensions/pij/cli.ts:1452-1483` validates adopt parent existence and the effective graph before allocation, reservation promotion/recovery, descriptor write, or reattachment mutation. `.pi/extensions/pij/cli.ts:1686-1696` then persists structural parentage independently and refreshes repository identity without changing `spawnedBy`.
- `.pi/extensions/pij/cli.ts:934-1086` writes the resolved ordinary control-spawn caller as both `spawnedBy` and `parentId`, plus current `gitCommonDir`. `.pi/extensions/pij/cli.ts:2219-2310` preserves the agent-spawn owner/report target and additively persists the same structural parent and repository identity. An unresolved caller leaves both ownership and structural parent absent.
- `.pi/extensions/pij/core/session-join.ts:18-58` adds `parentId`, `gitCommonDir`, explicit `prime`, and explicit `oldPrime` without changing the required `pijId`/`harness`/`harnessSessionId` keys or the omitted-vs-null behavior of legacy optional fields. `.pi/extensions/pij/core/session-join.ts:74-80` prefers structural parentage for eval-safe exports and lets explicit `parentId:null` suppress the legacy `spawnedBy` fallback.
- Top-level help advertises tree, link, and adopt parentage, while the existing merged inbox, pull waiting, models/effort, tail, watch, broadcast, agent, and orchestration dispatch paths remain unchanged and green.

## Dimension 0 mutation matrix

| Mutation | RED proof | Restore |
|---|---|---|
| Bypass link unknown/self/cycle validation and write the requested parent directly | Core refusal test failed because an invalid link returned exit 0 instead of refusing before write. | `core/cli.ts` restored to SHA-256 `966d6a502643773ae039b2332664ab9782cdd41fc6f5052a3cb9e523cae28226`; targeted test GREEN. |
| Drop `spawnedBy` from the descriptor written by link | Ownership-preservation test failed with `spawnedBy:undefined` instead of `pij-close-owner`. | `core/cli.ts` restored byte-identically; targeted test GREEN. |
| Invert bare-tree repository membership | Repository-tree test selected `pij-other` instead of `pij-root`, dropping the linked repository forest. | `core/cli.ts` restored byte-identically; targeted test GREEN. |
| Replace the iterative JSON serializer with direct `JSON.stringify` | The 8,000-level test failed with `RangeError: Maximum call stack size exceeded`. | `core/cli.ts` restored byte-identically; deep human/JSON test GREEN. |
| Disable adopt unknown/cycle parent validation | Real CLI integration failed because an unknown-parent adopt returned exit 0 and mutated registry state. | `cli.ts` restored to SHA-256 `70f21e83b420a96238f65b74ef021dd7dbc7870c13d6cce0963e4629d7c26bd0`; integration test GREEN. |
| Omit ordinary control-spawn `parentId` and `gitCommonDir` | Real CLI integration failed because the pending descriptor retained `spawnedBy` but lacked both structural/repository fields. | `cli.ts` restored byte-identically; integration test GREEN. |

## Commands and results

| Command | Result |
|---|---|
| Four requested T009-T010 test files | 222/222 passed before mutations. |
| Six independent mutation tests | Every mutation produced the required RED; each targeted test passed after restore. |
| T001-T010 tree, persistence, prime, close, inbox, and real CLI regression command | 17 files, 515/515 passed. |
| `just flow-pair-test` | 16 files, 148/148 passed. |
| `just windows-compat` | Typecheck, lint, and 31/31 focused channel/fake/no-tmux tests passed. |
| `just typecheck` | Passed. |
| `just lint` | Exited 0 with ten pre-existing warnings and one Biome schema-version notice. |
| `harness checks --quick` | Typecheck, lint, full tests, Windows compatibility, package audit, and snapshots passed; smoke was intentionally skipped. |
| `git diff --check` | Passed. |

The package audit refreshed five report-only vet dates in `.pi/packages.yaml`; that incidental churn was restored to SHA-256 `c5fc45ee468a4e7293b1e508a498234a087e8698de5df4580509a40936832840`.

## Exact scope

Reviewed product/test paths:

1. `.pi/extensions/pij/core/cli.test.ts`
2. `.pi/extensions/pij/cli.integration.test.ts`
3. `.pi/extensions/pij/core/session-join.test.ts`
4. `.pi/extensions/pij/core/spawn.test.ts`
5. `.pi/extensions/pij/core/cli.ts`
6. `.pi/extensions/pij/cli.ts`
7. `.pi/extensions/pij/core/session-join.ts`
8. `.pi/extensions/pij/core/spawn.ts`

Immutable patch SHA-256: `afdc805026d15156d735cd2fb2a6b87cd7bcf6f6d0297b6b222c1097134e9f36`.

The coder-owned product/test delta is confined to those eight granted paths. Patch changes to the fleet roster and grant request are orchestrator-owned artifacts and were excluded from coder scope. No skill, domain, smoke/live, s044, package, dependency, schema, government, T011, or T012 product path is present.

## Compatibility assessment

Bare repository trees group linked worktrees through canonical git-common-dir identity and exclude unrelated repositories. Global, subtree, history, repeatable filter, human, and JSON forms preserve the earlier iterative forest metadata contracts. Link and adopt keep structural parentage separate from close ownership; adopt retains durable native identity, delivery/Codex metadata, and reservation behavior. Ordinary and agent control spawns preserve owner/report routing while adding structural and repository metadata. Session projection remains additive, explicit-root exports remain eval-safe, `list --prime` remains current-prime-only, ordinary P/O behavior remains unchanged, and T001-T008 persistence/current-prime contracts remain green.

## Remaining uncertainty

Full tmux smoke/live behavior and daemon-restart proof are explicitly owned by the later tranche and were not widened into this review. `harness checks --quick` therefore skipped smoke by contract; the reviewed real scratch CLI, pure graph, persistence, no-tmux, and portable compatibility surfaces are otherwise fully guarded.
