import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentResult, AgentRunOptions, IAgentAdapter } from "minih";
import { FakeAgentAdapter } from "minih";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAgentArgs } from "./cli-args.js";
import {
	type AdapterResolution,
	dispatchAgent,
	renderAgentError,
	runOutcomeError,
	type VerbDeps,
} from "./cli-verbs.js";

const ENVELOPE = JSON.stringify({
	summary: "Did the thing successfully.",
	retrospective: {
		workedWell: "Discovery and running were smooth.",
		confusing: "Nothing in particular was confusing.",
		magicWand: "A native ephemeral flag upstream in minih.",
	},
});

let cwd: string;
let pijHome: string;
let builtinDir: string;
let progressLines: string[];

/** Write a minimal minih pack under `dir/<slug>`. */
function writePack(
	dir: string,
	slug: string,
	opts: { description?: string; model?: string; inputSchema?: unknown } = {},
): string {
	const packDir = join(dir, slug);
	mkdirSync(packDir, { recursive: true });
	const model = opts.model ?? "claude-sonnet-4-6";
	writeFileSync(
		join(packDir, "prompt.md"),
		`---\ndescription: ${opts.description ?? `The ${slug} pack.`}\nmodel: ${model}\nreasoning: low\n---\nDo ${slug}.`,
	);
	if (opts.inputSchema) {
		writeFileSync(join(packDir, "input-schema.json"), JSON.stringify(opts.inputSchema));
	}
	return packDir;
}

/** A failing adapter (metadata.result → "failed"). */
const failingAdapter: IAgentAdapter = {
	run: async (_o: AgentRunOptions): Promise<AgentResult> => ({
		output: "",
		sessionId: "",
		status: "failed",
		exitCode: 1,
		stderr: "boom",
		tokens: null,
	}),
	compact: async () => stub(),
	terminate: async () => stub(),
};
function stub(): AgentResult {
	return { output: "", sessionId: "", status: "completed", exitCode: 0, tokens: null };
}

/** Base deps: a completed FakeAgentAdapter, claude harness mapping, no warnings. */
function deps(overrides: Partial<VerbDeps> = {}): VerbDeps {
	return {
		pijHome,
		cwd,
		builtinDir,
		defaultHarness: "claude",
		harnessForModel: (m) => (m?.startsWith("claude") ? "claude" : m ? "codex" : undefined),
		modelWarning: () => null,
		effortWarning: () => null,
		makeAdapter: async (): Promise<AdapterResolution> => ({
			ok: true,
			adapter: new FakeAgentAdapter({ output: ENVELOPE }),
		}),
		progress: (l) => progressLines.push(l),
		...overrides,
	};
}

function run(args: string[], d: VerbDeps) {
	const parsed = parseAgentArgs(args);
	if (!parsed.ok) throw new Error(`arg parse failed: ${parsed.message}`);
	return dispatchAgent(parsed.cmd, d);
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "pij-verbs-cwd-"));
	pijHome = mkdtempSync(join(tmpdir(), "pij-verbs-home-"));
	builtinDir = mkdtempSync(join(tmpdir(), "pij-verbs-builtin-"));
	progressLines = [];
});
afterEach(() => {
	for (const d of [cwd, pijHome, builtinDir]) rmSync(d, { recursive: true, force: true });
});

describe("list (AC-01)", () => {
	it("merges 3 tiers with precedence + shadow marking", async () => {
		writePack(join(cwd, "agents"), "dup", { description: "Project dup." });
		writePack(join(pijHome, "agents"), "dup", { description: "User dup (shadowed)." });
		writePack(builtinDir, "flowspace-search", { description: "Built-in search." });

		const res = await run(["list", "--json"], deps());
		const rows = JSON.parse(res.stdout) as Array<{
			slug: string;
			source: string;
			shadowed: boolean;
			harness: string | null;
		}>;
		const dupProject = rows.find((r) => r.slug === "dup" && r.source === "project");
		const dupUser = rows.find((r) => r.slug === "dup" && r.source === "user");
		expect(dupProject?.shadowed).toBe(false);
		expect(dupUser?.shadowed).toBe(true);
		expect(rows.find((r) => r.slug === "flowspace-search")?.harness).toBe("claude");
	});

	it("human table dims shadowed rows and derives HARNESS", async () => {
		writePack(join(cwd, "agents"), "alpha", { model: "claude-sonnet-4-6" });
		writePack(builtinDir, "alpha", { model: "claude-sonnet-4-6" });
		const res = await run(["list"], deps());
		expect(res.stdout).toContain("HARNESS");
		expect(res.stdout).toContain("claude");
		expect(res.stdout).toContain("(shadowed)");
		expect(res.exitCode).toBe(0);
	});
});

