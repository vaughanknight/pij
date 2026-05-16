# SQL-backed todos

`todo` is the ergonomic task UX over the current session SQL DB. Use it for routine current-session work tracking; use `/sql` when you need raw inspection or repair.

## Quick start

```text
/todo
/todo add Write store tests
/todo next
/todo done 1
/todo list all
```

Todos are stored in the same session-scoped SQLite DB as `session-sql`:

```text
/sql SELECT id, title, status, priority FROM todos ORDER BY id;
```

## Commands

| Command | Meaning |
|---------|---------|
| `/todo` | List open todos. |
| `/todo list [open|all|done|blocked] [limit]` | List todos by view. |
| `/todo add <title>` | Add a pending todo. |
| `/todo done <id>` | Mark a todo done. |
| `/todo delete <id>` | Delete one todo row by id; dependency edges are removed by SQLite cascade. |
| `/todo prune done` | Delete completed todos while leaving open work intact. |
| `/todo status <id> <pending|in_progress|blocked|done> [reason]` | Set lifecycle status. |
| `/todo block <id> [reason]` | Mark blocked; reason becomes the description. |
| `/todo dep <id> <depends_on_id>` | Add a dependency edge. |
| `/todo next [limit]` | Show ready todos. |
| `/todo overlay` | Open the minimal interactive overlay. |
| `/todo clear` | Confirm, then delete todo rows for this session. |

## Model tool

The model-facing tool is named `todo`.

Actions:

- `list` — `{ action: "list", view?: "open" | "all" | "done" | "blocked", limit?: number }`
- `add` — `{ action: "add", title: string, description?: string, priority?: number }`
- `done` — `{ action: "done", id: number }`
- `delete` — `{ action: "delete", id: number }`
- `prune` — `{ action: "prune", target: "done" }`
- `status` — `{ action: "status", id: number, status: "pending" | "in_progress" | "blocked" | "done", reason?: string }`
- `block` — `{ action: "block", id: number, reason?: string }`
- `next` — `{ action: "next", limit?: number }`
- `dep` — `{ action: "dep", id: number, dependsOn: number }`
- `clear` — `{ action: "clear", confirm: true }`

Use `done` first for completed work, then `prune` with `target: "done"` when the completed list should be physically tidied. Use `delete` only for precise item removal. `clear` intentionally requires `confirm: true` so routine model use cannot accidentally delete all work.

## Status and ordering

Statuses are exactly:

- `pending`
- `in_progress`
- `blocked`
- `done`

Open count includes `pending`, `in_progress`, and `blocked`. Done todos are not open. The footer/status pill shows `todo: N open` when open work exists and clears with `undefined` when there are zero open todos.

`/todo next` returns ready todos only:

1. status is `pending` or `in_progress`;
2. every dependency is `done`.

Ordering is deterministic:

1. `in_progress` before `pending`;
2. higher `priority` first;
3. older `created_at` first;
4. lower `id` last as a tie-break.

## Dependencies

```text
/todo add Write tests
/todo add Implement command
/todo dep 2 1
/todo next
```

Until `#1` is done, `#2` is dependency-blocked. After:

```text
/todo done 1
/todo next
```

`#2` becomes ready.

Rules:

- self-dependencies are rejected;
- missing todo ids are rejected;
- duplicate edges are a no-op success;
- larger cycles are not detected in v1, but `/todo next` will show `todo: no ready todos` when open work is blocked by status or dependencies.

## Overlay and shortcuts

Open the overlay with:

```text
/todo overlay
```

The overlay renders the same SQL-backed open todos as `/todo list`. It supports selection, refresh, close, and marking the selected todo done. Defaults live in `DEFAULT_TODO_KEYBINDINGS` in `.pi/extensions/todo/store.ts`.

The extension also renders a compact below-editor todo strip while open work exists. It is a read-only recent-activity view near the text area, not a full task manager:

```text
Todos 1/6 done · 5 open · 1 in flight · details: ctrl+shift+y
▶ #8 Implement below-editor widget
○ #9 Write widget smoke
⛔ #10 Resolve shortcut collision — waiting on API decision
✓ #7 Research Claude Code todo UI
… +2 more · details: ctrl+shift+y
```

Strip rules:

- shows at most four task rows by default;
- puts `in_progress` rows first with `▶`;
- shows recently modified pending/blocked rows next;
- keeps recently completed rows visible with strikethrough while open work remains;
- clears when there are zero open todos;
- uses `/todo overlay` for the full interactive list.

Current defaults:

| Action | Default |
|--------|---------|
| Open overlay | `ctrl+shift+y` |
| Compact strip next/previous page | unset by default |
| Close overlay | `escape`, `q` |
| Refresh | `r` |
| Mark selected done | `d` |
| Select previous/next | `up`, `down` |

`ctrl+t` is intentionally not used because core pi already reserves it.

## SQL agreement

A todo added through `/todo` is visible through `/sql`:

```text
/todo add Update docs
/sql SELECT id, title, status FROM todos WHERE title = 'Update docs';
```

A supported row added through `/sql` is visible through `/todo`:

```text
/sql INSERT INTO todos(title, status, priority) VALUES ('SQL row', 'pending', 0);
/todo list all
```

Use `/sql schema` to inspect the canonical tables. Use `/todo delete <id>` to remove one row, `/todo prune done` to delete completed rows, `/todo clear` to delete all todo rows only, and `/sql reset` to reset the full session SQL DB.

## Session semantics

Todo state is scoped to the current pi session because it uses the `session-sql` DB path:

- same-session `/reload` and resume keep rows;
- new/forked sessions get independent DBs;
- DB files live under `~/.pi/db/session-sql/`, not in the repo.

## Validation

```bash
npm test -- .pi/extensions/todo/store.test.ts
npm run smoke -- todo
npm run self-check
```
