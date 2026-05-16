# Execution Log: Subtask 001 — Claude Code-style Below-editor Todo Strip

**Status**: Complete  
**Created**: 2026-05-15

## Pre-phase Harness Validation

| Check | Result | Evidence |
|-------|--------|----------|
| Companion boot | pass | `code-review-companion` run `2026-05-16T09-45-41-687Z-4b0a`; briefing sent `2026-05-15T23:46:04Z`. |
| Engineering harness retry | pass | `just self-check` passed after initial pre-existing Biome formatting race in unrelated `ralph-loop` work. |
| Worktree safety | noted | Unrelated dirty/untracked files existed before implementation; this subtask stages only declared paths. |

## Execution Narrative

### 2026-05-15 — ST001 started

- Marked ST001 active in the task dossier and flight plan.
- Scope: add pi-free widget projection constants/types/query helpers to `.pi/extensions/todo/store.ts`.

### 2026-05-15 — ST001 completed

- Added `TODO_WIDGET_KEY`, `DEFAULT_TODO_WIDGET_OPTIONS`, widget paging key slots, `TodoWidgetOptions`, `TodoWidgetSnapshot`, and `TodoSqlStore.widgetSnapshot()`.
- Preserved `TodoCounts` public shape after scoped tests caught accidental `inProgress` leakage into `counts()`.
- Evidence: `npm run typecheck` passed; `npm test -- .pi/extensions/todo/store.test.ts` passed (14 tests).


## Task Progress

| Task | Status | Notes |
|------|--------|-------|
| ST001 | done | Added widget constants/options/key fields, `TodoWidgetSnapshot`, and `widgetSnapshot()` recent-activity projection. |
| ST002 | done | Added below-editor `todo-strip` widget rendering, lifecycle refresh, clear-on-shutdown/zero-open behavior, and optional paging shortcut wiring. |
| ST003 | done | Added `session-sql:changed` event emission and todo listener for immediate raw SQL refresh. |
| ST004 | done | Added widget projection tests and smoke-visible in-flight widget anchor. |
| ST005 | done | Updated docs/domains/ledgers and final validation passed. |

### 2026-05-15 — ST002 started

- Marked ST002 active in the task dossier and flight plan.
- Scope: render `todo-strip` below the editor, refresh after todo-visible operations, and clear on shutdown/zero open work.

### 2026-05-15 — ST002 completed

- Added `TodoStripWidget` using `ctx.ui.setWidget(TODO_WIDGET_KEY, ..., { placement: "belowEditor" })`.
- Widget shows summary, in-flight marker, blocked marker/reason, completed strikethrough, overflow/page hints, and truncates each line.
- Refreshes after `/todo` command paths, `todo` tool execution, session start, overlay close/done, and `turn_end`; clears on shutdown and zero open work.
- Evidence: `npm run typecheck` passed; `npm test -- .pi/extensions/todo/store.test.ts` passed; `npm run smoke -- todo` passed.
- Companion ST001 review summary: no findings; non-blocking note that Validation Evidence was still placeholder mid-phase.

### 2026-05-16 — ST003 started

- Marked ST003 active in the task dossier and flight plan.
- Decision: implement the explicit `session-sql:changed` event path rather than relying only on `turn_end` fallback, because `/sql INSERT ... RETURNING` should update the strip immediately too.

### 2026-05-16 — ST003 completed

- `session-sql` now emits `session-sql:changed` after successful ad-hoc SQL command/tool execution and reset.
- `todo` listens for matching-session events and refreshes the below-editor widget/status with page reset.
- Evidence: `npm run typecheck` passed; `npx biome check .pi/extensions/session-sql/index.ts .pi/extensions/todo/index.ts` passed; `npm run smoke -- todo` passed.
- Companion ST002 review summary: no findings.
- Companion ST003 finding F001 MEDIUM: initial `session-sql:changed` event over-emitted on read-only `SELECT`; fixed by gating event emission to syntactically mutating statements plus reset, while preserving `INSERT ... RETURNING` handling.

### 2026-05-16 — ST004 started

- Marked ST004 active in the task dossier and flight plan.
- Scope: add widget projection test coverage and extend todo smoke with stable below-editor anchors where Driver capture allows.

### 2026-05-16 — ST004 completed

- Added store tests for compact recent-activity window, overflow/page metadata, completed-row retention while open work remains, and all-done widget clear behavior.
- Extended todo smoke to use raw `/sql UPDATE ... in_progress` and assert the below-editor strip anchor `Todos 0/1 done · ... · 1 in flight` plus the smoke title.
- Folded companion F001 fix into this validation commit: `session-sql:changed` now emits only for syntactically mutating SQL and reset.
- Evidence: `npm test -- .pi/extensions/todo/store.test.ts .pi/extensions/session-sql/store.test.ts` passed (45 tests); `npm run smoke -- todo` passed; `npm run typecheck` passed; scoped Biome checks passed.

### 2026-05-16 — ST005 started

- Marked ST005 active in the task dossier and flight plan.
- Scope: update user docs/domain records/ledgers, run full validation, reconcile companion findings, and close the subtask.

### 2026-05-16 — ST005 completed

- Updated `docs/how/todo.md`, `session-work-state`, `agent-tooling-interface`, `domain-map`, `docs/difficulties.md`, and task/flight-plan status.
- Final validation passed with `just self-check`: typecheck, lint, tests, smoke (`ralph-loop_compact-survival`, `session-sql`, `todo`), package audit, and snapshots check.
- Known non-failing output: Biome schema version info, Node SQLite experimental warnings, package-vetter legacy override warning.
- Companion ST005 review summary: no findings; F001/F002 materially closed.

## Validation Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | pass | Run before ST001/ST002/ST003/ST004 and inside final `just self-check`. |
| `npm test -- .pi/extensions/todo/store.test.ts .pi/extensions/session-sql/store.test.ts` | pass | 45 tests after F002 coverage additions. |
| `npm run smoke -- todo` | pass | Includes below-editor in-flight strip anchor. |
| `just self-check` | pass | Full canonical gate per AGENTS.md. |

## Companion Findings Reconciliation

| Finding | Severity | Disposition | Notes |
|---------|----------|-------------|-------|
| F001 | MEDIUM | fixed | `session-sql:changed` now emits only for syntactically mutating SQL and reset, not read-only `SELECT`. |
| F002 | MEDIUM | fixed | Added changed-classifier regression tests, multiple in-flight widget coverage, and long-title visible-width truncation coverage. |
