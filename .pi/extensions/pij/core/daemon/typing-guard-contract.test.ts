// s069 — the typing guard's CONTRACT, stated by the operator and proven here.
//
//   "It should not block unless there is recent typing in the pane and Enter has
//    not been pressed. 1 min no Enter -> times out and sends. Press Enter ->
//    sends. After that, unless I type again, it chains off."
//
// Plus two invariants pij itself must honour: its own delivery is never mistaken
// for human typing, and watchdogs never stack up behind a hold.
//
// Fixtures prefixed `live_` are REAL `capture-pane -p -J` output from the
// operator's running fleet, not hand-written approximations.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { SessionDescriptor } from "../types.js";
import { type DaemonPorts, drainTmuxInbox } from "./loop.js";
import {
	CaretTypingTracker,
	ComposerHoldTracker,
	composerRegion,
	isBlankComposer,
	renderedComposerPayload,
	SELF_INJECTION_WINDOW_MS,
	USER_TYPING_IDLE_MS,
} from "./pane-signals.js";
import { SendBuffer } from "./router.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "pane-signals");
const live = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const RULE = "─".repeat(90);
const PANE = "%1";
const T0 = 1_000_000;

/** A claude pane whose composer holds `text`. */
function claudePane(text: string, ...below: string[]): string {
	return ["assistant output", RULE, `❯ ${text}`, RULE, "  45% context left", ...below].join("\n");
}

/** Drive the gate the way the daemon does: content in, verdict out. */
function gate(): {
	observe: (pane: string, nowMs: number) => boolean;
	tracker: ComposerHoldTracker;
} {
	const tracker = new ComposerHoldTracker();
	return {
		tracker,
		observe: (pane, nowMs) => tracker.observe(PANE, renderedComposerPayload(pane), nowMs).hold,
	};
}

describe("composer anchor — refuses to guess (s069 req 4)", () => {
	it("ignores a rule drawn BELOW the composer instead of sliding onto the status line", async () => {
		// The confirmed defect: `rules.at(-2)/.at(-1)` bracketed `  45% context left`.
		const pane = claudePane("hello", RULE);
		expect(composerRegion(pane)).toBe("❯ hello");
		expect(renderedComposerPayload(pane)).toBe("hello");
	});

	it("still finds the composer when the status line below it is momentarily BLANK", async () => {
		// The dangerous variant: a blank wrong-region measures 0 and force-RELEASES
		// mid-keystroke, which is a step-on rather than an over-hold.
		const pane = ["out", RULE, "❯ hello", RULE, "   ", RULE].join("\n");
		expect(renderedComposerPayload(pane)).toBe("hello");
		expect(isBlankComposer(renderedComposerPayload(pane))).toBe(false);
	});

	it("does not mistake markdown table borders in output for composer rules", async () => {
		// Real capture: `┌───────────┬──────────┐` rows sit above the composer and
		// match /─{8,}/. Only the plain-run rules may bracket the composer.
		const pane = live("live_claude_typed_with_table.txt");
		expect(pane).toMatch(/[┌├└]─{8,}/);
		// Trailing `-J` padding is preserved by tmux; the composer TEXT is what matters.
		expect(renderedComposerPayload(pane)?.trimEnd()).toBe(
			"go ahead, do arkaudiod and fseventsd now",
		);
		expect(isBlankComposer(renderedComposerPayload(pane))).toBe(false);
	});

	it("reports UNKNOWN rather than a confident wrong number for an unrecognised layout", async () => {
		expect(renderedComposerPayload("no composer delimiters here at all")).toBeUndefined();
	});

	it("defers to the caret tracker on an unknown layout instead of releasing a live hold", async () => {
		const { tracker, observe } = gate();
		observe(claudePane(""), T0);
		expect(observe(claudePane("half typed"), T0 + 10)).toBe(true);
		const verdict = tracker.observe(PANE, undefined, T0 + 20);
		expect(verdict.deferred).toBe(true);
		// and the hold survives once the layout is legible again
		expect(observe(claudePane("half typed"), T0 + 30)).toBe(true);
	});
});

describe("one whitespace-insensitive definition of empty (s069 req 2)", () => {
	it.each([
		["copilot", "live_copilot_blank_padded.txt"],
		["omp/pi", "live_omp_blank_padded.txt"],
	])("treats a visibly blank %s composer as empty despite capture-pane -J padding", async (_h, file) => {
		const payload = renderedComposerPayload(live(file));
		// The old raw `=== ""` test: this is exactly why Enter never released here.
		expect(payload).not.toBe("");
		expect((payload ?? "").length).toBeGreaterThan(60);
		expect(isBlankComposer(payload)).toBe(true);
	});
});

