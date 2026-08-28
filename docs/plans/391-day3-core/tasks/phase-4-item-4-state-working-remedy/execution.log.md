# Phase 4 item 4 execution log

**Run**: 2026-08-27T08-43-00Z-github.com-vaughankn
**Agent**: pij-jolly-moose
**Delegation**: dlg-0011

## T001, T002, T004b - RED

- Added a `report now --state working` parser test that preserves `E-ARG` and
  requires the mechanical/card/parked remedy.
- Added a PM fixture with `systemState:"working"`, fresh activity, and an old
  card; it must still produce `status-stale` with the same remedy.
- Added positive pointer-log assertions for the `ℹ️` glyph and the honest
  `after 3 Enter attempt(s)` count.
- RED produced two wording failures; the existing pointer behavior passed.

## T003 - GREEN

- Exported one `STATUS_WORKING_REMEDY` constant from `core/anomalies.ts`.
- Reused it verbatim in the `--state working` rejection and the status-stale
  detail.
- `working` remains rejected as a semantic state. The message identifies it as
  the mechanical, daemon-owned axis, teaches card refresh with
  `pij report now "<did>" "<next>"`, and names
  `waiting|hold|blocked|question` for parking.

## Detector mutation proof

- Inverted only the busy-now freshness predicate from `>` to `<=`.
- The mechanically-working PM fixture turned RED: expected
  `pij-mechanical-working`, received no status-stale row.
- Restored the original predicate. No status-stale condition changed in the
  final diff.

## T004 - Documentation

- Documented that `working` is mechanical/daemon-owned, card refresh uses
  `pij report now`, and indefinite waits use a parked semantic state.

## T005 - Gates

| Gate | Result |
|------|--------|
| Focused remedy tests | Passed: 3 tests; 583 unrelated tests skipped. |
| Complete touched test files | Passed: 586 tests. |
| Freshness mutation | Expected RED: mechanically-working PM anomaly disappeared. |
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the five touched TypeScript files | Passed. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,976 tests passed, 15 skipped. Log: `docs/plans/391-day3-core/kept-logs/vitest-phase4.log.txt`. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. The unchanged repository baseline remains red on unrelated Biome/Windows diagnostics and missing `pwsh` in `harness/scripts/release-age-policy.test.ts:196`. |

## Scope proof

- `core/types.ts`, `core/orchestration/role.ts`, status-stale predicates, and all
  rail/rendering files are untouched.
