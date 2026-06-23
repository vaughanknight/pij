# Phase 7 execution log — Prompt-learning notes + cluster lifecycle

**Worker**: dlg-0026 implement  
**Date**: 2026-06-23  
**Scope**: `skills/flow-pair/**` + this `execution.log.md` only

## Summary

Implemented Phase 7 cluster-isolated prompt learning:

- Added `skills/flow-pair/lib/learning.ts` with pi-free `Learning.recordLearning()`.
- Added AC-07/P9 unit tests and `flow-pair learn` subprocess tests.
- Added prompt-lab cluster scaffolding for the six canonical clusters.
- Filled `references/prompt-taxonomy.md` and `references/templates/learning-synthesis.md`.
- Wired `learn` CLI with `--prompt-lab-root` override and safe default.

## Changed files

- `skills/flow-pair/lib/learning.ts`
- `skills/flow-pair/lib/cli.ts`
- `skills/flow-pair/test/learning.test.ts`
- `skills/flow-pair/test/cli-learning.test.ts`
- `skills/flow-pair/references/prompt-taxonomy.md`
- `skills/flow-pair/references/templates/learning-synthesis.md`
- `skills/flow-pair/prompt-lab/clusters/implement-code/{active.md,candidates/.gitkeep,changelog.md}`
- `skills/flow-pair/prompt-lab/clusters/fix-code/{active.md,candidates/.gitkeep,changelog.md}`
- `skills/flow-pair/prompt-lab/clusters/review-code/{active.md,candidates/.gitkeep,changelog.md}`
- `skills/flow-pair/prompt-lab/clusters/docs-writing/{active.md,candidates/.gitkeep,changelog.md}`
- `skills/flow-pair/prompt-lab/clusters/codebase-research/{active.md,candidates/.gitkeep,changelog.md}`
- `skills/flow-pair/prompt-lab/clusters/validation-runner/{active.md,candidates/.gitkeep,changelog.md}`
- `docs/plans/016-flow-pair/tasks/phase-7-prompt-learning-notes-cluster-lifecycle/execution.log.md`

No `.flow-pair/**`, flow-state, `plan-017`, or `skills/flow-pair/lib/ledger.ts` writes were made.

## Per-task status

| Task | Status | Evidence |
|------|--------|----------|
| T001 AC-07 isolation tests | DONE | `learning.test.ts` creates real six-cluster temp prompt-lab fixture, snapshots cluster trees, calls real `Learning.recordLearning()`, and asserts exactly one `implement-code/candidates/learn-0001.md` plus byte-identical sibling clusters. |
| T002 wrong/unsafe cluster tests | DONE | `learning.test.ts` rejects miss/cluster mismatch and traversal/invalid cluster values with `{ok:false}` and zero prompt-lab + ledger writes after a valid run fixture exists. |
| T003 taxonomy + scaffolding | DONE | `prompt-taxonomy.md` lists six canonical clusters and lifecycle; committed `prompt-lab/clusters/<cluster>/{active.md,candidates/.gitkeep,changelog.md}` exists for all six. |
| T004 P9 tests | DONE | `learning.test.ts` asserts ledger event + `learnings/learn-0001.json` precede candidate write; injected append failure creates no candidate. |
| T005 `lib/learning.ts` | DONE | Pi-free imports only `node:*`, `./ledger.js`, `./paths.js`; tagged-union return; injected deps; constants exported; calls existing `LedgerWriter.writeLearning()` without modifying `ledger.ts`. |
| T006 learning synthesis template | DONE | Template includes cluster, miss type, evidence, failed/surprising behavior, candidate delta, insertion point, reviewer disposition, and no-auto-promotion text. |
| T007 `flow-pair learn` CLI | DONE | CLI supports `learn`; non-JSON stdout is exactly `learning: learn-NNNN`; JSON includes `candidatePath` and `cluster`; invalid cluster exits 2. |
| T008 validation + mutation | DONE | See validation and mutation records below. |

## Prompt-lab root default

The `learn` CLI chooses:

