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

	it("login prompt → needs-human", () => {
		expect(classifyInterstitial(LOGIN_PROMPT)).toMatchObject({ action: "needs-human" });
	});

	it("a ready footer is not an interstitial", () => {
		expect(classifyInterstitial("⏵⏵ auto mode on (shift+tab to cycle)")).toEqual({
			action: "none",
		});
	});
});
