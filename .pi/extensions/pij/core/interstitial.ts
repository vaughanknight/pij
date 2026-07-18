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

/** Prompts that need a human — surfaced to the creator, NEVER auto-answered. */
const NEEDS_HUMAN_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
	{ re: /Do you trust|trust the files in/i, label: "folder-trust" },
	{ re: /Select login method|Log in with|Sign in/i, label: "login" },
	// Live-captured 2026-07-18 (codex-cli 0.144.1→0.144.5 pending): "✨ Update
	// available!" with options 1=Update now / 2=Skip / 3=Skip until next
	// version, cursor DEFAULTING to 1. The pre-footer wedge of the T1
	// bind-zombie (2.5 days at osk).
	{ re: /Update available!/i, label: "update-prompt" },
];

/**
 * Classify a captured pane. NEEDS-HUMAN (and its copilot `answer` upgrade) is
 * checked first so a trust/login prompt that also happens to show an "Enter to
 * confirm" affordance is never mistaken for an auto-dismissable menu.
 *
 * `harness` is optional so harness-less call sites (readiness.ts — it only asks
 * "is this an interstitial?") compile unchanged; without it every needs-human
 * prompt stays needs-human. WITH harness === "copilot", folder-trust upgrades
 * to `answer` (DL-001): a pij-SPAWNED copilot seat already runs --yolo on a
 * spawner-chosen cwd, so trust-once grants strictly less than what spawn
 * granted — posture-consistent to auto-accept. Esc is NEVER the answer here:
 * on this modal Esc = "No, exit" → dead pane (why needs-human outranks
 * dismiss). Login stays needs-human for every harness.
 */
export function classifyInterstitial(paneText: string, harness?: HarnessKind): InterstitialVerdict {
	for (const p of NEEDS_HUMAN_PATTERNS) {
		if (p.re.test(paneText)) {
			if (p.label === "folder-trust" && harness === "copilot") {
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
