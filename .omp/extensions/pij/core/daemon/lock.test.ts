import { describe, expect, it } from "vitest";

import { evaluateLock, type LockFile, parseLockFile, serializeLockFile } from "./lock.js";

const lock = (pid: number): LockFile => ({ pid, startedAt: "2026-06-27T00:00:00.000Z" });

describe("parseLockFile", () => {
	it("round-trips a valid lock", () => {
		expect(parseLockFile(serializeLockFile(lock(42)))).toEqual(lock(42));
	});
	it("returns null for absent or corrupt content", () => {
		expect(parseLockFile(null)).toBeNull();
		expect(parseLockFile("not json")).toBeNull();
		expect(parseLockFile(JSON.stringify({ pid: "x" }))).toBeNull();
	});
});

describe("evaluateLock (single-instance, AC-10)", () => {
	const aliveOnly =
		(...pids: number[]) =>
		(pid: number) =>
			pids.includes(pid);

	it("no lock → acquire", () => {
		expect(evaluateLock(null, aliveOnly(), 1000)).toEqual({ kind: "acquire" });
	});

	it("a live holder → refuse (no second injector)", () => {
		expect(evaluateLock(lock(2000), aliveOnly(2000), 1000)).toEqual({
			kind: "refuse",
			holderPid: 2000,
		});
	});

	it("a dead holder → reclaim the stale lock", () => {
		expect(evaluateLock(lock(2000), aliveOnly(/* 2000 not alive */), 1000)).toEqual({
			kind: "reclaim",
			stalePid: 2000,
		});
	});

	it("our own pid → acquire (re-entrant)", () => {
		expect(evaluateLock(lock(1000), aliveOnly(1000), 1000)).toEqual({ kind: "acquire" });
	});
});
