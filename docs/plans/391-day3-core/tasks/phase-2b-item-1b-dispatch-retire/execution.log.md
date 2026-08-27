# Phase 2b dispatch retirement execution log

**Run**: 2026-08-27T08-43-00Z-github.com-vaughankn
**Agent**: pij-jolly-moose
**Delegation**: dlg-0010

## T001-T004 - RED

- Added pure dispatch retirement/un-retirement, terminal acknowledgement,
  canonical field-order, and legacy-record compatibility contracts.
- Added a retired dispatch to the stale-anomaly fixture while retaining the
  existing live stale control. The detector was already behaviorally safe
  because it only accepted `delivered-unacked`; implementation adds the explicit
  retired skip for discoverability.
- Added PA refusal and real-bin `dispatch-retire` coverage for id, recipient,
  required reason, JSON, and dry-run.
- Added complete-close dispatch sweep, reason-filtered revive restoration,
  operator-retired preservation, and four negative recipient-lifecycle shapes.
- Initial RED produced eight intended failures; the anomaly structural control
  and pre-existing `--all`/tail conflict behavior remained green.

## T005-T008 - GREEN

- Extended `DISPATCH_STATES` additively with `retired` and added optional
  retirement metadata carrying reason, actor, timestamp, and prior open state.
- Added pure idempotent transitions. Acknowledged/retired records do not retire
  again; only `recipient-closed` records un-retire; retired records refuse brief
  acknowledgement.
- Appended retirement to canonical JSON field order. Legacy records without the
  field still validate and round-trip byte-identically.
- Added `pij dispatch-retire <id>` and `--to <seat>` handling, dry-run/JSON
  output, top-level help, and ruled PA refusal.
- Extended the daemon's complete-close sweep to enumerate open dispatch records
  independently of SQLite queue recipients.
- Added dispatch restoration beside delivery restoration on real attach,
  spawned, pi, and omp revive paths. Real-bin attach/spawn tests pin the hook.
- Retired records are explicitly excluded from `delivered-unacked-stale`.

## T011-T013 - Carried review items

- Added the live `closeIntent + terminal.requested` fixture and hoisted the
  null guard so lifecycle, revive-pending, intent, and terminal checks are
  independently mutable.
- Lifecycle mutation proof: removing only
  `descriptor.lifecycle !== "dissolved"` made
  `pij-live-requested must remain open` fail with state `retired`; the guard was
  restored.
- `queue retire` now rejects selectors combined with `--all-recipients` using
  `choose a selector OR --all-recipients`.
- Selector confirmation and `--all`/`--tail|--last` conflict pins now live in
  dedicated, named test blocks; selector assertions inspect the E-ARG line
  rather than matching the usage line.

## T009 - Documentation

- Documented dispatch retirement grammar, terminal metadata, PA refusal,
  complete-close sweep, reason-filtered revive restoration, and anomaly-board
  behavior.

## T010 - Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the twelve touched TypeScript files | Passed. |
| Complete pure CLI/platform/anomaly/daemon test files | Passed: 757 tests. |
| Focused Phase 2b contracts | Passed: 10 tests; 238 unrelated tests skipped. |
| Lifecycle mutation | Expected RED: `pij-live-requested` became `retired`; restored afterward. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,970 tests passed, 15 skipped. Log: `.harness/temp/s391/vitest-phase2b.log`. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. The repository baseline remains red on unrelated Biome/Windows diagnostics and missing `pwsh` in `harness/scripts/release-age-policy.test.ts:196`. |

## Decisions

- Retirement is additive: legacy dispatch records remain valid with no migration
  write, and the new canonical field is optional and last.
- Dispatch retirement is terminal operator policy; the complete-close predicate
  retains its one-directional safety interlocks.
- Live anomaly-board acceptance is intentionally deferred to the o-prime after
  merge, when the five named machine records can be retired safely.
