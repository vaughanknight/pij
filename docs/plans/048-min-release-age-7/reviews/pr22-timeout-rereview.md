# Cold rereview — Seq 235 PR #22 timeout correction

**Verdict**: `APPROVE`

**Findings**: None.

## Scope and boundary

- The current unstaged implementation diff changes only
  `harness/scripts/release-age-policy.test.ts`; the other tracked changes are
  the two authorized s048 evidence records.
- The two untracked request files are also under the authorized s048 evidence
  path.
- The git index is empty.
- `package.json`, `package-lock.json`, `.pi/packages.yaml`, and
  `.pi/settings.json` have no diff.
- No product-policy implementation, global behavior, Vitest configuration,
  flow state, manifest, lockfile, generated settings, or unrelated path changed.

## Contract verification

1. The restoration probe remains a real child-process test:
   `harness/scripts/release-age-policy.test.ts:1,26-95` imports and calls
   `spawnSync("pwsh", ...)`, parses the real `install-windows.ps1` function,
   executes it, and rejects child/process failures. The test is neither mocked
   nor skipped.
2. The child timeout is explicitly `15_000` ms at
   `harness/scripts/release-age-policy.test.ts:14,78-87`.
3. Only the named restoration test receives the local Vitest timeout at
   `harness/scripts/release-age-policy.test.ts:189-203`. The repository's
   existing global `testTimeout: 5000` at `vitest.config.ts:62` is unchanged.
4. The ordering is structurally inescapable:
   `POWERSHELL_TEST_TIMEOUT_MS` is defined as
   `POWERSHELL_PROBE_TIMEOUT_MS + 5_000` at
   `harness/scripts/release-age-policy.test.ts:14-15`, and those constants are
   used directly by the child and named test. Therefore the bounds are exactly
   15 seconds and 20 seconds, with a five-second reporting margin.
5. The implementation diff preserves the original five assertions byte-for-byte
   apart from indentation at
   `harness/scripts/release-age-policy.test.ts:196-200`.

## Mandatory non-vacuity

The real-process probe loads the production PowerShell function from the
installer AST and invokes it under conflicting caller values before forcing an
inner exception (`harness/scripts/release-age-policy.test.ts:27-76`).

- Breaking policy visibility changes `insideMinReleaseAge`, causing the exact
  `"7"` assertion at line 196 to fail.
- Failing to clear the conflicting `npm_config_before` value changes
  `insideBeforeCleared`, causing the `true` assertion at line 197 to fail.
- Failing to restore the caller's age changes `restoredMinReleaseAge`, causing
  the exact `"2"` assertion at line 198 to fail.
- Failing to restore the caller's `before` value changes `restoredBefore`,
  causing the exact timestamp assertion at line 199 to fail.
- Swallowing or replacing the forced inner error leaves `errorPropagated`
  false or makes the probe itself throw, causing line 200 or the probe call to
  fail.

The timeout proof is also non-vacuous: the child bound is passed directly to
`spawnSync` at line 86, while the larger derived bound is passed only to this
test at line 202. Removing either use restores an unbounded child or the global
five-second test limit; reversing the ordering requires changing the shared
constant relationship at lines 14-15.

## Evidence

- Independent cold-rereview execution ran the focused real-PowerShell suite
  five consecutive times: each run passed 6/6, in 505 ms, 287 ms, 373 ms,
  364 ms, and 370 ms.
- Independent `just test` passed 134 test files with 4 skipped and 1,999 tests
  with 11 skipped; the restoration suite passed 6/6 within that run.
- The durable execution evidence records the same five focused 6/6 runs, the
  full-suite counts, and `harness checks` passing all 8 sensors at
  `docs/plans/048-min-release-age-7/reviews/execution.log.md:99-113`.
- The implementation checkpoint independently records those counts and the
  eight named harness sensors at
  `docs/plans/048-min-release-age-7/reports/implementation-checkpoint.md:57-75`.
- `git diff --check` passes. Post-test protected-file diff remains empty, the
  index remains empty, and the worktree status is unchanged from the authorized
  correction/evidence scope.
