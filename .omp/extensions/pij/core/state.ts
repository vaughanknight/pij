// pij-messaging — session state classification + liveness verdict (pure).

import type {
	AgentLiveness,
	AgentLivenessProbe,
	ProcessInfo,
	ProcessSnapshot,
} from "./platform/types.js";
import type {
	DeathReason,
	HarnessKind,
	LivenessVerdict,
	SemanticState,
	SessionLifecycle,
	SessionState,
	SystemState,
	TerminalObservation,
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

// ─── identity-aware agent liveness (plan 095 Phase 1, T-1.3) ────────────────
//
// THE DEFECT THIS REPLACES: `isAlive(pid)` is `process.kill(pid, 0)`, an
// EXISTENCE test on a number. It gets both directions wrong, measured:
//
//   false-DEAD  — 7 of 23 live seats run their agent one level BELOW the
//                 registry pid (`--resume` re-launches sit under a shell). A
//                 probe hardcoded at the registry pid, or at `pgrep -P`, is
//                 blind to one side or the other.
//   false-ALIVE — `pij-weak-gurgeh` holds pid 952, recycled across a reboot to
//                 `IntuneMdmDaemon`. `isAlive(952)` is `true` and always will
//                 be, so that seat can NEVER be declared dead.
//
// So the probe is a bounded descendant walk, SELF INCLUDED, matched on parsed
// identity — and allowed to answer `unknown`.
//
// DIRECTION OF HARM, stated once because it decides every ambiguous rung below:
// a false `absent` is the destructive answer (pij#142: a supervisor read `-zsh`
// on a registry pid, concluded the agent was gone, and force-closed a working
// pane). A false `alive` merely leaves a corpse on the board one sweep longer.
// Every rung that could go either way therefore goes to `alive` or `unknown`,
// never to `absent`.

/** How deep below the registry pid we look. Measured population is {0: 16,
 *  1: 7}; 3 is headroom, not a guess about a harness. */
export const AGENT_LIVENESS_MAX_DEPTH = 3;

/** Executable names that mean "the real program is the NEXT argument". */
const COMMAND_RUNNERS: ReadonlySet<string> = new Set([
	"node",
	"bun",
	"deno",
	"npx",
	"tsx",
	"env",
	"sh",
	"bash",
	"zsh",
	"fish",
	"login",
]);

/** Which executable basenames count as each harness. `pi` and `omp` share the
 *  `pi` HarnessKind but are different binaries (`runtimeBin` distinguishes them
 *  in the registry); either one satisfies a `pi` seat. */
const HARNESS_BINARIES: Readonly<Record<HarnessKind, readonly string[]>> = {
	pi: ["pi", "omp"],
	claude: ["claude"],
	copilot: ["copilot"],
	codex: ["codex"],
};

const ALL_HARNESS_BINARIES: readonly string[] = Object.values(HARNESS_BINARIES).flat();

/** Flags whose VALUE is a harness-native session id. */
const SESSION_ID_FLAGS: ReadonlySet<string> = new Set(["--session-id", "--resume", "--continue"]);

/** Structural subject (Pattern P6) — a `SessionDescriptor` satisfies it, and so
 *  does a hand-built fixture, without importing descriptor plumbing. */
export interface AgentLivenessSubject {
	readonly pid: number;
	readonly harness?: HarnessKind;
	readonly runtimeBin?: "pi" | "omp";
	readonly harnessSessionId?: string;
	readonly plannedHarnessSessionId?: string;
}

export interface AgentLivenessOptions {
	readonly maxDepth?: number;
}

/** `/usr/local/bin/copilot.js` → `copilot`; `-zsh` → `zsh`. */
function executableName(token: string): string {
	const base = token.slice(token.lastIndexOf("/") + 1).replace(/^-+/, "");
	return base.replace(/\.(?:js|mjs|cjs|ts)$/i, "").toLowerCase();
}

/** The program a command line actually runs, seeing through `node …/x` and
 *  `env FOO=1 x`. Returns the empty string when there is nothing to read. */
function programOf(command: string): string {
	const tokens = command.trim().split(/\s+/).filter(Boolean);
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === undefined) break;
		if (token.startsWith("-")) {
			// `-zsh` is a LOGIN SHELL, not a flag — it is the argv[0] convention, and
			// it is the exact string that fooled the supervisor in pij#142.
			if (i === 0) return executableName(token);
			continue;
		}
		if (token.includes("=") && !token.includes("/")) continue; // env assignment
		const name = executableName(token);
		if (COMMAND_RUNNERS.has(name)) continue;
		return name;
	}
	return "";
}

