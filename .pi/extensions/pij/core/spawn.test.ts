// pij-messaging — spawn builder + ready-body codec tests (AC-02 / AC-09).
//
// Covers: model ±, task ± (incl. special chars / quotes / newlines),
// paneId ±, required env vars, argv array shape, ready-body round-trip.

import { describe, expect, it } from "vitest";
import type { ModelEntry } from "./models/registry.js";
import {
	aliasAgentSpawnArgs,
	buildControlSpawnCommand,
	buildEffortWarning,
	buildPendingDescriptor,
	buildSpawnCommand,
	buildSpawnOutput,
	livePeerPanes,
	parseAdoptArgs,
	parseCompactSelfArgs,
	parseReadyBody,
	parseSpawnArgs,
	planBranch,
	planControlSplit,
	planPlacement,
	readyBody,
	spawnIdentitySeed,
} from "./spawn.js";
import type { HarnessKind, SessionDescriptor } from "./types.js";

// ─── buildSpawnCommand ───────────────────────────────────────────────────────

describe("buildSpawnCommand", () => {
	const base = {
		spawnId: "abc123",
		announceTo: "pij-parent01",
		cwd: "/home/user/project",
		role: "worker" as const,
	};

	it("cmd is always 'pi'", () => {
		const result = buildSpawnCommand(base);
		expect(result.cmd).toBe("pi");
	});

	it("args is empty when no model given", () => {
		const result = buildSpawnCommand(base);
		expect(result.args).toEqual([]);
	});

	it("emits --model arg when model is provided", () => {
		const result = buildSpawnCommand({ ...base, model: "anthropic/claude-3-5-sonnet" });
		expect(result.args).toEqual(["--model", "anthropic/claude-3-5-sonnet"]);
	});

	it("model with slash and dots produces correct discrete args (AC-09: no shell string)", () => {
		const result = buildSpawnCommand({ ...base, model: "openai/gpt-4o-mini" });
		// Two discrete array elements — not one joined string
		expect(result.args).toHaveLength(2);
		expect(result.args[0]).toBe("--model");
		expect(result.args[1]).toBe("openai/gpt-4o-mini");
	});

	it("args is an array of strings (no shell string — AC-09)", () => {
		const result = buildSpawnCommand({ ...base, model: "some/model" });
		expect(Array.isArray(result.args)).toBe(true);
		for (const arg of result.args) {
			expect(typeof arg).toBe("string");
		}
	});

	it("always includes required env vars", () => {
		const result = buildSpawnCommand(base);
		expect(result.env.PIJ_ANNOUNCE_TO).toBe("pij-parent01");
		expect(result.env.PIJ_SPAWN_ID).toBe("abc123");
		expect(result.env.PIJ_ROLE).toBe("worker");
	});

	it("exposes the spawner id as PIJ_PARENT_ID (who spawned me)", () => {
		const result = buildSpawnCommand(base);
		expect(result.env.PIJ_PARENT_ID).toBe("pij-parent01");
	});

	it("omits PIJ_SPAWN_TASK when no task given", () => {
		const result = buildSpawnCommand(base);
		expect(result.env).not.toHaveProperty("PIJ_SPAWN_TASK");
	});

	it("sets PIJ_SPAWN_TASK when task given", () => {
		const result = buildSpawnCommand({ ...base, task: "do something useful" });
		expect(result.env.PIJ_SPAWN_TASK).toBe("do something useful");
	});

	it("task with double quotes survives env round-trip (no shell interpretation)", () => {
		const task = 'Run: echo "hello world"';
		const result = buildSpawnCommand({ ...base, task });
		expect(result.env.PIJ_SPAWN_TASK).toBe(task);
	});

	it("task with single quotes survives env round-trip", () => {
		const task = "it's a task with 'single quotes'";
		const result = buildSpawnCommand({ ...base, task });
		expect(result.env.PIJ_SPAWN_TASK).toBe(task);
	});

	it("task with newlines and tabs survives env round-trip", () => {
		const task = "line one\nnewline here\ttab here";
		const result = buildSpawnCommand({ ...base, task });
		expect(result.env.PIJ_SPAWN_TASK).toBe(task);
	});

	it("task with shell metacharacters survives env round-trip", () => {
		const task = "do $(whoami) && rm -rf /; echo `id`";
		const result = buildSpawnCommand({ ...base, task });
		expect(result.env.PIJ_SPAWN_TASK).toBe(task);
	});

	it("omits PIJ_PANE_ID when paneId not given", () => {
		const result = buildSpawnCommand(base);
		expect(result.env).not.toHaveProperty("PIJ_PANE_ID");
	});

	it("sets PIJ_PANE_ID when paneId is provided (optional pass-through)", () => {
		const result = buildSpawnCommand({ ...base, paneId: "%42" });
		expect(result.env.PIJ_PANE_ID).toBe("%42");
	});

	it("omits PIJ_SPAWN_MODEL when model is not given (§H2)", () => {
		const result = buildSpawnCommand(base);
		expect(result.env).not.toHaveProperty("PIJ_SPAWN_MODEL");
	});

	it("sets PIJ_SPAWN_MODEL in env when model is given (§H2)", () => {
		const result = buildSpawnCommand({ ...base, model: "anthropic/claude-3-5-sonnet" });
		expect(result.env.PIJ_SPAWN_MODEL).toBe("anthropic/claude-3-5-sonnet");
	});

	it("PIJ_SPAWN_MODEL matches the --model argv value (both emitted together)", () => {
		const model = "openai/gpt-4o";
		const result = buildSpawnCommand({ ...base, model });
		expect(result.args).toContain(model); // --model argv
		expect(result.env.PIJ_SPAWN_MODEL).toBe(model); // env var
	});

	it("role 'parent' is passed through to PIJ_ROLE", () => {
		const result = buildSpawnCommand({ ...base, role: "parent" });
		expect(result.env.PIJ_ROLE).toBe("parent");
	});

	// ── --effort translation for pi: `:<level>` suffix on the model id (#3) ──────
	it("--effort with a model rides as a :<level> suffix on the pi model id", () => {
		const r = buildSpawnCommand({ ...base, model: "github-copilot/gpt-5.5", effort: "xhigh" });
		expect(r.args).toEqual(["--model", "github-copilot/gpt-5.5:xhigh"]);
		expect(r.env.PIJ_SPAWN_MODEL).toBe("github-copilot/gpt-5.5:xhigh");
		expect(r.env.PIJ_SPAWN_EFFORT).toBe("xhigh");
	});

	it("--effort without a model is a no-op for pi (nothing to suffix)", () => {
		const r = buildSpawnCommand({ ...base, effort: "high" });
		expect(r.args).toEqual([]);
		expect(r.env).not.toHaveProperty("PIJ_SPAWN_MODEL");
		expect(r.env.PIJ_SPAWN_EFFORT).toBe("high");
	});

	it("no --effort → model rides unchanged (default-to-agent)", () => {
		const r = buildSpawnCommand({ ...base, model: "fugu" });
		expect(r.args).toEqual(["--model", "fugu"]);
		expect(r.env.PIJ_SPAWN_MODEL).toBe("fugu");
		expect(r.env).not.toHaveProperty("PIJ_SPAWN_EFFORT");
	});
});

