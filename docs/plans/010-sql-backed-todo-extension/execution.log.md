# Execution Log: SQL-backed Todo Extension

**Plan**: [`sql-backed-todo-extension-plan.md`](./sql-backed-todo-extension-plan.md)  
**Phase**: Simple implementation — Store, full UX, validation, docs, domains  
**Started**: 2026-05-15  
**Companion**: `code-review-companion` run `2026-05-15T16-51-44-687Z-9e83`

## Companion Protocol

Self-onboarding references for future readers:

- `minih agent-readme` / <https://github.com/AI-Substrate/minih/blob/main/AGENTS_README.md>
- Companion protocol: <https://github.com/AI-Substrate/minih/blob/main/docs/how/companion-mode.md>

Briefing sent at 2026-05-15T06:52:24Z with hazards: SQL source of truth, safe bind parameters before todo store, bounded overlay/status/shortcut scope, pi-free store, no `any`, `/todo` + `/sql` agreement.

## Pre-Phase Harness Validation

| Check | Command | Result | Evidence |
|-------|---------|--------|----------|
| Boot / Observe | `npm run self-check` | ✅ HEALTHY | typecheck, lint, tests, smoke, and package audit completed; known Biome schema info and Node SQLite experimental warning remained non-failing. |
| Interact | `npm run smoke -- session-sql` | ✅ HEALTHY | `smoke: session-sql ... ✓` |

## Task Entries

### T001 — Pre-flight harness check and scaffold `todo`

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - `npm run self-check` passed before implementation.
  - `npm run smoke -- session-sql` passed as the pre-phase interact check.
  - `npm run new -- todo` created `.pi/extensions/todo/{index,store,store.test,smoke}.ts`.
  - `npm test -- .pi/extensions/todo/store.test.ts` passed: 3 tests.
- **Commit**: `fdb930a` (`feat: scaffold sql-backed todo plan`)
- **Companion ping**: `review-request: T001 fdb930a` sent at 2026-05-15T06:55:00Z.

### T002 — Extend `SessionSqlStore` with safe bind parameters

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Added `SqlBindValue`, named/positional bind option types, and single-statement bind execution helpers to `SessionSqlStore`.
  - Bound multi-statement batches now return a tagged sqlite error instead of falling through to unbound `db.exec()`.
  - `npm test -- .pi/extensions/session-sql/store.test.ts` passed: 25 tests.
  - `npm run typecheck` passed.
- **Commit**: `42d86fd` (`feat: add session sql bind parameters`)
- **Companion ping**: `review-request: T002 42d86fd` sent at 2026-05-15T06:58:17Z.
- **Ping note**: an initial T002 ping accidentally referenced current `HEAD` (`5a22e02`) after unrelated concurrent work advanced the branch; a corrected ping for `42d86fd` was sent immediately.

### T003 — Implement `TodoSqlStore` and helpers

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Replaced generated event-log store with pi-free `TodoSqlStore` over `SessionSqlStore`.
  - Added todo status/view types, tagged-union results, command parser helpers, compact formatters, counts, clear, dependency, and next-ready semantics.
  - Added `DEFAULT_TODO_KEYBINDINGS` named constants for later overlay/key matching.
  - `ctx_grep` confirmed `.pi/extensions/todo/store.ts` imports no pi APIs.
  - `npm test -- .pi/extensions/todo/store.test.ts` passed: 4 tests.
  - `npm run typecheck` no longer reports todo store diagnostics, but remains blocked by non-todo harness/package errors in `harness/driver/index.ts` and `harness/scripts/packages.ts`; this is tracked for T011.
- **Commit**: `90c0e26` (`feat: implement sql-backed todo store`)
- **Companion ping**: `review-request: T003 90c0e26` sent at 2026-05-15T07:03:54Z.

### T004 — Add store tests for data contract and dependency semantics

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Expanded `.pi/extensions/todo/store.test.ts` to 14 tests covering SQL agreement both directions, empty SQL-created titles, all statuses, list filters, clear, dependency-ready behavior, in-progress/priority ordering, duplicate/self/missing dependencies, limit zero, persistence reopen, and parser errors.
  - `npm test -- .pi/extensions/todo/store.test.ts` passed: 14 tests.
  - `npm test -- .pi/extensions/session-sql/store.test.ts .pi/extensions/todo/store.test.ts` passed: 39 tests.
- **Commit**: `5c2b950` (`test: cover sql-backed todo store`)
- **Companion ping**: `review-request: T004 5c2b950` sent at 2026-05-15T07:06:04Z.

### T005 — Wire `/todo` command and `todo` model tool

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Replaced temporary `todo_ping` wiring with a single model-facing `todo` tool over add/list/done/status/block/next/dep/clear actions.
  - Wired `/todo` command parsing for list/add/done/status/block/dep/next/clear/help and a placeholder overlay branch for T006.
  - Added one `session_start` handler, session shutdown close, SQL-backed status refresh, and clear confirmation.
  - `npm test -- .pi/extensions/todo/store.test.ts` passed: 14 tests.
  - `npm run typecheck` passed.
