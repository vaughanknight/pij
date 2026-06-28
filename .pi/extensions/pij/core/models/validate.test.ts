// pij-control-plane — validateModel + spawn warn-don't-block tests (T005).

import { describe, expect, it } from "vitest";
import type { ModelEntry } from "./registry.js";
import { type ValidationResult, validateModel } from "./validate.js";

const KNOWN: ModelEntry[] = [
	{ id: "fugu-ultra", name: "Sakana Fugu Ultra", provider: "sakana", verified: true },
	{ id: "fugu", name: "Sakana Fugu", provider: "sakana", verified: true },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", verified: false },
];

describe("validateModel", () => {
	it("returns ok for an exact known model id", () => {
		const r = validateModel("fugu-ultra", KNOWN);
		expect(r.ok).toBe(true);
	});

	it("returns ok for a case-insensitive match", () => {
		const r = validateModel("FUGU-ULTRA", KNOWN);
		expect(r.ok).toBe(true);
	});

	it("returns unknown=true for an unrecognised model id", () => {
		const r = validateModel("gpt-99", KNOWN);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.unknown).toBe(true);
	});

	it("includes a suggestion when something close exists", () => {
		// "claude-sonnet" prefix-matches "claude-sonnet-4-6" but is not an exact id
		const r = validateModel("claude-sonnet", KNOWN) as Extract<ValidationResult, { ok: false }>;
		expect(r.ok).toBe(false);
		expect(r.suggestion).toBe("claude-sonnet-4-6");
	});

	it("suggestion is null when nothing is close", () => {
		const r = validateModel("zzz-nothing-like-this", KNOWN) as Extract<
			ValidationResult,
			{ ok: false }
		>;
		expect(r.ok).toBe(false);
		expect(r.suggestion).toBeNull();
	});

	it("returns ok for empty model string (no validation — spawn decides)", () => {
		// Empty model means no --model flag; nothing to validate
		const r = validateModel("", KNOWN);
		expect(r.ok).toBe(true);
	});

	it("returns ok when the known list is empty (cannot validate; never block)", () => {
		const r = validateModel("anything", []);
		expect(r.ok).toBe(true);
	});
});
