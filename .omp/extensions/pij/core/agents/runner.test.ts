import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAgentAdapter } from "minih";
import { resolveAgent } from "minih/runner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRunConfig, runAgentPack } from "./runner.js";

let root: string;

const ENVELOPE = JSON.stringify({
	summary: "Runner test envelope summary.",
	retrospective: {
		workedWell: "Wiring was straightforward.",
		confusing: "Nothing was confusing.",
		magicWand: "Nothing in particular, all good here.",
	},
});

/** Write a pack under `<root>/agents/<slug>/` with optional frontmatter fields
 *  and an optional input-schema.json. Returns the agents dir. */
function writePack(
	slug: string,
	opts: { frontmatter?: Record<string, string>; inputSchema?: unknown } = {},
): string {
	const agentsDir = join(root, "agents");
	const dir = join(agentsDir, slug);
	mkdirSync(dir, { recursive: true });
	const fmLines = Object.entries(opts.frontmatter ?? {}).map(([k, v]) => `${k}: ${v}`);
	const fm = fmLines.length ? `---\n${fmLines.join("\n")}\n---\n` : "";
	writeFileSync(join(dir, "prompt.md"), `${fm}Do the task.`);
	if (opts.inputSchema) {
		writeFileSync(join(dir, "input-schema.json"), JSON.stringify(opts.inputSchema));
	}
	return agentsDir;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "pij-runner-"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("buildRunConfig — override precedence (flag > frontmatter > unset)", () => {
	it("uses frontmatter defaults when no overrides are given", () => {
		const agentsDir = writePack("alpha", {
			frontmatter: { description: "A", model: "fm-model", reasoning: "medium", timeout: "42" },
		});
		const def = resolveAgent("alpha", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, {});
		expect(cfg.model).toBe("fm-model");
		expect(cfg.reasoningEffort).toBe("medium");
		expect(cfg.timeout).toBe(42);
		expect(cfg.slug).toBe("alpha");
	});

	it("flag overrides win over frontmatter", () => {
		const agentsDir = writePack("beta", {
			frontmatter: { description: "B", model: "fm-model", reasoning: "medium", timeout: "42" },
		});
		const def = resolveAgent("beta", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, { model: "flag-model", effort: "high", timeout: 99 });
		expect(cfg.model).toBe("flag-model");
		expect(cfg.reasoningEffort).toBe("high");
		expect(cfg.timeout).toBe(99);
	});

	it("leaves fields unset when neither flag nor frontmatter provides them", () => {
		const agentsDir = writePack("gamma", { frontmatter: { description: "G" } });
		const def = resolveAgent("gamma", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, {});
		expect(cfg.model).toBeUndefined();
		expect(cfg.reasoningEffort).toBeUndefined();
		expect(cfg.timeout).toBeUndefined();
	});

	it("warns (does not block) on an unknown effort and still passes it through", () => {
		const agentsDir = writePack("delta", { frontmatter: { description: "D" } });
		const def = resolveAgent("delta", agentsDir);
		const warn = vi.fn();
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, { effort: "bananas" }, { warn });
		expect(warn).toHaveBeenCalledOnce();
		expect(cfg.reasoningEffort).toBe("bananas");
	});

	it("accepts codex's minimal without warning (a known pij effort)", () => {
		const agentsDir = writePack("eps", { frontmatter: { description: "E" } });
		const def = resolveAgent("eps", agentsDir);
		const warn = vi.fn();
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, { effort: "minimal" }, { warn });
		expect(warn).not.toHaveBeenCalled();
		expect(cfg.reasoningEffort).toBe("minimal");
	});
});

describe("buildRunConfig — --permissions / --cwd pass-through (fix-0001, rev-0002 finding 1)", () => {
	it("maps overrides.permissions → permissionsOverride.preset", () => {
		const agentsDir = writePack("perm", { frontmatter: { description: "P" } });
		const def = resolveAgent("perm", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, { permissions: "yolo" });
		expect(cfg.permissionsOverride?.preset).toBe("yolo");
	});

	it("maps overrides.cwd → config.cwd", () => {
		const agentsDir = writePack("cwd", { frontmatter: { description: "C" } });
		const def = resolveAgent("cwd", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, { cwd: "/tmp/alt-cwd" });
		expect(cfg.cwd).toBe("/tmp/alt-cwd");
	});

	it("leaves permissionsOverride/cwd unset when neither flag is given", () => {
		const agentsDir = writePack("bare", { frontmatter: { description: "B" } });
		const def = resolveAgent("bare", agentsDir);
		// biome-ignore lint/style/noNonNullAssertion: pack just written.
		const cfg = buildRunConfig(def!, {});
		expect(cfg.permissionsOverride).toBeUndefined();
		expect(cfg.cwd).toBeUndefined();
	});
});

describe("runAgentPack — orchestration", () => {
	it("runs the pack through the injected adapter and surfaces parsedReport", async () => {
		const agentsDir = writePack("hello", { frontmatter: { description: "H" } });
		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		const res = await runAgentPack({ slug: "hello", agentsDir, adapter, params: {} });
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error("expected ok");
		expect(res.report?.summary).toBe("Runner test envelope summary.");
		expect(res.validated).toBe(false); // no input-schema.json
		expect(adapter.getRunHistory()).toHaveLength(1);
	});

	it("passes the resolved model/effort through to the adapter", async () => {
		const agentsDir = writePack("hello2", {
			frontmatter: { description: "H", model: "fm-model", reasoning: "low" },
		});
		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		await runAgentPack({
			slug: "hello2",
			agentsDir,
			adapter,
			params: {},
			overrides: { model: "flag-model" },
		});
		const call = adapter.getRunHistory()[0];
		expect(call?.model).toBe("flag-model");
		expect(call?.reasoningEffort).toBe("low");
	});

	it("E-NOAGENT when the slug does not resolve", async () => {
		const agentsDir = writePack("present", { frontmatter: { description: "P" } });
		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		const res = await runAgentPack({ slug: "absent", agentsDir, adapter, params: {} });
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.code).toBe("E-NOAGENT");
		expect(adapter.getRunHistory()).toHaveLength(0);
	});

	it("FAIL-FAST: invalid input → E-BADINPUT before adapter.run is ever called (AC-03)", async () => {
		const agentsDir = writePack("validated", {
			frontmatter: { description: "V" },
			inputSchema: {
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
				additionalProperties: false,
			},
		});
		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		const res = await runAgentPack({
			slug: "validated",
			agentsDir,
			adapter,
			params: { wrong: 1 }, // missing required `name`
		});
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.code).toBe("E-BADINPUT");
		expect(res.errors.length).toBeGreaterThan(0);
		// The load-bearing assertion: the adapter session never started.
		expect(adapter.getRunHistory()).toHaveLength(0);
	});

	it("valid input against a schema → validated:true and the run proceeds", async () => {
		const agentsDir = writePack("validated2", {
			frontmatter: { description: "V" },
			inputSchema: {
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
			},
		});
		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		const res = await runAgentPack({
			slug: "validated2",
			agentsDir,
			adapter,
			params: { name: "ok" },
		});
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error("expected ok");
		expect(res.validated).toBe(true);
		expect(adapter.getRunHistory()).toHaveLength(1);
	});
});
