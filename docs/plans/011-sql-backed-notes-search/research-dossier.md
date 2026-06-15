# Research Report: SQL-backed notes/search adjacent to todo

**Generated**: 2026-05-18T00:00:00Z  
**Research Query**: "add a first class note take and search system that is adjacent to todos"  
**Mode**: Pre-Plan / Plan-Associated  
**Location**: `docs/plans/011-sql-backed-notes-search/research-dossier.md`  
**FlowSpace**: Available  
**Findings**: 78 subagent findings synthesized

## Executive Summary

### What It Does

Add a first-class current-session notes system next to `/todo`, backed by the existing `session-sql` SQLite DB. Notes should support title/body, list/show/delete/clear, and bounded search.

### Business Purpose

Give agents a structured scratchpad for research observations, decisions, and session-local facts that are not actionable todos but still need retrieval during the current pi session.

### Key Insights

1. Build notes as a sibling to todo over `SessionSqlStore`, not a second DB or markdown file.
2. SQLite can do simple search now: `LIKE` works; FTS5 and `bm25()` work in local Node v24.7.0 / SQLite 3.53.1.
3. `REGEXP` is not built in locally (`no such function: REGEXP`), so regex requires a custom function or trusted extension.
4. Use existing domains: `session-work-state` owns schema/search semantics; `agent-tooling-interface` owns `/note`/tool/UI.
5. Search output must be capped/snippeted to avoid context flooding.

### Quick Stats

- **Primary components to copy**: `.pi/extensions/session-sql/`, `.pi/extensions/todo/`
- **Likely new component**: `.pi/extensions/notes/`
- **Relevant domains**: `session-work-state`, `agent-tooling-interface`, `extension-authoring-harness`
- **Complexity**: Medium with LIKE; Medium-High with FTS migration/triggers
- **Prior learnings surfaced**: 15

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `SessionSqlStore` | Store | `.pi/extensions/session-sql/store.ts` | Per-session SQLite DB lifecycle/query execution |
| `/sql` + `sql` tool | Command/tool | `.pi/extensions/session-sql/index.ts` | Raw SQL inspection/repair |
| `TodoSqlStore` | Store | `.pi/extensions/todo/store.ts` | Typed work-state over `todos` tables |
| `/todo` + `todo` tool | Command/tool/UI | `.pi/extensions/todo/index.ts` | Ergonomic task UX over session SQL |

### Core Execution Flow to Reuse

1. `session-sql` opens `~/.pi/db/session-sql/<sessionId>.sqlite` on `session_start`.
2. Default schema currently creates `session_sql_meta`, `todos`, and `todo_deps`.
3. `todo` injects `SessionSqlStore` into `TodoSqlStore` and exposes typed operations.
4. `todo/index.ts` owns Pi APIs: commands, TypeBox tool schema, status, overlay/widget, events.
5. Raw `/sql` changes emit `session-sql:changed` only for mutating SQL; todo refreshes from that event.

### SQLite Search Capability

Local runtime probe:

```json
{
  "version": "3.53.1",
  "fts5": "ok",
  "bm25": "ok",
  "regexp": "no such function: REGEXP"
}
```

Implications:

- `LIKE` / `instr()` are safe baseline substring search.
- FTS5 virtual tables are available locally.
- `bm25(notes_fts)` is available; lower score is better, so order `ASC`.
- `snippet()` / `highlight()` should be tested if used.
- `REGEXP` is not portable unless we register/load it.

## Architecture & Design

### Recommended v1 Architecture

```mermaid
flowchart LR
  PI[pi runtime]
  SQL[SessionSqlStore]
  NOTES[NoteSqlStore]
  ATI[/note + note tool]
  SWS[session-work-state]
  H[extension-authoring-harness]

  NOTES --> SQL
  SQL --> SWS
  ATI --> NOTES
  ATI --> PI
  ATI --> H
```

### Proposed Files

| File | Purpose |
|------|---------|
| `.pi/extensions/notes/AGENTS.md` | Per-extension rules |
| `.pi/extensions/notes/store.ts` | Pi-free `NoteSqlStore`, parser, schema/search |
| `.pi/extensions/notes/index.ts` | `/note`, `note` tool, lifecycle/UI |
| `.pi/extensions/notes/store.test.ts` | Store/search/parser tests |
| `.pi/extensions/notes/smoke.ts` | Deterministic pi smoke |
| `docs/how/notes.md` | Human/model guide |

### Schema Direction

