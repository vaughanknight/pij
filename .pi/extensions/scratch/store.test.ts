import { describe, expect, it } from "vitest";

import { makeRecorder } from "../../../harness/test-utils.js";
import {
	ENTRY_CLEAR,
	ENTRY_DELETE,
	ENTRY_NOTE,
	MAX_LIST_BYTES,
	MAX_NOTE_BYTES,
	type ReplayableEntry,
	ScratchStore,
} from "./store.js";

function makeStore() {
	const { append, calls } = makeRecorder();
	const store = new ScratchStore(append);
	return { store, calls };
}

describe("ScratchStore", () => {
	describe("add", () => {
		it("appends a note entry and stores the note", () => {
			const { store, calls } = makeStore();
			const r = store.add("hello");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.note.content).toBe("hello");
			expect(store.count()).toBe(1);
			expect(calls).toHaveLength(1);
			expect(calls[0]?.customType).toBe(ENTRY_NOTE);
			expect(calls[0]?.data).toMatchObject({ content: "hello" });
		});

		it("rejects content over the size limit and emits no entry", () => {
			const { store, calls } = makeStore();
			const r = store.add("x".repeat(MAX_NOTE_BYTES + 1));
			expect(r).toEqual({ ok: false, reason: "too_long" });
			expect(store.count()).toBe(0);
			expect(calls).toHaveLength(0);
		});

		it("preserves the optional tag", () => {
			const { store } = makeStore();
			const r = store.add("note", "todo");
			if (r.ok) expect(r.note.tag).toBe("todo");
		});
	});

	describe("deleteAt", () => {
		it("removes the note at a 1-based index and emits a delete entry", () => {
			const { store, calls } = makeStore();
			store.add("a");
			store.add("b");
			const r = store.deleteAt(1);
			expect(r.ok).toBe(true);
			expect(store.count()).toBe(1);
			expect(store.list().map((n) => n.content)).toEqual(["b"]);
			expect(calls.at(-1)?.customType).toBe(ENTRY_DELETE);
		});

		it("rejects out-of-range indices and emits no entry", () => {
			const { store, calls } = makeStore();
			store.add("a");
			const before = calls.length;
			expect(store.deleteAt(99)).toEqual({
				ok: false,
				reason: "out_of_range",
			});
			expect(calls).toHaveLength(before);
		});

		it("rejects index 0 (1-based) and emits no entry", () => {
			const { store, calls } = makeStore();
			store.add("a");
			const before = calls.length;
			expect(store.deleteAt(0)).toEqual({ ok: false, reason: "out_of_range" });
			expect(calls).toHaveLength(before);
		});
	});

	describe("clear", () => {
		it("wipes notes and emits a clear entry", () => {
			const { store, calls } = makeStore();
			store.add("a");
			store.add("b");
			expect(store.clear()).toBe(2);
			expect(store.count()).toBe(0);
			expect(calls.at(-1)?.customType).toBe(ENTRY_CLEAR);
		});

		it("returns 0 when already empty (still emits an entry)", () => {
			const { store } = makeStore();
			expect(store.clear()).toBe(0);
			expect(store.count()).toBe(0);
		});
	});

	describe("rehydrate", () => {
		it("replays note + delete + note in append order", () => {
			const { store } = makeStore();
			const entries: ReplayableEntry[] = [
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "1", content: "a", createdAt: 1 },
				},
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "2", content: "b", createdAt: 2 },
				},
				{
					type: "custom",
					customType: ENTRY_DELETE,
					data: { id: "1" },
				},
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "3", content: "c", createdAt: 3 },
				},
			];
			store.rehydrate(entries);
			expect(store.list().map((n) => n.id)).toEqual(["2", "3"]);
		});

		it("clear wipes everything before it", () => {
			const { store } = makeStore();
			store.rehydrate([
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "1", content: "a", createdAt: 1 },
				},
				{ type: "custom", customType: ENTRY_CLEAR, data: { at: 2 } },
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "2", content: "b", createdAt: 3 },
				},
			]);
			expect(store.list().map((n) => n.id)).toEqual(["2"]);
		});

		it("ignores non-custom entries", () => {
			const { store } = makeStore();
			store.rehydrate([
				{ type: "user-message", data: { text: "hi" } },
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "1", content: "x", createdAt: 1 },
				},
			]);
			expect(store.count()).toBe(1);
		});

		// Negative cases for the structural guards (Pattern P6).
		it("ignores ENTRY_NOTE with malformed data shape", () => {
			const { store } = makeStore();
			store.rehydrate([
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "1", wrongShape: true },
				},
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "2", content: "ok", createdAt: 1 },
				},
			]);
			expect(store.list().map((n) => n.id)).toEqual(["2"]);
		});

		it("ignores ENTRY_DELETE with non-string id", () => {
			const { store } = makeStore();
			store.rehydrate([
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "1", content: "a", createdAt: 1 },
				},
				{
					type: "custom",
					customType: ENTRY_DELETE,
					data: { id: 123 },
				},
			]);
			expect(store.count()).toBe(1);
		});

		it("ignores ENTRY_CLEAR with malformed data", () => {
			const { store } = makeStore();
			store.rehydrate([
				{
					type: "custom",
					customType: ENTRY_NOTE,
					data: { id: "1", content: "a", createdAt: 1 },
				},
				{ type: "custom", customType: ENTRY_CLEAR, data: null },
			]);
			expect(store.count()).toBe(1);
		});
	});

	describe("list", () => {
		it("filters by tag", () => {
			const { store } = makeStore();
			store.add("a");
			store.add("b", "todo");
			store.add("c", "todo");
			expect(store.list({ tag: "todo" })).toHaveLength(2);
		});

		it("respects limit and returns the most-recent N", () => {
			const { store } = makeStore();
			store.add("a");
			store.add("b");
			store.add("c");
			expect(store.list({ limit: 2 }).map((n) => n.content)).toEqual(["b", "c"]);
		});

		it("clamps limit at MAX_LIST_LIMIT", () => {
			const { store } = makeStore();
			store.add("a");
			expect(store.list({ limit: 999_999 })).toHaveLength(1);
		});

		it("treats negative limit as 0", () => {
			const { store } = makeStore();
			store.add("a");
			expect(store.list({ limit: -5 })).toHaveLength(0);
		});
	});

	describe("format", () => {
		it("returns a placeholder when empty", () => {
			const { store } = makeStore();
			expect(store.format()).toBe("(no notes)");
		});

		it("caps output at MAX_LIST_BYTES and notes truncation", () => {
			const { store } = makeStore();
			for (let i = 0; i < 5; i++) store.add("x".repeat(2000));
			const out = store.format();
			expect(out.length).toBeLessThanOrEqual(MAX_LIST_BYTES + 200);
			expect(out).toMatch(/showing \d+ of 5/);
		});

		it("includes tag prefix when present", () => {
			const { store } = makeStore();
			store.add("hello", "todo");
			expect(store.format()).toContain("[todo]");
		});
	});
});