// ─── readyBody + parseReadyBody ──────────────────────────────────────────────

describe("readyBody + parseReadyBody round-trip", () => {
	it("round-trips a basic payload", () => {
		const body = readyBody("spawn-1", "gpt-4", "/tmp/project", "xhigh");
		const parsed = parseReadyBody(body);
		expect(parsed).toEqual({
			spawnId: "spawn-1",
			model: "gpt-4",
			effort: "xhigh",
			cwd: "/tmp/project",
		});
	});

	it("round-trips payload with slashes/dots in model name", () => {
		const body = readyBody("sid", "openai/gpt-4o-mini", "/path/with spaces/project");
		const parsed = parseReadyBody(body);
		expect(parsed).toEqual({
			spawnId: "sid",
			model: "openai/gpt-4o-mini",
			cwd: "/path/with spaces/project",
		});
	});

	it("keeps effort additive when parsing a legacy ready payload", () => {
		expect(
			parseReadyBody(JSON.stringify({ spawnId: "legacy", model: "gpt-4", cwd: "/repo" })),
		).toEqual({
			spawnId: "legacy",
			model: "gpt-4",
			cwd: "/repo",
		});
	});

	it("round-trips payload with unicode in cwd", () => {
		const body = readyBody("u1", "m", "/Users/café/proj");
		const parsed = parseReadyBody(body);
		expect(parsed?.cwd).toBe("/Users/café/proj");
	});

	it("parseReadyBody returns null for invalid JSON", () => {
		expect(parseReadyBody("not json")).toBeNull();
	});

	it("parseReadyBody returns null for empty string", () => {
		expect(parseReadyBody("")).toBeNull();
	});

	it("parseReadyBody returns null when spawnId missing", () => {
		expect(parseReadyBody(JSON.stringify({ model: "m", cwd: "/c" }))).toBeNull();
	});

	it("parseReadyBody returns null when model missing", () => {
		expect(parseReadyBody(JSON.stringify({ spawnId: "x", cwd: "/c" }))).toBeNull();
	});

	it("parseReadyBody returns null when cwd missing", () => {
		expect(parseReadyBody(JSON.stringify({ spawnId: "x", model: "m" }))).toBeNull();
	});

	it("parseReadyBody returns null when spawnId is not a string", () => {
		expect(parseReadyBody(JSON.stringify({ spawnId: 42, model: "m", cwd: "/c" }))).toBeNull();
	});

	it("parseReadyBody returns null for non-object JSON", () => {
		expect(parseReadyBody(JSON.stringify([1, 2, 3]))).toBeNull();
	});

	it("parseReadyBody returns null for null JSON", () => {
		expect(parseReadyBody("null")).toBeNull();
	});
});

