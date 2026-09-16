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

	it("returns unknown for pure 429 rate-limit text", () => {
		const pane = "Error: 429 rate_limit_exceeded — Too many requests";
		expect(classifyDeathReason(pane)).toBe("unknown");
	});

	it("detects quota from terminal exceeded-quota text", () => {
		const pane = "Error: You have exceeded your quota";
		expect(classifyDeathReason(pane)).toBe("quota");
	});

	it("returns unknown for 529 overloaded text because it is transient", () => {
		const pane = "Error: 529 — The model is overloaded";
		expect(classifyDeathReason(pane)).toBe("unknown");
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

// ─── Phase 1 (#5): quota-classifier honesty — the discriminator, both jaws ─────
// The load-bearing spec: `quota` requires a GENUINE error frame (anchored phrase
// or an exhausted-balance signal next to a billing noun), never bare vocabulary.
// These two blocks are the mutation pincer (task 1.5):
//   • re-broaden the regex to bare words  → the reject block flips RED
//   • narrow the regex off a named fixture → the keep block flips RED
describe("classifyDeathReason — quota honesty (#5)", () => {
	// KEEP green: the repo already decided these bare-frame strings ARE quota.
	it("keeps the named terminal-quota fixtures green", () => {
		expect(
			classifyDeathReason(
				"Error: prepaid credit balance exhausted — add credits at https://console.sakana.ai/billing",
			),
		).toBe("quota");
		expect(classifyDeathReason("Error: payAsYouGo balance insufficient — top up to continue")).toBe(
			"quota",
		);
		expect(classifyDeathReason("API Error: 402 insufficient credits")).toBe("quota");
	});

	// REJECT: bare billing-domain vocabulary (a billing repo's own output) is NOT a
	// provider quota death — no error frame, no anchored phrase.
	it("rejects bare billing-domain vocabulary as unknown", () => {
		for (const pane of [
			"split billing",
			"credit memo",
			"insufficient line items",
			"billing is not enabled for this workspace",
		]) {
			expect(classifyDeathReason(pane)).toBe("unknown");
		}
	});

	// Transients stay non-fatal unknown (task 1.4) — including resource_exhausted,
	// which must NOT trip the terminal "exhausted" signal.
	it("treats transient provider signals (429/529/overloaded/resource_exhausted) as unknown", () => {
		for (const pane of [
			"API Error: 429 rate_limit_exceeded",
			"Error: 529 — The model is overloaded",
			'{"error":{"code":"resource_exhausted","message":"rate limit exceeded"}}',
		]) {
			expect(classifyDeathReason(pane)).toBe("unknown");
		}
	});
});
