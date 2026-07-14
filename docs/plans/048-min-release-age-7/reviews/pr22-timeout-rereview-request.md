# Cold rereview — Seq 235 PR #22 timeout correction

Review the current unstaged diff independently. Scope is intentionally limited to `harness/scripts/release-age-policy.test.ts` plus s048 evidence.

## Required verification

1. The real PowerShell restoration probe remains real (not mocked/skipped) and retains all five load-bearing assertions.
2. Its `spawnSync` child has an explicit finite timeout of 15 seconds.
3. Only the named Vitest test has an explicit 20-second timeout; no global timeout is changed.
4. The test timeout is strictly greater than its child timeout (20s > 15s), leaving cleanup/reporting margin.
5. No product-policy behavior, manifest/lock/settings, global behavior, or unrelated path changed.
6. Evidence supports five focused 6/6 runs, full `just test` (1999 passed, 11 skipped), `harness checks` 8/8, and protected/index restoration.

## Mandatory non-vacuity

Confirm the five assertions still fail if policy visibility, conflict clearing, caller restoration, or error propagation is broken; confirm the explicit timeout ordering is asserted or structurally inescapable for the named real-process probe.

## Output

Persist verdict at `docs/plans/048-min-release-age-7/reviews/pr22-timeout-rereview.md` with file/line evidence and `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`. Read-only: no edits/stage/commit/push/global/main changes.
