// pij-telegram — single-instance lockfile (Plan Phase 3 / Finding 04; AC-09).
//
// `pij telegram start` is a FOREGROUND long-poll: exactly one process may hold the
// Telegram getUpdates stream for a bot, or Telegram answers 409 Conflict. A lockfile
// at ~/.pij/pij-telegram.lock enforces single-instance with the SAME decision the
// daemon uses (core/daemon/lock.ts): a live holder REFUSES the second start; a dead
// holder's stale lock is RECLAIMED. The acquire is atomic (`wx` = O_CREAT|O_EXCL) so
// two simultaneous starts can't both "win" a stale-lock read. Self-contained (no
// daemon import) so the bridge owns its whole gate; the liveness probe is injected so
// the decision is testable against a tmp lock without spawning real processes.

import { readFileSync, rmSync, writeFileSync } from "node:fs";

/** Lock contents: the holder's pid + an ISO acquisition time (diagnostics). */
export interface BridgeLock {
	readonly pid: number;
	readonly startedAt: string;
}

export type AcquireOutcome =
	/** We hold the lock; call `release()` on clean shutdown. */
	| { readonly kind: "acquired"; readonly release: () => void }
	/** A live process already holds it — refuse and surface the holder. */
	| { readonly kind: "refused"; readonly holderPid: number };

export interface AcquireOpts {
	readonly pid: number;
	readonly startedAt: string;
	/** Liveness probe — injected so the acquire decision is testable. */
	readonly isAlive: (pid: number) => boolean;
	readonly log?: (message: string) => void;
}

/** Parse lock contents; `null` for absent/corrupt (treated as reclaimable). */
export function parseLock(raw: string | null): BridgeLock | null {
	if (raw === null) return null;
	try {
		const v = JSON.parse(raw) as Partial<BridgeLock>;
		return typeof v.pid === "number" && typeof v.startedAt === "string"
			? { pid: v.pid, startedAt: v.startedAt }
			: null;
	} catch {
		return null;
	}
}

/** Read the holder pid from a lockfile, or `null` if absent/corrupt. */
export function readLockPid(lockPath: string): number | null {
	try {
		return parseLock(readFileSync(lockPath, "utf8"))?.pid ?? null;
	} catch {
		return null;
	}
}

/** Default liveness probe: signal 0 hits the process table without delivering. */
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		// EPERM = the process exists but isn't ours (still alive); ESRCH = no such pid.
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * Acquire the single-instance lock. Atomic `wx` create; on collision, evaluate the
 * holder — a live pid REFUSES (returns the holder), a dead/corrupt/own lock is
 * RECLAIMED (unlink + retry the exclusive create). Returns a `release()` that removes
 * the lock iff it still names our pid, so a successor that reclaimed after us is never
 * clobbered.
 */
export function acquireLock(lockPath: string, opts: AcquireOpts): AcquireOutcome {
	const { pid, startedAt, isAlive } = opts;
	const log = opts.log ?? (() => {});
	const body = JSON.stringify({ pid, startedAt } satisfies BridgeLock);
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			writeFileSync(lockPath, body, { flag: "wx" });
			return { kind: "acquired", release: () => releaseLock(lockPath, pid) };
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
			let existing: BridgeLock | null = null;
			try {
				existing = parseLock(readFileSync(lockPath, "utf8"));
			} catch {
				existing = null;
			}
			// A live holder (other than us) wins — refuse the second instance.
			if (existing && existing.pid !== pid && isAlive(existing.pid)) {
				return { kind: "refused", holderPid: existing.pid };
			}
			if (existing && existing.pid !== pid) {
				log(`reclaiming stale telegram lock (dead pid ${existing.pid})`);
			}
			rmSync(lockPath, { force: true }); // our own / dead / corrupt → clear + retry wx
		}
	}
	// Only reachable if a third racer keeps re-creating the lock between our retries;
	// treat as lost-by-contention rather than throwing.
	return { kind: "refused", holderPid: readLockPid(lockPath) ?? -1 };
}

/** Release the lock iff it still holds our pid (idempotent; never throws). */
export function releaseLock(lockPath: string, pid: number): void {
	try {
		if (parseLock(readFileSync(lockPath, "utf8"))?.pid === pid) {
			rmSync(lockPath, { force: true });
		}
	} catch {
		// already gone — idempotent
	}
}