// ─── Control plane (Plan 019) ────────────────────────────────────────────────

describe("spawnIdentitySeed", () => {
	it("is known before launch and deterministic for the same token+pid", () => {
		const a = spawnIdentitySeed("s1700000000000-0", 4242);
		const b = spawnIdentitySeed("s1700000000000-0", 4242);
		expect(a).toBe(b);
		expect(a).toContain("s1700000000000-0");
	});

	it("distinct spawn tokens yield distinct allocation seeds", () => {
		expect(spawnIdentitySeed("s1-0", 4242)).not.toBe(spawnIdentitySeed("s1-1", 4242));
	});
});

describe("buildControlSpawnCommand", () => {
	const base = { harness: "claude" as const, pijId: "pij-bright-otter", cwd: "/repo" };

	it("claude: cmd is 'claude', --dangerously-skip-permissions always (driven pane, no human to approve)", () => {
		const r = buildControlSpawnCommand(base);
		expect(r.cmd).toBe("claude");
		expect(r.args).toEqual(["--dangerously-skip-permissions"]);
	});

	it("emits --model after --skip-permissions as discrete argv (AC-09: no shell string)", () => {
		const r = buildControlSpawnCommand({ ...base, model: "claude-sonnet-4-6" });
		expect(r.args).toEqual(["--dangerously-skip-permissions", "--model", "claude-sonnet-4-6"]);
	});

	it("threads the pre-allocated id via PIJ_SESSION_ID + harness via PIJ_HARNESS", () => {
		const r = buildControlSpawnCommand(base);
		expect(r.env.PIJ_SESSION_ID).toBe("pij-bright-otter");
		expect(r.env.PIJ_HARNESS).toBe("claude");
	});

	it("omits PIJ_PARENT_ID when no parentId given (caller unresolved)", () => {
		expect(buildControlSpawnCommand(base).env).not.toHaveProperty("PIJ_PARENT_ID");
	});

	it("sets PIJ_PARENT_ID to the spawner id when parentId given (who spawned me)", () => {
		const r = buildControlSpawnCommand({ ...base, parentId: "pij-boss01" });
		expect(r.env.PIJ_PARENT_ID).toBe("pij-boss01");
		expect(r.env.PIJ_SESSION_ID).toBe("pij-bright-otter"); // self id unchanged
	});

	it("sets PIJ_SPAWN_TASK only when a task is given", () => {
		expect(buildControlSpawnCommand(base).env).not.toHaveProperty("PIJ_SPAWN_TASK");
		expect(buildControlSpawnCommand({ ...base, task: "review the diff" }).env.PIJ_SPAWN_TASK).toBe(
			"review the diff",
		);
	});

	it("copilot: cmd is 'copilot' with --yolo + --session-id (deterministic bind)", () => {
		const r = buildControlSpawnCommand({
			harness: "copilot",
			pijId: "pij-cop",
			cwd: "/repo",
			copilotSessionId: "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad",
		});
		expect(r.cmd).toBe("copilot");
		expect(r.args).toEqual(["--yolo", "--session-id", "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad"]);
		expect(r.env.PIJ_HARNESS).toBe("copilot");
		expect(r.env.PIJ_SESSION_ID).toBe("pij-cop");
	});

	it("copilot: --model rides after --session-id as discrete argv", () => {
		const r = buildControlSpawnCommand({
			harness: "copilot",
			pijId: "pij-cop",
			cwd: "/repo",
			copilotSessionId: "uuid-1",
			model: "gpt-5.5",
		});
		expect(r.args).toEqual(["--yolo", "--session-id", "uuid-1", "--model", "gpt-5.5"]);
	});

	it("claude --branch: --resume <from> --fork-session --session-id <new> after skip-permissions (AC-01)", () => {
		const r = buildControlSpawnCommand({
			...base,
			branchFrom: "claude-src",
			forkSessionId: "fork-uuid",
		});
		expect(r.args).toEqual([
			"--dangerously-skip-permissions",
			"--resume",
			"claude-src",
			"--fork-session",
			"--session-id",
			"fork-uuid",
		]);
	});

	it("claude --branch + --model: model rides last (fork onto another model)", () => {
		const r = buildControlSpawnCommand({
			...base,
			branchFrom: "claude-src",
			forkSessionId: "fork-uuid",
			model: "sonnet",
		});
		expect(r.args).toEqual([
			"--dangerously-skip-permissions",
			"--resume",
			"claude-src",
			"--fork-session",
			"--session-id",
			"fork-uuid",
			"--model",
			"sonnet",
		]);
	});

	it("no branchFrom → today's claude args are byte-identical (AC-05 regression)", () => {
		expect(buildControlSpawnCommand(base).args).toEqual(["--dangerously-skip-permissions"]);
	});

	// ─── codex arm (Plan 022, AC-01/05/07; Finding 05) ──────────────────────────
	it("codex: cmd is 'codex' with --dangerously-bypass-approvals-and-sandbox (driven pane, no human to approve)", () => {
		const r = buildControlSpawnCommand({ harness: "codex", pijId: "pij-cdx", cwd: "/repo" });
		expect(r.cmd).toBe("codex");
		expect(r.args).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
		expect(r.env.PIJ_HARNESS).toBe("codex");
		expect(r.env.PIJ_SESSION_ID).toBe("pij-cdx");
	});

	it("codex: --model rides after the bypass flag as discrete argv (AC-09: no shell string)", () => {
		const r = buildControlSpawnCommand({
			harness: "codex",
			pijId: "pij-cdx",
			cwd: "/repo",
			model: "gpt-5.5",
		});
		expect(r.args).toEqual(["--dangerously-bypass-approvals-and-sandbox", "--model", "gpt-5.5"]);
	});

	it("codex: sets PIJ_PARENT_ID when given; NEVER a deterministic --session-id (discovery-bound, AC-02/05)", () => {
		const r = buildControlSpawnCommand({
			harness: "codex",
			pijId: "pij-cdx",
			cwd: "/repo",
			parentId: "pij-boss",
			model: "o3",
		});
		expect(r.env.PIJ_PARENT_ID).toBe("pij-boss");
		expect(r.env.PIJ_SESSION_ID).toBe("pij-cdx");
		// codex auto-generates its UUID (F-01) — no --session-id like copilot.
		expect(r.args).not.toContain("--session-id");
	});

	it("codex: sets PIJ_SPAWN_TASK only when a task is given", () => {
		expect(
			buildControlSpawnCommand({ harness: "codex", pijId: "p", cwd: "/r" }).env,
		).not.toHaveProperty("PIJ_SPAWN_TASK");
		expect(
			buildControlSpawnCommand({ harness: "codex", pijId: "p", cwd: "/r", task: "go" }).env
				.PIJ_SPAWN_TASK,
		).toBe("go");
	});

	// ── --effort translation (#3) — per-harness flag drift pinned by exact argv ──
	it("claude: appends --effort <level> after the model (flag-drift pin)", () => {
		const r = buildControlSpawnCommand({ ...base, model: "sonnet", effort: "high" });
		expect(r.args).toEqual([
			"--dangerously-skip-permissions",
			"--model",
			"sonnet",
			"--effort",
			"high",
		]);
	});

	it("copilot: appends --effort <level> (same flag as claude)", () => {
		const r = buildControlSpawnCommand({
			harness: "copilot",
			pijId: "pij-cop",
			cwd: "/repo",
			copilotSessionId: "u",
			effort: "medium",
		});
		expect(r.args).toEqual(["--yolo", "--session-id", "u", "--effort", "medium"]);
	});

	it("codex: translates effort to -c model_reasoning_effort=<level> (no --effort flag)", () => {
		const r = buildControlSpawnCommand({
			harness: "codex",
			pijId: "pij-cdx",
			cwd: "/repo",
			effort: "xhigh",
		});
		expect(r.args).toEqual([
			"--dangerously-bypass-approvals-and-sandbox",
			"-c",
			"model_reasoning_effort=xhigh",
		]);
		expect(r.args).not.toContain("--effort");
	});

	it("unset effort → NO effort flag for any harness (default-to-agent)", () => {
		expect(buildControlSpawnCommand(base).args).not.toContain("--effort");
		expect(
			buildControlSpawnCommand({ harness: "codex", pijId: "p", cwd: "/r" }).args,
		).not.toContain("-c");
	});
});

