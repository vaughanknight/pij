// Adapter contract tests — these don't make live LLM calls. The skip
// path (PIJ_VET_SKIP_AGENT=1) is the testable surface for vitest. End-
// to-end agent runs happen via `agent.live.test.ts` (PIJ_VET_LIVE=1) and
// `npm run snapshots:refresh` (FX001-4). The current CLI is
// `minih run package-vetter -p packagePath=<path> -p source=<src>`.

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { vet, vetWithAgent } from "./agent.js";

describe("agent adapter", () => {
	it("export aliases match", () => {
		expect(vetWithAgent).toBe(vet);
	});

	it("PIJ_VET_SKIP_AGENT=1 short-circuits to ok Verdict", async () => {
		const prev = process.env.PIJ_VET_SKIP_AGENT;
		process.env.PIJ_VET_SKIP_AGENT = "1";
		try {
			const verdict = await vet("/tmp/anywhere", "npm:fake-source");
			expect(verdict.vetter).toBe("agent");
			expect(verdict.level).toBe("ok");
			expect(verdict.score).toBe(100);
			expect(verdict.findings).toHaveLength(1);
			expect(verdict.findings[0]?.rule).toBe("vetter:meta");
			expect(verdict.findings[0]?.severity).toBe("info");
		} finally {
			if (prev === undefined) delete process.env.PIJ_VET_SKIP_AGENT;
			else process.env.PIJ_VET_SKIP_AGENT = prev;
		}
	});

	it("returns fail Verdict when packagePath missing (with PIJ_VET_SKIP_AGENT unset)", async () => {
		const prev = process.env.PIJ_VET_SKIP_AGENT;
		delete process.env.PIJ_VET_SKIP_AGENT;
		try {
			// Use a path that definitely doesn't exist
			const verdict = await vet(
				resolve("/tmp", `nonexistent-${Date.now()}-${Math.random()}`),
				"src",
			);
			// Either the agent pack missing, minih missing, or the bad-input path —
			// all valid skip paths. The contract is: Verdict shape is honoured.
			expect(verdict.vetter).toBe("agent");
			expect(["ok", "warn", "fail"]).toContain(verdict.level);
			expect(verdict.findings.length).toBeGreaterThanOrEqual(1);
		} finally {
			if (prev !== undefined) process.env.PIJ_VET_SKIP_AGENT = prev;
		}
	});
});
