# T009-T010 tranche — production tree/link/adopt CLI

**Grant**: Spine Seq 171
**Scope authority**: `reports/t009-t010-grant-request.md`
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`

## Exact write paths

### Tests first

- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/core/session-join.test.ts`
- `.pi/extensions/pij/core/spawn.test.ts`

### Implementation

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/core/session-join.ts`
- `.pi/extensions/pij/core/spawn.ts`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t009-t010/execution.log.md`

## Tasks

| Status | ID | Task | Done When |
|--------|----|------|-----------|
| [ ] | T009A | Write RED strict parser/dispatch tests for `tree`, selectors, repeatable filters, `--all`, `--json`, invalid values/combinations, and default repository view. | Failures isolate missing tree grammar/projection/rendering. |
| [ ] | T009B | Write RED `link` tests for parent/root exclusivity, no-write errors, cycle refusal, root null, and unrelated-field/`spawnedBy` preservation. | Mutations can prove cycle/no-write and ownership guards. |
| [ ] | T009C | Write RED adopt/spawn tests for `--parent`, unknown/cycle refusal, repository refresh, and automatic control-spawn parent/repository pending metadata. | Existing identity/reservation/Codex/effort behavior remains diagnostic. |
| [ ] | T009D | Write RED session projection tests for additive parent/repository/current/old-prime fields with legacy required/null/omitted keys unchanged. | Exact row shape established. |
| [ ] | T009E | Write RED real scratch `PIJ_HOME` integration for repository/global/subtree trees, link/root/reparent, filters, adopt parent, and production spawn metadata. | Thin production wiring is exercised without real daemon restart. |
| [ ] | T009F | Write RED pathological 8,000-level human and JSON rendering tests. | Both render without JavaScript call-stack overflow and retain cycle metadata. |
| [ ] | T010A | Implement pure CLI tree/link grammar, registry mutation, iterative human rendering, and bounded iterative nested JSON serialization. | T009A/B/F green; invalid forms fail before writes. |
| [ ] | T010B | Wire top-level `pij tree`, `pij link`, repository resolution, and help/exit behavior through existing adapters. | Core + integration tests green; inbox/watch/broadcast grammar unchanged. |
| [ ] | T010C | Extend adopt grammar with `--parent`; validate/link against the effective graph before final write; refresh repository identity. | T009C green; ownership and durable identity preserved. |
| [ ] | T010D | Wire automatic control spawn parent/repository metadata and additive session projections. | T009C/D/E green. |

## Exact tree contract

- Bare tree = current repository across worktrees.
- `--global` = global active forest.
- positional id = arbitrary subtree independent of repo/prime.
- `--all` includes dead/dissolved history.
- repeatable filters compose OR within axis, AND across axes.
- human/JSON serializers are iterative/bounded and retain problem metadata.

## Required mutations

1. Disable link cycle/no-write guard -> RED.
2. Make link overwrite/drop `spawnedBy` -> RED.
3. Invert repository equality so unrelated repo enters and linked worktree drops -> RED.
4. Replace/disable bounded serializer guard so 8,000-level output fails -> RED.
5. Disable adopt unknown/cycle parent refusal -> RED.
6. Omit automatic control-spawn parent/repository pending metadata -> RED.

## Preserved contracts

- Current-only `list --prime`, ordinary P/O behavior, multiple current primes.
- T001-T008 tree/persistence/old-prime durability.
- `spawnedBy` close ownership.
- Inbox/pull, delivery, Codex, effort, reservations, binding, tail, watch, broadcast.

## Forbidden

- Every path outside the exact list above.
- Skills/docs/domains/smoke/live/restart/package/schema/dependency/government.
- Active s044 five files.
- `.flow-pair/**`, flow-state.
- T011/T012, commit/push/PR update/merge.

## Proof

- four requested test files including real scratch integration
- T001-T008 regressions
- close/inbox/no-tmux/Windows compatibility
- `just typecheck`
- `just lint`
- `harness checks --quick`

