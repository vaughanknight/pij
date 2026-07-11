# Ship Report — pij-prime-designation

**Generated**: 2026-07-11T12:42:00Z  
**Branch**: `main` → **Base**: `origin/main`  
**PR**: none — default-branch local workflow  
**State**: committed locally; push-main not requested

## Commits

- `6067b07f1b8286ff8d949038e250b4b31d2ec95e` — fix the skill coverage sensor first.
- `fc98f839217bdb5c6c1507895a9e94a47c2169d8` — prime designation product, tests, skill payload, docs, plan evidence, and retros.

The final commit staged exactly the 50 paths in `reports/commit-manifest.md`. Its body discloses the pre-existing `docs/how/pij.md` intro modernization folded under the standing metadata-fold ruling.

## Checks

| Check | Status | Details |
|-------|--------|---------|
| Plan validation | PASS | validate-v2: VALIDATED WITH FIXES; repaired findings rechecked |
| Phase 1 review | PASS | APPROVE_WITH_NOTES; no implementation findings; mutation RED → restore → GREEN |
| Phase 2 review | PASS | FIX_REQUIRED → dlg-0003 → APPROVE |
| Mutable merge mutation | PASS | exact 3 RED; byte-identical restore; 37/37 GREEN |
| Prime filter mutation | PASS | exact 2 RED; byte-identical restore; 56/56 GREEN |
| Strict boolean fix | PASS | exact 5 RED; focused 60/60 GREEN |
| Production-live daemon proof | PASS | set/list/unset; post-tick false persisted; original absent marker restored |
| `just pij-skill-check` | PASS | o-prime ship-time look also passed |
| `harness checks` | PASS | typecheck, lint, test, smoke, package audit, snapshots |
| Post-commit typecheck | PASS | shared tree compiled before each baton return |

**Verdict**: all deterministic and review gates green.

## Repo guidance applied

- Default-branch workflow: no PR is opened from `main` to `main`.
- Git-index and daemon-restart resources were acquired/returned through the live baton primitive.
- Push remains separately double-gated by the o-prime and Jordan.

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|------|------|-------|---------------|
| Deferred | Push `main` | repository | Requires o-prime deconflict plus Jordan's typed go. |
| Noteworthy | Bootstrap advisory line budget is 95/90 | `skills/pij/references/prime/rituals/bootstrap.md` | Baseline was already 91; gate is advisory and green. |
| Deferred | Descriptor live-proof snapshot/restore helper | Phase 2 retro DL-001 | Current manual tsx path worked; a helper would remove ad-hoc cleanup imports. |
| Noteworthy | Handover briefly has two prime markers | `seat-handover.md` | Intentional bounded overlap prevents a discovery gap; explicitly documented. |

## Resume

- Current local branch is 4 commits ahead of `origin/main`, 0 behind.
- Push command, only after both required approvals:

  ```bash
  git push origin main
  ```

- After push, verify remote checks/workflows and update the o-prime government row.
