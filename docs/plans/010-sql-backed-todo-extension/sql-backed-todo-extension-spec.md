# SQL-backed Todo Extension

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from `research-dossier.md`.

The research reviewed five existing pi todo implementations and found that the strongest product shape is a human/model-friendly todo layer over the existing current-session SQL work state. The most important finding is that the todo experience must not create a second source of truth: the todo list shown by `/todo` and the rows visible through `/sql` must represent the same state. The research also identified `bwks/pi-todos` as the best UX/action reference, while recommending that pij keep storage session-scoped and SQL-backed rather than project-local JSON, global markdown, or replayed tool-result snapshots.

## Summary

Build a first-party `todo` experience for pi sessions that helps humans and agents create, inspect, prioritize, unblock, and complete current-session work items. The feature should make structured session work visible and easy to operate without forcing users or agents to write raw SQL for common todo actions.

The todo experience exists to make pij's current-session work state feel like a product: agents can track plans and dependencies explicitly, humans can audit and steer that work, and both can fall back to the existing SQL inspection surface when needed.

## Goals

- Provide a clear human-facing todo command surface for current-session work.
- Provide a model-facing todo action surface so agents can manage work without raw SQL for routine operations.
- Provide a full v1 user experience: slash command, model tool, interactive overlay, footer/status signal, and configurable shortcut surface where key input is needed.
- Keep todo state inspectable and repairable through the existing SQL session work state.
- Support core todo lifecycle states: pending, in progress, blocked, and done.
- Support dependency-aware work selection so agents can ask for the next ready item instead of guessing.
- Preserve same-session todo state across reload/resume while keeping new/forked sessions independent.
- Make the feature discoverable through README quick-start docs, a detailed how-to guide, and deterministic smoke validation.
- Preserve the generic SQL tool as the raw debugging and power-user escape hatch.

## Non-Goals

- No separate project-local todo file, markdown todo file, or tool-result replay store as the source of truth.
- No global cross-session personal task manager in v1.
- No cloud sync, multi-user sharing, or durable long-term memory semantics.
- No full project-management system with milestones, calendars, due dates, assignments, tags, categories, or assignees in v1.
- No `workon` behavior that sends a follow-up agent prompt in v1.
- No broad redesign of the existing session SQL feature.
- No requirement that agents always use the todo tool for trivial one-step tasks.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `session-work-state` | existing | **modify** | Treat the current-session work-state schema and store contract as the canonical todo backing model, including todo rows, dependencies, session persistence, reset, and session independence. |
| `agent-tooling-interface` | existing | **modify** | Add the observable todo UX: model action surface, operator command surface, interactive overlay, status presentation, prompt guidance, result text, and deterministic smoke output. |
| `extension-authoring-harness` | existing capability | **consume** | Use existing generator, store tests, smoke, self-check, difficulty ledger, and velocity logging to validate the extension. |

### New Domain Sketches

No new domain is proposed for v1. The feature composes existing domains: `session-work-state` owns the backing state semantics, while `agent-tooling-interface` owns how humans and agents interact with that state.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=0, T=2
  - **S=2**: new extension plus overlay/status/docs/domain updates, touching multiple surfaces.
  - **I=1**: one internal integration with the existing current-session work-state capability.
  - **D=1**: uses existing todo/dependency data model with contract formalization, but no major new schema expected.
  - **N=1**: full UX scope needs careful design, but the storage/source-of-truth decision is clear.
  - **F=0**: standard local trusted-agent feature; no strict compliance/performance envelope.
  - **T=2**: needs store tests, command smoke, SQL agreement, and at least deterministic overlay/status validation.
- **Confidence**: 0.78
- **Assumptions**:
  - The todo experience will be session-scoped, not global or project-shared.
  - The existing current-session SQL work state remains the canonical backing store.
  - v1 includes full UX, but advanced metadata and autoprompt `workon` behavior are deferred.
  - The existing L2 harness remains sufficient; no harness contract changes are required.
- **Dependencies**:
  - Existing session work-state feature is available and loaded.
  - Existing extension harness can scaffold, test, smoke, and self-check a new extension.
  - Configurable key/shortcut matching is available or can be implemented locally without hardcoded keybindings.
- **Risks**:
  - A todo-specific UX could drift from the SQL-visible state and undermine trust.
  - Cross-extension state contracts could become implicit unless documented.
  - Full UX scope could slow delivery and introduce brittle smoke expectations.
  - Destructive actions such as clearing todos need confirmation and deterministic tests.
  - Overlay/shortcut behavior must avoid hardcoded keybinding drift.
- **Phases**:
  1. Clarify UX scope, validation strategy, and domain boundaries.
  2. Design todo action/command/overlay contract and dependency semantics.
  3. Implement store-backed todo operations, command/tool/overlay UX, validation, docs, and ledgers as one simple-mode delivery phase.

## Testing Strategy

- **Approach**: Hybrid.
- **Rationale**: The todo state and dependency semantics should be tested directly, while pi command/tool/overlay wiring should be smoke-tested through stable observable outcomes.
- **Focus Areas**: store operations, command parsing if non-trivial, dependency-aware next-ready behavior, `/todo` output, interactive overlay rendering path, status signal behavior, `/todo` + `/sql` agreement, reload/resume behavior, destructive clear confirmation.
- **Mock Usage**: Avoid mocks. Prefer real temporary SQLite/session stores and real formatting/parser helpers; only revisit if pi runtime wiring becomes impractical to isolate.
- **Excluded**: broad model-behavior tests and full keyboard-navigation matrix beyond deterministic smoke-visible overlay behavior.

