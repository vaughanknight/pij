import { describe, expect, it } from "vitest";
import { classifyInterstitial } from "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive/.pi/extensions/pij/core/interstitial.js";
import { classifyReadiness } from "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive/.pi/extensions/pij/core/readiness.js";

const MODAL = `
 Session in use

 This session was last active just now and appears to be in use by another CLI or application.

 ❯ 1. Resume anyway
   2. Go back (Esc)

 ↑/↓ to navigate · enter to select · esc to cancel
`;

// The seam's rule, restated: it fires only when readiness is booting AND the
// harness-aware classifier labels the tail session-in-use.
function seamFires(pane: string, harness: "copilot" | "claude" = "copilot"): boolean {
	return (
		classifyReadiness(pane) === "booting" &&
		classifyInterstitial(pane, harness).label === "session-in-use"
	);
}

describe("round-3 seam probes", () => {
	it("P1 the genuine footer-less modal DOES fire (and only for copilot)", () => {
		// eslint-disable-next-line no-console
		console.log(
			"P1 readiness =",
			classifyReadiness(MODAL),
			"| copilot fires =",
			seamFires(MODAL),
			"| claude fires =",
			seamFires(MODAL, "claude"),
		);
	});

	it("P2 quoted modal in a busy pane cannot fire", () => {
		const busy = `${MODAL}\nThat was the fixture.\n◎ Working esc interrupt`;
		// eslint-disable-next-line no-console
		console.log("P2 readiness =", classifyReadiness(busy), "| fires =", seamFires(busy));
	});

	it("P3 quoted modal in a READY pane cannot fire", () => {
		const ready = `${MODAL}\nThat was the fixture.\n/ commands · ? help · tab next tab`;
		// eslint-disable-next-line no-console
		console.log("P3 readiness =", classifyReadiness(ready), "| fires =", seamFires(ready));
	});

	it("P4 quoted modal with NO footer (replay window) — does it fire?", () => {
		const replay = `● Restored session 71111111-…\n  user: show me the interstitial fixture\n  assistant:\n${MODAL}\n  (end of replay)`;
		// eslint-disable-next-line no-console
		console.log("P4 readiness =", classifyReadiness(replay), "| fires =", seamFires(replay));
	});

	it("P5 GENUINE modal overlaid on a painted TUI footer — is the real modal still answered?", () => {
		const overlay = `/ commands · ? help · tab next tab\n${MODAL}`;
		// eslint-disable-next-line no-console
		console.log("P5 readiness =", classifyReadiness(overlay), "| fires =", seamFires(overlay));
	});

	it("P6 anchored trust/login regexes vs ordinary prose", () => {
		const prose = `I checked whether the harness would ask Do you trust the files in this folder? mid-sentence, and whether Log in with something appears.`;
		// eslint-disable-next-line no-console
		console.log(
			"P6 prose =",
			JSON.stringify(classifyInterstitial(prose)),
			"| readiness =",
			classifyReadiness(prose),
		);
		expect(classifyInterstitial(prose).action).toBe("none");
	});
});