Recommended source-of-truth tables:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag),
  CHECK (length(tag) > 0)
);
```

Optional FTS table:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
USING fts5(title, body, tags, content='notes', content_rowid='id');
```

Use triggers or explicit rebuild to keep FTS in sync. Tests must cover insert/update/delete/rebuild.

## Interface & Contract

### Command Surface

Recommended namespace: `/note` or `/notes`. Prefer one; `/note` is concise, `/notes` is plural like table name. Existing `/todo` precedent is singular. Suggested v1:

| Command | Contract |
|---|---|
| `/note` | List recent notes |
| `/note add <body>` | Add body-only note |
| `/note add --title <title> <body>` | Add titled note |
| `/note list [limit]` | Recent notes, bounded previews |
| `/note show <id>` | Full body/details |
| `/note search <query> [limit]` | Bounded search hits |
| `/note delete <id>` | Delete one note |
| `/note clear` | Confirm before all-delete |
| `/note help` | Stable help text |

### Model Tool

Use one flattened root object, not a top-level union:

```ts
const NoteToolParameters = Type.Object({
  action: Type.Union([
    Type.Literal("add"),
    Type.Literal("list"),
    Type.Literal("show"),
    Type.Literal("search"),
    Type.Literal("delete"),
    Type.Literal("clear"),
  ]),
  id: Type.Optional(Type.Number()),
  title: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  limit: Type.Optional(Type.Number()),
  confirm: Type.Optional(Type.Boolean()),
});
```

Reason: todo already hit provider schema failures when using top-level `Type.Union([Type.Object(...)])`.

### Result Contract

Text anchors:

- `note: added #4 — <title-or-preview>`
- `note: #4 deleted — <title-or-preview>`
- `note: 3 recent`
- `note search: 2 matches for "schema"`
- `note search: no matches for "schema"`
- `note error: id #99 not found`

Structured details should include `action`, `ok`, `message`, optional `note`, `notes`, `search`, `cleanup`, and error `code`.

## Search Options

### Option A — LIKE baseline

Pros:

- No virtual tables or triggers.
- Easy SQL agreement.
- Good enough for simple substring search.

Cons:

- No BM25/ranking.
- Poor tokenization/stemming.
- Slow for huge note sets, though session notes should be small.

Example:

```sql
SELECT id, title, body
FROM notes
WHERE title LIKE :pattern OR body LIKE :pattern
ORDER BY updated_at DESC, id DESC
LIMIT :limit;
```

### Option B — FTS5 + BM25 recommended stretch/v1.5

Pros:

- Built into local SQLite runtime.
- Supports `MATCH`, `bm25()`, tokenized search, snippets/highlights.
- Better foundation for note search UX.

Cons:

- Requires schema migration and FTS sync triggers.
- `MATCH` syntax can error on malformed queries.
- Ranking tests must order score ascending.

Example:

```sql
SELECT n.id, n.title, snippet(notes_fts, 1, '[', ']', '…', 12) AS excerpt,
       bm25(notes_fts, 5.0, 1.0, 3.0) AS score
FROM notes_fts
JOIN notes n ON n.id = notes_fts.rowid
WHERE notes_fts MATCH :query
ORDER BY score ASC, n.updated_at DESC, n.id DESC
LIMIT :limit;
```

### Option C — REGEXP

Not recommended for v1. Local SQLite has no built-in `REGEXP`. It needs a user-defined function or trusted extension. This conflicts with a zero-extra-dependency first-party extension unless we implement and validate it explicitly.

## Migration Considerations

Current `DEFAULT_SCHEMA_SQL` is v1-ish and writes `schema_version = 1`. A notes feature should avoid silently adding default tables while still claiming version 1.

Recommended:

1. Add an explicit migration runner in `session-sql` or extension-local `ensureSchema()`.
2. Preserve existing `todos`, `todo_deps`, and custom user tables.
3. Fresh DBs get notes schema cleanly.
4. Existing v1 DBs migrate to v2.
5. `/sql schema` shows notes tables.
6. `/sql reset` semantics are documented: reset wipes current-session notes too.

Open decision: default schema vs notes-local schema. Default schema makes notes first-class globally; notes-local schema keeps session-sql small.

## Quality & Testing

### Store Tests

Required:

- schema creation/migration
- add/list/show/delete/clear
- title/body validation
- `limit: 0` returns no rows
- long body preview/snippet truncation
- LIKE search baseline
- FTS5 availability + `bm25` if used
- malformed `MATCH` query returns tagged error
- FTS triggers insert/update/delete/rebuild
- SQL-created notes appear in `/note list`
- SQL-updated/deleted notes affect search
- reload/reopen persistence

