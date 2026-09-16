import { describe, expect, it } from "vitest";

import { classifyInterstitial } from "./interstitial.js";

// Fixtures lifted from the live prototype (scratch/tmux-claude-ready/findings.md).
const CHROME_PROMPT = `
 Claude in Chrome extension detected

   Use it to let Claude drive your browser?

   Enter to confirm · Esc to keep browser tools off
`;

const TRUST_PROMPT = `
 Do you trust the files in this folder?

 /Users/jordanknight/pi-hacking/pij

   Enter to confirm · Esc to exit
`;

const LOGIN_PROMPT = `
 Select login method:

   Log in with Claude account
   Log in with API key
`;

const COPILOT_SESSION_IN_USE = `
 Session in use

 This session was last active just now and appears to be in use by another CLI or application.

 ❯ 1. Resume anyway
   2. Go back (Esc)

 ↑/↓ to navigate · enter to select · esc to cancel
`;

describe("classifyInterstitial", () => {
	it("Chrome-extension menu → dismiss (Esc)", () => {
		expect(classifyInterstitial(CHROME_PROMPT)).toEqual({
			action: "dismiss",
			label: "chrome-extension",
		});
	});

	it("folder-trust prompt → needs-human (never auto-answer), even with 'Enter to confirm'", () => {
		// TRUST_PROMPT also shows "Enter to confirm" — must NOT be classed as dismiss.
		expect(classifyInterstitial(TRUST_PROMPT)).toEqual({
			action: "needs-human",
			label: "folder-trust",
		});
	});

	it("claude folder-trust stays needs-human (auto-answer is copilot-only, DL-001)", () => {
		expect(classifyInterstitial(TRUST_PROMPT, "claude")).toEqual({
			action: "needs-human",
			label: "folder-trust",
		});
	});

	it("copilot folder-trust → answer with trust-ONCE keys (1 + Enter, never option 2)", () => {
		expect(classifyInterstitial(TRUST_PROMPT, "copilot")).toEqual({
			action: "answer",
			label: "folder-trust",
			keys: ["1", "Enter"],
		});
	});

	it("copilot answer outranks dismiss — 'Enter to confirm' on the trust modal never reads as confirm-menu", () => {
		// TRUST_PROMPT carries the dismissable "Enter to confirm" affordance; the
		// trust pattern must still win (Esc here = "No, exit" → dead pane).
		expect(classifyInterstitial(TRUST_PROMPT, "copilot").action).toBe("answer");
		expect(classifyInterstitial(TRUST_PROMPT, "copilot").action).not.toBe("dismiss");
	});

	it("login prompt → needs-human (for copilot too — answer never covers login)", () => {
		expect(classifyInterstitial(LOGIN_PROMPT)).toMatchObject({ action: "needs-human" });
		expect(classifyInterstitial(LOGIN_PROMPT, "copilot")).toMatchObject({
			action: "needs-human",
			label: "login",
		});
	});

	it("answers only the exact Copilot session-in-use modal at the capture tail", () => {
		expect(
			classifyInterstitial(`${"old scrollback\n".repeat(200)}${COPILOT_SESSION_IN_USE}`, "copilot"),
		).toEqual({
			action: "answer",
			label: "session-in-use",
			keys: ["1", "Enter"],
		});
		expect(classifyInterstitial(COPILOT_SESSION_IN_USE)).toEqual({ action: "none" });
		expect(classifyInterstitial(COPILOT_SESSION_IN_USE, "claude")).toEqual({ action: "none" });
	});

	it("never treats ordinary prose or a different modal as the Copilot resume modal", () => {
		const prose = `I inspected the text Session in use and the options 1. Resume anyway and 2. Go back.\n◎ Working esc interrupt`;
		const destructive = `
 Overwrite checkpoint?

 The documentation says Session in use and mentions the legacy labels.

 ❯ 1. Delete existing checkpoint
   2. Go back (Esc)

 Previous wording: 1. Resume anyway
`;
		expect(classifyInterstitial(prose, "copilot")).toEqual({ action: "none" });
		expect(classifyInterstitial(prose)).toEqual({ action: "none" });
		expect(classifyInterstitial(destructive, "copilot")).toEqual({ action: "none" });
	});

	it("ignores an exact but stale modal outside the capture tail", () => {
		const pane = `${COPILOT_SESSION_IN_USE}\n${"newer output\n".repeat(200)}`;
		expect(classifyInterstitial(pane, "copilot")).toEqual({ action: "none" });
	});

	it("a ready footer is not an interstitial", () => {
		expect(classifyInterstitial("⏵⏵ auto mode on (shift+tab to cycle)")).toEqual({
			action: "none",
		});
	});

	it("does not classify prose that merely discusses generic prompt phrases", () => {
		const prose =
			"The review discusses Do you trust, Log in with Claude account, and Update available! patterns.";
		expect(classifyInterstitial(prose)).toEqual({ action: "none" });
	});
});

describe("codex update prompt (T1's other half — live-captured 0.144.1→0.144.5)", () => {
	const UPDATE_PANE = `  ✨ Update available! 0.144.1 -> 0.144.5
  Release notes: https://github.com/openai/codex/
› 1. Update now (runs \`npm install -g @openai/codex\`)
  2. Skip
  3. Skip until next version
  Press enter to continue`;

	it("codex → answer with Skip (2+Enter) — never option 1's global npm install", () => {
		const v = classifyInterstitial(UPDATE_PANE, "codex");
		expect(v).toEqual({ action: "answer", label: "update-prompt", keys: ["2", "Enter"] });
	});

	it("harness-less and non-codex stay needs-human (readiness still sees an interstitial)", () => {
		expect(classifyInterstitial(UPDATE_PANE).action).toBe("needs-human");
		expect(classifyInterstitial(UPDATE_PANE, "claude").action).toBe("needs-human");
	});
});
