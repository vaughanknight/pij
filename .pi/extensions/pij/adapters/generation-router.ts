/** I/O half of generation-aware routing (plan 114, u-route).
 *
 *  The decisions live in `core/generation-routing.ts` and are pure. This file
 *  only does the things that touch the world: resolve the addr, probe rs,
 *  perform the call. It contains NO per-verb logic — every verb takes the same
 *  path through here, and which verbs those are is the table's business.
 *
 *  Detection is REUSED, not re-minted: `detectDaemonGeneration` is the shipped
 *  detector (used by the pi/omp extension at `index.ts:285`, with its own
 *  tests). A second detector would be a second answer to "which daemon is
 *  live", and they would drift.
 *
 *  This file mints no seat ids either (ac-1147).
 */

import { readFile as fsReadFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	DaemonRefusalError,
	decodeEnvelope,
	PijNoDaemonError,
	PijWireSkewError,
} from "../core/daemon-wire.js";
import {
	buildCallerContext,
	classifyRsResponse,
	decidePreCall,
	describeOutcome,
	findRoute,
	NEVER_ROUTED,
	type RouteOutcome,
	RS_ROUTE_TABLE,
	type RsRouteRow,
	resolveGenerationForce,
	subjectSeatFromArgv,
} from "../core/generation-routing.js";
import {
	type DaemonLocation,
	daemonLocation,
	detectDaemonGeneration,
	observedProcessStart,
} from "./daemon-http.js";

export interface GenerationRouterDeps {
	readonly fetch: typeof fetch;
	readonly readFile: typeof fsReadFile;
	readonly env: NodeJS.ProcessEnv;
	readonly home: string;
	/** The ambient seat id, when one resolves — used only to follow a seat that
	 *  lives in legacy. `undefined` means "we do not know", which is never
	 *  treated as evidence either way. */
	readonly ambientSeatId?: (() => string | undefined) | undefined;
	/** Does the legacy store hold this seat? */
	readonly seatInLegacy?: ((id: string) => boolean) | undefined;
	/** Does the rs store hold this seat? Absent = the question was not asked;
	 *  absence is never read as "no". */
	readonly seatInRs?:
		| ((id: string) => Promise<boolean | "unreadable"> | boolean | "unreadable")
		| undefined;
	/** Where the caller is running. */
	readonly cwd?: (() => string) | undefined;
	/** The caller's own pid, and when that process started. The pair matters:
	 *  a pid is recycled at boot, so the start time is what makes it identify
	 *  anything. Best-effort — a start time we cannot read is omitted, never
	 *  guessed. */
	readonly pid?: (() => number) | undefined;
	readonly procStart?: ((pid: number) => number) | undefined;
}

/** The addr/state-dir routing resolves against. Re-exported so the CLI wires
 *  its rs seat lookup against the SAME location routing will use, rather than
 *  resolving a second one that could drift. */
export function daemonLocationForRouting(env: NodeJS.ProcessEnv, home: string): DaemonLocation {
	return daemonLocation(env, home);
}

export function defaultRouterDeps(): GenerationRouterDeps {
	return {
		fetch,
		readFile: fsReadFile,
		env: process.env,
		home: homedir(),
		cwd: () => process.cwd(),
		pid: () => process.pid,
		procStart: observedProcessStart,
	};
}

/** What the rs daemon looked like when we asked. */
/** What a routed call produced. `row` rides along so the caller can render
 *  the payload the way that row says to. */
export interface RouteResult {
	readonly outcome: RouteOutcome;
	readonly payload?: unknown;
	readonly row?: RsRouteRow;
}

export type RsProbe =
	| { readonly kind: "live"; readonly location: DaemonLocation }
	| { readonly kind: "absent"; readonly location: DaemonLocation }
	| { readonly kind: "auth-rejected"; readonly location: DaemonLocation }
	/** rs is live, but we hold no key at all — a different fact from "rs
	 *  refused our key", and it must stay different. */
	| { readonly kind: "no-credentials"; readonly location: DaemonLocation }
	/** Something answered at the addr and we could not interpret it. */
	| {
			readonly kind: "unreadable";
			readonly location: DaemonLocation;
			readonly detail: string;
	  };

/** Probe rs THROUGH the shipped detector, and translate its three shipped
 *  outcomes into ours.
 *
 *  `detectDaemonGeneration` signals by throwing, and the two throws mean
 *  opposite things: `PijNoDaemonError` is "nothing is listening" (fall back
 *  quietly), while an auth refusal is "rs is RIGHT THERE and said no" (never
 *  fall back). Collapsing those into one catch is how a wrong key would look
 *  exactly like an absent daemon and silently re-home every verb. */
