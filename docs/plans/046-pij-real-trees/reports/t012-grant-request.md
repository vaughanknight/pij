# Grant request — s046 T012 smoke, scratch topology, and canonical live canary

**Requested by**: `pij-condemned-cockroach`
**Prerequisite**: T001-T011 reviewed and accepted locally; T011 checkpoint ready
**Binding rulings**: Seq185 priority ship · Seq186 scratch-first/post-merge-live split
**Request state**: no T012 work started

## claim

T012 is a two-stage proof/ship tranche:

1. **Stage A — pre-merge**: fix the deterministic smoke trust precondition, prove the reviewed worktree topology against a scratch registry, run full gates, commit/push/update draft PR #13, mark ready, watch hosted CI, and stop for Jordan's typed `PROCEED`.
2. **Stage B — post-PROCEED/merge**: after canonical main deployment, acquire/use the daemon-restart baton and run a real live-registry canary rooted at `pij-primary-carp`, linking only missing adopted stream edges while preserving ownership/history.

Stage B never runs before typed `PROCEED`, merge, and canonical deploy.

## exact requested write paths

### Harness code/tests

- `harness/scripts/smoke.ts`
- `harness/scripts/smoke.test.ts`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t012/**`
- `docs/plans/046-pij-real-trees/reviews/*t012*`
- `docs/plans/046-pij-real-trees/reports/*t012*`
- `docs/plans/046-pij-real-trees/ship/**`
- `.harness/temp/s046/**`

## Stage A exact behavior

### Smoke trust precondition

- `harness/scripts/smoke.ts` must run default Pi scenarios with `pi --approve`, the official non-interactive project-local trust flag.
- An explicit scenario `cmd` still wins unchanged.
- Add a pure exported resolver plus a direct-execution guard so `smoke.test.ts` can prove default and override behavior without executing the smoke loop.
- No Driver SDK or product change unless a new proven blocker requires a refreshed grant.

### Reviewed-worktree scratch topology proof

Use explicit reviewed-worktree code, never bare globally linked `pij`:

```text
npx tsx <worktree>/.pi/extensions/pij/cli.ts ...
```

Use isolated `.harness/temp/s046/` and `PIJ_HOME`:

1. Copy selected live descriptor snapshots into the scratch registry, preserving bytes before mutation.
2. Include current `pij-primary-carp`, active s046/s048 stream seats, and their owned worker/reviewer nodes when present.
3. Render global/all and o-prime subtree JSON/human output.
4. On the scratch copy only, link a missing adopted stream under the o-prime.
5. Prove only `parentId` changed; `spawnedBy`, prime/oldPrime, native identity, repository, lifecycle, and history remained unchanged.
6. Prove repository grouping, arbitrary subtree, filters, and bounded deep serialization with the reviewed worktree CLI.
7. Persist commands, stdout/stderr, before/after descriptor hashes, and mutation evidence.

Never guess panes, mutate the real registry, or delete history during Stage A.

### Full pre-ship gates

- Cold reviewer reviews the smoke change and scratch proof.
- `just test harness/scripts/smoke.test.ts`
- T001-T011 targeted regression commands
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- full `harness checks` including smoke
- restore audit-date churn byte-identical if produced

### Draft PR readiness

After Stage A approval/full green:

- bounded checkpoint commit and push/update PR #13;
- transition PR #13 from draft to ready;
- watch Node 22, Node 24, and Windows compatibility CI;
- stop and return for Jordan typed `PROCEED`;
- no merge before typed `PROCEED`.

## Stage B exact behavior — only after typed PROCEED + merge + canonical deploy

1. Confirm merged main contains the reviewed commit and machine skill/CLI point to canonical main.
2. Acquire/confirm daemon-restart baton; record holder/purpose.
3. Restart canonical daemon once from canonical main and verify its pid/window/source.
4. Snapshot real descriptors for:
   - `pij-primary-carp`;
   - active s046 and s048 stream seats;
   - their owned workers/reviewers.
5. Run:

```text
pij tree pij-primary-carp --all --json
pij tree --global --all --json
```

6. For each active adopted stream seat missing the o-prime structural edge:
   - verify exact ids from registry/tree, never panes;
   - record descriptor before;
   - run `pij link <stream-id> --parent pij-primary-carp --json`;
   - record descriptor/tree after;
   - prove `spawnedBy`/close ownership and all unrelated metadata unchanged.
7. Do not relink already-correct nodes.
8. Do not remove/dissolve/delete historical descriptors.
9. Record commands, outputs, descriptor hashes, changed fields, final tree, baton return, and daemon health.

## required proof/mutations

1. Smoke resolver mutation removes `--approve` -> smoke trust prompt RED.
2. Explicit scenario-command precedence mutation -> unit RED.
3. Scratch link mutation overwrites `spawnedBy` -> ownership assertion RED.
4. Scratch repository selection inversion -> tree assertion RED.
5. Scratch deep serializer regression to direct `JSON.stringify` -> 8,000-level RED.
6. Stage B live link proof records only `parentId` mutation.

## explicit exclusions

- No product/skill/docs/domain/package/schema/dependency change.
- No Driver SDK change without refreshed grant.
- No real registry mutation before Stage B.
- No daemon restart before Stage B baton.
- No guessed pane identity.
- No history deletion.
- No merge without Jordan typed `PROCEED`.

## open[]

- Request Stage A grant now for exactly two harness paths plus named evidence.
- Request conditional Stage B authorization per Seq186, activated only after typed `PROCEED`, merge, and canonical deploy.
- Reuse compacted coder/reviewer after state/model/cwd/canary verification for the smoke change and proof review.
