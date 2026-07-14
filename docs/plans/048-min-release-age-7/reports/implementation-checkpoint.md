# s048 implementation checkpoint

**Delegation**: `dlg-0002`
**Outcome**: PR #22 TIMEOUT FIX COMPLETE — COLD REREVIEW REQUIRED
**Base**: `5830b279941538593a04483bfc1068911bdd3ffd`
**Implementation commit**: `83f7f49d3dc6dacdadb6c26ef0a9c7373fd1ea25`

## Implemented boundary

- Committed npm policy is exactly `min-release-age=7` days with `audit=true`.
- `pkg add` and `pkg bootstrap` Pi installs receive
  `npm_config_min_release_age=7` through the shared policy helper.
- The official global Pi npm install and `pi update --extensions` import the
  same typed seven-day constant.
- Windows bootstrap applies one restoring seven-day environment wrapper to
  global `lean-ctx`, official global Pi, manifest `pi install`, and
  `pi update --extensions`.
- Root lock replay alone uses `npm ci --min-release-age=null`, the Seq 225
  compatibility exception for npm/cli #9005. It is present only in Unix and
  Windows bootstrap plus the Linux Node 22/24 and Windows CI lock-replay steps.
- No age-zero or `null` `npm install` path exists.
- Pi's own bare self-update remains explicitly outside coverage.
- Package-vetter add/bootstrap/audit report-and-continue behavior is unchanged.
- The real PowerShell restoration probe now has a 15-second child-process bound,
  while only its named Vitest case has a 20-second bound. The test timeout is
  structurally derived as `15_000 + 5_000`, so the child timeout remains
  strictly smaller and reports first.

## Changed paths

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

No package manifest, lockfile, package source manifest, government file,
flow-pair ledger, or git index change remains.

Seq 235 correction-only implementation path:

- `harness/scripts/release-age-policy.test.ts`

Seq 235 evidence-only paths:

- `docs/plans/048-min-release-age-7/reports/implementation-checkpoint.md`
- `docs/plans/048-min-release-age-7/reviews/execution.log.md`

## Command evidence

| Command | Result |
|---|---|
| `harness boot` | PASS — typecheck and test readiness stages |
| `pwsh -NoProfile -NonInteractive -Command '<Parser.ParseFile install-windows.ps1>'` | PASS — no PowerShell parse errors |
| `for run in 1 2 3 4 5; do just test harness/scripts/release-age-policy.test.ts; done` | PASS — five consecutive focused runs, each 6/6; real `pwsh` restoration probe remained load-bearing |
| `just test` | PASS — 134 test files passed, 4 skipped; 1,999 tests passed, 11 skipped |
| `just release-age-probe > docs/plans/048-min-release-age-7/reports/release-age-probe.json` | PASS — all 10 checks true; age-specific cutoff matched derived seven-day `before`; temp root removed |
| `npm ci --min-release-age=null` | PASS — 503 packages installed; nested git preparation completed |
| `just flow-pair-test` | PASS — 148/148 tests |
| `just typecheck` | PASS |
| `just lint` | PASS with pre-existing repository warnings only |
| `just smoke` | PASS — 9/9 scenarios |
| `harness checks` | PASS — all 8 sensors after the Seq 235 timeout fix: local paths, typecheck, lint, test, Windows compatibility, smoke, package audit, snapshots |
| `git diff --check` | PASS |
| `git diff --exit-code -- package.json package-lock.json .pi/packages.yaml` | PASS |
| `git ls-remote https://github.com/AI-Substrate/minih.git refs/tags/minih-v0.2.4` | PASS — `a9bc26e8b19c0236d6aa8c10281c86e03c1e6201` |
| `gh api repos/AI-Substrate/minih/contents/package-lock.json?ref=minih-v0.2.4 --jq .sha` | PASS — `c578ef0a7584e511c4a56a01a9759028ebf2c134` |

The first full `harness checks` attempt reached every sensor but its smoke step
timed out while Pi cloned a package. The clone completed; `just smoke` then
passed, and the complete `harness checks` rerun passed.

The PR #22 hosted failure was limited to Vitest's five-second default expiring
while the real PowerShell child was still running. Seq 235 adds no global
timeout and changes none of the five non-vacuity assertions. `spawnSync` is
bounded at `15_000` ms; only
`restores the Windows caller environment even when a governed command fails`
is bounded at `20_000` ms. The named-test allowance is therefore strictly
greater by 5,000 ms.

The final package-audit sensor again refreshed five `vetted.date` fields in
`.pi/packages.yaml`. That generated drift was restored from the unchanged
implementation commit; protected manifests and settings have no diff.

## Probe facts

- npm normalized the committed seven-day setting to a `before` date
  approximately seven days earlier.
- Frozen lock replay ran only as `npm ci --min-release-age=null` and did not
  reproduce the inherited `min-release-age` / generated `before` conflict.
- Fresh install used no raw release-age argument. A local registry fixture
  published at probe time was refused with `ETARGET`; the parsed age-specific
  cutoff `2026-07-07T08:42:20.000Z` matched npm's derived committed-policy
  `before` value `2026-07-07T08:42:04.743Z`.
- Root `npm audit --json` remained parseable and report-only: 26 existing
  findings (10 moderate, 16 high), exit code 1 observed without being
  reinterpreted as a release-age failure.
- Root `package.json` and `package-lock.json` hashes were unchanged, and the lock
  still contains the pinned minih commit.

Full subprocess stdout/stderr and structured checks are retained in
`release-age-probe.json`.

## Residual risks

- The lock-replay exception depends on npm continuing to interpret CLI
  `--min-release-age=null` as clearing project configuration; the probe guards
  this behavior on the supported npm version.
- A full live Windows bootstrap was not run from this macOS worktree. The
  installer parses, its policy wrapper executes under PowerShell with
  failure-path restoration proof, and the Windows compatibility sensor passes;
  hosted Windows remains the platform confirmation.
- PR #22 still needs a fresh hosted Node 22/24 run to confirm the timeout fix in
  the environment that exposed it. If PowerShell exceeds 15 seconds, the child
  fails explicitly before the 20-second Vitest bound rather than hanging.
- Locked install and audit still require registry/GitHub availability.
- Pi's upstream bare self-update remains outside this control by design.
- `pkg audit` refreshes vetted timestamps as a side effect of the full harness
  gate; the generated `.pi/packages.yaml` drift was restored byte-for-byte
  because that manifest was outside this delegation.