describe("buildPendingDescriptor", () => {
	const input = {
		pijId: "pij-bright-otter",
		paneId: "%42",
		cwd: "/repo",
		harness: "claude" as const,
		dataDir: "/home/.pij/pij-bright-otter",
		eventsPath: "/home/.pij/pij-bright-otter/events.ndjson",
		pid: 4242,
		startedAtIso: "2026-06-27T00:00:00.000Z",
	};

	it("carries (id, paneId, cwd, harness) with lifecycle 'pending' (F2/AC-01)", () => {
		const d = buildPendingDescriptor(input);
		expect(d).toMatchObject({
			id: "pij-bright-otter",
			paneId: "%42",
			folder: "/repo",
			harness: "claude",
			lifecycle: "pending",
		});
	});

	it("is NOT yet bound — no harnessSessionId, no initInjectedAt", () => {
		const d = buildPendingDescriptor(input);
		expect(d.harnessSessionId).toBeUndefined();
		expect(d.initInjectedAt).toBeUndefined();
	});

	it("carries plannedHarnessSessionId for copilot (the daemon binds to it)", () => {
		const d = buildPendingDescriptor({
			...input,
			harness: "copilot",
			plannedHarnessSessionId: "uuid-9",
		});
		expect(d.plannedHarnessSessionId).toBe("uuid-9");
		// still pending until the daemon confirms ready + injects init.
		expect(d.lifecycle).toBe("pending");
		expect(d.harnessSessionId).toBeUndefined();
	});

	it("omits plannedHarnessSessionId for claude (discovery-bound)", () => {
		expect(buildPendingDescriptor(input)).not.toHaveProperty("plannedHarnessSessionId");
	});

	it("branched claude: carries plannedHarnessSessionId + branchedFrom, no transcriptsAtSpawn (AC-02)", () => {
		const d = buildPendingDescriptor({
			...input,
			plannedHarnessSessionId: "fork-uuid",
			branchedFrom: "claude-src",
		});
		expect(d.plannedHarnessSessionId).toBe("fork-uuid");
		expect(d.branchedFrom).toBe("claude-src");
		expect(d).not.toHaveProperty("transcriptsAtSpawn");
		expect(d.lifecycle).toBe("pending");
	});

	it("omits branchedFrom for a normal (non-branch) spawn", () => {
		expect(buildPendingDescriptor(input)).not.toHaveProperty("branchedFrom");
	});

	it("persists the pinned model + effort before first inference (registry truth)", () => {
		expect(
			buildPendingDescriptor({
				...input,
				model: "gpt-5.6-sol",
				effort: "xhigh",
			}),
		).toMatchObject({
			boundModel: "gpt-5.6-sol",
			effort: "xhigh",
		});
	});

	it("keeps model + effort additive for legacy/default spawns", () => {
		const descriptor = buildPendingDescriptor(input);
		expect(descriptor.boundModel).toBeUndefined();
		expect(descriptor.effort).toBeUndefined();
	});
});