describe("run — named pack (AC-02/AC-04)", () => {
	it("runs a project pack and prints the report summary", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const res = await run(["run", "alpha"], deps());
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("Did the thing successfully.");
	});

	it("--json emits the {run, report} envelope on stdout only", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const res = await run(["run", "alpha", "--json"], deps());
		expect(res.exitCode).toBe(0);
		expect(res.stderr).toBe(""); // zero stderr bleed (AC-10)
		const env = JSON.parse(res.stdout) as {
			run: { slug: string; status: string; harness: string; validated: unknown; runDir: unknown };
			report: { summary: string };
		};
		expect(env.run.slug).toBe("alpha");
		expect(env.run.status).toBe("completed");
		expect(env.run.harness).toBe("claude");
		expect(env.report.summary).toBe("Did the thing successfully.");
	});

	it("records a named run (runDir present, non-null) by default", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const res = await run(["run", "alpha", "--json"], deps());
		const env = JSON.parse(res.stdout) as { run: { runDir: string | null } };
		expect(env.run.runDir).not.toBeNull();
		// The recorded run lives under the pack dir.
		expect(existsSync(env.run.runDir as string)).toBe(true);
	});

	it("--ephemeral leaves zero new entries under the pack's runs/ (AC-06)", async () => {
		const packDir = writePack(join(cwd, "agents"), "alpha");
		const res = await run(["run", "alpha", "--ephemeral", "--json"], deps());
		const env = JSON.parse(res.stdout) as { run: { runDir: string | null } };
		expect(env.run.runDir).toBeNull();
		expect(existsSync(join(packDir, "runs"))).toBe(false);
	});

	it("override warnings are surfaced on stderr (progress), never block", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const warnDeps = deps({ effortWarning: () => "warning: effort 'zzz' may be unsupported" });
		const res = await run(["run", "alpha", "--effort", "zzz"], warnDeps);
		expect(res.exitCode).toBe(0);
		expect(progressLines.some((l) => l.includes("may be unsupported"))).toBe(true);
	});
});

describe("run — --permissions / --cwd pass-through (fix-0001, rev-0002 finding 1)", () => {
	it("named run: --permissions + --cwd reach minih (run.json preset + canonicalRoots)", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const altCwd = mkdtempSync(join(tmpdir(), "pij-alt-cwd-"));
		try {
			const res = await run(
				["run", "alpha", "--permissions", "yolo", "--cwd", altCwd, "--json"],
				deps(),
			);
			const env = JSON.parse(res.stdout) as { run: { runDir: string | null } };
			expect(env.run.runDir).not.toBeNull();
			const runJson = JSON.parse(
				readFileSync(join(env.run.runDir as string, "run.json"), "utf8"),
			) as { permissions: { preset: string; canonicalRoots: string[] } };
			// --permissions overrides ONLY the preset layer (workshop 002).
			expect(runJson.permissions.preset).toBe("yolo");
			// --cwd is the root the permission policy is resolved against.
			expect(runJson.permissions.canonicalRoots).toContain(realpathSync(altCwd));
		} finally {
			rmSync(altCwd, { recursive: true, force: true });
		}
	});

	it("ephemeral run: --permissions yolo reaches minih (pure-allow ⇒ adapter gets no permission handler)", async () => {
		writePack(join(cwd, "agents"), "alpha");
		// minih only wires a runtime permission handler for a *non-default* policy
		// (`isNonDefaultPolicy`); a pure-yolo policy falls through to the adapter's
		// built-in approveAll with NO handler. So the handler's presence is an
		// observable proxy for which preset minih actually resolved.
		const yoloAdapter = new FakeAgentAdapter({ output: ENVELOPE });
		const defaultAdapter = new FakeAgentAdapter({ output: ENVELOPE });
		await run(
			["run", "alpha", "--ephemeral", "--permissions", "yolo", "--json"],
			deps({ makeAdapter: async () => ({ ok: true, adapter: yoloAdapter }) }),
		);
		await run(
			["run", "alpha", "--ephemeral", "--json"],
			deps({ makeAdapter: async () => ({ ok: true, adapter: defaultAdapter }) }),
		);
		// yolo override applied ⇒ no handler; default (restricted) ⇒ handler present.
		expect(yoloAdapter.getRunHistory()[0]?.permissionHandler).toBeUndefined();
		expect(defaultAdapter.getRunHistory()[0]?.permissionHandler).toBeDefined();
	});
});

