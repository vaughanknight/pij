# Plan 131 — Phase 1 execution log

## tk-0001 — npm resolution replay

- RED: npm 11.5.1 was accepted by the preflight although native `min-release-age` starts at 11.10.0; the new regression failed at `artifact://73`.
- Decision: prime explicitly widened scope to `harness/scripts/release-age-policy.ts` and the affected tests/callers; required fail-closed behavior, no quarantine, and no operator npm-config change.
- Change: require npm 11.10.0, preserve a named refusal below it, fix the HTTP fixture's npmjs-host replay URL, and retain assertion diagnostics.
- GREEN: `just test harness/scripts/release-age-policy.test.ts harness/scripts/npm-resolution-policy.integration.test.ts harness/scripts/packages-bootstrap.test.ts` — 14/14 passed (`artifact://76`); `just typecheck` passed.

## tk-0002 — worktree teardown

- RED: the unchanged test failed on repeat 6 with macOS `ENOTEMPTY` from `afterEach` removing the temporary repository root.
- Change: retain synchronous recursive cleanup and use Node's built-in `maxRetries: 5` with `retryDelay: 100` for transient `ENOTEMPTY`.
- GREEN: 30 sequential `just test .pi/extensions/pij/core/worktree.test.ts` runs passed; 210 tests total, zero failures.

## tk-0003 — fresh-worktree proof

- Live tmux proof: pane `%2911` ran `just test` from this linked worktree with canonical `node_modules` symlink.
- Result: 231 test files passed, 4 named skipped files; 4,645 tests passed, 19 named skips; exit 0.
- Transcript: `docs/plans/131-baseline-red-tests/assets/live-proof.md` (`artifact://82` capture receipt).
- Full `harness checks`: PASS at 2026-09-02T03:38:32.086Z — all eight sensors passed, zero skipped.

## Restart checkpoint — pij wire v2

- Flow position: `review-1` in progress; phase tasks and AC1–AC3 are checked; full `harness checks` passed all eight sensors.
- Reviewer: Claude Opus pane `%3088`, ids `pij-characteristic-pelican` (legacy) / `pij-thirsty-blackbird` (rs), approved review plan running; no verdict yet.
- Resume: restart OMP with `omp -c`, run `pij inbox`, then continue adjudicating the reviewer record before post-flight/ship.
