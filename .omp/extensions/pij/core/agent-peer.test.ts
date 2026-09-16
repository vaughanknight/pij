import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateInput } from "minih/runner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "../adapters/channel.js";
import { FsRegistry } from "../adapters/fs-registry.js";
import {
	type AgentSpawnPaneInfo,
	type AgentSpawnPlan,
	buildAgentPeerEnv,
	executeAgentReport,
	extractLifecycle,
	finalizeAgentSpawn,
	lifecycleFor,
	permissionsAdvisory,
	planOnceClose,
	prepareAgentSpawn,
} from "./agent-peer.js";
import type { ParsedAgentCommand } from "./agents/cli-args.js";
import type { DiscoveredAgent } from "./agents/types.js";
import type { SessionDescriptor } from "./types.js";

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-07-03T00:00:00.000Z",
		...over,
	};
}

describe("buildAgentPeerEnv", () => {
	it("adds PIJ_AGENT_CWD while preserving the base env", () => {
		const env = buildAgentPeerEnv(
			{ PIJ_SESSION_ID: "pij-x", PIJ_HARNESS: "claude" },
			{ agentCwd: "/repo" },
		);
		expect(env.PIJ_SESSION_ID).toBe("pij-x");
		expect(env.PIJ_HARNESS).toBe("claude");
		expect(env.PIJ_AGENT_CWD).toBe("/repo");
	});

	it("omits PIJ_AGENT_CWD when no cwd is given", () => {
		const env = buildAgentPeerEnv({ PIJ_SESSION_ID: "pij-x" }, {});
		expect(env.PIJ_AGENT_CWD).toBeUndefined();
		expect(env.PIJ_SESSION_ID).toBe("pij-x");
	});
});

describe("permissionsAdvisory", () => {
	it("returns one loud line naming the declared preset", () => {
		const line = permissionsAdvisory({ permissions: { preset: "read-only" } });
		expect(line).not.toBeNull();
		expect(line).toContain("read-only");
	});

	it("returns null when the pack declares no permissions preset", () => {
		expect(permissionsAdvisory({})).toBeNull();
		expect(permissionsAdvisory({ permissions: {} })).toBeNull();
	});
});

describe("lifecycleFor — flag > frontmatter > resident", () => {
	it("flag --once wins regardless of frontmatter", () => {
		expect(lifecycleFor({ once: true }, { lifecycle: "resident" })).toBe("once");
		expect(lifecycleFor({ once: true }, {})).toBe("once");
	});

	it("frontmatter lifecycle: once applies when the flag is off", () => {
		expect(lifecycleFor({ once: false }, { lifecycle: "once" })).toBe("once");
	});

	it("defaults to resident when neither flag nor frontmatter asks for once", () => {
		expect(lifecycleFor({ once: false }, {})).toBe("resident");
		expect(lifecycleFor({ once: false }, { lifecycle: "resident" })).toBe("resident");
	});
});

describe("extractLifecycle", () => {
	it("reads lifecycle: once from the leading frontmatter block", () => {
		expect(extractLifecycle("---\ndescription: d\nlifecycle: once\n---\nbody")).toBe("once");
	});

	it("reads lifecycle: resident", () => {
		expect(extractLifecycle("---\nlifecycle: resident\n---\nbody")).toBe("resident");
	});

	it("returns undefined when absent", () => {
		expect(extractLifecycle("---\ndescription: d\n---\nbody")).toBeUndefined();
	});

	it("ignores a lifecycle: line in the body (not the frontmatter block)", () => {
		expect(extractLifecycle("no frontmatter here\nlifecycle: once")).toBeUndefined();
	});
});

describe("planOnceClose — agentOnce && reportedAt", () => {
	it("is true only when the peer is once-mode AND has reported", () => {
		expect(
			planOnceClose(desc({ id: "a", agentOnce: true, reportedAt: "2026-07-03T01:00:00Z" })),
		).toBe(true);
	});

	it("is false when once-mode but not yet reported", () => {
		expect(planOnceClose(desc({ id: "a", agentOnce: true }))).toBe(false);
	});

	it("is false when reported but resident (not once-mode)", () => {
		expect(planOnceClose(desc({ id: "a", reportedAt: "2026-07-03T01:00:00Z" }))).toBe(false);
	});

	it("is false for a plain peer with neither field", () => {
		expect(planOnceClose(desc({ id: "a" }))).toBe(false);
	});
});

