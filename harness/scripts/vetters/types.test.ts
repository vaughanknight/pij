import { describe, expect, it } from "vitest";
import { deriveLevel, deriveScore, type Finding } from "./types.js";

const f = (severity: Finding["severity"]): Finding => ({
	rule: "test",
	msg: "x",
	severity,
});

describe("deriveLevel", () => {
	it("any fail → fail", () => {
		expect(deriveLevel([f("info"), f("warn"), f("fail")])).toBe("fail");
	});
	it("warn without fail → warn", () => {
		expect(deriveLevel([f("info"), f("warn")])).toBe("warn");
	});
	it("info only → ok", () => {
		expect(deriveLevel([f("info"), f("info")])).toBe("ok");
	});
	it("empty → ok", () => {
		expect(deriveLevel([])).toBe("ok");
	});
});

describe("deriveScore", () => {
	it("clean → 100", () => {
		expect(deriveScore([])).toBe(100);
	});
	it("warns subtract 10 each", () => {
		expect(deriveScore([f("warn"), f("warn")])).toBe(80);
	});
	it("fails subtract 30 each", () => {
		expect(deriveScore([f("fail"), f("fail")])).toBe(40);
	});
	it("info doesn't affect score", () => {
		expect(deriveScore([f("info"), f("info"), f("info")])).toBe(100);
	});
	it("floor at zero", () => {
		expect(deriveScore([f("fail"), f("fail"), f("fail"), f("fail")])).toBe(0);
	});
});
