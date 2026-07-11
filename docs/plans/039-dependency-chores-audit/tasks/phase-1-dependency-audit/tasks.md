# Phase 1 — dependency audit

**Plan**: `docs/plans/039-dependency-chores-audit/dependency-chores-audit-plan.md`
**Objective**: implement every T001–T006 task as one bounded phase and prove 34→29→26 without scope drift.

## Constraints

- Allowed shipping surfaces: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`.
- Allowed evidence surfaces: this task directory and `docs/plans/039-dependency-chores-audit/reports/`.
- `vitest.config.ts` is read-only; stop and escalate on a proven compatibility failure.
- minih remains pinned to `minih-v0.2.4`; PR 73 is monitor-only.
- Lockfile changes must be produced through npm tooling only.
- No `npm audit fix --force`, broad `npm outdated` upgrade, hunk-level staging, `git add -A`, or `git add .`.
- Git-index baton lease `lease-8fe94a5d-506e-4faa-8275-e8c9be012773` governs staging/commit.
- Full gate after each dependency batch before yielding.
- Immediately before each package mutation, run the full suite and record the exact failure set.
- A post-bump failure not present in that bump's pre-bump set is presumed Plan 039's fault in any file: stop and escalate.
- Pre-existing failures confined to s038 fenced tests are tolerated sibling churn; global green remains mandatory at ship.
- Current tolerated sibling failure set is empty (`rulings.md` §7 update); any test failure appearing post-bump anywhere is presumed Plan 039's.
- Ruling §8 grants exactly three live-test files for Vitest 4 argument reordering only; preserve every test name, assertion, and timeout value.
- Current tolerated sibling set is empty (`rulings.md` §9 update).
- npm may briefly remove `minih` and flicker the live pij control plane; use atomic npm operations where supported and do not classify successful peer retries as product regressions.
- Subprocess-spawning tests may return empty output while `node_modules/.bin` repopulates; retry at install quiescence and escalate only if the failure persists.

## Tasks

| Status | ID | Task | Done When |
|--------|----|------|-----------|
| [x] | T001 | Freeze baseline and registry state. | Package files are clean at HEAD; baton is held; audit is 34; all three Pi latest versions are 0.80.6; minih has no new green released tag. |
| [x] | T002 | Record the full-suite pre-bump set, upgrade Vitest to 4.1.10 and `tsx` to 4.23.0, then apply ruling §8's reorder-only migration in the three granted live-test files. | Root `esbuild` is 0.28.1; real post-update audit is 29 with critical 0; test names/assertions/timeouts are unchanged; no post-bump failure remains; `just typecheck`, `just lint`, `just test`, then full `harness checks` pass. |
| [x] | T003 | Record a fresh full-suite pre-bump set, then temporarily constrain all three Pi peers to 0.80.6, regenerate lock, restore wildcard peers, regenerate again, refresh root `ws` to 8.21.0, and update CI to Node 22/24 with an honest audit comment. | Final manifest keeps `"*"` peers; lock resolves Pi 0.80.6 and root ws 8.21.0; real audit is 26 with critical 0; no post-bump failure is new relative to the recorded set; full gates pass under the discriminator. |
| [x] | T004 | Prove clean-install reproducibility and minih-only residual ancestry. | Fresh `npm ci` succeeds; all 26 findings trace only to minih; minih contract test and full harness gate pass. |
| [x] | T005 | Verify final scope and evidence. | Diff contains only granted surfaces; no Dependabot/minih-ref/unrelated update; execution log carries commands and outputs. |
| [x] | T006 | Commit the two attributable batches and write the phase checkpoint. | Vitest/tsx and Pi/ws/CI commits have exact pathspecs under the baton; checkpoint records SHAs, audit deltas, gates, observations, and opens. |

## Acceptance

- AC-01 through AC-09 in the plan are all satisfied.
- Final audit gate: total 26, critical 0, residual ancestry minih-only; high/moderate split is informational.
- Remote Node 22/24 CI remains a ship-stage proof; local phase reports the workflow change and local gates honestly.
