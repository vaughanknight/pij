// pij-control-plane — per-harness Enter-settle rule (task #24).
//
// The bug: the daemon waited a single Claude-tuned 350ms before pressing Enter,
// so a Copilot send had its Return swallowed mid-debounce and the message stranded
// in the composer. The fix makes the settle harness-specific. These tests pin the
// rule itself (pure, no live pane); the Dim-0 anchor is "copilot > claude" — flatten
// the table back to one value and these go RED.

import { describe, expect, it } from "vitest";
import {
	composerHasTextTail,
	composerIsEmpty,
	composerPending,
	composerRegion,
	enterSettleMs,
	freshTranscriptEvent,
	needsInputWake,
	submissionConfirmed,
} from "./daemon-tmux.js";

// Real copilot pane shapes (composer boxed between two ──── rules).
const STUCK_PANE = [
	" ~/substrate/harness-engineering",
	" Session: 1729 AIC used",
	"────────────────────────────────────────────",
	"❯ [pij from pij-5lztp8] (pij delivery diagnostic —",
	"  please ignore)",
	"────────────────────────────────────────────",
	" @ files · # issues                  GPT-5.5 · 1.1M context",
].join("\n");

const EMPTY_PANE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 16 AIC used",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" / commands · ? help · tab next tab   GPT-5.5 · 1.1M context",
].join("\n");

const BUSY_PANE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 17 AIC used",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" ◎ Working · 241 B esc interrupt   GPT-5.5 · 1.1M context",
].join("\n");

const BUSY_TRANSCRIPT_CHANGED_EMPTY_PANE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 17 AIC used",
	"Unrelated prior turn is still streaming.",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" ◎ Working · 391 B esc interrupt   GPT-5.5 · 1.1M context",
].join("\n");

const SHORT_TURN_DONE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 17 AIC used",
	"[pij from pij-5lztp8] (pij delivery diagnostic — please ignore)",
	"Done.",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" / commands · ? help · tab next tab   GPT-5.5 · 1.1M context",
].join("\n");

describe("enterSettleMs — per-harness Enter settle", () => {
	it("gives copilot a LONGER settle than claude (the whole point of task #24)", () => {
		// If both collapse to the same value, the swallowed-Enter bug returns.
		expect(enterSettleMs("copilot")).toBeGreaterThan(enterSettleMs("claude"));
	});

	it("copilot waits long enough for its composer (>= 900ms)", () => {
		expect(enterSettleMs("copilot")).toBeGreaterThanOrEqual(900);
	});

	it("claude keeps its long-standing 350ms", () => {
		expect(enterSettleMs("claude")).toBe(350);
	});

	it("codex uses the claude-class default", () => {
		expect(enterSettleMs("codex")).toBe(350);
	});

	it("an absent/unknown harness falls back to the claude default (350)", () => {
		expect(enterSettleMs(undefined)).toBe(350);
	});
});

describe("needsInputWake — per-harness focus-IN input-wake before send (the wedge fix)", () => {
	it("copilot needs an input wake (backgrounded/focus-OUT → it swallows Enter)", () => {
		// If this flips false, the daemon stops focus-IN-waking copilot → the wedge returns.
		expect(needsInputWake("copilot")).toBe(true);
	});

	it("claude + codex do NOT (they don't exhibit the wedge)", () => {
		expect(needsInputWake("claude")).toBe(false);
		expect(needsInputWake("codex")).toBe(false);
	});

	it("an absent harness does not wake", () => {
		expect(needsInputWake(undefined)).toBe(false);
	});
});

describe("composerPending — submit verification (the cause-independent retry gate)", () => {
	const SENT = "[pij from pij-5lztp8] (pij delivery diagnostic — please ignore)";

	it("detects a STILL-PENDING line stranded in the composer (the wedge) → retry", () => {
		// If this flips false, the daemon stops retrying a wedged send → message lost.
		expect(composerPending(STUCK_PANE, SENT)).toBe(true);
	});

	describe("positive send confirmation helpers", () => {
		const SENT = "[pij from pij-5lztp8] (pij delivery diagnostic — please ignore)";

		it("detects typed text vs total-loss empty composer before Enter", () => {
			expect(composerHasTextTail(STUCK_PANE, SENT)).toBe(true);
			expect(composerIsEmpty(EMPTY_PANE)).toBe(true);
			expect(composerHasTextTail(EMPTY_PANE, SENT)).toBe(false);
		});

		it("confirms a busy transition after submit, but not an already-busy pane", () => {
			expect(submissionConfirmed(STUCK_PANE, BUSY_PANE, SENT)).toBe(true);
			expect(submissionConfirmed(BUSY_PANE, BUSY_PANE, SENT)).toBe(false);
		});

		it("confirms a short ready→busy→ready turn by fresh transcript fallback", () => {
			expect(freshTranscriptEvent(STUCK_PANE, SHORT_TURN_DONE, SENT)).toBe(true);
			expect(submissionConfirmed(STUCK_PANE, SHORT_TURN_DONE, SENT)).toBe(true);
		});

		it("does not confirm changed transcript fallback when the pre-submit pane was already busy", () => {
			expect(freshTranscriptEvent(BUSY_PANE, BUSY_TRANSCRIPT_CHANGED_EMPTY_PANE, SENT)).toBe(false);
			expect(submissionConfirmed(BUSY_PANE, BUSY_TRANSCRIPT_CHANGED_EMPTY_PANE, SENT)).toBe(false);
			expect(freshTranscriptEvent(STUCK_PANE, SHORT_TURN_DONE, SENT)).toBe(true);
		});
	});

	it("an EMPTY composer (a real submit) is NOT pending → no spurious re-Enter", () => {
		// The submitted line moved into the transcript; composer is bare `❯`.
		expect(composerPending(EMPTY_PANE, SENT)).toBe(false);
	});

	it("does not false-match the transcript above the composer", () => {
		// The sent text appearing in scrollback (not the composer box) must NOT read pending.
		const submittedToTranscript = [
			"❯ [pij from pij-5lztp8] (pij delivery diagnostic — please ignore)   18:31",
			" ● working on it",
			"────────────────────────────────────────────",
			"❯",
			"────────────────────────────────────────────",
			" ◉ Working esc cancel    GPT-5.5",
		].join("\n");
		expect(composerPending(submittedToTranscript, SENT)).toBe(false);
	});

	it("a too-short send is treated as submitted (avoids unreliable matching)", () => {
		expect(composerPending(STUCK_PANE, "ok")).toBe(false);
	});

	it("composerRegion extracts the box between the last two rules", () => {
		expect(composerRegion(STUCK_PANE)).toContain("pij delivery diagnostic");
		expect(composerRegion(EMPTY_PANE).replace(/[❯\s]/g, "")).toBe("");
	});
});
