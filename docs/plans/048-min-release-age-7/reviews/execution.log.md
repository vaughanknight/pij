# Execution log — dlg-0002

**Delegation**: `dlg-0002`
**Base**: `5830b279941538593a04483bfc1068911bdd3ffd`
**Implementation HEAD**: `83f7f49d3dc6dacdadb6c26ef0a9c7373fd1ea25`
**Status**: Seq 235 PR #22 timeout fix implemented and gated; cold rereview is required.

This is the supported flow-pair execution-evidence artifact. It records what the
implementation peer changed and proved; it is not a substitute for independent
code review or rereview approval.

## Phase work

- Added the committed npm policy `min-release-age=7` with `audit=true`.
- Applied the shared seven-day environment to pij-owned package, global Pi, and
  extension-update resolution while preserving package-vetter
  report-and-continue behavior.
- Scoped `--min-release-age=null` to frozen root `npm ci` lock replay in Unix
  bootstrap, Windows bootstrap, and Linux/Windows CI.
- Added an isolated local-registry probe that proves npm derives an
  approximately seven-day cutoff from the committed `.npmrc`, rejects a package
  published at probe time with that cutoff, observes audit JSON separately, and
  leaves protected manifests unchanged.
- Documented the lock-replay exception, audit separation, and Pi bare
  self-update non-coverage.

## Review and fix loop

The persisted reviewer verdict in `dlg-0002-review.md` was `FIX_REQUIRED`:

1. Windows root lock replay still used plain `npm ci`.
2. Four Windows fresh-resolution seams did not receive the seven-day child
   environment: global `lean-ctx`, official global Pi, manifest `pi install`,
   and `pi update --extensions`.
3. The refusal probe accepted a generic `ETARGET` without requiring age-specific
   evidence.
4. The supported `execution.log.md` artifact was absent.

Seq 229 authorized `install-windows.ps1` and this correction packet. The fixes:

- change only Windows root lock replay to
  `npm ci --min-release-age=null`;
- add one `Invoke-WithReleaseAgeEnvironment` wrapper that clears conflicting
  `npm_config_before`, sets `npm_config_min_release_age=7`, and restores both
  caller values in `finally`;
- wrap exactly the four listed Windows resolution seams;
- execute the PowerShell wrapper in the focused test, force an inner failure,
  and prove the policy is visible inside, the error propagates, and the caller
  environment is restored;
- require the refusal diagnostic's parsed `date before` cutoff to match npm's
  derived committed-policy cutoff within five minutes;
- create this execution log and update the implementation checkpoint.

Independent rereview remains the authority for approval.

## PR #22 hosted-timeout follow-up

PR #22 exposed one harness-only failure on hosted Node 22/24: the real
PowerShell restoration probe exceeded Vitest's global five-second default.
Seq 235 authorized timeout correction only.

- `spawnSync("pwsh", ...)` now has an explicit `15_000` ms timeout.
- Only the named restoration test has an explicit `20_000` ms timeout.
- The named-test value is derived as `15_000 + 5_000`, making the ordering
  structural and strictly greater.
- Real `pwsh` execution and all five original assertions remain unchanged:
  seven days inside, `before` cleared inside, both caller values restored, and
  the inner failure propagated.
- No global timeout or product behavior changed.

## Changed implementation paths

