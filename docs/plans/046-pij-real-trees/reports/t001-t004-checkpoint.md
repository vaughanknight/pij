# T001-T004 checkpoint — s046 pij real trees

**Lifecycle**: `TRANCHE_COMPLETE`
**Seat**: `pij-condemned-cockroach`
**Recorded**: 2026-07-13T08:56:50+10:00
**Grant**: Spine Seq 110 · T001-T004 only

## claim

T001-T004 are implemented and accepted after one cold-review fix loop. The tranche adds the migration-safe tree core and repository identity seam only; T005+ persistence, spawn/session/binding/daemon/prime/CLI/index/skill/docs/smoke work remains read-only and unstarted.

## artifacts[]

- `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/tasks.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t001-t004/execution.log.md`
- `docs/plans/046-pij-real-trees/reviews/reviewer-brief-t001-t004.md`
- `docs/plans/046-pij-real-trees/reviews/review-t001-t004.md`
- `docs/plans/046-pij-real-trees/reviews/fix-t001-t004-r1.md`
- `docs/plans/046-pij-real-trees/reviews/reviewer-brief-t001-t004-r2.md`
- `docs/plans/046-pij-real-trees/reviews/review-t001-t004-r2.md`
- `docs/plans/046-pij-real-trees/reports/fleet-roster.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0001.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0003.patch`

## shas[]

- base/worktree HEAD: `347b6dd732110bc76b3d421e61a401cc228149d6`
- final immutable product diff: `204313e6c78be408978d13fdb00ece403f7cb542698f7c267cbd3cb84ff36cde`
- `core/tree.ts`: `5162c4023736d14232718de72d1140ddb05dea2c972b77e7045065a44909b64f`
- `core/tree.test.ts`: `827a77914dc49f1d98bdeda215daa90f2aff09f3e4d43eb03b5178b7b77e4dad`
- R2 review: `e5c932c6e0162f52505588556e098026a4eb00d5f28bd3da8fc52e150c20d7b6`

## gates[]

- Coder RED→GREEN: initial 17 intended failures → 43/43 tranche tests; R1 2 intended failures → 17/17 focused tree tests and 45/45 tranche tests.
- Cold review R1: `FIX_REQUIRED` for orphan subtree metadata and recursive deep-cycle overflow.
- Cold review R2: `APPROVE_WITH_NOTES`; both findings fixed.
- Dimension 0:
  - graph link-cycle guard mutation RED→restore→GREEN;
  - repository equality guard mutation RED→restore→GREEN;
  - orphan classification mutation RED→restore→GREEN;
  - iterative traversal mutation RED→restore→GREEN.
- Orchestrator checkpoint: tree/discovery/git/close suites 60/60 passed.
- `harness checks --quick --json`: typecheck, lint, full tests, package audit, and snapshots passed; smoke skipped by quick mode.
- Scope: exactly eight granted product/test paths changed; `.pi/packages.yaml` date-only audit churn was twice proven and restored byte-identical to HEAD.
- Ownership: `spawnedBy` remains close authorization; close regression 15/15 passed.

## observations[]

- Reviewer caught two AC-10 failures that the original 43 green tests missed: subtree-root orphan metadata and JavaScript call-stack dependence.
- The in-memory 8,000-node forest is finite, but direct `JSON.stringify` of that pathological depth still overflows. This proof obligation is now explicit in T009-T010 for bounded/truncated CLI serialization.
- Full smoke attempts reached Pi's interactive project-trust prompt before scenario execution. Smoke is T012-owned; no smoke path was modified.
- Flow-pair route/CLI drift: installed CLI lacks route-documented model flags and ledger roster fields, so the plan-owned roster is durable truth. Captured as harness observation `CONF-001`.
- Prompt-learning candidate emission is deferred because `skills/flow-pair/prompt-lab/**` is outside this tranche and explicitly read-only.
- Peer compacts followed Jordan Spine Seq 128: immediate fire-and-forget with no orchestration wait.

## open[]

- Await o-prime verification and the next explicit tranche grant.
- T005+ remains forbidden until granted.
- T009-T010 must prove end-to-end bounded human/JSON serialization for pathological deep/cyclic forests.
- Full smoke remains deferred to T012 after the project-trust precondition is handled.
