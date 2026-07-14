# Validation — min-release-age-7-plan

- **Validated**: 2026-07-13
- **Target**: `docs/plans/048-min-release-age-7/min-release-age-7-plan.md` · SHA-256 `b8cf34d101a55728e1c84b11e9b1cbab5341e0d7c7a228574367cb3f7837438b`
- **Contract sources**: `original-ask.md`; `research-dossier.md`; `reports/upstream-hardening-reconciliation.md`; `government/briefs/s048-pi-mono-hardening-note.md`; `government/spine.md` Seq 198; current `harness/scripts/packages.ts`; `justfile`; `.github/workflows/ci.yml`.
- **Checks**: fresh rebase to `origin/main@b8a8b6e`; `harness boot` (typecheck and test PASS); full corrected-plan read; authoritative npm v11/ pi-mono unit review; fixed-section/AC/task/order parser; prohibited incorrect-unit token scan; plan trailing-whitespace scan; reread of current npm/Pi install seams.
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The plan now specifies native npm `min-release-age=7` in **days**, carries the inherited Pi-process propagation proof, and classifies upstream hardening controls without expanding the fence; target proof = Implementation, actual proof = source-aligned implementation plan with fresh structural and boot evidence.
- **Consumers**: `WAITING_FOR_BUILD_CONFIG` implementor packet — all permitted paths, held PR #14 paths, task done-when criteria, seven-day value, security boundaries, and proof requirements are explicit.

## Findings
| Severity | Finding | Evidence | Status |
|----------|---------|----------|--------|
| CRITICAL | The earlier plan used an incorrect unit for npm 11.10.0 `min-release-age`, which would have quarantined dependencies for the wrong duration. | `s048-pi-mono-hardening-note.md` correction and Seq 198: npm config defines days with cutoff `86400000 * value`. | Repaired: plan, ACs, task/probe expectations, research, flow note, and checkpoint use `7` days; token scan and structural recheck PASS. |
| MEDIUM | The first plan did not classify all upstream pi-mono controls, risking accidental scope expansion. | Upstream note’s required reconciliation list. | Repaired: upstream reconciliation report and plan matrix classify each control as adopted, already covered, complementary, or explicitly outside scope. |
| MEDIUM | The first plan called an npm age override "approved" despite no human ruling establishing a project bypass policy. | Validation contract required no invented operational decision; only npm’s external precedence behavior was evidenced. | Repaired: plan forbids a project bypass recipe and limits any higher-priority override to an explicit human-directed command. |