describe("the operator's contract, rule by rule", () => {
	it("RULE: a parked draft holds at most the 60s idle window, then sends", async () => {
		// One capture cannot distinguish a parked draft from a human typing through
		// a daemon restart, and a static-content probation cannot either: pausing
		// mid-thought is ordinary. So first sight counts as recent typing and the
		// EXISTING 60s idle rule bounds it — s064's forever-block cannot return.
		const { observe } = gate();
		const parked = claudePane("draft parked here yesterday");
		expect(observe(parked, T0)).toBe(true);
		expect(observe(parked, T0 + USER_TYPING_IDLE_MS - 1)).toBe(true);
		expect(observe(parked, T0 + USER_TYPING_IDLE_MS)).toBe(false);
		expect(observe(parked, T0 + USER_TYPING_IDLE_MS + 60_000)).toBe(false);
	});

	it("RULE: a human typing through a daemon restart is NOT re-baselined away", async () => {
		// The restart hole: tracker state is lost and the human's live draft looks
		// like first sight. It must hold, INCLUDING across an ordinary thinking pause
		// with no keystrokes at all — which is what defeated the 2.5s probation.
		const { observe } = gate();
		expect(observe(claudePane("half typed thou"), T0)).toBe(true);
		// A long pause with completely static content: still held.
		expect(observe(claudePane("half typed thou"), T0 + 10_000)).toBe(true);
		// Resuming typing re-arms the full window.
		expect(observe(claudePane("half typed thought"), T0 + 11_000)).toBe(true);
		expect(observe(claudePane("half typed thought"), T0 + 11_000 + USER_TYPING_IDLE_MS - 1)).toBe(
			true,
		);
		// and Enter still releases immediately.
		expect(observe(claudePane(""), T0 + 12_000)).toBe(false);
	});

	it("RULE: recent typing holds", async () => {
		const { observe } = gate();
		expect(observe(claudePane(""), T0)).toBe(false);
		expect(observe(claudePane("h"), T0 + 10)).toBe(true);
		expect(observe(claudePane("hello"), T0 + 200)).toBe(true);
	});

	it("RULE: Enter sends — the hold releases on the very next capture", async () => {
		const { observe } = gate();
		observe(claudePane(""), T0);
		expect(observe(claudePane("typed a message"), T0 + 10)).toBe(true);
		expect(observe(claudePane(""), T0 + 20)).toBe(false);
	});

	it.each([
		["copilot", "live_copilot_blank_padded.txt"],
		["omp/pi", "live_omp_blank_padded.txt"],
	])("RULE: Enter sends on %s too, where the emptied composer is space-padded", async (_h, file) => {
		// This never worked before s069: the raw emptiness tests could not fire on
		// these harnesses, so only the 60s expiry ever released them.
		const tracker = new ComposerHoldTracker();
		const blank = renderedComposerPayload(live(file));
		tracker.observe(PANE, blank, T0);
		expect(tracker.observe(PANE, "half typed", T0 + 10).hold).toBe(true);
		expect(tracker.observe(PANE, blank, T0 + 20).hold).toBe(false);
	});

	it("RULE: 1 min with no Enter times out and sends", async () => {
		const { observe } = gate();
		observe(claudePane(""), T0);
		expect(observe(claudePane("unsent draft"), T0 + 10)).toBe(true);
		expect(observe(claudePane("unsent draft"), T0 + 10 + USER_TYPING_IDLE_MS - 1)).toBe(true);
		expect(observe(claudePane("unsent draft"), T0 + 10 + USER_TYPING_IDLE_MS)).toBe(false);
	});

	it("RULE: after the timeout it chains off — released until the human types again", async () => {
		const { observe } = gate();
		observe(claudePane(""), T0);
		observe(claudePane("unsent draft"), T0 + 10);
		let at = T0 + 10 + USER_TYPING_IDLE_MS;
		expect(observe(claudePane("unsent draft"), at)).toBe(false);
		// Stays off across many further sends while the content is untouched.
		for (let i = 0; i < 5; i++) {
			at += 1_000;
			expect(observe(claudePane("unsent draft"), at)).toBe(false);
		}
		// Typing again re-arms it.
		expect(observe(claudePane("unsent draft plus more"), at + 1)).toBe(true);
	});
});

