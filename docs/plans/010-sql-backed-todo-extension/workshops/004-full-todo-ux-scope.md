# Workshop: Full Todo UX Scope

**Type**: CLI Flow / Other  
**Plan**: 010-sql-backed-todo-extension  
**Spec**: [sql-backed-todo-extension-spec.md](../sql-backed-todo-extension-spec.md)  
**Created**: 2026-05-15T06:37:42Z  
**Status**: Draft

**Value Thesis**: This workshop makes the clarified Full UX scope deliverable in Simple mode by defining the smallest useful command, tool, overlay, status, and shortcut experience.  
**Target Proof Level**: Implementation Ready  
**Current Proof Level**: Preferred Direction

**Selected Value Axes**:
- **User Experience**: Full UX must feel cohesive rather than like five unrelated surfaces.
- **Operator Usability**: Humans need quick visibility and steering during live agent work.
- **Implementation Readiness**: The workshop bounds overlay and shortcut complexity.
- **Operational Reliability**: Smoke needs deterministic, stable outputs despite TUI rendering.
- **Cost / Attention Reduction**: Keeps Simple-mode delivery focused despite expanded UX.

**Related Documents**:
- [001-todo-command-and-model-action-contract.md](./001-todo-command-and-model-action-contract.md)
- [002-dependency-aware-next-ready-semantics.md](./002-dependency-aware-next-ready-semantics.md)
- [003-sql-backed-todo-data-contract.md](./003-sql-backed-todo-data-contract.md)

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface`
- **Related Domains**: `session-work-state`, `extension-authoring-harness`

---

## Purpose

Define what “Full UX in v1” means without turning the todo extension into a large TUI product. This workshop identifies the minimum coherent command/tool/overlay/status/shortcut experience and what smoke must prove.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Preferred Direction** now and **Implementation Ready** after architecture picks exact TUI primitives.

They should be able to:

- Keep v1 UX scope bounded.
- Implement a small overlay without hardcoded keybindings.
- Decide what status text appears and when it clears.
- Write smoke that proves user-visible behavior without brittle full-screen snapshots.

## Key Questions Addressed

- What is the smallest overlay that satisfies full UX?
- What must smoke prove?
- Which shortcuts are configurable defaults?

---

## Full UX Definition

V1 includes these surfaces:

| Surface | Required? | Minimum V1 Behavior |
|---------|-----------|---------------------|
| Slash command | yes | `/todo` list and subcommands. |
| Model tool | yes | Single `todo` action tool. |
| Interactive overlay | yes | Read-only/selectable list with concise help; mutations can be via command initially unless easy. |
| Footer/status signal | yes | Shows open count when open todos exist; clears with `undefined` when none. |
| Configurable shortcut surface | yes if shortcuts/key matching exist | No hardcoded keybindings; defaults live in named constants. |

## UX Cohesion Principle

All surfaces show the same source-of-truth state:

```mermaid
flowchart LR
    SQL[(session SQL todos)] --> CMD[/todo command]
    SQL --> TOOL[todo tool]
    SQL --> OVERLAY[overlay]
    SQL --> STATUS[footer status]
    CMD --> SQL
    TOOL --> SQL
