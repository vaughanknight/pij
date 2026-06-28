// pij-messaging — session state classification + liveness verdict (pure).

import type { DeathReason, LivenessVerdict, SessionState } from "./types.js";

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

/** Derive liveness from a pid probe + the age of the newest event + whether the
 *  peer is mid-work.
 *  - pid gone                     → dead
 *  - WORKING but quiet past stale → stale (a stall — mirrors {@link isStalled})
 *  - otherwise (pid alive)        → active
 *
 *  `stale` means "should be making progress but isn't", NOT merely "quiet". A
 *  bound, pid-alive peer that has finished its turn (idle/done) is reachable and
 *  reads `active` however long it sits — only a peer that *claims to be working*
 *  yet has gone silent past the threshold is suspect. Gating on `working` fixes the
 *  false-stale on healthy idle control-plane peers: a `done` colleague's normal
 *  quiet (its `lastEventAt` only advances while the daemon sees the pane `busy`)
 *  no longer reads as stale (observation INS-001; spec AC-10). */
export function liveness(
	pidAlive: boolean,
	latestEventAgeMs: number | null,
	staleAfterMs: number = STALE_AFTER_MS,
	working = false,
): LivenessVerdict {
	if (!pidAlive) return "dead";
	if (working && (latestEventAgeMs === null || latestEventAgeMs > staleAfterMs)) return "stale";
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

// ─── death-reason classifier (pure) ──────────────────────────────────────────

const MODEL_NOT_SUPPORTED_RE =
	/not_found_error|model.*not found|invalid_model|model.*does not exist|unknown model|model.*unavailable/i;
const MODEL_HTTP_400_RE = /API Error:\s*400|error.*400.*model|400.*not_found/i;
const AUTH_RE = /authentication_error|401\s+Unauthorized|invalid.*api.?key|401.*auth/i;
const QUOTA_RE =
	/rate_limit_exceeded|429\s|429\b|overloaded|529\s|quota.*exceeded|resource_exhausted|credit|balance|billing|prepaid|payAsYouGo|insufficient/i;
const DEAD_RE = /\[exited\]|pane is dead|process completed|command not found/i;

/**
 * Classify pane text into a machine-stable {@link DeathReason}. Used by the
 * daemon before calling `fail()` to give a typed reason instead of a raw string.
 * An optional `hint` (e.g. `"stalled"`) short-circuits pattern matching for
 * the watchdog's stall case, where there is no distinctive pane text.
 */
export function classifyDeathReason(pane: string, hint?: DeathReason): DeathReason {
	if (hint === "stalled") return "stalled";
	if (MODEL_NOT_SUPPORTED_RE.test(pane) || MODEL_HTTP_400_RE.test(pane))
		return "model-not-supported";
	if (AUTH_RE.test(pane)) return "auth";
	if (QUOTA_RE.test(pane)) return "quota";
	if (DEAD_RE.test(pane)) return "dead";
	return "unknown";
}
