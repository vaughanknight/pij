# todo extension

SQL-backed current-session todo UX for humans and agents.

## Boundaries

- `store.ts` stays pi-free and imports no `@earendil-works/*` packages.
- Todo state lives only in the session SQL `todos` and `todo_deps` tables.
- Do not add `.pi/todos.json`, markdown todo files, replayed tool-result storage, or a second SQLite DB.
- Routine mutations must use `TodoSqlStore` tagged-union results; command/tool wiring formats those results.
- Keep dependencies-only scope for v1: no assignees, tags, categories, due dates, or `workon` autoprompt.
- Shortcut/key defaults live in `DEFAULT_TODO_KEYBINDINGS`; do not inline key literals in handlers.

## Validation

- `npm test -- .pi/extensions/todo/store.test.ts`
- `npm run smoke -- todo`
- `npm run typecheck`
- Final phase validation also runs `npm run lint`, `npm test`, and `npm run self-check`.

## UX anchors

- Empty: `todo: no open todos`
- Add: `todo: added #N pending — <title>`
- Delete: `todo: deleted #N — <title>`
- Prune completed: `todo: pruned N done todos`
- List: `todo: N open`
- Next empty with blockers: `todo: no ready todos`
- SQL agreement: `/sql SELECT * FROM todos;`
- Overlay: `/todo overlay`
