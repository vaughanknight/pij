# Grant request — s046 T009-T010 production tree/link/adopt CLI

**Requested by**: `pij-condemned-cockroach`
**Current checkpoint commit**: `6c32c3c`
**PR**: draft #13
**Hosted CI**: Node 22, Node 24, Windows compatibility all green
**Request state**: no T009+ work started

## claim

The next dependency-ordered conflict-free tranche is T009-T010 production CLI/wiring: tree/query/filter rendering, link mutation, adopt parent linkage, automatic control-spawn parent/repository capture, and session projection. It has zero overlap with active s044's exact five files.

The plan manifest required one correction discovered by source reread: `pij adopt` argument parsing lives in `core/spawn.ts`, so `core/spawn.ts/.test.ts` must join the CLI/session-join paths.

## active s044 ownership

1. `skills/pij/SKILL.md`
2. `skills/pij/references/00-routing.md`
3. `skills/pij/references/routes/pair.md`
4. `harness/scripts/pij-skill-check.sh`
5. `docs/domains/pij-skill/domain.md`

**Overlap with this request**: none.

T011 remains held on three s044-owned files.

## exact requested write paths

### Tests first

- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/core/session-join.test.ts`
- `.pi/extensions/pij/core/spawn.test.ts`

### Implementation

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/core/session-join.ts`
- `.pi/extensions/pij/core/spawn.ts`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t009-t010/**`
- `docs/plans/046-pij-real-trees/reviews/*t009-t010*`
- `docs/plans/046-pij-real-trees/reports/*t009-t010*`
- `.harness/temp/s046/**`

## exact CLI contract

### `pij tree`

- Bare `pij tree`: current git repository forest, grouping linked worktrees through `gitCommonDir`.
- `pij tree --global`: global active forest.
- `pij tree <id>`: arbitrary node subtree regardless of repository/prime role.
- `--all`: include dead and dissolved history.
- Repeatable `--activity`, `--liveness`, `--lifecycle`: OR within one axis, AND across axes.
- `--json`: stable nested descriptor/tree fields.
- Invalid values/combinations fail before mutation.
- Human rendering and JSON serialization are iterative/bounded; an 8,000-level corrupt graph cannot stack-overflow. Cycle/orphan/filtered-parent metadata remains visible.

### `pij link`

- `pij link <child> --parent <parent> [--json]`.
- `pij link <child> --root [--json]` persists `parentId:null`.
- Parent/root are mutually exclusive and exactly one is required.
- Unknown child/parent, self-parent, and effective-graph cycle fail with no write.
- Only `parentId` changes; `spawnedBy`, prime state, repository identity, delivery/inbox state, and all unrelated descriptor fields remain unchanged.

### `pij adopt --parent`

- Extend strict adopt grammar with `--parent <id>`.
- Validate parent existence and effective-graph cycle before final descriptor write/reattachment.
- Persist the structural parent independently from ownership.
- Adopt/reattach also refreshes supplied current repository identity through the existing `GitRepositoryAdapter`.
- Existing durable native identity, `deliveryMode`, Codex phonehome/transcript, reservation recovery, and pending fallback remain intact.

### Automatic control spawn

- Production control-plane pending descriptors receive `parentId=<resolved caller>` beside unchanged `spawnedBy=<resolved caller>`.
- Production spawn captures current `gitCommonDir`.
- No caller means no invented parent/owner.
- Pi registration already landed in T005-T006A and remains unchanged.

### Session projection

- `pij sessions` adds `parentId`, `gitCommonDir`, `prime`, and `oldPrime` additively without changing required/null/omitted legacy keys.
- Human table may add compact parent/repository/prime-state visibility only if existing alignment remains stable; JSON contract is authoritative.

## exact preservation requirements

- `list --prime` stays current-prime-only; ordinary P/O list behavior stays green.
- T005-T008 parent/repository/old-prime daemon durability stays green.
- `spawnedBy` remains close ownership.
- Merged inbox verb and ambient pull delivery behavior stay green.
- Codex current-session identity, GPT-5.6 effort levels, reservations, binding, tail, watch, and broadcast behavior remain green.
- Top-level help advertises tree/link/adopt-parent without changing unrelated grammar.

## explicit exclusions

- No skill/docs/domain/skill-check/s044 file.
- No smoke/live proof, daemon restart, package/schema/dependency/government edits.
- No T011/T012 work.
- No commit, push, PR update, or merge without later grant.

## proof

- four requested test files, including real scratch `PIJ_HOME` CLI integration;
- T001-T008 core/tree/persistence/prime regressions;
- close ownership;
- inbox/no-tmux integration and Windows compatibility;
- `just typecheck`;
- `just lint`;
- `harness checks --quick`;
- cold reviewer mutations:
  - link cycle/no-write guard;
  - link preserves `spawnedBy`;
  - repository selection groups main/worktree and excludes unrelated repo;
  - deep tree JSON/human serializer remains stack-safe;
  - adopt unknown/cycle parent no-write;
  - control spawn writes parent and repository metadata.

## open[]

- Request prime grant for exactly the eight product/test paths and named evidence above.
- If granted, reuse the compacted coder/reviewer after state/model/cwd and canary verification; compacts remain fire-and-forget.