```ts
join(__dirname, "..", "prompt-lab")
```

where `__dirname` is `skills/flow-pair/lib` at runtime. Therefore the default is:

```text
skills/flow-pair/prompt-lab
```

This mirrors `runFix`'s adjacent-directory default for `templateDir`; users can override with `--prompt-lab-root <path>`.

## Notes folded in from validation

- `missType` is kept as a forward-compatible attribution slot. In v1 it is intentionally redundant because `recordLearning()` enforces `missType === cluster` to prevent cross-cluster leakage.
- Ledger-first P9 semantics are intentional. A crash after `writeLearning()` but before the candidate file write can leave an auditable ledger intent without the candidate file; this orphan-on-crash recovery state is acceptable and no compensating cleanup was added.
- `ledger.ts#writeLearning()` remains the per-run ledger writer. `lib/learning.ts` owns prompt-lab cluster layout.

## AC-07 proof shape

The AC-07 test is non-vacuous because it:

1. Creates real temp directories for all six clusters.
2. Snapshots directory listings and file contents before execution.
3. Calls the real `Learning.recordLearning()` implementation.
4. Asserts exactly one new Markdown candidate in `implement-code/candidates/`.
5. Asserts `fix-code`, `review-code`, `docs-writing`, `codebase-research`, and `validation-runner` snapshots are byte-identical.
6. Asserts all `active.md` and `changelog.md` files remain unchanged.
7. Reads the real `learnings/learn-0001.json` ledger record and checks the cluster/candidate path.

The mismatch guard test uses a valid run and real prompt-lab fixture, so it reaches the `missType !== cluster` isolation guard rather than passing through an earlier setup failure.

## Validation

### `just flow-pair-test`

```text
Test Files  16 passed (16)
Tests  145 passed (145)
```

### `just typecheck`

```text
npm run typecheck

> pij@0.1.0 typecheck
> tsc --noEmit
```

Exit code: 0.

### Flow-pair scoped Biome

Command:

```text
npx biome check skills/flow-pair --diagnostic-level=error
```

Result:

```text
Checked 31 files in 32ms. No fixes applied.
```

Exit code: 0.

### `just self-check`

Ran for project contract. It failed at repo-wide `just lint` before test/smoke due existing repo-wide lint baseline outside this Phase 7 change, including:

- Biome schema version info (`biome.json` schema 2.0.0 vs CLI 2.4.14).
- Existing `skills/flow-pair/test/ledger-records.test.ts` `useLiteralKeys` infos from prior code.
- Unrelated formatting errors in `.harness/extensions/boot/extension.ts` and `.pi/extensions/pij/adapters/fakes.ts`.

Scoped Phase 7 checks above are green.

## Mutation gates

### AC-07 selected-cluster-only guard

Command:

```text
just flow-pair-mutate skills/flow-pair/lib/learning.ts 's/const candidatesDir = join\(clusterDir, "candidates"\);/const candidatesDir = join(promptLabRoot, CLUSTERS_DIR, "fix-code", "candidates");/'
```

RED:

```text
Tests  4 failed | 141 passed (145)
```

GREEN after restore:

```text
Tests  145 passed (145)
```

### AC-07 miss/cluster mismatch guard

Command:

```text
just flow-pair-mutate skills/flow-pair/lib/learning.ts 's/if \(opts\.missType !== opts\.cluster\)/if (false)/'
```

RED:

```text
Tests  1 failed | 144 passed (145)
```

GREEN after restore:

```text
Tests  145 passed (145)
```

### P9 ledger-before-candidate guard

Command:

```text
just flow-pair-mutate skills/flow-pair/lib/learning.ts 's/if \(!ledgerResult\.ok\)/if (false)/'
```

RED:

```text
Tests  1 failed | 144 passed (145)
```

GREEN after restore:

```text
Tests  145 passed (145)
```

## Final verdict

Implementation complete with scoped validation green and mutation gates RED→GREEN. Repo-wide `just self-check` remains blocked by unrelated lint baseline as noted above.
