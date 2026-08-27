// pij platform — fs PlatformWriteLockPort adapter (review 002 G2/G3).
//
// ONE machine-wide lock file at `<pijHome>/spine/write.lock` (strictly below
// spine/ — Finding 01, phantom-peer law) held across an ENTIRE coupled
// platform write: recover → journal intent → state write → committed flip →
// spine append → clear. That serialization is what makes intent-phase
// recovery SOUND: an intent entry observed under this lock belongs to a
// crashed or aborted writer, never a live one mid-window, so discarding an
// abandoned intent cannot strip a live writer of its crash protection.
//
// Acquisition is exclusive-create (openSync "wx") with an ownership token and
// a retry budget. A shared pid/start-time decision reclaims a dead holder or a
// pid reused by a process born after the lock; a live original holder is NEVER
// stolen, regardless of mtime. Throws from the held operation PROPAGATE after
// the lock is released — the CLI dispatch containment gate owns them and names
// the verb.

import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlatformWriteLockPort } from "../core/platform/ports.js";
import { err, ok, type Result } from "../core/types.js";
import {
	type LockReclaimNote,
	reclaimIfDead,
	releaseOwnedLock,
	trackHeldLock,
} from "./lock-reclaim.js";

/** Total lock-acquisition budget before a write gives up with E-NOREG. Wider
 *  than the spine events.lock budget: this lock nests OUTSIDE it and a held
 *  operation may legitimately wait out that inner budget. */
const LOCK_BUDGET_MS = 5000;
/** Pause between lock-acquisition retries. */
const LOCK_RETRY_MS = 5;

/** Synchronous sleep with no busy loop: Atomics.wait on a throwaway buffer. */
function sleepMs(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

interface PlatformWriteLockOptions {
	readonly lockBudgetMs?: number;
	readonly isAlive?: (pid: number) => boolean;
	readonly processStartedAtMs?: (pid: number) => number | undefined;
	readonly onReclaim?: (note: LockReclaimNote) => void;
}

export class FsPlatformWriteLock implements PlatformWriteLockPort {
	private readonly dir: string;
	private readonly lockFile: string;
	private readonly lockBudgetMs: number;
	private readonly options: PlatformWriteLockOptions;

	constructor(pijHome: string, options: PlatformWriteLockOptions = {}) {
		this.dir = join(pijHome, "spine");
		this.lockFile = join(this.dir, "write.lock");
		this.lockBudgetMs = options.lockBudgetMs ?? LOCK_BUDGET_MS;
		this.options = options;
	}

	withPlatformWriteLock<T>(operation: () => T): Result<T> {
		const acquired = this.acquireLock();
		if (!acquired.ok) return acquired;
		try {
			return ok(operation());
		} finally {
			this.releaseLock(acquired.value);
		}
	}

	/** Remove `write.lock` ONLY while it still carries OUR token: after a
	 *  manual unwedge a successor's LIVE lock may sit at this path, and
	 *  deleting it would cascade another writer into the critical section. */
	private releaseLock(token: string): void {
		releaseOwnedLock(this.lockFile, token);
	}

	/** Exclusive-create acquisition with retry. Dead/reused owners are reclaimed;
	 *  live original owners are never stolen. */
	private acquireLock(): Result<string> {
		try {
			mkdirSync(this.dir, { recursive: true });
		} catch (error) {
			return err("E-NOREG", `cannot create spine dir ${this.dir}: ${String(error)}`);
		}
		const deadline = Date.now() + this.lockBudgetMs;
		for (;;) {
			let fd: number | undefined;
			try {
				fd = openSync(this.lockFile, "wx");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
					return err(
						"E-NOREG",
						`cannot create platform write lock ${this.lockFile}: ${String(error)}`,
					);
				}
				const reclaimed = reclaimIfDead(this.lockFile, "write.lock", this.options);
				if (reclaimed !== null) {
					this.options.onReclaim?.(reclaimed);
					continue;
				}
			}
			if (fd !== undefined) {
				const token = `${process.pid}:${randomUUID()}\n`;
				try {
					writeFileSync(fd, token);
				} catch (error) {
					// Without the token on disk this lock could never be released
					// safely — back out rather than wedge every writer.
					try {
						closeSync(fd);
					} catch {
						// fd is abandoned either way
					}
					try {
						rmSync(this.lockFile, { force: true });
					} catch {
						// our own just-created lock; leaving it wedges until manual removal
					}
					return err(
						"E-NOREG",
						`cannot stamp platform write lock ${this.lockFile}: ${String(error)}`,
					);
				}
				try {
					closeSync(fd);
				} catch {
					// fd is abandoned either way
				}
				trackHeldLock(this.lockFile, token);
				return ok(token);
			}
			if (Date.now() >= deadline) {
				return err(
					"E-NOREG",
					`platform write lock ${this.lockFile} held for over ${this.lockBudgetMs}ms — locks are never stolen; if its writer is dead, remove the file manually`,
				);
			}
			sleepMs(LOCK_RETRY_MS);
		}
	}
}