### Smoke

Deterministic slash-command path:

1. Clean smoke rows via `/sql` or `/note clear`.
2. `/note add --title Smoke <unique body>`.
3. `/note search <unique>` finds note.
4. `/sql SELECT ... FROM notes` sees note.
5. `/reload`, wait explicitly.
6. `/note search <unique>` still finds note.
7. `/note delete <id>` deletes it.

### Known Test Traps

- Node `node:sqlite` requires Node 24 and has experimental warnings.
- Vitest uses `vitest.config.ts` shim for `node:sqlite`.
- After `/reload`, smoke needs an explicit wait.
- Status clear must use `undefined`, not `""`.
- `session-sql:changed` must not emit on read-only `SELECT`.

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts |
|--------|--------------|-------------------|
| `session-work-state` | Direct | session DB identity, schema, reset, todo store, caps |
| `agent-tooling-interface` | Direct | `/sql`, `/todo`, tools, prompt guidance, UI/smoke |
| `extension-authoring-harness` | Validation | generator, tests, smoke, self-check |

### Domain Map Position

No new domain for v1. Notes/search should extend the same domains as todo. Create a new domain only if scope expands into cross-session memory, project knowledge, cloud sync, semantic/vector recall, or shared multi-user notes.

## Prior Learnings

1. Use session SQL for current-session notes; not repo/global files.
2. `/note` and `/sql` must agree.
3. Scratch is historical UX prior art, but old append-entry storage is obsolete.
4. Reload/resume persistence is already solved by `SessionSqlStore`.
5. Formalize cross-extension store usage before importing internals.
6. SQLite driver/runtime is a known hazard.
7. Keep SQL powerful but bounded.
8. Test multi-connection and raw SQL agreement.
9. Tool schemas need provider-compatible root `type: "object"`.
10. `limit: 0` must not mean all rows.
11. Status/notify API drift is real.
12. Smoke after `/reload` needs explicit wait.
13. Visibility should be compact, recent, not archive-like.
14. Cross-extension reactivity must be mutation-aware.
15. Avoid duplicating long-term context/search tools.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| FTS schema complexity | Medium | Start LIKE or add explicit FTS tests/triggers |
| Search context flood | High | Hard caps, snippets, show-by-id for full body |
| Migration clobbers custom tables | High | Additive migrations only, tests for custom table survival |
| Tool schema provider rejection | High | Flatten root TypeBox object |
| Cross-session scope creep | Medium | State v1 as current-session only |
| REGEXP expectation | Low | Document unavailable by default |

## Recommendations

### Recommended MVP

- Current-session SQL-backed notes.
- Tables: `notes`, maybe `note_tags`.
- Search: LIKE baseline with stable output; optionally FTS5 gated by tests.
- Command/tool: one namespace, one model tool.
- No always-on widget in v1; maybe status count or recent-note overlay only.

### Recommended FTS Path

If user wants “extra points” in the first implementation:

- Use external-content FTS5 table.
- Add triggers for notes insert/update/delete.
- Query with `MATCH :query`, `snippet()`, `bm25(...)`.
- Catch malformed MATCH queries and fallback to LIKE or return stable `NOTE_BAD_QUERY`.
- Expose `backend: "fts" | "like"` in search details.

## External Research Opportunities

No blocking external research is required. SQLite FTS5/BM25 is documented and locally verified. Optional future research: tokenizer choices (`unicode61`, porter stemming), query escaping strategy for FTS5 user input, and whether Node `DatabaseSync` exposes safe user-defined function registration for `REGEXP` in this runtime.

## Appendix: Subagent Artifacts

- `/tmp/notes-search-ia.md`
- `/tmp/notes-search-dc.md`
- `/tmp/notes-search-ps.md`
- `/tmp/notes-search-qt.md`
- `/tmp/notes-search-ic.md`
- `/tmp/notes-search-de.md`
- `/tmp/notes-search-pl.md`
- `/tmp/notes-search-db.md`

## Next Steps

- If proceeding: run `/plan-1b-v2-specify "first-class SQL-backed notes and search adjacent to todo"`.
- If design needs deeper exploration first: run `/plan-2c-v2-workshop "notes schema, FTS5 search contract, and command/tool UX"`.
- Do not implement before deciding: LIKE-only MVP vs FTS5/BM25 in v1.

**Research Complete**: 2026-05-18T00:00:00Z
