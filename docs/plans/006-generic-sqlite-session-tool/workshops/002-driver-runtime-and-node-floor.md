# Workshop: Driver Runtime and Node Floor

**Type**: Integration Pattern
**Plan**: 006-generic-sqlite-session-tool
**Spec**: Pending — this workshop precedes the feature spec
**Created**: 2026-05-15T03:44:22Z
**Status**: Draft

**Value Thesis**: This workshop makes the SQLite runtime dependency explicit so implementation does not accidentally ship an extension that only works on the author’s local Node version.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Preferred Direction

**Selected Value Axes**:
- **Implementation Readiness**: `store.ts` needs a concrete SQLite API and version floor.
- **Operational Reliability**: Unsupported runtimes should fail clearly.
- **Review Compression**: Reviewers can check one driver contract instead of re-opening dependency tradeoffs.
- **Migration Safety**: A narrow driver seam preserves future fallback options.

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [Workshop 001: Session SQLite Semantics and Safety Boundary](./001-session-sqlite-semantics-and-safety-boundary.md)
- [Workshop 006: Implementation Slices and Extension Boundaries](./006-implementation-slices-and-extension-boundaries.md)
- [Node SQLite API](https://nodejs.org/api/sqlite.html)
- [Node v22.5.0 release notes](https://nodejs.org/en/blog/release/v22.5.0)

---

## Purpose

Define the SQLite driver, Node version floor, runtime spike, and failure behavior for the `session-sql` extension.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Decide whether to bump `package.json#engines.node`.
- Import and use `DatabaseSync` without adding npm dependencies.
- Write tests/spikes that prove the required runtime behavior.
- Add a future fallback driver without rewriting the extension contract.

## Key Questions Addressed

- Which SQLite driver should v1 use?
- What Node version should the extension require?
- Should the repo engine be bumped or should the extension degrade on older Node?
- What runtime spike proves the driver is viable?
- Where should a future fallback seam exist?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | Driver/API choices block coding. |
| Primary Value Axis | Implementation Readiness | The store cannot be built until the driver is settled. |
| Supporting Value Axes | Operational Reliability, Review Compression, Migration Safety | Runtime compatibility affects every user of the extension. |
| Downstream Loop Improved | Architecture / Implementation / Review / Release | Later phases can cite a single runtime contract. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Local runtime check | Conversation: Node `v24.7.0`, `node:sqlite` exposes `DatabaseSync`, `enableLoadExtension`, and `loadExtension` | Driver and native extension loading viability locally | Ready |
| Typecheck spike | Conversation: `import { DatabaseSync } from "node:sqlite"` typechecked | TypeScript compatibility | Ready |
| Clarification Q6/Q8 | Spec clarifications | Node `>=24` floor and native SQLite extension loading in v1 | Ready |
| Node API docs | Related Documents | `node:sqlite` / `DatabaseSync` contract | Ready |
| Implementation spike in repo | Future execution log | Target runtime proof after spec | Missing |

## Decision Summary

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Driver | `node:sqlite` | Zero dependency; official Node API; no native npm install friction. |
| API | `DatabaseSync` | Sync execution is simplest for a single local session DB. |
| Import style | Top-level standard import | Project forbids inline/dynamic imports. |
| Proposed Node floor | `>=24` | User selected Node 24 to match local runtime and keep v1 simple. |
| Root engine | Bump root `package.json#engines.node` to `>=24` if extension is in-tree/autoloaded | A top-level import can fail before graceful degradation. |
| Fallback driver | Not in v1 | Keeps first implementation small; adapter seam remains. |
| Failure behavior | Clear startup/typecheck/runtime failure on unsupported Node | Better than silent missing tool. |

## Runtime Contract

### Store import

```typescript
import { DatabaseSync } from "node:sqlite";
```

### Why top-level import

Project rule: no inline imports and no dynamic imports for type/runtime convenience. Because `.pi/extensions/session-sql/store.ts` imports `node:sqlite` at top level, unsupported Node versions may fail extension loading before any custom guard can run.

### Engine implication

Clarified repo policy:

```json
{
  "engines": {
    "node": ">=24"
  }
}
```

Because this in-tree extension uses top-level `node:sqlite` imports and supports native SQLite extension loading, the root engine should be bumped so older Node versions fail clearly before extension loading surprises users.

## Driver Spike

Run before implementation or as Phase 0:

```bash
node -v
node - <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
console.log(typeof db.enableLoadExtension, typeof db.loadExtension);
db.exec('create table t(id integer primary key, name text)');
db.prepare('insert into t(name) values (?)').run('ok');
console.log(db.prepare('select name from t').all());
db.close();
NODE
```

Expected:

```text
function function
[ { name: 'ok' } ]
```

If Node emits an `ExperimentalWarning`, record it. The warning may be acceptable for local harness work, but the spec should name the exact runtime expectation.

## Driver Adapter Boundary

Do not over-abstract publicly, but keep a small internal seam:

```typescript
interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

interface SqlStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  iterate(...params: unknown[]): Iterable<Record<string, unknown>>;
}
```

This enables test doubles or a future `better-sqlite3`/`sql.js` driver without changing the tool contract.

## Failure Modes

| Failure | Detection | User-visible behavior | Test? |
|---------|-----------|-----------------------|-------|
| Node lacks `node:sqlite` | Extension import/startup | Clear engine/runtime failure | Manual/runtime spike |
| Node lacks native extension loading APIs | Runtime spike/store init | Native extension loading marked unavailable or startup fails clearly depending implementation | Manual/runtime spike |
| TypeScript lacks `node:sqlite` types | `npm run typecheck` | Typecheck failure | Yes |
| DB path cannot open | Store `open()` | Tagged `sqlite_error`; `/sql status` shows error | Yes |
| Schema init fails | Store `open()` | Tagged `sqlite_error`; UI notify `error` | Yes |
| Handle closed | Store method call | Tagged `not_open` | Yes |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| `node:sqlite` | Built-in Node SQLite | Zero deps; sync; official | Requires newer Node | Selected |
| `better-sqlite3` | Native package | Mature; fast | Native install friction | Rejected v1 |
| `sqlite3` | Async native package | Common | Async/callback complexity | Rejected |
| `sql.js` | WASM SQLite | No native install | Persistence complexity | Rejected |
| Bump root engine | Require compatible Node for all pij work | Honest autoload behavior | Narrows supported Node | Selected: `>=24` |
| Extension-only guard | Keep root engine lower | Less disruptive | Top-level import can fail first | Rejected unless spec insists |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Specification | Driver choice and Node floor were open | Spec can name `node:sqlite` and required Node. |
| Implementation | Agent might add native deps or dynamic imports | Driver/import path is explicit. |
| Review | Reviewers would ask why not `better-sqlite3` | Tradeoff table records decision. |
| Testing | Runtime compatibility might be implicit | Spike and typecheck evidence are required. |
| Release | Users on old Node would see surprising failures | Engine policy makes compatibility visible. |

## Open Questions

### Q1: Exact root engine bump?

**Resolved**: Bump root `engines.node` to `>=24` if `session-sql` is committed in-tree and auto-loaded.

### Q2: Should warnings fail tests?

**Direction**: No. Warnings should be recorded, but tests should fail only on API absence or behavior mismatch.

### Q3: Should fallback driver be designed now?

**Direction**: No v1 fallback. Keep the internal seam small enough to add one later.

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- The feature spec decides root engine policy.
- The Phase 0 driver spike is run and recorded, including native extension loading API presence.
- `npm run typecheck` recognizes `node:sqlite` imports.
- Store tests prove memory and file DB behavior through `DatabaseSync`.

## Quick Reference

```text
Driver: node:sqlite
API: DatabaseSync
Import: top-level standard import
Proposed Node floor: >=24
Native extension loading: in scope when Node exposes APIs
Fallback: none in v1
Proof: node spike + typecheck + store tests
```
