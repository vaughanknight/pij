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

## Repo-targeted writes (optional `db` param)

The `sql` tool accepts an optional `db: <path>` parameter that targets any
`.sqlite` file inside the current git repo. Use it for structured data you
want to commit and share across machines.

- Path is resolved relative to cwd (or absolute) and must canonicalise to a
  location inside the git root. Paths outside the repo, and any path whose
  segments include `.git`, are refused (`outside_repo` / `git_internal`).
- Symlinks that escape the repo are also refused (we readlink manually so
  missing-target symlinks don't slip through `realpathSync`).
- Repo-targeted calls open → execute → close per call. No long-lived
  connection, no `-wal`/`-shm` sidecars left behind → git operations
  (commit, checkout, branch-switch) never see a held file handle.
- No default schema is bootstrapped on repo DBs — the agent owns the schema.
- Native SQLite extension loading is **not** enabled on repo DBs; if you
  need it, use the session DB.
- The git root is detected once at `session_start` from `process.cwd()`. If
  pi was not launched inside a git repo, the `db` param is refused with a
  clear error. Restart pi if you `cd` to a different repo.
