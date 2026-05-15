# Workshop: Todo Command and Model Action Contract

**Type**: API Contract / CLI Flow  
**Plan**: 010-sql-backed-todo-extension  
**Spec**: [sql-backed-todo-extension-spec.md](../sql-backed-todo-extension-spec.md)  
**Created**: 2026-05-15T06:37:42Z  
**Status**: Draft

**Value Thesis**: This workshop makes implementation and review cheaper by turning the `/todo` command and model-facing `todo` tool from a vague UX goal into concrete verbs, arguments, outputs, and error cases.  
**Target Proof Level**: Implementation Ready  
**Current Proof Level**: Implementation Ready

**Selected Value Axes**:
- **Operator Usability**: Humans need predictable commands and compact output during active agent sessions.
- **Agent Readiness**: The model needs one clear action schema, not scattered raw SQL recipes.
- **Review Compression**: Reviewers can compare implementation against command examples and tool payloads.
- **Safety to Change**: Stable output phrases become smoke anchors and prevent accidental UX drift.

**Related Documents**:
- [research-dossier.md](../research-dossier.md)
- [sql-backed-todo-extension-spec.md](../sql-backed-todo-extension-spec.md)
- [docs/how/session-sql.md](../../../how/session-sql.md)

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface`
- **Related Domains**: `session-work-state`, `extension-authoring-harness`

---

## Purpose

Clarify the user-visible and model-visible todo contract before architecture. This document decides the v1 action vocabulary, command syntax, response shape, and errors for the SQL-backed todo experience.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Implement `/todo` parsing and output without inventing verbs.
- Register the `todo` model tool with a stable action schema.
- Write smoke assertions against stable phrases.
- Review command/tool UX without reading external todo repos.

## Key Questions Addressed

- Which actions are v1?
- What names and arguments are stable?
- How should errors read?
- How do slash commands and model actions align?

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool shape | Single `todo` tool with `action` enum | Keeps tool surface compact and follows strongest external examples. |
| Slash command | `/todo` plus subcommands | Human-friendly and deterministic for smoke. |
| Status vocabulary | `pending`, `in_progress`, `blocked`, `done` | Matches existing session work-state schema. |
| Advanced metadata | Deferred | Clarification selected dependencies only for v1. |
| `workon` autoprompt | Deferred | Avoids surprising agent-start side effects. |
| Output style | Compact text + structured details for tool | Readable for humans; inspectable for agent/tool transcripts. |

## Command Summary

| Command | Purpose | Notes |
|---------|---------|-------|
| `/todo` | List open todos | Alias for `/todo list open`. |
| `/todo list [open|all|done|blocked]` | List todos by view | Default `open`. |
| `/todo add <title>` | Add pending todo | Optional priority syntax is allowed only if simple. |
| `/todo done <id>` | Mark done | Equivalent to status update. |
| `/todo status <id> <pending|in_progress|blocked|done>` | Set status | Main lifecycle mutation. |
| `/todo block <id> [reason]` | Mark blocked | Reason may append/update description if provided. |
| `/todo next` | Show ready non-done todos | Excludes items with incomplete dependencies. |
| `/todo dep <id> <depends_on_id>` | Add dependency edge | `id` cannot depend on itself. |
| `/todo clear` | Clear todo rows | Must confirm. |
| `/todo overlay` | Open interactive overlay | May also be bound to configurable shortcut. |

## Command Examples

### Empty list

```text
> /todo

todo: no open todos
Tip: /todo add <title>
```

Smoke anchor: `todo: no open todos`.

### Add

```text
> /todo add Write store tests

todo: added #1 pending — Write store tests
```

Rules:
- Title is required and trimmed.
- New items default to `pending`.
- Priority defaults to `0` unless explicitly supported by parser.

### List open

```text
> /todo list

todo: 2 open
#1 pending       p0  Write store tests
#2 in_progress   p1  Implement /todo command
```

Rules:
- Show stable numeric ids.
- Use aligned but compact columns.
- `done` items hidden from `open` unless requested.

### List all

```text
> /todo list all

todo: 3 total
#1 pending       p0  Write store tests
#2 in_progress   p1  Implement /todo command
#3 done          p0  Draft research dossier
```

### Done

```text
> /todo done 1

todo: #1 done — Write store tests
```

### Status

```text
> /todo status 2 blocked

todo: #2 blocked — Implement /todo command
```

### Block with reason

```text
> /todo block 2 waiting for session-sql contract decision

