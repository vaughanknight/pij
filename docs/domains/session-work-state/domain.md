# Domain: session-work-state

## Purpose

Own session-scoped structured state used by an agent while solving the current task. This domain defines what it means for state to belong to one pi session, survive reload/resume, stay independent across new/forked sessions, and remain outside project source files.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/session-sql/store.ts` | Implementation of the pi-free session SQLite store. |
| `.pi/extensions/session-sql/store.test.ts` | Store-level tests with real temp SQLite/filesystem fixtures. |
| `.pi/extensions/todo/store.ts` | Pi-free todo operations, parser helpers, formatters, and key defaults over the canonical SQL work schema. |
| `.pi/extensions/todo/store.test.ts` | Todo store tests with real temporary session SQL stores. |
| `docs/plans/006-generic-sqlite-session-tool/workshops/001-session-sqlite-semantics-and-safety-boundary.md` | Source design for session semantics and safety boundary. |
| `docs/plans/006-generic-sqlite-session-tool/workshops/004-default-schema-and-migrations.md` | Source design for default schema and migrations. |
| `.pi/extensions/minih-workbench/session-persistence.ts` | Append-only custom session-entry projection for Minih Workbench pointers, audit records, push opt-ins, and per-event cursors. |
| `.pi/extensions/pi-peacock/store.ts` | Pi-free Peacock preset, command, settings, and append-only replay projection for footer identity state. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Session DB identity | A private SQLite DB belongs to one pi session ID. | DB files live under `~/.pi/db/session-sql/<sessionId>.sqlite`. |
| Default work schema | New DBs start useful without constraining custom tables. | `session_sql_meta`, `todos`, and `todo_deps` are initialized on first open. |
| Resume persistence | Same-session data survives reload, process exit, and later resume while files remain. | Reopen by same session ID returns prior rows. |
| New/fork independence | New and forked sessions do not inherit parent rows. | New session ID maps to a fresh DB plus defaults. |
| Trusted SQL execution | SQL is trusted local-agent capability, not a sandbox. | Unrestricted SQL, 200-row returned preview cap, native extension loading when supported. |
| SQL-backed todo state | Routine todo operations and compact widget projections are typed views over the default work schema. | `TodoSqlStore` uses only `todos` and `todo_deps`, shares `/sql` visibility, exposes `widgetSnapshot()` for recent-activity display, supports targeted delete/prune cleanup, and never creates duplicate storage. |
| Dependency-aware readiness | Ready work is derived from status plus dependency edges. | `next` returns `in_progress`/`pending` rows whose dependencies are all `done`, ordered deterministically. |
| Append-only extension session entries | Some extensions persist lightweight session-local state in Pi custom entries instead of SQLite. | Minih Workbench uses `minih-workbench.persistence.v1` custom entries to replay selected pointers, audit records, push opt-ins, and per-event push cursors across reload/resume while adding reset markers for new/fork independence; Pi Peacock uses `pi-peacock.settings.v1` entries to replay selected color/surface/off/reset state. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `SessionSqlStore` | `agent-tooling-interface` | Opens/closes session DBs, executes SQL, reports status/schema, resets, and returns tagged results. Supports bound positional/named values for single statements. |
| `SessionSqlLocation` | `agent-tooling-interface` | Plain data object with session ID, root dir, and DB path; no pi imports. |
| Default schema | Agents and `/sql schema` | Versioned schema with metadata, todos, and dependency edges. |
| Result caps | Agent/tool UX | Returned previews cap at 200 rows and mark truncation. |
| `TodoSqlStore` | `agent-tooling-interface` | Pi-free todo add/list/status/block/done/delete/prune/dependency/next/counts/clear/widgetSnapshot operations over the default schema with tagged-union results. |
| Minih Workbench session projection | `agent-workbench`, `agent-tooling-interface` | Append-only custom entries replay selected-run pointers, seen cursors, push opt-ins, and audit records; same-session reload/resume replays rows, while new/fork appends a reset marker. |
| Peacock session projection | `agent-tooling-interface` | Append-only `pi-peacock.settings.v1` entries replay selected color, preset, surface, off, and reset state across same-session reload/resume without importing Pi runtime into the store. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| Session SQL store | implemented | Implemented in `.pi/extensions/session-sql/store.ts`. |
| Store tests | implemented | Use real temporary SQLite/filesystem fixtures in `.pi/extensions/session-sql/store.test.ts`. |
| Todo SQL store | implemented | `TodoSqlStore` in `.pi/extensions/todo/store.ts` consumes `SessionSqlStore` and the default todo/dependency schema. |
| Todo widget projection | implemented | `TodoSqlStore.widgetSnapshot()` returns a compact recent-activity projection for the agent-tooling-interface widget without adding storage. |
| Todo store tests | implemented | `.pi/extensions/todo/store.test.ts` covers SQL agreement, statuses, dependencies, delete/prune/clear, limits, widget projection, and persistence. |
| Minih Workbench session projection | implemented in Plan 007 Phase 3 | `.pi/extensions/minih-workbench/session-persistence.ts` projects append-only custom session entries for selected pointers, audit records, push opt-ins, and per-event cursor channels. |
| Peacock session projection | implemented in Plan 013 | `.pi/extensions/pi-peacock/store.ts` projects append-only footer color/surface settings with persist-before-mutate semantics. |

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| pi runtime | indirect | Current session ID and lifecycle are passed in by `agent-tooling-interface`; this domain does not import pi. |
| Node runtime | direct | Node `>=24` with `node:sqlite` and native SQLite extension loading APIs. |
| extension-authoring-harness | consume | Store test and self-check conventions. |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| agent-tooling-interface | `SessionSqlStore`, `TodoSqlStore`, result types, schema/status/reset contracts, and custom session-entry replay semantics. |
| agent-workbench | Minih Workbench persistence facade semantics for selected pointers, audit records, push opt-ins, and dedupe cursors. |

## Boundary Owns

- Session identity semantics.
- DB path and persistence expectations.
- Default schema and schema version.
- Todo/dependency state semantics and recent-activity widget projection over the default schema.
- Append-only custom session-entry replay semantics for lightweight extension-local state, including Peacock color/surface settings.
- Reset behavior.
- New/fork independence.
- Output caps as store-level result limits.
- Native SQLite extension loading availability/status.

## Boundary Excludes

- Human-facing slash command formatting; belongs to `agent-tooling-interface`.
- Model prompt wording; belongs to `agent-tooling-interface`.
- Historical memory/search; out of scope for Plan 006/010.
- Cloud sync or shared multi-user DBs; out of scope for Plan 006/010.
- Assignees, tags, categories, due dates, and work-on autoprompt behavior; out of scope for Plan 010.

## History

| Plan | Change | Date |
|------|--------|------|
| 006-generic-sqlite-session-tool | Domain created for session-local SQLite work state. | 2026-05-15 |
| 006-generic-sqlite-session-tool | Implemented `SessionSqlStore`, default schema, execution caps, reset, and native extension loading support. | 2026-05-15 |
| 010-sql-backed-todo-extension | Added `TodoSqlStore` as a pi-free typed consumer of the default `todos` / `todo_deps` schema and extended `SessionSqlStore` with bound-parameter support. | 2026-05-15 |
| 010-sql-backed-todo-extension/ST-001 | Added `TodoSqlStore.widgetSnapshot()` for compact below-editor recent-activity display without new storage. | 2026-05-16 |
| 010-sql-backed-todo-extension/follow-up | Added targeted todo cleanup: delete one id and prune completed rows without clearing open work. | 2026-05-16 |
| 007-options-for-pi-extensions-that-do-subagents / Phase 3 | Minih Workbench consumed append-only custom session entries for audit/cursor/push state with reload/resume replay and new/fork reset markers. | 2026-05-17 |
| 013-pi-peacock | Added Pi-free Peacock session projection for selected footer color/surface, off, and reset state over append-only custom entries. | 2026-05-27 |
