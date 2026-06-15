# Workshop: Session SQLite Semantics and Safety Boundary

**Type**: Storage Design / API Contract
**Plan**: 006-generic-sqlite-session-tool
**Spec**: Pending — this workshop precedes the feature spec
**Created**: 2026-05-15T03:41:10Z
**Status**: Draft

**Value Thesis**: This workshop makes implementation cheaper and safer by turning “let the agent do whatever it wants in SQL” into explicit session, storage, trust-boundary, default-schema, and lifecycle contracts.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Agent Readiness**: The model needs a simple mental model for when and how to use the SQL store.
- **Implementation Readiness**: Storage paths, lifecycle behavior, and trust boundaries must be concrete before coding.
- **Knowability**: SQLite and pi session behavior should be explicit rather than rediscovered during implementation.
- **Operational Reliability**: Accepted risks should be deliberate, not accidental omissions.
- **Learning Compounding**: These semantics should become reusable guidance for future session-state extensions.

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [Workshop 002: Driver Runtime and Node Floor](./002-driver-runtime-and-node-floor.md)
- [Workshop 003: Tool, Command, and Result Contract](./003-tool-command-and-result-contract.md)
- [Workshop 004: Default Schema and Migrations](./004-default-schema-and-migrations.md)
- [Workshop 005: Validation and Smoke Harness](./005-validation-and-smoke-harness.md)
- [`AGENTS.md`](../../../../AGENTS.md)
- [`docs/project-rules/harness.md`](../../../project-rules/harness.md)
- [Node SQLite API](https://nodejs.org/api/sqlite.html)
- [SQLite ATTACH docs](https://www.sqlite.org/lang_attach.html)
- [SQLite VACUUM INTO docs](https://www.sqlite.org/lang_vacuum.html#vacuuminto)

---

## Purpose

Clarify the core product semantics for a generic SQLite tool scoped to the current pi session. This workshop drives later specification and architecture by deciding what “session-local”, “unrestricted SQL”, and “persistent across resume” mean in practice.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Implement `session-sql` storage and lifecycle behavior without inventing semantics.
- Review whether implementation matches the intended unrestricted trusted SQL model.
- Write tests for persistence, fork behavior, default schema creation, and response caps.

## Key Questions Addressed

- What does “current-session SQLite store” mean?
- Where should DB files live so they persist but do not pollute the repo?
- Does v1 restrict SQL or trust the local agent fully?
- What should happen on `/reload`, `/resume`, `/new`, `/fork`, and `/quit`?
- Should a new DB be blank or include a small default schema?
- What is execution freedom versus response-size limiting?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | These semantics directly determine storage, tests, and pi lifecycle wiring. |
| Primary Value Axis | Agent Readiness | The tool only works if the model knows it can freely structure session work. |
| Supporting Value Axes | Implementation Readiness, Knowability, Operational Reliability, Learning Compounding | The same decisions will recur in future session-state tools. |
| Downstream Loop Improved | Specification / Architecture / Implementation / Review / Testing | Future phases can reference decisions instead of re-asking product questions. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| User decisions from clarification | This workshop, Decision Summary | Storage root, unrestricted SQL, fork behavior, default schema | Ready |
| Local research dossier | `../research-dossier.md` | Pi lifecycle APIs, implementation shape, risk areas | Ready |
| Scout/researcher findings | Conversation context | Driver and safety tradeoffs | Ready |
| Node/SQLite primary docs | Related Documents | Driver and SQL capability context | Ready |
| Future spike output | Workshop 002 | Exact Node floor and `DatabaseSync` behavior | Missing |

## Decision Summary

| Topic | Decision | Rationale |
|-------|----------|-----------|
| SQL policy | Unrestricted trusted SQLite in v1 | User wants the running instance to do whatever it likes in SQL. |
| Resource isolation | No worker/subprocess hard timeout in v1 | Trusted local-agent risk is accepted. |
| Response limiting | Cap returned row previews/bytes | Execution is unrestricted, but tool output must not flood model context. |
| Native extension loading | Support when Node exposes it | User wants vector-search-style SQLite extensions to be possible in v1. |
| Persistence | File-backed, survives `/reload` and `/resume` indefinitely | Resuming a session a month later should recover its DB. |
| Storage root | `~/.pi/db/session-sql/` | User-global pi state, not repo-local artifacts. |
| DB identity | One DB file per pi `sessionId` | Ties state to session, not cwd or project. |
| Fork semantics | Fork starts with an empty DB for the new session ID | Avoids surprising hidden state inheritance. |
| Default schema | Create a small versioned schema | Useful immediately, migration anchor for future defaults. |
| Tool surface | One generic `sql` tool | Simple and matches user intent. |

## Conceptual Model

```mermaid
graph LR
    A[pi session ID] --> B[location resolver]
    B --> C[~/.pi/db/session-sql/session-id.sqlite]
    D[sql tool or /sql command] --> E[DatabaseSync connection]
    E --> C
    F[/reload or /resume] --> A
    G[/fork or /new] --> H[new session ID]
    H --> I[new empty DB + default schema]
```

## Storage Contract

```text
~/.pi/db/session-sql/
├── <session-id>.sqlite
├── <session-id>.sqlite-shm     # if SQLite creates WAL shared-memory file
└── <session-id>.sqlite-wal     # if SQLite creates WAL file
```

Rules:

1. `sessionId` comes from `ctx.sessionManager.getSessionId()`.
2. The root is user-global pi state, not `ctx.cwd` and not the repo.
3. The DB file is named from a sanitized session ID.
4. Missing DB files are created on first use.
5. Existing DB files reopen on `/reload` and `/resume`.
6. `/new` and `/fork` use a different session ID and therefore a fresh DB.
7. `/quit` closes the handle but leaves the DB file in place.

### Why not repo-local?

Repo-local DBs would create git noise, accidental secret/data commits, and project coupling. The user wants agent session state, not project source artifacts.

## Lifecycle Semantics

| pi Event / Action | DB Behavior | Required? |
|-------------------|-------------|-----------|
| First startup for session | Create/open `~/.pi/db/session-sql/<sessionId>.sqlite` and initialize default schema | Yes |
| `/reload` | Close old handle; reopen same DB for same session ID | Yes |
| `/resume` same session later | Reopen same DB; prior contents remain | Yes |
| Resume a month later | Reopen same DB if file still exists | Yes |
| `/new` | New session ID → fresh DB + default schema | Yes |
| `/fork` | New session ID → fresh DB + default schema | Yes |
| `/quit` | Close handle; keep DB file | Yes |
| `/sql reset` | Delete/recreate current session DB after confirmation | Recommended |

## SQL Trust Boundary

### v1 policy: trusted unrestricted SQL

The extension should not sandbox SQL. The running pi agent already has powerful local coding tools; this SQLite tool is treated as another trusted local capability.

Allowed by policy:

- DDL: `CREATE`, `ALTER`, `DROP`
- DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- transactions
- `PRAGMA`
- `ATTACH` / `DETACH`
- `VACUUM`, including `VACUUM INTO`
- multiple statements when the chosen execution strategy supports them cleanly
- native SQLite extension loading when the selected runtime exposes the needed API

### Accepted risks

| Risk | Accepted? | Note |
|------|-----------|------|
| Agent creates arbitrary tables | Yes | Core feature. |
| Agent writes a large DB | Yes | Trusted local-agent risk. |
| Agent runs a slow query | Yes | No hard v1 isolation. |
| Agent uses SQLite file features | Yes | User chose unrestricted SQL. |
| Tool response floods context | No | Return size should still be capped. |
| Agent loads native SQLite extension code | Yes | Trusted local-agent risk; useful for vector-search-style workflows. |

### Execution freedom vs response limits

SQLite execution is unrestricted. Tool output is not. Clarified v1 caps:

```typescript
export const DEFAULT_MAX_ROWS = 200;
export const MAX_ROWS = 200;
export const DEFAULT_MAX_RESULT_BYTES = 64 * 1024;
export const MAX_QUERY_BYTES = 256 * 1024;
```

These caps protect pi/model output, not the DB engine. The row cap is a returned preview cap; agents can rerun narrower queries or use `LIMIT`/`OFFSET` deliberately.

## Default Schema Summary

A new DB should include:

- `session_sql_meta` — version and future metadata.
- `todos` — common agent task tracking.
- `todo_deps` — dependency edges between tasks.

Full DDL lives in [Workshop 004](./004-default-schema-and-migrations.md).

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Restrict SQL boundary | Block `ATTACH`, `VACUUM INTO`, broad `PRAGMA`, extension functions | Safer; easier to reason about | Conflicts with user intent | Rejected v1 |
| Unrestricted trusted SQL | Let SQLite accept what it accepts | Maximum freedom; simplest mental model | Can escape DB boundary or stall process | Selected |
| Native extension loading | Enable/support runtime SQLite extension loading | Allows vector search and other advanced SQLite workflows | Can load native code from local paths | Selected v1 |
| In-memory DB | `:memory:` per process | No files | Fails resume-month-later requirement | Rejected |
| Repo-local DB | Store under `.pi/session-sql/` | Easy to inspect | Git noise / data risk | Rejected |
| User-global DB | Store under `~/.pi/db/session-sql/` | Persistent; out of repo; pi-scoped | Needs path expansion | Selected |
| Copy DB on fork | Fork inherits parent DB snapshot | Familiar branch semantics | Hidden state inheritance; implementation work | Rejected v1 |
| Empty DB on fork | New session starts fresh | Predictable; simple | No inherited task state | Selected |
| Blank DB | No default tables | Pure scratchpad | Agent bootstraps every time | Rejected |
| Versioned default schema | Meta + todos/deps | Useful immediately; future migrations | Slightly opinionated | Selected |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Specification | “Session” and “SQL freedom” were ambiguous | Product semantics are explicit. |
| Implementation | Agent would ask where files live and what SQL to block | Storage root and unrestricted policy are settled. |
| Review | Reviewer would debate risk boundary | Accepted risks are documented. |
| Testing | Tests would invent lifecycle behavior | Required lifecycle expectations are listed. |
| Agent execution | Agent would need to create every table | Default work schema exists but does not constrain custom tables. |

## Open Questions

### Q1: Exact Node floor?

**Resolved**: Use modern Node and built-in `node:sqlite`. Clarification Q6 selected Node `>=24`; bump root `engines.node` accordingly.

### Q2: Does unrestricted SQL mean enabling native extension loading APIs?

**Resolved**: Yes. Clarification Q8 put native SQLite extension loading in scope for v1 when Node exposes it, because vector-search-style extensions could be useful. Treat this as trusted local code execution, not a sandboxed SQL feature.

### Q3: Exact response caps?

**Resolved**: Return up to 200 rows in v1. Keep byte/query-size guards as implementation safety rails for accidental output floods.

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- The feature spec accepts or revises every Decision Summary row.
- Workshop 002 confirms the driver/runtime floor.
- Workshop 004 owns the final default schema DDL.
- Workshop 005 owns tests proving reload/resume persistence and fork-new-empty behavior.

## Quick Reference

```text
Extension name: session-sql
Tool name: sql
Storage root: ~/.pi/db/session-sql/
DB identity: <sessionId>.sqlite
SQL policy: unrestricted trusted local SQL
Persistence: survives reload/resume indefinitely
Fork/new: fresh DB + default schema
Default schema: session_sql_meta, todos, todo_deps
Response caps: 200 returned rows, to protect output only
Native extension loading: in scope when runtime supports it
```
