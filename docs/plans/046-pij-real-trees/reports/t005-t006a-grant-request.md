# Grant request — s046 T005-T006A core persistence

**Requested by**: `pij-condemned-cockroach`
**Rebased base**: `origin/main@940557a3881837a91225508c9290fbcc10764e3d`
**Checkpoint commit**: `71f43709cac8b4a67b3d1bc23896165a445047e0`
**PR**: draft #13
**Request state**: no T005+ work started

## claim

The next dependency-ordered conflict-free tranche is T005-T006A: core parent/repository persistence and durability only. It excludes old-prime work (T007-T008), top-level spawn/adopt/link/tree CLI wiring (T009-T010), active s044 skill files (T011 overlap), and smoke/live proof (T012).

## merged-main reread

Merged main introduced delivery/inbox contracts adjacent to this tranche:

- `core/types.ts` / `core/ports.ts`: `DeliveryMode`, durable inbox messages/markers/claims, `InboxPort`, and optional `EventLogPort.appendOnce`.
- `core/binding.ts`: Codex phonehome plus `deliveryMode` on `ReattachIdentityInput` and reattachment output.
- `core/daemon/loop.ts`: post-outcome tmux delivery contract.
- `index.ts`: durable unread listing and mark-read only after inbound injection.
- `spawn.test.ts`: corrected GPT-5.6 effort coverage.
- `index.test.ts`: durable inbox and receipt replay tests.

The requested tranche composes with these changes: preserve `deliveryMode`; do not touch inbox/post-outcome behavior; add repository identity before Pi `session.boot`; keep new effort and inbox tests green.

## active s044 ownership

s044 exact five-file grant:

1. `skills/pij/SKILL.md`
2. `skills/pij/references/00-routing.md`
3. `skills/pij/references/routes/pair.md`
4. `harness/scripts/pij-skill-check.sh`
5. `docs/domains/pij-skill/domain.md`

**Overlap with this request**: none.

T011 still overlaps s044 on `skills/pij/SKILL.md`, `harness/scripts/pij-skill-check.sh`, and `docs/domains/pij-skill/domain.md`; T011 remains held.

## exact requested write paths

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

- `docs/plans/046-pij-real-trees/tasks/tranche-t005-t006a/**`
- `docs/plans/046-pij-real-trees/reviews/*t005-t006a*`
- `docs/plans/046-pij-real-trees/reports/*t005-t006a*`
- `.harness/temp/s046/**`

## exact behavior

1. RED tests prove `parentId` id/null and `gitCommonDir` survive pending descriptor construction, Pi registration/reload, durable snapshots, reattachment, daemon writes, failure, and dissolve.
2. `parentId:null` is latest-disk-authoritative against stale daemon snapshots; `gitCommonDir` refreshes when a new non-null value is supplied and otherwise preserves durable prior metadata.
3. Pi registration receives `gitCommonDir` from the existing argv-only `GitRepositoryAdapter`.
4. Core pending/reattach inputs accept parent/repository metadata, but top-level control-plane spawn/adopt caller wiring remains deferred to T009-T010.
5. `spawnedBy` close ownership remains byte-for-byte independent.
6. Merged `deliveryMode`, durable inbox mark-read, post-outcome delivery, Codex phonehome, and GPT-5.6 effort behavior remain green.
7. Legacy descriptors load without migration writes.

## explicit exclusions

- No `oldPrime` field, service, merge, parser, marker, or projection work.
- No `.pi/extensions/pij/cli.ts`, `core/cli*`, orchestration prime files, session-join files, docs, skills, smoke, package, schema, dependency, or government edits.
- No active s044 file.
- No daemon restart, live proof, commit, push, PR update, or merge without a later grant.

## proof commands

- focused tests for all six requested test files
- `just test .pi/extensions/pij/core/close.test.ts`
- `just typecheck`
- `just lint`
- `harness checks --quick`
- cold reviewer with mutation proof for parent-null daemon merge and repository refresh/preservation

## open[]

- Request prime grant for exactly the paths and behavior above.
- If granted, reuse the existing compacted coder/reviewer pair after canary/state verification; compact remains fire-and-forget.
