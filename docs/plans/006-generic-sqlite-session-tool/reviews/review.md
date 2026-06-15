# Code Review: Simple Mode

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-spec.md`  
**Phase**: Simple Mode  
**Date**: 2026-05-15  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Lightweight

## A) Verdict

**REQUEST_CHANGES**

The implementation is broadly solid and validates through the harness, but one live SQL check found a correctness bug: multi-statement SQL whose first statement is row-producing or mutating silently executes only the first statement while reporting success. That violates the generic trusted-SQL contract because the agent/operator can believe a batch ran when trailing statements were ignored.

**Key failure areas**:

- **Implementation**: `SessionSqlStore.execute()` silently ignores trailing statements for mutation/row-producing multi-statement SQL.
- **Domain compliance**: The plan domain manifest was not updated for all actual harness files touched during implementation.
- **Testing**: Store tests do not cover multi-statement SQL or oversized single-row result output.
- **Doctrine**: Extension-local `AGENTS.md` still contains generated placeholder/inaccurate acceptance text.

## B) Summary

`session-sql` follows the intended T2 extension shape, keeps `store.ts` pi-free, exposes the requested `sql` tool and `/sql` command, and has good lightweight validation evidence: 44 tests pass, smoke passes, and self-check passes. Domain docs and guides are useful, and no genuine reinvention of an existing in-tree SQLite/session-store capability was found. The live reloaded-agent check confirmed the `sql` tool is available in this session, but it also exposed the multi-statement execution bug. The remaining issues are concrete and fixable without redesigning the extension.

## C) Checklist

**Testing Approach: Lightweight**

For Lightweight:

- [x] Core validation tests present
- [x] Critical paths covered
- [x] Key verification points documented
- [ ] Multi-statement SQL behavior covered
- [ ] Result byte-cap edge case covered

Universal:

- [ ] Only in-scope files changed
- [x] Linters/type checks clean, with existing Biome schema info only
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts:279-322` | correctness | Multi-statement SQL with a mutating or row-producing first statement silently executes only the first statement and reports success. | Detect unconsumed trailing SQL after `prepare()` and either execute the whole query via `db.exec()` with an `exec` result, or reject multi-statement SQL with a tagged error. Add tests proving two inserts both run or are clearly rejected. |
| F002 | MEDIUM | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts:288-299` | performance | The result byte cap is not enforced for the first returned row, so one huge TEXT row can exceed the intended TUI/model output guardrail. | Enforce `maxResultBytes` before appending every row, including the first; return zero rows with `truncated: true` or a tagged `too_large` result for oversized first rows. Add a test with a large first row. |
| F003 | MEDIUM | `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md:25-46` | domain | Actual changed harness files are missing from the plan Domain Manifest: `harness/driver/session.ts`, `docs/project-rules/harness.md`, and `harness/scripts/packages.ts`. | Add those paths to the Domain Manifest under `extension-authoring-harness`, or explicitly mark pre-existing/unrelated drift outside the reviewed phase. |
| F004 | LOW | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/AGENTS.md:3-15` | doctrine | The generated extension-local AGENTS file still has placeholders and says `/session-sql` is registered, but the implemented command is `/sql`. | Replace placeholder text with accurate `session-sql` acceptance notes or remove the misleading generated checklist. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 — HIGH — Silent partial execution for multi-statement SQL

`SessionSqlStore.execute()` calls `this.db.prepare(query)`, classifies the prepared statement, and for row/mutation statements uses `iterate()` or `run()`. In Node `DatabaseSync`, `prepare()` can prepare only the first SQL statement while exposing the consumed SQL as `statement.sourceSQL`; it does not necessarily throw for trailing statements.

Live check through the reloaded `sql` tool:

```text
INSERT INTO todos(title) VALUES ('multi-statement-review-a');
INSERT INTO todos(title) VALUES ('multi-statement-review-b');
```

returned:

```text
sql: ok, 1 change
```

Then:

```text
SELECT title FROM todos WHERE title LIKE 'multi-statement-review-%' ORDER BY title;
```

returned only:

