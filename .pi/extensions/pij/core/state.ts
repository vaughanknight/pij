// pij-messaging — session state classification + liveness verdict (pure).

import type { LivenessVerdict, SessionState } from "./types.js";

// ─── thresholds (Pattern P5: live with the data they constrain) ───────────
/** Newer than this → active; older (but pid alive) → stale. */
export const STALE_AFTER_MS = 60_000;

/** States that mean the session is actively doing work (vs static/waiting). */
const WORKING_STATES: ReadonlySet<SessionState> = new Set<SessionState>([
	"in-progress",
	"reviewing",
]);

/** Is the session working (true) or static/idle (false)? (spec AC-9) */
export function isWorking(state: SessionState): boolean {
	return WORKING_STATES.has(state);
}

/** Derive liveness from a pid probe + the age of the newest event.
 *  - pid gone           → dead
 *  - no events / too old → stale
 *  - recent event        → active
 *  (spec AC-10; mirrors minih run-liveness) */
export function liveness(
	pidAlive: boolean,
	latestEventAgeMs: number | null,
	staleAfterMs: number = STALE_AFTER_MS,
): LivenessVerdict {
	if (!pidAlive) return "dead";
	if (latestEventAgeMs === null || latestEventAgeMs > staleAfterMs) return "stale";
	return "active";
}

/** The orchestration-facing activity of a peer (control-plane feedback, round 3):
 *  a colleague is `working` (footer busy / mid-turn), `done` (idle *after* having
 *  produced activity — finished its turn, awaiting the next), or `idle` (bound but
 *  never yet active). Lets an orchestrator distinguish "still working" from
 *  "finished" without scraping the transcript — the crux of "don't idle while a
 *  colleague works". Derived purely from the descriptor's state + whether it has a
 *  last-activity timestamp. */
export type Activity = "working" | "idle" | "done";
export function activityOf(state: "working" | "idle" | undefined, hasActivity: boolean): Activity {
	if (state === "working") return "working";
	return hasActivity ? "done" : "idle";
}

/** A worker that reports working but whose newest event is stale is a stall
 *  (spec AC-7a) — detectable from state + event age alone, no external clock. */
export function isStalled(
	state: SessionState,
	latestEventAgeMs: number | null,
	staleAfterMs: number = STALE_AFTER_MS,
): boolean {
	if (!isWorking(state)) return false;
	return latestEventAgeMs === null || latestEventAgeMs > staleAfterMs;
}