todo: #2 blocked — waiting for session-sql contract decision
```

### Dependency

```text
> /todo dep 2 1

todo: #2 depends on #1
```

### Next ready

```text
> /todo next

todo: 1 ready
#1 pending p0  Write store tests
```

### Clear

```text
> /todo clear

Confirm: Clear all current-session todos? [y/N]
```

If confirmed:

```text
todo: cleared 3 todos
```

If declined:

```text
todo: clear cancelled
```

## Model Tool Contract

### Tool name

`todo`

### Description

Manage the current pi session's SQL-backed todo list. Use this for routine task tracking; use `sql` only when custom queries or repair are needed.

### Input Shape

```ts
type TodoActionInput =
  | { action: "list"; view?: "open" | "all" | "done" | "blocked"; limit?: number }
  | { action: "add"; title: string; description?: string; priority?: number }
  | { action: "done"; id: number }
  | { action: "status"; id: number; status: "pending" | "in_progress" | "blocked" | "done"; reason?: string }
  | { action: "block"; id: number; reason?: string }
  | { action: "next"; limit?: number }
  | { action: "dep"; id: number; dependsOn: number }
  | { action: "clear"; confirm: true };
```

Implementation note: use TypeBox or equivalent existing extension pattern; no `any`.

### Tool Result Shape

```ts
type TodoToolDetails = {
  action: string;
  ok: boolean;
  message: string;
  todos?: TodoViewRow[];
  changed?: TodoViewRow;
  counts?: {
    open: number;
    done: number;
    blocked: number;
    total: number;
  };
};
```

### Tool Text Examples

```text
todo: added #4 pending — Update docs
```

```text
todo: 2 open
#1 pending p0  Write store tests
#4 pending p0  Update docs
```

```text
todo error: id #99 not found
```

## Error Contract

| Code | Message | Trigger | Recovery |
|------|---------|---------|----------|
| `TODO_EMPTY_TITLE` | `todo error: title is required` | `/todo add` without title | Provide title. |
| `TODO_BAD_ID` | `todo error: id must be a positive integer` | Non-numeric or <=0 id | Use id from `/todo list`. |
| `TODO_NOT_FOUND` | `todo error: id #N not found` | Missing row | Refresh list; inspect `/sql` if needed. |
| `TODO_BAD_STATUS` | `todo error: unknown status <x>` | Unsupported status | Use `pending`, `in_progress`, `blocked`, `done`. |
| `TODO_SELF_DEP` | `todo error: todo cannot depend on itself` | Same id/dependsOn | Choose a different dependency. |
| `TODO_DEP_EXISTS` | `todo: #A already depends on #B` | Duplicate edge | No action needed. |
| `TODO_CLEAR_CONFIRM` | `todo error: clear requires confirmation` | Tool clear without `confirm: true` | Ask user or call with confirm only if requested. |
| `TODO_SQL_ERROR` | `todo error: storage unavailable: <short reason>` | Store failure | Use `/sql status`; report issue. |

## Parser Rules

- Whitespace is trimmed and collapsed for command verbs.
- Titles preserve internal punctuation.
- Unknown subcommands show help, not stack traces.
- `limit <= 0` returns no rows, never all rows.
- Numeric ids are base-10 positive integers.
- Status aliases allowed for humans:
  - `start` command may map to `in_progress` if implemented.
  - `todo done <id>` maps to `status=done`.
  - Tool payloads should use canonical statuses only.

## Help Output

```text
todo commands:
  /todo                       list open todos
  /todo list [open|all|done|blocked]
  /todo add <title>
  /todo done <id>
  /todo status <id> <pending|in_progress|blocked|done>
  /todo block <id> [reason]
  /todo dep <id> <depends_on_id>
  /todo next
  /todo overlay
  /todo clear

Raw inspection: /sql SELECT * FROM todos;
```

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- Command verbs and tool actions are unambiguous.
- Every mutation has a compact success phrase and at least one error phrase.
- Smoke can assert stable anchors for empty, add, list, SQL agreement, reload, and overlay open.
- Architecture can map each action to store methods without inventing additional product behavior.

## Implementation Checklist

- [ ] Define `TodoActionInput` schema.
- [ ] Define `TodoViewRow` type shared by command/tool rendering.
- [ ] Implement command parser as pi-free helper if non-trivial.
- [ ] Implement formatter functions with stable anchors.
- [ ] Add store tests for all actions.
- [ ] Add smoke for `/todo`, `/todo add`, `/todo list`, `/sql` agreement, reload, and `/todo overlay`.
