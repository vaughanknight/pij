# Workshop: Tool, Command, and Result Contract

**Type**: API Contract / CLI Flow
**Plan**: 006-generic-sqlite-session-tool
**Spec**: Pending — this workshop precedes the feature spec
**Created**: 2026-05-15T03:44:22Z
**Status**: Draft

**Value Thesis**: This workshop makes the model-facing `sql` tool and human-facing `/sql` command concrete so implementation, smoke tests, and review validate the same observable contract.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Agent Readiness**: The model needs a simple, generic tool it can confidently use for structured session work.
- **Operator Usability**: Humans need `/sql` for debugging, inspection, and deterministic smoke.
- **Proof Quality**: Output examples and stable phrases become test fixtures.
- **Review Compression**: Reviewers can compare implementation output directly to this contract.

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [Workshop 001: Session SQLite Semantics and Safety Boundary](./001-session-sqlite-semantics-and-safety-boundary.md)
- [Workshop 004: Default Schema and Migrations](./004-default-schema-and-migrations.md)
- [Workshop 005: Validation and Smoke Harness](./005-validation-and-smoke-harness.md)

---

## Purpose

Specify the public contract for the `sql` tool and `/sql` command: parameters, command parsing, result types, text output, errors, and stable smoke phrases.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Register the pi `sql` tool with TypeBox.
- Implement `/sql status`, `/sql schema`, `/sql reset`, and `/sql <query>`.
- Format successful and failed SQL results consistently.
- Write smoke tests against stable output strings.

## Key Questions Addressed

- Should v1 expose one generic tool or split read/write/schema tools?
- What exact parameters does the model pass?
- How should results be classified and returned?
- What human command surface is needed for smoke and debugging?
- Which output phrases should remain stable for validation?
- How should errors appear to the model and human operator?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | Tool and command code can be built directly from this contract. |
| Primary Value Axis | Agent Readiness | The primary consumer is the LLM using SQL to manage work. |
| Supporting Value Axes | Operator Usability, Proof Quality, Review Compression | The human command doubles as the deterministic validation path. |
| Downstream Loop Improved | Implementation / Smoke / Review / Agent execution | All consumers share one output contract. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| User decision: one generic tool | Workshop 001 | Tool surface | Ready |
| pi extension tool API | Research dossier / pi docs | TypeBox registration and result shape | Ready |
| Smoke strategy | Workshop 005 | Stable command phrases | Ready |
| Final implementation output | Future smoke/test output | Contract validation | Missing |

## Interface Summary

| Interface | Consumer | Purpose | Required v1? |
|-----------|----------|---------|--------------|
| `sql` tool | LLM agent | Generic SQL execution against current session DB | Yes |
| `/sql status` | Human/smoke | Show DB linkage and schema state | Yes |
| `/sql schema` | Human/smoke | Show tables and columns | Yes |
| `/sql <query>` | Human/smoke | Execute SQL manually | Yes |
| `/sql reset` | Human | Recreate current session DB after confirmation | Recommended |

## Tool Contract

### Tool name

```text
sql
```

The generic name is intentional: this extension provides the obvious SQL workbench for the current pi session.

### TypeBox parameters

```typescript
const SqlToolParams = Type.Object({
  query: Type.String({
    description: "SQLite SQL to execute against the current session database.",
  }),
  description: Type.String({
    description: "2-5 word summary of what this query does.",
  }),
  maxRows: Type.Optional(Type.Number({
    description: "Maximum result rows to return. Defaults to 200; capped by extension maximum.",
  })),
});
```

### Prompt snippet

```text
sql: execute SQLite against a private database linked to the current pi session for structured task state.
```

### Prompt guidelines

```text
- Use sql when structured current-session state would help: todos, batches, dependency graphs, test matrices, review queues, scratch joins.
- The DB persists with this pi session across reload/resume and lives in user pi state, not the repo.
- A small default schema exists: session_sql_meta, todos, todo_deps. You may create any additional tables you need.
- Prefer LIMIT on exploratory SELECTs. Tool responses are capped even though SQL execution is trusted and unrestricted.
- Do not treat this as long-term user memory or project source code.
```

## Result Contract

### Classification

| SQL behavior | Result kind | Text output pattern |
|--------------|-------------|---------------------|
| Produces rows | `rows` | `sql: N row(s)` plus table/JSON preview |
| Mutates rows | `change` | `sql: ok, N change(s)` |
| DDL / no row metadata | `exec` | `sql: ok, statement executed` |
| SQLite error | `sqlite_error` | `sql error: <message>` |
| Store not open | `not_open` | `session SQL database is not open` |
| Output cap hit | `rows` with `truncated: true` | `sql: N rows (truncated)` |

### Details type

