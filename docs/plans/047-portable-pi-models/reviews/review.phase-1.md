# Targeted Re-review: s047 Phase 1

**Plan**: `docs/plans/047-portable-pi-models/portable-pi-models-plan.md`
**Parent SHA**: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
**Reviewer**: `pij-grubby-marsupial`
**Date**: 2026-07-13
**Packet**: `docs/plans/047-portable-pi-models/packets/reviewer-rereview-1.md`

## Verdict

**APPROVE**

All three retained findings are resolved. The atomic-write safety claim is now
mutation-resistant against the reviewed direct-overwrite regression, the phase
has its required execution and learning record, and the documentation pointer
is accurate. No fix-scope drift was found.

## Resolved Findings

| Finding | Prior severity | Status | Targeted evidence |
|---|---|---|---|
| F001 - Missing execution log | CRITICAL | **RESOLVED** | `tasks/phase-1-portable-model-catalog-sync/execution.log.md` records T001-T006, all eight owned implementation files, whole-provider replacement, source-boundary and same-directory temp/rename decisions, exact test counts, gate outcomes, the external smoke blocker, the held document, and forbidden side-effect exclusions. |
| F002 - Atomic-write test stayed green under direct overwrite | HIGH | **RESOLVED** | `sync-models.test.ts:135-145` guards same-directory temporary creation/write, `renameSync(tempPath, targetPath)`, and absence of direct `writeFileSync(targetPath, ...)`. The exact direct-overwrite mutation failed the targeted suite at line 143: 1 failed, 7 passed. |
| F003 - Inaccurate recipe source pointer | LOW | **RESOLVED** | `docs/how/build.md:74` now cites the complete `justfile:106-109` recipe range. |

## Targeted Mutation Evidence

- **Original production SHA-256**:
  `03378e22820b672c5b98dae2aecec8d1cbb6333bb0af442678af9fb338513f87`.
- **Mutation**: replaced `renameSync(tempPath, targetPath)` with direct
  `writeFileSync(targetPath, content, "utf8")` and temporary-file removal.
- **RED**: `syncModels > guards same-directory temporary writes followed by
  atomic rename` failed at `sync-models.test.ts:143`; 1 failed, 7 passed.
- **Restore**: production SHA-256 returned byte-identically to
  `03378e22820b672c5b98dae2aecec8d1cbb6333bb0af442678af9fb338513f87`.
- **GREEN**: targeted suite passed 8/8 after restoration.

Dimension 0 and AC-05 now pass. The source-structure guard is deliberately
narrow: it enforces the persistence sequence whose removal previously escaped
the behavioral filesystem fixtures, while those fixtures continue to prove the
runtime result without broad filesystem mocks.

## Fresh Proof Results

| Command | Result |
|---|---|
| `npx vitest run harness/scripts/sync-models.test.ts` | PASS, 8/8 before mutation and after exact restore |
| `just typecheck` | PASS |
| `just lint` | PASS, exit 0; 10 pre-existing warnings and one schema-version informational message |
| `git diff --check` | PASS |

Per the re-review packet, full smoke, `harness checks`, package audit, home
writes, linking, and daemon operations were not run.

## Scope Verification

- Relative to the reviewed implementation, fixes are confined to
  `harness/scripts/sync-models.test.ts`, `docs/how/build.md`, and the authorized
  nested `execution.log.md`.
- `harness/scripts/sync-models.ts` is byte-identical to the reviewed production
  helper after the mutation probe.
- `docs/how/pij-models-discovery.md` and `.pi/packages.yaml` remain untouched.
- No real-home target, auth, general-skill, settings, daemon, link, push, remote,
  flow-state, or main-checkout action was performed.
