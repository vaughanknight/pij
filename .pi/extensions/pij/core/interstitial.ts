// pij-control-plane — boot-interstitial classifier (pure, Plan 019).
//
// First boot of a harness can present one-time prompts BEFORE the input box is
// ready, which silently block readiness (the load-bearing discovery from the
// live prototype, scratch/tmux-claude-ready/findings.md). This classifies a
// captured pane into: auto-answer (harness-specific keys), auto-dismiss (Esc),
// needs-human (surface, never answer), or none. Markers are version-sensitive
// → isolated here (one classifier).

import type { HarnessKind } from "./types.js";

export type InterstitialAction = "answer" | "dismiss" | "needs-human" | "none";

export interface InterstitialVerdict {
	readonly action: InterstitialAction;
	/** Matched prompt label, for the TUI/log (set when action !== "none"). */
	readonly label?: string;
	/** Keystrokes an `answer` presses, in order (argv-level tmux keys). E.g.
	 *  copilot folder-trust: ["1", "Enter"] = option 1, trust ONCE (session-
	 *  scoped). NEVER option 2 — "remember" permanently mutates the user's
	 *  global copilot trusted-folders config. codex update prompt: ["2",
	 *  "Enter"] = Skip — a spawned seat must NEVER run a global npm install
	 *  mid-fleet-op (option 1 is the wedge that ate 2.5 days at osk, T1).
	 *  Set only when action === "answer". */
	readonly keys?: readonly ("1" | "2" | "Enter")[];
}

/** Known one-time boot prompts safe to auto-dismiss with Esc (verified: the
 *  "Claude in Chrome extension detected" menu — Esc keeps browser tools off and
 *  it does not recur). */
const DISMISS_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
	{ re: /Chrome extension detected/i, label: "chrome-extension" },
	{ re: /to keep browser tools off/i, label: "browser-tools" },
	{ re: /Enter to confirm/i, label: "confirm-menu" },
];

const COPILOT_SESSION_IN_USE_TAIL_CHARS = 1_600;
const COPILOT_SESSION_IN_USE_RE =
	/^[ \t│]*Session in use[ \t│]*\r?$[\s\S]{0,400}^[ \t│]*This session was last active [^\r\n]{0,120}appears to be in use by another CLI or application\.[ \t│]*\r?$[\s\S]{0,300}^[ \t│]*(?:❯[ \t]*)?1\.[ \t]+Resume anyway[ \t│]*\r?$[\s\S]{0,100}^[ \t│]*2\.[ \t]+Go back \(Esc\)[ \t│]*\r?$/im;

/** Prompts that need a human — exact enough to avoid classifying ordinary prose. */
const NEEDS_HUMAN_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
	{ re: /^\s*Do you trust the files in this folder\?\s*$/im, label: "folder-trust" },
	{
		re: /^\s*(?:Select login method:|Log in with (?:Claude account|API key))\s*$/im,
		label: "login",
	},
	// Live-captured 2026-07-18 (codex-cli 0.144.1→0.144.5 pending).
	{ re: /^\s*✨\s*Update available!\s+\S+\s*->\s*\S+\s*$/im, label: "update-prompt" },
];

/**
 * Classify a captured pane. NEEDS-HUMAN (and its copilot `answer` upgrade) is
 * checked first so a trust/login prompt that also happens to show an "Enter to
 * confirm" affordance is never mistaken for an auto-dismissable menu.
 *
 * `harness` is optional so harness-less call sites compile unchanged. The
 * session-in-use modal is deliberately NOT in the generic pattern table: only
 * an explicit Copilot caller may classify and answer its exact tail shape.
 * Loose generic patterns remain fail-closed as needs-human.
 */
export function classifyInterstitial(paneText: string, harness?: HarnessKind): InterstitialVerdict {
	if (
		harness === "copilot" &&
		COPILOT_SESSION_IN_USE_RE.test(paneText.slice(-COPILOT_SESSION_IN_USE_TAIL_CHARS))
	) {
		return { action: "answer", label: "session-in-use", keys: ["1", "Enter"] };
	}
	for (const p of NEEDS_HUMAN_PATTERNS) {
		if (p.re.test(paneText)) {
			if (harness === "copilot" && p.label === "folder-trust") {
				return { action: "answer", label: p.label, keys: ["1", "Enter"] };
			}
			// codex update prompt → Skip (option 2): session-scoped, mutates
			// nothing. Never option 1 — a global npm install mid-spawn is the
			// wedge itself, and never Esc/skip-until-next (3) — stickier than a
			// spawned seat should decide.
			if (p.label === "update-prompt" && harness === "codex") {
				return { action: "answer", label: p.label, keys: ["2", "Enter"] };
			}
			return { action: "needs-human", label: p.label };
		}
	}
	for (const p of DISMISS_PATTERNS) {
		if (p.re.test(paneText)) return { action: "dismiss", label: p.label };
	}
	return { action: "none" };
}
