import { describe, expect, it } from "vitest";

import {
	activityOf,
	classifyDeathReason,
	isStalled,
	isWorking,
	liveness,
	STALE_AFTER_MS,
} from "./state.js";

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
	// `stale` means "should be making progress but isn't" (a stall — mirrors
	// isStalled), NOT merely "quiet". It only fires for a WORKING peer gone silent.
	it("stale when WORKING + newest event too old (a stall)", () => {
		expect(liveness(true, STALE_AFTER_MS + 1, STALE_AFTER_MS, true)).toBe("stale");
	});
	it("stale when WORKING + no events", () => {
		expect(liveness(true, null, STALE_AFTER_MS, true)).toBe("stale");
	});
	it("active when WORKING but event is recent (making progress)", () => {
		expect(liveness(true, 5_000, STALE_AFTER_MS, true)).toBe("active");
	});
	// The fix (INS-001): a bound, pid-alive, IDLE/done peer that is simply quiet
	// past the threshold is reachable — it must read `active`, never `stale`.
	it("active (NOT stale) when an idle/done peer is quiet past the threshold", () => {
		expect(liveness(true, STALE_AFTER_MS + 1)).toBe("active");
	});
	it("active (NOT stale) when an idle peer has no events at all", () => {
		expect(liveness(true, null)).toBe("active");
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

describe("activityOf", () => {
	it("working state → working (regardless of activity ts)", () => {
		expect(activityOf("working", true)).toBe("working");
		expect(activityOf("working", false)).toBe("working");
	});
	it("idle after having worked → done", () => {
		expect(activityOf("idle", true)).toBe("done");
	});
	it("idle and never active → idle", () => {
		expect(activityOf("idle", false)).toBe("idle");
		expect(activityOf(undefined, false)).toBe("idle");
	});
});

describe("classifyDeathReason", () => {
	it("treats transient provider quota/rate-limit text as non-fatal unknown", () => {
		const transientPanes = [
			"API Error: 429 Too Many Requests",
			"provider overloaded, retrying",
			"API Error: 529 overloaded",
			'{"error":{"code":"resource_exhausted","message":"rate limit exceeded"}}',
			'{"error":{"code":"rate_limit_exceeded"}}',
		];

		for (const pane of transientPanes) {
			expect(classifyDeathReason(pane)).toBe("unknown");
		}
	});

	it("classifies terminal quota/billing text as quota", () => {
		const terminalPanes = [
			"insufficient credit to continue",
			"billing is not enabled for this workspace",
			"prepaid balance exhausted",
		];

		for (const pane of terminalPanes) {
			expect(classifyDeathReason(pane)).toBe("quota");
		}
	});
});