describe("buildSpawnOutput", () => {
	it("reports pinned model + effort for a daemon-bound spawn", () => {
		expect(
			buildSpawnOutput({
				id: "pij-worker",
				paneId: "%42",
				harness: "copilot",
				lifecycle: "pending",
				model: "gpt-5.6-sol",
				effort: "xhigh",
			}),
		).toEqual({
			id: "pij-worker",
			paneId: "%42",
			harness: "copilot",
			lifecycle: "pending",
			model: "gpt-5.6-sol",
			effort: "xhigh",
		});
	});

	it("reports explicit nulls for a pi/default spawn whose id is assigned at boot", () => {
		expect(buildSpawnOutput({ paneId: "%43", harness: "pi" })).toEqual({
			id: null,
			paneId: "%43",
			harness: "pi",
			lifecycle: null,
			model: null,
			effort: null,
		});
	});
});

describe("parseCompactSelfArgs", () => {
	it("no args → uses the env pane, default 1500ms, no instruction", () => {
		expect(parseCompactSelfArgs([], "%72")).toEqual({ pane: "%72", delayMs: 1500 });
	});

	it("joins non-flag tokens into the instruction (unquoted multi-word works)", () => {
		expect(parseCompactSelfArgs(["resume", "the", "build"], "%72")).toEqual({
			pane: "%72",
			delayMs: 1500,
			instruction: "resume the build",
		});
	});

	it("--pane and --delay-ms override (space and = forms), instruction is the rest", () => {
		expect(parseCompactSelfArgs(["--pane", "%9", "--delay-ms", "2000", "go", "now"])).toEqual({
			pane: "%9",
			delayMs: 2000,
			instruction: "go now",
		});
		expect(parseCompactSelfArgs(["--pane=%9", "--delay-ms=800", "carry on"], "%72")).toEqual({
			pane: "%9",
			delayMs: 800,
			instruction: "carry on",
		});
	});

	it("ignores a non-numeric/negative delay (keeps the default)", () => {
		expect(parseCompactSelfArgs(["--delay-ms", "nope"], "%72").delayMs).toBe(1500);
		expect(parseCompactSelfArgs(["--delay-ms=-5"], "%72").delayMs).toBe(1500);
	});
});

