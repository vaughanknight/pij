import { afterEach, describe, expect, it } from "vitest";
import { NodeProcess } from "./process.js";

describe("NodeProcess", () => {
	const proc = new NodeProcess();

	it("pid() is this process", () => {
		expect(proc.pid()).toBe(process.pid);
	});

	it("isAlive(): own pid alive, bogus pid dead", () => {
		expect(proc.isAlive(process.pid)).toBe(true);
		// 2^31-ish pid that will not exist on a test host
		expect(proc.isAlive(2147483646)).toBe(false);
	});

	it("now() is a recent epoch ms", () => {
		const t = proc.now();
		expect(t).toBeGreaterThan(1_700_000_000_000);
		expect(Math.abs(Date.now() - t)).toBeLessThan(1000);
	});

	describe("env()", () => {
		afterEach(() => {
			delete process.env.PIJ_TEST_VAR;
		});
		it("reads a set var and returns undefined for an unset one", () => {
			process.env.PIJ_TEST_VAR = "alice";
			expect(proc.env("PIJ_TEST_VAR")).toBe("alice");
			expect(proc.env("PIJ_DEFINITELY_UNSET_VAR")).toBeUndefined();
		});
	});
});
