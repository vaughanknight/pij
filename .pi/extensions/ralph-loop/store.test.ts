import { describe, expect, it } from "vitest";

import { makeRecorder } from "../../../harness/test-utils.js";
import {
	ENTRY_DELETE,
	ENTRY_ITEM,
	type ReplayableEntry,
	RalphLoopStore,
} from "./store.js";

function makeStore() {
	const { append, calls } = makeRecorder();
	const store = new RalphLoopStore(append);
	return { store, calls };
}

describe("RalphLoopStore", () => {
	it("starts empty", () => {
		const { store } = makeStore();
		expect(store.count()).toBe(0);
	});

	it("rehydrates items from a session entry log", () => {
		const { store } = makeStore();
		const entries: ReplayableEntry[] = [
			{
				type: "custom",
				customType: ENTRY_ITEM,
				data: { id: "1", createdAt: 1 },
			},
		];
		store.rehydrate(entries);
		expect(store.count()).toBe(1);
	});

	// Negative case: malformed replay data must NOT mutate state (P7).
	it("ignores replay entries whose data is not a valid Item", () => {
		const { store } = makeStore();
		const malformed: ReplayableEntry[] = [
			{
				type: "custom",
				customType: ENTRY_ITEM,
				data: { wrongShape: true },
			},
			{
				type: "custom",
				customType: ENTRY_DELETE,
				data: null,
			},
		];
		store.rehydrate(malformed);
		expect(store.count()).toBe(0);
	});

	// TODO: more tests as the store grows
});
