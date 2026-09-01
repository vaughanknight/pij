/** Generation-aware routing for the `pij` CLI (plan 114, u-route).
 *
 *  ONE `pij` command serves two daemon generations. This module holds the
 *  ROUTE TABLE — data — and the PURE decision functions over it. All I/O lives
 *  in `adapters/generation-router.ts`; nothing here fetches, reads a file, or
 *  looks at `process`.
 *
 *  Two rules the rest of the file exists to enforce:
 *
 *  1. A verb reaches rs ONLY when the table lists it. Everything unlisted goes
 *     legacy. That default is what settles the `tail` false friend (ac-1145)
 *     for free: TS `tail` follows a peer TRANSCRIPT, rs `tail` follows daemon
 *     EVENT frames — same spelling, different objects — so `tail` simply never
 *     gets a row, and `generation-routing.test.ts` pins that absence so a
 *     future row-add must be a deliberate act that fails a test first.
 *
 *  2. rs NOT IMPLEMENTING a verb falls back to legacy; rs ERRORING never does.
 *     Masking a real rs failure would silently re-home a seat into the other
 *     store while every surface reported success — the split-brain this plan
 *     exists to prevent. The two cases must be distinguishable AT THE CALL
 *     SITE, which is why `RouteOutcome` spells each one out instead of
 *     collapsing them into "served by legacy" (F-1128: a notice that cannot
 *     tell its cases apart carries no information).
 *
 *  THIS MODULE MINTS NO SEAT IDS (ac-1147). The memorable-id allocator lives in
 *  rs (`crates/daemon/src/http/mod.rs`, `allocate_memorable_id`); two minters
 *  would be two namespaces, which is the headline split-brain by construction.
 *  `generation-routing.test.ts` pins the absence of a name-generation path here.
 */

/** One row of the route table. Adding an rs verb is adding one of these —
 *  never a branch in the dispatcher. */
export interface RsRouteRow {
	/** Top-level verb as typed: `pij <verb>`. */
	readonly verb: string;
	/** Sub-verb, when the family splits (`pij report now`). Absent = whole verb. */
	readonly leaf?: string;
	/** Path on the rs daemon this row dispatches to. */
	readonly rsPath: string;
	readonly method: "GET" | "POST";
	/** WHICH seat the follow-the-seat check is about.
	 *
	 *  "ambient" (the default) is right for the identity verbs — adopt, whoami,
	 *  phonehome, report — which are about ME. It is WRONG for a verb that takes
	 *  a seat id, because `pij state <id>` is about SOMEONE ELSE: keying that on
	 *  the ambient seat means an rs-resident caller asking about a legacy-only
	 *  peer routes to rs, gets a decoded "no such seat", classifies as rs-error
	 *  and exits 4 — follow-the-seat defeated by following the wrong seat, and a
	 *  verb that works today broken for every legacy-resident peer.
	 *
	 *  It lives on the ROW because it is per-verb knowledge, and per-verb
	 *  knowledge belongs in the table rather than in the dispatcher. */
	readonly seatFrom?: "ambient" | "argument";
	/** Why this row exists — read by humans, never by code. */
	readonly why: string;
	/** How a HUMAN caller sees this row's answer. REQUIRED on every routed row.
	 *
	 *  It is required because the alternative was shipped and it was wrong:
	 *  every row went live with no renderer, and the first one anybody typed —
	 *  `adopt` — REFUSED TO PRINT while the write had already persisted. The
	 *  operator was told it failed; sqlite disagreed. `/pij ready` tells a seat
	 *  to verify the write and never the print, so a seat obeying the guidance
	 *  concluded adopt had failed and retried. A failure line that persisted
	 *  everything — the exact inverse of the success-line-that-persists-nothing
	 *  this plan exists to close.
	 *
	 *  Making it a required field closes the CLASS: a new row cannot be added
	 *  without saying how a human reads it, so this cannot be latent again in a
	 *  verb nobody has typed yet.
	 *
	 *    "render"  — this row carries a `render` below.
	 *    "rs-line" — rs returns the finished sentence in `line` (u-report's
	 *                shape). Better where available: ONE copy of the wording,
	 *                on the side that knows the result. */
	readonly humanOutput: "render" | "rs-line";
	/** How a MACHINE caller sees this row's answer. REQUIRED, for the same
	 *  reason `humanOutput` is.
	 *
	 *  `--json` used to bypass every renderer and emit rs's payload RAW, so a
	 *  parser received rs's schema where the TS contract was promised. That is
	 *  the fourth instance of this plan's recurring seam — a value crossing by
	 *  literal schema with neither side testing the other's full shape — and it
	 *  is the WORST of the four, because the human path at least has a reader
	 *  who can see something is wrong. A parser cannot.
	 *
	 *  It is not a cosmetic gap. Legacy `whoami --json` always emits `verbs` and
	 *  `capabilitySchema`; a capability consumer reads a MISSING gate as an
	 *  ungated one, so raw rs output does not merely lose data, it reads as
	 *  PERMISSION. Absence is the dangerous direction.
	 *
	 *    "project" — the row carries `projectJson` and returns the TS contract.
	 *    "refuse"  — rs cannot honour the legacy contract for this verb, so
	 *                `--json` is refused BY NAME rather than answered wrongly. */
	readonly jsonOutput: "project" | "refuse";
	/** Build the legacy `--json` contract from rs's payload. Required when
	 *  `jsonOutput` is "project". */
	readonly projectJson?: (payload: unknown) => unknown;
	/** Why `--json` is refused, named for the caller. Required when
	 *  `jsonOutput` is "refuse". */
	readonly jsonRefusal?: string;
	/** How to render an rs payload for a HUMAN caller.
	 *
	 *  ac-1143 says the CLI's external surface is unchanged, and output shape is
	 *  half of that. A row that rs actually serves needs one of these, or a
	 *  human typing `pij report now "a" "b"` gets a JSON blob where a sentence
	 *  belongs. Wave 1 supplies none, because no rs handler exists to render;
	 *  the row that goes live is the row that must bring its renderer. Absent +
	 *  a human caller is a LOUD refusal, never a silent JSON blob — see
	 *  `cli.ts`. */
	readonly render?: (payload: unknown) => string;
}

