# Phase 6 item 15 execution log

## 2026-08-28 — dlg-0019

### Base move

- Started from `origin/main@3adf051`, then checkpointed in-progress work as `50cd2f1`.
- Rebased cleanly onto `origin/main@e46eec8a`, which contains item 13's descriptor lock and caller-baseline exact writes. The rebased WIP commit is `b9a9e43`.
- Continued against the real descriptor lock; no cherry-pick was used.

### T001 — dual-lock reclaim, RED first

- `write.lock` dead-PID and PID-reuse cases were RED at `platform-write-lock.test.ts:64` and `:88`.
- `events.lock` dead-PID appendOnce replay and PID-reuse cases were RED through `spine-store.test.ts:116` before implementation.
- Live original PIDs remain refused after the configured budget. A corrected aged-live fixture supplies process-start evidence predating the lock, proving age alone never steals.
- All tests use temporary homes; this machine's `~/.pij/spine` was never read or written.

### T002 — daemon shutdown release, RED first

- Added an injectable SIGINT/SIGTERM registration seam.
- RED at `daemon.test.ts:2061`: shutdown called stop and exit but omitted held-lock release.
- The final handler calls `releaseHeldLocks()` before exit; token checks prevent deleting a successor's replacement lock.

### T003 — one shared reclaim law

- Added `adapters/lock-reclaim.ts`, used by `FsPlatformWriteLock`, `FsSpineLog`, and the item 13 descriptor lock.
- The decision parses both legacy `<pid>:<token>` and descriptor JSON lock bodies.
- Reclaim occurs only for a dead PID or a live PID whose absolute process start is newer than the lock mtime, proving PID reuse. Missing evidence preserves the lock.
- Platform reclaims emit a receipt/log callback naming layer and PID. `events.lock` reclaims append a durable spine note before the requested append/appendOnce.
- All acquired lock tokens are tracked process-wide and released on graceful daemon signal shutdown.

### T004 — dispatch transition notes and count wording

- Operator `dispatch-retire` uses the existing journal-first coupled write for `dispatch-retired` events.
- Journal recovery now adjudicates `dispatch-retired` and `dispatch-requeued` using the dispatch record, like the existing `dispatch` kind.
- Daemon close sweep appends `dispatch-retired`; revive appends `dispatch-requeued`.
- Existing spine fields encode the required note without a schema change: `kind`, actor, peer, `dispatch/reason/prior-state` refs, and canonical dispatch JSON in `prev/next`.
- RED before implementation: daemon sweep note at `daemon.delivery.test.ts:642`, revive note at `cli.integration.test.ts:1132`, and operator note/count at `cli.integration.test.ts:3755`.
- Repeating an already-retired selector now reports `0 open (N already retired)` and JSON includes `alreadyRetired`.

### T004b/T004c — carried Phase 5 fixes

- Hoisted descriptor-lock contention elapsed measurement immediately after `write()` returns. A steal-any-live-lock mutation returned in 2 ms and failed at `fs-registry.test.ts:386`.
- Both pi/omp revive marker writes now pass `{ baseline: current }`.
- Removing both baselines failed the dedicated source pin at `cli.integration.test.ts:1948`.
- `core/session.ts` remains unchanged: boot deliberately replaces the prior incarnation.

### T005 — gates and delivery

- Focused Phase 6 tests passed, including all lock adapters, journal recovery, daemon dispatch sweep, shutdown release, revive requeue, and operator dispatch-retire flows.
- Typecheck and scoped Biome passed.
- The first full-suite wrapper incorrectly returned success because a trailing `tail` masked Vitest's exit. The log exposed two `liveness-cost.test.ts` failures caused by a new per-PID `ps` probe.
- Replaced that probe with the existing `NodeProcessSnapshot` whole-table reader and a five-second shared cache. Both liveness-cost invariants are green.
- Final authoritative extension suite: 172 files passed, 2 skipped; 4,047 tests passed, 15 skipped; 0 failed.
- Authoritative log: `docs/plans/391-day3-core/kept-logs/vitest-phase6.log.txt`; the final wrapper preserves Vitest's exit status.
- `just lint` remains red only in unrelated pre-existing files; no Phase 6 file is listed.
- `harness checks --quick` passes local paths, typecheck, package audit, and snapshots. It reproduces only the unrelated OSC lint baseline, missing `pwsh`, and derived Windows compatibility failure; smoke is skipped in quick mode.
- Completion is reported `PARTIAL` with `gatesClean:false` solely for those repository-wide baseline failures.

## 2026-08-28 — dlg-0019 FX-01

- Replaced the T004c source-count pin with behavioural pi/omp revive tests. A caller-level test seam writes `systemState:"working"` after the revive read and before `writeExact`; removing the real attach baseline lost it and failed at `cli.integration.test.ts:1969`.
- Added a real child-process daemon test in a temporary `PIJ_HOME`. It waits until the run-if-main path holds both spine locks, sends SIGTERM, and asserts clean exit plus removal of `write.lock` and `events.lock`. Reverting the real main block failed at `daemon.test.ts:2129`.
- Added an uninjected PID-reuse test using the real cached `NodeProcessSnapshot`. Disabling the production start-time source failed at `lock-reclaim.test.ts:73`.
- Centralized all CLI-bin `FsRegistry` construction in one warning factory and all daemon-owned registry construction in one logging factory. Descriptor-lock reclaims are now observable on both production seams.
- Hoisted the daemon sweep's `FsSpineLog` to one injected instance. Sweep note failures log and continue retiring later records; revive note failures warn and keep the restored dispatch. The operator verb remains journal-coupled, while sweep/revive notes are deliberately best-effort.
- Removed the unreachable `dispatch-requeued` journal-recovery arm. `prior-state:` means transition source for retire notes and saved restoration destination for requeue notes.
- Added deadline checks on the successful-reclaim branch in all three acquirers. Before the fix, zero-budget reclaims bypassed exhaustion at `platform-write-lock.test.ts:104`, `spine-store.test.ts:202`, and `fs-registry.test.ts:422`.
- The five-second whole-table snapshot cache can delay recognition of a newly reused PID by at most five seconds. The delay preserves the lock and self-heals after cache expiry.
- Focused FX-01 suites passed: 235 adapter/daemon tests with 3 skipped, plus 7 behavioural CLI flows.
- Typecheck and scoped Biome passed.
- The first full run exposed 19 `daemon-push.test.ts` failures because the injected sweep spine logger was eagerly constructed for fake, intentionally unwritable homes. The logger is now lazy once per actual closed-recipient sweep, still never per dispatch; the failing file passes 19 tests with 2 skipped.
- Final authoritative extension suite: 172 files passed, 2 skipped; 4,053 tests passed, 15 skipped; 0 failed.
- Authoritative log: `docs/plans/391-day3-core/kept-logs/vitest-phase6-fx01.log.txt`.
- `just lint` remains red only in unrelated pre-existing files; no FX-01 file is listed.
- `harness checks --quick` passes local paths, typecheck, package audit, and snapshots. It reproduces only the unrelated OSC lint baseline, missing `pwsh`, and derived Windows compatibility failure; smoke is skipped in quick mode.
- Completion is reported `PARTIAL` with `gatesClean:false` solely for those repository-wide baseline failures.
