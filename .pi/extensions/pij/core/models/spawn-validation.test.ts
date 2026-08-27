// pij-control-plane — spawn warn-don't-block validation tests (T005).
//
// Validates that buildSpawnWarning produces a warning message for an unknown
// model but does NOT block spawn (the id is still returned immediately).

import { describe, expect, it, vi } from "vitest";
import { buildSpawnWarning } from "../../core/spawn.js";
import { loadModels, type ModelEntry } from "./registry.js";

const { readFileSync } = vi.hoisted(() => ({
	readFileSync: vi.fn((path: string) => {
		if (path.endsWith("/.pi/agent/models.json")) {
			return JSON.stringify({
				providers: {
					"github-copilot": {
						models: [{ id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" }],
					},
				},
			});
		}
		if (path.endsWith("/.codex/config.toml")) return "";
		throw new Error(`unexpected catalog path: ${path}`);
	}),
}));

vi.mock("node:fs", () => ({ readFileSync }));
vi.mock("node:os", () => ({ homedir: () => "/fixture-home" }));

const KNOWN: ModelEntry[] = [
	{ id: "fugu-ultra", name: "Sakana Fugu Ultra", provider: "sakana", verified: true },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", verified: false },
];

describe("buildSpawnWarning", () => {
	it("returns null for a known model (no warning needed)", () => {
		expect(buildSpawnWarning("fugu-ultra", KNOWN)).toBeNull();
	});

	it("returns a warning string for an unknown model", () => {
		const w = buildSpawnWarning("gpt-99", KNOWN);
		expect(typeof w).toBe("string");
		expect(w).toContain("gpt-99");
	});

	it("includes the closest suggestion in the warning", () => {
		// "claude-sonnet" prefix-matches claude-sonnet-4-6 but isn't an exact id
		const w = buildSpawnWarning("claude-sonnet", KNOWN);
		expect(w).toContain("claude-sonnet-4-6");
	});

	it("returns null when model is undefined (no --model flag)", () => {
		expect(buildSpawnWarning(undefined, KNOWN)).toBeNull();
	});

	it("returns null when known list is empty (cannot validate — never block)", () => {
		expect(buildSpawnWarning("anything", [])).toBeNull();
	});

	it("warning does NOT include 'block' or 'abort' — spawn always proceeds", () => {
		const w = buildSpawnWarning("gpt-99-unknown", KNOWN);
		if (w) {
			expect(w.toLowerCase()).not.toMatch(/block|abort|fail|error/);
		}
	});

	it("treats Object.prototype keys as ordinary unknown model ids", () => {
		const warning = buildSpawnWarning("constructor", KNOWN);

		expect(warning).toBe(
			"warning: unknown model 'constructor' — spawn continues; confirm the id is correct",
		);
		expect(warning).not.toContain("unstable upstream");
		expect(warning).not.toContain("undefined");
	});
});

describe("Flash upstream-instability warning", () => {
	const FLASH: ModelEntry = {
		id: "gemini-3.6-flash",
		name: "Gemini 3.6 Flash",
		provider: "copilot",
		verified: true,
		copilotInstability: {
			cli: "1.0.81-14",
			observedFailAt: "2026-08-27 ~16:0xZ",
			observedPassAt: "2026-08-27 ~07:33Z",
			note: "Failure instrumented by the dlg-0012 isolation matrix; pass relayed by the o-prime, not instrumented here.",
		},
	};

	it("warns with both observed outcomes and safer alternatives", () => {
		const warning = buildSpawnWarning("gemini-3.6-flash", [FLASH]);

		expect(warning).toBe(
			"warning: gemini-3.6-flash on GitHub Copilot CLI 1.0.81-14 is unstable upstream: HTTP 400 'invalid request body' on every request path (-p and interactive) observed 2026-08-27 ~16:0xZ, while a -p one-shot succeeded 2026-08-27 ~07:33Z — treat as unavailable until a fresh probe passes; pick gpt-5.6-terra or gpt-5.6-sol. This is a warning only; spawn continues.",
		);
		expect(warning).not.toMatch(/\bcopilot -p\b/);
	});

	it("also warns for the provider-qualified model id", () => {
		expect(buildSpawnWarning("copilot/gemini-3.6-flash", [FLASH])).toContain(
			"gemini-3.6-flash on GitHub Copilot CLI 1.0.81-14 is unstable upstream: HTTP 400",
		);
	});

	it("reads the Flash mark through the composed catalog without injecting metadata", () => {
		const warning = buildSpawnWarning("gemini-3.6-flash", loadModels());

		expect(warning).toContain("observed 2026-08-27 ~16:0xZ");
		expect(warning).not.toMatch(/\bcopilot -p\b/);
	});

	it("does not emit a Copilot warning for an OpenRouter model", () => {
		const openrouter: ModelEntry = {
			id: "google/gemini-3.6-flash",
			name: "Gemini 3.6 Flash",
			provider: "openrouter",
			verified: true,
		};

		expect(buildSpawnWarning("google/gemini-3.6-flash", [openrouter])).toBeNull();
	});
});

// ─── FIX-C mutation-proof: best-effort harness → no false "unknown model" ────
// Mutation: remove the `!known.some((e) => e.verified)` gate → buildSpawnWarning
// warns for claude/codex alias lists even when no entry is verified → RED.

describe("FIX-C: no false 'unknown model' warning for best-effort harness (INS-007)", () => {
	const UNVERIFIED: ModelEntry[] = [
		{ id: "claude-opus-4-8", name: "Claude Opus 4.8", provider: "claude", verified: false },
		{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", verified: false },
	];

	it("returns null for any alias when all entries are unverified (cannot confirm absence)", () => {
		expect(buildSpawnWarning("sonnet", UNVERIFIED)).toBeNull();
	});

	it("returns null for a completely unknown name when all entries are unverified", () => {
		expect(buildSpawnWarning("gpt-99-fake", UNVERIFIED)).toBeNull();
	});

	it("still warns for a verified registry (pi) when a bogus model is given", () => {
		const piKnown: ModelEntry[] = [
			{ id: "fugu-ultra", name: "Sakana Fugu Ultra", provider: "sakana", verified: true },
		];
		const w = buildSpawnWarning("gpt-99-fake", piKnown);
		expect(typeof w).toBe("string");
		expect(w).toContain("gpt-99-fake");
	});
});

// ─── FIX-D mutation-proof: closest-match suggestion in the warning ────────────
// Mutation: remove `result.suggestion ? ` (did you mean '${result.suggestion}'?)` : ""`
// → suggestion absent from warning text → RED.

describe("FIX-D: warning for pi near-miss includes closest-match suggestion", () => {
	const PI_KNOWN: ModelEntry[] = [
		{ id: "fugu-ultra", name: "Sakana Fugu Ultra", provider: "sakana", verified: true },
		{ id: "fugu", name: "Sakana Fugu", provider: "sakana", verified: true },
	];

	it("warning includes the closest model suggestion for a near-miss (pi, verified)", () => {
		const w = buildSpawnWarning("fugu-ult", PI_KNOWN);
		expect(w).not.toBeNull();
		expect(w).toContain("fugu-ultra");
	});

	it("warning omits suggestion when nothing is close (no false suggestion)", () => {
		const w = buildSpawnWarning("zzz-nothing-like-this", PI_KNOWN);
		expect(w).not.toBeNull();
		expect(w).not.toContain("did you mean");
	});
});
