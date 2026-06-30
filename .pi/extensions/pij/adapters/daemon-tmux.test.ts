// pij-control-plane — per-harness Enter-settle rule (task #24).
//
// The bug: the daemon waited a single Claude-tuned 350ms before pressing Enter,
// so a Copilot send had its Return swallowed mid-debounce and the message stranded
// in the composer. The fix makes the settle harness-specific. These tests pin the
// rule itself (pure, no live pane); the Dim-0 anchor is "copilot > claude" — flatten
// the table back to one value and these go RED.

import { describe, expect, it } from "vitest";
import { enterSettleMs, needsRenderWake } from "./daemon-tmux.js";

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

describe("needsRenderWake — per-harness WINCH-wake before send (the wedge fix)", () => {
	it("copilot needs a render wake (it parks its input loop when backgrounded)", () => {
		// If this flips false, the daemon stops WINCH-waking copilot → the wedge returns.
		expect(needsRenderWake("copilot")).toBe(true);
	});

	it("claude + codex do NOT (they don't exhibit the wedge)", () => {
		expect(needsRenderWake("claude")).toBe(false);
		expect(needsRenderWake("codex")).toBe(false);
	});

	it("an absent harness does not wake", () => {
		expect(needsRenderWake(undefined)).toBe(false);
	});
});
