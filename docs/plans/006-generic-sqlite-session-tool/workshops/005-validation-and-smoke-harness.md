# Workshop: Validation and Smoke Harness

**Type**: Integration Pattern / CLI Flow
**Plan**: 006-generic-sqlite-session-tool
**Spec**: Pending — this workshop precedes the feature spec
**Created**: 2026-05-15T03:44:22Z
**Status**: Draft

**Value Thesis**: This workshop makes the extension provable through fast store tests and deterministic `/sql` smoke, avoiding flaky validation based on model tool-call choices.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Proof Quality**: Persistence, schema, and lifecycle claims need concrete evidence.
- **Agent Readiness**: Future agents should be able to validate changes without human invention.
- **Operational Reliability**: Smoke should catch reload-sensitive failures early.
- **Learning Compounding**: Harness gotchas should become encoded checks or ledger entries.

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [Workshop 001: Session SQLite Semantics and Safety Boundary](./001-session-sqlite-semantics-and-safety-boundary.md)
- [Workshop 003: Tool, Command, and Result Contract](./003-tool-command-and-result-contract.md)
- [Workshop 004: Default Schema and Migrations](./004-default-schema-and-migrations.md)
- [`docs/project-rules/harness.md`](../../../project-rules/harness.md)
- [`docs/difficulties.md`](../../../difficulties.md)

---

## Purpose

Define the validation strategy for `session-sql`: store-level unit tests, deterministic TUI smoke through `/sql`, full harness checks, and a manual resume proof.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Write the `store.test.ts` matrix.
- Author a current Driver SDK-compatible `smoke.ts`.
- Know what belongs in unit tests vs smoke vs manual proof.
- Record new harness friction in the difficulty ledger.

## Key Questions Addressed

- How do we prove SQLite behavior without a pi runtime?
- How do we smoke test the extension deterministically?
- Which lifecycle behavior must smoke cover?
- How do we prove month-later resume persistence?
- Which known harness gotchas must implementation avoid?
- What checks must pass before considering the extension ready?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | Tests and smoke scenarios can be implemented directly from this matrix. |
| Primary Value Axis | Proof Quality | The feature is only useful if persistence and schema behavior are proven. |
| Supporting Value Axes | Agent Readiness, Operational Reliability, Learning Compounding | Future agents inherit the validation loop. |
| Downstream Loop Improved | Implementation / Testing / Review / Agent execution | Builders know exactly what evidence to produce. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| BIO harness contract | `../../../project-rules/harness.md` | `npm run self-check`, smoke expectations | Ready |
| Prior difficulties | `../../../difficulties.md` | Known gotchas to avoid | Ready |
| Tool/command stable phrases | Workshop 003 | Smoke assertions | Ready |
| Store test matrix | This workshop | Unit test implementation | Ready |
| Passing `npm run smoke -- session-sql` | Future implementation output | pi lifecycle proof | Missing |
| Manual resume proof | Future execution/velocity log | month-later persistence claim | Missing |

## Validation Layers

| Layer | Command | Proves | Required? |
|-------|---------|--------|-----------|
| Runtime spike | `node - <<'NODE' ...` | `node:sqlite` works | Yes |
| Typecheck | `npm run typecheck` | Node/TypeScript/pi API compatibility | Yes |
| Store tests | `npm test` | SQLite behavior without pi runtime | Yes |
| Lint | `npm run lint` | Biome/project style | Yes |
| Extension smoke | `npm run smoke -- session-sql` | pi loads extension and `/sql` survives reload | Yes |
| Full harness | `npm run self-check` | Integrated validation pipeline | Yes |
| Manual resume proof | human/agent run | DB survives process exit and later resume | Yes before final claim |

## Store Unit Test Matrix

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| ST-01 | opens memory DB | `:memory:` | status ready |
| ST-02 | opens file DB | temp dir + session ID | file created |
| ST-03 | bootstraps schema | new DB | `session_sql_meta`, `todos`, `todo_deps` exist |
| ST-04 | schema version | new DB | version `1` |
| ST-05 | inserts todo | default schema | row selectable |
| ST-06 | supports custom table | `CREATE TABLE scratch...` | custom row selectable |
| ST-07 | persists reopen | close + reopen same path | row remains |
| ST-08 | separates sessions | two session IDs | rows do not cross |
| ST-09 | fork semantics simulation | new session ID after source insert | new DB has schema but no source rows |
| ST-10 | invalid SQL | `select * from nope` | `{ ok:false, reason:"sqlite_error" }` |
| ST-11 | caps rows | insert > cap rows | `truncated: true` |
| ST-12 | closes idempotently | close twice | no throw / tagged ok |
| ST-13 | reset | reset DB | default schema exists; previous rows gone |
| ST-14 | unrestricted SQL smoke | representative `PRAGMA` / DDL | allowed unless runtime rejects |