export async function probeRs(deps: GenerationRouterDeps): Promise<RsProbe> {
	const location = daemonLocation(deps.env, deps.home);
	try {
		const generation = await detectDaemonGeneration(location, "rs", {
			fetch: deps.fetch,
			readFile: deps.readFile,
			// Never consulted on this path; routing asks who is listening, not
			// when a process started.
			processStart: () => 0,
		});
		return generation.kind === "rust" ? { kind: "live", location } : { kind: "absent", location };
	} catch (error) {
		if (error instanceof PijNoDaemonError) return { kind: "absent", location };
		if (error instanceof PijWireSkewError) {
			return { kind: "unreadable", location, detail: error.message };
		}
		if (error instanceof DaemonRefusalError && error.kind === "auth") {
			// Which auth failure? The detector raises the same error for "rs
			// refused the key we sent" and "we had no key to send", and those
			// want opposite handling. Ask the one question that separates them.
			return (await hasCredential(location, deps))
				? { kind: "auth-rejected", location }
				: { kind: "no-credentials", location };
		}
		// NEVER rethrow. This used to `throw error`, and the entrypoint launched
		// routing with `void`, so anything unclassifiable here — a non-pij body,
		// a truncated response — killed the command as an unhandled rejection.
		return {
			kind: "unreadable",
			location,
			detail: error instanceof Error ? error.message : String(error),
		};
	}
}

/** The caller's own process facts, best-effort.
 *
 *  A start time we cannot read is OMITTED rather than defaulted: a wrong start
 *  time is worse than none, because it would corroborate a recycled pid. */
function callerProcessFacts(deps: GenerationRouterDeps): {
	readonly cwd?: string;
	readonly pid?: number;
	readonly procStart?: number;
} {
	const pid = deps.pid?.();
	let procStart: number | undefined;
	if (pid !== undefined && deps.procStart !== undefined) {
		try {
			procStart = deps.procStart(pid);
		} catch {
			procStart = undefined;
		}
	}
	return {
		...(deps.cwd === undefined ? {} : { cwd: deps.cwd() }),
		...(pid === undefined ? {} : { pid }),
		...(procStart === undefined ? {} : { procStart }),
	};
}

/** Is there an rs credential on this machine for this state dir at all?
 *
 *  The single fact that tells "rs said no to us" apart from "we had nothing to
 *  say". Registering into rs requires this key, so its absence proves the seat
 *  is not in the rs store. */
async function hasCredential(
	location: DaemonLocation,
	deps: GenerationRouterDeps,
): Promise<boolean> {
	try {
		return (await deps.readFile(join(location.stateDir, "daemon.key"), "utf8")).trim() !== "";
	} catch {
		return false;
	}
}

/** Decide — and, when the answer is rs, perform — the routing of one verb.
 *
 *  Returns the outcome. `servedByLegacy(outcome)` tells the caller to run the
 *  legacy path; an `rs-*` outcome means legacy must NOT run. */
export async function routeVerb(
	verb: string,
	leaf: string | undefined,
	argv: readonly string[],
	deps: GenerationRouterDeps = defaultRouterDeps(),
	table: readonly RsRouteRow[] = RS_ROUTE_TABLE,
): Promise<RouteResult> {
	const force = resolveGenerationForce(deps.env);

	// A forced-legacy run must not touch the network at all: the operator has
	// already said where to go, and probing would only add a way to fail.
	if (force === "legacy") {
		return { outcome: { kind: "legacy-forced", verb } };
	}

	const probe = await probeRs(deps);
	const addr = probe.location.addr;

	if (probe.kind === "unreadable") {
		return {
			outcome: { kind: "rs-unreadable", verb, addr, detail: probe.detail },
		};
	}
	if (probe.kind === "no-credentials") {
		return {
			outcome: {
				kind: "legacy-no-rs-credentials",
				verb,
				addr,
				stateDir: probe.location.stateDir,
			},
		};
	}
	if (probe.kind === "auth-rejected") {
		return {
			outcome: {
				kind: "rs-auth-rejected",
				verb,
				addr,
				stateDir: probe.location.stateDir,
			},
		};
	}

	// WHICH seat this call is about. The row decides: identity verbs speak about
	// the caller, `state <id>` speaks about someone else. Resolved before the
	// store questions, because asking about the wrong seat is how follow-the-seat
	// gets defeated while still looking implemented.
	const ambient = deps.ambientSeatId?.();
	const row = findRoute(verb, leaf, table);
	const seatId = row === undefined ? ambient : subjectSeatFromArgv(row, argv, ambient);
	// Only asked when rs is live AND there is a seat to ask about. An
	// unanswerable question stays unanswered rather than becoming a guess:
	// `undefined` here means "not known", and decidePreCall refuses to follow a
	// seat on anything less than both answers.
	const seatInRs =
		probe.kind === "live" && seatId !== undefined && deps.seatInRs !== undefined
			? await deps.seatInRs(seatId)
			: undefined;
	const pre = decidePreCall(
		{
			verb,
			leaf,
			force,
			addr,
			rsLive: probe.kind === "live",
			seatId,
			seatInRs,
			seatInLegacy: seatId === undefined ? undefined : deps.seatInLegacy?.(seatId),
		},
		table,
	);
	if (pre.kind !== "try-rs") return { outcome: pre };

	return callRs(verb, pre.row, argv, probe.location, deps, force === "rs");
}

