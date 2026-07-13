# Grant request — s046 T007-T008 old-prime core transitions

**Requested by**: `pij-condemned-cockroach`
**Current checkpoint commit**: `b490485`
**PR**: draft #13
**Hosted CI**: Node 22, Node 24, Windows compatibility all green
**Request state**: no T007+ work started

## claim

The next dependency-ordered conflict-free tranche is T007-T008: migration-safe old-prime state, pure orchestration transitions, daemon merge ownership, and ordinary list projection. It has zero overlap with active s044's exact five files.

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

- `.pi/extensions/pij/core/orchestration/prime.test.ts`
- `.pi/extensions/pij/core/orchestration/cli.test.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`

### Implementation

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/orchestration/prime.ts`
- `.pi/extensions/pij/core/orchestration/cli.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t007-t008/**`
- `docs/plans/046-pij-real-trees/reviews/*t007-t008*`
- `docs/plans/046-pij-real-trees/reports/*t007-t008*`
- `.harness/temp/s046/**`

## exact behavior

1. Add migration-safe `SessionDescriptor.oldPrime?: boolean`; legacy absence projects as false.
2. `PrimeService.set(id)` writes `prime:true, oldPrime:false`.
3. `PrimeService.retire(id)` writes `prime:false, oldPrime:true`.
4. `PrimeService.unset(id)` writes `prime:false, oldPrime:false`.
5. All three operations are idempotent over the pair of fields, preserve unrelated descriptor metadata, and return an additive result carrying `{id, prime, oldPrime, changed}`.
6. `pij orchestration prime retire [<id>] [--json]` follows the existing exact-self/explicit-target/error/exit contracts.
7. Multiple `prime:true` sessions remain valid; no election or uniqueness enforcement.
8. `pij list --prime` remains current-prime-only.
9. Ordinary list human output distinguishes current prime `P` and old-prime `O`; current wins if corrupt legacy data has both true.
10. List JSON retains existing fields and adds `oldPrime:boolean` while keeping `prime:boolean`.
11. Daemon merge treats latest persisted `oldPrime:true|false` as authoritative beside `prime`, `parentId`, and `gitCommonDir`.
12. Existing parent/repository persistence, inbox/list verbs, delivery state, and list column/self-marker behavior remain green.

## explicit exclusions

- No top-level `.pi/extensions/pij/cli.ts` or `cli.integration.test.ts`.
- No tree/link/adopt/session-join production wiring, docs, skills, skill sensor, domain docs, smoke/live proof, package/schema/dependency/government edits.
- No active s044 file.
- No daemon restart, commit, push, PR update, or merge without later grant.

## proof

- four focused test files
- existing close ownership and T005-T006A persistence regressions
- `just typecheck`
- `just lint`
- `harness checks --quick`
- cold reviewer mutation proof:
  - `set` must clear old-prime;
  - `retire` must clear current prime;
  - daemon latest `oldPrime:false` must beat stale true;
  - list `--prime` must exclude old-prime-only rows while ordinary output shows `O`.

## open[]

- Request prime grant for exactly the nine product/test paths and named evidence above.
- If granted, reuse the compacted coder/reviewer after state/model/cwd and canary verification; compacts remain fire-and-forget.
