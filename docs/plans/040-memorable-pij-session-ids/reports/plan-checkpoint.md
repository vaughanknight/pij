# s040 report - plan checkpoint
**From**: pij-1i9o8ti · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Stage**: plan validated -> requesting code fences

**claim**: Plan 040 is **READY**, Simple/CS-5, with one nine-task TDD phase and 16 acceptance criteria. Cold `/validate-v2` returned **VALIDATED WITH FIXES**: both prior HIGH findings are closed, and the post-s039 package/PoC sequencing gap is repaired. Jordan's implementation ruling assigns a Copilot GPT-5.6 Sol coder and a separate same-model reviewer; this stream remains orchestration-only.

**artifacts[]**:
- `docs/plans/040-memorable-pij-session-ids/memorable-pij-session-ids-plan.md`
- `docs/plans/040-memorable-pij-session-ids/validations/memorable-pij-session-ids-plan-validation.md`
- `docs/plans/040-memorable-pij-session-ids/research-dossier.md`
- `docs/plans/040-memorable-pij-session-ids/rulings.md`
- `docs/plans/040-memorable-pij-session-ids/the-flow.json`

**shas[]**:
- plan: `a3e274f9f224b29568808d4967d5cbad836c2c7e4807fa9d32b62350f9137af0`
- validation: `24dc83b093a2e5049aa401a85866abb09ee7512607581d0cdcdfd67b8080c632`
- rulings: `94fab0752285dc76a69840df990252967342e615d82be1283f5cc071a3ae72e1`
- flight plan: `608c583619725ab8123f34b946480e4aaa7e50375b14fa23320d1533f9c9d304`

**gates[]**:
- Plan G1/G5/G6/G7 PASS; G2/G3/G4 N/A.
- validate-v2: `VALIDATED WITH FIXES`; 16/16 AC coverage, 9/9 task/manifest resolution, both prior HIGH findings CLOSED.
- Validator ran `harness checks`; all deterministic sensors passed.
- `git diff --check` clean.
- s038 descriptor/CLI work is landed in product source; s040 requests no `types.ts` edit and preserves `prime?: boolean` through regressions.
- s039 package rewrite is landed; package/lock and product source are clean of the removed PoC.

**requested fence[]**:

Shared/package windows (o-prime serialized):
- `package.json`
- `package-lock.json`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`

Exclusive/new or presently unshared:
- `.pi/extensions/pij/core/memorable-id.ts` (new)
- `.pi/extensions/pij/core/memorable-id.test.ts` (new)
- `.pi/extensions/pij/adapters/fs-registry.ts`
- `.pi/extensions/pij/adapters/fs-registry.test.ts`
- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/index.test.ts`
- `.pi/extensions/pij/telegram/match.test.ts`
- `docs/how/pij.md`
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-control-plane/domain.md`

Read-only shared contract:
- `.pi/extensions/pij/core/types.ts` - verify s038's `prime?: boolean`; no planned s040 edit.

Existing plan fence:
- `docs/plans/040-memorable-pij-session-ids/**`
- `.harness/temp/s040/**`

**fence-vs-manifest[]**:
- Every edited task path appears in the requested fence.
- Every requested edit path is consumed by T001-T009.
- `types.ts` is named as the descriptor seam but excluded from the write fence.
- Package re-add begins only after the explicit post-s039 package window grant.
- Shared `discovery.ts` / `binding.ts` / `cli.ts` windows serialize through the o-prime.
- Daemon live verification waits for the daemon-restart baton; commits wait for the git-index baton.

**observations[]**:
- OBS-1: Primary-id replacement widens the feature from display UX to storage, env, wire, telemetry, spawn, and durable ownership contracts.
- OBS-2: Safe crash behavior intentionally retains an orphan reservation; spawner death is not proof that the launched child is gone.
- OBS-3: `adopt --id` becomes reattachment-only, closing the arbitrary-name bypass without removing recovery.
- OBS-4: SW-5 exposed a post-prune proof gap; removing the unmanifested PoC source prevented s039's npm rewrite from breaking typecheck.

**open[]**:
- O-1: code-fence grants and serialized shared-file windows.
- O-2: explicit post-s039 package-manifest window before T005.
- O-3: git-index baton for pathspec commit windows.
- O-4: daemon-restart baton for T009 live verification.
- O-5: optional pre-coding backpressure survey is due at the Plan flight-plan node.