describe("planControlSplit (default side stack, parity with pi)", () => {
	it("worker #1 → split the orchestrator pane right (~1/3 column)", () => {
		expect(planControlSplit("%72", [])).toEqual({
			ok: true,
			target: "%72",
			direction: "h",
			percent: 33,
		});
	});

	it("worker #2 → split worker-1's pane vertically (stacked below) + even out + pin width", () => {
		expect(planControlSplit("%72", ["%80"])).toEqual({
			ok: true,
			target: "%80",
			direction: "v",
			evenOut: true,
			columnPercent: 33,
		});
	});

	it("worker #3+ → appends below the NEWEST peer (uncapped, evened)", () => {
		expect(planControlSplit("%72", ["%80", "%81"])).toEqual({
			ok: true,
			target: "%81",
			direction: "v",
			evenOut: true,
			columnPercent: 33,
		});
		expect(planControlSplit("%72", ["%80", "%81", "%82", "%83"])).toEqual({
			ok: true,
			target: "%83",
			direction: "v",
			evenOut: true,
			columnPercent: 33,
		});
	});
});

describe("parseSpawnArgs (T018)", () => {
	it("parses --harness with --task/--model/--json (space and = forms)", () => {
		expect(parseSpawnArgs(["--harness", "claude", "--task", "review the diff"])).toEqual({
			ok: true,
			value: {
				harness: "claude",
				task: "review the diff",
				model: undefined,
				branch: false,
				json: false,
			},
		});
		expect(parseSpawnArgs(["--harness=claude", "--model=opus", "--json"])).toMatchObject({
			ok: true,
			value: { harness: "claude", model: "opus", json: true },
		});
	});

	it("accepts --branch as a boolean flag (default false)", () => {
		const off = parseSpawnArgs(["--harness", "claude"]);
		expect(off).toMatchObject({ ok: true, value: { branch: false } });
		const on = parseSpawnArgs(["--harness", "claude", "--branch"]);
		expect(on).toMatchObject({ ok: true, value: { harness: "claude", branch: true } });
		// --branch composes with --model (fork onto another model)
		expect(parseSpawnArgs(["--harness", "claude", "--branch", "--model", "sonnet"])).toMatchObject({
			ok: true,
			value: { harness: "claude", branch: true, model: "sonnet" },
		});
	});

	it("accepts pi (Plan 021 — uniform spawn surface), requires --harness, rejects unknown", () => {
		expect(parseSpawnArgs([])).toMatchObject({ ok: false, code: "E-ARG" });
		// pi is now a first-class spawnable harness (was rejected pre-021).
		expect(parseSpawnArgs(["--harness", "pi"])).toMatchObject({
			ok: true,
			value: { harness: "pi", branch: false },
		});
		expect(
			parseSpawnArgs(["--harness", "pi", "--task", "review the diff", "--model", "@preset/glm-1m"]),
		).toMatchObject({
			ok: true,
			value: { harness: "pi", task: "review the diff", model: "@preset/glm-1m" },
		});
		expect(parseSpawnArgs(["--harness", "bogus"])).toMatchObject({ ok: false, code: "E-ARG" });
	});

	it("accepts codex (Plan 022 — 4th spawnable harness)", () => {
		expect(parseSpawnArgs(["--harness", "codex"])).toMatchObject({
			ok: true,
			value: { harness: "codex", branch: false },
		});
		expect(parseSpawnArgs(["--harness=codex", "--model=gpt-5.5"])).toMatchObject({
			ok: true,
			value: { harness: "codex", model: "gpt-5.5" },
		});
	});

	it("rejects unknown flags and missing values", () => {
		expect(parseSpawnArgs(["--harness", "claude", "--nope", "x"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseSpawnArgs(["--harness"])).toMatchObject({ ok: false, code: "E-ARG" });
	});

	it("parses --effort (space and = forms); unset → effort undefined (#3, AC-04)", () => {
		expect(parseSpawnArgs(["--harness", "claude", "--effort", "high"])).toMatchObject({
			ok: true,
			value: { harness: "claude", effort: "high" },
		});
		expect(parseSpawnArgs(["--harness=codex", "--effort=xhigh"])).toMatchObject({
			ok: true,
			value: { harness: "codex", effort: "xhigh" },
		});
		const unset = parseSpawnArgs(["--harness", "claude"]);
		expect(unset.ok).toBe(true);
		if (unset.ok) expect(unset.value.effort).toBeUndefined();
	});
});

describe("buildEffortWarning (warn-don't-block vs a model's levels, #3)", () => {
	const KNOWN: ModelEntry[] = [
		{
			id: "fugu",
			name: "Sakana Fugu",
			provider: "sakana",
			verified: true,
			reasoning: true,
			levels: ["high", "xhigh"],
		},
	];

	it("returns null when effort is supported / unset / model unknown", () => {
		expect(buildEffortWarning("high", "fugu", KNOWN)).toBeNull();
		expect(buildEffortWarning(undefined, "fugu", KNOWN)).toBeNull();
		expect(buildEffortWarning("high", "unknown-model", KNOWN)).toBeNull();
	});

	it("warns (never throws) when effort is unsupported, listing the model's levels", () => {
		const w = buildEffortWarning("medium", "fugu", KNOWN);
		expect(w).toMatch(/medium/);
		expect(w).toMatch(/high/);
	});
});

describe("livePeerPanes (shared split-cap input, Plan 021)", () => {
	const d = (paneId: string | undefined, harness: HarnessKind): SessionDescriptor =>
		({ paneId, harness }) as SessionDescriptor;

	it("counts EVERY live peer pane in the window regardless of harness (the asymmetry fix)", () => {
		// A pi pane and a claude pane both count toward the same main+2 cap. A mutation
		// re-introducing a `harness === claude|copilot` filter would drop the pi pane
		// and flip this assertion RED.
		const descriptors = [d("%2", "claude"), d("%3", "pi"), d("%4", "copilot")];
		const windowPanes = ["%1", "%2", "%3", "%4"];
		expect(livePeerPanes(descriptors, windowPanes, "%1")).toEqual(["%2", "%3", "%4"]);
	});

	it("excludes own pane, dead/closed panes (not in windowPanes), and paneless descriptors", () => {
		const descriptors = [
			d("%1", "pi"), // own pane → excluded
			d("%9", "claude"), // not in windowPanes (closed) → excluded
			d(undefined, "pi"), // no paneId → excluded
			d("%2", "pi"), // live peer → kept
		];
		expect(livePeerPanes(descriptors, ["%1", "%2"], "%1")).toEqual(["%2"]);
	});

	it("dedupes repeated pane ids", () => {
		expect(livePeerPanes([d("%2", "pi"), d("%2", "claude")], ["%1", "%2"], "%1")).toEqual(["%2"]);
	});
});

describe("planBranch (branch-from-self gating, Plan 020)", () => {
	const supports = (h: HarnessKind) => h === "claude";
	const boundSelf = (over: Partial<SessionDescriptor> = {}): SessionDescriptor => ({
		id: "pij-me",
		folder: "/repo",
		dataDir: "/d",
		eventsPath: "/e",
		pid: 1,
		startedAt: "2026-06-28T00:00:00.000Z",
		harness: "claude",
		harnessSessionId: "claude-self",
		lifecycle: "bound",
		...over,
	});

	it("bound same-harness claude → ok {from: self's harnessSessionId, newSessionId}", () => {
		expect(planBranch("claude", boundSelf(), supports, "new-uuid")).toEqual({
			ok: true,
			value: { from: "claude-self", newSessionId: "new-uuid" },
		});
	});

	it("unsupported harness (copilot today) → E-BRANCH (AC-04)", () => {
		expect(planBranch("copilot", boundSelf({ harness: "copilot" }), supports, "u")).toMatchObject({
			ok: false,
			code: "E-BRANCH",
		});
	});

	it("pi can spawn (Plan 021) but cannot fork → E-BRANCH (the bin mirrors this guard)", () => {
		expect(
			planBranch("pi", boundSelf({ harness: "pi", harnessSessionId: "pi-self" }), supports, "u"),
		).toMatchObject({ ok: false, code: "E-BRANCH" });
	});

	it("codex can spawn (Plan 022) but cannot fork-from-self → E-BRANCH (AC-07)", () => {
		expect(
			planBranch("codex", boundSelf({ harness: "codex", harnessSessionId: "x" }), supports, "u"),
		).toMatchObject({ ok: false, code: "E-BRANCH" });
	});

	it("caller unresolved (self null) → E-BRANCH (AC-04)", () => {
		expect(planBranch("claude", null, supports, "u")).toMatchObject({
			ok: false,
			code: "E-BRANCH",
		});
	});

	it("harness mismatch (caller copilot, spawning claude) → E-BRANCH (AC-04)", () => {
		expect(
			planBranch("claude", boundSelf({ harness: "copilot", harnessSessionId: "x" }), supports, "u"),
		).toMatchObject({ ok: false, code: "E-BRANCH" });
	});

	it("caller not bound (no harnessSessionId) → E-BRANCH (AC-04)", () => {
		const r = planBranch("claude", boundSelf({ harnessSessionId: undefined }), supports, "u");
		expect(r).toMatchObject({ ok: false, code: "E-BRANCH" });
		if (!r.ok) expect(r.message).toMatch(/not bound/i);
	});
});

describe("parseAdoptArgs (T023)", () => {
	it("parses <pane> + --harness + optional --id/--session-id/--json", () => {
		expect(parseAdoptArgs(["%72", "--harness", "claude"])).toEqual({
			ok: true,
			value: {
				pane: "%72",
				harness: "claude",
				id: undefined,
				sessionId: undefined,
				json: false,
			},
		});
		expect(
			parseAdoptArgs(["%5", "--harness=claude", "--id=pij-x", "--session-id=native-x", "--json"]),
		).toMatchObject({
			ok: true,
			value: {
				pane: "%5",
				harness: "claude",
				id: "pij-x",
				sessionId: "native-x",
				json: true,
			},
		});
	});

	it("rejects a missing --session-id value instead of consuming the next flag", () => {
		expect(parseAdoptArgs(["%7", "--harness", "claude", "--session-id", "--json"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
	});

	it("requires a %N pane and a harness", () => {
		expect(parseAdoptArgs(["--harness", "claude"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseAdoptArgs(["notapane", "--harness", "claude"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseAdoptArgs(["%72"])).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("aliasAgentSpawnArgs — `pij spawn --agent` forwards to `pij agent spawn`", () => {
	it("returns null when --agent is absent (a normal colleague spawn)", () => {
		expect(aliasAgentSpawnArgs(["--harness", "claude", "--model", "sonnet"])).toBeNull();
	});

	it("puts the slug first and forwards every other flag verbatim", () => {
		expect(
			aliasAgentSpawnArgs([
				"--agent",
				"flowspace-search",
				"-p",
				"query=x",
				"--once",
				"--model",
				"sonnet",
			]),
		).toEqual(["spawn", "flowspace-search", "-p", "query=x", "--once", "--model", "sonnet"]);
	});

	it("supports the --agent=<slug> inline form", () => {
		expect(aliasAgentSpawnArgs(["--agent=my-pack", "-p", "q=1"])).toEqual([
			"spawn",
			"my-pack",
			"-p",
			"q=1",
		]);
	});
});

// ─── FX001-3 / SUGG-001: explicit placement ──────────────────────────────────
describe("planPlacement", () => {
	it("undefined layout defaults to the side stack (uncapped)", () => {
		expect(planPlacement(undefined, "%1", [])).toEqual({
			ok: true,
			target: "%1",
			direction: "h",
			percent: 33,
		});
		expect(planPlacement(undefined, "%1", ["%2"])).toEqual({
			ok: true,
			target: "%2",
			direction: "v",
			evenOut: true,
			columnPercent: 33,
		});
		expect(planPlacement(undefined, "%1", ["%2", "%3", "%4"])).toEqual({
			ok: true,
			target: "%4",
			direction: "v",
			evenOut: true,
			columnPercent: 33,
		});
	});
	it("explicit 'stack' is the same as the default", () => {
		expect(planPlacement("stack", "%1", ["%2", "%3"])).toEqual(
			planPlacement(undefined, "%1", ["%2", "%3"]),
		);
	});
	it("right/below split the CALLER's pane", () => {
		expect(planPlacement("right", "%1", ["%2"])).toEqual({
			ok: true,
			target: "%1",
			direction: "h",
			percent: 40,
		});
		expect(planPlacement("below", "%1", [])).toEqual({ ok: true, target: "%1", direction: "v" });
	});
	it("right/below still honour the main+2 cap", () => {
		const r = planPlacement("right", "%1", ["%2", "%3"]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-FULL");
	});
	it("window is cap-exempt", () => {
		expect(planPlacement("window", "%1", ["%2", "%3"])).toEqual({ ok: true, window: true });
	});
});

describe("parseSpawnArgs --layout", () => {
	it("accepts stack|right|below|window", () => {
		const r = parseSpawnArgs(["--harness", "claude", "--layout", "window"]);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.layout).toBe("window");
		const s = parseSpawnArgs(["--harness", "claude", "--layout", "stack"]);
		expect(s.ok).toBe(true);
		if (s.ok) expect(s.value.layout).toBe("stack");
	});
	it("rejects an unknown layout", () => {
		const r = parseSpawnArgs(["--harness", "claude", "--layout", "floating"]);
		expect(r.ok).toBe(false);
	});
});
