# Workshop: Claude Code-style Below-editor Todo Strip

**Type**: CLI Flow / Integration Pattern / UI Contract  
**Plan**: 010-sql-backed-todo-extension  
**Spec**: [sql-backed-todo-extension-spec.md](../sql-backed-todo-extension-spec.md)  
**Created**: 2026-05-15  
**Status**: Draft

**Value Thesis**: This workshop makes the next todo-UX loop cheaper and safer by turning the ambiguous request “show open todo items under the text area like Claude Code” into a concrete pi widget contract: persistent below-editor placement, compact task rows, in-flight emphasis, completed strikethrough, refresh triggers, edge cases, and validation scenarios.  
**Target Proof Level**: Implementation Ready  
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **User Experience**: The todo state should be visible while the user is composing the next prompt, not hidden behind `/todo overlay` or raw `/sql` inspection.
- **Operator Usability**: Humans should be able to glance at the current work plan, see what is in flight, and see what just completed without interrupting the agent.
- **Implementation Readiness**: The workshop identifies the exact pi TUI primitive (`ctx.ui.setWidget(..., { placement: "belowEditor" })`) and the rendering contract needed to build the feature.
- **Safety to Change**: The widget must stay a projection over `todos` / `todo_deps`; it must not introduce second storage, hardcoded shortcuts, or inconsistent status semantics.
- **Review Compression**: Reviewers can check concrete layout examples, refresh rules, and smoke/unit scenarios instead of reconstructing the desired Claude-Code-like behavior.

