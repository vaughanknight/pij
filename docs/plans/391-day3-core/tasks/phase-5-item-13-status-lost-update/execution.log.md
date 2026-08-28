# Phase 5 item 13 execution log

## 2026-08-28 — dlg-0013

### Pre-implementation check

- Verified branch `s391/item13-status-lost-update` at base `35272aed404f3c3a3ae264b94004d0d0eb115dcb`.
- Confirmed `FsRegistry.publish()` sampled `existing`, applied the ownership law, and called `writeAtomic()` without a lock or conditional replace.
- Kept `DESCRIPTOR_FIELD_OWNER` and `SessionDescriptor` unchanged. No spine-lock code was touched.

### T001 — reproduce both directions first

- Added a test-only `beforeWrite` seam after the adapter's sampled read and before durable publish.
- RED 1 at `fs-registry.test.ts:208`: a CLI card landed during a daemon publish, then the daemon replayed the old `statusPrev/statusNext/statusAt/statusSeq/statusWrittenBy`.
- RED 2 at `fs-registry.test.ts:252`: a daemon `systemState:"working"` landed during a CLI exact publish, then the CLI replayed `systemState:"idle"`.

### T002 — atomic publish

- Chose a per-descriptor advisory lock over an mtime/content compare-and-replace loop. The filesystem has no conditional atomic rename, so a compare followed by replacement leaves the same final race window; atomic no-replace lock publication closes it.
- The lock path is `<id>.json.lock`. Its PID/token body is fully written and fsynced in a sibling temp before an atomic hard-link claim, so a crash cannot expose a content-less lock. It covers the authoritative fresh read, merge, identity claim, and atomic descriptor replacement. Dead-PID locks are reclaimed, live holders retry within a bounded budget, and release removes only the holder's token.
- Normal writes reapply the unchanged ownership law to fresh disk.
- Exact writes use a three-way merge: fresh disk is the base; caller changes relative to a supplied caller baseline are replayed, including deletions; CLI-owned fields remain exact. Callers without a baseline fall back to the adapter's sampled record.
- The original two-direction reproduction is GREEN, and a dedicated assertion confirms the lock exists across fresh read and publish.

### T003 — write-law compatibility

- Existing registry/write-law tests remain green.
- Added a `persistDaemonWrite` assertion proving it returns registry truth after CLI-owned card fields are restored.

### T004 — carried pi/omp revive coverage

- The existing asynchronous-launch test already exercised the spawned-pane pi/omp requeue branch.
- Added pi and omp `--attach` integration cases covering the second `revivePendingAt`/requeue branch.
- Mutation proof: replacing the attach branch's requeue call with zero failed both new cases at `cli.integration.test.ts:1908`.
- Mutation proof: replacing the launch branch's requeue call with zero failed both existing cases at `cli.integration.test.ts:1841`.

### T005 — terminal registry port

- Added required `RegistryPort.listTerminal()` and implementations for `FsRegistry` and `FakeRegistry`.
- `FsRegistry.listTerminal()` returns terminal descriptors from both hot and archive tiers, deduping in favor of hot truth.
- `retireForClosedRecipients()` now consumes the port instead of scanning `PIJ_HOME` filenames.
- A fake-backed daemon test was RED at `daemon.delivery.test.ts:337` before the port integration; the archive-inclusive adapter test was RED at `fs-registry.test.ts:284`.

### T006 — gates and delivery

- Focused Phase 5 tests: 97 passed; 1 unrelated platform test skipped.
- Typecheck: `npx tsc --noEmit -p .` passed.
- Scoped Biome check for every changed TypeScript file passed.
- Authoritative extension suite: 171 files passed, 2 skipped; 4,015 tests passed, 15 skipped; 0 failed.
- Authoritative log: `docs/plans/391-day3-core/kept-logs/vitest-phase5.log.txt`.
- `just lint` remains red only in unrelated pre-existing files; no Phase 5 file is listed.
- `harness checks --quick` passes local paths, typecheck, package audit, and snapshots. It reproduces only the unrelated OSC lint baseline, missing `pwsh`, and the derived Windows compatibility failure; smoke is skipped in quick mode.
- Completion is reported `PARTIAL` with `gatesClean:false` solely for those repository-wide baseline failures.

## 2026-08-28 — dlg-0013 FX-01

- Reproduced F-1 without the interleaving seam: caller read `systemState:"idle"`, daemon wrote `"working"`, then the stale caller invoked `writeExact`; RED at `fs-registry.test.ts:285` showed disk return to `"idle"`.
- Extended `RegistryPort.writeExact` with optional `{ baseline }`. `FsRegistry` now compares the proposal to the caller baseline when supplied; the adapter sample remains the compatibility fallback.
- The report-card denorm path passes its `latest` read as the baseline. A dedicated core CLI test pins that argument.
- `FakeRegistry` mirrors caller-baseline three-way merging now that the fake can represent the stale-caller sequence.
- Made `lockBudgetMs` and `lockRetryMs` injectable. A 60 ms live-holder test pins bounded exhaustion and the manual-removal remedy; a child-process contention test proves a waiting writer succeeds after release.
- The retry budget is a one-directional brake: it only stops waiting. Descriptor-lock age/mtime is not a reclaim policy.
- Corrected public docs to state that only `write`/`writeExact` take the descriptor lock. With a caller baseline the exact path is race-free; without one protection is narrowed to adapter publish width.
- Scope note: `adapters/fakes.ts` is required by the port-member change and is explicitly authorized by this fix packet.
- Focused registry/CLI suites: 535 tests passed, 1 skipped.
- Typecheck and scoped Biome passed.
- Authoritative extension suite: 171 files passed, 2 skipped; 4,020 tests passed, 15 skipped; 0 failed.
- Authoritative log: `docs/plans/391-day3-core/kept-logs/vitest-phase5-fx01.log.txt`.
- `just lint` remains red only in unrelated pre-existing files; no FX-01 file is listed.
- `harness checks --quick` reproduces only the unrelated OSC lint baseline, missing `pwsh`, and derived Windows compatibility failure. FX-01 is reported `PARTIAL` with `gatesClean:false` solely for those repository-wide baselines.