/** Shared readers for the rs payloads these renderers print.
 *
 *  rs answers adopt/whoami with a SeatDescriptor and phonehome/state with their
 *  own shapes. Nothing here invents a field: where rs does not hold a fact the
 *  TS sentence carries, the renderer SAYS SO rather than omitting it silently or
 *  filling it in. A rendered line that quietly drops a fact is how a surface
 *  changes without anyone deciding to change it. */
function field(payload: unknown, name: string): unknown {
	return (payload as Record<string, unknown> | null | undefined)?.[name];
}

function text(payload: unknown, name: string): string | undefined {
	const value = field(payload, name);
	return typeof value === "string" && value !== "" ? value : undefined;
}

/** rs adopt/whoami -> the TS `adopt` sentence, cli.ts:3276/3280.
 *
 *  TS's bound form names the HARNESS SESSION ID. rs has no column for it and
 *  binds by `(pid, proc_start)` which it observes itself — so this says what rs
 *  actually did instead of printing a field it does not have. Naming the
 *  difference is the point; fabricating it would be the split-brain in
 *  miniature. */
function renderAdopt(payload: unknown): string {
	const id = text(payload, "id") ?? "?";
	const pane = text(payload, "pane");
	const proc = field(payload, "proc") as { readonly pid?: number } | undefined;
	const where = pane === undefined ? "no pane" : `pane ${pane}`;
	const bound =
		proc?.pid === undefined
			? "not bound to a process"
			: `bound by process identity (pid ${proc.pid}), which rs observes itself`;
	return `adopted ${id} (${where}, ${bound}) — peers can now: pij send ${id} "<text>"`;
}

/** rs whoami -> the TS `whoami` block, core/cli.ts:2787-2791.
 *
 *  `data dir` is omitted with a reason rather than blanked: rs seats have no
 *  data dir, and an empty value would read as one that failed to resolve. */
function renderWhoami(payload: unknown): string {
	return [
		`pij session: ${text(payload, "id") ?? "?"}`,
		`folder:      ${text(payload, "folder") ?? "?"}`,
		`state:       ${text(payload, "state") ?? "idle"}`,
		`role:        ${text(payload, "role") ?? "—"}`,
		"data dir:    — (rs seats have no data dir; the legacy store's concept)",
	].join("\n");
}

/** rs phonehome -> the TS `phoned home:` line, core/cli.ts:3757. */
function renderPhonehome(payload: unknown): string {
	const seat = text(payload, "seat") ?? "?";
	const harness = text(payload, "harness") ?? "?";
	if (field(payload, "bound") === true) {
		return `phoned home: ${seat} ↔ ${harness} (bound by process identity, observed by the daemon)`;
	}
	// NOT bound is the answer that matters most, so it says WHY rather than
	// leaving a seat to guess whether it exists.
	const why = text(payload, "resolved_by");
	return `phoned home: ${seat} — NOT bound${why === undefined ? "" : ` (${why})`}; rs binds by (pid, proc_start) and could not observe that pair`;
}

/** rs state -> the TS `state` line. Carries rs's own `unsupported` notes, which
 *  name by field what rs cannot honour instead of silently differing. */
function renderState(payload: unknown): string {
	const id = text(payload, "id") ?? "?";
	const head = `${id}: ${text(payload, "state") ?? "?"} · ${text(payload, "liveness") ?? "?"}`;
	const detail = [
		text(payload, "cwd") === undefined ? undefined : `cwd: ${text(payload, "cwd")}`,
		text(payload, "harness") === undefined ? undefined : `harness: ${text(payload, "harness")}`,
		text(payload, "parent") === undefined ? undefined : `parent: ${text(payload, "parent")}`,
	].filter((part): part is string => part !== undefined);
	const unsupported = field(payload, "unsupported");
	const note =
		Array.isArray(unsupported) && unsupported.length > 0
			? `\n  (${unsupported.length} field(s) the rs store does not carry — re-run with --json to see which and why)`
			: "";
	return `${head}${detail.length === 0 ? "" : `\n  ${detail.join("  ·  ")}`}${note}`;
}

/** THE ROUTE TABLE. Data, consumed by a dispatcher with no per-verb logic.
 *
 *  Wave 1 lists the five verbs the `/pij ready` gesture runs through. rs does
 *  not serve them YET (wave 2's u-identity / u-report / u-readback land the
 *  handlers), so today every one of these resolves to
 *  `legacy-rs-not-implemented` — VISIBLY, with the addr named. When wave 2
 *  lands a handler the row goes live with NO change here: the shim asks rs what
 *  it implements rather than carrying a second, drift-prone copy of that answer.
 *
 *  `tail` is deliberately absent — see the header. So are the orchestration
 *  verbs (plan non-goals). */
