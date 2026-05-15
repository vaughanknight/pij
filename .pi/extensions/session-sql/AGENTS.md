# session-sql

Session-scoped SQLite workbench extension.

## Boundaries

- `store.ts` owns SQLite paths, schema, execution, caps, reset, and tagged results.
- `index.ts` owns pi lifecycle, UI status/notify, the `sql` tool, and `/sql` command formatting.
- `store.ts` must remain pi-free: no imports from `@earendil-works/*`.
- Tests target the store with real temp SQLite/filesystem fixtures.

## Acceptance for v1

- [ ] `npm test -- .pi/extensions/session-sql/store.test.ts` passes
- [ ] `npm run typecheck` passes
- [ ] `cd pij && pi` loads without error; `/sql status` reports ready
- [ ] `npm run smoke -- session-sql` passes
- [ ] Difficulties and magic-wand feedback are recorded when friction appears

## Notes

- DB files live under `~/.pi/db/session-sql/`, outside the repo.
- Same-session state survives reload/resume; new/forked sessions start with a fresh DB.
- SQL is trusted and unrestricted, but returned previews cap at 200 rows.
