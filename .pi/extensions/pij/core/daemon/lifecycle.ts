// pij-control-plane — daemon lifecycle decisions (pure, Plan 019 ext).
//
// The CLI auto-starts a daemon when a control-plane command needs one and none
// is running, and tears one down on `pij daemon stop`. Both reduce to a decision
// over the lockfile + a liveness probe — pure and tested here; the bin owns the
// tmux window create/kill, the lock read/write, and the signal.

import type { LockFile } from "./lock.js";

/** What the lockfile + a liveness probe say about the daemon right now. */
export type DaemonStatus =
	| { readonly kind: "running"; readonly pid: number; readonly window?: string }
	| { readonly kind: "stale"; readonly pid: number } // lock present, holder dead
	| { readonly kind: "absent" }; // no lock / corrupt

/** Classify the daemon from its lock (or null) + a liveness probe. */
export function daemonStatus(
	lock: LockFile | null,
	isAlive: (pid: number) => boolean,
): DaemonStatus {
	if (lock === null) return { kind: "absent" };
	if (isAlive(lock.pid)) {
		return { kind: "running", pid: lock.pid, ...(lock.window ? { window: lock.window } : {}) };
	}
	return { kind: "stale", pid: lock.pid };
}

/** True when a command that needs the daemon must auto-start one (anything but a
 *  live daemon — absent OR a stale lock both mean "no daemon is actually up"). */
export function needsAutoStart(status: DaemonStatus): boolean {
	return status.kind !== "running";
}

/** What `pij daemon stop` should do. */
export type StopPlan =
	| { readonly kind: "nothing" } // absent → nothing to stop
	| { readonly kind: "cleanup"; readonly pid: number } // stale → just clear the lock
	| { readonly kind: "kill"; readonly pid: number; readonly window?: string }; // running → kill (+ owned window)

/** Decide the stop action from the current status. A `window` is carried through
 *  ONLY when the daemon recorded one (pij owns that tmux window). */
export function planStop(status: DaemonStatus): StopPlan {
	if (status.kind === "absent") return { kind: "nothing" };
	if (status.kind === "stale") return { kind: "cleanup", pid: status.pid };
	return { kind: "kill", pid: status.pid, ...(status.window ? { window: status.window } : {}) };
}