**Related Documents**:
- [004-full-todo-ux-scope.md](./004-full-todo-ux-scope.md)
- [001-todo-command-and-model-action-contract.md](./001-todo-command-and-model-action-contract.md)
- [003-sql-backed-todo-data-contract.md](./003-sql-backed-todo-data-contract.md)
- [docs/how/todo.md](../../../how/todo.md)
- Pi TUI docs: `/Users/jordanknight/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md` § “Widgets Above/Below Editor”
- Claude Code todo tracking docs: <https://code.claude.com/docs/en/agent-sdk/todo-tracking>

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface`
- **Related Domains**: `session-work-state`, `extension-authoring-harness`

---

## Purpose

Clarify the design for a persistent below-editor todo strip that mirrors the Claude Code task-list feel: show the current list of tasks, visually mark the task in flight, and strike through completed tasks while work remains.

This workshop should let a fresh implementer add the feature without re-researching Claude Code behavior, pi TUI placement APIs, todo status semantics, or validation strategy.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Implement a below-editor widget using the existing `todo` SQL source of truth.
- Render rows consistently for `pending`, `in_progress`, `blocked`, and `done` statuses.
- Decide when the widget appears, refreshes, truncates, and clears.
- Validate the behavior with store/formatter tests plus deterministic smoke anchors.
- Review the feature against domain boundaries and known TUI gotchas.

## Key Questions Addressed

- What should “like Claude Code” mean for pij without cloning an undocumented private UI?
- Which pi TUI primitive should render content under the text area?
- Should the widget show only open todos, or also completed todos with strikethrough?
- How is “in flight” represented when the data model permits multiple `in_progress` rows?
- What refresh triggers keep the widget in sync with `/todo`, the model `todo` tool, and `/sql` edits?
- What should tests and smoke prove?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | The next loop should be able to build from this without asking where to render, what to show, or how to validate. |
| Primary Value Axis | Operator Usability | The feature exists to make work state visible at the exact point where humans steer the agent: near the input editor. |
| Supporting Value Axes | User Experience, Implementation Readiness, Safety to Change, Review Compression | These shape layout, API use, source-of-truth rules, and objective review checks. |
| Downstream Loop Improved | Implementation / Review / Testing | Implementation gets a concrete contract; review gets a checklist; testing gets explicit scenarios. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Pi supports below-editor widgets | `docs/tui.md` Pattern 5 and `examples/extensions/widget-placement.ts` | Placement decision | Ready |
| Existing todo source of truth | `.pi/extensions/todo/store.ts`, `docs/how/todo.md` | Data projection and status vocabulary | Ready |
| Existing minimal overlay/status UX | Workshop 004 and `.pi/extensions/todo/index.ts` | Composition with current UX | Ready |
| Claude Code todo data model | Claude Code todo tracking docs | Status lifecycle and task-list rationale | Ready |
| Claude-like public UI hint | Perplexity search result for Japanese article showing active line with `ctrl+t to show todos` | Inspiration, not binding contract | Draft |
| Strikethrough rendering precedent | Pi `plan-mode` example uses `theme.strikethrough(item.text)` in widgets | Completed-row visual contract | Ready |
| Widget smoke feasibility | Driver can assert stable visible text, but ANSI strikethrough itself should be unit-tested | Validation plan | Draft |

---

## Research Summary: What “Claude Code-like” Means Here

Perplexity found official Claude docs for todo tracking, but not a canonical public screenshot/spec for exact terminal placement. The docs confirm:

- todos are used for complex multi-step work;
- statuses include `pending`, `in_progress`, and `completed`;
- examples render status icons such as completed / in-progress / pending;
- progress summaries show completed count and active work.

A public article snippet describes the familiar live Claude Code task status line like:

```text
<active task>… (esc to interrupt・ctrl+t to show todos・8s・↓ 215 tokens)
```

The user clarified the intended behavior more concretely:

> it shows a list of tasks, shows which one is in flight, and if completed they get struck out.

Therefore this workshop treats “Claude Code-style” as a product target with these binding behaviors for pij:

1. A compact task list is visible near the input editor.
2. The in-flight task is visually distinct.
3. Completed tasks remain visible while the plan is still active and are struck through.
4. A shortcut or command can open the fuller todo overlay/details.
5. The design remains SQL-backed and pi-native rather than copying Claude internals.

---

## Current pi Capability

Pi already has the exact primitive needed for “under the text area”:

```ts
ctx.ui.setWidget("todo-strip", lines, { placement: "belowEditor" });
ctx.ui.setWidget("todo-strip", undefined); // clear
```

From Pi TUI docs:

- `setWidget(key, string[] | componentFactory | undefined, options?)`
- `placement` can be `"aboveEditor"` or `"belowEditor"`
- component factories receive `(tui, theme)` and can return a `Component`
- widgets are persistent content, unlike overlays which take focus

This is a better fit than the current `/todo overlay` for always-visible progress because:

| Primitive | Fit for this request | Why |
|-----------|----------------------|-----|
| `ctx.ui.setWidget(..., { placement: "belowEditor" })` | Selected | Persistent, exactly below input editor, does not steal focus. |
| `ctx.ui.custom(..., { overlay: true })` | Keep for full details | Focused popover; good for navigation/mutation, not always-visible. |
| `ctx.ui.setStatus(...)` | Keep as summary | Too small for list rows and strikethrough. |
| `ctx.ui.setFooter(...)` | Rejected for v1 | More invasive; risks replacing unrelated footer functionality. |
| Custom editor | Rejected | Overkill; could break core input/keybindings. |

---

## UX Contract

### Placement

Render the compact todo strip **below the editor**.

```text
┌──────────────────────────────── chat transcript ───────────────────────────────┐
│ ... assistant/user messages ...                                                │
├──────────────────────────────── input editor ──────────────────────────────────┤
│ > implement the next task                                                       │
├────────────────────────────── todo strip widget ────────────────────────────────┤
│ Todos 1/4 done · 3 open · details: ctrl+shift+y                                 │
│ ▶ #8 Implement below-editor widget                                              │
│ ○ #9 Write widget smoke                                                         │
│ ⛔ #10 Resolve shortcut collision                                                │
│ ✓ #7 Research Claude Code todo UI                                               │
└──────────────────────────────── footer/status ─────────────────────────────────┘
```

The exact border lines above are illustrative. The v1 widget should prefer compact unboxed lines unless the default TUI rendering already separates widgets visually.

### Compact default layout

Recommended default when there is active work:

```text
Todos 1/4 done · 3 open · details: ctrl+shift+y
▶ #8 Implement below-editor widget
○ #9 Write widget smoke
⛔ #10 Resolve shortcut collision
✓ #7 Research Claude Code todo UI
```

Rules:

1. First line is a summary.
2. In-flight rows appear first and use `▶`.
3. Pending rows use `○`.
4. Blocked rows use `⛔` and may include a short reason if available.
5. Completed rows use `✓` and strikethrough text when the theme supports it.
6. The strip shows a **small recency window**, not the full todo list: default 4 task rows plus summary/overflow.
7. All lines must pass through `truncateToWidth()` or equivalent.
8. The shortcut hint must be derived from `DEFAULT_TODO_KEYBINDINGS.openOverlay` or widget paging bindings, not hardcoded.

### Strikethrough completed rows

Use `theme.strikethrough(row.title)` for completed titles in component rendering, mirroring the pi `plan-mode` example.

Visual target:

```text
✓ #7 Research Claude Code todo UI   // title struck through in terminal
```

Test target:

- Unit test the pure row builder includes completed rows while open work remains.
- If testing theme application directly, use a fake theme whose `strikethrough(s)` returns `~~${s}~~`.
- Smoke should assert the completed title remains visible; do not require exact ANSI escape sequences.

### In-flight rows

`in_progress` means “in flight.”

Recommended display:

```text
▶ #12 Writing implementation plan
```

If multiple rows are `in_progress`, do **not** crash or enforce a database-level uniqueness rule in this UI feature. Instead:

```text
Todos 0/4 done · 4 open · 2 in flight
▶ #12 Writing implementation plan
▶ #13 Running smoke validation
○ #14 Update docs
○ #15 Commit changes
```

Model/operator guidance can encourage one `in_progress` task at a time, but the SQL schema should remain permissive.

### Completed-row retention

To match the clarified Claude-Code-like behavior, completed tasks should remain visible **while the task group still has open work**.

Because the current schema has no explicit “task group,” use this v1 projection:

| State | Widget behavior |
|-------|-----------------|
| No todos | Clear widget. |
| Some open todos | Show the most recently active/modified open todos plus recent completed todos, capped by `maxRows`. |
| All todos done | Clear widget by default after refresh; `/todo list all` remains the history view. |
| All todos done and just completed | Optional one-turn flash/notification: `todo: all tasks complete`. Do not keep a permanent completed-only widget in v1. |

Why not show all done rows forever? Because the widget is near the input editor and should represent live work, not become a persistent archive.

### Recency window, row cap, and overflow

Default cap: **4 task rows** plus one summary line. The widget must not try to show all 10+ tasks near the prompt.

Why 4? It is large enough to show the current in-flight item, the next couple of active/recent items, and one recently completed item, while preserving vertical space for the editor and transcript.

Overflow line when paging shortcuts are configured:

```text
… +6 more · page 1/3 · more: ctrl+shift+] · details: ctrl+shift+y
```

`ctrl+shift+]` is illustrative; implementation must read the actual configured paging binding.

If paging shortcuts are not configured, fall back to:

```text
… +6 more · details: ctrl+shift+y
```

Row selection before cap is a **recent-activity projection**, not a full list:

1. `in_progress` rows first — these are “in flight”.
2. then recently modified open rows (`pending` and `blocked`), sorted by `updated_at DESC`.
3. then recently completed rows, sorted by `updated_at DESC`, only while open work remains.
4. priority desc only as a tie-break inside the same status/updated timestamp bucket.
5. `id DESC` as the final tie-break so newly inserted SQL rows are predictable.

This intentionally differs from `/todo next` readiness ordering because the widget is a **progress/recent-activity display**, not a scheduler. `/todo next` answers “what should I work on?”; the strip answers “what is currently happening or just changed?”

### Paging behavior

Paging is optional but should be designed now so the row cap does not become frustrating.

| Behavior | Contract |
|----------|----------|
| Page size | Same as `maxRows`, default 4 task rows. |
| Page state | Kept in extension memory, not SQL. It is a view preference, not task state. |
| Page reset | Reset to page 0 whenever a todo is added, marked in progress, blocked, done, cleared, or when `updated_at` ordering changes materially. |
| Next/previous page | Registered shortcuts only if configured; never hardcode keys. |
| Overflow text | Shows hidden count and page indicator when there are more rows than fit. |
| Overlay relationship | `/todo overlay` remains the full navigable list; paging the strip is only a quick glance affordance. |

Suggested keybinding shape:

```ts
export const DEFAULT_TODO_KEYBINDINGS = {
  openOverlay: ["ctrl+shift+y"],
  widgetNextPage: [],        // intentionally unset until collision review
  widgetPreviousPage: [],    // intentionally unset until collision review
  closeOverlay: ["escape", "q"],
  refresh: ["r"],
  markDone: ["d"],
  selectPrevious: ["up"],
  selectNext: ["down"],
} as const;
```

If product review wants default paging keys, choose them through the normal configurable keybinding path and update the hint from those constants.

---

## Data Projection Contract

The widget is a read-only projection over existing SQL-backed todo state.

```mermaid
flowchart LR
    DB[(session SQL todos/todo_deps)] --> Store[TodoSqlStore]
    Store --> Projection[Todo widget projection]
    Projection --> Widget[ctx.ui.setWidget belowEditor]
    Store --> Overlay[/todo overlay]
    Store --> Command[/todo]
    Store --> Tool[todo tool]