// ─── spawn/report orchestration (effect tests, T006/T007) ─────────────────────

let peerHome: string;
beforeEach(() => {
	peerHome = mkdtempSync(join(tmpdir(), "pij-peer-"));
});
afterEach(() => {
	rmSync(peerHome, { recursive: true, force: true });
});

/** Write a fixture pack dir and return it. `frontExtra` appends lines to the
 *  prompt.md frontmatter (e.g. `lifecycle: once`). */
function fixturePack(opts: {
	slug: string;
	frontExtra?: string;
	permissions?: boolean;
	inputSchema?: boolean;
	outputSchema?: boolean;
	instructions?: boolean;
}): DiscoveredAgent {
	const dir = join(peerHome, "packs", opts.slug);
	mkdirSync(dir, { recursive: true });
	const perm = opts.permissions ? "permissions:\n  preset: read-only\n" : "";
	const extra = opts.frontExtra ? `${opts.frontExtra}\n` : "";
	writeFileSync(
		join(dir, "prompt.md"),
		`---\ndescription: A fixture pack.\nmodel: claude-sonnet-4-6\n${perm}${extra}---\nDo the work described.`,
	);
	if (opts.instructions !== false) writeFileSync(join(dir, "instructions.md"), "Always cd first.");
	if (opts.inputSchema) {
		writeFileSync(
			join(dir, "input-schema.json"),
			JSON.stringify({
				type: "object",
				properties: { query: { type: "string", minLength: 1 } },
				required: ["query"],
			}),
		);
	}
	if (opts.outputSchema !== false) {
		writeFileSync(
			join(dir, "output-schema.json"),
			JSON.stringify({
				type: "object",
				required: ["summary"],
				properties: { summary: { type: "string" } },
			}),
		);
	}
	return {
		slug: opts.slug,
		source: "user",
		dir,
		description: "A fixture pack.",
		tags: [],
		model: "claude-sonnet-4-6",
		shadowed: false,
	};
}

function spawnCmd(over: Partial<ParsedAgentCommand> = {}): ParsedAgentCommand {
	return {
		subverb: "spawn",
		promptStdin: false,
		params: {},
		ephemeral: false,
		json: false,
		once: false,
		quiet: false,
		...over,
	};
}

function prepDeps(agent?: DiscoveredAgent) {
	return {
		pijHome: peerHome,
		cwd: "/repo",
		discover: () => (agent ? [agent] : []),
		validateInput,
		harnessForModel: (m?: string) => (m ? "claude" : undefined),
		defaultHarness: "claude",
	};
}

