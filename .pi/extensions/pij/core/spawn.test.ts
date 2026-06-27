// pij-messaging — spawn builder + ready-body codec tests (AC-02 / AC-09).
//
// Covers: model ±, task ± (incl. special chars / quotes / newlines),
// paneId ±, required env vars, argv array shape, ready-body round-trip.

import { describe, expect, it } from "vitest";

import {
	allocatePijId,
	buildControlSpawnCommand,
	buildPendingDescriptor,
	buildSpawnCommand,
	parseAdoptArgs,
	parseReadyBody,
	parseSpawnArgs,
	readyBody,
} from "./spawn.js";

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
});

// ─── readyBody + parseReadyBody ──────────────────────────────────────────────

describe("readyBody + parseReadyBody round-trip", () => {
	it("round-trips a basic payload", () => {
		const body = readyBody("spawn-1", "gpt-4", "/tmp/project");
		const parsed = parseReadyBody(body);
		expect(parsed).toEqual({ spawnId: "spawn-1", model: "gpt-4", cwd: "/tmp/project" });
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

describe("allocatePijId", () => {
	it("is known BEFORE launch and deterministic for the same token+pid (AC-01)", () => {
		const a = allocatePijId("s1700000000000-0", 4242);
		const b = allocatePijId("s1700000000000-0", 4242);
		expect(a).toBe(b);
		expect(a).toMatch(/^pij-/);
	});

	it("distinct spawn tokens yield distinct ids", () => {
		expect(allocatePijId("s1-0", 4242)).not.toBe(allocatePijId("s1-1", 4242));
	});
});

describe("buildControlSpawnCommand", () => {
	const base = { harness: "claude" as const, pijId: "pij-abc", cwd: "/repo" };

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
		expect(r.env.PIJ_SESSION_ID).toBe("pij-abc");
		expect(r.env.PIJ_HARNESS).toBe("claude");
	});

	it("sets PIJ_SPAWN_TASK only when a task is given", () => {
		expect(buildControlSpawnCommand(base).env).not.toHaveProperty("PIJ_SPAWN_TASK");
		expect(buildControlSpawnCommand({ ...base, task: "review the diff" }).env.PIJ_SPAWN_TASK).toBe(
			"review the diff",
		);
	});
});

describe("buildPendingDescriptor", () => {
	const input = {
		pijId: "pij-abc",
		paneId: "%42",
		cwd: "/repo",
		harness: "claude" as const,
		dataDir: "/home/.pij/pij-abc",
		eventsPath: "/home/.pij/pij-abc/events.ndjson",
		pid: 4242,
		startedAtIso: "2026-06-27T00:00:00.000Z",
	};

	it("carries (id, paneId, cwd, harness) with lifecycle 'pending' (F2/AC-01)", () => {
		const d = buildPendingDescriptor(input);
		expect(d).toMatchObject({
			id: "pij-abc",
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
});

describe("parseSpawnArgs (T018)", () => {
	it("parses --harness with --task/--model/--json (space and = forms)", () => {
		expect(parseSpawnArgs(["--harness", "claude", "--task", "review the diff"])).toEqual({
			ok: true,
			value: { harness: "claude", task: "review the diff", model: undefined, json: false },
		});
		expect(parseSpawnArgs(["--harness=claude", "--model=opus", "--json"])).toMatchObject({
			ok: true,
			value: { harness: "claude", model: "opus", json: true },
		});
	});

	it("requires --harness and rejects pi / unknown harnesses (pi uses pij_spawn)", () => {
		expect(parseSpawnArgs([])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseSpawnArgs(["--harness", "pi"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseSpawnArgs(["--harness", "bogus"])).toMatchObject({ ok: false, code: "E-ARG" });
	});

	it("rejects unknown flags and missing values", () => {
		expect(parseSpawnArgs(["--harness", "claude", "--nope", "x"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseSpawnArgs(["--harness"])).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("parseAdoptArgs (T023)", () => {
	it("parses <pane> + --harness + optional --id/--json", () => {
		expect(parseAdoptArgs(["%72", "--harness", "claude"])).toEqual({
			ok: true,
			value: { pane: "%72", harness: "claude", id: undefined, json: false },
		});
		expect(parseAdoptArgs(["%5", "--harness=claude", "--id=pij-x", "--json"])).toMatchObject({
			ok: true,
			value: { pane: "%5", harness: "claude", id: "pij-x", json: true },
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
