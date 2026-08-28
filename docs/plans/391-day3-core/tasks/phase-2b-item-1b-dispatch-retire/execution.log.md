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
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,970 tests passed, 15 skipped. Log: `docs/plans/391-day3-core/kept-logs/vitest-phase2b.log.txt`. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. The repository baseline remains red on unrelated Biome/Windows diagnostics and missing `pwsh` in `harness/scripts/release-age-policy.test.ts:196`. |

## Decisions

- Retirement is additive: legacy dispatch records remain valid with no migration
  write, and the new canonical field is optional and last.
- Dispatch retirement is terminal operator policy; the complete-close predicate
  retains its one-directional safety interlocks.
- Live anomaly-board acceptance is intentionally deferred to the o-prime after
  merge, when the five named machine records can be retired safely.

## FX-01 - Cold-review fixes

### RED

- The shared open-state predicate import was absent, a canary-bearing
  delivered-unacked record failed validation, the idle daemon tick called
  `FsDispatchStore.list()` once, and both real revive JSON results omitted
  `requeuedDispatches`.
- Initial focused RED: five failures, one parser-guard control passed, and 589
  unrelated tests were skipped.

### Major-finding proof

- **F-1 / AC-14**: mutated `isOpenDispatch` to also admit `retired`; the stale
  anomaly test turned RED with two findings instead of one. Restored the
  predicate to `undelivered | delivered-unacked`.
- **F-2 / idle scan**: before implementation, a daemon tick with no complete
  closed recipient called `FsDispatchStore.list()` once. The final test asserts
  zero calls.

### GREEN

- Added one exported `isOpenDispatch` predicate and reused it in the anomaly
  detector, dispatch-retire recipient selection, and daemon sweep.
- The detector now admits only open records through that predicate, then skips
  `undelivered`; admitting `retired` under mutation therefore makes AC-14 fail.
- The daemon derives complete closed recipients from hot registry descriptors
  first and returns before opening/listing the dispatch store when none exist.
- Retirement metadata now preserves optional canary evidence; un-retire restores
  it, retaining the existing canary conflict guard.
- Core parser tests pin neither/both target rejection, required reason, and the
  `--to` happy path.
- Revive JSON includes `requeuedDispatches`; human output reports dispatch
  records separately from mail. Spawn, attach, and human integration paths are
  covered.
- Documentation now includes terminal `retired`, describes the detector
  honestly through the shared predicate, and names base `9912bf8`.
- `core/cli.ts` inclusion was explicitly approved after the fix table omitted
  it while requiring the verb to reuse the predicate.

### Gates

| Gate | Result |
|------|--------|
| Focused FX-01 tests | Passed: 8 tests; 670 unrelated tests skipped. |
| Complete dispatch/platform/CLI/daemon files | Passed: 571 tests. |
| AC-14 mutation | Expected RED: stale anomaly findings increased from 1 to 2. |
| Idle dispatch-store test | Passed: zero `list()` calls without a complete closed recipient. |
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the ten touched TypeScript files | Passed. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,975 tests passed, 15 skipped. Log: `docs/plans/391-day3-core/kept-logs/vitest-phase2b-fx01.log.txt`. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. The unchanged repository baseline remains red on unrelated Biome/Windows diagnostics and missing `pwsh` in `harness/scripts/release-age-policy.test.ts:196`. |

## FX-02 - Re-review G-1 precise revert

- Re-review proved the original canary-loss finding unreachable: the sole
  canary writer requires `state === "acked"`, while `retireDispatch` returns an
  acknowledged record unchanged.
- Reverted only FX-01.4: removed canary from retirement metadata, restored the
  original `isDispatch` rejection of canary-bearing delivered-unacked records,
  removed carry/restore logic and its synthetic test, and removed the
  unreachable documentation promise.
- Kept every other FX-01 fix, including the shared open-state predicate, lazy
  dispatch-store scan, parser guards, surfaced revive counts, and docs/base
  corrections.
- Validator proof: `git diff ad265b1..HEAD -- .pi/extensions/pij/core/platform/types.ts`
  is empty after the FX-02 commit, so the original tripwire is restored exactly.
- Re-review findings G-2, G-3, G-4, and G-5 are carried to Phase 5 item 13, which
  owns the same revive seam.

### FX-02 gates

| Gate | Result |
|------|--------|
| Dispatch + platform type tests | Passed: 159 tests before the full gate. |
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the three touched TypeScript files | Passed. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,974 tests passed, 15 skipped. Log: `docs/plans/391-day3-core/kept-logs/vitest-phase2b-fx02.log.txt`. |
| `harness checks --quick` | The unchanged repository baseline remains red on unrelated Biome/Windows diagnostics and missing `pwsh` in `harness/scripts/release-age-policy.test.ts:196`. |