export const RS_ROUTE_TABLE: readonly RsRouteRow[] = [
	{
		verb: "adopt",
		jsonOutput: "refuse",
		jsonRefusal:
			"rs answers adopt with a SeatDescriptor and has no `lifecycle` (pending/bound) column — it binds by (pid, proc_start) it observes itself, so the legacy pending/bound distinction cannot be reproduced",
		rsPath: "/v1/adopt",
		method: "POST",
		humanOutput: "render",
		render: renderAdopt,
		why: "ready gesture step 1 — rs mints the seat id (ac-1147); the shim never invents a name",
	},
	{
		verb: "whoami",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy whoami --json carries `verbs` and `capabilitySchema`, the capability gate. rs holds neither, and a consumer reading a MISSING gate reads an UNGATED one — absence is the permissive direction, so emitting a partial object is worse than refusing",
		humanOutput: "render",
		render: renderWhoami,
		rsPath: "/v1/whoami",
		// POST, not GET: a GET carried no caller context, and rs cannot answer
		// "who am I" for a caller it cannot see. Reading verbs that must
		// TRANSMIT are POSTs here for that reason alone.
		method: "POST",
		why: "ready gesture step 2 — identity must answer from the store the seat registered into",
	},
	{
		verb: "phonehome",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy phonehome --json carries `harnessSessionId` and `lifecycle`; rs has no column for either and binds by process identity instead",
		humanOutput: "render",
		render: renderPhonehome,
		rsPath: "/v1/phonehome",
		method: "POST",
		why: "ready gesture's own success criterion (PM ack O2) — legacy answering it for an rs seat is the identity violation this plan prevents",
	},
	// FIVE LEAF ROWS ON ONE PATH. Per-leaf so `verify` can be held back; all of
	// them point at `/v1/report`, the single endpoint rs registers
	// (crates/daemon/src/http/mod.rs, `Endpoint::Report => "/v1/report"`). The
	// leaf travels in `argv`, which is how the handler already reads it.
	//
	// The first version of these rows invented `/v1/report/<leaf>` paths rs does
	// not serve. Nothing caught it: every report 404'd, classified as
	// not-implemented, fell back to legacy, and looked EXACTLY like a verb wave 2
	// had not landed yet — every suite green. Only driving the real CLI against a
	// real daemon showed it, which is why the path-agreement test exists.
	{
		verb: "report",
		leaf: "now",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy report --json emits the whole spine EVENT; rs returns its own receipt shape, and the two are not the same object",
		// rs returns the finished sentence in `line` — one copy of the wording,
		// on the side that knows the result.
		humanOutput: "rs-line",
		rsPath: "/v1/report",
		method: "POST",
		why: "ac-1142 — the card must be written where the seat lives",
	},
	{
		verb: "report",
		leaf: "state",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy report --json emits the whole spine EVENT; rs returns its own receipt shape, and the two are not the same object",
		// rs returns the finished sentence in `line` — one copy of the wording,
		// on the side that knows the result.
		humanOutput: "rs-line",
		rsPath: "/v1/report",
		method: "POST",
		why: "ac-1144 — report family parity",
	},
	{
		verb: "report",
		leaf: "blocked",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy report --json emits the whole spine EVENT; rs returns its own receipt shape, and the two are not the same object",
		// rs returns the finished sentence in `line` — one copy of the wording,
		// on the side that knows the result.
		humanOutput: "rs-line",
		rsPath: "/v1/report",
		method: "POST",
		why: "ac-1144 — report family parity",
	},
	{
		verb: "report",
		leaf: "clear",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy report --json emits the whole spine EVENT; rs returns its own receipt shape, and the two are not the same object",
		// rs returns the finished sentence in `line` — one copy of the wording,
		// on the side that knows the result.
		humanOutput: "rs-line",
		rsPath: "/v1/report",
		method: "POST",
		why: "ac-1144 — report family parity",
	},
	{
		verb: "report",
		leaf: "question",
		jsonOutput: "refuse",
		jsonRefusal:
			"legacy report --json emits the whole spine EVENT; rs returns its own receipt shape, and the two are not the same object",
		// rs returns the finished sentence in `line` — one copy of the wording,
		// on the side that knows the result.
		humanOutput: "rs-line",
		rsPath: "/v1/report",
		method: "POST",
		why: "ac-1144 — report family parity",
	},
	{
		verb: "state",
		jsonOutput: "refuse",
		jsonRefusal:
			"rs names its field `role` where the legacy contract says `orchestrationRole`, and its own answer lists 14 further fields it does not carry — a projection would be a rename over a hole",
		humanOutput: "render",
		render: renderState,
		rsPath: "/v1/state",
		method: "POST",
		// `pij state <id>` asks about ANOTHER seat.
		seatFrom: "argument",
		why: "ac-1142 — the card must be read back from the store that holds it",
	},
];

