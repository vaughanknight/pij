# Review request — s048 dlg-0002

**Review target**: implementation delegation `dlg-0002`, captured as flow-pair `diff-0001`.

## Scope to inspect

- `.npmrc`
- `.github/workflows/ci.yml`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/packages.ts`
- `harness/scripts/release-age-probe.ts`
- `justfile`
- `RUNBOOK.md`
- `docs/how/build.md`
- `docs/plans/048-min-release-age-7/reports/release-age-probe.json`
- `docs/plans/048-min-release-age-7/reports/implementation-checkpoint.md`

## Contract to review

1. `.npmrc` uses native `min-release-age=7` (days) and `audit=true` for fresh resolution.
2. The only exception is root lock replay (`npm ci --min-release-age=null`) for npm/cli#9005; it must clear the nested git-prepare conflict, and never generalize to `npm install`/fresh resolution.
3. CI’s Node 22/24 and Windows root `npm ci` steps receive exactly the scoped lock-replay exception.
4. Pi package add/bootstrap/global/update resolution paths receive the seven-day policy; Pi bare self-update remains outside coverage.
5. package-vetter add/bootstrap/audit remains report-and-continue.
6. No manifest, lockfile, package source manifest, government file, main checkout, stage, or commit is touched.
7. Evidence honestly distinguishes audit findings from release-age behavior and confirms unchanged root lock/package manifests plus pinned minih refs.

## Mandatory Dim-0 test-quality proof

The coder wrote policy/probe tests. Prove at least one load-bearing assertion is non-vacuous with either:

```bash
just flow-pair-mutate harness/scripts/release-age-policy.ts '<safe targeted sed expression>'
```

followed by RED → byte-identical restore → GREEN, **or** a named assertion argument that identifies the exact test, guard, and why a broken implementation must fail it. Do not accept green tests without this proof.

## Reviewer constraints

Read-only review: do not edit product/evidence files, stage, commit, alter global/daemon state, or touch main. Persist the verdict in `docs/plans/048-min-release-age-7/reviews/` as `dlg-0002-review.md`. Use `FIX_REQUIRED`, `APPROVE_WITH_NOTES`, or `APPROVE`; list findings with severity, file/line, and concrete evidence.
