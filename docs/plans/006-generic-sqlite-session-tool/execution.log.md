# Execution Log: Generic SQLite Session Tool

## 2026-05-15 — Pre-phase harness validation

| Check | Command / Method | Result | Evidence |
|-------|------------------|--------|----------|
| Boot/Observe | `npm run self-check` | failed initially | `npm run lint` found an existing Biome formatting error in `harness/scripts/packages.ts`. |
| Human override | ask-user clarification | fix and continue | User selected “Fix & continue (Recommended)”. |
| Harness repair | precise edit to `harness/scripts/packages.ts` | fixed | Collapsed one long `console.error` call to Biome-preferred formatting. |
| Boot/Observe retry | `npm run self-check` | passed | typecheck ✅; lint ✅ with existing Biome schema info; tests ✅ 24 passed / 2 skipped; smoke ✅ no scenarios. |

## Discoveries & Learnings

| ID | Task | Discovery | Impact | Follow-up |
|----|------|-----------|--------|-----------|
| DL-001 | pre-phase | Pre-phase self-check exposed pre-existing formatting drift in `harness/scripts/packages.ts`. | Harness validation can be blocked by unrelated local drift; the ask-user gate worked. | Keep the repair in scope because user approved fixing before implementation. |
| DL-002 | T001 | No `docs/domains/` registry existed, so Plan 006 created a minimal domain system rather than a broad extraction program. | Future domain-aware skills now have a registry/map to consume for session SQL work. | Keep registry lightweight; only expand as future plans need it. |
| DL-003 | T009 | Vitest/Vite in this repo did not recognize Node 24's `node:sqlite` builtin and tried to load `sqlite` as a URL. | Store tests could not even collect until the harness shimmed `node:sqlite` for Vitest. | Added a narrow `vitest.config.ts` plugin shim; promoted to `docs/difficulties.md` as D-022. |
| DL-004 | T018 | Driver SDK `waitIdle()` assumed pi's prompt/footer signal was the final non-empty line. Extension status rendered after the footer, causing smoke boot timeout. | Any extension that sets status at startup can break smoke readiness detection. | Updated `waitIdle()` to scan the last five non-empty lines; promoted to D-024. |

## Task Log

### T001 — Domain setup — complete

Created a lightweight domain registry, domain map, and two domain docs:

- `docs/domains/registry.md`
- `docs/domains/domain-map.md`
- `docs/domains/session-work-state/domain.md`
- `docs/domains/agent-tooling-interface/domain.md`

Evidence: files created with concepts, contracts, composition, dependencies, boundaries, and history. The domain map shows `agent-tooling-interface` consuming `session-work-state` and both domains consuming the existing harness capability.

### T002 — Runtime spike — complete

Ran a Node runtime spike for built-in SQLite and native extension loading APIs.

Evidence:

```text
{"node":"v24.7.0","databaseSync":"function","enableLoadExtension":"function","loadExtension":"function","hasRequiredMethods":true}
[{"name":"ok"}]
(node:...) ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

Decision: Node `v24.7.0` satisfies the plan's Node `>=24` runtime requirement. Keep the warning documented but do not fail tests solely because of it.

### T003 — Node engine policy — complete

Updated root runtime policy:

- `package.json#engines.node`: `>=20` → `>=24`
- `package-lock.json#packages[""].engines.node`: `>=20` → `>=24`

Evidence: exact manifest edits completed; full validation will run at T018.

### T004 — Scaffold — complete

Ran:

```bash
npm run new -- session-sql
```

Evidence: generator created `.pi/extensions/session-sql/` with `AGENTS.md`, `index.ts`, `store.ts`, `store.test.ts`, `smoke.ts`, and hidden `.generated` marker.

### T005 — Store core — complete

Replaced the generated event-log sample store with a pi-free SQLite store in `.pi/extensions/session-sql/store.ts`.

Evidence:

- Top-level standard import from `node:sqlite`.
- No imports from `@earendil-works/*`.
- Added `SessionSqlLocation`, `locationForSession`, `memoryLocation`, `open`, `close`, `status`, `execute`, `reset`, and tagged result types.
- DB path defaults to user pi state via `~/.pi/db/session-sql/<safe-session-id>.sqlite`.

