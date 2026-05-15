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
- **Companion ping**: pending commit SHA.

## Companion Findings Reconciliation

| Finding | ackOf | Severity | Disposition | Notes |
|---------|-------|----------|-------------|-------|
| _none yet_ | — | — | — | — |
