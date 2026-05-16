# Domain: agent-tooling-interface

## Purpose

Own the observable model and operator experience for using session SQL and SQL-backed current-session todos. This domain makes structured work state discoverable, debuggable, and testable without relying on nondeterministic model behavior.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/session-sql/index.ts` | Pi wiring for lifecycle, `sql` tool, `/sql` command, and formatting. |
| `.pi/extensions/session-sql/smoke.ts` | Deterministic command smoke. |
| `.pi/extensions/session-sql/AGENTS.md` | Extension-local session SQL tool/command guidance. |
| `.pi/extensions/todo/index.ts` | Pi wiring for lifecycle, `/todo` command, `todo` tool, overlay, status signal, and shortcut registration. |
| `.pi/extensions/todo/smoke.ts` | Deterministic todo command/overlay/SQL agreement smoke. |
| `.pi/extensions/todo/AGENTS.md` | Extension-local implementation and validation guidance. |
| `docs/how/session-sql.md` | Detailed user/agent guide. |
| `docs/how/todo.md` | Detailed SQL-backed todo user/agent guide. |
| `README.md` | Quick-start mention. |
| `docs/plans/006-generic-sqlite-session-tool/workshops/003-tool-command-and-result-contract.md` | Source design for tool/command contract. |
| `docs/plans/006-generic-sqlite-session-tool/workshops/007-agent-sql-use-cases-and-working-patterns.md` | Source design for agent use patterns and prompt guidance. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Generic `sql` tool | Model-facing SQL workbench for current-session structured state. | Tool parameters are `{ query, description, maxRows? }`. |
| `/sql` operator command | Human-facing deterministic debugging and smoke surface. | `/sql`, `/sql status`, `/sql schema`, `/sql <query>`, `/sql reset`. |
| Result presentation | Convert structured store results into compact readable text. | Stable success/error/truncation phrases, compact row previews. |
| Agent use guidance | Teach when to use SQL and how to create custom tables. | Prompt guidelines include triggers and table recipes beyond default todos. |
| Deterministic smoke | Validate the real pi TUI path without model tool selection. | Driver SDK scenarios exercise `/sql`, `/todo`, overlay anchors, and `/reload`. |
| Todo command and tool UX | Routine task actions are available without raw SQL. | `/todo` and the `todo` tool share add/list/status/block/done/delete/prune/dep/next/clear semantics. |
| Todo overlay, strip, and status | Current-session work is visible during live TUI use. | `/todo overlay` renders SQL-backed open todos; below-editor `todo-strip` shows a compact recent-activity window; footer status shows `todo: N open` and clears at zero. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `sql` tool | LLM agent | Executes SQL against the current session DB and returns structured details plus text. |
| `/sql` command | Human/operator/smoke | Status/schema/query/reset command surface with stable output phrases. |
| Prompt guidelines | LLM agent | Encourages proactive SQL use for tasks, files, tests, findings, research, decisions, and batches. |
| Smoke scenario | extension-authoring-harness | Uses current Driver SDK `Step` shape and avoids model-dependent tool calls. |
| `todo` tool | LLM agent | Manages SQL-backed current-session todos through action payloads; targeted delete/prune cleanup is supported, while destructive clear requires `confirm: true`. |
| `/todo` command | Human/operator/smoke | List/add/status/block/done/delete/prune/dep/next/overlay/clear command surface with stable output phrases. |
| Todo overlay/status/widget | Human/operator | Minimal overlay through `ctx.ui.custom`, compact below-editor strip through `ctx.ui.setWidget`, and footer status through `ctx.ui.setStatus`. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| Pi lifecycle wiring | implemented | `index.ts` handles `session_start` and `session_shutdown`. |
| Tool registration | implemented | `index.ts` registers `sql` with sequential execution. |
| Command registration | implemented | `index.ts` registers `/sql`. |
| Documentation | implemented | README quick-start plus `docs/how/session-sql.md` and `docs/how/todo.md`. |
| Todo wiring | implemented | `todo/index.ts` registers lifecycle, command, model tool, status, overlay, below-editor strip, and shortcuts. |
| Todo smoke | implemented | `todo/smoke.ts` proves empty/add/list/delete/prune/SQL agreement/below-editor strip/overlay/reload path. |

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| session-work-state | consume | `SessionSqlStore`, `TodoSqlStore`, schema/status/result/reset/todo contracts. |
| pi runtime | direct | `registerTool`, `registerCommand`, session lifecycle events, UI status/notify. |
| extension-authoring-harness | consume | Driver SDK smoke, self-check, difficulty/retro/velocity feedback loops. |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| extension-authoring-harness | Smoke output and validation evidence for `session-sql` and `todo`. |

## Boundary Owns

- Tool and command UX.
- Prompt snippets/guidelines.
- Result/error/truncation text.
- Status/schema presentation.
- Todo command/tool/overlay/below-editor strip/status presentation.
- Deterministic smoke scenario.
- Operator documentation and agent use recipes.

## Boundary Excludes

- SQLite storage internals; belongs to `session-work-state`.
- Schema migrations and reset implementation; belongs to `session-work-state`.
- Broad harness redesign; belongs to the existing harness capability and is out of scope unless narrow friction appears.
- Cross-session memory/search; out of scope for Plan 006/010.
- Todo storage semantics; belongs to `session-work-state`.

## History

| Plan | Change | Date |
|------|--------|------|
| 006-generic-sqlite-session-tool | Domain created for session SQL tool/command UX. | 2026-05-15 |
| 006-generic-sqlite-session-tool | Implemented `sql` tool, `/sql` command, result formatting, smoke scenario, and user/agent docs. | 2026-05-15 |
| 010-sql-backed-todo-extension | Added `todo` tool, `/todo` command, minimal overlay, open-count status signal, deterministic smoke, and docs over the shared session SQL work state. | 2026-05-15 |
| 010-sql-backed-todo-extension/ST-001 | Added the compact below-editor `todo-strip` widget and `session-sql:changed` refresh path. | 2026-05-16 |
| 010-sql-backed-todo-extension/follow-up | Added `/todo delete <id>`, `/todo prune done`, and matching model tool actions for tidying completed or unwanted rows. | 2026-05-16 |
