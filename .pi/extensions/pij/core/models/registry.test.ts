// pij-control-plane — model-registry + fuzzy-match tests (T001, TDD RED first).
//
// Pi-first: parseModelsJson covers the live ~/.pi/agent/models.json shape.
// Copilot seeded from pi's github-copilot provider section.
// Claude alias list + codex snapshot are honest best-effort/unverified.

import { describe, expect, it } from "vitest";
import {
	claudeAliases,
	codexConfigModels,
	codexSnapshot,
	copilotSeedFromPi,
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

	// Task 2.2: the snapshot is now only a THIN fallback (the real source is the
	// user's ~/.codex/config.toml default model, read in cli.ts loadModels).
	it("is a thin fallback whose entries carry curated thinking levels", () => {
		const snap = codexSnapshot();
		expect(snap.length).toBeLessThanOrEqual(3);
		for (const e of snap) expect(Array.isArray(e.levels)).toBe(true);
	});
});

// ─── Phase 2 (#1): per-model reasoning + thinking levels ──────────────────────
// pi's models.json carries `reasoning: bool` + `thinkingLevelMap: {canonical→native|null}`
// per model; parseModelsJson now surfaces them (it previously dropped them).
const PI_THINKING_JSON = {
	providers: {
		sakana: {
			models: [
				{
					id: "fugu",
					name: "Sakana Fugu",
					reasoning: true,
					// canonical → native|null; null = UNSUPPORTED for this model.
					thinkingLevelMap: {
						off: null,
						minimal: null,
						low: null,
						medium: null,
						high: "high",
						xhigh: "max",
					},
				},
				{ id: "plain", name: "No Reasoning Model" }, // no reasoning / no map
			],
		},
		"github-copilot": {
			models: [
				{
					id: "mai",
					name: "MAI",
					reasoning: true,
					thinkingLevelMap: { low: "low", medium: "medium", high: "high" },
				},
			],
		},
	},
};

describe("parseModelsJson — reasoning + levels (#1)", () => {
	it("surfaces the per-model reasoning flag (default false when absent)", () => {
		const entries = parseModelsJson(PI_THINKING_JSON);
		expect(entries.find((e) => e.id === "fugu")?.reasoning).toBe(true);
		expect(entries.find((e) => e.id === "plain")?.reasoning).toBe(false);
	});

	it("derives levels from the NON-NULL keys of thinkingLevelMap (null = unsupported)", () => {
		const entries = parseModelsJson(PI_THINKING_JSON);
		// fugu: only high→high and xhigh→max are honored; the null-mapped ones drop out.
		expect(entries.find((e) => e.id === "fugu")?.levels).toEqual(["high", "xhigh"]);
		expect(entries.find((e) => e.id === "mai")?.levels).toEqual(["low", "medium", "high"]);
	});

	it("a model with no thinkingLevelMap has empty levels", () => {
		const entries = parseModelsJson(PI_THINKING_JSON);
		expect(entries.find((e) => e.id === "plain")?.levels).toEqual([]);
	});
});

// ─── Phase 2 (#2): codex default-model read from ~/.codex/config.toml ──────────
describe("codexConfigModels (default-model TOML read, #2)", () => {
	const TOML = [
		'model = "gpt-5.5"',
		'model_reasoning_effort = "xhigh"',
		'personality = "pragmatic"',
		"",
		"[notice]",
		"hide_full_access_warning = true",
	].join("\n");

	it("extracts the top-level default model as a codex entry (verified:false)", () => {
		const entries = codexConfigModels(TOML);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ id: "gpt-5.5", provider: "codex", verified: false });
	});

	it("carries curated reasoning levels for the gpt-5 family", () => {
		const entries = codexConfigModels(TOML);
		expect(entries[0]?.reasoning).toBe(true);
		expect(entries[0]?.levels).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
	});

	it("carries the o-series curated levels (no xhigh)", () => {
		const entries = codexConfigModels('model = "o3"');
		expect(entries[0]?.levels).toEqual(["minimal", "low", "medium", "high"]);
	});

	it("ignores a `model =` key that lives inside a [section] (top-level only)", () => {
		const t = ["[notice]", 'model = "inside-section"'].join("\n");
		expect(codexConfigModels(t)).toEqual([]);
	});

	it("returns empty for toml with no top-level model / empty / non-string", () => {
		expect(codexConfigModels("[notice]\nx = 1")).toEqual([]);
		expect(codexConfigModels("")).toEqual([]);
		expect(codexConfigModels(undefined as unknown as string)).toEqual([]);
	});
});
