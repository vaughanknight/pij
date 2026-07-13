# T009-T010 checkpoint — s046 pij real trees

**Lifecycle**: `TRANCHE_COMPLETE`
**Grant**: Spine Seq 171
**Seat**: `pij-condemned-cockroach`
**Recorded**: 2026-07-13T16:32:26+10:00

## claim

T009-T010 production tree/link/adopt CLI wiring is implemented and cold-review approved. Repository/global/subtree trees, filters, ownership-safe linking, adopt parent validation, control-spawn metadata, session projections, and iterative deep rendering are complete. Skills/docs/domains/T011, smoke/live/T012, restart, git ceremony, and merge remain unstarted.

## artifacts[]

- `docs/plans/046-pij-real-trees/reports/t009-t010-grant-request.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t009-t010/tasks.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t009-t010/execution.log.md`
- `docs/plans/046-pij-real-trees/reviews/reviewer-brief-t009-t010.md`
- `docs/plans/046-pij-real-trees/reviews/review-t009-t010.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0004.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0007.patch`

## shas[]

- branch HEAD before tranche commit authorization: `6c32c3c984c0726ab61e1bea6b187517976adedf`
- immutable reviewed patch: `afdc805026d15156d735cd2fb2a6b87cd7bcf6f6d0297b6b222c1097134e9f36`
- `core/cli.ts`: `966d6a502643773ae039b2332664ab9782cdd41fc6f5052a3cb9e523cae28226`
- top-level `cli.ts`: `70f21e83b420a96238f65b74ef021dd7dbc7870c13d6cce0963e4629d7c26bd0`
- `core/session-join.ts`: `3ce67058273271c83292311aab68aad418e81d9ad871c284a50ce1c197140fbc`
- review: `ce5bfa131c2ec2988e3993c72e63b7cfa99ed62c6bd2254386240c2b6f3c6633`

## gates[]

- Coder RED→GREEN: 19 failed / 203 passed → 222/222 focused tests.
- Six mandatory mutations all RED→restore→GREEN:
  - link no-write/cycle;
  - link `spawnedBy` ownership;
  - repository equality;
  - iterative deep JSON serialization;
  - adopt unknown/cycle parent validation;
  - control-spawn parent/repository metadata.
- Cold review: `APPROVE`, no findings.
- Reviewer product regression: 17 files 515/515; flow-pair 148/148; Windows compatibility green.
- Orchestrator product regression: 17 files 477/477.
- `harness checks --quick`: typecheck, lint, full tests, Windows compatibility, package audit, snapshots passed; smoke skipped/T012.
- Scope: exactly eight granted product/test paths changed; no skill/domain/smoke/live/s044/package/dependency path.
- `.pi/packages.yaml` date-only audit churn restored owner-side byte-identical to HEAD.

## delivered[]

- `pij tree`: repository default, global forest, arbitrary subtree, history, repeatable activity/liveness/lifecycle filters, human and JSON output.
- Iterative human and nested JSON serializers safe for an 8,000-level corrupt graph.
- `pij link`: parent/root mutation with strict no-write failures and ownership preservation.
- `pij adopt --parent`: pre-mutation parent/graph validation, structural persistence, repository refresh.
- Ordinary and agent control-spawn structural/repository metadata.
- Additive session projection for parent, repository, current prime, and old-prime; explicit-root eval exports suppress legacy fallback.
- Top-level help/wiring while preserving merged inbox/pull, Codex, effort, reservation, tail, watch, broadcast, agent, and orchestration behavior.

## observations[]

- Source reread corrected the original manifest by adding `core/spawn.ts/.test.ts` for adopt argument parsing.
- Reviewer proved the deep nested JSON serializer cannot regress to direct `JSON.stringify`.
- Full live daemon/tmux proof remains explicitly T012-owned.
- Peer compacts remained immediate fire-and-forget.

## open[]

- Await prime verification and explicit next-tranche grant.
- T011 remains held on active s044 overlap.
- T012 smoke/live/restart is the only remaining product-proof tranche after T011 composition.
- No commit/push/PR update was authorized for Seq171.