describe("pij's own delivery is never human typing (s069 req 3)", () => {
	it("does not acquire a hold from its own injected echo", async () => {
		const { tracker } = gate();
		const injected = "[pij from pij-boss] status please";
		tracker.observe(PANE, "", T0);
		tracker.markSelfInjection(PANE, injected, T0 + 5);
		expect(tracker.observe(PANE, injected, T0 + 10).hold).toBe(false);
	});

	it("does NOT destroy an active human hold when pij injects (the cascade bug)", async () => {
		// markSelfInjection used to clear lastKeyAt outright, so one step-on
		// released the guard and the rest of the queue landed on the same line.
		const { tracker, observe } = gate();
		observe(claudePane(""), T0);
		expect(observe(claudePane("human mid sentence"), T0 + 10)).toBe(true);
		tracker.markSelfInjection(PANE, "[pij from pij-boss] barging in", T0 + 20);
		expect(tracker.observe(PANE, "human mid sentence", T0 + 30).hold).toBe(true);
	});

	it.each([
		["suffix", (echo: string) => `${echo} and my reply`],
		["prefix", (echo: string) => `my reply ${echo}`],
		["interleaved", (echo: string) => `my ${echo} reply`],
	])("holds when the FIRST post-injection capture is echo + human text (%s)", async (_shape, compose) => {
		// A substring test excused any capture CONTAINING the echo, so the very
		// first capture of `<echo><human text>` was classified as explained and
		// released — stepping on text the human had already typed.
		const { tracker } = gate();
		const injected = "[pij from pij-boss] status please";
		tracker.observe(PANE, "", T0);
		tracker.markSelfInjection(PANE, injected, T0 + 5);
		expect(tracker.observe(PANE, compose(injected), T0 + 10).hold).toBe(true);
	});

	it("still exempts the composer reverting to its pre-injection baseline", async () => {
		const { tracker } = gate();
		tracker.observe(PANE, "", T0);
		tracker.markSelfInjection(PANE, "[pij from pij-boss] status", T0 + 5);
		expect(tracker.observe(PANE, "", T0 + 10).hold).toBe(false);
	});

	it("still holds human input that arrives AFTER the injected echo", async () => {
		// The exemption must not become a hole: one-shot, anchored to the exact
		// content it excused.
		const { tracker } = gate();
		const injected = "[pij from pij-boss] status please";
		tracker.observe(PANE, "", T0);
		tracker.markSelfInjection(PANE, injected, T0 + 5);
		expect(tracker.observe(PANE, injected, T0 + 10).hold).toBe(false);
		expect(tracker.observe(PANE, `${injected} and my reply`, T0 + 50).hold).toBe(true);
	});

	it("stops excusing changes once the self-injection window has expired", async () => {
		const { tracker } = gate();
		tracker.observe(PANE, "", T0);
		tracker.markSelfInjection(PANE, "[pij from pij-boss] late", T0);
		const after = T0 + SELF_INJECTION_WINDOW_MS + 1;
		expect(tracker.observe(PANE, "[pij from pij-boss] late", after).hold).toBe(true);
	});
});

describe("the gate is re-derived per MESSAGE, not once per batch (s069 req 5)", () => {
	// A whole queue used to land on one draft because the batch shared a single
	// verdict taken before the first send. Each message must re-capture.
	function drainWorld(panes: string[]) {
		const sent: Array<{ pane: string; text: string }> = [];
		const queue = [...panes];
		let last = panes[panes.length - 1] ?? "";
		const ports = {
			capturePane: () => {
				last = queue.shift() ?? last;
				return last;
			},
			isPaneDead: () => false,
			sendText: (p: string, t: string) => {
				sent.push({ pane: p, text: t });
				return "confirmed" as const;
			},
			sendKey: () => {},
			killPane: () => {},
			listTranscripts: () => [],
			home: () => "/tmp",
			now: () => T0,
			isAlive: () => true,
		} satisfies Partial<DaemonPorts> as unknown as DaemonPorts;
		return { ports, sent };
	}

	const target = {
		id: "pij-c",
		harness: "claude",
		lifecycle: "bound",
		paneId: PANE,
		harnessSessionId: "sess",
	} as unknown as SessionDescriptor;

	const messages = [
		{ messageId: "m1", from: "pij-boss" as const, body: "first" },
		{ messageId: "m2", from: "pij-boss" as const, body: "second" },
	];

	it("stops the second message when the human starts typing after the first landed", async () => {
		const holds = new ComposerHoldTracker();
		holds.observe(PANE, renderedComposerPayload(claudePane("")), T0); // tick baseline: blank
		// capture #1 (before msg1) still blank; capture #2 (before msg2) has text.
		const { ports, sent } = drainWorld([claudePane(""), claudePane("mid sentence")]);
		const buffer = new SendBuffer();

		const consumed = await drainTmuxInbox(target, messages, ports, buffer, undefined, holds);

		expect(sent).toEqual([{ pane: PANE, text: "[pij from pij-boss] first" }]);
		expect(consumed.map((c) => c.messageId)).toEqual(["m1"]);
		expect(buffer.pending("pij-c")).toBe(1);
	});

	it("delivers the whole batch when the composer stays blank throughout", async () => {
		const holds = new ComposerHoldTracker();
		holds.observe(PANE, renderedComposerPayload(claudePane("")), T0);
		const { ports, sent } = drainWorld([claudePane(""), claudePane("")]);
		const buffer = new SendBuffer();

		await drainTmuxInbox(target, messages, ports, buffer, undefined, holds);

		expect(sent).toHaveLength(2);
		expect(buffer.pending("pij-c")).toBe(0);
	});
});

