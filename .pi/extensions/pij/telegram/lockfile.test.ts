// pij-telegram — single-instance lockfile tests (Plan Phase 3 / Finding 04; AC-09).
//
// The decision (acquire / refuse a live holder / reclaim a dead one / release) is
// exercised against a REAL lockfile in a tmp dir with an INJECTED liveness probe, so
// no actual processes are spawned — a "process-sim" test, the same shape the daemon
// lock decision uses.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, parseLock, readLockPid, releaseLock } from "./lockfile.js";

let home: string;
let lockPath: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-tg-lock-"));
	lockPath = join(home, "pij-telegram.lock");
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

const opts = (pid: number, isAlive: (p: number) => boolean) => ({
	pid,
	startedAt: "2026-06-29T12:00:00.000Z",
	isAlive,
});

describe("acquireLock", () => {
	it("acquires a free lock and writes our pid", () => {
		const res = acquireLock(
			lockPath,
			opts(4242, () => false),
		);
		expect(res.kind).toBe("acquired");
		expect(existsSync(lockPath)).toBe(true);
		expect(readLockPid(lockPath)).toBe(4242);
	});

	it("refuses a second acquire while a live process holds the lock", () => {
		acquireLock(
			lockPath,
			opts(100, () => true),
		);
		const second = acquireLock(
			lockPath,
			opts(200, (p) => p === 100),
		);
		expect(second).toEqual({ kind: "refused", holderPid: 100 });
		expect(readLockPid(lockPath)).toBe(100); // holder's lock is left intact
	});

	it("reclaims a stale lock whose holder is dead", () => {
		writeFileSync(lockPath, JSON.stringify({ pid: 999999, startedAt: "old" }));
		const res = acquireLock(
			lockPath,
			opts(4242, (p) => p !== 999999),
		);
		expect(res.kind).toBe("acquired");
		expect(readLockPid(lockPath)).toBe(4242); // stolen + rewritten to us
	});

	it("reclaims a corrupt lockfile", () => {
		writeFileSync(lockPath, "{ not json");
		const res = acquireLock(
			lockPath,
			opts(4242, () => true),
		);
		expect(res.kind).toBe("acquired");
		expect(readLockPid(lockPath)).toBe(4242);
	});

	it("re-acquires our own lock (re-entrant)", () => {
		acquireLock(
			lockPath,
			opts(4242, () => true),
		);
		const again = acquireLock(
			lockPath,
			opts(4242, () => true),
		);
		expect(again.kind).toBe("acquired");
	});
});

describe("releaseLock", () => {
	it("release() from the acquire removes the lock", () => {
		const res = acquireLock(
			lockPath,
			opts(4242, () => false),
		);
		expect(res.kind).toBe("acquired");
		if (res.kind === "acquired") res.release();
		expect(existsSync(lockPath)).toBe(false);
	});

	it("never clobbers a successor's lock (pid mismatch)", () => {
		writeFileSync(lockPath, JSON.stringify({ pid: 555, startedAt: "x" }));
		releaseLock(lockPath, 4242); // we are not 555 → must NOT delete
		expect(readLockPid(lockPath)).toBe(555);
	});

	it("is idempotent on an absent lock", () => {
		expect(() => releaseLock(lockPath, 4242)).not.toThrow();
	});
});

describe("parseLock / readLockPid", () => {
	it("parses a well-formed lock", () => {
		expect(parseLock(JSON.stringify({ pid: 7, startedAt: "t" }))).toEqual({
			pid: 7,
			startedAt: "t",
		});
	});

	it("returns null for absent / corrupt / wrong-shape content", () => {
		expect(parseLock(null)).toBeNull();
		expect(parseLock("{bad")).toBeNull();
		expect(parseLock(JSON.stringify({ startedAt: "t" }))).toBeNull();
	});

	it("readLockPid returns null when the file is missing", () => {
		expect(readLockPid(join(home, "nope.lock"))).toBeNull();
	});

	it("round-trips a pid written to disk", () => {
		writeFileSync(lockPath, JSON.stringify({ pid: 31337, startedAt: "t" }));
		expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(31337);
		expect(readLockPid(lockPath)).toBe(31337);
	});
});