```text
multi-statement-review-a
```

This means the second insert was silently ignored. A robust v1 fix can be either:

- execute any query with trailing unconsumed SQL using `db.exec(query)` and return `{ ok: true, kind: "exec" }`, or
- reject multi-statement SQL explicitly with a tagged failure.

Given the spec says SQL execution is trusted/unrestricted, executing the whole multi-statement query via `exec()` is the better fit, with docs noting multi-statement batches do not return row previews.

#### F002 — MEDIUM — First-row output can bypass byte cap

The byte guard only triggers when `rows.length > 0`:

```ts
if (rows.length > 0 && returnedBytes + nextBytes > maxBytes) {
  truncated = true;
  break;
}
```

So a single huge first TEXT row can be returned in full. The acceptance criteria focus on row caps, but the implementation itself defines `DEFAULT_MAX_RESULT_BYTES`; that guard should apply to every row or return a clear `too_large`/truncated result.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New extension, docs, tests, templates, and harness files are in expected repo areas. |
| Contract-only imports | ✅ | `store.ts` imports only Node modules; `index.ts` imports store via public local exports. |
| Dependency direction | ✅ | UI/tool layer consumes store; store does not import pi runtime. |
| Domain.md updated | ✅ | New domain docs include source locations, concepts, contracts, composition, dependencies, and history. |
| Registry current | ✅ | `docs/domains/registry.md` lists the two new domains and existing harness capability. |
| No orphan files | ❌ | Domain Manifest omits actual changed harness files: `harness/driver/session.ts`, `docs/project-rules/harness.md`, and `harness/scripts/packages.ts`. |
| Map nodes current | ✅ | Domain map includes `session-work-state`, `agent-tooling-interface`, harness, and pi runtime. |
| Map edges current | ✅ | Edges are labeled; `session-work-state` → pi runtime is documented as indirect. |
| No circular business deps | ✅ | No business-domain cycle found. |
| Concepts documented | ⚠️ | Concepts exist and cover contracts, though columns differ from the review template's exact `Concept | Entry Point | What It Does` shape. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `SessionSqlStore` | None | session-work-state | proceed |
| `sql` tool and `/sql` command | None | agent-tooling-interface | proceed |
| `session-sql` smoke scenario | Existing Driver SDK scenario pattern only | extension-authoring-harness | proceed |
| `node:sqlite` Vitest shim | None found | extension-authoring-harness | proceed |

Searches did not find an existing in-tree generic session SQLite store/tool. The retired `scratch` extension is not an active duplicate.

### E.4) Testing & Evidence

**Coverage confidence**: 88%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 75 | `sql` tool and `/sql` work for single statements; live multi-statement check found silent partial execution. |
| AC2 | 95 | Smoke and docs verify `/sql status` reports `session-sql: ready`; status formatter includes session, DB, schema, native loading, and tables. |
| AC3 | 95 | `/sql schema` implemented; store schema tests cover default tables/columns. |
| AC4 | 95 | Smoke proves insert/select and stable `sql: ok` output. |
| AC5 | 90 | Store reset tested; `/sql reset` has confirmation flow but is not smoked. |
| AC6 | 100 | Store tests verify schema version and default tables. |
| AC7 | 95 | Store tests verify custom table preservation across reopen. |
| AC8 | 95 | Smoke proves `/reload`; manual resume proof recorded in execution log. |
| AC9 | 90 | Store tests simulate fresh session/fork ID independence. |
| AC10 | 95 | Path helpers and docs place DB under `~/.pi/db/session-sql/`, outside repo. |
| AC11 | 80 | Row-count cap tested; byte cap has first-row bypass. |
| AC12 | 75 | Error tagging tested; multi-statement partial execution reports misleading success. |
| AC13 | 100 | `npm run self-check` passed during implementation and review. |
| AC14 | 90 | Native loading status and missing-extension failure tested; no platform extension fixture required by spec. |

### E.5) Doctrine Compliance

Project rules reviewed: `/Users/jordanknight/pi-hacking/pij/AGENTS.md` via session context and `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md`.

