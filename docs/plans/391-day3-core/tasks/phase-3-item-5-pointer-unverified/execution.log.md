# Phase 3 item 5 execution log

**Run**: 2026-08-27T08-43-00Z-github.com-vaughankn
**Agent**: pij-jolly-moose
**Delegation**: dlg-0009

## T001-T004 - RED

- Added an exhausted-Enter adapter case that keeps outcome `unverified` but
  requires pointer-safe informational wording; the unchanged body case pins the
  prior warning byte-for-byte.
- Extended the pure loop fake to record the fifth argument: pointer delivery
  requires `{kind:"pointer"}`, while raw `/compact` body delivery requires no
  metadata.
- Added a real-`Daemon` composition test proving the wrapper forwards pointer
  metadata to the raw port and that the pointer path emits no receipt.
- Added a dual-backend delivery test proving pointer text, injected lease state,
  retained fs mail, stale-lease recovery, and one re-announcement.
- RED produced four intended failures; the typed-body control passed and 192
  unrelated tests were skipped.

## T005-T007 - GREEN

- Added optional `SendTextOptions` without changing `SendOutcome`.
- Tagged only the pointer call in `drainTmuxInbox`; typed bodies and commands
  continue to omit the option.
- Forwarded the fifth argument through the production `Daemon` wrapper.
- Added pointer-aware `DaemonTmux` wording: informational, body safe in queue,
  injected for a 90-second lease, re-announced on expiry. The body warning
  remains unchanged.
- Moved the shared pointer lease constant to the pure loop contract so the log
  and settlement use one value.
- Replaced the drain's `instanceof SqliteQueue` gate with `sqliteOf`, giving the
  dual backend the same pointer and stale-claim behavior as SQLite.
- Focused GREEN passed five tests with 192 unrelated tests skipped.
- Complete touched test files passed 195 tests with two existing skips.

## T008 - Documentation

- Updated the routing table to state that both SQLite and dual use pointer
  delivery.
- Documented the difference between an unconfirmed body warning and an
  unconfirmed pointer info line, while preserving the shared `unverified`
  outcome and no-receipt rule.

## T009 - Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the seven touched TypeScript files | Passed. |
| Complete touched test files | Passed: 195 tests, 2 skipped. |
| `npx vitest run .pi/extensions/pij/` | Baseline-red only: 169 files passed, 2 failed, 2 skipped; 3,945 tests passed, 2 failed, 15 skipped. Log: `docs/plans/391-day3-core/kept-logs/vitest-phase3.log.txt`. |
| Declared baseline reproduction | Both pre-existing skill-text failures reproduced independently: `cli.integration.test.ts` “top-level help and skill guidance distinguish pull from push delivery” and `acceptance-sweep.test.ts` “plan 074 P9”. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. The test sensor includes the two declared skill-text failures plus the existing missing-`pwsh` release-policy failure; lint and Windows compatibility remain red on unrelated baseline diagnostics. |

## Decisions

- The outcome vocabulary is unchanged: unconfirmed pointer and body submissions
  both return `unverified`.
- The pointer path still emits no receipt. Its durable row stays `injected`
  under the existing lease and is re-announced after recovery.
- The optional metadata exists only to make diagnostics caller-aware; it does
  not alter routing, consumption, lease, or retry policy.