/** The one call site. Generic by construction: the row says where to go and how,
 *  the argv rides along untouched. Wave 2 owns the per-verb request/response
 *  SHAPES against its own handlers; nothing about them belongs here. */
async function callRs(
	verb: string,
	row: RsRouteRow,
	argv: readonly string[],
	location: DaemonLocation,
	deps: GenerationRouterDeps,
	forced: boolean,
): Promise<RouteResult> {
	let key: string | undefined;
	try {
		key = (await deps.readFile(join(location.stateDir, "daemon.key"), "utf8")).trim();
	} catch {
		// Left undefined on purpose: rs answers 401, which classifies as
		// auth-rejected. Guessing a key here would turn a clear refusal into a
		// murky one.
	}
	const url = `http://${location.addr}${row.rsPath}`;
	const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
	// Who is asking. Built for EVERY routed call, because every routed verb
	// needs it and none of it reaches rs any other way: the bearer key is
	// machine-granularity and names no seat, and the identity the TS verbs read
	// lives in this process's environment, which the daemon cannot see.
	const caller = buildCallerContext(deps.env, callerProcessFacts(deps));
	let response: Awaited<ReturnType<typeof fetch>>;
	try {
		response =
			row.method === "GET"
				? await deps.fetch(url, { headers })
				: await deps.fetch(url, {
						method: "POST",
						headers: { ...headers, "Content-Type": "application/json" },
						body: JSON.stringify({ argv, caller }),
					});
	} catch (error) {
		// The daemon answered the probe and then failed this call. That is a real
		// rs failure, not an absence — surface it.
		return {
			outcome: {
				kind: "rs-error",
				verb,
				addr: location.addr,
				detail: error instanceof Error ? error.message : String(error),
			},
		};
	}
	const body = await response.text();
	let envelopeDecoded = false;
	let payload: unknown;
	let detail: string | undefined;
	try {
		payload = decodeEnvelope<unknown>(body).data;
		envelopeDecoded = true;
	} catch (error) {
		// A DECODABLE refusal is still rs answering — it just answered "no".
		// Only an undecodable body means nothing of rs's was there at all.
		if (error instanceof DaemonRefusalError) {
			envelopeDecoded = true;
			detail = error.message;
		} else {
			detail = error instanceof Error ? error.message : String(error);
		}
	}
	const outcome = classifyRsResponse(
		verb,
		location.addr,
		row,
		{ status: response.status, envelopeDecoded, detail },
		forced,
		location.stateDir,
	);
	return outcome.kind === "rs" ? { outcome, payload, row } : { outcome, row };
}

/** One row of `pij generation` output. */
export interface GenerationDecision {
	readonly verb: string;
	readonly generation: "rs" | "legacy" | "rs-failed";
	readonly addr: string;
	readonly line: string;
}

/** Decide, for each verb, who would serve it — WITHOUT performing the verb.
 *
 *  The restraint is deliberate. Settling the not-implemented case requires
 *  asking rs, and asking rs for `adopt` means POSTing /v1/adopt, which would
 *  adopt the caller. A diagnostic must not do the thing it is describing. So
 *  this reports the decision it can actually make and names the one it cannot,
 *  rather than presenting a guess in the same voice as a fact. */
