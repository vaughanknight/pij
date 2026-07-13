# T007-T008 tranche — old-prime core transitions

**Grant**: Spine Seq 160
**Scope authority**: `reports/t007-t008-grant-request.md`
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`

## Exact write paths

### Tests first

- `.pi/extensions/pij/core/orchestration/prime.test.ts`
- `.pi/extensions/pij/core/orchestration/cli.test.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`

### Implementation

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/orchestration/prime.ts`
- `.pi/extensions/pij/core/orchestration/cli.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t007-t008/execution.log.md`

## Tasks

| Status | ID | Task | Done When |
|--------|----|------|-----------|
| [ ] | T007A | Write RED service tests for set/retire/unset pair-state transitions, idempotence, multiple current primes, E-NOID, and unrelated-field preservation. | Tests fail only because `oldPrime` and `retire` are absent. |
| [ ] | T007B | Write RED orchestration grammar/dispatch tests for `prime retire [id] [--json]`, exact-self, explicit target, errors, and additive output. | Existing set/unset/baton behavior stays diagnostic. |
| [ ] | T007C | Write RED ordinary-list tests for P/O markers, corrupt both-true precedence, additive `oldPrime:boolean`, and current-only `list --prime`. | Existing columns, self marker, folder filter, inbox verbs, and JSON fields remain stable. |
| [ ] | T007D | Write RED daemon merge tests for latest persisted `oldPrime:true|false` over stale opposite/absence without regressing prime/parent/repository ownership. | Both set/clear directions fail before implementation. |
| [ ] | T008A | Add migration-safe `oldPrime?: boolean` and implement mutually exclusive set/retire/unset service results. | T007A green; multiple current primes remain valid. |
| [ ] | T008B | Implement `prime retire` pure CLI grammar/dispatch/rendering. | T007B green; no top-level CLI change required. |
| [ ] | T008C | Add old-prime ordinary-list human/JSON projection while preserving current-only filter. | T007C green. |
| [ ] | T008D | Add `oldPrime` to latest-disk-authoritative daemon mutable fields. | T007D green; T005-T006A merge tests remain green. |

## Required mutations

- Disable `set` clearing old-prime -> RED.
- Disable `retire` clearing current prime -> RED.
- Remove `oldPrime` from daemon mutable fields so latest false loses to stale true -> RED.
- Change `list --prime` to admit old-prime-only rows -> RED.

## Preserved contracts

- Multiple `prime:true` sessions are valid.
- `list --prime` means current-prime only.
- Parent/repository persistence and `spawnedBy` ownership remain green.
- Merged inbox/delivery/Codex/effort and list formatting/self marker remain green.

## Forbidden

- Every path outside the exact list above.
- Top-level CLI/integration, tree/link/adopt/session-join wiring, T011/docs/skills, smoke/live, package/schema/dependency/government.
- Active s044 five files.
- `.flow-pair/**`, flow-state files.
- Daemon restart, commit, push, PR update, merge.

## Proof

- four focused test files
- T005-T006A daemon/session/binding persistence regressions
- close ownership regression
- `just typecheck`
- `just lint`
- `harness checks --quick`

