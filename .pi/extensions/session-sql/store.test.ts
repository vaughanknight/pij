import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { looksMutatingSql } from "./index.js";
import {
	executeAtPath,
	locationForSession,
	MAX_QUERY_BYTES,
	MAX_ROWS,
	memoryLocation,
	resolveRepoDbPath,
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

describe("resolveRepoDbPath", () => {
	// On macOS, tmpdir() returns /var/folders/... but realpath resolves to
	// /private/var/folders/... — canonicalising the root upfront keeps the
	// expected/actual comparisons aligned.
	function repo(): { root: string; cwd: string } {
		const root = realpathSync(tempRoot());
		const cwd = join(root, "pkg");
		mkdirSync(cwd, { recursive: true });
		return { root, cwd };
	}

	it("accepts a path relative to cwd that stays inside the repo", () => {
		const { root, cwd } = repo();
		const result = resolveRepoDbPath("data/notes.sqlite", root, cwd);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.absolutePath).toBe(join(root, "pkg", "data", "notes.sqlite"));
			expect(result.relativePath).toBe(join("pkg", "data", "notes.sqlite"));
		}
	});

	it("accepts an absolute path inside the repo", () => {
		const { root, cwd } = repo();
		const target = join(root, "share.sqlite");
		const result = resolveRepoDbPath(target, root, cwd);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.relativePath).toBe("share.sqlite");
	});

	it("rejects a path outside the repo", () => {
		const { root, cwd } = repo();
		const result = resolveRepoDbPath("/tmp/escape.sqlite", root, cwd);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("outside_repo");
	});

	it("rejects relative paths that escape via ..", () => {
		const { root, cwd } = repo();
		const result = resolveRepoDbPath("../../escape.sqlite", root, cwd);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("outside_repo");
	});

	it("rejects paths whose any segment is .git (covers root and nested submodules)", () => {
		const { root, cwd } = repo();
		const result = resolveRepoDbPath("../.git/sneak.sqlite", root, cwd);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("git_internal");
		const nested = resolveRepoDbPath("sub/.git/sneak.sqlite", root, cwd);
		expect(nested.ok).toBe(false);
		if (!nested.ok) expect(nested.reason).toBe("git_internal");
	});

	it("rejects empty paths", () => {
		const { root, cwd } = repo();
		const result = resolveRepoDbPath("   ", root, cwd);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("invalid_path");
	});

	it("rejects symlinks that escape the repo (target missing)", () => {
		const { root, cwd } = repo();
		const outside = realpathSync(mkdtempSync(join(tmpdir(), "session-sql-escape-")));
		cleanupDirs.push(outside);
		const linkPath = join(root, "leak.sqlite");
		symlinkSync(join(outside, "real.sqlite"), linkPath);
		const result = resolveRepoDbPath(linkPath, root, cwd);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("outside_repo");
	});

	it("allows ..-relative paths that land back inside the repo", () => {
		const { root, cwd } = repo();
		const result = resolveRepoDbPath("../sibling/notes.sqlite", root, cwd);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.relativePath).toBe(join("sibling", "notes.sqlite"));
		}
	});
});

describe("executeAtPath", () => {
	it("creates a new SQLite file on first use without bootstrapping default schema", () => {
		const root = tempRoot();
		const target = join(root, "fresh", "repo.sqlite");
		const result = executeAtPath(target, "CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT)");
		expect(result.ok).toBe(true);
		expect(existsSync(target)).toBe(true);

		const tablesResult = executeAtPath(
			target,
			"SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
		);
		expect(tablesResult.ok).toBe(true);
		if (tablesResult.ok && tablesResult.kind === "rows") {
			expect(tablesResult.rows.map((row) => row.name)).toEqual(["notes"]);
		}
	});

	it("persists writes between separate calls (open/exec/close round-trip)", () => {
		const root = tempRoot();
		const target = join(root, "round-trip.sqlite");
		expect(executeAtPath(target, "CREATE TABLE k(v TEXT)").ok).toBe(true);
		expect(executeAtPath(target, "INSERT INTO k(v) VALUES ('hello')").ok).toBe(true);

		const read = executeAtPath(target, "SELECT v FROM k");
		expect(read.ok).toBe(true);
		if (read.ok && read.kind === "rows") {
			expect(read.rows).toEqual([{ v: "hello" }]);
		}
	});

	it("does not leave WAL/SHM sidecar files behind between calls", () => {
		const root = tempRoot();
		const target = join(root, "no-sidecars.sqlite");
		expect(executeAtPath(target, "CREATE TABLE t(v INTEGER)").ok).toBe(true);
		expect(executeAtPath(target, "INSERT INTO t(v) VALUES (1)").ok).toBe(true);
		expect(existsSync(`${target}-wal`)).toBe(false);
		expect(existsSync(`${target}-shm`)).toBe(false);
	});

	it("returns tagged errors for invalid SQL without crashing", () => {
		const root = tempRoot();
		const target = join(root, "errors.sqlite");
		const result = executeAtPath(target, "SELECT * FROM definitely_not_a_table");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("sqlite_error");
	});

	it("rejects oversized queries before opening the DB", () => {
		const root = tempRoot();
		const target = join(root, "oversize.sqlite");
		const result = executeAtPath(target, " ".repeat(MAX_QUERY_BYTES + 1));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("too_large");
		expect(existsSync(target)).toBe(false);
	});
});

