// pij-control-plane — model-registry + fuzzy-match tests (T001, TDD RED first).
//
// Pi-first: parseModelsJson covers the live ~/.pi/agent/models.json shape.
// Copilot seeded from pi's github-copilot provider section.
// Claude alias list + codex snapshot are honest best-effort/unverified.

import { describe, expect, it } from "vitest";
import {
	claudeAliases,
	codexSnapshot,
	copilotSeedFromPi,
	type ModelEntry,
	parseModelsJson,
} from "./registry.js";

// Minimal pi JSON fixture covering all structural variations.
const PI_JSON = {
	providers: {
		"github-copilot": {
			modelOverrides: {
				"gpt-5.5": { name: "GPT-5.5 Long Context (Copilot)" },
				"claude-opus-4.8": { name: "Claude Opus 4.8-1M (Copilot)" },
			},
			models: [
				{ id: "mai-code-1-flash-internal", name: "MAI-Code-1-Flash (Copilot)" },
				{ id: "claude-opus-4.7-1m-internal", name: "Claude Opus 4.7 1M Internal" },
			],
		},
		sakana: {
			models: [
				{ id: "fugu", name: "Sakana Fugu" },
				{ id: "fugu-ultra", name: "Sakana Fugu Ultra" },
			],
		},
		openrouter: {
			models: [{ id: "sakana/fugu-ultra", name: "Sakana Fugu Ultra (OpenRouter)" }],
		},
	},
};

describe("parseModelsJson", () => {
	it("extracts models from all providers", () => {
		const entries = parseModelsJson(PI_JSON);
		const ids = entries.map((e) => e.id);
		expect(ids).toContain("mai-code-1-flash-internal");
		expect(ids).toContain("fugu");
		expect(ids).toContain("fugu-ultra");
		expect(ids).toContain("sakana/fugu-ultra");
	});

	it("also extracts modelOverrides", () => {
		const entries = parseModelsJson(PI_JSON);
		const ids = entries.map((e) => e.id);
		expect(ids).toContain("gpt-5.5");
		expect(ids).toContain("claude-opus-4.8");
	});

	it("marks pi-parsed models as verified", () => {
		const entries = parseModelsJson(PI_JSON);
		for (const e of entries) expect(e.verified).toBe(true);
	});

	it("sets provider from the JSON key", () => {
		const entries = parseModelsJson(PI_JSON);
		const fugu = entries.find((e) => e.id === "fugu");
		expect(fugu?.provider).toBe("sakana");
		const copilotModel = entries.find((e) => e.id === "mai-code-1-flash-internal");
		expect(copilotModel?.provider).toBe("github-copilot");
	});

	it("uses id as name fallback when name is absent", () => {
		const json = { providers: { x: { models: [{ id: "no-name" }] } } };
		const entries = parseModelsJson(json);
		expect(entries[0]?.name).toBe("no-name");
	});

	it("does not duplicate overrides that also appear in models[]", () => {
		const json = {
			providers: {
				p: {
					models: [{ id: "shared", name: "Model" }],
					modelOverrides: { shared: { name: "Override" } },
				},
			},
		};
		const entries = parseModelsJson(json);
		const matching = entries.filter((e) => e.id === "shared");
		expect(matching).toHaveLength(1);
	});

	it("returns empty array for null/undefined/non-object input", () => {
		expect(parseModelsJson(null)).toEqual([]);
		expect(parseModelsJson(undefined)).toEqual([]);
		expect(parseModelsJson("bad")).toEqual([]);
	});
});

describe("copilotSeedFromPi", () => {
	it("returns models from the github-copilot provider section", () => {
		const entries = copilotSeedFromPi(PI_JSON);
		const ids = entries.map((e) => e.id);
		expect(ids).toContain("mai-code-1-flash-internal");
		expect(ids).toContain("gpt-5.5"); // from modelOverrides
	});

	it("labels them as copilot provider", () => {
		const entries = copilotSeedFromPi(PI_JSON);
		for (const e of entries) expect(e.provider).toBe("copilot");
	});

	it("returns empty array when github-copilot section is absent", () => {
		expect(copilotSeedFromPi({ providers: {} })).toEqual([]);
		expect(copilotSeedFromPi(null)).toEqual([]);
	});
});

describe("claudeAliases", () => {
	it("returns non-empty list of known claude model ids", () => {
		const entries = claudeAliases();
		expect(entries.length).toBeGreaterThan(0);
	});

	it("marks all aliases as unverified (best-effort)", () => {
		for (const e of claudeAliases()) expect(e.verified).toBe(false);
	});

	it("all entries have provider=claude", () => {
		for (const e of claudeAliases()) expect(e.provider).toBe("claude");
	});

	it("includes current generation model ids", () => {
		const ids = claudeAliases().map((e) => e.id);
		expect(ids.some((id) => id.includes("sonnet"))).toBe(true);
		expect(ids.some((id) => id.includes("opus"))).toBe(true);
	});
});

describe("codexSnapshot", () => {
	it("returns non-empty list", () => {
		expect(codexSnapshot().length).toBeGreaterThan(0);
	});

	it("marks all as unverified", () => {
		for (const e of codexSnapshot()) expect(e.verified).toBe(false);
	});

	it("all entries have provider=codex", () => {
		for (const e of codexSnapshot()) expect(e.provider).toBe("codex");
	});
});
