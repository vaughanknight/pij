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

	it("copilot idle footer ('? help · tab next tab') → ready", () => {
		expect(classifyReadiness(COPILOT_READY)).toBe("ready");
	});

	it("copilot '◎ Working esc cancel' → busy", () => {
		expect(classifyReadiness(COPILOT_BUSY)).toBe("busy");
	});
});
