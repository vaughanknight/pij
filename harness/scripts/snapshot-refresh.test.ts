// FX001-4 pure-helper tests for the snapshot-refresh script.
// Median computation and corpus-rule extraction are pure, so testable without
// running the agent.

import { describe, expect, it } from "vitest";
import { chooseMedian, expectedRuleFor } from "./snapshot-refresh.js";
import type { Verdict } from "./vetters/types.js";

const v = (findings: Verdict["findings"]): Verdict => ({
	vetter: "agent",
	score: 100,
	level: "ok",
	findings,
	scannedFiles: 1,
	durationMs: 100,
});

const f = (rule: string, severity: "info" | "warn" | "fail" = "warn"): Verdict["findings"][0] => ({
	rule,
	msg: "x",
	severity,
});

describe("expectedRuleFor (FX001-4)", () => {
	it("extracts R-0N from r0N-* corpus filenames", () => {
		expect(expectedRuleFor("r01-override.md")).toBe("R-01");
		expect(expectedRuleFor("r04-exfil.md")).toBe("R-04");
		expect(expectedRuleFor("r07-tool-desc-smuggle.ts")).toBe("R-07");
	});

	it("returns null for non-rule filenames", () => {
		expect(expectedRuleFor("readme.md")).toBeNull();
		expect(expectedRuleFor("r1-too-short.md")).toBeNull();
		expect(expectedRuleFor("R01-uppercase.md")).toBeNull();
	});
});

describe("chooseMedian (FX001-4)", () => {
	it("picks the unanimous run", () => {
		const runs = [v([f("R-01")]), v([f("R-01")]), v([f("R-01")])];
		const out = chooseMedian(runs);
		expect(out.idx).toBe(0);
		expect(out.drift).toBe(0);
	});

	it("picks the modal run when 2 of 3 agree", () => {
		// run0 = {R-01}, run1 = {R-01}, run2 = {R-02} — mode = {R-01}, idx 0
		const runs = [v([f("R-01")]), v([f("R-01")]), v([f("R-02")])];
		const out = chooseMedian(runs);
		expect(out.idx).toBe(0);
		// drift = max symdiff = {R-01} vs {R-02} = 2
		expect(out.drift).toBe(2);
	});

	it("tie-breaks by lowest run index when no mode", () => {
		const runs = [v([f("R-01")]), v([f("R-02")]), v([f("R-03")])];
		const out = chooseMedian(runs);
		expect(out.idx).toBe(0);
	});

	it("reports drift as max pairwise symmetric-difference size", () => {
		// run0 = {A,B}, run1 = {A}, run2 = {A,B,C}
		// 0↔1: {B} = 1; 1↔2: {B,C} = 2; 0↔2: {C} = 1 → drift = 2
		const runs = [v([f("A"), f("B")]), v([f("A")]), v([f("A"), f("B"), f("C")])];
		const out = chooseMedian(runs);
		expect(out.drift).toBe(2);
	});

	it("treats finding sets as severity-aware (same rule different severity = different)", () => {
		const runs = [v([f("R-01", "warn")]), v([f("R-01", "fail")]), v([f("R-01", "warn")])];
		// mode = {R-01:warn} (2 runs) — run0 (lowest idx)
		const out = chooseMedian(runs);
		expect(out.idx).toBe(0);
		// drift: 0↔1: {R-01:warn, R-01:fail} = 2; 0↔2: 0; 1↔2: 2 → 2
		expect(out.drift).toBe(2);
	});
});
