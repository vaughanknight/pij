# Workshop: Implementation Slices and Extension Boundaries

**Type**: Integration Pattern
**Plan**: 006-generic-sqlite-session-tool
**Spec**: Pending — this workshop precedes the feature spec
**Created**: 2026-05-15T03:44:22Z
**Status**: Draft

**Value Thesis**: This workshop turns the design into safe implementation slices that preserve pij’s extension rules and keep pi wiring, SQLite logic, tests, and harness improvements separated.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Implementation Ready

**Selected Value Axes**:
- **Implementation Readiness**: The architect/implementer can convert slices into tasks.
- **Safety to Change**: Boundaries prevent pi API, SQLite, and harness code from tangling.
- **Review Compression**: Each file and phase has a checkable responsibility.
- **Learning Compounding**: Friction becomes a harness/template fix when appropriate.

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [Workshop 001: Session SQLite Semantics and Safety Boundary](./001-session-sqlite-semantics-and-safety-boundary.md)
- [Workshop 002: Driver Runtime and Node Floor](./002-driver-runtime-and-node-floor.md)
- [Workshop 003: Tool, Command, and Result Contract](./003-tool-command-and-result-contract.md)
- [Workshop 004: Default Schema and Migrations](./004-default-schema-and-migrations.md)
- [Workshop 005: Validation and Smoke Harness](./005-validation-and-smoke-harness.md)
- [`AGENTS.md`](../../../../AGENTS.md)
- [`RUNBOOK.md`](../../../../RUNBOOK.md)

---

## Purpose

Define implementation slices, file boundaries, and review checks for the future `session-sql` extension. This workshop is the bridge from design workshops to `/plan-3-architect` and phase tasks.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Scaffold the extension in the correct layout.
- Keep pi wiring in `index.ts` and SQLite logic in `store.ts`.
- Implement slices in an order that produces validation evidence early.
- Identify which harness/template fixes are allowed in scope.

## Key Questions Addressed

- Which files should exist in the extension?
- What belongs in `index.ts` versus `store.ts`?
- What implementation order reduces risk fastest?
- Where do result formatting and path resolution belong?
- Which harness fixes are permitted if friction appears?
- What review checklist should gate implementation?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | The next architect step should be able to convert this into phases. |
| Primary Value Axis | Implementation Readiness | Slices define the build order and boundaries. |
| Supporting Value Axes | Safety to Change, Review Compression, Learning Compounding | Clean boundaries lower review and future-change cost. |
| Downstream Loop Improved | Architecture / Implementation / Review / Harness improvement | Agents can work phase-by-phase without broad rediscovery. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| P1-P10 project rules | `../../../../AGENTS.md` | Extension layout and boundaries | Ready |
| Runbook workflow | `../../../../RUNBOOK.md` | Scaffold/iterate/smoke commands | Ready |
| Workshops 001-005 | Related Documents | Product, driver, contract, schema, validation decisions | Ready |
| Existing templates/generator | `harness/templates/extension/*`, `harness/scripts/new-extension.ts` | Scaffold path | Ready |
| Final plan phases | Future `/plan-3-architect` output | Conversion to implementation tasks | Missing |

## Extension File Boundary

```text
.pi/extensions/session-sql/
├── AGENTS.md          # generated checklist
├── index.ts           # pi wiring only
├── store.ts           # SQLite/session DB logic, no pi imports
├── store.test.ts      # vitest store tests
└── smoke.ts           # Driver SDK scenario
```

## Responsibility Split

| File | Owns | Must Not Own |
|------|------|--------------|
| `index.ts` | `registerTool`, `registerCommand`, lifecycle hooks, UI notify/status, session ID/root resolution, result text formatting | Raw schema DDL internals, direct SQL driver complexity beyond store calls |
| `store.ts` | `DatabaseSync`, path helpers, schema init, SQL execution, result caps, reset, status, tagged result types | Imports from `@earendil-works/*`, TUI notifications, pi session manager |
| `store.test.ts` | Store unit tests with temp dirs and memory DB | Pi runtime mocks or TUI behavior |
| `smoke.ts` | Deterministic `/sql` TUI flow | Model-dependent tool selection |
| `AGENTS.md` | Local extension checklist | Duplicating root policy wholesale |

## Implementation Slices

### Slice 0 — Runtime spike

Goal: prove `node:sqlite` works on target Node.

Evidence:

- `node -v`
- `DatabaseSync(':memory:')` create/insert/select/close
- Typecheck top-level import

Exit criteria:

- Feature spec/plan names Node floor and engine policy.

### Slice 1 — Scaffold and baseline

Goal: create T2 extension shape.

```bash
npm run new -- session-sql
```

Immediate cleanup:

- Replace generated ping tool.
- Replace generated smoke with current Driver SDK shape.
- Ensure status clearing uses `undefined`, not `""`.

Exit criteria:

- Placeholder extension typechecks.

### Slice 2 — Store core

Goal: pi-free `SessionSqlStore`.

```typescript
export class SessionSqlStore {
  open(location: SessionSqlLocation): SqlResult;
  close(): SqlResult;
  execute(query: string, opts?: ExecuteOptions): SqlResult;
  status(): StatusResult;
  reset(): SqlResult;
}
```

Exit criteria:

- Store tests cover open/bootstrap/execute/reopen/session separation.

### Slice 3 — Default schema and migrations

Goal: implement Workshop 004 DDL and version metadata.