- `.npmrc`
- `.github/workflows/ci.yml`
- `install-windows.ps1`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/packages.ts`
- `harness/scripts/release-age-probe.ts`
- `justfile`
- `RUNBOOK.md`
- `docs/how/build.md`
- `docs/plans/048-min-release-age-7/reports/release-age-probe.json`
- `docs/plans/048-min-release-age-7/reports/implementation-checkpoint.md`
- `docs/plans/048-min-release-age-7/reviews/execution.log.md`

No package manifest, lockfile, generated Pi settings, flow-pair state, git index,
base commit, or main checkout change remains.

Seq 235 correction-only implementation path:

- `harness/scripts/release-age-policy.test.ts`

Seq 235 evidence-only paths:

- `docs/plans/048-min-release-age-7/reports/implementation-checkpoint.md`
- `docs/plans/048-min-release-age-7/reviews/execution.log.md`

## Command evidence

| Command | Result |
|---|---|
| `harness boot` | PASS — typecheck and full Vitest readiness stages |
| `pwsh -NoProfile -NonInteractive -Command '<Parser.ParseFile install-windows.ps1>'` | PASS — no PowerShell parse errors |
| `for run in 1 2 3 4 5; do just test harness/scripts/release-age-policy.test.ts; done` | PASS — five consecutive runs, each 6/6, with the real PowerShell probe executed every time |
| `just test` | PASS — 134 test files passed, 4 skipped; 1,999 tests passed, 11 skipped |
| `just release-age-probe > docs/plans/048-min-release-age-7/reports/release-age-probe.json` | PASS — all 10 checks true; refusal cutoff `2026-07-07T08:42:20.000Z` matched derived `before` `2026-07-07T08:42:04.743Z`; temp root removed |
| `npm ci --min-release-age=null` | PASS — 503 packages installed; nested git preparation completed without the npm/cli #9005 conflict |
| `just flow-pair-test` | PASS — 148/148 tests |
| `harness checks` | PASS — all 8 sensors after Seq 235: local paths, typecheck, lint, test, Windows compatibility, smoke, package audit, snapshots |
| `git diff --check` | PASS |
| `git diff --exit-code -- package.json package-lock.json .pi/packages.yaml .pi/settings.json` | PASS |
| `git diff --cached --name-only` | PASS — empty index |

The first focused correction run exposed a proof-shape difference: PowerShell
reported a cleared process environment variable as an empty string rather than
JSON `null`. The test was corrected to assert the semantic condition
`IsNullOrEmpty`; the final 6/6 run passed. This did not require a production
behavior change.

The final package-audit sensor refreshed five `vetted.date` fields in
`.pi/packages.yaml`. Those report-only side effects were restored byte-for-byte;
the protected-file diff is empty.

For Seq 235, the package-audit sensor refreshed the same five timestamp fields.
They were restored from `83f7f49d3dc6dacdadb6c26ef0a9c7373fd1ea25`;
package manifests, locks, generated settings, and the git index remain
unchanged.

## Stored probe evidence

- Fresh resolution used the committed `.npmrc` and no raw release-age argument.
- Refusal required both `ETARGET`/`No matching version` and an age-specific
  `date before` cutoff matching the configured seven-day cutoff.
- Root audit JSON was independently parseable and report-only: exit code `1`,
  26 existing findings (10 moderate, 16 high).
- Root `package.json`, `package-lock.json`, and `.pi/packages.yaml` retained
  SHA-256 values:
  - `baefc4af9bf8b44a46f5a27ec67e3722a934cbe25c26bb2caac7da87a1866c04`
  - `44390b8b14039c7d1d95ed90dc6ab8a57189384e68bdbfe2bc5685b1ff2f808d`
  - `4aaf036b17ab4bf70b59e7a6272e991cc38ba50070fd1f04c5ec80114de66be6`
- The lock still retains minih commit
  `a9bc26e8b19c0236d6aa8c10281c86e03c1e6201`.

## Residual risks

- No full live Windows bootstrap was run from this macOS worktree. PowerShell
  parsing, executable environment-restoration proof, source assertions, and the
  Windows compatibility sensor are green; hosted Windows execution remains the
  platform confirmation.
- PR #22 still requires a fresh hosted Node 22/24 run. The new bounds guarantee
  that a PowerShell child exceeding 15 seconds fails explicitly before the
  named test's 20-second Vitest limit.
- The lock-replay exception depends on npm continuing to interpret
  `--min-release-age=null` as clearing project configuration.
- Locked install, audit, and fresh registry resolution require external
  registry/GitHub availability.
- Pi's upstream bare self-update remains outside this policy by design.