describe("caret fallback: an echo is certified by PROGRESS, never by resemblance", () => {
	const PAYLOAD = "[pij from pij-boss] first";
	function tracker(): CaretTypingTracker {
		const t = new CaretTypingTracker();
		t.seedBase({ row: 1, column: 1 });
		t.markSelfInjection(PAYLOAD, T0);
		return t;
	}
	// One printable char plus a caret advance = one keystroke.
	const keystroke = (text: string, column: number) => Buffer.from(`${text}\u001b[1;${column}H`);

	it("holds a single human char that merely OCCURS in the pending payload", async () => {
		// `p` appears in "[pij …]" — containment excused it; progress does not,
		// because it is not what we expect next.
		const t = tracker();
		expect(t.ingest(keystroke("p", 2), T0 + 10, true)).toEqual([
			{ kind: "key", composerLength: 1 },
		]);
		expect(t.isTyping()).toBe(true);
	});

	it("holds a human-only frame whose text is a payload SUBSTRING", async () => {
		const t = tracker();
		expect(t.ingest(keystroke("first", 2), T0 + 10, true)).toEqual([
			{ kind: "key", composerLength: 1 },
		]);
		expect(t.isTyping()).toBe(true);
	});

	it("holds a PARTIAL echo instead of certifying it", async () => {
		// A prefix of our payload is indistinguishable from echo-plus-a-human-key
		// that completes it, so partial progress is ambiguous and must not certify.
		const t = tracker();
		expect(t.ingest(keystroke(PAYLOAD.slice(0, -1), 2), T0 + 10, true)).toEqual([
			{ kind: "key", composerLength: 1 },
		]);
		expect(t.isTyping()).toBe(true);
	});

	it("certifies the COMPLETE echo and stays released — the ordinary case", async () => {
		const t = tracker();
		expect(t.ingest(keystroke(PAYLOAD, 2), T0 + 10, true)).toEqual([]);
		expect(t.isTyping()).toBe(false);
	});

	it("certifies an echo split across frames once it completes", async () => {
		const t = tracker();
		// Each partial frame is ambiguous on its own...
		t.ingest(Buffer.from(PAYLOAD.slice(0, 10)), T0 + 10, true);
		// ...but the frame that completes the payload certifies the whole echo.
		expect(t.ingest(Buffer.from(PAYLOAD.slice(10)), T0 + 20, true)).toEqual([]);
	});
});

describe("watchdogs never stack behind a hold", () => {
	it("keeps at most one pending watchdog ping however long the human types", async () => {
		const buffer = new SendBuffer();
		for (let i = 0; i < 25; i++) {
			buffer.enqueue(`wd-${i}`, {
				from: "pij-watchdog",
				to: "pij-c",
				body: "still working?",
			});
		}
		expect(buffer.pending("pij-c")).toBe(1);
	});

	it("does not drop real peer messages while coalescing watchdog pings", async () => {
		const buffer = new SendBuffer();
		buffer.enqueue("wd-1", { from: "pij-watchdog", to: "pij-c", body: "ping" });
		buffer.enqueue("m-1", { from: "pij-boss", to: "pij-c", body: "first" });
		buffer.enqueue("wd-2", { from: "pij-watchdog", to: "pij-c", body: "ping" });
		buffer.enqueue("m-2", { from: "pij-boss", to: "pij-c", body: "second" });
		expect(buffer.pending("pij-c")).toBe(3);
	});
});
