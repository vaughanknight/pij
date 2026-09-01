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
	/** Why this row exists — read by humans, never by code. */
	readonly why: string;
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
		rsPath: "/v1/adopt",
		method: "POST",
		why: "ready gesture step 1 — rs mints the seat id (ac-1147); the shim never invents a name",
	},
	{
		verb: "whoami",
		rsPath: "/v1/whoami",
		method: "GET",
		why: "ready gesture step 2 — identity must answer from the store the seat registered into",
	},
	{
		verb: "phonehome",
		rsPath: "/v1/phonehome",
		method: "POST",
		why: "ready gesture's own success criterion (PM ack O2) — legacy answering it for an rs seat is the identity violation this plan prevents",
	},
	{
		verb: "report",
		rsPath: "/v1/report",
		method: "POST",
		why: "ac-1142 — the card must be written where the seat lives",
	},
	{
		verb: "state",
		rsPath: "/v1/state",
		method: "GET",
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
	 *  file at all means the opposite: this seat could never have registered
	 *  into rs, because registering requires the key. Legacy is therefore not a
	 *  re-homing, it is simply where the seat has always lived.
	 *
	 *  Collapsing the two costs the whole fleet: every seat that has never used
	 *  rs — and every sandboxed test process, which is how this was caught —
	 *  would hard-fail on adopt/whoami/report/state/phonehome instead of working
	 *  exactly as it does today. Still reported, never silent. */
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
			return `${outcome.verb}: served by legacy (rs at ${outcome.addr} is live, but this seat holds no rs credential — ${outcome.stateDir}/daemon.key is absent, so it was never registered in rs)`;
		case "legacy-no-rs-daemon":
			return `${outcome.verb}: served by legacy (no rs daemon answered at ${outcome.addr})`;
		case "legacy-rs-not-implemented":
			return `${outcome.verb}: served by legacy (rs at ${outcome.addr} does not implement ${outcome.rsPath} yet)`;
		case "legacy-seat-followed":
			return `${outcome.verb}: served by legacy (seat ${outcome.seatId} lives in legacy; followed, not re-homed — rs at ${outcome.addr} is live)`;
		case "rs-auth-rejected":
			return `${outcome.verb}: rs at ${outcome.addr} REJECTED THE KEY — not falling back to legacy (read ${outcome.stateDir}/daemon.key; note rs checks auth BEFORE matching the route, so this can also mask a route rs does not implement)`;
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
	/** Does that seat exist in the rs store? `undefined` = not asked/unknowable. */
	readonly seatInRs?: boolean | undefined;
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
