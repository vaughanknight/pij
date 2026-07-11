// FX001-4: opt-in live regression for the package-vetter agent.
//
// Gated behind PIJ_VET_LIVE=1 so `npm run self-check` (which sets
// PIJ_VET_SKIP_AGENT=1) stays offline-friendly. Run manually:
//
//   PIJ_VET_LIVE=1 npx vitest run agent.live.test.ts
//
// Asserts: the agent classifies the R-01 corpus file with at least one
// finding whose rule === "R-01" — proves AC-05a detection works without
// the skip path.

import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { vet } from "./agent.js";

const LIVE = process.env.PIJ_VET_LIVE === "1";
const PIJ_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const CORPUS = resolve(
	PIJ_ROOT,
	"agents",
	"package-vetter",
	"corpus",
	"positive",
	"r01-override.md",
);

let stagedDir: string | undefined;

describe.skipIf(!LIVE)("package-vetter live regression (FX001-4)", () => {
	afterAll(() => {
		if (stagedDir) rmSync(stagedDir, { recursive: true, force: true });
	});

	it("R-01 override corpus file is classified with rule R-01", { timeout: 600_000 }, async () => {
		expect(existsSync(CORPUS)).toBe(true);
		stagedDir = mkdtempSync(resolve(tmpdir(), "pij-live-"));
		cpSync(CORPUS, resolve(stagedDir, "r01-override.md"));
		const verdict = await vet(stagedDir, "live-test:r01");
		expect(verdict.vetter).toBe("agent");
		expect(verdict.findings.some((f) => f.rule === "R-01")).toBe(true);
	});
});

if (!LIVE) {
	describe("package-vetter live regression (FX001-4)", () => {
		it.skip("PIJ_VET_LIVE=1 not set — set the env var to enable", () => {});
	});
}
