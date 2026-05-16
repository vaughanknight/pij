import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";

import {
	locationForSession,
	memoryLocation,
	type SessionSqlLocation,
	SessionSqlStore,
	type SqlResult,
	type StoreOpenResult,
} from "../session-sql/store.js";
import { type TodoStripTheme, TodoStripWidget } from "./index.js";
import {
	formatTodoRow,
	parseTodoCommand,
	TODO_STATUSES,
	TodoSqlStore,
	type TodoStoreResult,
} from "./store.js";

const cleanupDirs: string[] = [];

function tempRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "todo-sql-test-"));
	cleanupDirs.push(dir);
	return dir;
}

function expectOpen(result: StoreOpenResult): void {
	if (!result.ok) throw new Error(result.message);
}

function expectTodoOk<T>(result: TodoStoreResult<T>): T {
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

function expectSqlRows(result: SqlResult): Record<string, unknown>[] {
	if (!result.ok) throw new Error(result.message);
	if (result.kind !== "rows") throw new Error(`expected rows, got ${result.kind}`);
	return result.rows;
}

function makeStore(location: SessionSqlLocation = memoryLocation()) {
	const sql = new SessionSqlStore();
	expectOpen(sql.open(location));
	return { sql, store: new TodoSqlStore(sql) };
}

afterEach(() => {
	for (const dir of cleanupDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("TodoSqlStore", () => {
	it("starts with no open todos", () => {
		const { store } = makeStore();
		const result = expectTodoOk(store.list());
		expect(result).toEqual([]);
		expect(store.list().message).toContain("todo: no open todos");
	});

	it("writes todo-created rows to the SQL source of truth", () => {
		const { sql, store } = makeStore();
		const added = expectTodoOk(store.add({ title: "Write store", priority: 2 }));
		expect(added.id).toBe(1);
		expect(added.status).toBe("pending");
		expect(store.list().message).toContain("todo: 1 open");

		const raw = expectSqlRows(
			sql.execute("SELECT title, status, priority FROM todos WHERE id = ?", {
				params: [added.id],
			}),
		);
		expect(raw).toEqual([{ title: "Write store", status: "pending", priority: 2 }]);
	});

	it("shows supported SQL-created rows in todo lists", () => {
		const { sql, store } = makeStore();
		sql.execute("INSERT INTO todos(title, status, priority) VALUES ('SQL row', 'pending', 5)");
		const rows = expectTodoOk(store.list({ view: "all" }));
		expect(rows.map((todo) => todo.title)).toEqual(["SQL row"]);
		expect(store.list({ view: "all" }).message).toContain("#1 pending     p5  SQL row");
	});

	it("normalizes SQL-created empty titles for display without creating another store", () => {
		const { sql, store } = makeStore();
		sql.execute("INSERT INTO todos(title, status, priority) VALUES ('', 'pending', 0)");
		const [row] = expectTodoOk(store.list({ view: "all" }));
		expect(row?.title).toBe("");
		expect(row ? formatTodoRow(row) : "").toContain("<untitled #1>");
	});

	it("supports every canonical status", () => {
		const { store } = makeStore();
		const added = expectTodoOk(store.add({ title: "Status target" }));
		for (const status of TODO_STATUSES) {
			const updated = expectTodoOk(store.setStatus({ id: added.id, status }));
			expect(updated.status).toBe(status);
		}
	});

	it("filters list views and clears only todo rows", () => {
		const { sql, store } = makeStore();
		const open = expectTodoOk(store.add({ title: "Open" }));
		const done = expectTodoOk(store.add({ title: "Done" }));
		expectTodoOk(store.done(done.id));
		expectTodoOk(store.addDependency({ id: done.id, dependsOn: open.id }));

		expect(expectTodoOk(store.list()).map((todo) => todo.id)).toEqual([open.id]);
		expect(expectTodoOk(store.list({ view: "done" })).map((todo) => todo.id)).toEqual([done.id]);
		expect(expectTodoOk(store.list({ view: "all" })).map((todo) => todo.id)).toEqual([
			open.id,
			done.id,
		]);

		const cleared = expectTodoOk(store.clear());
		expect(cleared.cleared).toBe(2);
		expect(expectTodoOk(store.counts())).toEqual({ open: 0, done: 0, blocked: 0, total: 0 });
		expect(expectSqlRows(sql.execute("SELECT * FROM todo_deps"))).toEqual([]);
	});

	it("deletes one todo by id and cascades dependency edges", () => {
		const { store } = makeStore();
		const prerequisite = expectTodoOk(store.add({ title: "Prerequisite" }));
		const dependent = expectTodoOk(store.add({ title: "Dependent" }));
		expectTodoOk(store.addDependency({ id: dependent.id, dependsOn: prerequisite.id }));

		const deleted = expectTodoOk(store.delete(prerequisite.id));
		expect(deleted.id).toBe(prerequisite.id);
		expect(store.delete(99)).toMatchObject({
			ok: false,
			code: "TODO_NOT_FOUND",
			message: "todo error: id #99 not found",
		});
		expect(store.delete(0)).toMatchObject({ ok: false, code: "TODO_BAD_ID" });

		const [remaining] = expectTodoOk(store.list({ view: "all" }));
		expect(remaining?.id).toBe(dependent.id);
		expect(remaining?.dependencyIds).toEqual([]);
	});

	it("prunes done todos without deleting open work", () => {
		const { sql, store } = makeStore();
		const open = expectTodoOk(store.add({ title: "Open" }));
		const done = expectTodoOk(store.add({ title: "Done" }));
		expectTodoOk(store.done(done.id));
		expectTodoOk(store.addDependency({ id: done.id, dependsOn: open.id }));

		const pruned = expectTodoOk(store.pruneDone());
		expect(pruned.pruned).toBe(1);
		expect(expectTodoOk(store.list({ view: "all" })).map((todo) => todo.id)).toEqual([open.id]);
		expect(expectTodoOk(store.counts())).toEqual({ open: 1, done: 0, blocked: 0, total: 1 });
		expect(expectSqlRows(sql.execute("SELECT * FROM todo_deps"))).toEqual([]);
	});

	it("orders next-ready todos by active status, priority, age, then id", () => {
		const { store } = makeStore();
		const highPriority = expectTodoOk(store.add({ title: "High priority", priority: 10 }));
		const active = expectTodoOk(store.add({ title: "Active", priority: 0 }));
		expectTodoOk(store.setStatus({ id: active.id, status: "in_progress" }));

		const next = expectTodoOk(store.next());
		expect(next.todos.map((todo) => todo.id)).toEqual([active.id, highPriority.id]);
	});

	it("excludes dependency-blocked todos until prerequisites are done", () => {
		const { store } = makeStore();
		const prerequisite = expectTodoOk(store.add({ title: "Prerequisite" }));
		const dependent = expectTodoOk(store.add({ title: "Dependent" }));
		expectTodoOk(store.addDependency({ id: dependent.id, dependsOn: prerequisite.id }));

		expect(expectTodoOk(store.next()).todos.map((todo) => todo.id)).toEqual([prerequisite.id]);
		expectTodoOk(store.done(prerequisite.id));
		expect(expectTodoOk(store.next()).todos.map((todo) => todo.id)).toEqual([dependent.id]);
	});

	it("reports open work when no todos are ready", () => {
		const { store } = makeStore();
		const blocked = expectTodoOk(store.add({ title: "Blocked" }));
		expectTodoOk(store.block(blocked.id, "waiting"));
		const next = store.next();
		expect(next.ok).toBe(true);
		expect(next.message).toContain("todo: no ready todos");
		expect(next.message).toContain("1 open todos are blocked");
	});

	it("handles dependency edge errors and duplicate edges", () => {
		const { store } = makeStore();
		const first = expectTodoOk(store.add({ title: "First" }));
		const second = expectTodoOk(store.add({ title: "Second" }));

		expect(store.addDependency({ id: first.id, dependsOn: first.id })).toEqual({
			ok: false,
			code: "TODO_SELF_DEP",
			message: "todo error: todo cannot depend on itself",
		});
		expect(store.addDependency({ id: 99, dependsOn: first.id })).toMatchObject({
			ok: false,
			code: "TODO_NOT_FOUND",
			message: "todo error: id #99 not found",
		});
		expect(store.addDependency({ id: first.id, dependsOn: 99 })).toMatchObject({
			ok: false,
			code: "TODO_NOT_FOUND",
			message: "todo error: id #99 not found",
		});

		const inserted = expectTodoOk(store.addDependency({ id: second.id, dependsOn: first.id }));
		expect(inserted.duplicate).toBe(false);
		const duplicate = expectTodoOk(store.addDependency({ id: second.id, dependsOn: first.id }));
		expect(duplicate.duplicate).toBe(true);
	});

	it("treats limit zero as no returned rows", () => {
		const { store } = makeStore();
		expectTodoOk(store.add({ title: "Hidden" }));
		expect(expectTodoOk(store.list({ limit: 0 }))).toEqual([]);
		expect(expectTodoOk(store.next({ limit: 0 })).todos).toEqual([]);
	});

	it("projects a compact recent-activity widget window with overflow and paging", () => {
		const { sql, store } = makeStore();
		sql.execute(`INSERT INTO todos(title, status, priority, created_at, updated_at) VALUES
('In flight old', 'in_progress', 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
('Recent pending', 'pending', 0, '2026-01-01 00:00:00', '2026-01-01 00:05:00'),
('Recent blocked', 'blocked', 0, '2026-01-01 00:00:00', '2026-01-01 00:04:00'),
('Another pending', 'pending', 0, '2026-01-01 00:00:00', '2026-01-01 00:03:00'),
('Recent done', 'done', 0, '2026-01-01 00:00:00', '2026-01-01 00:02:00'),
('Old pending', 'pending', 0, '2026-01-01 00:00:00', '2026-01-01 00:01:00')`);

		const firstPage = expectTodoOk(store.widgetSnapshot({ maxRows: 4 }));
		expect(firstPage.rows.map((todo) => todo.title)).toEqual([
			"In flight old",
			"Recent pending",
			"Recent blocked",
			"Another pending",
		]);
		expect(firstPage.hidden).toBe(2);
		expect(firstPage.page).toBe(0);
		expect(firstPage.pageCount).toBe(2);
		expect(firstPage.inProgress).toBe(1);

		const secondPage = expectTodoOk(store.widgetSnapshot({ maxRows: 4, page: 1 }));
		expect(secondPage.rows.map((todo) => todo.title)).toEqual(["Old pending", "Recent done"]);
		expect(secondPage.hidden).toBe(0);
		expect(secondPage.page).toBe(1);
	});

	it("renders multiple in-flight widget rows without enforcing uniqueness", () => {
		const { sql, store } = makeStore();
		sql.execute(`INSERT INTO todos(title, status, priority, created_at, updated_at) VALUES
('First active', 'in_progress', 0, '2026-01-01 00:00:00', '2026-01-01 00:02:00'),
('Second active', 'in_progress', 0, '2026-01-01 00:00:00', '2026-01-01 00:01:00')`);

		const snapshot = expectTodoOk(store.widgetSnapshot({ maxRows: 4 }));
		expect(snapshot.inProgress).toBe(2);
		expect(snapshot.rows.map((todo) => todo.title)).toEqual(["First active", "Second active"]);
	});

	it("truncates long below-editor widget lines without ANSI-specific assertions", () => {
		const { sql, store } = makeStore();
		sql.execute(
			"INSERT INTO todos(title, status, priority) VALUES ('A very long todo title that must be truncated by the widget renderer', 'in_progress', 0)",
		);
		const snapshot = expectTodoOk(store.widgetSnapshot({ maxRows: 4 }));
		const theme: TodoStripTheme = {
			fg: (_color, text) => text,
			strikethrough: (text) => `~~${text}~~`,
		};
		const rendered = new TodoStripWidget(snapshot, theme).render(32);
		expect(rendered.every((line) => visibleWidth(line) <= 32)).toBe(true);
		expect(rendered.join("\n")).toContain("▶ #1");
	});

	it("keeps recent completed rows visible while open work remains and clears when all done", () => {
		const { sql, store } = makeStore();
		sql.execute(`INSERT INTO todos(title, status, priority, created_at, updated_at) VALUES
('Active', 'in_progress', 0, '2026-01-01 00:00:00', '2026-01-01 00:03:00'),
('Open', 'pending', 0, '2026-01-01 00:00:00', '2026-01-01 00:02:00'),
('Completed', 'done', 0, '2026-01-01 00:00:00', '2026-01-01 00:01:00')`);

		const activeSnapshot = expectTodoOk(store.widgetSnapshot({ maxRows: 4 }));
		expect(activeSnapshot.rows.map((todo) => todo.title)).toEqual(["Active", "Open", "Completed"]);

		sql.execute("UPDATE todos SET status = 'done', updated_at = '2026-01-01 00:04:00'");
		const completedSnapshot = expectTodoOk(store.widgetSnapshot({ maxRows: 4 }));
		expect(completedSnapshot.open).toBe(0);
		expect(completedSnapshot.rows).toEqual([]);
		expect(completedSnapshot.pageCount).toBe(0);
	});

	it("persists todo rows when the same session DB is reopened", () => {
		const location = locationForSession("todo-persist", tempRoot());
		const first = makeStore(location);
		expectTodoOk(first.store.add({ title: "Persistent" }));
		expect(first.sql.close()).toEqual({ ok: true });

		const second = makeStore(location);
		expect(expectTodoOk(second.store.list()).map((todo) => todo.title)).toEqual(["Persistent"]);
	});
});

describe("parseTodoCommand", () => {
	it("parses core slash command arguments", () => {
		expect(parseTodoCommand("")).toEqual({
			ok: true,
			value: { action: "list", view: "open" },
			message: "",
		});
		expect(parseTodoCommand("add Write docs")).toEqual({
			ok: true,
			value: { action: "add", title: "Write docs" },
			message: "",
		});
		expect(parseTodoCommand("done #4")).toEqual({
			ok: true,
			value: { action: "done", id: 4 },
			message: "",
		});
		expect(parseTodoCommand("delete #4")).toEqual({
			ok: true,
			value: { action: "delete", id: 4 },
			message: "",
		});
		expect(parseTodoCommand("prune done")).toEqual({
			ok: true,
			value: { action: "prune", target: "done" },
			message: "",
		});
		expect(parseTodoCommand("status 4 blocked waiting")).toEqual({
			ok: true,
			value: { action: "status", id: 4, status: "blocked", reason: "waiting" },
			message: "",
		});
	});

	it("returns stable errors for bad ids, views, statuses, and titles", () => {
		expect(parseTodoCommand("add   ")).toMatchObject({ ok: false, code: "TODO_EMPTY_TITLE" });
		expect(parseTodoCommand("done nope")).toMatchObject({ ok: false, code: "TODO_BAD_ID" });
		expect(parseTodoCommand("list weird")).toMatchObject({ ok: false, code: "TODO_BAD_VIEW" });
		expect(parseTodoCommand("prune pending")).toMatchObject({
			ok: false,
			code: "TODO_BAD_PRUNE_TARGET",
		});
		expect(parseTodoCommand("status 1 weird")).toMatchObject({
			ok: false,
			code: "TODO_BAD_STATUS",
		});
	});
});
