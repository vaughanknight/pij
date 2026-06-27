// pij-control-plane — single-instance daemon lock decision (pure, Plan 019).
//
// Exactly one injector may run machine-wide (AC-10) — two daemons would both
// consume tmux inboxes and double-inject. The lockfile lives at a fixed path
// (the daemon bin owns the fs read/write/unlink); the DECISION — acquire,
// refuse, or reclaim a stale lock whose holder has died — is pure and tested
// here against an injected liveness probe.

export interface LockFile {
	/** pid of the daemon that wrote the lock. */
	readonly pid: number;
	/** ISO-8601 acquisition time (diagnostics; not used by the decision). */
	readonly startedAt: string;
}

export type LockDecision =
	| { readonly kind: "acquire" } // free, our own, or stale → take it
	| { readonly kind: "refuse"; readonly holderPid: number } // a live daemon holds it
	| { readonly kind: "reclaim"; readonly stalePid: number }; // holder is dead → steal it

/** Parse lockfile contents; `null` for absent/corrupt (treated as acquirable). */
export function parseLockFile(raw: string | null): LockFile | null {
	if (raw === null) return null;
	try {
		const v = JSON.parse(raw) as Partial<LockFile>;
		if (typeof v.pid === "number" && typeof v.startedAt === "string") {
			return { pid: v.pid, startedAt: v.startedAt };
		}
		return null;
	} catch {
		return null;
	}
}

/** Serialize a lockfile for writing. */
export function serializeLockFile(lock: LockFile): string {
	return JSON.stringify(lock);
}

/** Decide whether this process may run as THE daemon (AC-10):
 *  - no lock / corrupt   → acquire;
 *  - our own pid         → acquire (re-entrant, e.g. a re-exec);
 *  - holder alive        → refuse (attach/observe instead);
 *  - holder dead         → reclaim the stale lock. */
export function evaluateLock(
	existing: LockFile | null,
	isAlive: (pid: number) => boolean,
	selfPid: number,
): LockDecision {
	if (existing === null) return { kind: "acquire" };
	if (existing.pid === selfPid) return { kind: "acquire" };
	if (isAlive(existing.pid)) return { kind: "refuse", holderPid: existing.pid };
	return { kind: "reclaim", stalePid: existing.pid };
}