### T006 — Default schema, reset, and preservation — complete

Implemented schema bootstrap and state lifecycle in `store.ts`.

Evidence:

- New DBs execute the workshop 004 schema for `session_sql_meta`, `todos`, and `todo_deps`.
- `schema_version` is written as `1`.
- `schema()` and `status()` expose tables, columns, and schema version.
- `reset()` closes, removes current DB/WAL/SHM files, and reopens with defaults.
- Bootstrap uses `CREATE TABLE IF NOT EXISTS`, preserving agent-created custom tables on reopen.

### T007 — SQL execution and caps — complete

Implemented SQL execution and tagged result classification in `store.ts`.

Evidence:

- Row-producing statements return `{ ok: true, kind: "rows" }` with columns and row preview.
- Mutation statements return `{ ok: true, kind: "change" }` with changes and last insert rowid.
- DDL/no-row statements return `{ ok: true, kind: "exec" }`.
- Empty, oversized, not-open, and SQLite errors return tagged failures.
- Returned row previews cap at 200 rows; byte/query guards are output safety rails only.

### T008 — Native SQLite extension loading — complete

Implemented native extension loading support in `store.ts`.

Evidence:

- `DatabaseSync` opens with `{ allowExtension: true }`.
- Store calls `enableLoadExtension(true)` and reports availability through `status().nativeExtensionLoading`.
- `loadExtension(path)` returns a tagged SQL result for callers that need the JS API surface.
- Absence/failure of extension loading is reported as a tagged `sqlite_error` instead of being silent.

### T009 — Store tests — complete

Replaced generated tests with real SQLite/filesystem tests in `.pi/extensions/session-sql/store.test.ts`.

Evidence:

- Tests cover path helpers, memory/file open, default schema, schema version, todo insert/select, `INSERT RETURNING`, custom table preservation, session separation, fork-new-empty simulation, SQLite errors, oversized query handling, row caps including `maxRows: 0`, idempotent close, reset, todo status constraint, FK cascade, and native extension loading status.
- Added a narrow `vitest.config.ts` plugin shim because Vite/Vitest did not recognize `node:sqlite` as a builtin.
- `npm test -- .pi/extensions/session-sql/store.test.ts` passes: 20 tests passed.

### T010 — Pi lifecycle and status — complete

Implemented lifecycle wiring in `.pi/extensions/session-sql/index.ts`.

Evidence:

- One `session_start` handler opens DB for `ctx.sessionManager.getSessionId()`.
- `session_shutdown` closes the store.
- Status uses `ctx.ui.setStatus(STATUS_KEY, undefined)` when clearing.
- Notify levels are limited to `info`, `warning`, and `error`.
- `npm run typecheck` passed after index wiring.

### T011 — Model-facing `sql` tool — complete

Implemented the generic `sql` tool in `index.ts`.

Evidence:

- Tool name is `sql`.
- Parameters are `{ query, description, maxRows? }`.
- `executionMode` is `sequential`.
- Tool returns text content plus structured store details.
- Prompt guidelines include default todos, custom table recipes, result caps, session persistence, and native extension loading warning.

### T012 — `/sql` command flow — complete

Implemented human-facing command flow in `index.ts`.

Evidence:

- `/sql` and `/sql status` render status.
- `/sql schema` renders table/column summaries.
- `/sql <query>` executes raw SQL.
- `/sql reset` asks for confirmation, resets current DB, and reports completion/cancellation.
- Stable phrases include `session-sql: ready`, `sql: ok`, `sql error:`, and `session-sql: reset complete`.

### T013 — Result formatting — complete

Implemented text formatting for status, schema, row previews, changes, exec, errors, and truncation.

Evidence:

- Row output renders compact markdown tables.
- Truncated row output says `Result capped at 200 rows...`.
- Status includes session ID, DB path, schema version, tables, and native extension loading availability.
- Schema output renders `table(column TYPE ...)` lines.
- `npm run typecheck` passed after formatting implementation.

### T014 — Smoke scenario — complete