/** THE DENY LIST — consulted FIRST, and it outranks the route table.
 *
 *  Not decoration, and not a duplicate of "unlisted goes legacy". The default
 *  keeps a verb in legacy only while nobody adds a row; the deny list keeps it
 *  there EVEN IF SOMEONE DOES. That difference is the whole point.
 *
 *  ac-1145 was settled by the fact that routing `tail` required a deliberate
 *  human act. Anything that makes routing automatic — a capability ask, a
 *  generous default, a well-meaning row — gives that safety away, and the false
 *  friend then arrives BY ITSELF with nobody deciding anything: the day rs
 *  serves `tail` (daemon EVENT frames), every caller expecting the TS PEER
 *  TRANSCRIPT would silently receive the wrong object. The deny list is where
 *  "not this one, until someone decides otherwise" is written down.
 *
 *  `generation-routing.test.ts` pins this the only way that means anything: by
 *  putting `tail` IN the route table and asserting it is denied anyway. A test
 *  that merely asserted `tail` is absent from the table would pass just as
 *  happily with this list deleted. */
export const NEVER_ROUTED: readonly { readonly verb: string; readonly why: string }[] = [
	{
		verb: "inbox",
		why: "PANELESS ADMISSION IS UNSOLVED, and routing this breaks registration fleet-wide. Every rs registration requires BIND EVIDENCE — a (pid, proc_start) pair the daemon corroborates (crates/core/src/admission.rs:143, NoBindEvidence). It is an anti-impersonation control: a subagent inherits its parent's environment and can CLAIM anything, but cannot manufacture evidence for a session that is not its own. The paneless ready form `pij inbox register --json` names no pane and no process, so there is nothing to derive evidence from and rs must refuse. Under the never-bare-404 rule that refusal arrives WITH an envelope, which classifies as rs-error and never falls back — so a routed `inbox` would stop paneless seats registering ANYWHERE, where today they register in legacy and work. Forwarding the pij CLI's own pid is NOT the fix: it corroborates for the instant the process lives and then exits, binding the seat to a dead process so every later phonehome reports unbound — a worse lie than the refusal, and persisted. A designed admission path for pull-mode seats is its own row, not this plan's.",
	},
	{
		verb: "tail",
		why: "FALSE FRIEND (ac-1145, ruled — NO RENAME): TS `tail` follows a peer TRANSCRIPT, rs `tail` follows daemon EVENT frames. Same spelling, different objects. A caller asking for the transcript must never silently receive the event stream.",
	},
];

/** Find the row for a typed invocation. Leaf rows win over whole-verb rows, so
 *  a family can be routed wholesale and one leaf held back (or vice versa). */
export function findRoute(
	verb: string,
	leaf: string | undefined,
	table: readonly RsRouteRow[] = RS_ROUTE_TABLE,
): RsRouteRow | undefined {
	if (leaf !== undefined) {
		const exact = table.find((row) => row.verb === verb && row.leaf === leaf);
		if (exact !== undefined) return exact;
	}
	return table.find((row) => row.verb === verb && row.leaf === undefined);
}

/** What the shim tells rs about who is asking.
 *
 *  Every routed verb needs this and none of it reaches rs on its own. The
 *  bearer key is MACHINE-granularity, so it names no seat; and the TS verbs
 *  derive identity from the CLI PROCESS's ambient environment — a process that
 *  is the shim, not the daemon. Without transmitting it, rs is asked "who am
 *  I?" by a caller it cannot see.
 *
 *  A CLAIM, NOT AN IDENTITY. The daemon must validate every field of this
 *  against what it can observe; nothing here is evidence of anything, and the
 *  shim deliberately does no validation of its own (an unvalidated
 *  PIJ_SESSION_ID is how a phantom seat gets minted, and the fence for that
 *  lives on the rs side, not here). The shim's whole job is faithful
 *  transmission. */
export interface CallerContext {
	readonly pijSessionId?: string;
	readonly tmuxPane?: string;
	readonly pijParentId?: string;
	readonly claudeCodeSessionId?: string;
	readonly copilotAgentSessionId?: string;
	readonly codexThreadId?: string;
	readonly cwd?: string;
	readonly pid?: number;
	readonly procStart?: number;
}

/** The ONE allowlist of environment a routed call may carry.
 *
 *  An allowlist and never a blanket env dump: `process.env` on this fleet holds
 *  tokens and keys, and a generic passthrough would ship them to a daemon that
 *  never asked. Adding a field here is a deliberate act, which is the point.
 *  Absent stays ABSENT — a missing key is omitted rather than sent as null, so
 *  rs can tell "the caller had none" from "the caller sent an empty one". */
export const CALLER_ENV_ALLOWLIST = [
	["PIJ_SESSION_ID", "pijSessionId"],
	["TMUX_PANE", "tmuxPane"],
	["PIJ_PARENT_ID", "pijParentId"],
	["CLAUDE_CODE_SESSION_ID", "claudeCodeSessionId"],
	["COPILOT_AGENT_SESSION_ID", "copilotAgentSessionId"],
	["CODEX_THREAD_ID", "codexThreadId"],
] as const satisfies readonly (readonly [string, keyof CallerContext])[];

/** THE WIRE SPELLING — the single TS-side source of the key names that cross to
 *  Rust. Derived from the allowlist, never hand-written beside it: a second
 *  hand-maintained list is a third thing to keep in agreement, when the whole
 *  problem is that two things already drift.
 *
 *  CROSS-RUNTIME SEAM. The Rust reader matches these by literal. A rename on
 *  either side presents as a GREEN SUITE ON BOTH and a fleet that silently
 *  stops being attributable — both test suites pass, and every seat's report
 *  goes nowhere. This repo has been bitten by exactly this before, with
 *  PIJ_SPAWN_ID, where the Rust->TS match was human-verified only.
 *  `generation-seam.test.ts` holds the guard. */
