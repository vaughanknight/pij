# Execution Log — Plan 004 Agent Pilot Harness

**Started**: 2026-05-11
**Mode**: Simple (single-phase, inline 7-column tasks)
**Skill**: `/plan-6-v2-implement-phase-companion`
**Companion**: `code-review-companion` run `2026-05-11T17-06-21-874Z-d1a5`

---

## T0 — wall-clock for AC-11

- T0 timestamp: spec accepted 2026-05-10 (per spec header)
- T1 will be: time of first green `extension-validator` pilot (T012 user gate)

---

## Pre-phase validation (2026-05-11)

| Step | Status | Note |
|------|--------|------|
| `npm run typecheck` | ✅ clean | baseline |
| `npm run lint` | ✅ clean (1 info, biome migrate suggestion ignored) | baseline |
| `npm run test` | ✅ 21/21 scratch store tests | baseline |
| companion boot | ✅ verdict=active | run `2026-05-11T17-06-21-874Z-d1a5` |
| companion briefing | ✅ sent | message `01KRAXR9TGB3F1HJ4QXMSECY8H` |

---

## Companion findings reconciliation

| Finding ID | ackOf | Severity | Task | Disposition | Notes |
|-----------|-------|----------|------|-------------|-------|
| _(none yet)_ | | | | | |

---

## Per-task entries

<!-- appended below as tasks complete -->

### T011 → T002..T011 batch summary (2026-05-11)

11 of 11 mandatory pre-pilot tasks complete. Single-day push; one fix
commit landed between T007 and T008 to update `DEFAULT_PROMPT_RE` for
pi v0.74 TUI footer. Test suite 45/47 (2 IT skipped without env), one
real end-to-end CLI invocation confirmed `harness/driver/run.ts`
produces valid JSON RunReport with correct exit codes.

Commits in order:
- 47b4fa3 T001: tmux primitives + 10 tests (+ minimal errors.ts)
- 7e360b7 T002: error hierarchy (full) + session.ts Step seed
- 7e239c8 T003: Session class + 7 tests
- 826b10d T004: index.ts orchestrator + 6 tests
- f4a1191 T005: run.ts CLI
- 00cc51c T006: live-tmux IT tests (env-gated)
- 5ac2b95 T007: smoke.ts adapter rewrite
- 71a5755 fix: DEFAULT_PROMPT_RE for pi v0.74 (discovery from T005)
- 406ea25 T008: scratch smoke.ts rewrite
- 009e4e7 T009: D-006 fix in scratch (setStatus undefined)
- 9b8c5e9 T010: extension-validator agent pack (5 files)
- 748e217 T011: docs/how/agent-feedback.md (145 lines)

**Discoveries worth promoting in T013 ledger sweep**:
1. **D-020 candidate** (already encoded in code): pi v0.74's TUI no
   longer renders `> ` prompt; status footer ends with `model • tier`
   bullet pattern. DEFAULT_PROMPT_RE updated from `/^>\s/m` to
   `/^>\s|\s•\s\w/`. PR-01 in research dossier was based on legacy pi.
2. **MH-NNN candidate**: vitest 2.x `vi.mock` factories CANNOT
   reference outer-scope vars at module load — must use `vi.hoisted()`.
   Workshop 001's test sketch (lines 949-1001) had this bug; corrected
   in `harness/driver.test.ts`. Worth recording in difficulties for
   future test authors.
3. **MH-NNN candidate**: minih agent frontmatter `coordination:` only
   accepts `enabled` or `disabled` (no `optional`). Plan T010 text
   used `optional`; reset to `disabled`. Worth a one-line note in the
   plan/workshop or in difficulties for future pack authors.
4. **Observation, not a difficulty**: scratch's `/scratch clear`
   handler opens `ctx.ui.confirm` — interactive Y/N modal that's
   fragile to automate in scenarios. D-006 verification was moved to
   the fresh-boot count=0 capture instead. Could become a workshop
   topic if extension #3+ needs to automate confirms.

---

### Pilot gate (T012) — pre-handoff state

- Driver SDK shipped: 5 modules under `harness/driver/` (~480 LOC),
  44 unit tests (driver), 2 IT tests against bash (env-gated)
- Smoke adapter shipped: 57 LOC under `harness/scripts/smoke.ts`
- Scratch smoke.ts rewritten to new Scenario/Step shape
- Scratch index.ts D-006 fix landed (setStatus undefined)
- extension-validator agent pack installed locally (count=2 in
  `minih list`)
- docs/how/agent-feedback.md authored
- All 47 acceptance criteria (AC-01..AC-08, AC-13) addressable;
  AC-09..AC-12 require the pilot run to satisfy.

---

### T001 — Driver SDK tmux primitives + unit tests (2026-05-11)

- **Status**: ✅ completed
- **Commit**: `47b4fa3` — `T001 (plan-004): Driver SDK tmux primitives + unit tests`
- **Files**: `harness/driver/tmux.ts` (new, ~210 LOC), `harness/driver/errors.ts` (new, minimal — full hierarchy in T002), `harness/driver.test.ts` (new, 10 tests)
- **Evidence**: `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run test` → 31/31 (21 store + 10 driver)
- **Deviation**: T001 also shipped `errors.ts` (plan path list assigned this to T002). Reason: `tmux.ts` has a runtime import on `DriverBootError`/`DriverPaneDeadError`, so the file must exist for typecheck. T002 will expand `errors.ts` with the remaining classes once `session.ts` lands. Documented in T001 commit message and companion ping.
- **Companion ping**: `01KRAY01TB5QYBAKXH15N7WXNS` (review-request: T001 47b4fa3)
- **Discoveries**:
  - Workshop 001's unit test sketch (`const calls: string[][] = []` outside the `vi.mock` factory) does NOT work in vitest 2.x — outer-scope references in mock factories are not hoisted. Fixed pattern uses `vi.hoisted(() => ({ calls: [] }))`. **Worth a difficulty row in T013** (MH-NNN candidate: "vitest mock factories require vi.hoisted() for shared state").
  - `noUncheckedIndexedAccess` flagged `inspect()`'s destructuring of `out.split("\t")` — fixed with `?? ""` defaults rather than `as string` (P6 compliance).
  - `noImplicitOverride` required `public override readonly cause?: Error` on `DriverError.cause` since `Error` already declares `cause`.
