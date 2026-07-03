// Live adapter validation (AC-07) — gated behind PIJ_AGENT_LIVE=1.
//
// Drives one real `claude -p` and one real `codex exec` one-shot through the
// pij `IAgentAdapter` → minih `runAgent` path and asserts each produces a valid
// system envelope end-to-end. Follows the repo's live-gate pattern verbatim
// (`harness/scripts/vetters/agent.live.test.ts`): `describe.skipIf` for the real
// runs plus a self-documenting `it.skip` so `just test` shows WHY they skipped.
//
//   just agent-live      # PIJ_AGENT_LIVE=1 MINIH_NO_AUTO_HARVEST=1 vitest run adapters.live
//
// Requires `claude` and `codex` on PATH and spends API tokens; NOT in self-check.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSystemOutput } from "minih/runner";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgentPack } from "../runner.js";
import { ClaudeHeadlessAdapter } from "./claude.js";
import { CodexExecAdapter } from "./codex.js";

const LIVE = process.env.PIJ_AGENT_LIVE === "1";

// The exact envelope we ask the model to echo. Each retrospective field must be
// ≥10 chars (minih system-output schema).
const ENVELOPE = {
	summary: "pij live adapter smoke completed.",
	retrospective: {
		workedWell: "The headless one-shot adapter returned structured output.",
		confusing: "Nothing was confusing about this run.",
		magicWand: "An upstream ephemeral mode would remove the temp-pack copy.",
	},
};

const PROMPT = [
	"Respond with EXACTLY the following JSON object and NOTHING else.",
	"No markdown, no code fences, no commentary — only the raw JSON on a single line:",
	"",
	JSON.stringify(ENVELOPE),
].join("\n");

let agentsDir: string;

function writeLivePack(): void {
	const dir = join(agentsDir, "live-smoke");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "prompt.md"),
		`---\ndescription: pij live adapter smoke pack.\n---\n${PROMPT}`,
	);
}

describe.skipIf(!LIVE)("agent-runtime adapters — live (AC-07)", () => {
	beforeAll(() => {
		agentsDir = mkdtempSync(join(tmpdir(), "pij-agent-live-"));
		writeLivePack();
	});
	afterAll(() => {
		if (agentsDir) rmSync(agentsDir, { recursive: true, force: true });
	});

	it(
		"claude one-shot yields a valid system envelope",
		async () => {
			const res = await runAgentPack({
				slug: "live-smoke",
				agentsDir,
				adapter: new ClaudeHeadlessAdapter(),
				params: {},
			});
			expect(res.ok, res.ok ? "" : JSON.stringify(res)).toBe(true);
			if (!res.ok) throw new Error("run failed");
			const reportPath = join(res.runResult.runDir, "output", "report.json");
			expect(existsSync(reportPath)).toBe(true);
			const v = validateSystemOutput(reportPath);
			expect(v.valid, v.errors.join("; ")).toBe(true);
		},
		{ timeout: 180_000 },
	);

	it(
		"codex one-shot yields a valid system envelope",
		async () => {
			const res = await runAgentPack({
				slug: "live-smoke",
				agentsDir,
				adapter: new CodexExecAdapter(),
				params: {},
			});
			expect(res.ok, res.ok ? "" : JSON.stringify(res)).toBe(true);
			if (!res.ok) throw new Error("run failed");
			const reportPath = join(res.runResult.runDir, "output", "report.json");
			expect(existsSync(reportPath)).toBe(true);
			const v = validateSystemOutput(reportPath);
			expect(v.valid, v.errors.join("; ")).toBe(true);
		},
		{ timeout: 180_000 },
	);
});

if (!LIVE) {
	describe("agent-runtime adapters — live (AC-07)", () => {
		it.skip("PIJ_AGENT_LIVE=1 not set — run `just agent-live` to enable", () => {});
	});
}