export const CALLER_WIRE_KEYS: readonly string[] = [
	...CALLER_ENV_ALLOWLIST.map(([, field]) => field as string),
	"cwd",
	"pid",
	"procStart",
];

export function buildCallerContext(
	env: NodeJS.ProcessEnv,
	process: { readonly cwd?: string; readonly pid?: number; readonly procStart?: number },
): CallerContext {
	const caller: Record<string, string | number> = {};
	for (const [envName, field] of CALLER_ENV_ALLOWLIST) {
		const value = env[envName];
		if (value !== undefined && value !== "") caller[field] = value;
	}
	if (process.cwd !== undefined) caller.cwd = process.cwd;
	if (process.pid !== undefined) caller.pid = process.pid;
	// pid alone is not identifying — it is recycled at boot. The start time is
	// the tiebreaker, and rs's own register already requires the pair.
	if (process.procStart !== undefined) caller.procStart = process.procStart;
	return caller as CallerContext;
}

/** The seat id a routed call is ABOUT, given the row and the typed argv.
 *
 *  Pure and table-driven: the row says whether this verb speaks about the
 *  caller or about a named seat, and this reads the name out of argv when it
 *  does. Returns undefined when there is no positional to read — which stays
 *  "not known" rather than silently falling back to the ambient seat, because
 *  falling back is precisely the bug this exists to fix. */
export function subjectSeatFromArgv(
	row: RsRouteRow,
	argv: readonly string[],
	ambient: string | undefined,
): string | undefined {
	if (row.seatFrom !== "argument") return ambient;
	// argv[0] is the verb; a leaf row consumes one more token.
	const positionals = argv.slice(row.leaf === undefined ? 1 : 2).filter((t) => !t.startsWith("-"));
	return positionals[0];
}

export type GenerationForce = "rs" | "legacy" | undefined;

/** Forceback, BOTH directions, through the variable that already forces legacy.
 *
 *  Deliberately NOT `daemonGenerationPreference` from the adapter: that one maps
 *  UNSET to "rs" (req-0019, for the pi/omp extension, which has already cut
 *  over). The CLI must tell "unset" from "explicitly rs" apart, because forced
 *  rs NEVER falls back while default rs does. Same variable, same accepted
 *  values, same error text — one more return case. */
export function resolveGenerationForce(env: {
	readonly PIJ_DAEMON_GENERATION?: string | undefined;
}): GenerationForce {
	const value = env.PIJ_DAEMON_GENERATION;
	if (value === undefined || value === "") return undefined;
	if (value === "rs" || value === "legacy") return value;
	throw new Error(
		`PIJ_DAEMON_GENERATION has malformed value ${JSON.stringify(value)}: expected exactly "rs" or "legacy"`,
	);
}

/** Every way a verb can be served. NEVER collapse two of these into one: the
 *  whole point is that the operator can tell them apart (ac-1143). */
