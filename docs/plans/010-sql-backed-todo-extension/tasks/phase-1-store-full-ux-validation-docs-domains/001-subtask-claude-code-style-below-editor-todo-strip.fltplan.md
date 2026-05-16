# Flight Plan: Subtask 001 — Claude Code-style Below-editor Todo Strip

**Subtask**: [001-subtask-claude-code-style-below-editor-todo-strip.md](./001-subtask-claude-code-style-below-editor-todo-strip.md)  
**Plan**: [../../sql-backed-todo-extension-plan.md](../../sql-backed-todo-extension-plan.md)  
**Phase**: Phase 1: Store, full UX, validation, docs, domains  
**Parent Task**: T006 — Overlay/status/key matching  
**Generated**: 2026-05-15  
**Status**: Active

---

## What → Why

**Problem**: The todo extension has `/todo`, overlay, and footer status, but does not yet show the active/recent task list under the editor like the desired Claude Code-style workflow.

**Fix**: Add a below-editor widget that renders a compact 4-row recent-activity todo strip from the SQL-backed source of truth, with in-flight marker, completed strikethrough, overflow/paging policy, docs, and validation.

---

## Domain Context

| Domain | Relationship | What Changes |
|--------|--------------|--------------|
| `session-work-state` | modify | Add pi-free widget projection/snapshot helpers over existing `todos` state. |
| `agent-tooling-interface` | modify | Render below-editor widget, refresh lifecycle, optional paging shortcut registration, docs. |
| `extension-authoring-harness` | consume/modify tests | Add store tests and smoke assertions where deterministic; run self-check. |

---

## Stages

- [x] **Stage 1: Projection contract** — Add widget snapshot types/constants and recent-activity query in `todo/store.ts`.
- [x] **Stage 2: Widget surface** — Render and refresh `todo-strip` below the editor in `todo/index.ts`.
- [x] **Stage 3: Sync path** — Decide and implement/document raw `/sql` synchronization (`session-sql:changed` or fallback).
- [x] **Stage 4: Validation** — Add store/render tests and todo smoke anchors if observable.
- [ ] **Stage 5: Documentation and closeout** — Update docs/domains/ledgers and run final validation.

---

## Acceptance

- [ ] Widget uses `ctx.ui.setWidget("todo-strip", ..., { placement: "belowEditor" })` and clears with `undefined`.
- [ ] Widget shows at most 4 task rows by default, not the full todo list.
- [ ] `in_progress` rows render first with an in-flight marker.
- [ ] Recently completed rows remain visible and struck through while open work remains.
- [ ] Overflow indicates hidden rows and paging/full-overlay path.
- [ ] Paging shortcuts, if enabled, are configurable and named; no hardcoded `ctrl+t`.
- [ ] Store tests cover recency ordering, cap, overflow, paging, completed retention, all-done clear, and long titles.
- [ ] `npm run smoke -- todo` and `npm run self-check` pass or unrelated pre-existing failures are documented.
