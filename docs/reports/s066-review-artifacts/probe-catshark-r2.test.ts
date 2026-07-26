import { describe, expect, it } from "vitest";
import { classifyInterstitial } from "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive/.pi/extensions/pij/core/interstitial.js";
import { classifyReadiness } from "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive/.pi/extensions/pij/core/readiness.js";

// The exact captured modal (interstitial.test.ts fixture).
const MODAL = `
 Session in use

 This session was last active just now and appears to be in use by another CLI or application.

 ❯ 1. Resume anyway
   2. Go back (Esc)

 ↑/↓ to navigate · enter to select · esc to cancel
`;

describe("s066 re-review probes", () => {
	it("PROBE-1 inertness: harness-less classify + readiness never see the modal", () => {
		expect(classifyInterstitial(MODAL)).toEqual({ action: "none" });
		expect(classifyReadiness(MODAL)).not.toBe("interstitial");
		// eslint-disable-next-line no-console
		console.log("PROBE-1 readiness(MODAL) =", classifyReadiness(MODAL));
	});

	it("PROBE-2 verbatim paste in a LIVE interactive pane still classifies as answer", () => {
		// A copilot seat that PRINTED the modal text (reviewing interstitial.ts,
		// showing the fixture, quoting a handoff note) and is now at its composer.
		const pane = `● Read(core/interstitial.ts)\n  Here is the captured shape:\n${MODAL}\nThat is the fixture.\n\n> \n◎ Working (esc interrupt)`;
		const verdict = classifyInterstitial(pane, "copilot");
		// eslint-disable-next-line no-console
		console.log("PROBE-2 verdict =", JSON.stringify(verdict), "readiness =", classifyReadiness(pane));
		expect(verdict.action).toBe("answer");
	});

	it("PROBE-3 how much trailing output is needed to push it out of the window", () => {
		for (const n of [1, 5, 20, 40, 60, 100]) {
			const pane = `${MODAL}${"newer output line\n".repeat(n)}`;
			// eslint-disable-next-line no-console
			console.log(
				`PROBE-3 trailing_lines=${n} chars_after=${n * 18} =>`,
				classifyInterstitial(pane, "copilot").action,
			);
		}
	});

	it("PROBE-4 box-drawn variant", () => {
		const boxed = MODAL.split("\n")
			.map((l) => (l.trim() === "" ? "│" : `│ ${l.trim()} │`))
			.join("\n");
		// eslint-disable-next-line no-console
		console.log("PROBE-4 boxed =", classifyInterstitial(boxed, "copilot").action);
	});

	it("PROBE-5 wrapped explanatory sentence (narrow pane)", () => {
		const wrapped = MODAL.replace(
			" This session was last active just now and appears to be in use by another CLI or application.",
			" This session was last active just now and appears to be in\n use by another CLI or application.",
		);
		// eslint-disable-next-line no-console
		console.log("PROBE-5 wrapped =", classifyInterstitial(wrapped, "copilot").action);
	});
});