- T2 layout: ✅ `.pi/extensions/session-sql/{index,store,test,smoke}.ts`.
- Pi-free store: ✅ `store.ts` has no `@earendil-works/*` imports.
- Constructor/side-effect injection: ✅ store has no pi globals; persistence location is passed in.
- Tagged returns: ✅ store uses tagged union result shapes.
- Constants in store: ✅ schema/caps/root constants live in `store.ts`.
- Structural boundary types: ✅ plain `SessionSqlLocation`, result/status types.
- `.js` relative imports: ✅ extension imports use `.js`.
- Store tests: ✅ tests target store behavior directly.
- One `session_start` handler: ✅ single handler covers all reasons.
- No `any`: ✅ no explicit `any` found in reviewed code.

Doctrine issue: extension-local `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/AGENTS.md` still contains generated placeholder text and references the wrong command.

### E.6) Harness Live Validation

Agent harness status: **HEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC1 | Reloaded-agent `sql` tool availability check | PASS | Created/read current-session review table through the tool after user reload. |
| AC1/AC12 | Reloaded-agent multi-statement SQL check | FAIL | Two-insert SQL reported success but only inserted the first row. |
| AC13 | `npm run self-check` | PASS | typecheck, lint, tests, and smoke all passed. |
| AC4/AC8 | `npm run smoke` within self-check | PASS | `smoke: session-sql ... ✓`. |

Summary: the harness is healthy and the extension loads in a real pi smoke, but live interaction uncovered F001.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Generic SQL request returns structured result | Tool live check; store/result code; F001 limits confidence | 75% |
| AC2 | `/sql status` readiness/session/default tables | Smoke + `formatStatus()` + docs | 95% |
| AC3 | `/sql schema` default schema inspection | Command code + schema tests | 95% |
| AC4 | `/sql <query>` insert/select stable output | Smoke status/insert/select/reload/select | 95% |
| AC5 | `/sql reset` fresh default store | Store reset test + command confirmation code | 90% |
| AC6 | Versioned default schema | Store tests + schema SQL | 100% |
| AC7 | Custom tables survive reopen | Store test | 95% |
| AC8 | Reload/process/resume persistence | Smoke reload + manual resume proof in execution log | 95% |
| AC9 | New/fork sessions independent | Store session-ID separation tests | 90% |
| AC10 | DB artifacts outside repo | Path helper tests + docs | 95% |
| AC11 | 200-row cap/truncation | Store row-cap tests; F002 byte-cap gap | 80% |
| AC12 | Errors tagged/readable | Error tests + formatting; F001 misleading success gap | 75% |
| AC13 | Required validation passes | Review reran `npm run self-check` successfully | 100% |
| AC14 | Native extension loading support | Store status/loadExtension test + docs | 90% |

**Overall coverage confidence**: 88%

## G) Commands Executed

```bash
git status --short
python3 - <<'PY' ... write docs/plans/006-generic-sqlite-session-tool/reviews/_computed.diff ... PY
npm run self-check
git diff --check -- README.md docs/difficulties.md docs/project-rules/harness.md docs/velocity.md harness/driver/session.ts harness/templates/extension/index.ts.template harness/templates/extension/smoke.ts.template package.json package-lock.json vitest.config.ts .pi/extensions/session-sql/index.ts .pi/extensions/session-sql/smoke.ts .pi/extensions/session-sql/store.test.ts .pi/extensions/session-sql/store.ts docs/domains/registry.md docs/domains/domain-map.md docs/domains/session-work-state/domain.md docs/domains/agent-tooling-interface/domain.md docs/how/session-sql.md docs/retros/session-sql.md docs/plans/006-generic-sqlite-session-tool docs/plans/006-generic-sqlite-session-tool/reviews/_computed.diff
node --input-type=module <<'NODE' ... DatabaseSync.prepare/sourceSQL introspection ... NODE
```

Tool interactions executed:

