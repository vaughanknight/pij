# Review — dlg-0002

**Verdict**: `FIX_REQUIRED`
**Base/HEAD**: `5830b279941538593a04483bfc1068911bdd3ffd`

## Findings

### HIGH — Windows root lock replay does not receive the approved exception

`install-windows.ps1:393-396` still runs plain `npm ci`. The new root `.npmrc`
therefore applies `min-release-age=7` to that bootstrap path, leaving it exposed
to the same npm/cli #9005 nested git-prepare conflict that the Unix recipe and
both CI jobs explicitly clear with `--min-release-age=null`.

This also contradicts `docs/how/build.md:54-59`, which states that both bootstrap
entry points use the scoped lock-replay exception.

Required fix: change only this frozen root lock replay to the exact approved
`npm ci --min-release-age=null` form.

### HIGH — Windows Pi/package resolution paths bypass the seven-day policy

The Windows bootstrap invokes package resolution without the policy environment:

- `install-windows.ps1:192` — global `npm install -g lean-ctx-bin`
- `install-windows.ps1:270` — `pi install <source>`
- `install-windows.ps1:400` — global official Pi `npm install -g`
- `install-windows.ps1:429` — `pi update --extensions`

The Unix equivalents explicitly inject `npm_config_min_release_age=7`, while
these Windows paths do not. The global npm installs cannot rely on the project
`.npmrc`, and Pi's nested resolution must not rely on its invocation directory.
Consequently contract item 4 is not met cross-platform.

`harness/scripts/release-age-policy.test.ts:69-90` does not inspect
`install-windows.ps1`, so the focused suite remains green despite these missing
paths. Required fix: apply the shared seven-day value to the Windows calls and
add assertions covering them.

### MEDIUM — The refusal probe accepts unrelated `ETARGET` failures

`harness/scripts/release-age-probe.ts:247-252` marks the fresh-resolution check
successful for any non-zero result containing `ETARGET` or
`No matching version`. A malformed fixture or genuinely absent version could
therefore satisfy the probe without release-age filtering.

The retained evidence is currently age-specific — its stderr says
`No matching version ... with a date before 07/07/2026` — but the executable
guard does not require that evidence. Required fix: assert the age-specific
diagnostic and cutoff, or add a control proving the same fixture resolves when
the age policy is removed.

## Contract assessment

| Item | Result | Evidence |
|---|---|---|
| `.npmrc` is seven days with audit enabled | PASS | `.npmrc:1-2`; focused test asserts byte-exact contents |
| Null exception is root lock replay only | FAIL | Unix and CI are scoped correctly, but Windows bootstrap uses plain `npm ci` |
| Node 22/24 and Windows CI receive the exception | PASS | `.github/workflows/ci.yml:20,46`; exactly two occurrences |
| Pi add/bootstrap/global/update resolution is governed | FAIL | Windows resolution calls listed above have no policy environment |
| Vetter remains report-and-continue | PASS | `packages.ts` control flow is unchanged; only install invocation was factored |
| Protected manifests/index/base remain untouched | PASS | cached diff empty; no diff for `package.json`, `package-lock.json`, `.pi/packages.yaml`, or `.pi/settings.json`; HEAD and merge-base unchanged |
| Evidence separates audit and release age, with pinned minih | PASS_WITH_NOTE | audit is separately captured as 26 findings; lock retains minih commit `a9bc26e8b19c0236d6aa8c10281c86e03c1e6201`; refusal guard needs hardening as above |

## Mandatory Dimension 0 — non-vacuity proof

**Named assertion argument**:
`harness/scripts/release-age-policy.test.ts:30-44`,
`overrides a caller-supplied lower value without mutating the caller environment`.

The test seeds `NPM_CONFIG_MIN_RELEASE_AGE=0` and
`npm_config_before=2000-01-01T00:00:00.000Z`, calls
`releaseAgeEnvironment`, then requires all of the following:

- child `npm_config_min_release_age` is exactly `7`;
- the uppercase zero override is absent;
- the conflicting `before` value is absent;
- both caller values remain unchanged.

This is load-bearing: removing the seven-day assignment, failing to strip either
conflicting key, or mutating the input object necessarily fails a named
assertion. The focused suite ran green with 5/5 tests.

## Review evidence

- Probe report: all ten stored checks true; locked install exit `0`; fresh
  refusal exit `1` with the age-specific `date before` diagnostic; audit exit
  `1` retained separately with 10 moderate and 16 high findings.
- Protected file hashes:
  - `package.json`: `baefc4af9bf8b44a46f5a27ec67e3722a934cbe25c26bb2caac7da87a1866c04`
  - `package-lock.json`: `44390b8b14039c7d1d95ed90dc6ab8a57189384e68bdbfe2bc5685b1ff2f808d`
  - `.pi/packages.yaml`: `4aaf036b17ab4bf70b59e7a6272e991cc38ba50070fd1f04c5ec80114de66be6`
- `package.json` remains pinned to `minih-v0.2.4`; the lock resolves it to
  `a9bc26e8b19c0236d6aa8c10281c86e03c1e6201`.
