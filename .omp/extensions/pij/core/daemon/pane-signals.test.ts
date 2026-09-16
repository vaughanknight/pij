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
	renderedComposerPayload,
	SELF_INJECTION_WINDOW_MS,
	USER_TYPING_IDLE_MS,
} from "./pane-signals.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "pane-signals");
const HARNESSES = ["claude", "copilot", "codex", "omp", "pi"] as const;

const CLAUDE_RELATIVE_PANE = [
	"────────────────────────────────────────────────────────────────",
	"❯ keep me posted on the researcher findings",
	"────────────────────────────────────────────────────────────────",
	"45% pij · pij-reasonable-dove · Opus 4.8",
].join("\n");
function copilotPane(payload: string): string {
	return [
		"────────────────────────────────────────────────────────────────",
		`❯ ${payload}`,
		" GPT-5.6 Sol · 1.1M context",
		" / commands · ? help · → next tab",
		" ◉",
	].join("\n");
}

const COPILOT_TYPED_PANE = copilotPane("keep me posted");
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

function paneFixture(name: string): string {
	return readFileSync(join(FIXTURES, name), "utf8");
}

function fixture(harness: (typeof HARNESSES)[number], kind: string): Uint8Array {
	return namedFixture(`${harness}-${kind}`);
}

describe("renderedComposerLength", () => {
	it.each([
		"pane_%157.txt",
		"pane_%624.txt",
	])("recognizes idle narrow Copilot capture %s without counting footer churn", (name) => {
		expect(renderedComposerLength(paneFixture(name))).toBe(0);
	});

	it.each([
		"pane_%4.txt",
		"claude_idle_%29.txt",
	])("recognizes empty composer capture %s", (name) => {
		expect(renderedComposerLength(paneFixture(name))).toBe(0);
	});

	it("counts Copilot text but excludes its live footer", () => {
		expect(renderedComposerLength(COPILOT_TYPED_PANE)).toBe("keepmeposted".length);
	});

	it("uses the caret to preserve final-space input while trimming width padding", () => {
		const padded = copilotPane("hello      ");
		const before = renderedComposerPayload(padded, { x: 7, y: 1 });
		const after = renderedComposerPayload(padded, { x: 8, y: 1 });
		expect(before).toBe("hello");
		expect(after).toBe("hello ");

		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer(before, 1_000);
		expect(tracker.observeRenderedComposer(after, 1_001)).toEqual({
			kind: "key",
			composerLength: 5,
		});
		expect(tracker.isTyping()).toBe(true);

		const internal = " hello  world";
		expect(
			renderedComposerPayload(copilotPane(`${internal}   `), { x: 2 + internal.length, y: 1 }),
		).toBe(internal);
	});

	it("preserves a final-space edit when cursor coordinates are missing", () => {
		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer(renderedComposerPayload(copilotPane("hello")), 1_000);
		expect(
			tracker.observeRenderedComposer(renderedComposerPayload(copilotPane("hello ")), 1_001),
		).toEqual({
			kind: "key",
			composerLength: 5,
		});
		expect(tracker.isTyping()).toBe(true);
	});

	it("clips final-space input on the active multiline continuation", () => {
		const before = renderedComposerPayload(copilotPane("first\nsecond      "), { x: 6, y: 2 });
		const after = renderedComposerPayload(copilotPane("first\nsecond      "), { x: 7, y: 2 });
		expect(before).toBe("first\nsecond");
		expect(after).toBe("first\nsecond ");

		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer(before, 1_000);
		expect(tracker.observeRenderedComposer(after, 1_001)?.kind).toBe("key");
		expect(tracker.isTyping()).toBe(true);
	});

	it("normalizes right padding when cursorX is beyond the captured line", () => {
		const tracker = new CaretTypingTracker();
		const before = renderedComposerPayload(copilotPane("hello    "), { x: 99, y: 1 });
		const after = renderedComposerPayload(copilotPane("hello         "), { x: 99, y: 1 });
		expect(before).toBe("hello");
		expect(after).toBe("hello");
		tracker.observeRenderedComposer(before, 1_000);
		expect(tracker.observeRenderedComposer(after, 1_001)).toBeUndefined();
		expect(tracker.isTyping()).toBe(false);
	});
});

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
		tracker.observeRenderedComposer("", 900);
		tracker.ingest(bytes, 1_000, true);
		tracker.observeRenderedComposer(renderedComposerPayload(CLAUDE_RELATIVE_PANE), 1_000);
		expect(tracker.isTyping()).toBe(true);
		expect(tracker.length()).toBeGreaterThan(0);
	});

	it("detects a real OMP composer text change despite A/B/G-only cursor redraws", () => {
		const bytes = namedFixture("omp-relative-typing");
		expect(parseCaretPositions(bytes)).toEqual([]);
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 49, column: 4 });
		tracker.observeRenderedComposer("", 900);
		tracker.ingest(bytes, 1_000, true);
		tracker.observeRenderedComposer(renderedComposerPayload(OMP_RELATIVE_PANE), 1_000);
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

	it("does not acquire from a static non-empty render", () => {
		const tracker = new CaretTypingTracker();
		const payload = renderedComposerPayload(CLAUDE_RELATIVE_PANE);
		tracker.observeRenderedComposer(payload, 1_000);
		tracker.observeRenderedComposer(payload, 2_000);
		expect(tracker.isTyping()).toBe(false);
		expect(tracker.lastKeystrokeAt()).toBeUndefined();
	});

	it("ignores Copilot footer cursor churn once the rendered composer is authoritative", () => {
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 43, column: 1 });
		tracker.observeRenderedComposer(renderedComposerPayload(paneFixture("pane_%157.txt")), 1_000);
		const events = tracker.ingest(Buffer.from("\x1b[43;3H\x1b[43;18H"), 2_000, true);
		tracker.observeRenderedComposer(renderedComposerPayload(paneFixture("pane_%624.txt")), 2_000);
		expect(events).toEqual([]);
		expect(tracker.isTyping()).toBe(false);
	});

	it("ignores daemon-injected payload and caret changes without hiding later human input", () => {
		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer("before", 1_000);
		tracker.markSelfInjection("[pij from peer] injected", 1_100);
		expect(tracker.observeRenderedComposer("[pij from peer] injected", 1_101)).toBeUndefined();
		expect(tracker.isTyping()).toBe(false);

		expect(tracker.observeRenderedComposer("human edit", 1_102)).toEqual({
			kind: "key",
			composerLength: "humanedit".length,
		});
		expect(tracker.isTyping()).toBe(true);

		const caret = new CaretTypingTracker();
		caret.seedBase({ row: 1, column: 1 });
		caret.markSelfInjection("injected", 2_000);
		expect(caret.ingest(Buffer.from("\x1b[1;2H"), 2_000 + SELF_INJECTION_WINDOW_MS, true)).toEqual(
			[],
		);
		expect(caret.isTyping()).toBe(false);
	});

	it("acquires when a human edits before the pending injection echo appears", () => {
		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer("", 1_000);
		tracker.markSelfInjection("[pij from peer] injected", 1_100);
		expect(tracker.observeRenderedComposer("human starts typing", 1_101)).toEqual({
			kind: "key",
			composerLength: "humanstartstyping".length,
		});
		expect(tracker.isTyping()).toBe(true);
	});

	it("does not renew unknown-layout activity from bare cursor reports", () => {
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 1, column: 1 });
		expect(tracker.ingest(Buffer.from("k\x1b[1;2H"), 1_000, true)).toEqual([
			{ kind: "key", composerLength: 1 },
		]);
		expect(tracker.ingest(Buffer.from("\x1b[1;3H"), 1_000 + USER_TYPING_IDLE_MS - 1, true)).toEqual(
			[],
		);
		expect(tracker.lastKeystrokeAt()).toBe(1_000);
		expect(tracker.expire(1_000 + USER_TYPING_IDLE_MS)).toEqual({
			kind: "idle-release",
			composerLength: 0,
		});
	});

	it("recognizes a printable key after a C1-ST-terminated OSC string", () => {
		const tracker = new CaretTypingTracker();
		tracker.seedBase({ row: 1, column: 1 });
		const bytes = Buffer.concat([
			Buffer.from("\x1b]0;title", "latin1"),
			Buffer.from([0x9c]),
			Buffer.from("x\x1b[1;2H", "latin1"),
		]);
		expect(tracker.ingest(bytes, 1_000, true)).toEqual([{ kind: "key", composerLength: 1 }]);
		expect(tracker.isTyping()).toBe(true);
	});

	it("holds equal-length and whitespace payload edits, then releases without chaining", () => {
		const tracker = new CaretTypingTracker();
		tracker.observeRenderedComposer(renderedComposerPayload(copilotPane("hello")), 900);
		expect(
			tracker.observeRenderedComposer(renderedComposerPayload(copilotPane("world")), 1_000),
		).toEqual({
			kind: "key",
			composerLength: 5,
		});
		expect(tracker.isTyping()).toBe(true);
		expect(tracker.expire(1_000 + USER_TYPING_IDLE_MS - 1)).toBeUndefined();
		expect(tracker.expire(1_000 + USER_TYPING_IDLE_MS)).toEqual({
			kind: "idle-release",
			composerLength: 0,
		});
		expect(tracker.isTyping()).toBe(false);

		tracker.observeRenderedComposer(
			renderedComposerPayload(copilotPane("world")),
			1_001 + USER_TYPING_IDLE_MS,
		);
		expect(tracker.isTyping()).toBe(false);
		expect(
			tracker.observeRenderedComposer(
				renderedComposerPayload(copilotPane("wo rld")),
				2_000 + USER_TYPING_IDLE_MS,
			),
		).toEqual({ kind: "key", composerLength: 5 });
		expect(tracker.isTyping()).toBe(true);
		expect(tracker.observeRenderedComposer("", 2_001 + USER_TYPING_IDLE_MS)).toEqual({
			kind: "enter",
			composerLength: 0,
		});
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
	it("holds composer-scoped printable input when known-layout coordinates are absent", () => {
		const monitor = new PaneSignalMonitor();
		monitor.reconcile([{ paneId: "%1", dead: false }]);
		const padded = copilotPane("hello     ");
		monitor.observeRenderedComposer("%1", padded, 900);

		expect(monitor.ingest("%1", Buffer.from("GPT-5.6 Sol\x1b[3;2H"), 950)).toEqual([]);
		expect(monitor.ingest("%1", Buffer.from(" \x1b[2;8H"), 1_000)).toEqual([
			{ kind: "key", composerLength: 5 },
		]);
		expect(monitor.snapshot("%1", 1_000)).toMatchObject({
			userTyping: true,
			composerLength: 5,
		});
	});
});