export type RouteOutcome =
	/** 1. Served by rs. */
	| { readonly kind: "rs"; readonly verb: string; readonly addr: string; readonly forced: boolean }
	/** Legacy, because the operator said so. */
	| { readonly kind: "legacy-forced"; readonly verb: string }
	/** Legacy, because the verb is on the DENY LIST — it stays in legacy even
	 *  if rs serves it and even if someone adds a route row. */
	| {
			readonly kind: "legacy-denied";
			readonly verb: string;
			readonly why: string;
	  }
	/** Legacy, because the table has no row — the default for every verb we
	 *  have not deliberately moved (this is `tail`'s answer). */
	| { readonly kind: "legacy-unrouted"; readonly verb: string }
	/** Legacy, because no rs daemon answered at the resolved addr. */
	| { readonly kind: "legacy-no-rs-daemon"; readonly verb: string; readonly addr: string }
	/** Legacy, because this seat holds NO rs credential at all.
	 *
	 *  Deliberately NOT the same outcome as `rs-auth-rejected`, and the
	 *  difference is not cosmetic. A key that EXISTS and is refused means the
	 *  seat has an rs relationship and something is broken — fail loud. NO key
	 *  file at all is the common case for a seat with no rs relationship at
	 *  all: registering into rs requires the key, so a seat that never had one
	 *  was never registered, and legacy is simply where it has always lived.
	 *
	 *  Collapsing the two costs the whole fleet: every seat that has never used
	 *  rs — and every sandboxed test process, which is how this was caught —
	 *  would hard-fail on adopt/whoami/report/state/phonehome instead of working
	 *  exactly as it does today. Still reported, never silent.
	 *
	 *  KNOWN LIMITATION, and the message says so rather than picking the
	 *  comfortable branch: key-absent has TWO causes and this side cannot tell
	 *  them apart. Either the seat was never registered in rs (benign — the
	 *  case above), or it WAS registered and the credential was later lost (a
	 *  wiped state dir, a subprocess with a different HOME, permissions). In
	 *  that second world an rs-resident seat is served by legacy, which is
	 *  precisely the re-homing the loud arm exists to prevent — arriving here
	 *  wearing the fallback's clothes. Distinguishing them requires asking rs,
	 *  which requires the key we do not have. So the outcome NAMES the
	 *  ambiguity instead of asserting the happy cause as fact. */
	| {
			readonly kind: "legacy-no-rs-credentials";
			readonly verb: string;
			readonly addr: string;
			readonly stateDir: string;
	  }
	/** 2. Legacy, because rs is live but does not implement this verb yet. */
	| {
			readonly kind: "legacy-rs-not-implemented";
			readonly verb: string;
			readonly addr: string;
			readonly rsPath: string;
	  }
	/** 3. Legacy, because the SEAT lives there — followed, never re-homed
	 *  (oq-1141: follow the seat, but make the follow visible). */
	| {
			readonly kind: "legacy-seat-followed";
			readonly verb: string;
			readonly addr: string;
			readonly seatId: string;
	  }
	/** NOT a fallback. rs is live but rejected our bearer key.
	 *
	 *  Its own named outcome, because it is the one failure an operator can
	 *  actually FIX, and because letting it read as not-implemented would
	 *  silently re-home EVERY routed verb to legacy on a missing key — the exact
	 *  silent re-homing this plan exists to prevent. `require_bearer` is a layer
	 *  over the whole rs router, so it runs BEFORE the route match: an
	 *  unauthenticated call to an unknown route also answers 401, which means
	 *  auth failure MASKS route-absence. Failing loud is the right trade, but
	 *  only if the operator is TOLD which of the two they are looking at. */
	| {
			readonly kind: "rs-auth-rejected";
			readonly verb: string;
			readonly addr: string;
			readonly stateDir: string;
	  }
	/** NOT a fallback. rs answered with something we cannot interpret — a
	 *  non-pij body, a wire-version skew, a truncated response.
	 *
	 *  Its own outcome because it used to be no outcome at all: `probeRs`
	 *  rethrew anything it could not classify, and the entrypoint launched the
	 *  routing promise with `void`, so a malformed rs body terminated whoami,
	 *  adopt, report and state as an UNHANDLED REJECTION. Nine carefully
	 *  distinguished outcomes and a tenth path that escaped all of them.
	 *
	 *  It must never fall back: we do not know what rs did, and answering from
	 *  legacy would be asserting an answer we never received. */
	| {
			readonly kind: "rs-unreadable";
			readonly verb: string;
			readonly addr: string;
			readonly detail: string;
	  }
	/** NOT a fallback. rs is live, but we could not read its roster, so we do
	 *  not know which store owns this seat.
	 *
	 *  A failed roster read used to collapse to `false` — "rs does not have this
	 *  seat" — which is a VERIFIED NEGATIVE we never verified. It then followed
	 *  the seat to legacy: silent re-homing, this plan's headline risk, arriving
	 *  through the guard added to prevent it. Could-not-read is an error. */
	| {
			readonly kind: "rs-roster-unreadable";
			readonly verb: string;
			readonly addr: string;
			readonly seatId: string;
			readonly detail: string;
	  }
	/** NOT a fallback. rs answered with a real failure and it is surfaced. */
	| {
			readonly kind: "rs-error";
			readonly verb: string;
			readonly addr: string;
			readonly detail: string;
	  };

/** True when the outcome means "run the legacy CLI path". `rs-error` is
 *  deliberately NOT in here — an rs failure is surfaced, never fallen back. */
export function servedByLegacy(outcome: RouteOutcome): boolean {
	return outcome.kind.startsWith("legacy-");
}

/** The diagnostic line. Names the GENERATION and — because two rs daemons have
 *  coexisted on this machine, each with its own state dir — THE ADDR that
 *  served (PM ack O4). "an rs daemon is live" is not the same claim as "the rs
 *  daemon holding this seat is live". */
export function describeOutcome(outcome: RouteOutcome): string {
	switch (outcome.kind) {
		case "rs":
			return `${outcome.verb}: served by rs at ${outcome.addr}${outcome.forced ? " (forced: PIJ_DAEMON_GENERATION=rs)" : ""}`;
		case "legacy-forced":
			return `${outcome.verb}: served by legacy (forced: PIJ_DAEMON_GENERATION=legacy)`;
		case "legacy-denied":
			return `${outcome.verb}: served by legacy (DENIED from rs routing on purpose — ${outcome.why})`;
		case "legacy-unrouted":
			return `${outcome.verb}: served by legacy (no rs route — this verb is not in the rs route table)`;
		case "legacy-no-rs-credentials":
			return `${outcome.verb}: served by legacy (rs at ${outcome.addr} is live, but there is no rs credential at ${outcome.stateDir}/daemon.key — either this seat was never registered in rs, or its credential is gone; these are indistinguishable from here)`;
		case "legacy-no-rs-daemon":
			return `${outcome.verb}: served by legacy (no rs daemon answered at ${outcome.addr})`;
		case "legacy-rs-not-implemented":
			return `${outcome.verb}: served by legacy (rs at ${outcome.addr} does not implement ${outcome.rsPath} yet)`;
		case "legacy-seat-followed":
			return `${outcome.verb}: served by legacy (seat ${outcome.seatId} lives in legacy; followed, not re-homed — rs at ${outcome.addr} is live)`;
		case "rs-auth-rejected":
			return `${outcome.verb}: rs at ${outcome.addr} REJECTED THE KEY — not falling back to legacy (read ${outcome.stateDir}/daemon.key; note rs checks auth BEFORE matching the route, so this can also mask a route rs does not implement)`;
		case "rs-unreadable":
			return `${outcome.verb}: rs at ${outcome.addr} answered with something this CLI cannot read — not falling back to legacy, because we do not know what rs did (${outcome.detail})`;
		case "rs-roster-unreadable":
			return `${outcome.verb}: rs at ${outcome.addr} is live but its seat roster could not be read, so which store owns \`${outcome.seatId}\` is UNKNOWN — refusing rather than assuming legacy (${outcome.detail})`;
		case "rs-error":
			return `${outcome.verb}: rs at ${outcome.addr} FAILED — not falling back to legacy (${outcome.detail})`;
	}
}

