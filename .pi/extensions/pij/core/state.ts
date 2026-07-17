// pij-messaging — session state classification + liveness verdict (pure).

import type {
	DeathReason,
	LivenessVerdict,
	SemanticState,
	SessionLifecycle,
	SessionState,
	SystemState,
} from "./types.js";

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

// ─── 7-state mechanical axis (plan 054 P2 T003; WS-6, AC-04) ─────────────────

/** Telemetry the mechanical verdict is derived from. Every field is a REAL
 *  probe result; `null` means the probe itself was unavailable — missing
 *  telemetry is first-class input, never silently coerced (AC-04). */
export interface SystemStateInputs {
	readonly lifecycle?: SessionLifecycle;
	/** Pid probe verdict; `null` = no pid telemetry available. */
	readonly pidAlive: boolean | null;
	/** Pane-process suspension probe (e.g. SIGSTOP); absent/`null` = no probe. */
	readonly paneSuspended?: boolean | null;
	/** Descriptor working/idle signal; absent = no state telemetry. */
	readonly state?: "working" | "idle";
	readonly latestEventAgeMs: number | null;
	readonly staleAfterMs?: number;
}

/** Derive the WS-6 mechanical axis from telemetry — never a heuristic:
 *  1. a gone pid is `dead` (the strongest verdict, beats everything);
 *  2. a suspended-but-alive pane is `stopped` (definite telemetry — beats
 *     the starting hold);
 *  3. pre-bind lifecycle (`pending`/`ready`) is `starting` — written at
 *     spawn/adopt and HELD until the first bind/readiness verdict (AC-04);
 *  4. a missing pid probe is `unknown` — never inferred `dead`;
 *  5. `working` telemetry that has gone silent past the stale threshold
 *     (or never produced an event) is `stalled`, else `working`;
 *  6. `idle` telemetry is `idle`;
 *  7. anything else — no state telemetry at all — is an honest `unknown`,
 *     never inferred `idle`. */
export function systemStateOf(inputs: SystemStateInputs): SystemState {
	const staleAfterMs = inputs.staleAfterMs ?? STALE_AFTER_MS;
	if (inputs.pidAlive === false) return "dead";
	if (inputs.paneSuspended === true) return "stopped";
	if (inputs.lifecycle === "pending" || inputs.lifecycle === "ready") return "starting";
	if (inputs.pidAlive === null) return "unknown";
	if (inputs.state === "working") {
		const age = inputs.latestEventAgeMs;
		return age === null || age > staleAfterMs ? "stalled" : "working";
	}
	if (inputs.state === "idle") return "idle";
	return "unknown";
}

// ─── worst-first badge (plan 054 P2 T003; AC-05) ─────────────────────────────

/** Explicit severity order over BOTH ruled vocabularies, worst first — the
 *  badge is the single entry a human must see first. Attention-priority:
 *  terminal mechanical failure, then declared failure, then anything wedged
 *  or asking, then ambiguity, then calm/informative states. Covers every
 *  SemanticState and SystemState exactly once (pinned by test). */
export const BADGE_SEVERITY = [
	"dead", // system: terminal
	"failed", // semantic: declared failure
	"stalled", // system: claims work, silent — the 44h shape
	"blocked", // semantic: cannot proceed
	"question", // semantic: waiting on an answer
	"hold", // semantic: deliberately parked by an issuer
	"stopped", // system: suspended pane
	"unknown", // system: missing telemetry — ambiguity outranks calm
	"waiting", // semantic: dependent on something external
	"starting", // system: pre-bind hold
	"working", // system: actively producing
	"ready", // semantic: awaiting pickup (review/commit/…)
	"cancelled", // semantic: closed, no action needed
	"done", // semantic: closed, informative over idle
	"idle", // system: calm baseline
] as const satisfies readonly (SemanticState | SystemState)[];

/** Worst-first badge over the mechanical verdict + every OPEN assignment's
 *  semantic state (AC-05: a seat can be done on A and blocked on B — the
 *  badge is `blocked`). No system verdict and no semantics is an honest
 *  `unknown`. */
export function badgeOf(
	systemState: SystemState | undefined,
	semanticStates: readonly SemanticState[],
): SemanticState | SystemState {
	const candidates: (SemanticState | SystemState)[] = [...semanticStates];
	if (systemState !== undefined) candidates.push(systemState);
	if (candidates.length === 0) return "unknown";
	let worst = candidates[0] as SemanticState | SystemState;
	for (const candidate of candidates) {
		if (BADGE_SEVERITY.indexOf(candidate) < BADGE_SEVERITY.indexOf(worst)) worst = candidate;
	}
	return worst;
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
