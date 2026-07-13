# T012 Stage A checkpoint — s046 pij real trees

**Lifecycle**: `MERGE_READY_LOCAL`
**Grant**: Seq 188 + Seq 191
**Merge authorization**: Seq 190 typed `PROCEED`
**Recorded**: 2026-07-13T21:40:00+10:00

## claim

T012 Stage A is terminally cold-approved. The smoke trust/discovery harness is fixed,
the reviewed-worktree scratch topology proof is complete, every required mutation is
killed, and the accepted full `harness checks` run is green across all eight sensors.
Stage B real-registry/restart work has not begun.

## gates[]

- Cold review: `APPROVE_WITH_NOTES`; notes are evidence naming/active-field hygiene only.
- Smoke resolver: 4/4.
- T001-T011 product regressions: 493/493.
- Flow-pair: 148/148.
- Skill sensor: green.
- Accepted `harness-checks-seq191.log`: local paths, typecheck, lint, full tests,
  Windows compatibility, every tmux smoke scenario, package audit, snapshots — all green.
- Package audit changed only five `vetted.date` values; owner restored the manifest to
  pre-check SHA without rerunning audit.
- Scope: exactly `harness/scripts/smoke.ts`, `harness/scripts/smoke.test.ts`, and
  authorized evidence/temp.

## scratch proof[]

- Explicit reviewed-worktree CLI; isolated `.harness/temp/s046/pij-home`.
- Exact copied descriptors for primary-carp, s046 seat/coder/reviewer, and s048 seat.
- Scratch link changed only `parentId`; `spawnedBy`/unrelated metadata unchanged.
- Unrelated repository excluded from repository-default tree.
- Global/subtree/filter/human/JSON outputs captured.
- Real source descriptors structurally unchanged; active daemon-owned fields were excluded
  from byte comparison.

## mutations[]

- remove `--approve` -> RED
- break explicit command precedence -> RED
- overwrite scratch `spawnedBy` -> RED
- invert repository membership -> RED
- direct `JSON.stringify` deep serializer -> RED

## open[]

- Bounded commit/push, PR ready transition, hosted Node22/24/Windows.
- Seq190 authorizes immediate squash merge when hosted gates succeed.
- Stage B activates only after merge/canonical deploy and daemon-restart baton.

