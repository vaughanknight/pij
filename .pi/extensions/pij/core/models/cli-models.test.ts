// pij-control-plane — `pij models` CLI verb tests (T003, TDD RED first).
//
// Tests parseArgs + dispatch for the new models verb (pure core).
// Model list is injected via CliDeps.models so the core stays pi-free.

import { describe, expect, it } from "vitest";
import { FakeDelivery, FakeProcess, FakeRegistry } from "../../adapters/fakes.js";
import type { CliDeps } from "../cli.js";
import { dispatch, parseArgs } from "../cli.js";
import type { ModelEntry } from "./registry.js";

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

function deps(models: ModelEntry[]): CliDeps {
	return {
		registry: new FakeRegistry([]),
		delivery: new FakeDelivery(),
		process: new FakeProcess(999, T, { PIJ_SESSION_ID: "pij-test" }),
		cwd: "/repo",
		pijHome: "/home/.pij",
		eventLogFor: () => ({ read: () => [], append: () => {}, lastSeq: () => 0, count: () => 0 }),
		models,
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
});
