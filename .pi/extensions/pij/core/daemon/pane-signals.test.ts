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
	renderedComposerLength,
	USER_TYPING_IDLE_MS,
} from "./pane-signals.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "pane-signals");
const HARNESSES = ["claude", "copilot", "codex", "pi"] as const;

const CLAUDE_RELATIVE_PANE = [
	"────────────────────────────────────────────────────────────────",
	"❯ keep me posted on the researcher findings",
	"────────────────────────────────────────────────────────────────",
	"45% pij · pij-reasonable-dove · Opus 4.8",
].join("\n");
const OMP_RELATIVE_PANE = [
	"╭── pij-striped-cockroach > ⬢ GPT-5.6 Sol · ◒ high > ⑂ main ▶────────╮",
	"╰─ keep me posted ─╯",
].join("\n");

function namedFixture(name: string): Uint8Array {
	const escaped = readFileSync(join(FIXTURES, `${name}.raw`), "utf8").trimEnd();
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

function fixture(harness: (typeof HARNESSES)[number], kind: string): Uint8Array {
	return namedFixture(`${harness}-${kind}`);
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

	it("detects a non-empty live Claude composer despite relative cursor redraws", () => {
		const bytes = namedFixture("claude-relative-typing");
		expect(parseCaretPositions(bytes)).toEqual([
			{ row: 49, column: 1 },
			{ row: 46, column: 3 },
		]);
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 46, column: 3 });
		tracker.ingest(bytes, 1_000, true);
		tracker.observeRenderedComposer(renderedComposerLength(CLAUDE_RELATIVE_PANE), 1_000);
		expect(tracker.isTyping()).toBe(true);
		expect(tracker.length()).toBeGreaterThan(0);
	});

	it("detects a non-empty live OMP composer despite A/B/G-only cursor redraws", () => {
		const bytes = namedFixture("omp-relative-typing");
		expect(parseCaretPositions(bytes)).toEqual([]);
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 49, column: 4 });
		tracker.ingest(bytes, 1_000, true);
		tracker.observeRenderedComposer(renderedComposerLength(OMP_RELATIVE_PANE), 1_000);
		expect(tracker.isTyping()).toBe(true);
		expect(tracker.length()).toBeGreaterThan(0);
	});

	it.each([
		[
			"claude",
			"claude-relative-typing",
			CLAUDE_RELATIVE_PANE,
			"keep me posted on the researcher findings",
		],
		["omp", "omp-relative-typing", OMP_RELATIVE_PANE, "keep me posted"],
	] as const)("%s fixture couples actual relative bytes to a visibly non-empty pane", (_harness, raw, pane, typed) => {
		const bytes = Buffer.from(namedFixture(raw)).toString("latin1");
		expect(bytes).toContain(typed);
		expect(pane).toContain(typed);
		expect(renderedComposerLength(pane)).toBeGreaterThan(0);
	});

	it("never idle-releases while the rendered composer remains non-empty", () => {
		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer(renderedComposerLength(CLAUDE_RELATIVE_PANE), 1_000);
		expect(tracker.expire(1_000 + USER_TYPING_IDLE_MS)).toBeUndefined();
		expect(tracker.isTyping()).toBe(true);
		tracker.observeRenderedComposer(0, 1_000 + USER_TYPING_IDLE_MS);
		expect(tracker.isTyping()).toBe(false);
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
