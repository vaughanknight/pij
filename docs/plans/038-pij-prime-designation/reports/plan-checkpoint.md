# s038 report — plan checkpoint
**From**: pij-118mbuv · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Stage**: plan validated → requesting code fences

**claim**: Plan 038 is **READY**, Full/CS-4, with two dependency-ordered phases and 12 acceptance criteria. validate-v2 returned **VALIDATED WITH FIXES**; both medium findings were repaired and rechecked. The Domain Manifest below is the exact requested write fence; s039's package/lockfile surfaces remain disjoint.

**artifacts[]**:
- `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md`
- `docs/plans/038-pij-prime-designation/validations/pij-prime-designation-plan-validation.md`
- `docs/plans/038-pij-prime-designation/research-dossier.md`
- `docs/plans/038-pij-prime-designation/rulings.md`
- `docs/plans/038-pij-prime-designation/the-flow.json`

**shas[]**:
- plan: `58107ca700e27682bdcd8e202d6eef617c350ba2c9c35a55c65e22b6ecb5df3e`
- validation: `72cffc5ef6307be0cdf8ddf693a882d44613de1b013b470882209d081676b79c`
- flight plan: `429e5be23d252f1619a9a2bf5f550380823db5d2e477fbe4412629b2cdce4bbf`
- rulings: `c083f72289be6d550093540f4b67e6854a8b947096c8b8fb33aba2af0173ad9e`

**gates[]**:
- Plan G1/G5/G6/G7 PASS; G2/G3/G4 N/A.
- validate-v2: VALIDATED WITH FIXES; targeted recheck found no material issue.
- Deterministic checks: 12/12 AC map, 11 task rows, existing manifest paths resolve, `git diff --check` clean.
- `harness boot`: typecheck + tests green.

**requested fence[]**:

Phase 1:
- `harness/scripts/pij-skill-check.sh`
- `skills/pij/SKILL.md`

Phase 2:
- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/orchestration/prime.ts` (new)
- `.pi/extensions/pij/core/orchestration/prime.test.ts` (new)
- `.pi/extensions/pij/core/orchestration/cli.ts`
- `.pi/extensions/pij/core/orchestration/cli.test.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `skills/pij/references/routes/prime.md`
- `skills/pij/references/prime/rituals/bootstrap.md`
- `skills/pij/references/prime/templates/seat-handover.md`
- `docs/how/pij.md`
- `docs/how/pij-prime.md`
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-orchestration/domain.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/domains/pij-skill/domain.md`
- `docs/domains/registry.md`
- `docs/domains/domain-map.md`

The existing plan fence remains:
- `docs/plans/038-pij-prime-designation/**`
- `.harness/temp/s038/**`

**fence-vs-manifest[]**:
- Every file named by an implementation task appears above.
- Every requested file is consumed by a named task.
- No package manifest, lockfile, government file, sibling plan, or `.the-flow` file outside this plan is requested.
- Shared live surfaces: `skills/pij/**` require `just pij-skill-check` + o-prime look; `.pi/extensions/pij/**` require daemon-restart baton before live verification.

**observations[]**:
- `SUGG-001` is encoded as Phase 1: the skill check is fixed before product code.
- Validator repair 1 added bootstrap/handover write-side adoption so registry-first discovery serves real governments, not only scratch smoke.
- Validator repair 2 moved the additive type scaffold before behavioral merge RED tests so RED fails for the intended assertion.

**open[]**:
- O-1: code-fence grant for the requested paths.
- O-2: optional pre-coding backpressure survey is due at the current flight-plan node.
- O-3: daemon-restart baton is needed only at Phase 2 live verification; git-index baton is needed only at pathspec commit windows.
