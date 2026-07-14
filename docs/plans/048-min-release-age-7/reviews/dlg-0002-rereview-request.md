# Cold rereview request — dlg-0002 Seq 229 fix

Review the current **full** s048 diff independently; do not rely on the prior verdict. Fix evidence:

- `docs/plans/048-min-release-age-7/reviews/execution.log.md`
- `docs/plans/048-min-release-age-7/reports/implementation-checkpoint.md`
- `docs/plans/048-min-release-age-7/reports/release-age-probe.json`
- `docs/plans/048-min-release-age-7/reviews/dlg-0002-review.md`
- `docs/plans/048-min-release-age-7/reviews/dlg-0002-fix-request.md`

## Verify the prior findings are actually fixed

1. `install-windows.ps1` uses null/disabled age **only** on the frozen root `npm ci`; preserve `StartAt` and no generic bypass.
2. Every Windows global Pi/lean-ctx/manifest-package/Pi-update fresh-resolution seam receives exact seven-day environment policy, with robust `try`/`finally` restoration and no leak.
3. Focused tests materially cover Windows source seams/restoration.
4. The fresh-refusal probe requires age-specific cutoff evidence (or a matched policy-off control), not generic ETARGET.
5. `reviews/execution.log.md` exists and truthfully reconciles the flow-pair artifact requirement without substituting for code review.
6. All original requirements remain: native `.npmrc` seven-day+audit policy, lock-only exception, report-and-continue, protected manifests/locks, audit separation, Pi self-update non-coverage.

## Required output

Persist a new cold-review verdict to `docs/plans/048-min-release-age-7/reviews/dlg-0002-rereview.md`, including severities/file-lines/evidence and a verdict (`FIX_REQUIRED`, `APPROVE_WITH_NOTES`, or `APPROVE`). Read-only: no edits, staging, commit, global/daemon/main mutation.

Retain the prior Dim-0 named-assertion proof only if it still applies after examining the current test. Add a new named assertion or mutation proof for the Windows-focused source seam if current test quality otherwise lacks a load-bearing guard.