```

### Required projection fields

The widget renderer needs only fields already present in `TodoViewRow`:

```ts
interface TodoWidgetRow {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "blocked" | "done";
  priority: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}
```

No new SQL tables or columns are required.

### Suggested store API

Add a pi-free projection helper in `.pi/extensions/todo/store.ts`:

```ts
export interface TodoWidgetOptions {
  maxRows?: number;
  page?: number;
  includeCompletedWhileOpen?: boolean;
}

export interface TodoWidgetSnapshot {
  total: number;
  open: number;
  done: number;
  inProgress: number;
  rows: TodoViewRow[];
  hidden: number;
  page: number;
  pageCount: number;
}

export function formatTodoWidgetSummary(snapshot: TodoWidgetSnapshot): string;
export function formatTodoWidgetRow(row: TodoViewRow): string;
```

Then `index.ts` applies theme and placement:

```ts
function refreshTodoWidget(ctx: ExtensionContext): void {
  const snapshot = todoStore.widgetSnapshot(DEFAULT_TODO_WIDGET_OPTIONS);
  if (!snapshot.ok || snapshot.value.open === 0) {
    ctx.ui.setWidget(TODO_WIDGET_KEY, undefined);
    return;
  }

  ctx.ui.setWidget(
    TODO_WIDGET_KEY,
    (_tui, theme) => new TodoStripWidget(snapshot.value, theme, DEFAULT_TODO_KEYBINDINGS),
    { placement: "belowEditor" },
  );
}
```

This keeps SQL/query/projection logic testable in the pi-free store and TUI theming in `index.ts`.

---

## Refresh and Lifecycle Contract

### Required refresh points

| Trigger | Required Action | Rationale |
|---------|-----------------|-----------|
| `session_start` | Open store, refresh status, refresh widget | Show existing same-session todos after reload/resume. |
| `session_shutdown` | Close store, clear status, clear widget | Avoid stale UI after reload/session replacement. |
| `/todo` command mutation | Refresh status and widget | Human-facing changes should be immediate. |
| `todo` model tool mutation | Refresh status and widget | Agent-facing changes should be immediate. |
| `/todo list` / `/todo next` | Refresh widget | Read commands can repair stale projection. |
| `/todo clear` confirmed | Clear status and widget | Destructive action should remove visible stale rows. |
| `turn_end` | Refresh widget | Cheap safety net after multi-tool turns. |

### Raw `/sql` changes

The hardest synchronization case is raw SQL modifying `todos` through the `sql` tool or `/sql` command.

Decision space:

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A. Todo-only refresh | Refresh only after `/todo` and `todo` tool | Smallest change | `/sql INSERT INTO todos...` may not update widget immediately | Rejected as final behavior; acceptable only as first spike. |
| B. Turn-end refresh fallback | Refresh at `turn_end` regardless of tool source | No session-sql changes | Human `/sql` command while idle may still be stale until next turn/command | Selected as baseline safety net. |
| C. Session-sql event bus | `session-sql` emits `session-sql:changed` after successful mutating/reset command/tool; todo listens and refreshes | Immediate cross-extension sync; explicit contract | Requires narrow session-sql wiring change | Preferred final design. |
| D. Polling timer | Refresh every N seconds | Eventually consistent | Wasteful/noisy; hard to test | Rejected. |

Recommended implementation path:

1. Add widget refresh after all todo command/tool operations.
2. Add `turn_end` refresh as a low-cost fallback.
3. Add an explicit `session-sql:changed` event if raw SQL reactivity is required in the same implementation pass.

Suggested event:

```ts
pi.events.emit("session-sql:changed", {
  source: "tool" | "command" | "reset",
  sessionId,
});
```

Todo listener:

```ts
pi.events.on("session-sql:changed", (data) => {
  if (!currentCtx) return;
  if ((data as { sessionId?: string }).sessionId !== currentSessionId) return;
  refreshTodoWidget(currentCtx);
});
```

---

## Rendering Contract

### Summary line

Use one of these exact stable text shapes:

```text
Todos 0/0 done · no open work
Todos 0/3 done · 3 open · details: ctrl+shift+y
Todos 1/4 done · 3 open · 1 in flight · details: ctrl+shift+y
Todos 2/5 done · 2 open · 1 blocked · details: ctrl+shift+y
```

Notes:

- `done/total` includes done rows and open rows.
- `open` counts `pending`, `in_progress`, and `blocked`.
- `details:` uses the configured open-overlay shortcut.
- If no shortcut is registered/configured, use `details: /todo overlay`.

### Row line

Base row format:

```text
<marker> #<id> <title>
```

Status variants:

```text
▶ #12 Implement below-editor widget
○ #13 Add unit tests
⛔ #14 Fix smoke flake — blocked: waiting for API decision
✓ #11 Research Claude Code UI
```

Optional priority display if priority is non-zero:

```text
▶ #12 p2 Implement below-editor widget
```

Do not display status words in the compact default; symbols and ordering carry the meaning. The overlay and `/todo list` can remain more explicit.

### Width behavior

Every rendered line must respect the `width` argument.

Implementation rule:

```ts
render(width: number): string[] {
  return this.lines.map((line) => truncateToWidth(line, width));
}
```

For ANSI-themed lines, use pi TUI width helpers rather than raw `.slice()`.

### Color/theme recommendations

| Status | Marker | Theme |
|--------|--------|-------|
| `in_progress` | `▶` | `theme.fg("accent", text)` or accent marker + normal text |
| `pending` | `○` | normal text with dim marker |
| `blocked` | `⛔` | `theme.fg("warning", marker)` plus dim reason |
| `done` | `✓` | `theme.fg("success", marker)` plus `theme.fg("muted", theme.strikethrough(title))` |

Do not bake theme colors in store-level functions. The store can return unstyled row parts; `index.ts` / widget component applies theme.

---

## Interaction Contract

The below-editor widget is **not focused** and should not handle direct key input. It is glanceable status, not an overlay.

User actions stay where they already belong:

| Need | Surface |
|------|---------|
| Add task | `/todo add ...` or `todo` tool |
| Mark done | `/todo done <id>`, `todo` tool, or focused overlay `d` key |
| Change status | `/todo status ...` or `todo` tool |
| Inspect full list | `/todo list all` |
| Navigate/select | `/todo overlay` |
| Page compact strip | Optional configurable global shortcut, if enabled |
| Raw repair | `/sql ...` |

The widget itself avoids focus/keybinding conflicts and keeps the editor active. Paging, if enabled, is handled by registered configurable shortcuts that only change the widget page offset and re-render.

### Shortcut hint

The widget may show the overlay shortcut, but must not hardcode `ctrl+t`.

Current default from Plan 010 implementation:

```text
ctrl+shift+y
```

Why not `ctrl+t`? Core pi reserves it, and project rules prohibit hardcoded keybindings. If the configured default changes, the widget hint changes with it.

---

## State Examples

### Empty state

No widget.

Footer/status also clears:

```ts
ctx.ui.setStatus("todo", undefined);
ctx.ui.setWidget("todo-strip", undefined);
```

### New plan with three tasks

Commands:

```text
/todo add Research widget API
/todo add Implement widget
/todo add Add smoke
/todo status 1 in_progress
```

Widget:

```text
Todos 0/3 done · 3 open · 1 in flight · details: ctrl+shift+y
▶ #1 Research widget API
○ #2 Implement widget
○ #3 Add smoke
```

### First task completed, second in flight

Commands:

```text
/todo done 1
/todo status 2 in_progress
```

Widget:

```text
Todos 1/3 done · 2 open · 1 in flight · details: ctrl+shift+y
▶ #2 Implement widget
○ #3 Add smoke
✓ #1 Research widget API
```

The completed row remains visible and struck through because open work remains.

### Blocked task

Commands:

```text
/todo block 3 waiting for Driver SDK anchor decision
```

Widget:

```text
Todos 1/3 done · 2 open · 1 in flight · 1 blocked · details: ctrl+shift+y
▶ #2 Implement widget
⛔ #3 Add smoke — waiting for Driver SDK anchor decision
✓ #1 Research widget API
```

### All tasks complete

Commands:

```text
/todo done 2
/todo done 3
```

Widget clears by default.

Optional notification:

```text
todo: all tasks complete
```

History remains available:

```text
/todo list all
```

---

## Implementation Sketch

### Files touched

| File | Change |
|------|--------|
| `.pi/extensions/todo/store.ts` | Add widget snapshot/projection helpers and constants. |
| `.pi/extensions/todo/index.ts` | Add `TodoStripWidget`, `refreshTodoWidget`, lifecycle refresh/clear, and optional event listener. |
| `.pi/extensions/todo/store.test.ts` | Add projection/ordering/visibility tests. |
| `.pi/extensions/todo/smoke.ts` | Add below-editor widget anchors if deterministic. |
| `docs/how/todo.md` | Document below-editor widget, completed strikethrough, and shortcut hint. |
| `docs/difficulties.md` | Log any widget/smoke/API friction. |

### Constants

```ts
export const TODO_WIDGET_KEY = "todo-strip";

