import { describe, expect, it } from "vitest";
import { validateReport } from "./report.js";

const SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		summary: { type: "string", minLength: 1 },
		results: { type: "array" },
	},
	required: ["summary", "results"],
	additionalProperties: false,
});

describe("validateReport", () => {
	it("passes a payload that matches the schema", () => {
		const r = validateReport({ summary: "found it", results: [] }, SCHEMA);
		expect(r.valid).toBe(true);
		expect(r.errors).toEqual([]);
	});

	it("fails a payload missing a required field, surfacing AJV lines verbatim", () => {
		const r = validateReport({ results: [] }, SCHEMA);
		expect(r.valid).toBe(false);
		expect(r.errors.length).toBeGreaterThan(0);
		// AJV's "must have required property 'summary'" message surfaces unmodified.
		expect(r.errors.join("\n")).toContain("summary");
	});

	it("fails on an additional property when the schema forbids it", () => {
		const r = validateReport({ summary: "x", results: [], extra: 1 }, SCHEMA);
		expect(r.valid).toBe(false);
		expect(r.errors.join("\n")).toContain("additional");
	});

	it("passes through as valid when no schema is provided", () => {
		const r = validateReport({ anything: true });
		expect(r.valid).toBe(true);
		expect(r.errors).toEqual([]);
	});

	it("reports invalid JSON in the schema (never throws)", () => {
		const r = validateReport({ summary: "x" }, "{ not valid json");
		expect(r.valid).toBe(false);
		expect(r.errors.length).toBeGreaterThan(0);
	});
});
