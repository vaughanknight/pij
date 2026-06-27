// pij-control-plane — pane readiness classifier (pure, Plan 019).
//
// Reads a captured pane and decides whether the harness is idle-ready for input
// — no agent in the loop. R-01 was RESOLVED by the live prototype against Claude
// Code v2.1.195 (scratch/tmux-claude-ready/findings.md): the stable idle signal
// is FOOTER-based (`auto mode on` / `shift+tab to cycle`), NOT "? for shortcuts";
// a live turn shows `esc to interrupt`. These markers are version-sensitive, so
// they are frozen HERE in one classifier (the T008 readiness gate).
//
// Copilot CLI (v1.0.66) has a wholly different TUI but the SAME footer-marker
// shape (verified live 2026-06-27): idle footer = `/ commands · ? help · tab next
// tab`; a live turn = `◎ Working esc cancel`. Both harnesses' markers live in this
// one classifier (the daemon reads any control-plane pane through it).

import { classifyInterstitial } from "./interstitial.js";

export type ReadinessState = "booting" | "interstitial" | "ready" | "busy" | "dead";

/** Idle-ready footer markers across control-plane harnesses (claude + copilot);
 *  `for shortcuts` is a forward-compat fallback. `bypass permissions on` is the
 *  claude footer when launched with --dangerously-skip-permissions — which is
 *  EXACTLY how pij spawns claude, so it's the common case, not an edge one (the
 *  old `auto mode on` fixture never matched a real pij-spawned pane). It also
 *  survives a narrow split pane that truncates `shift+tab to cycle` → `shift+tab
 *  to`, because `bypass permissions on` appears earlier on the line. */
const READY_RE =
	/bypass permissions on|shift\+tab to cycle|auto mode on|for shortcuts|tab next tab|\? help/i;
/** A live turn — the negative guard so an in-progress turn isn't read as idle.
 *  `esc to interrupt` = claude (WIDE pane); `esc cancel` (the `◎ Working` footer)
 *  = copilot. In a NARROW split pane (how pij spawns), claude truncates
 *  `(esc to interrupt · …)` off the spinner line, so we also match the
 *  truncation-robust busy markers that survive at the LEFT of the line: the
 *  capitalized gerund spinner (`✽ Percolating…`, `Wandering…`) and the live
 *  streaming token counter (`↓ 131 tokens`). Idle shows a past-tense summary
 *  (`✻ Churned for 16s`) with no ellipsis/counter, so it never matches. Order
 *  matters: classifyReadiness checks BUSY before READY, so a working pane whose
 *  status bar still reads `bypass permissions on` is correctly read as busy. */
const BUSY_RE = /esc to interrupt|esc cancel|↓\s*\d+\s*tokens?|\b(?!Loading…)[A-Z][a-z]+ing…/u;
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
