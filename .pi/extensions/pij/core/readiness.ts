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

/** Idle-ready footer markers across control-plane harnesses (claude + copilot +
 *  codex); `for shortcuts` is a forward-compat fallback. `bypass permissions on`
 *  is the claude footer when launched with --dangerously-skip-permissions — which
 *  is EXACTLY how pij spawns claude, so it's the common case, not an edge one (the
 *  old `auto mode on` fixture never matched a real pij-spawned pane). It also
 *  survives a narrow split pane that truncates `shift+tab to cycle` → `shift+tab
 *  to`, because `bypass permissions on` appears earlier on the line.
 *
 *  Codex (Plan 022, T013; FIXED here after a live v0.142.3 deadlock): the codex
 *  idle marker is its INTERACTIVE composer FOOTER — `<model> <effort> · <cwd>`
 *  (e.g. `gpt-5.5 xhigh · ~/pi-hacking/pij`), matched by {@link CODEX_COMPOSER_FOOTER}.
 *  The ORIGINAL marker was the `Use /skills` hint — but that hint is a ROTATING
 *  placeholder: codex cycles it with `Find and fix a bug in @filename`,
 *  `Explain @filename`, … so on a live pane it had rotated AWAY, `Use /skills`
 *  never matched, the daemon read codex as `booting` FOREVER, never injected init,
 *  codex never took a turn, never wrote a rollout, never bound — and every send
 *  stayed buffered pre-bind (the reported "codex peers never bind" bug). The
 *  composer footer, by contrast, PERSISTS across every placeholder rotation, so it
 *  is the stable anchor; `Use /skills` is kept below only as a bonus (harmless when
 *  it does show). We anchor the footer on the `·` (U+00B7) middot + a `~/` or `/`
 *  cwd path — NOT a bare `›` glyph, which a non-codex pane can emit in its own
 *  output (review note dlg-0002, LOW). The footer is absent from the boot banner
 *  (`>_ OpenAI Codex` → stays `booting`, no premature inject) and present once the
 *  composer accepts input; the busy guard below still wins for `Working (Ns • esc
 *  to interrupt)`, so it never fires mid-turn though the footer persists. */
const READY_RE =
	/bypass permissions on|shift\+tab to cycle|auto mode on|for shortcuts|tab next tab|\? help|Use \/skills/i;
/** Codex's interactive composer footer: `<model> <effort> · <cwd>`. The `·`
 *  (U+00B7) middot separator followed by a `~/` or `/` path is codex-specific and
 *  appears ONLY once the composer is interactive — see the READY_RE note above for
 *  why this (not the rotating `Use /skills` placeholder) is the codex idle anchor. */
const CODEX_COMPOSER_FOOTER = /·\s+~?\/\S/;
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
	if (READY_RE.test(paneText) || CODEX_COMPOSER_FOOTER.test(paneText)) return "ready";
	return "booting";
}