describe("run — inline (AC-05)", () => {
	it("runs an inline prompt and leaves nothing under ~/.pij/tmp", async () => {
		const res = await run(["run", "--prompt", "List risky TODOs", "--json"], deps());
		expect(res.exitCode).toBe(0);
		const env = JSON.parse(res.stdout) as { run: { slug: string; runDir: string | null } };
		expect(env.run.slug).toBe("(inline)");
		expect(env.run.runDir).toBeNull();
		// tmp swept clean.
		const tmpAgents = join(pijHome, "tmp", "agents");
		expect(existsSync(tmpAgents) ? readdirSync(tmpAgents) : []).toEqual([]);
	});

	it("reads the prompt from stdin for --prompt -", async () => {
		const res = await run(
			["run", "--prompt", "-", "--json"],
			deps({ readStdin: () => "prompt from stdin" }),
		);
		expect(res.exitCode).toBe(0);
	});
});

describe("run — error surface (AC-09)", () => {
	it("E-NOAGENT for an unknown slug (exit 1)", async () => {
		const res = await run(["run", "ghost"], deps());
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("E-NOAGENT: no agent 'ghost'");
	});

	it("E-BADINPUT before any adapter session (exit 1)", async () => {
		writePack(join(cwd, "agents"), "alpha", {
			inputSchema: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
		});
		// Missing required `n` → AJV fails fast.
		const res = await run(["run", "alpha"], deps());
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("E-BADINPUT");
	});

	it("E-NOADAPTER for an unknown --harness (exit 1)", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const noAdapter = deps({
			makeAdapter: async (h): Promise<AdapterResolution> => ({
				ok: false,
				error: { code: "E-NOADAPTER", harness: h },
			}),
		});
		const res = await run(["run", "alpha", "--harness", "weird"], noAdapter);
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("E-NOADAPTER: harness 'weird'");
	});

	it("E-HARNESSBIN when the backing CLI is missing (exit 2)", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const noBin = deps({
			makeAdapter: async (): Promise<AdapterResolution> => ({
				ok: false,
				error: { code: "E-HARNESSBIN", bin: "claude" },
			}),
		});
		const res = await run(["run", "alpha"], noBin);
		expect(res.exitCode).toBe(2);
		expect(res.stderr).toContain("E-HARNESSBIN: claude CLI not found");
	});

	it("E-RUNFAILED when the run finishes failed (exit 1)", async () => {
		writePack(join(cwd, "agents"), "alpha");
		const failing = deps({
			makeAdapter: async (): Promise<AdapterResolution> => ({ ok: true, adapter: failingAdapter }),
		});
		const res = await run(["run", "alpha"], failing);
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("E-RUNFAILED: agent finished failed");
	});
});