describe("prepareAgentSpawn — fail-fast input validation (AC-14)", () => {
	it("rejects bad -p input against input-schema BEFORE any spawn (E-BADINPUT)", () => {
		const agent = fixturePack({ slug: "needs-query", inputSchema: true });
		const res = prepareAgentSpawn(
			{ cmd: spawnCmd({ slug: "needs-query" }), id: "pij-new" },
			prepDeps(agent),
		);
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.error.code).toBe("E-BADINPUT");
	});

	it("accepts valid input and derives harness/lifecycle/advisory/packet", () => {
		const agent = fixturePack({ slug: "ok", inputSchema: true, permissions: true });
		const res = prepareAgentSpawn(
			{
				cmd: spawnCmd({ slug: "ok", params: { query: "daemon stall" } }),
				id: "pij-new",
				spawnedBy: "pij-boss",
			},
			prepDeps(agent),
		);
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error("expected ok");
		expect(res.plan.harness).toBe("claude");
		expect(res.plan.lifecycle).toBe("resident");
		expect(res.plan.advisory).not.toBeNull(); // preset declared → advisory
		expect(res.plan.packetContent).toContain("pij agent report --json");
		expect(res.plan.outputSchemaJson).toBeTruthy();
		expect(res.plan.spawnedBy).toBe("pij-boss");
	});

	it("E-NOAGENT when the slug is not discovered", () => {
		const res = prepareAgentSpawn({ cmd: spawnCmd({ slug: "ghost" }), id: "pij-new" }, prepDeps());
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.error.code).toBe("E-NOAGENT");
	});

	it("frontmatter lifecycle: once (no flag) yields lifecycle once", () => {
		const agent = fixturePack({ slug: "once-pack", frontExtra: "lifecycle: once" });
		const res = prepareAgentSpawn(
			{ cmd: spawnCmd({ slug: "once-pack" }), id: "pij-new" },
			prepDeps(agent),
		);
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error("expected ok");
		expect(res.plan.lifecycle).toBe("once");
	});

	it("no permissions preset → no advisory", () => {
		const agent = fixturePack({ slug: "plain" });
		const res = prepareAgentSpawn(
			{ cmd: spawnCmd({ slug: "plain" }), id: "pij-new" },
			prepDeps(agent),
		);
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error("expected ok");
		expect(res.plan.advisory).toBeNull();
	});
});

function paneInfo(over: Partial<AgentSpawnPaneInfo> = {}): AgentSpawnPaneInfo {
	return {
		paneId: "%9",
		panePid: 4242,
		dataDir: join(peerHome, "pij-new"),
		eventsPath: join(peerHome, "pij-new", "events.ndjson"),
		startedAtIso: "2026-07-03T00:00:00.000Z",
		...over,
	};
}

function finDeps() {
	return {
		pijHome: peerHome,
		registry: new FsRegistry(peerHome),
		channel: new FsChannel(peerHome),
		cwd: "/repo",
	};
}

function inboxBodies(id: string): string[] {
	const inbox = join(peerHome, id, "inbox");
	try {
		return readdirSync(inbox)
			.filter((n) => n.startsWith("msg-") && n.endsWith(".json"))
			.sort()
			.map((n) => (JSON.parse(readFileSync(join(inbox, n), "utf8")) as { body: string }).body);
	} catch {
		return [];
	}
}

describe("finalizeAgentSpawn — descriptor + packet + pointer (AC-14)", () => {
	function planFor(slug: string, over: Partial<AgentSpawnPlan> = {}): AgentSpawnPlan {
		const agent = fixturePack({ slug, ...(over as { frontExtra?: string }) });
		const res = prepareAgentSpawn(
			{
				cmd: spawnCmd({ slug, ...(over.lifecycle === "once" ? { once: true } : {}) }),
				id: "pij-new",
				spawnedBy: "pij-boss",
			},
			prepDeps(agent),
		);
		if (!res.ok) throw new Error(`prepare failed: ${res.error.code}`);
		return { ...res.plan, ...over };
	}

	it("writes a descriptor carrying agentPack/agentPackDir/spawnedBy + packet + pointer", () => {
		const plan = planFor("ok", { model: "gpt-5.6-sol", effort: "xhigh" });
		const deps = finDeps();
		finalizeAgentSpawn(plan, paneInfo(), deps);

		const d = deps.registry.read("pij-new");
		expect(d?.agentPack).toBe("ok");
		expect(d?.agentPackDir).toBe(plan.packDir);
		expect(d?.spawnedBy).toBe("pij-boss");
		expect(d?.paneId).toBe("%9");
		expect(d?.boundModel).toBe("gpt-5.6-sol");
		expect(d?.effort).toBe("xhigh");
		// packet.md written + names the report command
		expect(readFileSync(join(peerHome, "pij-new", "packet.md"), "utf8")).toContain(
			"pij agent report --json",
		);
		// output-schema.json copied
		expect(readFileSync(join(peerHome, "pij-new", "output-schema.json"), "utf8")).toContain(
			"summary",
		);
		// pointer message landed in the new peer's inbox (packet path + read hint)
		const bodies = inboxBodies("pij-new");
		expect(bodies.length).toBe(1);
		expect(bodies[0]).toContain("packet.md");
		expect(bodies[0]?.toLowerCase()).toContain("read");
	});

	it("agentOnce is true for a frontmatter-once pack (no flag) and false otherwise", () => {
		const onceAgent = fixturePack({ slug: "oncep", frontExtra: "lifecycle: once" });
		const oncePrep = prepareAgentSpawn(
			{ cmd: spawnCmd({ slug: "oncep" }), id: "pij-once", spawnedBy: "pij-boss" },
			prepDeps(onceAgent),
		);
		if (!oncePrep.ok) throw new Error("prep failed");
		const deps = finDeps();
		finalizeAgentSpawn(oncePrep.plan, paneInfo({ dataDir: join(peerHome, "pij-once") }), deps);
		expect(deps.registry.read("pij-once")?.agentOnce).toBe(true);

		const residentPlan = planFor("resid");
		finalizeAgentSpawn(residentPlan, paneInfo(), deps);
		expect(deps.registry.read("pij-new")?.agentOnce).toBe(false);
	});
});

