# Validation — dependency-chores-audit-plan.md

- **Validated**: 2026-07-11T12:00:00Z
- **Target**: `docs/plans/039-dependency-chores-audit/dependency-chores-audit-plan.md` · `5306257e6ad31c570ebff3c2d28f3098f7ef4993394e49380dc29ff5dfbffc44`
- **Contract sources**: `original-ask.md`, `rulings.md`, `research-dossier.md`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `docs/project-rules/harness.md`, `docs/domains/agent-runtime/domain.md`
- **Checks**: unified-plan structure and ID resolution; current source/path checks; scratch lock probes for 34→29→26; SW-5 ruling verification; independent critic plus targeted repair recheck
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The plan is implementation-ready for two attributable dependency batches; fresh lock probes prove the stated audit targets and the repaired seam/CI/domain contracts remove false-readiness risks.
- **Consumers**: 4/4 satisfied — implementation worker, cold reviewer, o-prime fence validation, and ship/CI gate.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | File-level pathspec could not exclude work item 040's package hunks. | SW-5 ruling, `rulings.md` §5 | Fixed: work item 040 reverted; o-prime verified both files clean; hunk staging refused. |
| MEDIUM | Exact Pi 0.80.6 wildcard-peer lock mechanism was underspecified. | `.harness/temp/s039/final-graph-probe/` | Fixed: proven constrain/regenerate/restore/regenerate sequence plus latest-version guard. |
| MEDIUM | CI's audit comment would become false after clearing the Vitest root. | `.github/workflows/ci.yml:27-31` | Fixed: T003 updates the comment while preserving report-only behavior. |
| MEDIUM | Initial root accounting missed shared `ws` and retained `tsx`/`esbuild` ancestry. | `.harness/temp/s039/{vitest-batch-probe,final-graph-probe}/` | Fixed: batches now include `tsx` 4.23/esbuild 0.28.1 and root `ws` 8.21; final gate uses total/critical/ancestry. |
| MEDIUM | Domain Manifest omitted `research-dossier.md`, referenced by T001. | plan task and manifest tables | Fixed: manifest row added and targeted recheck passed. |

## Repairs

- Replaced unsafe cross-stream hunk preservation with the ruled revert-to-HEAD handoff and git-index baton.
- Added the mechanically proven Pi wildcard-peer lock procedure and registry drift guard.
- Added `tsx` and root `ws` to the two safe batches after scratch probes disproved disjoint ancestry.
- Removed unstable final high/moderate acceptance counts; total, critical count, identities, and ancestry are the gates.
- Corrected CI comment scope and completed Domain Manifest coverage.
