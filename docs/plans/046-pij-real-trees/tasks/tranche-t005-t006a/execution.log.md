# Execution log — T005-T006A

**Status**: complete
**Grant**: Spine Seq 152
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0002`

## Checkpoints

| At | Actor | State | Evidence |
|----|-------|-------|----------|
| 2026-07-13T12:27:00+10:00 | orchestrator | grant accepted | exact 12 paths + named evidence; merged invariants frozen |
| 2026-07-13T12:28:00+10:00 | orchestrator | packet frozen | `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0002.md` · hash `3caa0bc4` |
| 2026-07-13T12:32:41+10:00 | coder | RED | six focused files: 9 failed, 262 passed; failures isolated to pending/session/binding/daemon/index metadata handoffs |
| 2026-07-13T12:33:40+10:00 | coder | GREEN | six focused files: 271 passed |
| 2026-07-13T12:35:15+10:00 | coder | gates green | close 15/15; typecheck; lint exit 0; `harness checks --quick` all six runnable sensors passed, smoke skipped |
| 2026-07-13T12:36:12+10:00 | orchestrator | scope restored | required package-audit date churn restored owner-side; manifest byte-identical to HEAD |
| 2026-07-13T12:47:00+10:00 | reviewer | R1 FIX_REQUIRED | implementation preserved failure metadata, but the strip mutation survived because no load-bearing regression existed |
| 2026-07-13T12:49:31+10:00 | coder | R1 mutation RED | isolated reviewer mutation stripped failure-path `parentId` and `gitCommonDir`: 2 failed, 42 passed |
| 2026-07-13T12:49:45+10:00 | coder | R1 GREEN | daemon loop 44/44; focused six files 273/273; close 15/15; typecheck and lint passed |
| 2026-07-13T12:54:00+10:00 | reviewer | R2 APPROVE | sole blocker closed; exact failure-strip mutation RED→restore→GREEN |
| 2026-07-13T12:56:10+10:00 | orchestrator | tranche accepted | seven targeted suites 288/288; quick full sensors green incl. Windows compatibility; smoke skipped/T012 |

## Decisions

- `parentId` remains independent from `spawnedBy`: pending descriptors and Pi registration persist structural parent metadata without changing close ownership.
- `parentId: null` is preserved with explicit `undefined` checks; absence continues to preserve legacy/durable metadata.
- Fresh non-null `gitCommonDir` values replace stale registration/reattachment values; absent input preserves the prior durable key.
- Daemon writes treat `parentId` and `gitCommonDir` as latest-disk-authoritative mutable fields beside the existing `prime` ownership rule.
- `FsRegistry` required no implementation change: its whole-descriptor snapshot, hydration, and dissolve paths already preserved arbitrary optional metadata; the new regression locks that behavior.
- R1 makes failure-path parent/repository/ownership durability mutation-resistant for both explicit parent id and explicit-root null.

## RED to GREEN

```text
RED:   6 files, 271 tests — 9 failed, 262 passed
GREEN: 6 files, 271 tests — 271 passed
```

The RED failures covered:

- pending descriptor `parentId` id/null and repository persistence;
- Pi registration, reload, durable hydration, and dissolve;
- reattachment repository refresh with structural/ownership/delivery preservation;
- latest-disk daemon merge for explicit-root `null` and repository identity;
- Pi extension repository adapter and `PIJ_PARENT_ID` wiring.

The filesystem identity-snapshot characterization passed in RED because the existing generic snapshot implementation already satisfied T005E.

## R1 failure-path durability

Added a table-driven daemon failure regression covering:

- `parentId: "pij-structural-parent"`;
- `parentId: null`.

Both cases begin as bound descriptors with `gitCommonDir: "/repo/.git"` and
`spawnedBy: "pij-close-owner"`, then take the authoritative dead-pane failure
path. The regression requires the failed lifecycle, structural parent state,
repository identity, close owner, classified death reason, and creator notice
to survive persistence together.

The reviewer mutation was reapplied in an isolated copy of the worktree:

```text
Mutation: strip parentId and gitCommonDir inside fail() before markFailed()
RED:      daemon loop 2 failed, 42 passed
GREEN:    daemon loop 44 passed
```

The repository implementation was not edited and remained byte-identical at
SHA-256 `9d2da964401076c627c0a8632e6a31061bb839de8b537fdb2ff6b91c808c36cf`.

## Files changed

- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `.pi/extensions/pij/adapters/fs-registry.test.ts`
- `.pi/extensions/pij/index.test.ts`
- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/core/session.ts`
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`
- `.pi/extensions/pij/index.ts`
- `docs/plans/046-pij-real-trees/tasks/tranche-t005-t006a/execution.log.md`

## Gates

```text
just test <six granted test files>       271/271
just test .pi/extensions/pij/core/close.test.ts
                                          15/15
just typecheck                           PASS
just lint                                PASS (10 pre-existing warnings, 1 schema notice)
harness checks --quick                  PASS
  typecheck, lint, test, windows-compat, pkg-audit, snapshots
  smoke                                  SKIPPED by --quick / T012-owned
```

R1 proof:

```text
just test .pi/extensions/pij/core/daemon/loop.test.ts
                                           44/44
just test <six granted test files>       273/273
just test .pi/extensions/pij/core/close.test.ts
                                           15/15
just typecheck                           PASS
just lint                                PASS (10 pre-existing warnings, 1 schema notice)
```

Review/checkpoint proof:

```text
review R2                              APPROVE
orchestrator seven targeted suites      288/288
harness checks --quick                  PASS
  typecheck, lint, full tests, windows-compat, pkg-audit, snapshots
```

Exact scope is clean for coder-owned changes. The pre-existing orchestrator-owned
`docs/plans/046-pij-real-trees/reports/fleet-roster.md` modification and untracked
`docs/plans/046-pij-real-trees/tasks/tranche-t005-t006a/tasks.md` were not touched.

## Deferred

- Old-prime, top-level CLI/wiring, T011, smoke/live, restart, git ceremony, and merge remain excluded.
