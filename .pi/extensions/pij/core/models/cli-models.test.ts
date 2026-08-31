// pij-control-plane — `pij models` CLI verb tests (T003, TDD RED first).
//
// Tests parseArgs + dispatch for the new models verb (pure core).
// Model list is injected via CliDeps.models so the core stays pi-free.

import { describe, expect, it } from "vitest";
import { FakeDelivery, FakeProcess, FakeRegistry } from "../../adapters/fakes.js";
import type { CliDeps } from "../cli.js";
import { dispatch, parseArgs } from "../cli.js";
import {
	copilotSeedFromPi,
	type ModelEntry,
	parseModelsJson,
	parseOmpModelsJson,
} from "./registry.js";

const T = Date.parse("2026-06-28T12:00:00.000Z");

const MODELS: ModelEntry[] = [
	{ id: "fugu-ultra", name: "Sakana Fugu Ultra", provider: "sakana", verified: true },
	{ id: "fugu", name: "Sakana Fugu", provider: "sakana", verified: true },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", verified: false },
	{ id: "gpt-4o", name: "GPT-4o", provider: "codex", verified: false },
	{
		id: "mai-code-1-flash-internal",
		name: "MAI-Code-1-Flash",
		provider: "copilot",
		verified: true,
	},
];

const GPT56_LEVELS = ["none", "low", "medium", "high", "xhigh", "max"];
const GPT56_IDS = ["gpt-5.6-sol", "gpt-5.6-sol-fast", "gpt-5.6-terra", "gpt-5.6-luna"];
const PI_GPT56_JSON = {
	providers: {
		"github-copilot": {
			models: GPT56_IDS.map((id) => ({
				id,
				name: id,
				reasoning: true,
				thinkingLevelMap: { xhigh: "xhigh", max: "max" },
			})),
		},
	},
};
const GPT56_MODELS = [...parseModelsJson(PI_GPT56_JSON), ...copilotSeedFromPi(PI_GPT56_JSON)];

function deps(models: ModelEntry[], unavailableRuntimes: readonly string[] = []): CliDeps {
	return {
		registry: new FakeRegistry([]),
		delivery: new FakeDelivery(),
		process: new FakeProcess(999, T, { PIJ_SESSION_ID: "pij-test" }),
		cwd: "/repo",
		pijHome: "/home/.pij",
		eventLogFor: () => ({ read: () => [], append: () => {}, lastSeq: () => 0, count: () => 0 }),
		models,
		unavailableModelRuntimes: unavailableRuntimes,
	};
}