/** Every session id this command line explicitly names. PARSED as argument
 *  values, never substring-matched: a worktree path can contain a uuid, and a
 *  substring match would then read one seat's identity off another seat's cwd. */
function parsedSessionIds(command: string): string[] {
	const tokens = command.trim().split(/\s+/).filter(Boolean);
	const ids: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === undefined) continue;
		const eq = token.indexOf("=");
		if (token.startsWith("--") && eq > 0) {
			if (SESSION_ID_FLAGS.has(token.slice(0, eq))) {
				const value = token.slice(eq + 1);
				if (value.length > 0) ids.push(value);
			}
			continue;
		}
		if (!SESSION_ID_FLAGS.has(token)) continue;
		const next = tokens[i + 1];
		// A bare `--resume` with no value is PARSEABLE and simply carries no id —
		// distinct from a truncated line, which carries missing evidence.
		if (next !== undefined && !next.startsWith("-")) ids.push(next);
	}
	return ids;
}

function isHarnessProgram(program: string, harness: HarnessKind | undefined): boolean {
	if (program.length === 0) return false;
	const names = harness === undefined ? ALL_HARNESS_BINARIES : HARNESS_BINARIES[harness];
	return names.includes(program);
}

/** The bounded subtree rooted at `pid`, SELF INCLUDED. */
function boundedSubtree(
	snapshot: readonly ProcessInfo[],
	pid: number,
	maxDepth: number,
): ProcessInfo[] {
	const childrenOf = new Map<number, ProcessInfo[]>();
	const self: ProcessInfo[] = [];
	for (const info of snapshot) {
		if (info.pid === pid) self.push(info);
		const siblings = childrenOf.get(info.ppid);
		if (siblings === undefined) childrenOf.set(info.ppid, [info]);
		else siblings.push(info);
	}
	const out: ProcessInfo[] = [...self];
	const seen = new Set<number>([pid]);
	let frontier: number[] = [pid];
	for (let depth = 0; depth < maxDepth; depth++) {
		const next: number[] = [];
		for (const parent of frontier) {
			for (const child of childrenOf.get(parent) ?? []) {
				// A pid that is its own ancestor cannot happen on a healthy table, but
				// a snapshot is untrusted input and an infinite walk is not a
				// diagnosis anyone can act on.
				if (seen.has(child.pid)) continue;
				seen.add(child.pid);
				out.push(child);
				next.push(child.pid);
			}
		}
		if (next.length === 0) break;
		frontier = next;
	}
	return out;
}

/** Is this seat's agent running? — the identity ladder, first match wins.
 *
 *  | rung | condition                                              | verdict   |
 *  |------|--------------------------------------------------------|-----------|
 *  | 1    | snapshot unavailable                                   | `unknown` |
 *  | 2    | a subtree process carries this seat's PARSED id         | `alive`   |
 *  | 3    | a harness process, no id comparison possible           | `alive`   |
 *  | 4    | harness processes present, ALL carrying a FOREIGN id    | `absent`  |
 *  | 5    | a harness process whose command line is truncated       | `unknown` |
 *  | 6    | nothing harness-like in the bounded subtree             | `absent`  |
 *
 *  START TIME NEVER DEMOTES. A revived agent legitimately starts AFTER the
 *  descriptor's `startedAt`, so a start-time check can only ever corroborate a
 *  match — never turn one into `absent`. That asymmetry is deliberate and is
 *  why `startedAtMs` appears in the DETAIL string and nowhere in the verdict. */