describe("runOutcomeError + renderAgentError (AC-09 message shapes)", () => {
	it("maps a permission denial to E-PERMISSION", () => {
		const e = runOutcomeError(
			{ result: "failed", permissionError: { kind: "shell" } },
			{ preset: "read-only", reportPath: null },
		);
		expect(e).toEqual({ code: "E-PERMISSION", kind: "shell", preset: "read-only" });
		expect(renderAgentError(e!)).toContain(
			"E-PERMISSION: run denied (shell blocked by preset 'read-only')",
		);
	});

	it("maps a plain failure to E-RUNFAILED with the report path", () => {
		const e = runOutcomeError(
			{ result: "timeout" },
			{ preset: "read-only", reportPath: "/r/x.json" },
		);
		expect(e).toEqual({ code: "E-RUNFAILED", reason: "timeout", reportPath: "/r/x.json" });
	});

	it("returns null on a completed run", () => {
		expect(
			runOutcomeError({ result: "completed" }, { preset: "read-only", reportPath: null }),
		).toBeNull();
	});

	it("renders every error code per the workshop table", () => {
		expect(renderAgentError({ code: "E-NOAGENT", slug: "x" })).toContain("pij agent list");
		expect(renderAgentError({ code: "E-BADINPUT", errors: ["bad"] })).toContain(
			"input-schema.json",
		);
		expect(renderAgentError({ code: "E-NOADAPTER", harness: "z" })).toContain(
			"have: claude, codex, copilot",
		);
		expect(renderAgentError({ code: "E-HARNESSBIN", bin: "codex" })).toContain(
			"codex CLI not found",
		);
	});
});

describe("show / new / check / eject (AC-01/AC-08)", () => {
	it("show prints defaults + files, with an eject hint for built-ins", async () => {
		writePack(builtinDir, "flowspace-search", { description: "Search this repo's fs2 graph." });
		const res = await run(["show", "flowspace-search"], deps());
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("read-only");
		expect(res.stdout).toContain("pij agent eject flowspace-search");
		expect(res.stdout).toContain("prompt.md");
	});

	it("new scaffolds a runnable pack with a non-empty description", async () => {
		const res = await run(["new", "mytool"], deps());
		expect(res.exitCode).toBe(0);
		const prompt = readFileSync(join(cwd, "agents", "mytool", "prompt.md"), "utf8");
		expect(prompt).toMatch(/description:\s*\S+/);
		// The scaffolded pack is discoverable (non-empty description → minih resolves it).
		const list = await run(["list", "--json"], deps());
		expect(JSON.parse(list.stdout).some((r: { slug: string }) => r.slug === "mytool")).toBe(true);
	});

	it("check passes a valid pack and fails a broken schema (exit 1)", async () => {
		writePack(join(cwd, "agents"), "good", { inputSchema: { type: "object" } });
		expect((await run(["check", "good"], deps())).exitCode).toBe(0);

		const badDir = writePack(join(cwd, "agents"), "bad");
		writeFileSync(join(badDir, "input-schema.json"), "{ not json ");
		const res = await run(["check", "bad"], deps());
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("not valid JSON");
	});

	it("eject copies a built-in into ./agents and it then shadows the built-in", async () => {
		writePack(builtinDir, "flowspace-search", { description: "Search this repo's fs2 graph." });
		const res = await run(["eject", "flowspace-search"], deps());
		expect(res.exitCode).toBe(0);
		expect(existsSync(join(cwd, "agents", "flowspace-search", "prompt.md"))).toBe(true);

		const list = JSON.parse((await run(["list", "--json"], deps())).stdout) as Array<{
			slug: string;
			source: string;
			shadowed: boolean;
		}>;
		expect(
			list.find((r) => r.slug === "flowspace-search" && r.source === "project")?.shadowed,
		).toBe(false);
		expect(
			list.find((r) => r.slug === "flowspace-search" && r.source === "builtin")?.shadowed,
		).toBe(true);
	});

	it("eject refuses to overwrite an existing ./agents pack", async () => {
		writePack(builtinDir, "flowspace-search");
		writePack(join(cwd, "agents"), "flowspace-search");
		const res = await run(["eject", "flowspace-search"], deps());
		expect(res.exitCode).toBe(1);
		expect(res.stderr).toContain("already exists");
	});
});
