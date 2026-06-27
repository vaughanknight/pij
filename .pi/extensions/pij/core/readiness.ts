// pij-control-plane — pane readiness classifier (pure, Plan 019).
//
// Reads a captured pane and decides whether the harness is idle-ready for input
// — no agent in the loop. R-01 was RESOLVED by the live prototype against Claude
// Code v2.1.195 (scratch/tmux-claude-ready/findings.md): the stable idle signal
// is FOOTER-based (`auto mode on` / `shift+tab to cycle`), NOT "? for shortcuts";
// a live turn shows `esc to interrupt`. These markers are version-sensitive, so
// they are frozen HERE in one classifier (the T008 readiness gate).

import { classifyInterstitial } from "./interstitial.js";

export type ReadinessState = "booting" | "interstitial" | "ready" | "busy" | "dead";

/** Idle-ready footer markers (last is a forward-compat fallback). */
const READY_RE = /shift\+tab to cycle|auto mode on|for shortcuts/i;
/** A live turn — used as the negative guard so an in-progress turn isn't idle. */
const BUSY_RE = /esc to interrupt/i;
/** Best-effort text death signal; the authoritative one is tmux `pane_dead`
 *  (the daemon's `inspect`), which this pure classifier cannot see. */
const DEAD_RE = /\[exited\]|pane is dead|process completed|command not found/i;

/**
 * Classify a captured pane into a readiness state. Order matters:
 *   dead → interstitial (blocks the input box) → busy (live turn) → ready → booting.
 * `ready` requires an idle footer marker AND no busy marker (the prototype's rule).
 */
export function classifyReadiness(paneText: string): ReadinessState {
	if (DEAD_RE.test(paneText)) return "dead";
	if (classifyInterstitial(paneText).action !== "none") return "interstitial";
	if (BUSY_RE.test(paneText)) return "busy";
	if (READY_RE.test(paneText)) return "ready";
	return "booting";
}
