// pij-control-plane — per-harness bad-model detector tests (T009, TDD RED first).
//
// Detectors are PURE, operating on capturePane text (not process stderr).
// claude: API Error → also triggers classifyReadiness "dead" path
// pi/copilot/codex: first-inference 400 / error text

import { describe, expect, it } from "vitest";
import type { HarnessKind } from "../types.js";
import { type BadModelDetection, detectBadModelInPane, extractBoundModel } from "./badmodel.js";

// ─── claude ──────────────────────────────────────────────────────────────────

describe("detectBadModelInPane — claude", () => {
	const H: HarnessKind = "claude";

	it("detects API Error 400 with not_found_error body", () => {
		const pane =
			'API Error: 400 {"type":"error","error":{"type":"not_found_error","message":"model: gpt-99"}}\n' +
			"⚑ bypass permissions on";
		const r = detectBadModelInPane(H, pane);
		expect(r.detected).toBe(true);
		if (r.detected) expect(r.reason).toBe("model-not-supported");
	});

	it("detects 'model not found' text", () => {
		const pane = "Error: model not found: gpt-99\n⚑ bypass permissions on";
		expect(detectBadModelInPane(H, pane).detected).toBe(true);
	});

	it("returns detected=false for normal pane text", () => {
		const pane =
			"pij phonehome\nphoned home: pij-abc ↔ claude session xyz (bound)\n⚑ bypass permissions on";
		expect(detectBadModelInPane(H, pane).detected).toBe(false);
	});

	it("returns detected=false for a busy pane (agent responding)", () => {
		const pane = "↓ 42 tokens  esc to interrupt\n⚑ bypass permissions on";
		expect(detectBadModelInPane(H, pane).detected).toBe(false);
	});
});

// ─── copilot ─────────────────────────────────────────────────────────────────

describe("detectBadModelInPane — copilot", () => {
	const H: HarnessKind = "copilot";

	it("detects first-inference 400 response", () => {
		const pane =
			"Error: 400 Bad Request — model 'gpt-99' not available\n/ commands · ? help · tab next tab";
		expect(detectBadModelInPane(H, pane).detected).toBe(true);
	});

	it("detects 'model not supported' text", () => {
		const pane = "model not supported: gpt-99\n/ commands · ? help · tab next tab";
		expect(detectBadModelInPane(H, pane).detected).toBe(true);
	});

	it("returns detected=false for a normal copilot pane", () => {
		const pane =
			"phoned home: pij-abc ↔ copilot session 123 (bound)\n/ commands · ? help · tab next tab";
		expect(detectBadModelInPane(H, pane).detected).toBe(false);
	});
});

// ─── pi ──────────────────────────────────────────────────────────────────────

describe("detectBadModelInPane — pi", () => {
	const H: HarnessKind = "pi";

	it("detects isError response for unknown model", () => {
		const pane = 'isError: true\n{"error":"model not found: fake-model"}';
		expect(detectBadModelInPane(H, pane).detected).toBe(true);
	});

	it("returns detected=false for normal pi pane", () => {
		const pane = "phoned home: pij-abc (bound)\n>";
		expect(detectBadModelInPane(H, pane).detected).toBe(false);
	});
});

// ─── good model stays bound immediately (gate doesn't block) ─────────────────

describe("first-inference gate leaves a good model binding immediately", () => {
	it("no detection on a normal claude response → does not trigger model-not-supported", () => {
		const pane =
			"You are now a pij peer (id: pij-test). Message other sessions…\n✻ Churned for 2s\n⚑ bypass permissions on";
		const r = detectBadModelInPane("claude", pane);
		expect(r.detected).toBe(false);
	});
});

// ─── extractBoundModel (FIX-3: mutation-proof) ───────────────────────────────
// Mutation: remove extractBoundModel call at bind time → boundModel undefined → RED.

describe("extractBoundModel", () => {
	it("copilot: extracts model name from footer end (2-space separator)", () => {
		const pane = "/ commands · ? help · tab next tab  GPT-5.5";
		expect(extractBoundModel("copilot", pane)).toBe("GPT-5.5");
	});

	it("copilot: extracts model with dot in name", () => {
		const pane = "/ commands · ? help · tab next tab   gpt-4.5-turbo";
		expect(extractBoundModel("copilot", pane)).toBe("gpt-4.5-turbo");
	});

	it("claude: extracts model before the · ready marker", () => {
		const pane = "claude-opus-4-5 · bypass permissions on  ◇ shift+tab to cycle";
		expect(extractBoundModel("claude", pane)).toBe("claude-opus-4-5");
	});

	it("claude: works with bullet ready marker variant", () => {
		const pane = "claude-sonnet-4-6 • auto mode on";
		expect(extractBoundModel("claude", pane)).toBe("claude-sonnet-4-6");
	});

	it("returns undefined when no model marker is visible", () => {
		expect(extractBoundModel("copilot", "/ commands · ? help · tab next tab")).toBeUndefined();
	});

	it("pi: returns undefined (pi is not in the deterministic-bind path)", () => {
		expect(extractBoundModel("pi", "⏵ auto mode on")).toBeUndefined();
	});
});
