import { describe, expect, it } from "vitest";

import { classifyReadiness } from "./readiness.js";

// Fixtures lifted from the live prototype (scratch/tmux-claude-ready/findings.md),
// captured against Claude Code v2.1.195 / Sonnet 4.6.
const READY_FOOTER = `
 ❯ Try "edit <filepath> to..."

 ~/pi-hacking/pij ⎇ main • Sonnet 4.6 • ⚡high
 ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
`;

const BUSY = `
 ⏺ Working on it…

   Searching the codebase (esc to interrupt)
`;

const BOOTING = `
 ▐▛███▜▌  Claude Code v2.1.195
 ▝▜█████▛▘ Loading…
`;

const CHROME_INTERSTITIAL = `
 Claude in Chrome extension detected
   Enter to confirm · Esc to keep browser tools off
`;

// Copilot CLI v1.0.66 fixtures, captured live 2026-06-27 (wholly different TUI,
// same footer-marker shape).
const COPILOT_READY = `
 ~/pi-hacking/pij [⎇ main*%]             Session: 0 AIC used
─────────────────────────────────────────────────────────────
❯
─────────────────────────────────────────────────────────────
 / commands · ? help · tab next tab                  GPT-5.5
`;

const COPILOT_BUSY = `
 ~/pi-hacking/pij [⎇ main*%]             Session: 0 AIC used
─────────────────────────────────────────────────────────────
❯
─────────────────────────────────────────────────────────────
 ◎ Working esc cancel                                GPT-5.5
`;

// Live capture of a pij-spawned claude MID-TURN in a narrow split pane: the
// `(esc to interrupt · …)` hint is truncated off the spinner line, so busy must
// be read from the capitalized gerund (`Percolating…`) + the streaming token
// counter. The status bar still reads `bypass permissions on` (a READY marker),
// so this is the load-bearing "busy guard must win" case (regression).
const CLAUDE_NARROW_BUSY = `
✻ Churned for 16s
✽ Percolating… (6s · ↓ 131 tokens)
─────────────────────────────────────────────────
❯
─────────────────────────────────────────────────
  pij ⎇ main • Opus 4.8 (1M context) • ⚡high •…
  ⏵⏵ bypass permissions on (shift+tab to      ·
`;

// Codex CLI v0.142.3 fixtures, captured LIVE from a pij-spawned codex pane
// (Plan 022, T013): idle = the `›` composer + `Use /skills` hint + a
// `<model> <effort> · <cwd>` footer; a live turn = `Working (Ns • esc to
// interrupt)`. The boot box (`>_ OpenAI Codex`) is deliberately NOT a ready
// marker — it shows BEFORE the composer is interactive, so binding off it would
// inject init into a pane that can't yet receive keystrokes.
const CODEX_READY = `
• You have 1 usage limit reset available. Run /usage to use one.
› Use /skills to list available skills
  gpt-5.5 medium · ~/pi-hacking/pij
`;

const CODEX_BUSY = `
› Run this shell command: sleep 6 && echo SLEPT
• Working (4s • esc to interrupt) · 1 background terminal running · /ps …
› Use /skills to list available skills
  gpt-5.5 medium · ~/pi-hacking/pij
`;

const CODEX_BOOTING = `
╭────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.142.3)                     │
│ permissions: YOLO mode                          │
╰────────────────────────────────────────────────╯
`;

// A NON-codex pane (claude) that renders a bare `›` glyph in its OWN output — a
// breadcrumb / nav arrow, not the codex composer — with NO codex marker and NO
// other READY footer marker. classifyReadiness is harness-agnostic (the daemon
// runs every control-plane pane through it), so the old READY_RE — which listed a
// bare `›` as a codex marker — misread this as `ready` (review note dlg-0002, LOW).
// The codex signal is now anchored to the codex-specific `Use /skills` token, so a
// stray `›` alone must NOT read as ready.
const STRAY_CHEVRON_NON_CODEX = `
 ⏺ The file you asked about lives at src › core › readiness.ts
`;

