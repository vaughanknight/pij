# Execution log — T007-T008

**Status**: complete
**Grant**: Spine Seq 160
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0003`

## Checkpoints

| At | Actor | State | Evidence |
|----|-------|-------|----------|
| 2026-07-13T13:12:00+10:00 | orchestrator | grant accepted | exact nine paths + required mutation matrix |
| 2026-07-13T13:13:00+10:00 | orchestrator | packet frozen | `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0003.md` · hash `8c1d1b71` |
| 2026-07-13T13:15:00+10:00 | coder | RED | four focused files: 18 failed, 126 passed; failures isolated to absent old-prime transitions, retire grammar, list projection, and daemon merge ownership |
| 2026-07-13T13:16:00+10:00 | coder | GREEN | four focused files: 144/144 after the initial implementation |
| 2026-07-13T13:17:00+10:00 | coder | mutations proven | all four required mutations failed their targeted tests and were restored |
| 2026-07-13T13:20:00+10:00 | coder | compatibility preserved | excluded top-level integration exposed legacy `set`/`unset` JSON receipt shape; allowed core rendering was adjusted test-first while `retire --json` remains additive; orchestration + integration 74/74 |
| 2026-07-13T13:21:00+10:00 | coder | gates green | final focused 145/145; T005-T006A persistence 276/276; close ownership 15/15; flow-pair 148/148; typecheck, lint, and `harness checks --quick` passed |
| 2026-07-13T13:22:00+10:00 | orchestrator | audit cleanup | `.pi/packages.yaml` report-only vetted-date churn restored byte-identical to `HEAD` |
| 2026-07-13T13:29:00+10:00 | reviewer | APPROVE | no findings; four required mutations RED→restore→GREEN; exact nine-file scope |
| 2026-07-13T13:31:13+10:00 | orchestrator | tranche accepted | ten targeted suites 389/389; quick full sensors green incl. Windows compatibility; smoke skipped/T012 |

## Implementation

- Added migration-safe `oldPrime?: boolean`.
- `set` writes `(prime, oldPrime) = (true, false)`.
- `retire` writes `(false, true)`.
- `unset` writes `(false, false)`.
- Transitions are idempotent on the complete pair, preserve unrelated descriptor fields, and do not enforce prime uniqueness.
- Added pure `prime retire [<id>] [--json]` grammar and dispatch.
- Preserved legacy `set`/`unset` JSON receipts while adding `oldPrime` to retire JSON and ordinary list JSON.
- Ordinary list renders current prime as `P`, old-prime-only as `O`, and corrupt both-true state as `P`.
- `list --prime` remains current-prime-only.
- Added `oldPrime` to latest-disk-authoritative daemon merge ownership.

## Mutation matrix

| Mutation | RED proof |
|----------|-----------|
| Disable `set` clearing old-prime | prime service: 3 failed, 7 passed |
| Disable `retire` clearing current prime | prime service: 2 failed, 8 passed |
| Remove `oldPrime` from daemon mutable fields | daemon loop: 3 failed, 44 passed |
| Admit old-prime-only rows to `list --prime` | core CLI: 1 failed, 49 passed |

All mutations were restored; the final four-file focused suite passed 145/145.

## Gates

| Gate | Result |
|------|--------|
| Four focused test files | PASS · 145/145 |
| T005-T006A persistence regressions | PASS · 276/276 |
| Close ownership regression | PASS · 15/15 |
| Top-level integration compatibility | PASS · orchestration + integration 74/74 |
| `just flow-pair-test` | PASS · 148/148 |
| `just typecheck` | PASS |
| `just lint` | PASS · ten pre-existing warnings and one Biome schema notice |
| `harness checks --quick` | PASS · typecheck, lint, test, windows compatibility, package audit, snapshots |

Orchestrator checkpoint:

```text
ten targeted suites                        389/389
harness checks --quick                     PASS
  typecheck, lint, full tests, windows-compat, pkg-audit, snapshots
review                                     APPROVE
```

## Preserved contracts

- Multiple current primes remain valid.
- `list --prime` remains current-prime-only.
- Parent/repository persistence and explicit `parentId: null` merge ownership remain green.
- `spawnedBy` remains the sole close-authorization owner.
- Existing inbox, delivery, Codex, effort, list-column, and self-marker behavior remains green.
- Cold review verified service results carry `oldPrime` while legacy set/unset CLI JSON remains intentionally byte-compatible.

## Deferred

- Top-level CLI/wiring, T011/docs/skills, smoke/live, restart, git ceremony, and merge remain excluded.