Exit criteria:

- Tests prove `session_sql_meta`, `todos`, `todo_deps` exist.
- Tests prove custom tables survive reopen/bootstrap.

### Slice 4 — Pi lifecycle wiring

Goal: current-session DB opens/closes correctly.

Implementation:

- `session_start`: derive session ID/root and call `store.open()`.
- `session_shutdown`: call `store.close()`.
- `refreshStatus`: show ready/error or clear with `undefined`.

Exit criteria:

- `/sql status` works manually.

### Slice 5 — Tool and command contract

Goal: implement Workshop 003.

Exit criteria:

- `sql` tool registered with `executionMode: "sequential"`.
- `/sql`, `/sql status`, `/sql schema`, `/sql <query>`, `/sql reset` implemented.
- Tool and command share store/result classification.

### Slice 6 — Smoke and manual resume proof

Goal: prove integration and persistence.

Exit criteria:

- `npm run smoke -- session-sql` passes.
- Manual quit/resume proof recorded.

### Slice 7 — Harness improvement if encountered

Goal: encode friction in the harness.

Allowed candidates:

- Update `harness/templates/extension/smoke.ts.template` if stale shape is confirmed.
- Update `harness/templates/extension/index.ts.template` to clear status with `undefined` if still drifting.
- Add a tiny reusable helper only after duplication.
- Add a `docs/difficulties.md` row for new friction.

## Path Resolution Ownership

```typescript
interface SessionSqlLocation {
  sessionId: string;
  rootDir: string;
  dbPath: string;
}
```

| Helper | Owner | Reason |
|--------|-------|--------|
| `getSessionId()` call | `index.ts` | pi API belongs in wiring |
| `defaultRootDir(home)` | `store.ts` or small helper in `store.ts` | no pi dependency required |
| `safeSessionId(id)` | `store.ts` | storage invariant |
| `locationForSession(sessionId, rootDir)` | `store.ts` | path derivation testable without pi |

## Result Formatting Ownership

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Store formats text | One place for output | Store owns presentation | Rejected |
| Store returns structured result; `index.ts` formats text | Clean pi-free store; UI/tool formatting in wiring | Some formatting code in `index.ts` | Selected |

## Harness Fix Boundary

Allowed without separate approval when encountered during this implementation:

- Narrow smoke template update to current Driver SDK step shape.
- Narrow status-clear template update from `""` to `undefined`.
- Difficulty ledger row for any new runtime/pi issue.

Not allowed without explicit approval:

- Replacing npm scripts/toolchain.
- Modifying installed pi binary or pi-mono checkout.
- Large smoke runner redesign.
- Publishing packages.

## Review Checklist

- [ ] T2 layout: `.pi/extensions/session-sql/{index,store,store.test,smoke}.ts`.
- [ ] `store.ts` imports no `@earendil-works/*` packages.
- [ ] No `any` types unless explicitly justified.
- [ ] No inline/dynamic imports.
- [ ] Relative imports include `.js`.
- [ ] One `session_start` handler handles startup/reload/new/resume/fork.
- [ ] `session_shutdown` closes DB handle.
- [ ] Status clearing uses `undefined`.
- [ ] Notify uses only `info | warning | error`.
- [ ] `sql` tool uses `executionMode: "sequential"`.
- [ ] Unit tests target store behavior.
- [ ] Smoke targets `/sql`, not LLM tool selection.
- [ ] DB path is under `~/.pi/db/session-sql/`, not repo.
- [ ] Manual resume proof is recorded before final completion claim.

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Store owns pi session manager | Store reads `ctx` directly | Fewer parameters | Violates pi-free store | Rejected |
| Index passes plain location | `index.ts` extracts session data, store handles paths | Testable and pi-free | Slight plumbing | Selected |
| Store formats all text | Centralizes output | Blurs domain/presentation | Rejected |
| Index formats result text | Keeps store structured | More wiring code | Selected |
| Implement all at once | Fast apparent progress | Harder review/debug | Rejected |
| Slice by runtime/store/wiring/smoke | Evidence after each step | More ceremony | Selected |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Architecture | Phase boundaries were implicit | Slice plan maps directly to phases. |
| Implementation | Agent might mix pi and SQLite code | File boundaries are explicit. |
| Review | Reviewer would infer responsibilities | Checklist names invariants. |
| Harness improvement | Friction might become markdown-only | Allowed harness fixes are scoped. |
| Testing | Smoke/unit split might blur | Validation owner per slice is clear. |

## Open Questions

### Q1: Should template fixes be included in the same implementation plan?

**Direction**: Include only if encountered and narrow. The harness is the product, but avoid broad unrelated rewrites.

### Q2: Should path helpers live in a separate file?

**Direction**: No for v1. Keep T2 simple; split only if store grows too large.

### Q3: Should result text formatting move to a separate module?

**Direction**: No for v1. Keep in `index.ts`; extract after duplication or complexity.

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- `/plan-3-architect` can convert slices into phases without new discovery.
- Review checklist is copied or referenced in task dossiers.
- Implementation keeps store pi-free and command/tool wiring in `index.ts`.
- Any harness friction discovered during implementation is either encoded or logged in `docs/difficulties.md`.

## Quick Reference

```text
Build order:
0 runtime spike
1 scaffold
2 store core
3 default schema
4 pi lifecycle
5 tool + /sql command
6 smoke + manual resume proof
7 narrow harness fix if encountered
```
