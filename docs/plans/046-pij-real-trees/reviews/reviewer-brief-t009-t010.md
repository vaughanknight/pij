# Cold review brief — s046 T009-T010

**Grant**: Spine Seq 171
**Delegation**: `dlg-0004`
**Immutable diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0007.patch`
**Reviewer**: reusable cold Copilot `gpt-5.6-sol` xhigh

## Review target

Review only the exact eight product/test paths in `tasks/tranche-t009-t010/tasks.md`.
Ignore orchestrator-owned roster, request, and task artifacts as coder scope.

## Mandatory behavior checks

1. Bare repository tree groups linked worktrees and excludes unrelated repositories.
2. Global, arbitrary subtree, `--all`, repeatable filter, invalid-form, and JSON contracts match the grant.
3. Human and JSON serializers remain iterative/stack-safe at 8,000 levels and preserve cycle/orphan/filtered-parent metadata.
4. Link parent/root grammar is strict; unknown/self/cycle errors perform no write; only `parentId` changes and `spawnedBy` remains close owner.
5. Adopt `--parent` validates unknown/self/cycle before descriptor/reservation mutation, persists structural parent independently, refreshes repository identity, and preserves reattachment identity/delivery/Codex/reservation behavior.
6. Ordinary and agent control spawns persist resolved caller as both owner and structural parent plus repository identity; unresolved caller invents nothing.
7. Session projection adds parent/repository/current/old-prime without breaking legacy required/null/omitted keys or eval-safe explicit-root behavior.
8. Top-level help/dispatch/exit behavior does not regress inbox, pull waiting, models/effort, tail, watch, broadcast, agent, or orchestration surfaces.
9. T001-T008 persistence/current-prime contracts and close ownership remain green.
10. No skill/docs/domain/smoke/live/s044/package/dependency/excluded path.

## Dimension 0 — all six required

1. disable link cycle/no-write validation -> RED;
2. overwrite/drop `spawnedBy` during link -> RED;
3. invert repository equality -> RED;
4. replace bounded serializer with direct `JSON.stringify` -> 8,000-level RED;
5. disable adopt unknown/cycle parent validation -> RED with no-write assertion;
6. omit control-spawn parent/repository metadata -> RED.

Restore each mutation byte-identical and rerun GREEN.

## Commands

- four requested test files including real scratch integration
- T001-T008 targeted regressions
- close ownership
- inbox/no-tmux integration and Windows compatibility
- `just typecheck`
- `just lint`
- `harness checks --quick`

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t009-t010.md` with verdict, findings, six-mutation matrix, exact scope, compatibility assessment, and remaining uncertainty. No product edits.
