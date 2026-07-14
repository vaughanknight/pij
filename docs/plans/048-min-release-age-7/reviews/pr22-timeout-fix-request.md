# PR #22 hosted-timeout fix request — Seq 235

## Confirmed root cause

The real PowerShell restoration probe in `harness/scripts/release-age-policy.test.ts` exceeded Vitest’s default five-second timeout on hosted Node 22/24. Product policy/logic remains approved.

## Narrow writable scope

- `harness/scripts/release-age-policy.test.ts`
- `docs/plans/048-min-release-age-7/**` evidence only

## Required correction

1. Keep real `pwsh` execution. Do not replace it with a mock, skip it, or weaken any of its five assertions.
2. Give the `spawnSync` child an explicit bounded timeout.
3. Give **only this named test** a larger explicit Vitest timeout, strictly greater than the child timeout. Document/verify the ordering.
4. Do not change a global timeout.
5. Run the focused suite repeatedly and then full `just test` and `harness checks`.
6. Update durable evidence with exact commands, pass counts, timeout values, timeout-ordering proof, and residual risks.

## Boundaries

- No product behavior change; no unrelated paths.
- No stage, commit, amend, push, manifest/lock/settings/government/main/global mutation.
- This is a new follow-up commit after review and a fresh git-index baton; never amend `83f7f49`.

## Review requirement

A cold reviewer must verify the exact timeout ordering and that the original real-PowerShell/non-vacuity proof remains load-bearing.
