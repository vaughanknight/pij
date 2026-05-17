# Domain: agent-tooling-interface

## Purpose

Own the observable model and operator experience for using session SQL, SQL-backed current-session todos, and Minih Workbench pull, native list/modal, gated send/stop, and pushed-context surfaces. This domain makes structured work state and external agent-run state discoverable, debuggable, and testable without relying on nondeterministic model behavior.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/session-sql/index.ts` | Pi wiring for lifecycle, `sql` tool, `/sql` command, and formatting. |
| `.pi/extensions/session-sql/smoke.ts` | Deterministic command smoke. |
| `.pi/extensions/session-sql/AGENTS.md` | Extension-local session SQL tool/command guidance. |
| `.pi/extensions/todo/index.ts` | Pi wiring for lifecycle, `/todo` command, `todo` tool, overlay, status signal, and shortcut registration. |
| `.pi/extensions/todo/smoke.ts` | Deterministic todo command/overlay/SQL agreement smoke. |
| `.pi/extensions/todo/AGENTS.md` | Extension-local implementation and validation guidance. |
| `.pi/extensions/minih-workbench/index.ts` | Pi wiring for `/minih`, `/minih list`, `/minih view`, `/minih report`, `/minih send`, `/minih stop`, status/report JSON commands, model tools, pushed context, feed lifecycle, and lifecycle cleanup. |
| `.pi/extensions/minih-workbench/ui.ts` | Native Pi run-list and full modal components plus width-safe render helpers for Minih inventory/view panes, composer, and controls. |
| `.pi/extensions/minih-workbench/smoke.ts` | Deterministic Minih Workbench list/modal/send-gating/report/reload smoke over fixture artifacts and fake writer hooks. |
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
| Minih Workbench native list/modal UX | Minih run state is inspectable from Pi through read-only native TUI without writing to Minih. | `/minih` and `/minih list` open a keyboard-selectable run list; `/minih view <slug> <runId>` opens transcript/tool/status/coordination/report/diagnostic panes; `/minih report <slug> <runId>` opens the report-focused modal; `Esc` only closes UI. |
| Minih Workbench read-only pull UX | Minih run state is inspectable from Pi without opening the modal or writing to Minih. | `/minih status --json`, `/minih status <slug> <runId> --json`, `/minih report <slug> <runId> --json`, `minih_runs_list`, `minih_run_status`, and `minih_read_report`. |
| Minih Workbench gated interaction UX | Coordinated Minih runs can be messaged or stopped only through explicit safe surfaces. | `/minih send`, `minih_send_message`, `/minih stop`, and `minih_stop_run` require explicit run id, fresh capability checks, audit persistence, adapter write wrappers, and exact stop confirmation. |

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
| `/minih` native UI command | Human/operator/smoke | `/minih`/`list` opens the read-only run-list overlay; `view`/`report` open full-area read-only modal panes; `Esc` closes only Pi UI. |
| `/minih` read-only pull command | Human/operator/smoke | Canonical `/minih status --json` plus status/report JSON subcommands over fixture or configured Minih artifact roots. |
| Minih read-only tools | LLM agent | `minih_runs_list`, `minih_run_status`, and `minih_read_report` return deterministic bounded JSON envelopes and expose no write behavior. |
| Minih interaction tools | LLM agent | `minih_send_message` sends only after capability/audit gating; `minih_stop_run` requires exact `confirm: "stop <slug>/<runId>"` and sends a dedicated control message only after audit persistence. |
| Minih pushed context | Human/operator/model | Compact `minih.materialEvent` custom messages use `deliverAs: "steer"`, urgent `triggerTurn` only for urgent classified events, and redacted/deduped payloads. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| Pi lifecycle wiring | implemented | `index.ts` handles `session_start` and `session_shutdown`. |
| Tool registration | implemented | `index.ts` registers `sql` with sequential execution. |
| Command registration | implemented | `index.ts` registers `/sql`. |
| Documentation | implemented | README quick-start plus `docs/how/session-sql.md` and `docs/how/todo.md`. |
| Todo wiring | implemented | `todo/index.ts` registers lifecycle, command, model tool, status, overlay, below-editor strip, and shortcuts. |
| Todo smoke | implemented | `todo/smoke.ts` proves empty/add/list/delete/prune/SQL agreement/below-editor strip/overlay/reload path. |
| Minih Workbench read-only pull wiring | implemented in Plan 007 Phase 1 | `minih-workbench/index.ts` registers canonical `/minih` read-only JSON commands and model tools over the agent-workbench adapter contracts. |
| Minih Workbench native list/modal wiring | implemented in Plan 007 Phase 2 | `minih-workbench/index.ts` wires `/minih` list/view/report UI, lazy feed handles, selected-run pointer cleanup, and status lifecycle. |
| Minih Workbench interaction/push wiring | implemented in Plan 007 Phase 3 | `minih-workbench/index.ts` wires send/stop tools and commands, modal composer/stop callbacks, fake writer smoke hooks, and compact pushed context delivery. |

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
- Minih Workbench `/minih` command, native list/modal/report/composer/control UI, model tools, pushed-context delivery, and formatting presentation.
- Deterministic smoke scenario.
- Operator documentation and agent use recipes.

## Boundary Excludes

- SQLite storage internals; belongs to `session-work-state`.
- Schema migrations and reset implementation; belongs to `session-work-state`.
- Broad harness redesign; belongs to the existing harness capability and is out of scope unless narrow friction appears.
- Cross-session memory/search; out of scope for Plan 006/010.
- Todo storage semantics; belongs to `session-work-state`.
- Minih run execution, artifact ownership, adapter normalization, and send/stop/push safety policy; belongs to Minih upstream and `agent-workbench`.

## History

| Plan | Change | Date |
|------|--------|------|
| 006-generic-sqlite-session-tool | Domain created for session SQL tool/command UX. | 2026-05-15 |
| 006-generic-sqlite-session-tool | Implemented `sql` tool, `/sql` command, result formatting, smoke scenario, and user/agent docs. | 2026-05-15 |
| 010-sql-backed-todo-extension | Added `todo` tool, `/todo` command, minimal overlay, open-count status signal, deterministic smoke, and docs over the shared session SQL work state. | 2026-05-15 |
| 010-sql-backed-todo-extension/ST-001 | Added the compact below-editor `todo-strip` widget and `session-sql:changed` refresh path. | 2026-05-16 |
| 010-sql-backed-todo-extension/follow-up | Added `/todo delete <id>`, `/todo prune done`, and matching model tool actions for tidying completed or unwanted rows. | 2026-05-16 |
| 007-options-for-pi-extensions-that-do-subagents / Phase 1 | Added read-only Minih Workbench pull UX: `/minih status --json`, run status/report commands, `minih_runs_list`, `minih_run_status`, `minih_read_report`, and fixture-backed smoke. | 2026-05-16 |
| 007-options-for-pi-extensions-that-do-subagents / Phase 2 | Added native read-only `/minih` run-list, full modal run/report viewer, feed lifecycle cleanup, and deterministic Driver SDK modal smoke. | 2026-05-16 |
| 007-options-for-pi-extensions-that-do-subagents / Phase 3 | Added gated `/minih send`, `/minih stop`, `minih_send_message`, `minih_stop_run`, modal composer/controls, pushed-context delivery, fake-writer smoke hooks, and tool-ordering tests. | 2026-05-17 |