/** What the caller knows BEFORE any rs call is attempted. */
export interface PreCallInput {
	readonly verb: string;
	readonly leaf?: string | undefined;
	readonly force: GenerationForce;
	/** Resolved rs addr — always named, never "wherever rs happens to be". */
	readonly addr: string;
	/** Did an rs daemon answer at `addr`? */
	readonly rsLive: boolean;
	/** The ambient seat, when one resolves. */
	readonly seatId?: string | undefined;
	/** Does that seat exist in the rs store?
	 *    true / false  — a roster we ACTUALLY READ says so
	 *    "unreadable"  — we asked and could not find out. NOT the same as false,
	 *                    and the difference is a silent re-homing.
	 *    undefined     — not asked (no seat to ask about, or rs is not live). */
	readonly seatInRs?: boolean | "unreadable" | undefined;
	/** Does that seat exist in the legacy store? */
	readonly seatInLegacy?: boolean | undefined;
}

/** Stage one: decide without calling rs. Either "go ask rs" or a final outcome.
 *
 *  Ordering is load-bearing and is the identity-is-per-seat rule made
 *  mechanical: forced legacy wins over everything; then a missing row; then a
 *  dead daemon; then FORCED rs (which deliberately outranks the seat check, so
 *  an operator can always reach rs); then follow-the-seat. */
export function decidePreCall(
	input: PreCallInput,
	table: readonly RsRouteRow[] = RS_ROUTE_TABLE,
	deny: readonly { readonly verb: string; readonly why: string }[] = NEVER_ROUTED,
): { readonly kind: "try-rs"; readonly row: RsRouteRow } | RouteOutcome {
	const { verb, addr, force } = input;
	if (force === "legacy") return { kind: "legacy-forced", verb };
	// BEFORE the table lookup, and before any capability question: a denied verb
	// is denied no matter what the table or rs says. Forced rs does NOT override
	// it — an operator forcing a generation is choosing a daemon, not overruling
	// a false-friend ruling.
	const denied = deny.find((entry) => entry.verb === verb);
	if (denied !== undefined) return { kind: "legacy-denied", verb, why: denied.why };
	const row = findRoute(verb, input.leaf, table);
	if (row === undefined) return { kind: "legacy-unrouted", verb };
	if (!input.rsLive) {
		if (force === "rs") {
			return {
				kind: "rs-error",
				verb,
				addr,
				detail: "PIJ_DAEMON_GENERATION=rs was forced but no rs daemon answered",
			};
		}
		return { kind: "legacy-no-rs-daemon", verb, addr };
	}
	if (force === "rs") return { kind: "try-rs", row };
	// An unreadable roster is an ERROR, never a quiet legacy answer. We do not
	// know where this seat lives, and guessing is exactly the re-homing the
	// follow-the-seat rule exists to prevent.
	if (input.seatId !== undefined && input.seatInRs === "unreadable") {
		return {
			kind: "rs-roster-unreadable",
			verb,
			addr,
			seatId: input.seatId,
			detail: "the rs seat roster could not be read",
		};
	}
	// Follow the seat (oq-1141). Only when we actually know both answers: an
	// unknown is not a licence to re-home a seat, and it is not a licence to
	// claim we followed one either.
	if (input.seatId !== undefined && input.seatInRs === false && input.seatInLegacy === true) {
		return { kind: "legacy-seat-followed", verb, addr, seatId: input.seatId };
	}
	return { kind: "try-rs", row };
}

/** What rs's HTTP answer looked like. */
export interface RsResponseFacts {
	readonly status: number;
	/** Did the body decode as a pij envelope? THIS is the discriminator.
	 *
	 *  Verified against the live daemon 2026-09-01: an ABSENT axum route
	 *  answers 404 with an EMPTY body, while a handler's own not-found answers
	 *  404 carrying an envelope (`crates/daemon/src/http/mod.rs:650`, send to
	 *  an unknown seat). So "rs has no such route" and "rs says no" are
	 *  separable — which they must be, because one falls back and the other
	 *  must never. Status alone CANNOT tell them apart. */
	readonly envelopeDecoded: boolean;
	/** Refusal/parse detail, when there is one. */
	readonly detail?: string | undefined;
}

/** Stage two: classify rs's answer. Not-implemented falls back; anything rs
 *  actually said does not. */
export function classifyRsResponse(
	verb: string,
	addr: string,
	row: RsRouteRow,
	facts: RsResponseFacts,
	forced: boolean,
	stateDir: string,
): RouteOutcome {
	// Auth runs as a layer ABOVE the route match, so this is checked FIRST: a
	// 401 tells us nothing about whether the route exists, and must never be
	// read as not-implemented.
	if (facts.status === 401 || facts.status === 403) {
		return { kind: "rs-auth-rejected", verb, addr, stateDir };
	}
	// Route absent: 404/405 with nothing an rs handler would have written.
	if ((facts.status === 404 || facts.status === 405) && !facts.envelopeDecoded) {
		if (forced) {
			return {
				kind: "rs-error",
				verb,
				addr,
				detail: `PIJ_DAEMON_GENERATION=rs was forced but rs does not implement ${row.rsPath}`,
			};
		}
		return { kind: "legacy-rs-not-implemented", verb, addr, rsPath: row.rsPath };
	}
	if (facts.status >= 400) {
		return {
			kind: "rs-error",
			verb,
			addr,
			detail: facts.detail ?? `HTTP ${facts.status} from ${row.rsPath}`,
		};
	}
	return { kind: "rs", verb, addr, forced };
}