describe("parseArgs models", () => {
	it("parses bare 'pij models'", () => {
		const r = parseArgs(["models"]);
		expect(r).toMatchObject({ ok: true, value: { verb: "models", json: false } });
	});

	it("parses 'pij models --json'", () => {
		const r = parseArgs(["models", "--json"]);
		expect(r).toMatchObject({ ok: true, value: { verb: "models", json: true } });
	});

	it("parses 'pij models --harness claude'", () => {
		const r = parseArgs(["models", "--harness", "claude"]);
		expect(r).toMatchObject({ ok: true, value: { verb: "models", harnessFilter: "claude" } });
	});

	it("parses fuzzy filter positional", () => {
		const r = parseArgs(["models", "fugu"]);
		expect(r).toMatchObject({ ok: true, value: { verb: "models", filter: "fugu" } });
	});

	it("rejects unknown flags for models verb", () => {
		const r = parseArgs(["models", "--bogus"]);
		expect(r).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("dispatch models", () => {
	it("outputs a table by default", () => {
		const r = dispatch({ verb: "models", json: false }, deps(MODELS));
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toContain("fugu-ultra");
		expect(r.stdout).toContain("Sakana Fugu Ultra");
	});

	it("outputs JSON array when --json", () => {
		const r = dispatch({ verb: "models", json: true }, deps(MODELS));
		expect(r.exitCode).toBe(0);
		const parsed = JSON.parse(r.stdout) as unknown[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBe(MODELS.length);
	});

	it("JSON entries include id, name, provider, verified", () => {
		const r = dispatch({ verb: "models", json: true }, deps(MODELS));
		const parsed = JSON.parse(r.stdout) as ModelEntry[];
		expect(parsed[0]).toHaveProperty("id");
		expect(parsed[0]).toHaveProperty("name");
		expect(parsed[0]).toHaveProperty("provider");
		expect(parsed[0]).toHaveProperty("verified");
	});

	it("fuzzy filter narrows results", () => {
		const r = dispatch({ verb: "models", json: false, filter: "fugu" }, deps(MODELS));
		expect(r.stdout).toContain("fugu");
		expect(r.stdout).not.toContain("claude-sonnet");
	});

	it("--harness filter shows only that provider", () => {
		const r = dispatch(
			{ verb: "models", json: false, harnessFilter: "claude" } as Parameters<typeof dispatch>[0],
			deps(MODELS),
		);
		expect(r.stdout).toContain("claude-sonnet-4-6");
		expect(r.stdout).not.toContain("fugu");
	});

	it.each([
		"openrouter",
		"sakana",
		"github-copilot",
	])("--harness %s remains a provider filter", (provider) => {
		const providerModels: ModelEntry[] = [
			{
				id: `${provider}-pi`,
				name: `${provider} Pi row`,
				provider,
				runtime: "pi",
				verified: true,
			},
			{
				id: "other",
				name: "Other",
				provider: "other",
				runtime: "pi",
				verified: true,
			},
		];
		const r = dispatch(
			{ verb: "models", json: true, harnessFilter: provider } as Parameters<typeof dispatch>[0],
			deps(providerModels),
		);
		expect(r.exitCode).toBe(0);
		expect(JSON.parse(r.stdout)).toEqual([providerModels[0]]);
	});

	it("labels unverified models", () => {
		const r = dispatch({ verb: "models", json: false }, deps(MODELS));
		expect(r.stdout).toMatch(/unverified|best.effort|\*/i);
	});

	it("returns empty message when no models match filter", () => {
		const r = dispatch({ verb: "models", json: false, filter: "zzz-no-match" }, deps(MODELS));
		expect(r.stdout).toMatch(/no models/i);
	});

	it("--harness pi returns ALL entries (pi proxies all providers)", () => {
		// Registry has github-copilot and sakana — neither named 'pi'.
		// Mutation: revert to always filtering by provider → 0 results → RED.
		const piModels: ModelEntry[] = [
			{ id: "m1", name: "Copilot Model", provider: "github-copilot", verified: true },
			{ id: "m2", name: "Sakana Fugu", provider: "sakana", verified: true },
		];
		const r = dispatch(
			{ verb: "models", json: false, harnessFilter: "pi" } as Parameters<typeof dispatch>[0],
			deps(piModels),
		);
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toContain("m1");
		expect(r.stdout).toContain("m2");
	});

	it("--harness copilot JSON exposes actual ids without OMP selector aliases", () => {
		const r = dispatch(
			{ verb: "models", json: true, harnessFilter: "copilot" } as Parameters<typeof dispatch>[0],
			deps(GPT56_MODELS),
		);
		const parsed = JSON.parse(r.stdout) as ModelEntry[];
		expect(parsed).toHaveLength(GPT56_IDS.length);
		for (const id of GPT56_IDS) {
			expect(parsed.find((entry) => entry.id === id)).toMatchObject({
				provider: "github-copilot",
				runtime: "copilot",
				selector: id,
				contextWindow: 1_050_000,
				levels: GPT56_LEVELS,
			});
		}
		expect(parsed.some((entry) => entry.selector.endsWith("-1m"))).toBe(false);
	});

	it("--harness copilot table renders one corrected level row per actual id", () => {
		const r = dispatch(
			{ verb: "models", json: false, harnessFilter: "copilot" } as Parameters<typeof dispatch>[0],
			deps(GPT56_MODELS),
		);
		expect(r.stdout.match(/none\/low\/medium\/high\/xhigh\/max/g)).toHaveLength(GPT56_IDS.length);
	});

	it("--harness pi JSON preserves the corrected raw github-copilot row", () => {
		const r = dispatch(
			{ verb: "models", json: true, harnessFilter: "pi" } as Parameters<typeof dispatch>[0],
			deps(GPT56_MODELS),
		);
		const parsed = JSON.parse(r.stdout) as ModelEntry[];
		const raw = parsed.find(
			(entry) => entry.provider === "github-copilot" && entry.id === "gpt-5.6-sol",
		);
		expect(raw?.levels).toEqual(GPT56_LEVELS);
		expect(parsed.every((entry) => entry.runtime === "pi")).toBe(true);
	});

	it("--harness omp lists exact base and -1m selectors with distinct contexts", () => {
		const omp = parseOmpModelsJson({
			models: [
				{
					provider: "github-copilot",
					id: "gpt-5.6-sol-fast",
					selector: "github-copilot/gpt-5.6-sol-fast",
					name: "Sol Fast",
					contextWindow: 400_000,
				},
				{
					provider: "github-copilot",
					id: "gpt-5.6-sol-fast-1m",
					selector: "github-copilot/gpt-5.6-sol-fast-1m",
					name: "Sol Fast 1M",
					contextWindow: 1_050_000,
				},
			],
		});
		const r = dispatch(
			{ verb: "models", json: true, harnessFilter: "omp" } as Parameters<typeof dispatch>[0],
			deps(omp),
		);
		expect(r.exitCode).toBe(0);
		const parsed = JSON.parse(r.stdout) as ModelEntry[];
		expect(parsed.map(({ selector, contextWindow }) => ({ selector, contextWindow }))).toEqual([
			{ selector: "github-copilot/gpt-5.6-sol-fast", contextWindow: 400_000 },
			{ selector: "github-copilot/gpt-5.6-sol-fast-1m", contextWindow: 1_050_000 },
		]);
	});

	it("--harness omp fails instead of returning an authoritative empty catalog", () => {
		const r = dispatch(
			{ verb: "models", json: true, harnessFilter: "omp" } as Parameters<typeof dispatch>[0],
			deps([], ["omp"]),
		);
		expect(r.exitCode).not.toBe(0);
		expect(JSON.parse(r.stderr)).toMatchObject({ error: "E-NOREG" });
	});

	it("bare models fails rather than returning a partial catalog", () => {
		const r = dispatch({ verb: "models", json: true }, deps(MODELS, ["omp"]));
		expect(r.exitCode).not.toBe(0);
		expect(JSON.parse(r.stderr)).toMatchObject({ error: "E-NOREG" });
		expect(r.stderr).toContain("omp");
	});
});

// ─── Phase 2 (#1, task 2.4): surface reasoning + thinking levels ──────────────
describe("dispatch models — thinking levels", () => {
	const WITH_LEVELS: ModelEntry[] = [
		{
			id: "fugu",
			name: "Sakana Fugu",
			provider: "sakana",
			verified: true,
			reasoning: true,
			levels: ["high", "xhigh"],
		},
		{
			id: "plain",
			name: "Plain",
			provider: "sakana",
			verified: true,
			reasoning: false,
			levels: [],
		},
	];

	it("--json carries reasoning + levels", () => {
		const r = dispatch({ verb: "models", json: true }, deps(WITH_LEVELS));
		const parsed = JSON.parse(r.stdout) as ModelEntry[];
		const fugu = parsed.find((e) => e.id === "fugu");
		expect(fugu?.reasoning).toBe(true);
		expect(fugu?.levels).toEqual(["high", "xhigh"]);
	});

	it("table shows a 'thinking' column rendering the levels", () => {
		const r = dispatch({ verb: "models", json: false }, deps(WITH_LEVELS));
		expect(r.stdout).toMatch(/thinking/i); // header column
		expect(r.stdout).toContain("high/xhigh"); // levels rendered for fugu
	});
});
