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
			"insufficient credit to continue", // anchored: insufficient + balance noun
			"prepaid balance exhausted", // exhausted signal next to a billing noun
		];

		for (const pane of terminalPanes) {
			expect(classifyDeathReason(pane)).toBe("quota");
		}
	});

	// Quota-classifier honesty (#5, task 1.1): bare billing-domain vocabulary —
	// the kind a billing/accounting repo prints in its OWN output — must never be
	// mistaken for a provider quota death. No error frame, no anchored phrase → unknown.
	it("returns unknown for billing-domain prose with no real error frame", () => {
		const prose = [
			"split billing",
			"credit memo",
			"insufficient line items", // NOT "insufficient credits"
			"billing is not enabled for this workspace", // bare billing, no error frame
			"reconcile the outstanding balance",
		];

		for (const pane of prose) {
			expect(classifyDeathReason(pane)).toBe("unknown");
		}
	});

	// Residual false-positive F3 (#5, task 1.6): classification is scoped to the
	// pane TAIL (last error region). A real provider-error string sitting HIGHER in
	// scrollback (e.g. a billing repo that printed `402 insufficient credits` in its
	// own output earlier) is NOT this session's death reason.
	it("does not classify quota from a real error string higher in scrollback (tail-scoped)", () => {
		const pane = [
			"API Error: 402 insufficient credits",
			...Array(25).fill("regular build output line"),
			"$ ready",
		].join("\n");
		expect(classifyDeathReason(pane)).toBe("unknown");
	});

	// 1.6 ordering: a clean `[exited]` death must read `dead`, not `quota`, even when
	// billing text sits higher in scrollback (quota-before-DEAD_RE ordering addressed
	// via tail-scoping — the high-scrollback billing string is out of the tail).
	it("returns dead for a clean [exited] even when billing text sits higher in scrollback", () => {
		const pane = [
			"API Error: 402 insufficient credits",
			...Array(25).fill("regular build output line"),
			"[exited]",
		].join("\n");
		expect(classifyDeathReason(pane)).toBe("dead");
	});

	// The pincer's other jaw: a GENUINE terminal quota error in the tail still → quota.
	it("still classifies a real terminal quota error in the pane tail as quota", () => {
		const pane = [
			...Array(25).fill("regular build output line"),
			"Error: prepaid credit balance exhausted — add credits at https://console.example.ai/billing",
		].join("\n");
		expect(classifyDeathReason(pane)).toBe("quota");
	});
});