/** How an rs-served answer should be printed.
 *
 *  Pure, so it can be tested without a daemon. ac-1143's promise is that the
 *  CLI's external surface does not change, and output SHAPE is half of that
 *  promise — a human typing `pij report now "a" "b"` must not receive a JSON
 *  blob where a sentence belongs.
 *
 *  So a row rs actually serves must bring its own renderer. When it has none
 *  and the caller did not ask for JSON, this REFUSES rather than printing raw
 *  JSON: changing the output shape silently is the failure this plan exists to
 *  remove, and a loud refusal is the only answer that cannot be mistaken for
 *  normal output. Unreachable today — no rs handler exists — which is precisely
 *  why now is the cheap time for it to be strict. */
export type RsRenderResult =
	| { readonly kind: "json"; readonly text: string }
	| { readonly kind: "rendered"; readonly text: string }
	| { readonly kind: "no-renderer"; readonly message: string }
	/** `--json` asked for, and this row cannot honour the legacy contract. Loud,
	 *  because a parser cannot notice a quiet one. */
	| { readonly kind: "json-refused"; readonly message: string };

export function renderRsAnswer(
	row: RsRouteRow | undefined,
	payload: unknown,
	argv: readonly string[],
): RsRenderResult {
	if (argv.includes("--json")) {
		// NOT `JSON.stringify(payload)`. That handed rs's schema to a caller
		// promised the TS one.
		if (row?.jsonOutput === "project" && row.projectJson !== undefined) {
			return { kind: "json", text: JSON.stringify(row.projectJson(payload)) };
		}
		const name =
			row === undefined ? "?" : row.leaf === undefined ? row.verb : `${row.verb} ${row.leaf}`;
		return {
			kind: "json-refused",
			message: `rs served \`${name}\`, but its answer cannot be projected onto the \`--json\` contract this CLI promises${row?.jsonRefusal === undefined ? "" : ` — ${row.jsonRefusal}`}. Refusing rather than emitting a different schema under the same flag.`,
		};
	}
	// The row DECLARES how a human sees it, and the declaration is honoured in
	// the order it names. A row promising `render` that has none is a bug in the
	// table, not a reason to print a blob.
	if (row?.humanOutput === "render" && row.render !== undefined) {
		return { kind: "rendered", text: row.render(payload) };
	}
	// An rs handler may carry the exact sentence the TS CLI prints, in `line`.
	// Printing it beats re-deriving the wording here, which would put a second
	// copy of that sentence on this side of the wire — the thing that drifts.
	const line = (payload as { readonly line?: unknown } | null | undefined)?.line;
	if (typeof line === "string") return { kind: "rendered", text: line };
	const name =
		row === undefined ? "?" : row.leaf === undefined ? row.verb : `${row.verb} ${row.leaf}`;
	return {
		kind: "no-renderer",
		message: `rs served \`${name}\` but the route table has no human renderer for it — refusing to print raw JSON where the CLI's own output belongs (re-run with --json, or give the row a \`render\`)`,
	};
}

/** Is this a DIRECT paneless `adopt` — the form with no durable process to bind?
 *
 *  Pure, so it can be tested as behaviour rather than pinned by scanning source.
 *  (The first version of this guard WAS a source scan, and it broke on the very
 *  next edit to the code it was guarding — a pin that fails on refactor teaches
 *  the next person to loosen it.)
 *
 *  Legacy grammar requires a `%N` pane positional; routing now runs ahead of
 *  that parse, so without this the paneless form reaches rs, whose paneless
 *  branch accepts `caller.pid`/`caller.procStart` as bind evidence — and the
 *  only process the shim can offer is its own Node CLI, which exits when the
 *  command does. The seat is then bound to a dead pid, and the next phonehome
 *  is unbound or, worse, re-bound to whatever recycled that pid.
 *
 *  `--current` is the SANCTIONED paneless form: it aliases to `inbox register`,
 *  which is on the deny list and never routed. It must pass through. */
export function isDirectPanelessAdopt(verb: string, args: readonly string[]): boolean {
	if (verb !== "adopt") return false;
	if (args.includes("--current")) return false;
	return !args.some((token) => token.startsWith("%"));
}

/** What the caller is told when that form is refused. Its own constant so the
 *  REASON travels with the refusal — a bare grammar complaint would be "fixed"
 *  by someone relaxing the grammar. */
export const PANELESS_ADOPT_REFUSAL =
	'E-ARG: `pij adopt` needs the pane it is adopting — `pij adopt "$TMUX_PANE" --harness <h>`.\n' +
	"A paneless adopt has no durable process to bind to: the only process identity this\n" +
	"command could offer is the CLI's own, which exits when the command does, leaving the\n" +
	"seat bound to a dead pid. Use `pij adopt --current` for the paneless form.\n";