export function resolveAgentLiveness(
	subject: AgentLivenessSubject,
	snapshot: ProcessSnapshot,
	options: AgentLivenessOptions = {},
): AgentLivenessProbe {
	if (!snapshot.ok) {
		return {
			liveness: "unknown",
			cause: "probe-unavailable",
			detail: `process table unavailable: ${snapshot.reason}`,
		};
	}
	const subtree = boundedSubtree(
		snapshot.processes,
		subject.pid,
		options.maxDepth ?? AGENT_LIVENESS_MAX_DEPTH,
	);
	const expected = new Set<string>();
	if (subject.harnessSessionId !== undefined) expected.add(subject.harnessSessionId);
	if (subject.plannedHarnessSessionId !== undefined) expected.add(subject.plannedHarnessSessionId);

	const harnessProcesses: ProcessInfo[] = [];
	let unreadable = 0;
	for (const info of subtree) {
		if (info.truncated === true || info.command.trim().length === 0) unreadable++;
		if (isHarnessProgram(programOf(info.command), subject.harness)) harnessProcesses.push(info);
	}

	// Rung 2 — exact identity. Checked across the WHOLE subtree before any
	// negative rung, so a subtree holding both this seat's agent and a foreign
	// one resolves `alive`.
	for (const info of harnessProcesses) {
		for (const id of parsedSessionIds(info.command)) {
			if (!expected.has(id)) continue;
			const started =
				info.startedAtMs === undefined
					? ""
					: ` (started ${new Date(info.startedAtMs).toISOString()})`;
			return {
				liveness: "alive",
				cause: "session-id-match",
				agentPid: info.pid,
				detail: `pid ${info.pid} carries session id ${id}${started}`,
			};
		}
	}

	if (harnessProcesses.length === 0) {
		// FOUND BY BUILDING THIS: an unreadable row is not a harness process, so an
		// unreadable SUBTREE used to fall straight through to `absent` here — and a
		// capture bug (macOS renders `lstart` as `Sat  8 Aug`, GNU as `Sat Aug  8`,
		// and the first parser only knew one of them) would therefore have stamped
		// EVERY SEAT IN THE FLEET terminal on the first tick. That is the exact
		// destructive answer this stream exists to remove, arriving via this
		// stream. An absence can only be declared over rows we could actually read.
		if (unreadable > 0) {
			return {
				liveness: "unknown",
				cause: "identity-indeterminate",
				detail: `${unreadable} process row(s) under pid ${subject.pid} could not be read — an absence cannot be declared over evidence that was never legible`,
			};
		}
		return {
			liveness: "absent",
			cause: "no-harness-process",
			detail: `no ${subject.harness ?? "harness"} process in the subtree of pid ${subject.pid}`,
		};
	}

	// Rung 5 before rung 4: a truncated line cannot be counted as carrying a
	// foreign id, and "all the others were foreign" is not a finding when one of
	// them could not be read.
	const indeterminate = harnessProcesses.find(
		(info) => info.truncated === true || info.command.trim().length === 0,
	);

	// Rung 3 — a harness process is present and there is nothing to compare it
	// against, on one side or the other. Corroborating, not exact: it is the best
	// answer available, and the alternative (`absent`) is the destructive one.
	const comparable = harnessProcesses.filter((info) => parsedSessionIds(info.command).length > 0);
	if (expected.size === 0 || (comparable.length === 0 && indeterminate === undefined)) {
		const first = harnessProcesses[0];
		return {
			liveness: "alive",
			cause: "harness-process-present",
			...(first !== undefined ? { agentPid: first.pid } : {}),
			detail:
				expected.size === 0
					? `harness process present under pid ${subject.pid}; this seat records no session id to compare`
					: `harness process present under pid ${subject.pid} with no session id on its command line`,
		};
	}

	if (indeterminate !== undefined) {
		return {
			liveness: "unknown",
			cause: "identity-indeterminate",
			agentPid: indeterminate.pid,
			detail: `pid ${indeterminate.pid} is a harness process whose command line could not be read in full — missing evidence, not evidence of absence`,
		};
	}

	// Rung 4 — exact negative. EVERY harness process in the subtree names a
	// different seat. This is the only path to `absent` that has actually read an
	// identity, which is why it is allowed to contradict a running process.
	const foreign = comparable
		.flatMap((info) => parsedSessionIds(info.command))
		.filter((id) => !expected.has(id));
	return {
		liveness: "absent",
		cause: "foreign-session-id",
		detail: `every harness process under pid ${subject.pid} belongs to another seat (${foreign.join(", ")})`,
	};
}

// ─── activityCredibility (plan 095 T-1.4) ──────────────────────────────────
// PUBLISHED CONTRACT — `docs/plans/095-liveness-fields/activity-credibility.contract.md`.
// s097 codes against this. The `cause` values and the precedence order below
// are BYTE-STABLE: do not rename, reorder, or add to them without telling the
// prime.

/** Why an activity reading is, or is not, credible as CURRENT.
 *
 *  DISCRIMINATED ON PURPOSE: a consumer that renders "superseded because the
 *  agent process is gone" differently from "superseded because the seat was
 *  dissolved" must never string-match prose. `reason` is for humans and may be
 *  reworded freely; `cause` is the contract. */
export type ActivityCredibilityCause =
	/** A live probe corroborated the agent — the strongest evidence available. */
	| "observed-live"
	/** Nothing contradicts the recorded activity. */
	| "uncontradicted"
	/** The agent was observed absent (terminal record, or a live absent probe). */
	| "agent-absent"
	/** `lifecycle: "dissolved"` — the one unambiguous terminal state. */
	| "dissolved"
	/** pij asked for this teardown; the seat is gone by request, not by inference. */
	| "close-requested"
	/** The liveness observation itself was unavailable — we do not know. */
	| "probe-unavailable"
	/** No activity telemetry was ever recorded — no proof it was working, and
	 *  equally no proof it was not. NOT the same as "it was idle". */
	| "no-activity-recorded";