```

If a todo changes, every surface should reflect that on next render/command invocation.

## Overlay Minimum

### Required overlay content

```text
┌─ todo: 3 open ──────────────────────────────────────────────┐
│ #2 in_progress p1  Implement store                          │
│ #1 pending     p0  Write tests                              │
│ #3 blocked     p0  Decide shortcut defaults                 │
│                                                             │
│ Enter: details  d: done  b: block  r: refresh  q/Esc: close │
└─────────────────────────────────────────────────────────────┘
```

### Minimum acceptable implementation

If full interactive mutation is too expensive in Simple mode, overlay can be:

- openable through `/todo overlay` and configurable shortcut;
- scrollable/selectable if the existing TUI API makes it cheap;
- read-only with help pointing to slash commands.

However, to satisfy “Full UX” strongly, at least one simple interaction should be supported if feasible:

- close overlay;
- refresh list;
- mark selected done.

Architecture should inspect current pi TUI APIs before committing to mutation keys.

## Status Signal

### Required behavior

| Todo state | Status value |
|------------|--------------|
| 0 open todos | clear status with `undefined` |
| 1 open todo | `todo: 1 open` |
| N open todos | `todo: N open` |
| storage unavailable | `todo: error` or no status + notification |

Status must count `pending`, `in_progress`, and `blocked` as open. `done` is not open.

### Gotcha

Never clear with `""`; that leaves an empty pill. This is D-006 from `docs/difficulties.md`.

## Shortcut Contract

No hardcoded keybindings. If the overlay has shortcut/key matching, define constants in the extension store or index boundary:

```ts
const DEFAULT_TODO_KEYBINDINGS = {
  openOverlay: ["ctrl+t"],
  closeOverlay: ["escape", "q"],
  refresh: ["r"],
  markDone: ["d"],
} as const;
```

The exact matching shape should follow current pi extension conventions; architecture must verify the runtime API. The important product contract is configurability and named defaults.

## Command + Overlay Relationship

| Action | Command | Tool | Overlay |
|--------|---------|------|---------|
| List open | `/todo` | `action=list` | default view |
| Add | `/todo add` | `action=add` | optional future prompt; not required |
| Done | `/todo done` | `action=done` | optional selected-row key if simple |
| Status/block | `/todo status`, `/todo block` | `action=status`, `action=block` | optional future prompt; not required |
| Dependency | `/todo dep` | `action=dep` | read-only display optional |
| Next | `/todo next` | `action=next` | optional highlighted ready items |
| Clear | `/todo clear` | `action=clear` with confirm | not from overlay v1 unless confirmation UX exists |

## Smoke Strategy

Avoid brittle full-screen assertions. Use stable anchors.

### Required smoke path

1. Boot pi with `todo` and `session-sql` loaded.
2. `/todo` → expect `todo: no open todos`.
3. `/todo add Smoke todo` → expect `todo: added` and `Smoke todo`.
4. `/todo list` → expect `todo: 1 open` and `Smoke todo`.
5. `/sql SELECT title FROM todos WHERE title = 'Smoke todo';` → expect `Smoke todo`.
6. `/todo overlay` → expect overlay anchor `todo: 1 open` and `Smoke todo`.
7. `/reload` → `/todo list` → expect `Smoke todo`.

### Optional smoke path

If selected-row done is implemented in overlay:

1. Open overlay.
2. Send configured done key.
3. Expect `todo: #N done` or status count update.

Do not make optional overlay mutation a v1 gate unless architecture confirms deterministic TUI control.

## Documentation UX Examples

README quick-start:

```md
### SQL-backed todos

Use `/todo` for routine current-session work tracking:

- `/todo add Write tests`
- `/todo next`
- `/todo done 1`

Todos are stored in the same session SQL DB as `/sql`, so you can inspect them with:

`/sql SELECT * FROM todos;`
```

How-to guide should include:

- command table;
- tool action table;
- overlay/status screenshots or text mock;
- SQL inspection examples;
- dependency examples;
- reset/clear semantics.

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Command/tool only | Defer overlay/status/shortcuts | Fastest | Contradicts clarification | Rejected. |
| Full rich overlay | Multiple interactive mutations + navigation | Polished | Scope risk | Open only if API makes cheap. |
| Minimal full UX | Command/tool + simple overlay + status + configurable defaults | Satisfies clarification with bounded scope | Overlay less powerful | Selected. |

## Validation / Acceptance

This workshop reaches Implementation Ready when architecture confirms:

- Which pi UI primitive renders overlay.
- Which shortcut API/config shape exists.
- Which overlay interactions are deterministic enough for v1.
- Smoke anchors for overlay/status are stable.

Current proof level is Preferred Direction because exact TUI APIs should be verified during architecture/implementation.
