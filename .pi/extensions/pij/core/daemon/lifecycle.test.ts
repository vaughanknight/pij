import { describe, expect, it } from "vitest";

import { daemonStatus, needsAutoStart, planStop } from "./lifecycle.js";
import type { LockFile } from "./lock.js";

const lock = (over: Partial<LockFile> = {}): LockFile => ({
	pid: 4242,
	startedAt: "2026-06-27T00:00:00.000Z",
	...over,
});

describe("daemonStatus", () => {
	it("no lock → absent", () => {
		expect(daemonStatus(null, () => true)).toEqual({ kind: "absent" });
	});

	it("lock + holder alive → running (carries the owned window)", () => {
		expect(daemonStatus(lock({ window: "@5" }), () => true)).toEqual({
			kind: "running",
			pid: 4242,
			window: "@5",
		});
	});

	it("running without an owned window omits it (human-started daemon)", () => {
		expect(daemonStatus(lock(), () => true)).toEqual({ kind: "running", pid: 4242 });
	});

	it("lock + holder dead → stale", () => {
		expect(daemonStatus(lock(), () => false)).toEqual({ kind: "stale", pid: 4242 });
	});
});

describe("needsAutoStart", () => {
	it("only a running daemon suppresses auto-start", () => {
		expect(needsAutoStart({ kind: "running", pid: 1 })).toBe(false);
		expect(needsAutoStart({ kind: "stale", pid: 1 })).toBe(true);
		expect(needsAutoStart({ kind: "absent" })).toBe(true);
	});
});

describe("planStop", () => {
	it("absent → nothing", () => {
		expect(planStop({ kind: "absent" })).toEqual({ kind: "nothing" });
	});

	it("stale → cleanup (clear the lock, no signal)", () => {
		expect(planStop({ kind: "stale", pid: 4242 })).toEqual({ kind: "cleanup", pid: 4242 });
	});

	it("running with an owned window → kill pid AND window", () => {
		expect(planStop({ kind: "running", pid: 4242, window: "@5" })).toEqual({
			kind: "kill",
			pid: 4242,
			window: "@5",
		});
	});

	it("running without an owned window → kill pid only (never a human's window)", () => {
		expect(planStop({ kind: "running", pid: 4242 })).toEqual({ kind: "kill", pid: 4242 });
	});
});
