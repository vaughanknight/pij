# Validation — pij-prime-designation-plan.md

- **Validated**: 2026-07-11T11:32:08Z
- **Target**: `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md` · sha256 `58107ca700e27682bdcd8e202d6eef617c350ba2c9c35a55c65e22b6ecb5df3e`
- **Contract sources**: `original-ask.md`, `rulings.md`, `research-dossier.md`, current pij code/domain contracts
- **Checks**: required heading/gate scan; 12/12 AC coverage script; 11 task rows; existing manifest path resolution; `git diff --check`; independent implementation-readiness critic; targeted fix recheck
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The plan advances first-class prime designation and is implementation-ready; source-checked paths/contracts and repaired consumer/test ordering support that claim.
- **Consumers**: 3/3 satisfied — Phase 1 sensor repair, Phase 2 product fleet, o-prime fence review.

## Findings
| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | Registry-first route reads lacked bootstrap/handover writes, so real governments would keep falling through to roster discovery. | AC-09, Task 2.7, skill payload paths | RESOLVED — bootstrap + handover files added to goals, AC, manifest, tasks, and live proof. |
| MEDIUM | Daemon merge RED tests referenced `prime` before the descriptor type declared it, producing a compile failure instead of the intended assertion failure. | Task 2.1 ordering; typed `Partial<SessionDescriptor>` test helper | RESOLVED — type scaffold now explicitly precedes behavioral RED tests. |

## Repairs

- Added write-side adoption for newly seated and handed-over o-prime sessions.
- Moved the additive descriptor type scaffold before daemon merge RED tests.
- Rechecked both repairs against current paths and plan cross-references; no material findings remain.
