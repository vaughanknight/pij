# Phase 1 — Execution Log

**Run**: 2026-07-20T10-37-07Z-github.com-AI-Substr  
**Agent**: pij-shy-justine  
**Delegation**: dlg-0001

---

## T001 — Allocation/Fence record and store tests

**Status**: ✅ complete  
**Started**: 2026-07-20

- Loaded the ratified workshop schemas and existing project/store canonicalization patterns.
- Added 15 red-first/green tests for record guards, canonical field order, immutable `steps[]`
  append, fs round-trip/update, subdirectory law, and the phantom-peer regression.
- Pre-flight `harness boot`: typecheck passed; full tests hit the known intermittent T15
  `daemon-activity` / `channel.test.ts` timeout class. Orchestrator confirmed this is tracked
  outside the allowlist; targeted TDD continues and the full suite will be retried once.

---

## T002 — Allocation/Fence records and stores

**Status**: ✅ complete

- Added `Allocation`, `AllocationStep`, `AllocationState`, `Fence`, and `FenceClass` contracts
  plus total `isAllocation` / `isFence` guards.
- Added canonicalizers preserving contract field order and additive own fields.
- Added `AllocationStorePort` / `FenceStorePort` and fs adapters under dedicated subdirectories.
- Targeted result: 15 passed; `just typecheck` green.

---

## T003 — Project.autonomy lockstep

**Status**: ✅ complete

- Added optional `ProjectAutonomy` closed vocabulary plus interface, guard, and canonical
  field-order changes in lockstep.
- Project/record targeted result: 58 passed; `just typecheck` green.

---

## T004 — Worktree refusal-matrix tests

**Status**: ✅ complete

- Added real-temp-git tests for create/verify/safe-remove, existing destination, dirty
  source checkout, bad base ref, non-repo cwd, branch/SHA mismatch, and WIP-preserving removal.

---

## T005 — Worktree mechanics

**Status**: ✅ complete

- Added argv-only `WorktreeManager` with injected runner, create-time SHA resolution,
  branch/SHA/cwd/common-dir verification, dirty-source refusal, and WIP-safe removal.
- Targeted result: 7 passed; `just typecheck` green.

---

## T006 — Stream create/close transaction

**Status**: ✅ complete

- Red tests added for ordinal reservation, persist-before-mutate ordering, resume verification,
  tombstone-aware allocation, failure journaling, WIP preservation, and close commit ordering.
- Added resumable create/close orchestration with plain intermediate record updates and a
  final injected coupled-commit port; git/WIP steps never run through that port.
- Targeted phase result: 71 passed; `just typecheck` green.

---

## T007 / T008 — Coupled-write recovery and wiring

**Status**: ✅ complete

- Scope conflict discovered: `recoverPendingOps` is called from
  `.pi/extensions/pij/core/daemon/runtime-axis.ts:126`, but that file is outside this
  delegation's allowlist. Allocation/fence recovery cannot satisfy "next platform write heals"
  for daemon writes unless that call site receives the new stores, or the orchestrator approves
  a different backwards-compatible recovery seam.
- Question sent to `pij-ancient-rhinoceros`; continuing journal tests and allowed CLI wiring
  while the ruling is pending.
- Addendum 1 granted mechanical runtime-axis/daemon threading and rejected an optional-store
  seam; recovery now requires all six stores at every production caller.
- Allocation/fence intents adjudicate persisted canonical prev/next; committed markers require
  next-state corroboration; crash-after-record-before-append heals exactly once.
- Stream tests prove the machine lock wraps only the final spine-emitting commit, never git or
  intermediate `steps[]` appends.

---

## T009 — CLI registration and bin wiring

**Status**: ✅ complete

- Registered `stream create/close` and `fence set/show` in all three strict parser tables.
- Added attributed allocation/fence events, evidence-line human output, JSON records, generic
  family help, picomatch-backed `fence show --path`, and overlap reporting.
- Wired fs allocation/fence stores and `WorktreeManager` through both CLI and daemon composition
  roots; subprocess test drives create → fence show → close in a real temp git repository.

---

## T010 — Fail-loud wrong-argument suite

**Status**: ✅ complete

- Added missing-required, unknown-flag, extra-positional, bare-valued-flag, and bad-combination
  cases for all four verbs. Every refusal is `E-ARG`/64 and leaves allocation/fence/spine stores
  untouched.
- Phase-targeted result: 466 passed across 11 files; touched-file Biome clean; typecheck green.

---

## Gates

| Gate | Result |
|------|--------|
| Pre-flight `just typecheck` | ✅ green |
| Pre-flight `just test` | ⚠️ known T15 intermittent failures (`daemon-activity`, `channel.test.ts`) |
| Phase-targeted tests | ✅ 466 passed |
| Touched-file Biome | ✅ 25 files clean |
| Post-implementation `just typecheck` | ✅ green |
| Required full `just test` attempt 1 | ❌ 12 failed: 9 acceptance-sweep fixture failures from missing newly-required allocation/fence stores; timing/process failures in `cli.integration`, `channel`, and `daemon-push` test `pushes a stalled notice to the creator when a bound session is working+stale`; all three files later passed isolated |
| Acceptance sweep after addendum 2 | ✅ 13 passed; fixture threading only, no assertion edits |
| Isolated attempt-1 failures | ✅ `cli.integration` 51/51, `daemon-push` 21/21, `channel` 14/14 |
| Required full `just test` attempt 2 | ⚠️ 3156 passed, 11 skipped; only two `daemon-push.test.ts` 5s timeouts under full-suite load: `pushes a stalled notice to the creator when a bound session is working+stale` and `pushes only ONCE per stalled transition (latch)`; same file passed 21/21 in isolation |
| Orchestrator gate ruling | ✅ acceptable tracked T15 signature: full-suite contention timeout, isolated green; do not touch/deflake |
| Full `harness checks` attempt | ⚠️ typecheck/lint/local-path/pkg/snapshots green; repeated T15 timeouts, external smoke idle-timeout, and the new bin test exceeded the default 5s under aggregate load |
| New bin-test timeout hardening | ✅ explicit 15s budget; `core/cli.test.ts` 242/242 green afterward |

**Reviewer attention**: the two accepted T15 timeouts drive the daemon tick that now constructs
the threaded allocation/fence stores and `RuntimeAxisTracker`, but they do not seed or assert an
allocation/fence recovery intent; their stalled-notice assertions passed 21/21 in isolation.

## Gate discovery — acceptance fixture scope

- The required-store signature correctly makes legacy `CliDeps` fixtures fail closed.
  `.pi/extensions/pij/acceptance-sweep.test.ts` contains plan-054 platform/runtime fixtures that
  must receive the two new empty stores, but it is outside dlg-0001 + addendum-1 allowlists.
- A narrow fixture-only permission request was sent to the orchestrator before touching it.
- Addendum 2 granted that fixture-only change; all acceptance assertions passed unchanged.
