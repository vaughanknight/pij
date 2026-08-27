// pij-control-plane — model-registry + fuzzy-match tests (T001, TDD RED first).
//
// Pi-first: parseModelsJson covers the live ~/.pi/agent/models.json shape.
// Copilot seeded from pi's github-copilot provider section.
// Claude alias list + codex snapshot are honest best-effort/unverified.

import { describe, expect, it } from "vitest";
import {
	annotateCopilotInstability,
	annotateLongContext,
	COPILOT_NO_LONG_CONTEXT,
	COPILOT_UNSTABLE_MODELS,
	claudeAliases,
	codexConfigModels,
	codexSnapshot,
	copilotSeedFromPi,
	copilotSnapshot,
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

const GPT56_LEVELS = ["none", "low", "medium", "high", "xhigh", "max"];
const GPT56_IDS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const PI_GPT56_JSON = {
	providers: {
		"github-copilot": {
			models: [
				{
					id: "gpt-5.6-sol",
					reasoning: true,
					thinkingLevelMap: { xhigh: "xhigh", max: "max" },
				},
				{ id: "gpt-5.6-terra", reasoning: true, thinkingLevelMap: { high: "high" } },
				{
					id: "gpt-5.6-preview",
					reasoning: true,
					thinkingLevelMap: { medium: "medium", high: "high" },
				},
			],
			modelOverrides: {
				"gpt-5.6-luna": {
					reasoning: true,
					thinkingLevelMap: { xhigh: "xhigh" },
				},
			},
		},
		sakana: {
			models: [
				{
					id: "gpt-5.6-sol",
					reasoning: true,
					thinkingLevelMap: { high: "high" },
				},
			],
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

	it("corrects only the exact GPT-5.6 trio under the github-copilot provider", () => {
		const entries = parseModelsJson(PI_GPT56_JSON);
		for (const id of GPT56_IDS) {
			const entry = entries.find(
				(candidate) => candidate.provider === "github-copilot" && candidate.id === id,
			);
			expect(entry?.reasoning).toBe(true);
			expect(entry?.levels).toEqual(GPT56_LEVELS);
		}
		expect(
			entries.find(
				(candidate) =>
					candidate.provider === "github-copilot" && candidate.id === "gpt-5.6-preview",
			)?.levels,
		).toEqual(["medium", "high"]);
		expect(
			entries.find((candidate) => candidate.provider === "sakana" && candidate.id === "gpt-5.6-sol")
				?.levels,
		).toEqual(["high"]);
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

	it("preserves the corrected GPT-5.6 levels on Copilot seed clones", () => {
		const entries = copilotSeedFromPi(PI_GPT56_JSON);
		for (const id of GPT56_IDS) {
			expect(entries.find((entry) => entry.id === id)).toMatchObject({
				id,
				provider: "copilot",
				verified: true,
				reasoning: true,
				levels: GPT56_LEVELS,
			});
		}
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
		// Claude 5 family (fable is the Mythos-class tier above opus) — an agent
		// hit its absence live: `pij models` showed nothing newer than 4.x.
		expect(ids).toContain("claude-fable-5");
		expect(ids).toContain("claude-sonnet-5");
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

	// The snapshot is a curated best-effort alias list (the config default still
	// wins via loadModels dedup); every entry carries a levels array.
	it("entries carry curated thinking levels", () => {
		for (const e of codexSnapshot()) expect(Array.isArray(e.levels)).toBe(true);
	});

	it("advertises the gpt-5.6 trio (sol/terra/luna) with gpt-5 thinking levels", () => {
		const ids = codexSnapshot().map((e) => e.id);
		for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
			expect(ids).toContain(id);
			const e = codexSnapshot().find((m) => m.id === id);
			expect(e?.levels).toContain("xhigh"); // gpt-5 family honors minimal→xhigh
		}
	});
});

describe("copilotSnapshot", () => {
	it("advertises the gpt-5.6 trio as unverified copilot aliases", () => {
		const snap = copilotSnapshot();
		const ids = snap.map((e) => e.id);
		for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
			expect(ids).toContain(id);
		}
		for (const e of snap) {
			expect(e.provider).toBe("copilot");
			expect(e.verified).toBe(false); // best-effort until canaried
			expect(e.reasoning).toBe(true);
			expect(e.levels).toEqual(GPT56_LEVELS);
		}
	});
});

describe("Copilot long-context capability", () => {
	it("curates gemini-3.6-flash as rejecting long_context", () => {
		expect(COPILOT_NO_LONG_CONTEXT.has("gemini-3.6-flash")).toBe(true);
	});

	it("annotates every denied Copilot entry after the raw-first registry merge", () => {
		const raw = {
			providers: {
				"github-copilot": {
					models: [{ id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" }],
				},
			},
		};
		const merged = annotateLongContext([
			...parseModelsJson(raw),
			...copilotSeedFromPi(raw),
			...copilotSnapshot(),
		]);
		const denied = merged.filter(
			(entry) =>
				(entry.provider === "github-copilot" || entry.provider === "copilot") &&
				entry.id === "gemini-3.6-flash",
		);

		expect(denied).toHaveLength(2);
		for (const entry of denied) expect(entry.longContext).toBe(false);
	});

	it("preserves an explicit capability value", () => {
		const explicit: ModelEntry = {
			id: "gemini-3.6-flash",
			name: "Gemini 3.6 Flash",
			provider: "copilot",
			verified: true,
			longContext: true,
		};

		expect(annotateLongContext([explicit])).toEqual([explicit]);
	});
});

describe("Copilot upstream instability", () => {
	it("records both the earlier Flash pass and later all-path rejection", () => {
		expect(COPILOT_UNSTABLE_MODELS.get("gemini-3.6-flash")).toEqual({
			cli: "1.0.81-14",
			observedFailAt: "2026-08-27 ~16:0xZ",
			observedPassAt: "2026-08-27 ~07:33Z",
			note: "Failure instrumented by the dlg-0012 isolation matrix; pass relayed by the o-prime, not instrumented here.",
		});
	});

	it("annotates every Flash Copilot projection without claiming an interactive-only defect", () => {
		const raw = {
			providers: {
				"github-copilot": {
					models: [{ id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" }],
				},
			},
		};
		const merged = annotateCopilotInstability([...parseModelsJson(raw), ...copilotSeedFromPi(raw)]);

		expect(merged).toHaveLength(2);
		for (const entry of merged) {
			expect(entry.copilotInstability).toEqual({
				cli: "1.0.81-14",
				observedFailAt: "2026-08-27 ~16:0xZ",
				observedPassAt: "2026-08-27 ~07:33Z",
				note: "Failure instrumented by the dlg-0012 isolation matrix; pass relayed by the o-prime, not instrumented here.",
			});
		}
	});

	it("does not annotate a non-Copilot provider with the same bare model id", () => {
		const openrouter: ModelEntry = {
			id: "gemini-3.6-flash",
			name: "Gemini 3.6 Flash",
			provider: "openrouter",
			verified: true,
		};

		expect(annotateCopilotInstability([openrouter])).toEqual([openrouter]);
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

// ─── plan 054 P2 T007 — contextWindow join source (AC-09) ───────────────────
describe("parseModelsJson contextWindow", () => {
	it("carries a model's contextWindow through (the pij contextMax source)", () => {
		const entries = parseModelsJson({
			providers: {
				"github-copilot": {
					models: [{ id: "gpt-5.6-sol", name: "sol", contextWindow: 258400 }],
				},
			},
		});
		expect(entries[0]?.contextWindow).toBe(258400);
	});

	it("drops a bogus contextWindow (negative, zero, NaN, stringly) — honest absence", () => {
		const entries = parseModelsJson({
			providers: {
				p: {
					models: [
						{ id: "a", contextWindow: -5 },
						{ id: "b", contextWindow: 0 },
						{ id: "c", contextWindow: Number.NaN },
						{ id: "d", contextWindow: "258400" },
						{ id: "e" },
					],
				},
			},
		});
		for (const entry of entries) expect(entry.contextWindow).toBeUndefined();
	});

	it("reads contextWindow off modelOverrides too", () => {
		const entries = parseModelsJson({
			providers: { p: { modelOverrides: { ov: { name: "ov", contextWindow: 128000 } } } },
		});
		expect(entries[0]?.contextWindow).toBe(128000);
	});
});