export const DEFAULT_TODO_WIDGET_OPTIONS = {
  enabled: true,
  placement: "belowEditor",
  maxRows: 4,
  includeCompletedWhileOpen: true,
} as const;
```

### Store projection pseudo-code

```ts
widgetSnapshot(options = DEFAULT_TODO_WIDGET_OPTIONS): TodoStoreResult<TodoWidgetSnapshot> {
  const counts = this.counts();
  if (!counts.ok) return counts;

  if (counts.value.open === 0) {
    return todoOk({ ...counts.value, rows: [], hidden: 0 }, "todo widget: hidden");
  }

  const rows = this.executeWidgetQuery({ maxRows: options.maxRows, page: options.page });
  return todoOk({
    total: counts.value.total,
    open: counts.value.open,
    done: counts.value.done,
    inProgress: counts.value.inProgress,
    rows: rows.visible,
    hidden: rows.hidden,
  }, "todo widget: ok");
}
```

### Widget component pseudo-code

```ts
class TodoStripWidget implements Component {
  constructor(
    private readonly snapshot: TodoWidgetSnapshot,
    private readonly theme: Theme,
    private readonly shortcutHint: string,
  ) {}

  render(width: number): string[] {
    const lines = [
      this.summaryLine(),
      ...this.snapshot.rows.map((row) => this.rowLine(row)),
    ];
    if (this.snapshot.hidden > 0) {
      lines.push(this.overflowLine());
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}
}
```

### Index refresh pseudo-code

```ts
function refreshTodoPresentation(ctx: ExtensionContext): void {
  refreshStatus(ctx);
  refreshTodoWidget(ctx);
}
```

Call `refreshTodoPresentation(ctx)` anywhere the current code calls `refreshStatus(ctx)` after todo-visible state might have changed.

---

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Status pill only | Keep current `todo: N open` footer status | Already implemented | Does not show task list, in-flight item, or completed strikethrough | Rejected. |
| Overlay only | Rely on `/todo overlay` and shortcut | Already implemented; interactive | Hidden until opened; steals focus | Rejected as answer to this request, kept as detail surface. |
| Above-editor widget | Render task list above input | Supported by pi | User asked under text area; less Claude-like | Rejected. |
| Below-editor widget | Render compact recent-activity task strip below input | Exact pi API support; matches request; non-invasive | Needs refresh/overflow/paging policy | Selected. |
| Custom footer | Replace footer with task list | Always visible | High collision risk with core/footer statuses | Rejected. |
| Custom editor | Embed task list in input component | Maximum control | Too invasive and unsafe | Rejected. |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Infer whether to use overlay, footer, custom editor, or widget. | Use `ctx.ui.setWidget("todo-strip", ..., { placement: "belowEditor" })`. |
| Review | Debate what “Claude-like” means. | Check list visibility, in-flight marker, completed strikethrough, source-of-truth rules, and refresh triggers. |
| Testing | Invent examples from scratch. | Use the state examples plus recency/window/paging validation matrix below. |
| Agent execution | Ask whether to show done tasks or only open tasks. | Show completed rows while open work remains; clear when all done. |
| Cross-domain coordination | Guess whether session-sql must change. | Event-bus sync is preferred but explicitly separable from baseline todo refresh. |

---

## Validation / Acceptance

This workshop reaches **Implementation Ready** when:

- The below-editor widget contract is accepted as the target surface.
- Store projection helpers and index rendering responsibilities are clear.
- Refresh triggers cover todo command/tool operations and same-session reload.
- `/sql` mutation synchronization is either implemented with an event or documented as eventually refreshed by `turn_end` / next `/todo` action.
- Tests cover projection ordering, completed-row retention, 4-row cap, overflow/paging, empty/all-done clearing, and invalid/long titles.
- Smoke asserts stable visible anchors without depending on raw ANSI strikethrough bytes.

### Unit test matrix

| Case | Setup | Expected |
|------|-------|----------|
| Empty DB | no todos | snapshot open `0`, widget cleared. |
| Pending only | 3 pending | summary `0/3 done · 3 open`; rows use `○`. |
| In progress | 1 in_progress, 2 pending | in_progress row first with `▶`; summary says `1 in flight`. |
| Multiple in progress | 2 in_progress | both render; summary says `2 in flight`; no crash. |
| Completed while open | 1 done, 2 open | done row included and marked completed. |
| All done | 3 done, 0 open | widget clears by default. |
| Blocked | blocked with reason | row uses blocked marker and truncated reason. |
| Overflow | 10 rows, maxRows 4 | 4 rows + `… +6 more`. |
| Recency window | 10 todos with old open rows and 4 recently modified rows | Only the 4 active/recently modified rows render on page 1. |
| Paging | 10 rows, maxRows 4, page 1 | rows 5-8 render; page indicator says `page 2/3`. |
| Long title | title > width | rendered line truncates to width. |
| SQL-created row | row inserted through `/sql` shape | normalized and rendered; no crash. |

### Smoke scenario sketch

```text
/todo clear                         # confirm if deterministic, or use unique titles
/todo add Widget research
/todo add Widget implementation
/todo add Widget smoke
/todo status 1 in_progress
# expect: Todos 0/3 done
# expect: Widget research
# expect: Widget implementation

/todo done 1
/todo status 2 in_progress
# expect: Todos 1/3 done
# expect: Widget research        # completed row still visible
# expect: Widget implementation  # in-flight row visible

/reload
# expect widget returns with Widget implementation
```

If Driver SDK cannot reliably observe below-editor widget lines, keep smoke to command-visible behavior and validate widget rendering through unit tests plus a narrower manual smoke note.

---

## Open Questions

### Q1: Should completed-only history remain below the editor?

**RESOLVED for v1**: No. Clear the widget when `open === 0`. Use `/todo list all` for history.

Rationale: The below-editor region is live steering UI. Keeping all done tasks forever creates clutter near the prompt.

### Q2: Should the widget mutate tasks directly?

**RESOLVED for v1**: No. The widget is glanceable, non-focused UI. Use `/todo overlay` for interactive selection and `/todo` / tool for mutation.

### Q3: Is `ctrl+t` required because Claude Code uses it?

**RESOLVED**: No. The hint must use pij's configured overlay shortcut. Current default is `ctrl+shift+y`; `ctrl+t` is reserved by core pi and must not be hardcoded.

### Q4: Should `in_progress` be unique?

**RESOLVED for v1**: No DB constraint. Render multiple safely, but encourage one current task in agent/operator guidance.

### Q5: Should raw `/sql` edits update the widget immediately?

**OPEN / preferred direction**: Prefer a small `session-sql:changed` event for immediate sync. If not implemented in the same pass, add `turn_end` and `/todo` refresh fallback and document the limitation.

### Q6: Should compact-strip paging have default shortcut keys?

**OPEN / preferred direction**: Design for paging, but leave default paging bindings unset until a collision review. If defaults are added, they must live in `DEFAULT_TODO_KEYBINDINGS` and the widget hint must derive from that config. `/todo overlay` remains the guaranteed full-list path.

---

## Quick Reference

Implementation target:

```ts
ctx.ui.setWidget("todo-strip", widgetFactory, { placement: "belowEditor" });
ctx.ui.setWidget("todo-strip", undefined);
```

Visual target:

```text
Todos 1/10 done · 9 open · 1 in flight · details: ctrl+shift+y
▶ #8 Implement below-editor widget
○ #9 Write widget smoke
⛔ #10 Resolve shortcut collision
✓ #7 Research Claude Code todo UI
… +6 more · details: ctrl+shift+y
```

Do:

- Use existing SQL-backed `TodoSqlStore`.
- Show only the compact recency window, default 4 task rows.
- Show in-flight rows first, then recently modified rows.
- Include recently completed struck-through rows while open work remains.
- Clear widget at zero open todos.
- Derive shortcut and paging hints from configured defaults.
- Truncate every line to width.

Do not:

- Create a second todo store.
- Hardcode `ctrl+t`.
- Replace the footer or editor for this feature.
- Make ANSI strikethrough bytes a smoke-test dependency.
