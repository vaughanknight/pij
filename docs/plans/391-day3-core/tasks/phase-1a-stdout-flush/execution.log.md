# Phase 1a stdout flush execution log

**Run**: 2026-08-27T08-43-00Z-github.com-vaughankn
**Agent**: pij-jolly-moose
**Delegation**: dlg-0004

## 1a.1 - RED

- Added one real-bin `spawnSync` regression using the SQLite queue with 812
  deterministic rows.
- The test asserts piped stdout exceeds 65,536 bytes and ends with row 812.
- Before the implementation, the test failed at exactly 65,536 bytes; the final
  row was absent.

## 1a.2 - GREEN

- Put the internal stdout and stderr handles into blocking mode at the first
  statement of `main()`, guarded for runtimes without `setBlocking`.
- Used a narrow structural type for Node's internal handle instead of `any`.
- Left every `process.exit(` call site untouched: 137 before and 137 after.
- The focused regression passed, and the complete CLI integration file passed
  97 tests with one existing skip.

## 1a.3 - Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on `cli.ts` and `cli.integration.test.ts` | Passed. |
| `npx vitest run .pi/extensions/pij/cli.integration.test.ts` | Passed: 97 tests passed, 1 skipped. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,935 tests passed, 15 skipped. Log: `docs/plans/391-day3-core/logs/vitest-phase1a.log`. |
| `just lint` | Repository baseline remains red on unrelated files outside this dispatch; both touched TypeScript files are clean. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. Lint and Windows compatibility remain red on unrelated baseline diagnostics; the broad test remains red because `pwsh` is unavailable for `harness/scripts/release-age-policy.test.ts:196`. |

## Decision

- This is a one-directional safety interlock, not output policy: removing the
  blocking-handle setup can only allow more truncation; it cannot change which
  bytes a verb intends to emit.
