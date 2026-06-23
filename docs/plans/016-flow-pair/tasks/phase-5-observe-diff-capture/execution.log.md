# Phase 5 Execution Log

## dlg-0020 — Phase 5 FIX

**Date**: 2026-06-23
**Outcome**: ✅ COMPLETE

### Findings Fixed

| # | Severity | Fix |
|---|----------|-----|
| HIGH-1 | AC-13 bypass via quoted porcelain paths | Switched to `--porcelain=v1 -z` + `parsePorcelainZ` (NUL-delimited, no quoting) |
| MED-2 | Untracked file content missing from .patch | Synthetic patches via `git diff --no-index -- /dev/null <file>` (exit 1 = success) |
| LOW-3 | fs writes could throw, breaking P4 contract | Artifact writes wrapped in try/catch; P9 event preserved as recovery marker |

### Gate Results

- `just flow-pair-test`: 12 files, **108 passed (108)** ✓
- `just typecheck`: exit 0 ✓
- `just lint`: 0 errors (1 pre-existing warning) ✓

### Mutation Checks (4 total)

| Guard | Sed expr | Tests RED | Flipped assertion |
|-------|----------|-----------|------------------|
| G1 AC-13 | `s/if \(forbidden\)/if (false)/` | 5 failed | `expect(result.ok).toBe(false)` + `expect(tracking.appendWasCalled).toBe(false)` (T002 all 5 cases) |
| G2 P9 | `s/if \(!ev\.ok\)/if (false)/` | 1 failed | `expect(failDeps.writeWasCalled).toBe(false)` (T003 FailDeps test) |
| HIGH-1 non-vacuous | `s/"--porcelain=v1", "-z"/"--porcelain"/` | 7 failed | Includes space-dir test `expect(result.ok).toBe(false)` |


**Date**: 2026-06-23
**Outcome**: ✅ COMPLETE

### Tasks Completed

| Task | Outcome |
|------|---------|
| T001 | 6 RED tests → GREEN: basic diff artifacts (real git fixture, porcelain untracked test) |
| T002 | 4 RED tests → GREEN: AC-13 guard (nested HIGH-A + untracked HIGH-B) |
| T003 | 4 RED tests → GREEN: P9 ordering (TrackingDeps + FailDeps) |
| T004 | Stub `lib/observe.ts` + `files.changed` union in `lib/ledger.ts` + `schemas/event.schema.json` |
| T005 | Full implementation — all 14 tests GREEN |
| T006 | CLI `observe` subcommand + `test/cli-observe.test.ts` (3 subprocess tests) |
| T007 | Mutation checks G1+G2 RED→GREEN; `just flow-pair-test` 105/105; gates clean |

### Gate Results

- `just flow-pair-test`: 12 files, **105 passed (105)** ✓
- `just typecheck`: clean ✓
- `just lint`: 0 errors (2 pre-existing warnings) ✓

### Mutation Checks

| Guard | Sed expression | Tests RED | Flipped assertion |
|-------|---------------|-----------|------------------|
| G1 AC-13 flow-state | `s/if \(forbidden\)/if (false)/` | 4 failed → 101 passed | `expect(result.ok).toBe(false)` + `expect(tracking.appendWasCalled).toBe(false)` (T002) |
| G2 P9 event-append | `s/if \(!ev\.ok\)/if (false)/` | 1 failed → 104 passed | `expect(failDeps.writeWasCalled).toBe(false)` (T003 FailDeps test) |

### Files Created/Modified

- `skills/flow-pair/lib/observe.ts` — NEW (full implementation)
- `skills/flow-pair/test/observe.test.ts` — NEW (14 tests: T001×6 + T002×4 + T003×4)
- `skills/flow-pair/test/cli-observe.test.ts` — NEW (3 CLI subprocess tests)
- `skills/flow-pair/lib/ledger.ts` — additive: `files.changed` union branch
- `skills/flow-pair/schemas/event.schema.json` — additive: `files.changed` schema branch
- `skills/flow-pair/lib/cli.ts` — observe subcommand wired
