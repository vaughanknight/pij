import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { looksMutatingSql } from "./index.js";
import {
	locationForSession,
	MAX_QUERY_BYTES,
	MAX_ROWS,
	memoryLocation,
	type SessionSqlLocation,
	SessionSqlStore,
	type SqlResult,
	type StoreOpenResult,
	safeSessionId,
} from "./store.js";

const cleanupDirs: string[] = [];

function tempRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "session-sql-test-"));
	cleanupDirs.push(dir);
	return dir;
}

function expectOpen(result: StoreOpenResult): void {
	if (!result.ok) throw new Error(result.message);
}

function expectSqlOk(result: SqlResult): Extract<SqlResult, { ok: true }> {
	if (!result.ok) throw new Error(result.message);
	return result;
}

function openStore(location: SessionSqlLocation): SessionSqlStore {
	const store = new SessionSqlStore();
	expectOpen(store.open(location));
	return store;
}

afterEach(() => {
	for (const dir of cleanupDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("session SQL path helpers", () => {
	it("sanitizes session IDs for file names", () => {
		expect(safeSessionId("abc/def:ghi")).toBe("abc_def_ghi");
		expect(safeSessionId("")).toBe("unknown-session");
	});

	it("derives file-backed locations under the provided root", () => {
		const root = tempRoot();
		const location = locationForSession("abc/def", root);
		expect(location.sessionId).toBe("abc/def");
		expect(location.rootDir).toBe(root);
		expect(location.dbPath).toBe(join(root, "abc_def.sqlite"));
	});
});

describe("session SQL changed-event classifier", () => {
	it("does not classify read-only SELECT statements as changed", () => {
		expect(looksMutatingSql("SELECT * FROM todos")).toBe(false);
		expect(looksMutatingSql("WITH recent AS (SELECT * FROM todos) SELECT * FROM recent")).toBe(
			false,
		);
	});

	it("classifies mutating SQL, including INSERT RETURNING, as changed", () => {
		expect(looksMutatingSql("INSERT INTO todos(title) VALUES ('x') RETURNING id")).toBe(true);
		expect(looksMutatingSql("UPDATE todos SET status = 'done' WHERE id = 1")).toBe(true);
		expect(looksMutatingSql("SELECT 1; DELETE FROM todos WHERE id = 1")).toBe(true);
	});
});

describe("SessionSqlStore", () => {
	it("opens an in-memory DB and reports status", () => {
		const store = openStore(memoryLocation());
		const status = store.status();
		expect(status.open).toBe(true);
		expect(status.schemaVersion).toBe(1);
		expect(status.tables).toEqual(["session_sql_meta", "todo_deps", "todos"]);
		expect(status.nativeExtensionLoading).toBe("available");
		expect(store.close()).toEqual({ ok: true });
	});

	it("opens a file DB and creates the file", () => {
		const location = locationForSession("file-session", tempRoot());
		const store = openStore(location);
		expect(store.status().dbPath).toBe(location.dbPath);
		expect(store.close()).toEqual({ ok: true });
	});

	it("bootstraps the default schema", () => {
		const store = openStore(memoryLocation());
		const schema = store.schema();
		expect(schema.map((table) => table.name)).toEqual(["session_sql_meta", "todo_deps", "todos"]);
		expect(
			schema.find((table) => table.name === "todos")?.columns.map((column) => column.name),
		).toContain("status");
		expect(store.status().schemaVersion).toBe(1);
	});

	it("inserts and selects todos", () => {
		const store = openStore(memoryLocation());
		const insert = expectSqlOk(store.execute("INSERT INTO todos(title) VALUES ('one')"));
		expect(insert.kind).toBe("change");

		const selected = expectSqlOk(store.execute("SELECT title, status FROM todos"));
		expect(selected.kind).toBe("rows");
		if (selected.kind === "rows") {
			expect(selected.rows).toEqual([{ title: "one", status: "pending" }]);
		}
	});

	it("returns rows for INSERT RETURNING", () => {
		const store = openStore(memoryLocation());
		const result = expectSqlOk(
			store.execute("INSERT INTO todos(title) VALUES ('returning') RETURNING title"),
		);
		expect(result.kind).toBe("rows");
		if (result.kind === "rows") expect(result.rows).toEqual([{ title: "returning" }]);
	});

	it("binds positional parameters for mutations and row queries", () => {
		const store = openStore(memoryLocation());
		const insert = expectSqlOk(
			store.execute("INSERT INTO todos(title, priority) VALUES (?, ?)", {
				params: ["bound positional", 3],
			}),
		);
		expect(insert.kind).toBe("change");

		const selected = expectSqlOk(
			store.execute("SELECT title, priority FROM todos WHERE priority = ?", {
				params: [3],
			}),
		);
		expect(selected.kind).toBe("rows");
		if (selected.kind === "rows") {
			expect(selected.rows).toEqual([{ title: "bound positional", priority: 3 }]);
		}
	});

	it("binds named parameters and allows bare object keys", () => {
		const store = openStore(memoryLocation());
		const result = expectSqlOk(
			store.execute(
				"INSERT INTO todos(title, priority) VALUES (:title, :priority) RETURNING title, priority",
				{
					params: { title: "bound named", priority: 7 },
				},
			),
		);
		expect(result.kind).toBe("rows");
		if (result.kind === "rows") {
			expect(result.rows).toEqual([{ title: "bound named", priority: 7 }]);
		}
	});

	it("rejects bound parameters for multi-statement batches", () => {
		const store = openStore(memoryLocation());
		const result = store.execute(
			"INSERT INTO todos(title) VALUES (?); INSERT INTO todos(title) VALUES ('second');",
			{ params: ["first"] },
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain("single SQL statement");

		const rows = expectSqlOk(store.execute("SELECT title FROM todos"));
		expect(rows.kind).toBe("rows");
		if (rows.kind === "rows") expect(rows.rows).toEqual([]);
	});

	it("executes every statement in a trusted multi-statement batch", () => {
		const store = openStore(memoryLocation());
		const result = expectSqlOk(
			store.execute(
				"INSERT INTO todos(title) VALUES ('multi a'); INSERT INTO todos(title) VALUES ('multi b');",
			),
		);
		expect(result.kind).toBe("exec");

		const rows = expectSqlOk(store.execute("SELECT title FROM todos ORDER BY title"));
		expect(rows.kind).toBe("rows");
		if (rows.kind === "rows") {
			expect(rows.rows).toEqual([{ title: "multi a" }, { title: "multi b" }]);
		}
	});

	it("preserves custom tables across reopen", () => {
		const location = locationForSession("custom", tempRoot());
		const store = openStore(location);
		expectSqlOk(store.execute("CREATE TABLE scratch(key TEXT PRIMARY KEY, value TEXT)"));
		expectSqlOk(store.execute("INSERT INTO scratch(key, value) VALUES ('a', 'b')"));
		expect(store.close()).toEqual({ ok: true });

		expectOpen(store.open(location));
		const result = expectSqlOk(store.execute("SELECT value FROM scratch WHERE key = 'a'"));
		expect(result.kind).toBe("rows");
		if (result.kind === "rows") expect(result.rows).toEqual([{ value: "b" }]);
	});

	it("separates DBs by session ID", () => {
		const root = tempRoot();
		const first = openStore(locationForSession("first", root));
		const second = openStore(locationForSession("second", root));
		expectSqlOk(first.execute("INSERT INTO todos(title) VALUES ('first only')"));
		expectSqlOk(second.execute("INSERT INTO todos(title) VALUES ('second only')"));

		const firstRows = expectSqlOk(first.execute("SELECT title FROM todos"));
		const secondRows = expectSqlOk(second.execute("SELECT title FROM todos"));
		expect(firstRows.kind).toBe("rows");
		expect(secondRows.kind).toBe("rows");
		if (firstRows.kind === "rows") expect(firstRows.rows).toEqual([{ title: "first only" }]);
		if (secondRows.kind === "rows") expect(secondRows.rows).toEqual([{ title: "second only" }]);
	});

	it("simulates fork/new semantics with a fresh session ID", () => {
		const root = tempRoot();
		const parent = openStore(locationForSession("parent", root));
		expectSqlOk(parent.execute("INSERT INTO todos(title) VALUES ('parent row')"));

		const fork = openStore(locationForSession("fork", root));
		const forkRows = expectSqlOk(fork.execute("SELECT title FROM todos"));
		expect(forkRows.kind).toBe("rows");
		if (forkRows.kind === "rows") expect(forkRows.rows).toEqual([]);
		expect(fork.status().tables).toEqual(["session_sql_meta", "todo_deps", "todos"]);
	});

	it("returns tagged sqlite errors", () => {
		const store = openStore(memoryLocation());
		const result = store.execute("SELECT * FROM missing_table");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("sqlite_error");
	});

	it("rejects oversized query text", () => {
		const store = openStore(memoryLocation());
		const result = store.execute(" ".repeat(MAX_QUERY_BYTES + 1));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("too_large");
	});

	it("caps returned rows and marks truncation", () => {
		const store = openStore(memoryLocation());
		for (let i = 0; i < 5; i++) {
			expectSqlOk(store.execute(`INSERT INTO todos(title) VALUES ('todo ${i}')`));
		}
		const result = expectSqlOk(
			store.execute("SELECT title FROM todos ORDER BY id", { maxRows: 3 }),
		);
		expect(result.kind).toBe("rows");
		if (result.kind === "rows") {
			expect(result.rows).toHaveLength(3);
			expect(result.truncated).toBe(true);
		}
	});

	it("treats maxRows 0 as no returned rows", () => {
		const store = openStore(memoryLocation());
		expectSqlOk(store.execute("INSERT INTO todos(title) VALUES ('hidden')"));
		const result = expectSqlOk(store.execute("SELECT title FROM todos", { maxRows: 0 }));
		expect(result.kind).toBe("rows");
		if (result.kind === "rows") {
			expect(result.rows).toEqual([]);
			expect(result.truncated).toBe(true);
		}
	});

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

	it("enforces the 200-row maximum", () => {
		const store = openStore(memoryLocation());
		for (let i = 0; i < MAX_ROWS + 1; i++) {
			expectSqlOk(store.execute(`INSERT INTO todos(title) VALUES ('todo ${i}')`));
		}
		const result = expectSqlOk(
			store.execute("SELECT title FROM todos ORDER BY id", { maxRows: MAX_ROWS + 100 }),
		);
		expect(result.kind).toBe("rows");
		if (result.kind === "rows") {
			expect(result.rows).toHaveLength(MAX_ROWS);
			expect(result.truncated).toBe(true);
		}
	});

	it("closes idempotently", () => {
		const store = openStore(memoryLocation());
		expect(store.close()).toEqual({ ok: true });
		expect(store.close()).toEqual({ ok: true });
	});

	it("resets the current DB", () => {
		const store = openStore(locationForSession("reset", tempRoot()));
		expectSqlOk(store.execute("INSERT INTO todos(title) VALUES ('gone')"));
		expectOpen(store.reset());
		const rows = expectSqlOk(store.execute("SELECT title FROM todos"));
		expect(rows.kind).toBe("rows");
		if (rows.kind === "rows") expect(rows.rows).toEqual([]);
		expect(store.status().schemaVersion).toBe(1);
	});

	it("rejects invalid todo status", () => {
		const store = openStore(memoryLocation());
		const result = store.execute("INSERT INTO todos(title, status) VALUES ('bad', 'nope')");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("sqlite_error");
	});

	it("cascades todo dependency deletion", () => {
		const store = openStore(memoryLocation());
		expectSqlOk(store.execute("INSERT INTO todos(title) VALUES ('a')"));
		expectSqlOk(store.execute("INSERT INTO todos(title) VALUES ('b')"));
		expectSqlOk(store.execute("INSERT INTO todo_deps(todo_id, depends_on) VALUES (2, 1)"));
		expectSqlOk(store.execute("DELETE FROM todos WHERE id = 1"));
		const rows = expectSqlOk(store.execute("SELECT * FROM todo_deps"));
		expect(rows.kind).toBe("rows");
		if (rows.kind === "rows") expect(rows.rows).toEqual([]);
	});

	it("reports native extension loading availability", () => {
		const store = openStore(memoryLocation());
		expect(store.status().nativeExtensionLoading).toBe("available");
		const result = store.loadExtension("/definitely/missing/sqlite-extension");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("sqlite_error");
	});
});