/** Three-valued by necessity. `unknown` is NON-SUPPRESSING: a consumer renders
 *  the activity WITH its age and an explicit uncertainty marker, and never
 *  silently drops it. Silently dropping is how a refusal to accuse without proof
 *  becomes a refusal to look. */
export type ActivityVerdict = "current" | "superseded" | "unknown";

export interface ActivityCredibility {
	readonly verdict: ActivityVerdict;
	readonly cause: ActivityCredibilityCause;
	/** Human-readable. NOT a contract — never parse this. */
	readonly reason: string;
	/** ISO-8601 timestamp of the evidence behind the verdict, so a consumer can
	 *  render "superseded 6d ago" without re-deriving it. Absent when no dated
	 *  evidence applies. */
	readonly asOf?: string;
}

/** Structural input (Pattern P6) — deliberately NOT a `SessionDescriptor`, so
 *  any consumer can call it without importing descriptor plumbing, and so a
 *  caller may pass a FRESHER probe than the descriptor carries. */
export interface ActivityCredibilityInput {
	readonly state?: "working" | "idle";
	readonly lastEventAt?: string;
	readonly lifecycle?: SessionLifecycle;
	readonly terminal?: TerminalObservation;
	/** Optional fresh liveness probe. When present it OUTRANKS the stored
	 *  `terminal` record — a live observation beats a durable one. */
	readonly agentLiveness?: AgentLiveness;
}

/** *"May this seat's recorded activity be rendered as CURRENT?"* — asked once,
 *  so no consumer has to remember to check `terminal`. A rule that needs a
 *  broadcast to stay true is worse than one that cannot collide.
 *
 *  It is a SUPPRESSOR, NEVER A SUBJECT: it never invents, rewrites, or clears an
 *  activity. `state` and `lastEventAt` keep their full historical record —
 *  `state: "working"` on a dead seat is not false about the past, and it is
 *  exactly what someone debugging that death needs.
 *
 *  `superseded` is a RENDERING verdict, NOT TEARDOWN AUTHORITY. Never key an
 *  irreversible action on it — no close, no pane kill, no dissolve, no eviction.
 *  pij#171 is the live example of why: a stale `paneId` lease treated as a
 *  current identity nearly killed a live seat. */
export function activityCredibility(input: ActivityCredibilityInput): ActivityCredibility {
	const asOf = input.terminal?.observedAt;
	const dated = asOf === undefined ? {} : { asOf };
	// 1
	if (input.lifecycle === "dissolved") {
		return {
			verdict: "superseded",
			cause: "dissolved",
			reason: "the seat was dissolved — the one unambiguous terminal state",
			...dated,
		};
	}
	// 2/3 — a FRESH observation outranks a stored one, in both directions.
	if (input.agentLiveness === "alive") {
		return {
			verdict: "current",
			cause: "observed-live",
			reason: "a live probe found this seat's agent process",
		};
	}
	if (input.agentLiveness === "absent") {
		return {
			verdict: "superseded",
			cause: "agent-absent",
			reason: "a live probe found no agent process for this seat",
			...dated,
		};
	}
	// 4/5/6 — the stored terminal record.
	if (input.terminal !== undefined) {
		if (input.terminal.disposition === "unavailable") {
			return {
				verdict: "unknown",
				cause: "probe-unavailable",
				reason: "the recorded liveness observation was itself unavailable",
				...dated,
			};
		}
		if (input.terminal.disposition === "requested") {
			return {
				verdict: "superseded",
				cause: "close-requested",
				reason: "pij requested this teardown — the seat is gone by request, not by inference",
				...dated,
			};
		}
		return {
			verdict: "superseded",
			cause: "agent-absent",
			reason: "a terminal absence is recorded for this seat",
			...dated,
		};
	}
	// 7
	if (input.agentLiveness === "unknown") {
		return {
			verdict: "unknown",
			cause: "probe-unavailable",
			reason: "the liveness probe could not reach a verdict",
		};
	}
	// 8 — `anomalies.ts:398` stated positively: no telemetry is UNKNOWN and still
	// rendered, never conflated with "nothing to see".
	if (input.state === undefined && input.lastEventAt === undefined) {
		return {
			verdict: "unknown",
			cause: "no-activity-recorded",
			reason: "no activity was ever recorded for this seat — no proof either way",
		};
	}
	// 9
	return {
		verdict: "current",
		cause: "uncontradicted",
		reason: "nothing contradicts the recorded activity",
	};
}
