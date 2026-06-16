import { describe, expect, it } from "vitest";

import { isStalled, isWorking, liveness, STALE_AFTER_MS } from "./state.js";

describe("isWorking", () => {
	it("treats in-progress/reviewing as working", () => {
		expect(isWorking("in-progress")).toBe(true);
		expect(isWorking("reviewing")).toBe(true);
	});
	it("treats idle/paused/complete/error as static", () => {
		expect(isWorking("idle")).toBe(false);
		expect(isWorking("paused")).toBe(false);
		expect(isWorking("complete")).toBe(false);
		expect(isWorking("error")).toBe(false);
	});
});

describe("liveness", () => {
	it("dead when pid is gone", () => {
		expect(liveness(false, 10)).toBe("dead");
	});
	it("active when pid alive + recent event", () => {
		expect(liveness(true, 5_000)).toBe("active");
	});
	it("stale when pid alive but newest event too old", () => {
		expect(liveness(true, STALE_AFTER_MS + 1)).toBe("stale");
	});
	it("stale when pid alive but no events", () => {
		expect(liveness(true, null)).toBe("stale");
	});
});

describe("isStalled", () => {
	it("flags a working session whose newest event is stale", () => {
		expect(isStalled("in-progress", STALE_AFTER_MS + 1)).toBe(true);
		expect(isStalled("in-progress", null)).toBe(true);
	});
	it("does not flag a working session with fresh events", () => {
		expect(isStalled("reviewing", 1_000)).toBe(false);
	});
	it("never flags a static session", () => {
		expect(isStalled("idle", null)).toBe(false);
	});
});