```text
sql: CREATE TABLE IF NOT EXISTS review_checks ...
sql: SELECT id, item, status FROM review_checks ORDER BY id DESC LIMIT 3;
sql: INSERT INTO todos(title) VALUES ('multi-statement-review-a'); INSERT INTO todos(title) VALUES ('multi-statement-review-b');
sql: SELECT title FROM todos WHERE title LIKE 'multi-statement-review-%' ORDER BY title;
sql: DELETE FROM todos WHERE title IN (...review rows...);
```

Computed diff saved at:

```text
/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-spec.md`  
**Phase**: Simple Mode  
**Tasks dossier**: inline in plan  
**Execution log**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/execution.log.md`  
**Review file**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/reviews/review.md`  
**Fix tasks**: `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/reviews/fix-tasks.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/.generated` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/AGENTS.md` | created | extension-authoring-harness | Fix F004 placeholder/wrong command |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/index.ts` | created | agent-tooling-interface | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/smoke.ts` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts` | created | session-work-state | Fix F001 and F002 |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.test.ts` | created | session-work-state | Add tests for F001/F002 |
| `/Users/jordanknight/pi-hacking/pij/README.md` | modified | agent-tooling-interface | None |
| `/Users/jordanknight/pi-hacking/pij/docs/difficulties.md` | modified | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/agent-tooling-interface/domain.md` | created | agent-tooling-interface | Optional concepts-column normalization |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | created | cross-domain | None |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/registry.md` | created | cross-domain | None |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/session-work-state/domain.md` | created | session-work-state | Optional concepts-column normalization |
| `/Users/jordanknight/pi-hacking/pij/docs/how/session-sql.md` | created | agent-tooling-interface | Document multi-statement semantics after F001 fix |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/execution.log.md` | created | extension-authoring-harness | Add fix evidence after changes |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md` | created | extension-authoring-harness | Fix F003 manifest |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-spec.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool.fltplan.md` | created | extension-authoring-harness | Add fix/re-review note if desired |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/research-dossier.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/001-session-sqlite-semantics-and-safety-boundary.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/002-driver-runtime-and-node-floor.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/003-tool-command-and-result-contract.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/004-default-schema-and-migrations.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/005-validation-and-smoke-harness.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/006-implementation-slices-and-extension-boundaries.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/workshops/007-agent-sql-use-cases-and-working-patterns.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | modified | extension-authoring-harness | Add to plan manifest or mark scope note |
| `/Users/jordanknight/pi-hacking/pij/docs/retros/session-sql.md` | created | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/docs/velocity.md` | modified | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/harness/driver/session.ts` | modified | extension-authoring-harness | Add to plan manifest |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts` | created/pre-existing untracked | extension-authoring-harness | Clarify scope; add to manifest or commit separately |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/index.ts.template` | modified | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/smoke.ts.template` | modified | extension-authoring-harness | None |
| `/Users/jordanknight/pi-hacking/pij/package.json` | modified | extension-authoring-harness | None for Plan 006 engine; beware pre-existing package-script drift |
| `/Users/jordanknight/pi-hacking/pij/package-lock.json` | modified | extension-authoring-harness | None for Plan 006 engine; beware large pre-existing formatting/dependency drift |
| `/Users/jordanknight/pi-hacking/pij/vitest.config.ts` | modified | extension-authoring-harness | None |

### Required Fixes

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts` and `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.test.ts` | Fix multi-statement handling and add regression tests. | Prevent silent partial execution while reporting success. |
| 2 | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts` and `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.test.ts` | Enforce result byte cap for the first row and add a large-row test. | Preserve TUI/model output safety guarantee. |
| 3 | `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md` | Add actual touched harness files to Domain Manifest or explicitly mark them out-of-phase. | Restore domain traceability. |
| 4 | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/AGENTS.md` | Replace placeholder/wrong command text. | Avoid misleading future agents. |

### Domain Artifacts to Update

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md` | Domain Manifest entries for `harness/driver/session.ts`, `docs/project-rules/harness.md`, and `harness/scripts/packages.ts` or a scope note separating pre-existing drift. |

### Next Step

Apply fixes, then re-run:

```text
/plan-7-v2-code-review --plan "/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md"
```
