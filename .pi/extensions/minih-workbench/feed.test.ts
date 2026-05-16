import { describe, expect, it } from "vitest";

import { createInventoryFeed } from "./feed.js";
import {
	diagnostic,
	type MinihAdapterResult,
	type MinihInventorySnapshot,
	minihError,
	minihOk,
} from "./store.js";

function inventory(): MinihInventorySnapshot {
	return {
		runs: [],
		activeCount: 0,
		staleCount: 0,
		completedCount: 0,
		diagnosticCount: 0,
		truncated: false,
	};
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
} {
	let resolveValue: ((value: T) => void) | undefined;
	let rejectValue: ((error: unknown) => void) | undefined;
	const promise = new Promise<T>((resolve, reject) => {
		resolveValue = resolve;
		rejectValue = reject;
	});
	return {
		promise,
		resolve: (value) => resolveValue?.(value),
		reject: (error) => rejectValue?.(error),
	};
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("minih read-only feed", () => {
	it("coalesces refreshes while a read is in flight", async () => {
		const first = deferred<MinihAdapterResult<MinihInventorySnapshot>>();
		const snapshots: MinihInventorySnapshot[] = [];
		let readCount = 0;
		const feed = createInventoryFeed({
			read: () => {
				readCount += 1;
				if (readCount === 1) return first.promise;
				return Promise.resolve(minihOk(inventory()));
			},
			onSnapshot: (snapshot) => snapshots.push(snapshot),
			onDiagnostics: () => {},
		});
		feed.start();
		feed.refresh();
		feed.refresh();
		expect(readCount).toBe(1);
		first.resolve(minihOk(inventory()));
		await flushPromises();
		expect(readCount).toBe(2);
		expect(snapshots).toHaveLength(2);
	});

	it("ignores callbacks after dispose", async () => {
		const read = deferred<MinihAdapterResult<MinihInventorySnapshot>>();
		const snapshots: MinihInventorySnapshot[] = [];
		const diagnostics: unknown[] = [];
		const feed = createInventoryFeed({
			read: () => read.promise,
			onSnapshot: (snapshot) => snapshots.push(snapshot),
			onDiagnostics: (items) => diagnostics.push(items),
		});
		feed.start();
		feed.dispose();
		read.resolve(minihOk(inventory()));
		await flushPromises();
		expect(feed.isDisposed()).toBe(true);
		expect(snapshots).toHaveLength(0);
		expect(diagnostics).toHaveLength(0);
	});

	it("emits watcher diagnostics and falls back to bounded polling", async () => {
		const callbacks: Array<() => void> = [];
		const diagnostics: string[] = [];
		let readCount = 0;
		const feed = createInventoryFeed({
			read: () => {
				readCount += 1;
				if (readCount === 2) {
					return Promise.resolve(
						minihError("MINIH_IO_ERROR", "poll failed", [
							diagnostic("warning", "POLL", "poll failed", "adapter"),
						]),
					);
				}
				return Promise.resolve(minihOk(inventory()));
			},
			onSnapshot: () => {},
			onDiagnostics: (items) => diagnostics.push(...items.map((item) => item.code)),
			startWatcher: () => {
				throw new Error("watch unavailable");
			},
			timers: {
				setTimeout: (callback) => {
					callbacks.push(callback);
					return callback;
				},
				clearTimeout: () => {},
			},
			fallbackPollMs: 1,
			maxFallbackPolls: 1,
		});
		feed.start();
		await flushPromises();
		expect(diagnostics).toContain("MINIH_FEED_WATCHER_FAILED");
		expect(callbacks).toHaveLength(1);
		callbacks[0]?.();
		await flushPromises();
		expect(readCount).toBe(2);
		expect(diagnostics).toContain("MINIH_FEED_READ_FAILED");
	});
});