export async function probeDecisionOnly(
	verbs?: readonly string[],
	deps: GenerationRouterDeps = defaultRouterDeps(),
): Promise<readonly GenerationDecision[]> {
	const force = resolveGenerationForce(deps.env);
	// Enumerate ROWS, not verbs. A leaf row (`inbox register`, `report now`) is
	// invisible to a verb-only listing, and the listing then reports it as
	// unrouted — a diagnostic contradicting the table it describes.
	// Asking about a verb that only has LEAF rows must show those leaves, or
	// `pij generation report` answers "no rs route" about a verb whose five
	// leaves are routed — true of the bare token, and misleading about the verb.
	const expand = (verb: string): readonly { readonly verb: string; readonly leaf?: string }[] => {
		const leaves = RS_ROUTE_TABLE.filter((row) => row.verb === verb && row.leaf !== undefined);
		return leaves.length > 0 ? leaves.map((row) => ({ verb, leaf: row.leaf })) : [{ verb }];
	};
	const asked: readonly { readonly verb: string; readonly leaf?: string }[] =
		verbs !== undefined
			? verbs.flatMap(expand)
			: [
					...NEVER_ROUTED.map((entry) => ({ verb: entry.verb })),
					...RS_ROUTE_TABLE.map((row) => ({ verb: row.verb, leaf: row.leaf })),
				];
	const probe = force === "legacy" ? undefined : await probeRs(deps);
	const location = probe?.location ?? daemonLocation(deps.env, deps.home);
	const addr = location.addr;
	const seatId = deps.ambientSeatId?.();
	// Ask BOTH stores, exactly as the real call does. Asking only the legacy
	// side leaves `seatInRs` undefined, and decidePreCall — correctly — refuses
	// to follow a seat on one answer, so the diagnostic would report "would be
	// attempted against rs" for a seat the real call sends to legacy.
	const seatInRs =
		probe?.kind === "live" && seatId !== undefined && deps.seatInRs !== undefined
			? await deps.seatInRs(seatId)
			: undefined;

	return asked.map(({ verb, leaf }) => {
		const label = leaf === undefined ? verb : `${verb} ${leaf}`;
		if (probe?.kind === "no-credentials") {
			const outcome: RouteOutcome = {
				kind: "legacy-no-rs-credentials",
				verb,
				addr,
				stateDir: location.stateDir,
			};
			return { verb: label, generation: "legacy" as const, addr, line: describeOutcome(outcome) };
		}
		if (probe?.kind === "auth-rejected") {
			const outcome: RouteOutcome = {
				kind: "rs-auth-rejected",
				verb,
				addr,
				stateDir: location.stateDir,
			};
			return {
				verb: label,
				generation: "rs-failed" as const,
				addr,
				line: describeOutcome(outcome),
			};
		}
		const pre = decidePreCall({
			verb,
			leaf,
			force,
			addr,
			rsLive: probe?.kind === "live",
			seatId,
			seatInRs,
			seatInLegacy: seatId === undefined ? undefined : deps.seatInLegacy?.(seatId),
		});
		if (pre.kind === "try-rs") {
			return {
				verb: label,
				generation: "rs" as const,
				addr,
				line: `${label}: would be attempted against rs at ${addr} (${pre.row.rsPath}) — whether rs SERVES it or answers not-implemented is settled by rs, and this diagnostic does not perform the call to find out`,
			};
		}
		return {
			verb: label,
			generation: pre.kind === "rs-error" ? ("rs-failed" as const) : ("legacy" as const),
			addr,
			// Re-label so a leaf row reads "report now", not a bare "report"
			// repeated five times.
			line: describeOutcome({ ...pre, verb: label } as RouteOutcome),
		};
	});
}

/** Ask rs whether it holds a seat — once per invocation, memoised.
 *
 *  Exported so the CLI call site can wire follow-the-seat with a real lookup
 *  instead of leaving the dep undefined. A dep that is never supplied makes the
 *  outcome it guards unreachable while the tests that hand it in still pass,
 *  which is how `legacy-seat-followed` came to be declared, tested, and dead in
 *  production. */
export function rsSeatLookup(
	location: DaemonLocation,
	deps: GenerationRouterDeps,
): (id: string) => Promise<boolean | "unreadable"> {
	let roster: Promise<ReadonlySet<string> | undefined> | undefined;
	return async (id: string) => {
		roster ??= (async () => {
			try {
				const key = (await deps.readFile(join(location.stateDir, "daemon.key"), "utf8")).trim();
				const response = await deps.fetch(`http://${location.addr}/v1/seats`, {
					headers: { Authorization: `Bearer ${key}` },
				});
				const data = decodeEnvelope<{ readonly seats?: readonly { readonly id?: string }[] }>(
					await response.text(),
				).data;
				return new Set(
					(data.seats ?? [])
						.map((seat) => seat.id)
						.filter((seatId): seatId is string => seatId !== undefined),
				);
			} catch {
				// Unanswerable. An empty roster would assert "rs does not have
				// this seat" — a VERIFIED NEGATIVE we never verified, and the
				// route that turns it into a silent legacy follow.
				return undefined;
			}
		})();
		const resolved = await roster;
		return resolved === undefined ? "unreadable" : resolved.has(id);
	};
}
