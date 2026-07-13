# T012 Stage A — smoke trust, scratch topology, full gates, PR readiness

## Exact writes

- `harness/scripts/smoke.ts`
- `harness/scripts/smoke.test.ts`
- `docs/plans/046-pij-real-trees/tasks/tranche-t012/execution.log.md`
- `.harness/temp/s046/**`

## Tests first

1. Add RED unit tests proving:
   - default smoke command is `pi --approve`;
   - explicit scenario `cmd` wins byte-for-byte;
   - importing the resolver does not execute the smoke runner.
2. Implement the smallest exported resolver/direct-entry guard in `smoke.ts`.
3. No Driver SDK edit.

## Scratch reviewed-worktree proof

Use only:

```text
npx tsx /Users/jordanknight/pi-hacking/pij-worktrees/s046-pij-real-trees/.pi/extensions/pij/cli.ts
```

Use isolated `.harness/temp/s046/pij-home` as `PIJ_HOME`.

Copy exact descriptor snapshots for:

- `pij-primary-carp`
- `pij-condemned-cockroach`
- `pij-concrete-roadrunner`
- `pij-minimal-whale`
- `pij-pregnant-dragon`

Obtain source descriptor paths with `pij path <id> --state`; never edit source registry.

Required proof:

1. Record source/scratch descriptor SHA-256 before mutation.
2. Render scratch `tree --global --all --json` and `tree pij-primary-carp --all --json`.
3. Link scratch `pij-condemned-cockroach` under `pij-primary-carp`.
4. Prove only `parentId` changed; `spawnedBy` and every unrelated field unchanged.
5. Show s046 coder/reviewer effective children and s048 as a separate adopted seat before Stage B.
6. Prove repository/default tree excludes an unrelated synthetic repository descriptor.
7. Prove activity/liveness/lifecycle filters and human output.
8. Reuse existing 8,000-level test/mutation evidence; any new serializer mutation occurs only in a copied temp source/test tree, never product paths.

## Required mutations

1. Remove `--approve` in a smoke resolver fixture -> RED.
2. Break explicit scenario command precedence -> RED.
3. In scratch copy, corrupt link to overwrite `spawnedBy` -> ownership assertion RED.
4. In scratch copy, invert repository membership -> exclusion assertion RED.
5. In copied temp product source, regress iterative serialization to direct `JSON.stringify` -> existing deep test RED.

Restore every fixture/copy; product writes remain exactly two harness files.

## Gates

- `just test harness/scripts/smoke.test.ts`
- T001-T011 targeted regressions
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- full `harness checks` including smoke

Package audit churn is owner-only cleanup; stop and report if it appears.

## Report

Send exact completion JSON. Do not commit, push, mark PR ready, restart daemon,
mutate real registry, or merge.
