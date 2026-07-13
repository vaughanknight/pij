# Cold review brief — s046 T007-T008

**Grant**: Spine Seq 160
**Delegation**: `dlg-0003`
**Immutable diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0006.patch`
**Reviewer**: reusable cold Copilot `gpt-5.6-sol` xhigh

## Review target

Review only the exact nine product/test paths in `tasks/tranche-t007-t008/tasks.md`.
Ignore orchestrator-owned roster, grant request, and task-contract files as coder scope.

## Mandatory checks

1. `oldPrime?: boolean` is additive and legacy absence means false.
2. `set`, `retire`, and `unset` write `(true,false)`, `(false,true)`, `(false,false)`, are idempotent over both fields, preserve unrelated metadata, and do not enforce uniqueness.
3. Pure orchestration grammar/dispatch supports `retire` with exact-self and explicit-target contracts while baton/set/unset stay compatible.
4. Service results carry `oldPrime`; legacy set/unset CLI JSON compatibility is intentional, while retire JSON and ordinary list JSON expose old-prime.
5. Ordinary list markers: current `P`, old-only `O`, corrupt both-true `P`; columns/self marker unchanged.
6. `list --prime` remains current-prime-only and excludes old-only rows.
7. Daemon latest-disk `oldPrime:true|false` beats stale opposite/absence without regressing `prime`, parent, repository, reportedAt, or dissolve semantics.
8. No top-level CLI/wiring, session-join, tree, docs/skills, s044, smoke/live, package, dependency, or excluded path.
9. Merged inbox/delivery/Codex/effort and T005-T006A persistence regressions remain green.

## Dimension 0 — all required

- disable `set` clearing old-prime -> RED;
- disable `retire` clearing current prime -> RED;
- remove `oldPrime` from daemon mutable fields so latest false loses to stale true -> RED;
- make `list --prime` admit old-prime-only rows -> RED;
- restore byte-identical and rerun GREEN.

## Commands

- four focused test files
- T005-T006A persistence regressions
- close ownership
- `just typecheck`
- `just lint`
- `harness checks --quick`

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t007-t008.md` with verdict, findings, mutation matrix, exact scope, compatibility assessment, and remaining uncertainty. No product edits.
