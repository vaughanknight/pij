# Phase 2 item 1 execution log

**Run**: 2026-08-27T08-43-00Z-github.com-vaughankn
**Agent**: pij-jolly-moose
**Delegation**: dlg-0006

## T001-T005 and T013 - RED

- Added queue terminality, reason-filtered un-retire, parked/state/age filter,
  stats, summary, and receipt contracts.
- Added scraped queue-subverb totality plus PA allow/refuse contracts.
- Added SQLite and dual deliberate-close sweeps, all three negative predicates,
  the recycled-pane incident replay, the independent dissolved-recipient drain
  guard, and close-retire-revive-deliver-once.
- Added retire CLI coverage for SQLite, dual fs markers, fs-only guidance,
  required reason, dry-run, JSON, age/state/from filters, and invalid input.
- Extended the existing non-vacuous 812-row pipe test with latest-200, `--all`,
  `--since`, `--tail`, footer, and JSON-envelope assertions.
- RED produced 16 intended failures; 156 unrelated tests were skipped.

## T006-T010 and T014 - GREEN

- Added terminal `retired`, a shared terminal guard, transactional
  `retire()`/`unretire()`, `openRecipients()`, and filtered `count()`.
- Preserved `parked` as open-but-stuck and made retired rows immune to ack,
  claim, settle, restart, and lease-recovery resurrection.
- Added `queue retire` parsing/routing, exhaustive state rendering, dual legacy
  read-marker mirroring, latest-200 listing, and `{rows,total,shown}` JSON.
- Added PA subverb classification: queue inspection/migration stays allowed;
  queue retirement is refused at both the pure and real-bin seams.
- Added the daemon tick sweep for complete deliberate closes and the independent
  current-descriptor drain guard that blocks stale-index delivery to recycled
  pane IDs.
- Added reason-filtered revive requeue after attached, spawned, and pi/omp
  self-adopting revival paths.
- Focused feature run passed 19 tests with 154 unrelated tests skipped.

## Logic review fixes

- Moved `--as` normalization ahead of the raw-argv PA gate so
  `pij queue --as X retire ...` is still classified and refused as
  `queue retire`; the real-bin test covers both token orders.
- Requeued `recipient-closed` mail for pi/omp self-adopting revivals and excluded
  `revivePendingAt` descriptors from the close sweep, preventing new mail from
  being re-retired during the boot window.
- Made dual delivery use `sqliteOf()` for the same claim/lease semantics as the
  SQLite backend.
- Reset delivery attempts on un-retire so previously parked mail receives a
  genuine new delivery window after revive.

## T011 - Documentation

- Documented queue listing, state meanings, retire grammar, close-sweep
  predicate, revive requeue, dual mirroring, and fs-only guidance.
- Added the SQLite queue source location and delivery-state concept to the
  messaging domain.

## T012 - Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the nine touched TypeScript files | Passed. |
| Complete queue, PA, and daemon delivery files | Passed: 70 tests. |
| Focused Phase 2 contracts | Passed: 19 tests; 154 skipped. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,952 tests passed, 15 skipped. Log: `.harness/temp/s391/vitest-phase2.log`. |
| `just lint` | Repository baseline remains red on unrelated files outside this dispatch; all touched files are clean. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. Lint and Windows compatibility remain red on unrelated baseline diagnostics; the broad test remains red because `pwsh` is unavailable for `harness/scripts/release-age-policy.test.ts:196`. |

## Decisions

- `claimUnread` treats retired like already-read because the existing tagged
  union has no retired arm; no message or ack receipt is emitted.
- Automatic revive only requeues rows whose latest retirement receipt reason is
  exactly `recipient-closed`; operator retirement remains terminal.
- This is not retention policy. Complete deliberate close decides automatic
  retirement; the `closeIntent` and requested-terminal checks are
  one-directional safety interlocks whose removal could only retire more,
  including mail that must remain revivable.

## FX-01 - Cold-review fixes

### RED

- Bare `queue retire --reason too-wide` returned exit 0 instead of the required
  selector/confirmation error.
- `pij queue --all --tail 3` and `--all --last 3` returned exit 0 instead of an
  `E-ARG` choose-one error.

### Sweep-brake mutation proof

- Removed only the `closeIntent` guard: RED with
  `pij-requested-no-intent must remain queued`, received `retired`.
- Restored `closeIntent`, then removed only the requested-terminal guard: RED
  with `pij-close-unrequested must remain queued`, received `retired`.
- Restored both guards; `git diff --exit-code -- .pi/extensions/pij/daemon.ts`
  passed, proving no production mutation remained.

### GREEN

- `queue retire` now requires at least one of `--to`, `--from`,
  `--older-than`, or `--state`, unless the operator explicitly passes
  `--all-recipients`.
- `--dry-run --all-recipients` reports matching counts per recipient and keeps
  the database unchanged.
- `pij queue --all` now rejects both `--tail` and its `--last` alias with an
  `E-ARG` choose-one message.
- The operator guide now names `revivePendingAt === undefined` as the fourth
  sweep guard and explains its persist-before-mutate pi/omp boot protection.

### Gates

| Gate | Result |
|------|--------|
| Focused FX-01 tests | Passed: 3 tests; 114 unrelated tests skipped. |
| Sweep mutation 1 | Expected RED: `pij-requested-no-intent` became `retired`. |
| Sweep mutation 2 | Expected RED: `pij-close-unrequested` became `retired`. |
| `npx tsc --noEmit -p .` | Passed. |
| Scoped Biome check on the three touched TypeScript files | Passed. |
| `npx vitest run .pi/extensions/pij/` | Passed: 171 files passed, 2 skipped; 3,952 tests passed, 15 skipped. Log: `.harness/temp/s391/vitest-phase2-fx01.log`. |
| `harness checks --quick` | The same repository baseline remains red outside this fix: unrelated Biome diagnostics, missing `pwsh` in `harness/scripts/release-age-policy.test.ts:196`, and the derived Windows-compat lint failure. |

### Follow-up

- An operator-facing un-retire CLI remains intentionally out of scope for
  FX-01 and should be considered separately before exposing broader undo.
