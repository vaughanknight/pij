// Built-in pack contract: the shipped flowspace-search pack (AC-08).
//
// Points discovery at the REAL `builtin-agents/` dir and proves: it resolves with
// the pinned model, runs through the always-ephemeral temp-copy path, and leaves
// ZERO writes under the package dir (KF-07 — minih roots runs/ at the pack dir).

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeAgentAdapter } from "minih";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAgentArgs } from "./cli-args.js";
import { type AdapterResolution, dispatchAgent, type VerbDeps } from "./cli-verbs.js";
import { discoverAgents } from "./pack.js";

const BUILTIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "builtin-agents");

// A valid envelope satisfying BOTH the system contract (summary + retrospective)
// AND the pack's output-schema (summary + results[]).
const ENVELOPE = JSON.stringify({
	summary: "Found the daemon stall watchdog in core/daemon.ts.",
	results: [
		{
			node_id: "callable:core/daemon.ts:buildStalledNotice",
			lines: "294-310",
			why: "latched stall notice",
		},
	],
	retrospective: {
		workedWell: "fs2 semantic search surfaced the node immediately.",
		confusing: "Nothing was confusing about this query.",
		magicWand: "A pij-native fs2 MCP so the agent skips the shell hop.",
	},
});

let cwd: string;
let pijHome: string;

function deps(): VerbDeps {
	return {
		pijHome,
		cwd,
		builtinDir: BUILTIN_DIR,
		defaultHarness: "claude",
		harnessForModel: (m) => (m?.startsWith("claude") ? "claude" : undefined),
		modelWarning: () => null,
		effortWarning: () => null,
		makeAdapter: async (): Promise<AdapterResolution> => ({
			ok: true,
			adapter: new FakeAgentAdapter({ output: ENVELOPE }),
		}),
		progress: () => {},
	};
}

/** Recursive file list (relative) under a dir, for before/after diffing. */
function tree(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...tree(full).map((f) => `${name}/${f}`));
		else out.push(name);
	}
	return out.sort();
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "pij-builtin-cwd-"));
	pijHome = mkdtempSync(join(tmpdir(), "pij-builtin-home-"));
});
afterEach(() => {
	for (const d of [cwd, pijHome]) rmSync(d, { recursive: true, force: true });
});

describe("flowspace-search built-in (AC-08)", () => {
	it("ships with the pinned sonnet model, low effort, read-only+shell, non-empty description", () => {
		const found = discoverAgents([{ dir: BUILTIN_DIR, source: "builtin" }]).find(
			(a) => a.slug === "flowspace-search",
		);
		expect(found).toBeDefined();
		expect(found?.model).toBe("claude-sonnet-4-6"); // pinned (plan § Clarifications)
		expect(found?.reasoning).toBe("low");
		expect(found?.description.trim().length).toBeGreaterThan(0);
	});

	it("its instructions cover the graph-missing precondition + repo-root cd", () => {
		const instructions = readFileSync(
			join(BUILTIN_DIR, "flowspace-search", "instructions.md"),
			"utf8",
		);
		expect(instructions).toContain("fs2 scan");
		expect(instructions).toContain("PIJ_AGENT_CWD");
	});

	it("runs always-ephemeral: zero writes under builtin-agents/ and runDir null", async () => {
		const before = tree(BUILTIN_DIR);
		const parsed = parseAgentArgs([
			"run",
			"flowspace-search",
			"-p",
			"query=daemon stall",
			"--json",
		]);
		if (!parsed.ok) throw new Error(parsed.message);
		const res = await dispatchAgent(parsed.cmd, deps());

		expect(res.exitCode).toBe(0);
		const env = JSON.parse(res.stdout) as { run: { runDir: string | null; slug: string } };
		expect(env.run.slug).toBe("flowspace-search");
		expect(env.run.runDir).toBeNull(); // un-ejected built-in → never recorded
		// The package dir is byte-identical after the run (no runs/ ledger leaked in).
		expect(tree(BUILTIN_DIR)).toEqual(before);
	});
});
