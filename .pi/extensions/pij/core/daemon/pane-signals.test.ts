import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	BUSY_IDLE_AFTER_MS,
	BusyDensityTracker,
	CaretTypingTracker,
	diffPaneListings,
	PaneSignalMonitor,
	parseCaretPositions,
	USER_TYPING_IDLE_MS,
} from "./pane-signals.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "pane-signals");
const HARNESSES = ["claude", "copilot", "codex", "pi"] as const;

function fixture(harness: (typeof HARNESSES)[number], kind: string): Uint8Array {
	const escaped = readFileSync(join(FIXTURES, `${harness}-${kind}.raw`), "utf8").trimEnd();
	const bytes: number[] = [];
	for (let i = 0; i < escaped.length; i++) {
		if (escaped[i] !== "\\" || escaped[i + 1] !== "x") {
			bytes.push(escaped.charCodeAt(i));
			continue;
		}
		const value = Number.parseInt(escaped.slice(i + 2, i + 4), 16);
		if (!Number.isNaN(value)) {
			bytes.push(value);
			i += 3;
		}
	}
	return Uint8Array.from(bytes);
}

describe("BusyDensityTracker", () => {
	it.each(HARNESSES)("%s busy capture becomes busy within the rolling window", (harness) => {
		const tracker = new BusyDensityTracker();
		const bytes = fixture(harness, "busy");
		let busy = false;
		for (let at = 0; at < 800; at += 100) busy = tracker.ingest(bytes.byteLength, at);
		expect(busy).toBe(true);
	});

	it.each(HARNESSES)("%s idle capture returns idle after hysteresis", (harness) => {
		const tracker = new BusyDensityTracker();
		const busy = fixture(harness, "busy");
		const idle = fixture(harness, "idle");
		for (let at = 0; at < 800; at += 100) tracker.ingest(busy.byteLength, at);
		expect(tracker.ingest(idle.byteLength, 800)).toBe(true);
		expect(tracker.current(700 + BUSY_IDLE_AFTER_MS)).toBe(false);
	});
});

describe("CaretTypingTracker", () => {
	it.each(HARNESSES)("%s typing capture emits ordered keys and Enter releases", (harness) => {
		const typing = fixture(harness, "typing");
		const positions = parseCaretPositions(typing);
		expect(positions.length).toBeGreaterThanOrEqual(2);
		const tracker = new CaretTypingTracker();
		tracker.seedBase(positions[0] ?? { row: 1, column: 1 });

		const keys = tracker.ingest(typing, 1_000, true);
		expect(keys.filter((event) => event.kind === "key").length).toBeGreaterThan(0);
		expect(tracker.isTyping()).toBe(true);
		expect(tracker.length()).toBeGreaterThan(0);

		const enter = tracker.ingest(fixture(harness, "enter"), 1_100, false);
		expect(enter.at(-1)).toEqual({ kind: "enter", composerLength: 0 });
		expect(tracker.isTyping()).toBe(false);
	});

	it("releases a non-empty composer after 60 seconds without a key", () => {
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 24, column: 3 });
		tracker.ingest(fixture("claude", "typing"), 1_000, true);
		expect(tracker.expire(1_000 + USER_TYPING_IDLE_MS - 1)).toBeUndefined();
		expect(tracker.expire(1_000 + USER_TYPING_IDLE_MS)).toEqual({
			kind: "idle-release",
			composerLength: 0,
		});
	});
});

describe("pane connect diff", () => {
	it("adds new live ids and retires absent or pane_dead ids", () => {
		const diff = diffPaneListings(new Set(["%1", "%2"]), [
			{ paneId: "%2", dead: true },
			{ paneId: "%3", dead: false },
		]);
		expect(diff.added.map((pane) => pane.paneId)).toEqual(["%3"]);
		expect(diff.retired).toEqual(["%1", "%2"]);
	});

	it("monitor exposes busy as a read-only signal without changing typing", () => {
		const monitor = new PaneSignalMonitor();
		monitor.reconcile([{ paneId: "%1", dead: false, cursorX: 2, cursorY: 23 }]);
		const busy = fixture("copilot", "busy");
		for (let at = 0; at < 800; at += 100) monitor.ingest("%1", busy, at);
		expect(monitor.snapshot("%1", 800)).toMatchObject({ busy: true, userTyping: false });
	});

	it("does not overwrite the learned idle base with a cursor that moved before the tick", () => {
		const monitor = new PaneSignalMonitor();
		monitor.reconcile([{ paneId: "%1", dead: false, cursorX: 2, cursorY: 23 }]);
		monitor.reconcile([{ paneId: "%1", dead: false, cursorX: 3, cursorY: 23 }]);
		monitor.ingest("%1", Buffer.from("\x1b[24;3Hk\x1b[24;4H"), 1_000);
		expect(monitor.snapshot("%1", 1_000)).toMatchObject({
			userTyping: true,
			composerLength: 1,
		});
	});
});
