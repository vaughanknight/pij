import { describe, expect, it } from "vitest";

import { memoryLocation, SessionSqlStore, type StoreOpenResult } from "../session-sql/store.js";
import { parseTodoCommand, TodoSqlStore } from "./store.js";

function expectOpen(result: StoreOpenResult): void {
	if (!result.ok) throw new Error(result.message);
}

function makeStore() {
	const sql = new SessionSqlStore();
	expectOpen(sql.open(memoryLocation()));
	return { sql, store: new TodoSqlStore(sql) };
}

describe("TodoSqlStore", () => {
	it("starts with no open todos", () => {
		const { store } = makeStore();
		const result = store.list();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual([]);
			expect(result.message).toContain("todo: no open todos");
		}
	});

	it("adds and lists SQL-backed todos", () => {
		const { sql, store } = makeStore();
		const added = store.add({ title: "Write store", priority: 2 });
		expect(added.ok).toBe(true);
		if (!added.ok) throw new Error(added.message);
		expect(added.message).toBe("todo: added #1 pending — Write store");

		const listed = store.list();
		expect(listed.ok).toBe(true);
		if (listed.ok) expect(listed.value.map((todo) => todo.title)).toEqual(["Write store"]);

		const raw = sql.execute("SELECT title, status, priority FROM todos WHERE id = ?", {
			params: [added.value.id],
		});
		expect(raw.ok).toBe(true);
		if (raw.ok && raw.kind === "rows") {
			expect(raw.rows).toEqual([{ title: "Write store", status: "pending", priority: 2 }]);
		}
	});

	it("updates status and dependencies", () => {
		const { store } = makeStore();
		const first = store.add({ title: "First" });
		const second = store.add({ title: "Second" });
		if (!first.ok) throw new Error(first.message);
		if (!second.ok) throw new Error(second.message);

		const dep = store.addDependency({ id: second.value.id, dependsOn: first.value.id });
		expect(dep.ok).toBe(true);
		if (dep.ok) expect(dep.message).toBe("todo: #2 depends on #1");

		const nextBefore = store.next();
		expect(nextBefore.ok).toBe(true);
		if (nextBefore.ok) expect(nextBefore.value.todos.map((todo) => todo.id)).toEqual([first.value.id]);

		const done = store.done(first.value.id);
		expect(done.ok).toBe(true);
		const nextAfter = store.next();
		expect(nextAfter.ok).toBe(true);
		if (nextAfter.ok) expect(nextAfter.value.todos.map((todo) => todo.id)).toEqual([second.value.id]);
	});

	it("parses core slash command arguments", () => {
		expect(parseTodoCommand("")).toEqual({ ok: true, value: { action: "list", view: "open" }, message: "" });
		expect(parseTodoCommand("add Write docs")).toEqual({
			ok: true,
			value: { action: "add", title: "Write docs" },
			message: "",
		});
		expect(parseTodoCommand("done #4")).toEqual({ ok: true, value: { action: "done", id: 4 }, message: "" });
	});
});