describe("classifyReadiness", () => {
	it("idle footer markers → ready", () => {
		expect(classifyReadiness(READY_FOOTER)).toBe("ready");
	});

	it("'esc to interrupt' → busy (a live turn is not idle-ready)", () => {
		expect(classifyReadiness(BUSY)).toBe("busy");
	});

	it("busy guard wins even when a footer marker is also present", () => {
		expect(classifyReadiness(`${READY_FOOTER}\n esc to interrupt`)).toBe("busy");
	});

	it("a one-time interstitial blocks readiness → interstitial", () => {
		expect(classifyReadiness(CHROME_INTERSTITIAL)).toBe("interstitial");
	});

	it("early boot with no markers → booting", () => {
		expect(classifyReadiness(BOOTING)).toBe("booting");
	});

	it("a dead/exited pane → dead", () => {
		expect(classifyReadiness("claude: command not found")).toBe("dead");
	});

	it("claude --dangerously-skip-permissions footer ('bypass permissions on') → ready", () => {
		// The ACTUAL footer of a pij-spawned claude (live capture, narrow split pane
		// that truncates 'shift+tab to cycle' → 'shift+tab to'). The old fixture used
		// 'auto mode on', which a pij-spawned pane never shows. Regression for the
		// stuck-at-pending bind bug.
		const REAL =
			"  pij ⎇ main • Opus 4.8 • ⚡high •…\n  ⏵⏵ bypass permissions on (shift+tab to      ·";
		expect(classifyReadiness(REAL)).toBe("ready");
	});

	it("copilot idle footer ('? help · tab next tab') → ready", () => {
		expect(classifyReadiness(COPILOT_READY)).toBe("ready");
	});

	it("claude mid-turn in a NARROW pane → busy (gerund+counter, esc-hint truncated)", () => {
		// The busy guard must beat the `bypass permissions on` READY marker that the
		// status bar shows even while working (the #11 live-validation bug).
		expect(classifyReadiness(CLAUDE_NARROW_BUSY)).toBe("busy");
	});

	it("copilot '◎ Working esc cancel' → busy", () => {
		expect(classifyReadiness(COPILOT_BUSY)).toBe("busy");
	});

	// ─── codex (Plan 022, T013 — R-1 resolved against the live pane) ────────────
	it("codex idle composer ('› Use /skills' + footer) → ready", () => {
		expect(classifyReadiness(CODEX_READY)).toBe("ready");
	});

	it("codex live turn ('Working (Ns • esc to interrupt)') → busy, even with the footer present", () => {
		// Busy guard must beat the codex footer that persists during a turn — the same
		// rule as claude/copilot. Without it the daemon would re-inject mid-turn.
		expect(classifyReadiness(CODEX_BUSY)).toBe("busy");
	});

	it("codex boot box (before the composer renders) → booting, NOT ready", () => {
		// The `>_ OpenAI Codex` banner shows BEFORE codex accepts input; binding off it
		// would inject init into a pane that drops the keystrokes (Finding 07 timing).
		expect(classifyReadiness(CODEX_BOOTING)).toBe("booting");
	});

	// ─── dlg-0002 guard: anchor the codex `›` so it can't false-positive ─────────
	it("a stray '›' in a non-codex pane (no codex/READY marker) → NOT ready", () => {
		// RED against the old bare-`›` READY_RE (it matched `›` → ready); GREEN once the
		// codex signal requires the codex-specific `Use /skills` token. This is the guard
		// that would have caught review note dlg-0002 (LOW): `›` is a single generic
		// glyph a claude/copilot pane can emit in its own output.
		expect(classifyReadiness(STRAY_CHEVRON_NON_CODEX)).not.toBe("ready");
		expect(classifyReadiness(STRAY_CHEVRON_NON_CODEX)).toBe("booting");
	});
});
