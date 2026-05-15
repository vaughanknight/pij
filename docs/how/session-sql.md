# session-sql guide

`session-sql` gives pi a private SQLite workbench scoped to the current pi session.
Use it when the agent or operator needs structured, queryable state for the current task without creating project files.

## Quick start

```text
/sql status
/sql schema
/sql INSERT INTO todos(title, priority) VALUES ('inspect store', 10)
/sql SELECT id, title, status FROM todos ORDER BY priority DESC
```

The model-facing tool is named `sql` and accepts:

```ts
{
  query: string;
  description: string;
  maxRows?: number;
}
```

## Storage and lifecycle

| Behavior | Contract |
|----------|----------|
| Storage root | `~/.pi/db/session-sql/` |
| DB identity | one SQLite file per pi session ID |
| `/reload` | reopens the same DB |
| `/resume` | reopens the same DB if the pi session state still exists |
| `/new` | fresh DB with default schema |
| `/fork` | fresh DB with default schema; parent rows are not copied |
| `/quit` | closes the handle and leaves the DB file in place |
| `/sql reset` | confirms, deletes current DB files, and recreates defaults |

Session SQL files live outside the repository and should not appear in normal project git status.

## Default schema

New DBs include:

```text
session_sql_meta(key, value, updated_at)
todos(id, title, description, status, priority, created_at, updated_at)
todo_deps(todo_id, depends_on)
```

`todos.status` is one of:

```text
pending | in_progress | done | blocked
```

Example dependency query:

```sql
SELECT t.id, t.title, t.priority
FROM todos t
WHERE t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM todo_deps d
    JOIN todos prereq ON prereq.id = d.depends_on
    WHERE d.todo_id = t.id
      AND prereq.status != 'done'
  )
ORDER BY t.priority DESC, t.id ASC;
```

## When agents should use SQL

Use SQL proactively when work has:

- 5+ work items
- dependencies or blockers
- repeated test/validation runs
- many files to inspect or edit
- review findings to triage
- research sources and claims
- batch progress to track
- context compaction/reload/resume risk

Skip SQL for tiny one-off edits, secrets, huge raw logs, or durable project documentation.

## Custom table recipes

The default tables are just a starting point. Agents should create task-specific tables when structure helps.

### File work inventory

```sql
CREATE TABLE IF NOT EXISTS file_work (
  path TEXT PRIMARY KEY,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'inspected', 'edited', 'validated', 'skipped', 'blocked')),
  reason TEXT,
  evidence TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Batch item tracker

```sql
CREATE TABLE IF NOT EXISTS batch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch, target)
);
```

### Test matrix

```sql
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT,
  command TEXT,
  expected TEXT,
  status TEXT NOT NULL DEFAULT 'not_run'
    CHECK (status IN ('not_run', 'running', 'passing', 'failing', 'blocked', 'skipped')),
  last_output TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Review findings

```sql
CREATE TABLE IF NOT EXISTS review_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  category TEXT,
  summary TEXT NOT NULL,
  recommendation TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'fixed', 'wontfix', 'verified')),
  evidence TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Research source ledger

```sql
CREATE TABLE IF NOT EXISTS research_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  title TEXT,
  url TEXT,
  source_type TEXT,
  claim TEXT NOT NULL,
  confidence TEXT DEFAULT 'medium'
    CHECK (confidence IN ('low', 'medium', 'high')),
  used_in_output INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Multi-statement SQL

`session-sql` allows trusted multi-statement SQL batches. When a query contains more than one statement, the store executes the full batch and reports `sql: ok, statement executed`; it does not return row previews from intermediate `SELECT` statements. Run a follow-up `SELECT` when you need to inspect batch results.

## Output caps

SQL execution is trusted and unrestricted, but returned previews are capped so pi does not flood the TUI or model context.

- v1 returns up to 200 rows.
- Truncated output says so.
- Use `LIMIT`, `OFFSET`, `WHERE`, `COUNT(*)`, and `GROUP BY` for deliberate paging/summaries.

## Native SQLite extension loading

`session-sql` enables native SQLite extension loading when Node exposes it.
This allows future vector-search-style workflows, custom tokenizers, or other local SQLite extensions.

Treat this as trusted local native code execution. Do not load compiled extensions from untrusted paths.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `/sql status` says not open | Run `/reload`; check Node `>=24`; inspect pi extension load errors. |
| `node:sqlite` test collection fails | Ensure `vitest.config.ts` has the `node-sqlite-shim` plugin. |
| Rows missing after `/fork` | Expected v1 behavior: forks start empty. |
| Huge query output is truncated | Re-run with a narrower query, `LIMIT/OFFSET`, or aggregate query. |
| Native extension loading fails | Confirm the shared library path and runtime support; remember this loads local native code. |

## Validation commands

```bash
npm run typecheck
npm test
npm run lint
npm run smoke -- session-sql
npm run self-check
```