Replaced generated legacy smoke with a current Driver SDK scenario in `.pi/extensions/session-sql/smoke.ts`.

Evidence:

- Scenario imports `Scenario` type from `../../../harness/driver/index.js`.
- Uses `kind: "type"` steps with `press: "Enter"` and `expect` regexes.
- Covers `/sql status`, insert, select, `/reload`, select after reload, and final capture.

### T015 — Narrow template fixes — complete

Confirmed scaffold friction from generated files and applied narrow harness fixes.

Evidence:

- `harness/templates/extension/index.ts.template` now clears status with `undefined`, not `""`.
- `harness/templates/extension/smoke.ts.template` now uses the Driver SDK `Scenario`/`Step` shape instead of legacy `{ send, expect, delay }`.
- Added `D-023` to `docs/difficulties.md` documenting the template drift and encoded fix.

### T016 — Documentation — complete

Added user/operator docs.

Evidence:

- `README.md` now has a `session-sql` quick-start with `/sql`, storage root, and smoke command.
- `docs/how/session-sql.md` covers commands, storage/lifecycle, default schema, trigger rules, custom table recipes, output caps, native extension loading, troubleshooting, and validation commands.

### T017 — Magic-wand/retro and ledgers — complete

Captured feedback-loop artifacts.

Evidence:

- `docs/retros/session-sql.md` records a specific magic-wand wish and two implementation difficulties.
- `docs/difficulties.md` now includes D-022 and D-023.
- `docs/velocity.md` now has an in-progress row for extension #3 (`session-sql`).

### T018 — Validation and resume proof — complete

Ran required validation and manual resume proof.

Validation evidence:

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | passed | `tsc --noEmit` clean. |
| `npm test` | passed | 44 passed / 2 skipped; Node emitted expected `ExperimentalWarning` for `node:sqlite`. |
| `npm run lint` | passed | Existing Biome schema info only. |
| `npm run smoke -- session-sql` | passed | Real pi/tmux smoke: `/sql status` → insert → select → `/reload` → select. |
| `npm run self-check` | passed | typecheck, lint, test, smoke all passed. |

Manual resume proof evidence:

```text
{"ok":true,"sessionId":"session-sql-resume-proof-1778822988198","title":"manual resume proof 1778822988199","sessionFile":"/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/session-sql-resume-proof-1778822988198/session.jsonl"}
```

Proof method: created an explicit pi session file with a stable session ID, started real `pi --session <file>`, inserted a todo through `/sql`, terminated pi, started real `pi --session <same file>`, and selected the inserted row successfully.

Additional harness discovery: initial `session-sql` smoke exposed Driver SDK `waitIdle()` assuming the prompt/footer was the final non-empty line. The extension status line rendered after the model footer, causing a false idle timeout. Fixed `harness/driver/session.ts` to check the last five non-empty lines and promoted D-024.

## 2026-05-15 — Review fix pass

Applied fixes from `reviews/fix-tasks.md`:

| Fix | Result | Evidence |
|-----|--------|----------|
| FT-001 | fixed | `SessionSqlStore.execute()` now detects trailing SQL after `prepare()` and executes trusted multi-statement batches with `db.exec()`; added regression test proving two inserts both persist. |
| FT-002 | fixed | Result byte cap now applies before appending the first row; added regression test proving an oversized first row returns no rows and `truncated: true`. |
| FT-003 | fixed | Plan Domain Manifest now includes `harness/driver/session.ts`, `docs/project-rules/harness.md`, and the approved pre-phase `harness/scripts/packages.ts` repair. |
| FT-004 | fixed | `.pi/extensions/session-sql/AGENTS.md` now describes actual boundaries and `/sql status` acceptance. |

Validation evidence after fixes:

| Command | Result | Notes |
|---------|--------|-------|
| `npm test -- .pi/extensions/session-sql/store.test.ts` | passed | 22 passed. |
| `npm run typecheck` | passed | `tsc --noEmit` clean. |
| `npm run self-check` | passed | typecheck, lint, test, smoke all passed; lint still shows existing Biome schema info only; tests now 46 passed / 2 skipped. |
