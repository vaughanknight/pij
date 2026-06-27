// pij-control-plane — boot-interstitial classifier (pure, Plan 019).
//
// First boot of a harness can present one-time prompts BEFORE the input box is
// ready, which silently block readiness (the load-bearing discovery from the
// live prototype, scratch/tmux-claude-ready/findings.md). This classifies a
// captured pane into: auto-dismiss (Esc), needs-human (surface, never answer),
// or none. Markers are version-sensitive → isolated here (one classifier).

export type InterstitialAction = "dismiss" | "needs-human" | "none";

export interface InterstitialVerdict {
	readonly action: InterstitialAction;
	/** Matched prompt label, for the TUI/log (set when action !== "none"). */
	readonly label?: string;
}

/** Known one-time boot prompts safe to auto-dismiss with Esc (verified: the
 *  "Claude in Chrome extension detected" menu — Esc keeps browser tools off and
 *  it does not recur). */
const DISMISS_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
	{ re: /Chrome extension detected/i, label: "chrome-extension" },
	{ re: /to keep browser tools off/i, label: "browser-tools" },
	{ re: /Enter to confirm/i, label: "confirm-menu" },
];

/** Prompts that need a human — surfaced to the creator, NEVER auto-answered. */
const NEEDS_HUMAN_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
	{ re: /Do you trust|trust the files in/i, label: "folder-trust" },
	{ re: /Select login method|Log in with|Sign in/i, label: "login" },
];

/**
 * Classify a captured pane. NEEDS-HUMAN is checked first so a trust/login
 * prompt that also happens to show an "Enter to confirm" affordance is never
 * mistaken for an auto-dismissable menu.
 */
export function classifyInterstitial(paneText: string): InterstitialVerdict {
	for (const p of NEEDS_HUMAN_PATTERNS) {
		if (p.re.test(paneText)) return { action: "needs-human", label: p.label };
	}
	for (const p of DISMISS_PATTERNS) {
		if (p.re.test(paneText)) return { action: "dismiss", label: p.label };
	}
	return { action: "none" };
}
