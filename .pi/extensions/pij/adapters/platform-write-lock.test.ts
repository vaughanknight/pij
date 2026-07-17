// pij platform — FsPlatformWriteLock adapter specs (review 002 G2/G3).
// Pins: the held operation runs exactly once and its value comes back ok;
// the lock file exists ONLY while held and lives strictly below spine/;
// a held lock times out E-NOREG with the manual-removal diagnostic and is
// NEVER stolen no matter how old (G1 policy); token-checked release never
// deletes a successor's lock; throws propagate with the lock released.

import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsRegistry } from "./fs-registry.js";
import { FsPlatformWriteLock } from "./platform-write-lock.js";

describe("FsPlatformWriteLock", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-writelock-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	const lockFile = () => join(home, "spine", "write.lock");

	it("runs the operation once, returns its value ok, and releases the lock", () => {
		const lock = new FsPlatformWriteLock(home);
		let runs = 0;
		const result = lock.withPlatformWriteLock(() => {
			runs += 1;
			// The lock is held DURING the operation…
			expect(existsSync(lockFile())).toBe(true);
			return "payload";
		});
		expect(result).toMatchObject({ ok: true, value: "payload" });
		expect(runs).toBe(1);
		// …and gone afterwards.
		expect(existsSync(lockFile())).toBe(false);
	});

	it("a held lock times out E-NOREG with the manual-removal diagnostic; the operation NEVER runs", () => {
		const lock = new FsPlatformWriteLock(home, { lockBudgetMs: 60 });
		const holder = new FsPlatformWriteLock(home);
		const acquiredElsewhere = holder.withPlatformWriteLock(() => {
			const result = lock.withPlatformWriteLock(() => "never");
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) {
				expect(result.message).toContain("write.lock");
				expect(result.message).toMatch(/never stolen/i);
				expect(result.message).toMatch(/remove/i);
			}
			return "held";
		});
		expect(acquiredElsewhere).toMatchObject({ ok: true, value: "held" });
	});

	it("an AGED lock is never stolen: timeout E-NOREG and the holder's lock survives byte-identical (G1 policy)", () => {
		const lock = new FsPlatformWriteLock(home, { lockBudgetMs: 60 });
		// Force the spine dir into existence, then plant an old lock.
		expect(lock.withPlatformWriteLock(() => 0)).toMatchObject({ ok: true, value: 0 });
		writeFileSync(lockFile(), "live-holder-token\n");
		const agedSec = (Date.now() - 60_000) / 1000;
		utimesSync(lockFile(), agedSec, agedSec);
		const result = lock.withPlatformWriteLock(() => "never");
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(readFileSync(lockFile(), "utf8")).toBe("live-holder-token\n");
		expect(readdirSync(join(home, "spine")).filter((n) => n.includes(".steal."))).toEqual([]);
	});

	it("token-checked release: a lock REPLACED during the operation is not deleted", () => {
		const lock = new FsPlatformWriteLock(home);
		const result = lock.withPlatformWriteLock(() => {
			// A human unwedged (removed our lock) and a successor acquired.
			rmSync(lockFile());
			writeFileSync(lockFile(), "successor-token\n");
			return "done";
		});
		expect(result).toMatchObject({ ok: true, value: "done" });
		expect(readFileSync(lockFile(), "utf8")).toBe("successor-token\n");
	});

	it("throws from the operation PROPAGATE (dispatch containment owns them) with the lock released", () => {
		const lock = new FsPlatformWriteLock(home);
		expect(() =>
			lock.withPlatformWriteLock(() => {
				throw new Error("boom");
			}),
		).toThrow("boom");
		expect(existsSync(lockFile())).toBe(false);
	});

	it("keeps every write below spine/ — nothing at the top of pijHome, no phantom peers", () => {
		const lock = new FsPlatformWriteLock(home);
		expect(lock.withPlatformWriteLock(() => 1)).toMatchObject({ ok: true, value: 1 });
		expect(readdirSync(home)).toEqual(["spine"]);
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});
