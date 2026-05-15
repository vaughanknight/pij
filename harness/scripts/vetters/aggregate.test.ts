import { describe, expect, it } from "vitest";
import { aggregate, runPipeline } from "./aggregate.js";
import type { Verdict } from "./types.js";

const ok = (vetter: string, score = 100): Verdict => ({
	vetter,
	score,
	level: "ok",
	findings: [],
	scannedFiles: 1,
	durationMs: 10,
});

const warn = (vetter: string, msg = "minor"): Verdict => ({
	vetter,
	score: 80,
	level: "warn",
	findings: [{ rule: `${vetter}:x`, msg, severity: "warn" }],
	scannedFiles: 1,
	durationMs: 10,
});

const fail = (vetter: string, msg = "boom"): Verdict => ({
	vetter,
	score: 30,
	level: "fail",
	findings: [{ rule: `${vetter}:y`, msg, severity: "fail" }],
	scannedFiles: 1,
	durationMs: 10,
});

describe("aggregate", () => {
	it("empty input → ok at score 100", () => {
		const v = aggregate([]);
		expect(v.level).toBe("ok");
		expect(v.score).toBe(100);
		expect(v.findings).toEqual([]);
	});

	it("all ok → ok", () => {
		const v = aggregate([ok("a"), ok("b"), ok("c")]);
		expect(v.level).toBe("ok");
		expect(v.score).toBe(100);
	});

	it("any warn → warn (no fail)", () => {
		const v = aggregate([ok("a"), warn("b")]);
		expect(v.level).toBe("warn");
		expect(v.findings).toHaveLength(1);
	});

	it("any fail → fail (regardless of warns)", () => {
		const v = aggregate([ok("a"), warn("b"), fail("c")]);
		expect(v.level).toBe("fail");
		expect(v.findings).toHaveLength(2);
	});

	it("preserves agentRubric from agent vetter", () => {
		const agent: Verdict = {
			vetter: "agent",
			score: 100,
			level: "ok",
			findings: [],
			scannedFiles: 7,
			durationMs: 12_000,
			agentRubric: "abc123",
		};
		const v = aggregate([ok("a"), agent]);
		expect(v.agentRubric).toBe("abc123");
	});

	it("computes mean score, rounded", () => {
		const v = aggregate([ok("a", 100), warn("b"), fail("c")]); // 100, 80, 30 → mean 70
		expect(v.score).toBe(70);
	});
});

describe("runPipeline", () => {
	it("runs all vetters in order without short-circuit", async () => {
		const calls: string[] = [];
		const fake = (name: string, level: Verdict["level"]) => ({
			name,
			async vet(): Promise<Verdict> {
				calls.push(name);
				return level === "ok" ? ok(name) : level === "warn" ? warn(name) : fail(name);
			},
		});
		const out = await runPipeline(
			[fake("a", "ok"), fake("b", "fail"), fake("c", "ok")],
			"/tmp",
			"src",
		);
		expect(calls).toEqual(["a", "b", "c"]);
		expect(out).toHaveLength(3);
	});

	it("short-circuits after first fail", async () => {
		const calls: string[] = [];
		const fake = (name: string, level: Verdict["level"]) => ({
			name,
			async vet(): Promise<Verdict> {
				calls.push(name);
				return level === "ok" ? ok(name) : level === "warn" ? warn(name) : fail(name);
			},
		});
		const out = await runPipeline(
			[fake("a", "ok"), fake("b", "fail"), fake("c", "ok")],
			"/tmp",
			"src",
			{ shortCircuit: true },
		);
		expect(calls).toEqual(["a", "b"]);
		expect(out).toHaveLength(2);
	});
});