## Smoke Strategy

Do **not** smoke by asking the model to call the tool. Smoke through `/sql` because command output is deterministic and exercises the same store.

### Required scenario shape

Use current Driver SDK steps, not legacy `{ send, expect, delay }` shape.

```typescript
import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
  name: "session-sql",
  steps: [
    { kind: "type", text: "/sql status" },
    { kind: "press", key: "Enter" },
    { kind: "wait", expect: /session-sql: ready/, timeoutMs: 5000 },

    { kind: "type", text: "/sql insert into todos(title) values ('smoke todo')" },
    { kind: "press", key: "Enter" },
    { kind: "wait", expect: /sql: ok/, timeoutMs: 5000 },

    { kind: "type", text: "/sql select title from todos where title = 'smoke todo'" },
    { kind: "press", key: "Enter" },
    { kind: "wait", expect: /smoke todo/, timeoutMs: 5000 },

    { kind: "type", text: "/reload" },
    { kind: "press", key: "Enter" },
    { kind: "wait", expect: /reloaded|reload|session-sql/i, timeoutMs: 10000 },

    { kind: "type", text: "/sql select title from todos where title = 'smoke todo'" },
    { kind: "press", key: "Enter" },
    { kind: "wait", expect: /smoke todo/, timeoutMs: 5000 },
  ],
};

export default scenario;
```

## Manual Resume Proof

Smoke proves reload, not long-lived resume. Do a manual proof during implementation:

```text
1. Start pi from pij root.
2. /sql insert into todos(title) values ('manual resume proof')
3. /sql status — record session ID.
4. Quit pi.
5. Restart/resume same session.
6. /sql select title from todos where title = 'manual resume proof'
7. Confirm row exists.
```

Record the evidence in the implementation execution log or `docs/velocity.md`.

## What Not To Test in Smoke

| Avoid | Reason | Test elsewhere |
|-------|--------|----------------|
| LLM tool call selection | nondeterministic | unit/tool contract tests |
| `/sql reset` confirmation | confirmation UI adds fragility | store test/manual |
| Huge result output | slow/flaky TUI | store test |
| Process exit + resume | smoke session lifecycle mismatch | manual proof |
| Full unrestricted SQL surface | environment-specific | focused store tests |

## Harness Gotchas to Encode/Avoid

| Gotcha | Source | Action |
|--------|--------|--------|
| `setStatus(key, "")` does not clear | D-006 | Use `undefined` when clearing |
| `notify(..., "success")` invalid | D-018 | Use `"info"` for success |
| Smoke requires tmux/pi | harness contract | Keep smoke local unless CI supports it |
| Generated smoke template may be stale | scout finding | Use current Driver SDK shape; fix template if it hurts |
| Custom entries + compact unverified | D-005 | Do not rely on `appendEntry` for DB state |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Test only via store | Fast and deterministic | No pi lifecycle proof | Insufficient |
| Smoke via model prompt | Tests real model loop | Flaky, slow, nondeterministic | Rejected |
| Smoke via `/sql` | Deterministic, exercises wiring/store | Requires command surface | Selected |
| Manual resume proof | Human/agent validates process exit/resume | Not fully automated | Selected |
| Automate resume in smoke | Stronger proof | More tmux/session complexity | Defer |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Agent might under-test persistence | Store matrix names required cases. |
| Smoke authoring | Agent might use stale template shape | Current Driver SDK pattern is shown. |
| Review | Reviewer would ask what proves resume | Manual proof requirement is explicit. |
| Harness evolution | Gotchas might be rediscovered | Known difficulties are linked to actions. |

## Open Questions

### Q1: Should smoke template be fixed during implementation?

**Direction**: Yes if the generated template is confirmed stale and slows this extension. Keep the fix narrow.

### Q2: Should manual resume proof block merge?

**Direction**: It should block claiming long-lived resume support as complete. Store reopen tests plus smoke are not enough for the user’s “resume a month later” intent.

### Q3: Should smoke reset DB before running?

**Direction**: Prefer unique inserted values or isolated session rather than reset confirmation in smoke.

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- Store tests cover ST-01 through ST-14 or documented equivalents.
- `npm run smoke -- session-sql` proves status → insert → select → reload → select.
- `npm run self-check` passes.
- Manual resume proof is recorded before final completion.
- Any new harness friction is recorded in `docs/difficulties.md` and encoded if small.

## Quick Reference

```bash
npm run new -- session-sql
npm run typecheck
npm test
npm run lint
npm run smoke -- session-sql
npm run self-check
```
