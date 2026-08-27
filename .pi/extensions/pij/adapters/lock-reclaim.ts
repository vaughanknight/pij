import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, statSync } from "node:fs";

export type LockLayer = "write.lock" | "events.lock" | "descriptor.lock";
export type LockReclaimReason = "dead-pid" | "pid-reused";

export interface LockReclaimNote {
	readonly layer: LockLayer;
	readonly pid: number;
	readonly reason: LockReclaimReason;
	readonly lockFile: string;
	readonly message: string;
}

export interface LockReclaimOptions {
	readonly isAlive?: (pid: number) => boolean;
	readonly processStartedAtMs?: (pid: number) => number | undefined;
}

const heldLocks = new Map<string, string>();

function lockPid(raw: string): number | undefined {
	try {
		const parsed = JSON.parse(raw) as { pid?: unknown };
		if (typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0) {
			return parsed.pid;
		}
	} catch {
		// Legacy spine locks use `<pid>:<token>` rather than JSON.
	}
	const match = /^\s*(\d+)(?::|\s|$)/.exec(raw);
	if (!match?.[1]) return undefined;
	const pid = Number(match[1]);
	return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function processStartedAtMs(pid: number): number | undefined {
	let raw: string;
	try {
		raw = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return undefined;
	}
	const parsed = Date.parse(raw.trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Reclaim only when the recorded process is dead, or when an alive process
 * started after the lock and therefore reused its pid. An unreadable owner or
 * start time is missing evidence and always preserves the lock. */
export function reclaimIfDead(
	lockFile: string,
	layer: LockLayer,
	options: LockReclaimOptions = {},
): LockReclaimNote | null {
	let raw: string;
	let lockedAtMs: number;
	try {
		raw = readFileSync(lockFile, "utf8");
		lockedAtMs = statSync(lockFile).mtimeMs;
	} catch {
		return null;
	}
	const pid = lockPid(raw);
	if (pid === undefined) return null;
	const isAlive = options.isAlive ?? processIsAlive;
	const startedAt = options.processStartedAtMs ?? processStartedAtMs;
	let reason: LockReclaimReason;
	if (!isAlive(pid)) {
		reason = "dead-pid";
	} else {
		const currentProcessStartedAtMs = startedAt(pid);
		if (currentProcessStartedAtMs === undefined || currentProcessStartedAtMs <= lockedAtMs) {
			return null;
		}
		reason = "pid-reused";
	}
	try {
		if (readFileSync(lockFile, "utf8") !== raw) return null;
		rmSync(lockFile);
	} catch {
		return null;
	}
	const message =
		reason === "dead-pid"
			? `reclaimed stale ${layer} from dead pid ${pid}`
			: `reclaimed stale ${layer} from pid ${pid} whose process started after the lock (PID reuse)`;
	return { layer, pid, reason, lockFile, message };
}

export function trackHeldLock(lockFile: string, token: string): void {
	heldLocks.set(lockFile, token);
}

export function releaseOwnedLock(lockFile: string, token: string): void {
	try {
		if (readFileSync(lockFile, "utf8") === token) rmSync(lockFile, { force: true });
	} catch {
		// Already gone or no longer ours.
	} finally {
		if (heldLocks.get(lockFile) === token) heldLocks.delete(lockFile);
	}
}

/** Best-effort graceful-shutdown release of every lock this process currently
 * owns. Token checks ensure a successor's replacement lock is never removed. */
export function releaseHeldLocks(): void {
	for (const [lockFile, token] of [...heldLocks]) releaseOwnedLock(lockFile, token);
}