## Documentation Strategy

- **Approach**: Hybrid (`README.md` + `docs/how/`).
- **README Scope**: short quick-start showing `/todo`, model-facing purpose, and the fact that state is SQL-backed.
- **How-to Scope**: `docs/how/todo.md` with commands, tool actions, status vocabulary, dependency examples, overlay/status behavior, SQL inspection examples, and relationship to `session-sql`.
- **Rationale**: Existing external todo extensions are most discoverable when they include both quick-start and deeper usage examples; this feature also needs to explain the SQL source-of-truth boundary clearly.

## Acceptance Criteria

1. A human can run a todo command that shows the current-session todo list, including empty-state text when no todos exist.
2. A human can add a todo item and immediately see it in the todo list with a stable identifier and status.
3. A model can use a todo action surface to add, list, update, and complete todo items without writing raw SQL for those routine operations.
4. A human can open an interactive todo overlay that renders the same current-session todos as the command list.
5. The todo extension exposes a status signal that summarizes open work without leaving a stale empty status pill.
6. Any keyboard shortcut or key matching introduced by the overlay is configurable rather than hardcoded.
7. A todo added through the todo UX is visible through the existing SQL inspection surface in the same session.
8. A todo row created through the SQL inspection surface is reflected by the todo list when it uses the supported todo schema.
9. Todo state survives reload/resume of the same session.
10. New or forked sessions begin with independent todo state except for the default empty schema.
11. A human or model can mark a todo as done, blocked, pending, or in progress, and the list output reflects the change.
12. A human or model can express that one todo depends on another, and the next-ready view excludes blocked-by-dependency items until prerequisites are done.
13. Destructive clearing of todos requires explicit confirmation and does not run accidentally from a bare list command.
14. Todo output remains compact enough for TUI/model use and gives stable phrases suitable for smoke assertions.
15. README quick-start and `docs/how/todo.md` explain the relationship between the todo UX and SQL-backed session work state.
16. Validation includes store-level tests, command/overlay smoke, type-checking, linting, and the existing self-check path.
17. The domain map and relevant domain docs identify todo as a consumer/user-facing layer over session work state.

## Risks & Assumptions

- The feature assumes the user's desired scope is current-session work management, not a project-wide or personal todo system.
- The feature assumes routine todo operations should be simpler than raw SQL while keeping SQL available for inspection and repair.
- The feature assumes the existing current-session work-state semantics are correct and should not be redefined here.
- Risk: full UX may be too large for a simple-mode pass unless the overlay is kept small and deterministic.
- Risk: adding metadata such as assignees, tags, or categories would require a broader data-model decision than v1 needs, so metadata is deferred.
- Risk: `workon` autoprompt behavior could surprise users by triggering agent work; v1 excludes autoprompt behavior.
- Risk: overlay keyboard handling and smoke validation may become more complex than the command/tool path.

## Open Questions

No critical open questions remain after the 2026-05-15 clarification pass. Architecture should still make concrete design choices for command names, tool action arguments, overlay layout, configurable shortcut defaults, and exact dependency-cycle behavior.

## Clarifications

### Session 2026-05-15

- **Q1 — Workflow Mode**: Simple.
  - Spec updated with `**Mode**: Simple`.
  - Planning should prefer a single delivery phase with lightweight defaults unless later clarification expands scope.
- **Q2 — Testing Strategy**: Hybrid.
  - Use direct tests for todo state/dependency semantics.
  - Use lightweight smoke for the pi command/tool surface and SQL agreement.
- **Q3 — Mock Usage**: Avoid mocks.
  - Prefer real temporary SQLite/session stores and direct tests of pi-free helpers.
- **Q4 — Documentation Strategy**: Hybrid.
  - Add README quick-start plus `docs/how/todo.md` for detailed examples and the SQL-backed source-of-truth explanation.
- **Q5 — Domain Review**: Confirmed.
  - Use existing `session-work-state` and `agent-tooling-interface` domains; consume `extension-authoring-harness`; create no new domain for v1.
- **Q6 — UX Scope**: Full UX.
  - Include slash command, model todo tool, interactive overlay, status signal, and configurable shortcut surface in v1.
- **Q7 — Advanced Behavior**: Dependencies only.
  - Include core status/priority/dependencies.
  - Defer assignees, tags, categories, and `workon` autoprompt behavior.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Todo command and model action contract | API Contract | The action vocabulary needs to be small, stable, and ergonomic for humans and models. | Which actions are v1? What names and arguments are stable? How should errors read? |
| Dependency-aware next-ready semantics | State Machine | The value of SQL-backed todos depends on reliable blocked/ready behavior. | What makes a task ready? How are cycles handled? How are blocked reasons shown? |
| SQL-backed todo data contract | Data Model | The feature must use existing session work state without creating a second source of truth. | Which fields are canonical? How is SQL-created data normalized? How should invalid rows be reported? |
| Full todo UX scope | CLI Flow | V1 includes command, tool, overlay, status signal, and configurable shortcut surface. | What is the smallest overlay that satisfies full UX? What must smoke prove? Which shortcuts are configurable defaults? |
| Cross-domain contract review | Integration Pattern | The todo feature may formalize the session work-state store as a reusable contract. | Is the current contract stable enough? What docs/tests must be added? |
