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

/** The result of trying to bring a daemon up: what was VERIFIED, not what was
 *  launched. `unverified` deliberately carries no cause — this type says only
 *  that liveness was not established, never that the daemon is dead. */
export type DaemonStartOutcome =
	| { readonly kind: "verified"; readonly pid: number }
	| { readonly kind: "unverified" };

/** Decide from a polled status whether a just-launched daemon is actually up.
 *
 *  A created tmux window is evidence that tmux made a window, and nothing else
 *  (pij#118 defect 2): before this, `pij daemon start` reported success the
 *  moment `newWindow()` returned, so every crash-on-boot — including the fresh
 *  install ENOENT — was announced as a successful start.
 *
 *  Only a live lock holder counts. A `stale` lock is if anything WORSE evidence
 *  than no lock at all: the daemon got far enough to write it and then died. */
export function daemonStartOutcome(status: DaemonStatus): DaemonStartOutcome {
	if (status.kind === "running") return { kind: "verified", pid: status.pid };
	return { kind: "unverified" };
}

/** How long {@link reportDaemonStart} waits for proof that the daemon it just
 *  launched is actually up, and how often it re-checks.
 *
 *  MEASURED, not guessed: three cold starts put the lock write at 584/572/576ms.
 *  Almost all of that is `npx` + the `tsx` transform of the daemon's import graph
 *  — the daemon writes its lock before it does anything else. A sub-second budget
 *  would therefore report EVERY healthy auto-start as unverified, which is just
 *  the old lie inverted. The budget is the ceiling on the failure case only; the
 *  poll returns as soon as the lock goes live. */
export const DAEMON_VERIFY_BUDGET_MS = 2_500;
export const DAEMON_VERIFY_POLL_MS = 50;

/** The leading glyph of a note that reads as "the daemon is up". The property
 *  this phase exists to protect is stated against this marker: an unverified
 *  outcome must never render a note beginning with it. */
export const DAEMON_START_SUCCESS_MARK = "⚙";

/** The leading glyph of a note that reads as "something is not established". */
export const DAEMON_START_WARN_MARK = "⚠️";

/** The side effects {@link reportDaemonStart} needs, injected (P3) so the
 *  decision can be tested without tmux, a real clock, or a real lockfile. */
export interface DaemonStartProbe {
	/** Re-read the lock + liveness. Called until verified or the budget is spent. */
	readonly status: () => DaemonStatus;
	/** Block for ms. Injected so a test does not spend real time. */
	readonly sleep: (ms: number) => void;
	/** The pane's recent output, for the failure note. May throw; this function handles it. */
	readonly capturePane: () => string;
	readonly budgetMs?: number;
	readonly pollMs?: number;
}

/** Poll for PROOF that a just-launched daemon is up, and render the operator note
 *  for what was actually ESTABLISHED — never for what was merely attempted.
 *
 *  The property (pij#118 defect 2, the half that matters): **an unverified
 *  outcome never renders as a success note.** Before this, the caller returned
 *  its success note the instant `newWindow()` succeeded, so every crash-on-boot
 *  — including the fresh-install ENOENT of Phase 1 — was announced as a started
 *  daemon, and then nothing ever bound.
 *
 *  The loop exits the moment the lock goes live, so the happy path costs the
 *  daemon's real boot time and NOT the budget; the budget bounds only failure.
 *
 *  On failure it shows the pane rather than naming a cause. "Not verified" is not
 *  "dead" — the daemon may still be coming up — and a false obituary is the same
 *  mistake as a false success, pointed the other way. */
export function reportDaemonStart(
	ctx: { readonly windowName: string; readonly paneId: string },
	probe: DaemonStartProbe,
): string {
	const budgetMs = probe.budgetMs ?? DAEMON_VERIFY_BUDGET_MS;
	const pollMs = probe.pollMs ?? DAEMON_VERIFY_POLL_MS;

	for (let waited = 0; waited < budgetMs; waited += pollMs) {
		const outcome = daemonStartOutcome(probe.status());
		if (outcome.kind === "verified") {
			return `${DAEMON_START_SUCCESS_MARK} no pij daemon was running — started one in tmux window '${ctx.windowName}' (pane ${ctx.paneId}), verified up as pid ${outcome.pid}; it will drive control-plane sessions to bound.`;
		}
		probe.sleep(pollMs);
	}

	let tail: string;
	try {
		tail = probe.capturePane().trimEnd();
	} catch (e) {
		// A failed capture must degrade the note, not replace the outcome: the
		// operator still needs to know verification did not succeed.
		tail = `(could not capture pane ${ctx.paneId}: ${(e as Error).message})`;
	}
	const shown = tail ? `\n--- pane ${ctx.paneId} ---\n${tail}` : "";
	return `${DAEMON_START_WARN_MARK} started a pij daemon in tmux window '${ctx.windowName}' (pane ${ctx.paneId}) but could NOT verify it running within ${budgetMs}ms — it may still be coming up, or it may have failed to boot. Check with \`pij daemon status\`.${shown}`;
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
