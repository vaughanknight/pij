# Fix Tasks: Simple Mode

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make multi-statement SQL truthful

- **Severity**: HIGH
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.test.ts`
- **Issue**: `DatabaseSync.prepare(query)` can prepare only the first SQL statement. `SessionSqlStore.execute()` then runs that first statement and reports success, silently ignoring trailing statements for row-producing/mutating SQL.
- **Fix**:
  1. After `prepare(query)`, compare the prepared statement's consumed SQL (`statement.sourceSQL`) against the original query.
  2. If non-whitespace trailing SQL remains, either:
     - execute the whole query via `db.exec(query)` and return `{ ok: true, kind: "exec" }`, or
     - reject with a tagged failure that clearly says multi-statement row/mutation queries are unsupported.
  3. Prefer `db.exec(query)` because Plan 006 intentionally allows unrestricted trusted SQL.
  4. Add tests proving two-statement batches do not silently partially execute.
  5. Document multi-statement semantics in `docs/how/session-sql.md` if behavior is `exec` with no row preview.
- **Patch hint**:

```diff
 const statement = this.db.prepare(query);
+const trailingSql = query.slice(statement.sourceSQL.length).trim();
+if (trailingSql.length > 0) {
+  this.db.exec(query);
+  return { ok: true, kind: "exec", dbPath: this.location.dbPath };
+}
 const columns = statement.columns().map((column) => column.name);
```

Regression-test hint:

```ts
it("executes every statement in a trusted multi-statement batch", () => {
  const store = openStore(memoryLocation());
  const result = expectSqlOk(
    store.execute(
      "INSERT INTO todos(title) VALUES ('a'); INSERT INTO todos(title) VALUES ('b');",
    ),
  );
  expect(result.kind).toBe("exec");
  const rows = expectSqlOk(store.execute("SELECT title FROM todos ORDER BY title"));
  expect(rows.kind).toBe("rows");
  if (rows.kind === "rows") expect(rows.rows).toEqual([{ title: "a" }, { title: "b" }]);
});
```

## Medium / Low Fixes

### FT-002: Enforce result byte cap for the first row

- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/store.test.ts`
- **Issue**: `rows.length > 0 && returnedBytes + nextBytes > maxBytes` lets the first row bypass `maxResultBytes`, so one huge TEXT row can flood output.
- **Fix**: Apply the byte check before appending every row. If the first row is too large, return zero rows with `truncated: true` or a tagged `too_large` result; be consistent with existing row-cap behavior.
- **Patch hint**:

```diff
 const nextBytes = jsonSize(row);
-if (rows.length > 0 && returnedBytes + nextBytes > maxBytes) {
+if (returnedBytes + nextBytes > maxBytes) {
   truncated = true;
   break;
 }
```

Regression-test hint:

```ts
it("does not return an oversized first row", () => {
  const store = openStore(memoryLocation());
  expectSqlOk(store.execute("CREATE TABLE big(value TEXT)"));
  expectSqlOk(store.execute(`INSERT INTO big(value) VALUES ('${"x".repeat(128)}')`));
  const result = expectSqlOk(store.execute("SELECT value FROM big", { maxResultBytes: 32 }));
  expect(result.kind).toBe("rows");
  if (result.kind === "rows") {
    expect(result.rows).toEqual([]);
    expect(result.truncated).toBe(true);
  }
});
```

### FT-003: Restore Domain Manifest traceability for actual harness files touched

- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/docs/plans/006-generic-sqlite-session-tool/generic-sqlite-session-tool-plan.md`
- **Issue**: The Domain Manifest omits changed files discovered during implementation/review: `harness/driver/session.ts`, `docs/project-rules/harness.md`, and `harness/scripts/packages.ts`.
- **Fix**: Add these paths under `extension-authoring-harness`, or explicitly record which were pre-existing unrelated drift and should be committed separately.
- **Patch hint**:

```diff
 | `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/smoke.ts.template` | extension-authoring-harness | internal | Conditional narrow fix if scaffold still emits legacy `{ send, expect, delay }` smoke shape. |
+| `/Users/jordanknight/pi-hacking/pij/harness/driver/session.ts` | extension-authoring-harness | internal | Narrow Driver SDK idle-detection fix discovered by `session-sql` smoke status-line behavior. |
+| `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | extension-authoring-harness | contract | Harness history updated for `session-sql` validation/template/runtime friction. |
+| `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts` | extension-authoring-harness | internal | Pre-phase self-check formatting repair approved by user; clarify if committed with this phase or separately. |
```

### FT-004: Replace generated placeholder `AGENTS.md` content

- **Severity**: LOW
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/session-sql/AGENTS.md`
- **Issue**: The file still says “Brief description goes here,” has unchecked generated acceptance items, and says `/session-sql` is registered even though the command is `/sql`.
- **Fix**: Update it to a concise extension-local guide that points future agents at `/sql`, `store.ts`, `index.ts`, `smoke.ts`, and the validation commands.
- **Patch hint**:

```diff
-# session-sql
-
-(Brief description goes here.)
+# session-sql
+
+Session-scoped SQLite workbench extension. Storage logic belongs in
+`store.ts`; pi lifecycle/tool/command wiring belongs in `index.ts`.
@@
-- [ ] `cd pij && pi` loads without error; `/session-sql` registered
+- [ ] `cd pij && pi` loads without error; `/sql status` reports ready
```

## Re-Review Checklist

- [x] FT-001 applied and regression-tested
- [x] FT-002 applied and regression-tested
- [x] FT-003 applied or scope note recorded
- [x] FT-004 applied
- [x] `npm run typecheck` passes
- [x] `npm test` passes
- [x] `npm run lint` passes or only reports existing Biome schema info
- [x] `npm run smoke -- session-sql` passes
- [x] `npm run self-check` passes
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
