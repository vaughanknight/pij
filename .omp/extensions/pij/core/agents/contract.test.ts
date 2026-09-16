// AC-12 — the minih contract test (the drift alarm).
//
// Drives pij's hello-world fixture pack through the REAL `runAgent` import from
// `minih/runner` with minih's `FakeAgentAdapter`, and asserts the produced
// `output/report.json` satisfies the system envelope. If a future `minih` tag
// bump breaks `runAgent`, `FakeAgentAdapter`, or the envelope contract, THIS
// test goes red inside `just self-check` — "use latest, tests catch issues".
//
// Idempotency guarantee (validation finding MEDIUM-1): real `runAgent` writes
// `runs/<ts>/` rooted at the AgentDefinition's `dir` (minih folder.ts). So the
// test COPIES the fixture into a fresh `mkdtemp` dir before running — the repo
// tree under `__fixtures__/` must stay clean across any number of runs.

import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeAgentAdapter } from "minih";
import { resolveAgent, runAgent, validateSystemOutput } from "minih/runner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PACK = resolve(HERE, "__fixtures__", "hello-world");

// A valid minih system envelope: `summary` + `retrospective{workedWell,
// confusing,magicWand}`. Seeded into the fake because a stock FakeAgentAdapter
// returns `output: ''`, and minih's runner only writes `output/report.json`
// when the adapter output is truthy (dist/runner/runner.js:1336).
const ENVELOPE = JSON.stringify({
	summary: "Contract fixture said hello.",
	retrospective: {
		workedWell: "The runAgent seam is stable.",
		confusing: "Nothing was confusing here.",
		magicWand: "An upstream ephemeral mode so no temp copy is needed.",
	},
});

let stagedAgentsDir: string | undefined;

describe("minih contract (AC-12): runAgent + FakeAgentAdapter + envelope", () => {
	beforeEach(() => {
		// Fresh temp agents dir per test; copy the fixture pack in so runs write here.
		stagedAgentsDir = mkdtempSync(join(tmpdir(), "pij-contract-"));
		cpSync(FIXTURE_PACK, join(stagedAgentsDir, "hello-world"), { recursive: true });
	});

	afterEach(() => {
		if (stagedAgentsDir) rmSync(stagedAgentsDir, { recursive: true, force: true });
		stagedAgentsDir = undefined;
	});

	it("writes an envelope-valid report.json through the real runAgent", async () => {
		const agentsDir = stagedAgentsDir as string;
		const def = resolveAgent("hello-world", agentsDir);
		expect(def, "resolveAgent found the fixture pack").not.toBeNull();

		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		const result = await runAgent(
			adapter,
			// biome-ignore lint/style/noNonNullAssertion: asserted non-null above.
			def!,
			{ slug: "hello-world", params: {} },
			undefined,
			agentsDir,
		);

		expect(result.agentResult.status).toBe("completed");

		const reportPath = join(result.runDir, "output", "report.json");
		expect(existsSync(reportPath)).toBe(true);

		const envelope = validateSystemOutput(reportPath);
		expect(envelope.valid, envelope.errors.join("; ")).toBe(true);

		// parsedReport surfaces the envelope fields (the runner's result surface).
		expect(result.parsedReport?.summary).toBe("Contract fixture said hello.");
	});

	it("is idempotent — the repo fixture tree stays clean after runs", async () => {
		const agentsDir = stagedAgentsDir as string;
		const def = resolveAgent("hello-world", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: fixture always resolves.
		const d = def!;

		// Two consecutive runs write two run dirs under the STAGED copy, never the repo.
		await runAgent(
			new FakeAgentAdapter({ output: ENVELOPE }),
			d,
			{ slug: "hello-world", params: {} },
			undefined,
			agentsDir,
		);
		await runAgent(
			new FakeAgentAdapter({ output: ENVELOPE }),
			d,
			{ slug: "hello-world", params: {} },
			undefined,
			agentsDir,
		);

		// The committed fixture pack must never gain a runs/ dir.
		expect(existsSync(join(FIXTURE_PACK, "runs"))).toBe(false);
	});
});
