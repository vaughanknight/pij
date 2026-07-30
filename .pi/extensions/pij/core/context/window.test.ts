import { describe, expect, it } from "vitest";
import { contextWindowFromPane, expectedContextWindowLabel } from "./window.js";

describe("effective context-window footer evidence", () => {
	it.each([
		["GPT-5.6 Sol · 1.1M context", "1.1M"],
		["Opus 5 · 400K context", "400K"],
		["high • 70k/1.0M • ready", "1.0M"],
		["12%/1050k tokens", "1050K"],
	] as const)("reads %s", (pane, label) => {
		expect(contextWindowFromPane(pane)).toEqual({
			label: label === "1050K" ? "1.1M" : label,
			tokens:
				label === "1.1M"
					? 1_100_000
					: label === "1.0M"
						? 1_000_000
						: Number.parseInt(label, 10) * 1_000,
			source: "pane-footer",
		});
	});

	it("returns null rather than substituting catalog metadata when the footer has no tier", () => {
		expect(contextWindowFromPane("claude-opus-5 · ready")).toBeNull();
	});

	it.each([
		[1_000_000, "1.0M"],
		[1_050_000, "1.1M"],
		[400_000, "400K"],
	] as const)("formats catalog window %i as %s", (tokens, label) => {
		expect(expectedContextWindowLabel(tokens)).toBe(label);
	});
});
