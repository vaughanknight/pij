# Narrowed fix request — dlg-0002 / Seq 229

**Authority**: Seq 229. This is a correction to the persisted human reviewer verdict at `dlg-0002-review.md`; flow-pair `rev-0001` remains an artifact-contract record, not the code-review authority.

## Newly writable product path

- `install-windows.ps1`

## Required fixes

1. Apply the proven `npm ci --min-release-age=null` form **only** to the Windows frozen root lock replay. Preserve `-StartAt` behavior and all installer semantics.
2. Apply the shared seven-day child environment to every Windows fresh-resolution seam:
   - global `lean-ctx` npm install,
   - global official Pi npm install/update,
   - manifest package `pi install`, and
   - `pi update --extensions`.
   Use PowerShell `try`/`finally` restoration so the environment does not leak. No age-zero/null `npm install` or Pi package/global/update resolution is permitted.
3. Extend focused tests to assert the PowerShell seams and restoration behavior.
4. Strengthen `release-age-probe.ts` so refusal requires an age-specific cutoff diagnostic, or proves the same pinned package resolves when policy is removed.
5. Reconcile `docs/plans/048-min-release-age-7/reviews/execution.log.md` as the supported review-evidence artifact expected by flow-pair’s contract gate. It must truthfully summarize phase work, test/gate commands, review/fix loop, changed paths, and residual risks; do not represent it as a substitute for independent code review.

## Preserve

- `.npmrc` `min-release-age=7` + `audit=true` for fresh resolution.
- Existing report-and-continue package-vetter behavior.
- Package manifests, locks, minih refs, CI semantics except approved Windows root `npm ci` coverage, main checkout, global state, and Pi self-update non-coverage.
- No staging or commit. Rereview approval plus full gates are required before any baton request.

## Required evidence

- Windows-focused test output proves all stated seams and restoration.
- Native locked replay succeeds with no nested git prepare conflict.
- Fresh resolution remains rejected by the seven-day policy with a specific age signal (or a matched no-policy control resolves).
- Audit JSON remains observed.
- Protected lock/manifests remain unchanged.