describe("executeAgentReport — validated push to spawner (AC-15)", () => {
	function seedPeer(opts: { spawnedBy?: string; schema?: boolean } = {}): void {
		const reg = new FsRegistry(peerHome);
		reg.write({
			id: "pij-me",
			folder: "/repo",
			dataDir: join(peerHome, "pij-me"),
			eventsPath: join(peerHome, "pij-me", "events.ndjson"),
			pid: 1,
			startedAt: "2026-07-03T00:00:00.000Z",
			harness: "claude",
			paneId: "%5",
			...(opts.spawnedBy ? { spawnedBy: opts.spawnedBy } : {}),
			agentPack: "flowspace-search",
		});
		if (opts.schema) {
			mkdirSync(join(peerHome, "pij-me"), { recursive: true });
			writeFileSync(
				join(peerHome, "pij-me", "output-schema.json"),
				JSON.stringify({ type: "object", required: ["summary", "results"], properties: {} }),
			);
		}
	}
	function repDeps() {
		return {
			pijHome: peerHome,
			registry: new FsRegistry(peerHome),
			channel: new FsChannel(peerHome),
			now: () => Date.parse("2026-07-03T02:00:00.000Z"),
		};
	}

	it("errors E-NOID when self has no descriptor", () => {
		const res = executeAgentReport("pij-ghost", { summary: "x" }, repDeps());
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.error.code).toBe("E-NOID");
	});

	it("errors E-NOREPORTTARGET when the peer has no spawner", () => {
		seedPeer({});
		const res = executeAgentReport("pij-me", { summary: "x", results: [] }, repDeps());
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.error.code).toBe("E-NOREPORTTARGET");
	});

	it("blocks an invalid report — nothing delivered", () => {
		seedPeer({ spawnedBy: "pij-boss", schema: true });
		const res = executeAgentReport("pij-me", { results: [] }, repDeps());
		expect(res.ok).toBe(false);
		if (res.ok) throw new Error("expected failure");
		expect(res.error.code).toBe("E-BADREPORT");
		expect(inboxBodies("pij-boss").length).toBe(0);
	});

	it("delivers a valid report to the spawner + stamps reportedAt; repeatable", () => {
		seedPeer({ spawnedBy: "pij-boss", schema: true });
		const res1 = executeAgentReport("pij-me", { summary: "done", results: [] }, repDeps());
		expect(res1.ok).toBe(true);
		if (!res1.ok) throw new Error("expected ok");
		expect(res1.to).toBe("pij-boss");
		expect(inboxBodies("pij-boss").length).toBe(1);
		expect(inboxBodies("pij-boss")[0]).toContain("agent report from pij-me");
		expect(new FsRegistry(peerHome).read("pij-me")?.reportedAt).toBeTruthy();

		// second report re-delivers (re-task path)
		const res2 = executeAgentReport("pij-me", { summary: "again", results: [] }, repDeps());
		expect(res2.ok).toBe(true);
		expect(inboxBodies("pij-boss").length).toBe(2);
	});
});
