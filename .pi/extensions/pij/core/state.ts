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

// ── quota-classifier honesty (#5) ─────────────────────────────────────────────
// A confident `quota` verdict requires a GENUINE provider billing/quota error
// frame — never bare domain vocabulary. The old regex matched bare `credit` /
// `balance` / `billing` / `insufficient` anywhere, so a billing/accounting repo's
// OWN output (`split billing`, `credit memo`, `insufficient line items`) fabricated
// a quota death from ambient scrollback. The repo already decided some bare-frame
// strings ARE quota (death-reason fixtures: prepaid/payAsYouGo/`402 insufficient
// credits`); the fix is not "drop the words" but "require them inside a real frame".
//
// Two ways to match (the discriminator):
//  • an anchored quota phrase — `insufficient <credit|funds|balance|quota>`,
//    `balance insufficient`, or `quota`↔`exceeded`; or
//  • the strong terminal signal `exhausted` next to a billing noun
//    ("balance exhausted"). `\bexhausted\b` deliberately does NOT match the
//    transient `resource_exhausted` (no word boundary before "exhausted" there).
const ANCHORED_QUOTA_RE =
	/insufficient\s+(?:credits?|funds?|balance|quota)|balance\s+insufficient|quota.*exceeded|exceeded.*quota/i;
const BILLING_NOUN_RE = /\b(?:credits?|balance|prepaid|payAsYouGo|funds?)\b/i;
const BILLING_EXHAUSTED_RE = /\bexhausted\b/i;
const TRANSIENT_QUOTA_RE = /rate_limit_exceeded|resource_exhausted|429\s|429\b|overloaded|529\s/i;
const DEAD_RE = /\[exited\]|pane is dead|process completed|command not found/i;

/** True iff `text` carries a genuine terminal quota/billing error frame per the
 *  #5 discriminator — an anchored phrase, or an exhausted-balance signal next to
 *  a billing noun. Bare billing vocabulary alone never qualifies. */
function isTerminalQuota(text: string): boolean {
	if (ANCHORED_QUOTA_RE.test(text)) return true;
	return BILLING_EXHAUSTED_RE.test(text) && BILLING_NOUN_RE.test(text);
}

/** Last {@link TAIL_LINES} lines of a captured pane — the "last error region".
 *  Classification is scoped here so a real provider-error string sitting HIGHER
 *  in scrollback (e.g. a billing repo that printed `402 insufficient credits` in
 *  its own output earlier) is not mistaken for THIS session's death reason (#5
 *  residual false-positive F3). Scoping to the tail also fixes the
 *  quota-before-DEAD_RE ordering: a clean `[exited]` at the tail reads `dead`,
 *  because the high-scrollback billing string is out of scope. */
const TAIL_LINES = 15;
function paneTail(pane: string): string {
	const lines = pane.split("\n");
	return lines.slice(Math.max(0, lines.length - TAIL_LINES)).join("\n");
}

/**
 * Classify pane text into a machine-stable {@link DeathReason}. Used by the
 * daemon before calling `fail()` to give a typed reason instead of a raw string.
 * An optional `hint` (e.g. `"stalled"`) short-circuits pattern matching for
 * the watchdog's stall case, where there is no distinctive pane text.
 * Classification reads only the pane TAIL (see {@link paneTail}).
 */
export function classifyDeathReason(pane: string, hint?: DeathReason): DeathReason {
	if (hint === "stalled") return "stalled";
	const tail = paneTail(pane);
	if (MODEL_NOT_SUPPORTED_RE.test(tail) || MODEL_HTTP_400_RE.test(tail))
		return "model-not-supported";
	if (AUTH_RE.test(tail)) return "auth";
	if (isTerminalQuota(tail)) return "quota";
	if (DEAD_RE.test(tail)) return "dead";
	if (TRANSIENT_QUOTA_RE.test(tail)) return "unknown";
	return "unknown";
}
