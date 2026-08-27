import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	reclaimIfDead,
	releaseHeldLocks,
	trackHeldLock,
} from "./lock-reclaim.js";

describe("lock reclaim", () => {
	let home: string;
	let lockFile: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-lock-reclaim-"));
		lockFile = join(home, "test.lock");
	});

	afterEach(() => {
		releaseHeldLocks();
		rmSync(home, { recursive: true, force: true });
	});

	it("reclaims both legacy string and descriptor JSON locks from dead pids", () => {
		for (const [raw, layer] of [
			["12345:legacy-token\n", "write.lock"],
			[JSON.stringify({ pid: 12345, token: "descriptor-token" }), "descriptor.lock"],
		] as const) {
			writeFileSync(lockFile, raw);
			expect(reclaimIfDead(lockFile, layer, { isAlive: () => false })).toMatchObject({
				layer,
				pid: 12345,
				reason: "dead-pid",
			});
			expect(existsSync(lockFile)).toBe(false);
		}
	});

	it("never steals a lock whose live process started before the lock", () => {
		writeFileSync(lockFile, "23456:live-token\n");
		const lockedAtMs = Date.now();
		utimesSync(lockFile, lockedAtMs / 1000, lockedAtMs / 1000);

		expect(
			reclaimIfDead(lockFile, "events.lock", {
				isAlive: () => true,
				processStartedAtMs: () => lockedAtMs - 5_000,
			}),
		).toBeNull();
		expect(readFileSync(lockFile, "utf8")).toBe("23456:live-token\n");
	});

	it("reclaims a recycled pid only when its process started after the lock", () => {
		writeFileSync(lockFile, "34567:old-token\n");
		const lockedAtMs = Date.now() - 10_000;
		utimesSync(lockFile, lockedAtMs / 1000, lockedAtMs / 1000);

		expect(
			reclaimIfDead(lockFile, "events.lock", {
				isAlive: () => true,
				processStartedAtMs: () => lockedAtMs + 5_000,
			}),
		).toMatchObject({
			layer: "events.lock",
			pid: 34567,
			reason: "pid-reused",
		});
		expect(existsSync(lockFile)).toBe(false);
	});

	it("graceful release removes only the still-owned token", () => {
		writeFileSync(lockFile, "ours");
		trackHeldLock(lockFile, "ours");
		releaseHeldLocks();
		expect(existsSync(lockFile)).toBe(false);

		writeFileSync(lockFile, "successor");
		trackHeldLock(lockFile, "ours");
		releaseHeldLocks();
		expect(readFileSync(lockFile, "utf8")).toBe("successor");
	});
});
