// pij-messaging — spawn builder + ready-body codec tests (AC-02 / AC-09).
//
// Covers: model ±, task ± (incl. special chars / quotes / newlines),
// paneId ±, required env vars, argv array shape, ready-body round-trip.

import { describe, expect, it } from "vitest";

import { buildSpawnCommand, parseReadyBody, readyBody } from "./spawn.js";

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