```typescript
type SqlDetails =
  | {
      ok: true;
      kind: "rows";
      columns: string[];
      rows: Record<string, unknown>[];
      rowsReturned: number;
      truncated: boolean;
      dbPath: string;
    }
  | {
      ok: true;
      kind: "change" | "exec";
      changes?: number;
      lastInsertRowid?: number | bigint;
      dbPath: string;
    }
  | {
      ok: false;
      reason: "not_open" | "too_large" | "sqlite_error";
      message: string;
      dbPath?: string;
    };
```

## Text Output Examples

### Rows

```text
sql: 2 rows

| id | title | status |
|---:|-------|--------|
| 1 | Map tool contract | done |
| 2 | Write smoke test | pending |
```

### Change

```text
sql: ok, 1 change
lastInsertRowid: 3
```

### Exec / DDL

```text
sql: ok, statement executed
```

### Error

```text
sql error: no such table: missing_table
```

### Truncated

```text
sql: 200 rows (truncated)

Result capped at 200 rows. Re-run with a narrower query, LIMIT/OFFSET, or an aggregate/count query.
```

## Slash Command Flow

### Command Summary

| Command | Purpose | Stable phrase |
|---------|---------|---------------|
| `/sql` | Same as `/sql status` | `session-sql: ready` |
| `/sql status` | Show DB/session linkage | `session-sql: ready` |
| `/sql schema` | Show tables/columns | `todos(` |
| `/sql <query>` | Execute raw SQL | `sql: ok` or row text |
| `/sql reset` | Confirm and recreate DB | `session-sql: reset complete` |

### `/sql status`

```text
/sql status

session-sql: ready
session: 019ab123...
db: ~/.pi/db/session-sql/019ab123.sqlite
schema_version: 1
tables: session_sql_meta, todos, todo_deps
```

### `/sql schema`

```text
/sql schema

session_sql_meta(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)
todos(id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, priority INTEGER, created_at TEXT, updated_at TEXT)
todo_deps(todo_id INTEGER, depends_on INTEGER)
```

### `/sql <query>`

Everything after `/sql ` is treated as SQL unless it exactly matches a known subcommand.

```text
/sql insert into todos(title) values ('smoke todo')

sql: ok, 1 change
```

```text
/sql select title from todos where title = 'smoke todo'

sql: 1 row

| title |
|-------|
| smoke todo |
```

### `/sql reset`

Interactive only; requires confirmation.

```text
/sql reset

Confirm reset current session SQL database? This deletes ~/.pi/db/session-sql/<sessionId>.sqlite.
```

After confirmation:

```text
session-sql: reset complete
```

## Parsing Rules

1. Trim raw command args.
2. Empty args or `status` means status.
3. Exact `schema` means schema.
4. Exact `reset` means confirmed reset.
5. Anything else is raw SQL.
6. Do not implement shell-like parsing in v1; SQL is the remainder string.

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| One `sql` tool | Model sends raw SQL to one generic tool | Simple; matches intent | Result classification must be robust | Selected |
| Split tools | `sql_query`, `sql_exec`, `sql_schema` | More guided | More surface area; less “do whatever” | Rejected v1 |
| Tool only | No slash command | Less code | Flaky smoke/debug | Rejected |
| Tool + `/sql` | Model tool plus deterministic human command | Testable and debuggable | Slightly more wiring | Selected |
| Markdown table output | Human/model readable | Good for small rows | Needs escaping/caps | Selected for preview |
| JSON-only output | Machine-friendly | Verbose in TUI | Rejected as primary text |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Agent would invent params/result shape | TypeBox params and details type are specified. |
| Smoke | Agent might ask model to call tool | `/sql` stable phrases are defined. |
| Review | Output formatting would be subjective | Examples define expected UX. |
| Agent execution | Model might not know when to use SQL | Prompt snippet/guidelines are ready. |

## Open Questions

### Q1: Should `description` be required?

**Direction**: Yes for tool calls. It improves traceability in tool logs and encourages deliberate SQL use. `/sql` command does not need it.

### Q2: Should `maxRows` be optional or mandatory?

**Direction**: Optional with a 200-row returned preview cap. The model should not need to provide it for common use.

### Q3: Should `/sql reset` be smoke-tested?

**Direction**: No for v1 smoke. Confirmation UI adds fragility; reset belongs in store tests/manual checks.

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- `index.ts` registers exactly one `sql` tool with the documented parameters.
- `/sql`, `/sql status`, `/sql schema`, `/sql <query>`, and `/sql reset` exist.
- Tool/command output includes stable phrases for smoke.
- Store and wiring tests validate `rows`, `change`, `exec`, and error results.

## Quick Reference

```text
Tool: sql({ query, description, maxRows? })
Command: /sql [status|schema|reset|<query>]
Stable smoke phrases: session-sql: ready, sql: ok, smoke todo
Primary text: compact table/summary
Details: structured tagged result
```