- **Commit**: `441584b` (`feat: wire sql-backed todo command and tool`)
- **Companion ping**: `review-request: T005 441584b` sent at 2026-05-15T07:10:01Z.

### T006 — Implement overlay, status signal, and configurable key matching

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Added a minimal focusable `ctx.ui.custom(..., { overlay: true })` todo overlay with refresh, close, selection, and mark-done handling.
  - Footer status shows `todo: N open` and clears with `undefined` at zero open.
  - Overlay/global shortcut keys live in `DEFAULT_TODO_KEYBINDINGS`; grep confirms key literals are only in the constants block.
  - Avoided `ctrl+t` because core keybindings reserve it; default open overlay shortcut is `ctrl+shift+y`.
  - `npm test -- .pi/extensions/todo/store.test.ts` passed: 14 tests.
  - `npm run typecheck` is blocked by unrelated `.pi/extensions/ralph-loop/index.ts` diagnostics introduced outside this task; todo diagnostics are clear and this is tracked for T011.
- **Commit**: `c3a62cf` (`feat: add todo overlay and status`)
- **Companion ping**: `review-request: T006 c3a62cf` sent at 2026-05-15T07:13:36Z.

### T007 — Add deterministic smoke scenario

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Replaced scaffold smoke with a Driver SDK scenario covering start cleanup through `/sql`, `/todo` empty, add, list, `/sql` agreement, overlay anchor, close overlay, `/reload`, wait-idle, and post-reload list.
  - First smoke attempt failed because `/reload` matched before idle; added explicit `wait` after `/reload`.
  - `npm run smoke -- todo` passed.
- **Commit**: `c3d3f06` (`test: add todo smoke scenario`)
- **Companion ping**: `review-request: T007 c3d3f06` sent at 2026-05-15T07:16:59Z.
- **Staging note**: also staged session-sql wiring/smoke/AGENTS files because the todo smoke's `/sql` agreement path requires the `session-sql` extension to be present in a clean checkout.

### T008 — Add extension-local guidance and user docs

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Replaced generated `.pi/extensions/todo/AGENTS.md` with SQL-backed todo boundaries and validation guidance.
  - Added README quick-start for SQL-backed todos.
  - Added `docs/how/todo.md` covering commands, model tool actions, statuses, dependencies, overlay keys, SQL agreement, session semantics, and validation.
  - `npm run smoke -- todo` passed after docs changes.
- **Commit**: `a678b85` (`docs: add sql-backed todo guide`)
- **Companion ping**: `review-request: T008 a678b85` sent at 2026-05-15T07:19:28Z.

### T009 — Update domain records

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Updated `session-work-state` source locations, concepts, contracts, composition, dependents, boundaries, and history for `TodoSqlStore` and bound parameters.
  - Updated `agent-tooling-interface` purpose, source locations, concepts, contracts, composition, dependencies, boundaries, and history for `todo` UX.
  - Updated domain map labels, edges, health summary, and history.
  - Updated registry history to record Plan 010 as an extension of existing domains rather than a new domain.
  - Updated Plan 010 Domain Manifest to include session-sql wiring files committed as `/sql` agreement prerequisites.
- **Commit**: `fdb7a95` (`docs: record sql-backed todo domains`)
- **Companion ping**: `review-request: T009 fdb7a95` sent at 2026-05-15T07:22:16Z.

### T010 — Capture execution evidence, velocity, and difficulties

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Added `docs/difficulties.md` D-027 for companion ping SHA drift in concurrent worktrees.
  - Added `docs/difficulties.md` D-028 for post-`/reload` smoke race; local encoded fix is the explicit wait in todo smoke.
  - Added `docs/velocity.md` row for extension #5 (`todo`) with T0 and pending final-validation T1.
- **Commit**: `f6b2219` (`docs: log todo implementation lessons`)
- **Companion ping**: `review-request: T010 f6b2219` sent at 2026-05-15T07:24:59Z.

### T011 — Run full validation

- **Started**: 2026-05-15
- **Completed**: 2026-05-15
- **Status**: completed
- **Evidence**:
  - Fixed todo smoke key typing (`q` as typed text instead of Driver SDK `Key`).
  - Fixed validation blockers surfaced by full repo checks: `snapshot-refresh` noUncheckedIndexedAccess issues, `harness/driver/index.ts` `escape` shadowing, and in-flight ralph-loop lint/smoke drift so `npm run self-check` could validate every local scenario.
  - `npm run typecheck` passed.
  - `npm test` passed: 16 files passed / 2 skipped; 218 tests passed / 4 skipped.
  - `npm run lint` passed with only the known Biome schema-version info.
  - `npm run smoke -- session-sql` passed.
  - `npm run smoke -- todo` passed.
  - `npm run smoke -- ralph-loop` passed after ralph-loop smoke robustness fixes.
  - `npm run self-check` passed: typecheck, lint, tests, all smoke scenarios, package audit, and snapshot check.
- **Companion ping**: pending commit SHA.

## Companion Findings Reconciliation

| Finding | ackOf | Severity | Disposition | Notes |
|---------|-------|----------|-------------|-------|
| _none yet_ | — | — | — | — |
