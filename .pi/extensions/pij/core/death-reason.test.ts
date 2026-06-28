// pij-control-plane — DeathReason classifier tests (T007, TDD RED first).
//
// Machine-stable reason codes: model-not-supported|auth|quota|stalled|dead|unknown.
// SessionDescriptor additive fields: boundModel?, failureReason?.

import { describe, expect, it } from "vitest";
import { classifyDeathReason } from "./state.js";
import type { SessionDescriptor } from "./types.js";

// Verify additive fields compile + are optional (no existing field regressions)
const BOUND: SessionDescriptor = {
	id: "pij-test",
	folder: "/repo",
	dataDir: "/home/.pij/pij-test",
	eventsPath: "/home/.pij/pij-test/events.ndjson",
	pid: 1234,
	startedAt: "2026-06-28T00:00:00.000Z",
	harness: "claude",
	lifecycle: "bound",
	// New additive fields — both optional:
	boundModel: "claude-sonnet-4-6",
	failureReason: undefined,
};

describe("SessionDescriptor additive fields", () => {
	it("boundModel is accessible and optional", () => {
		expect(BOUND.boundModel).toBe("claude-sonnet-4-6");
		const noModel: SessionDescriptor = { ...BOUND, boundModel: undefined };
		expect(noModel.boundModel).toBeUndefined();
	});

	it("failureReason is accessible and optional", () => {
		const failed: SessionDescriptor = { ...BOUND, failureReason: "model-not-supported" };
		expect(failed.failureReason).toBe("model-not-supported");
		expect(BOUND.failureReason).toBeUndefined();
	});
});

describe("classifyDeathReason", () => {
	it("detects model-not-supported from claude API Error 400", () => {
		const pane =
			'API Error: 400 {"id":"msg_123","type":"error","error":{"type":"not_found_error","message":"model: claude-zz-99"}}';
		expect(classifyDeathReason(pane)).toBe("model-not-supported");
	});

	it("detects model-not-supported from 'model not found' text", () => {
		const pane = "Error: model not found: gpt-99-fake";
		expect(classifyDeathReason(pane)).toBe("model-not-supported");
	});

	it("detects model-not-supported from 'invalid model' text", () => {
		const pane = "Error: invalid_model — The model `claude-unknown` does not exist";
		expect(classifyDeathReason(pane)).toBe("model-not-supported");
	});

	it("detects auth from authentication error text", () => {
		const pane = "Error: 401 Unauthorized — invalid API key";
		expect(classifyDeathReason(pane)).toBe("auth");
	});

	it("detects auth from 'authentication_error' text", () => {
		const pane = 'API Error: 401 {"type":"authentication_error"}';
		expect(classifyDeathReason(pane)).toBe("auth");
	});

	it("detects quota from rate limit text", () => {
		const pane = "Error: 429 rate_limit_exceeded — You have exceeded your quota";
		expect(classifyDeathReason(pane)).toBe("quota");
	});

	it("detects quota from 'overloaded' text (copilot/pi capacity error)", () => {
		const pane = "Error: 529 — The model is overloaded";
		expect(classifyDeathReason(pane)).toBe("quota");
	});

	it("returns dead for a pane that exited cleanly", () => {
		const pane = "[exited]";
		expect(classifyDeathReason(pane)).toBe("dead");
	});

	it("returns stalled for a working-but-quiet pattern (generic watchdog)", () => {
		// The watchdog itself marks stalled; this just covers the pane-less path
		expect(classifyDeathReason("", "stalled")).toBe("stalled");
	});

	it("returns unknown for unrecognised pane content", () => {
		expect(classifyDeathReason("some random text")).toBe("unknown");
	});

	// FIX-B mutation-proof: narrowing QUOTA_RE back (removing credit|billing|prepaid|payAsYouGo|insufficient) → RED.
	it("detects quota from sakana prepaid credit error (INS-007)", () => {
		const pane =
			"Error: prepaid credit balance exhausted — add credits at https://console.sakana.ai/billing";
		expect(classifyDeathReason(pane)).toBe("quota");
	});

	it("detects quota from sakana payAsYouGo balance text", () => {
		const pane = "Error: payAsYouGo balance insufficient — top up to continue";
		expect(classifyDeathReason(pane)).toBe("quota");
	});

	it("detects quota from generic 'insufficient credits' text", () => {
		const pane = "API Error: 402 insufficient credits";
		expect(classifyDeathReason(pane)).toBe("quota");
	});

	it("returns unknown for empty pane with no hint", () => {
		expect(classifyDeathReason("")).toBe("unknown");
	});
});
