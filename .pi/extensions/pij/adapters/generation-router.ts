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
import { DaemonRefusalError, decodeEnvelope, PijNoDaemonError } from "../core/daemon-wire.js";
import {
	classifyRsResponse,
	decidePreCall,
	describeOutcome,
	NEVER_ROUTED,
	type RouteOutcome,
	RS_ROUTE_TABLE,
	type RsRouteRow,
	resolveGenerationForce,
} from "../core/generation-routing.js";
import { type DaemonLocation, daemonLocation, detectDaemonGeneration } from "./daemon-http.js";

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
	readonly seatInRs?: ((id: string) => Promise<boolean> | boolean) | undefined;
}

export function defaultRouterDeps(): GenerationRouterDeps {
	return { fetch, readFile: fsReadFile, env: process.env, home: homedir() };
}

/** What the rs daemon looked like when we asked. */
export type RsProbe =
	| { readonly kind: "live"; readonly location: DaemonLocation }
	| { readonly kind: "absent"; readonly location: DaemonLocation }
	| { readonly kind: "auth-rejected"; readonly location: DaemonLocation }
	/** rs is live, but we hold no key at all — a different fact from "rs
	 *  refused our key", and it must stay different. */
	| { readonly kind: "no-credentials"; readonly location: DaemonLocation };

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
		if (error instanceof DaemonRefusalError && error.kind === "auth") {
			// Which auth failure? The detector raises the same error for "rs
			// refused the key we sent" and "we had no key to send", and those
			// want opposite handling. Ask the one question that separates them.
			return (await hasCredential(location, deps))
				? { kind: "auth-rejected", location }
				: { kind: "no-credentials", location };
		}
		throw error;
	}
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
): Promise<{ readonly outcome: RouteOutcome; readonly payload?: unknown }> {
	const force = resolveGenerationForce(deps.env);

	// A forced-legacy run must not touch the network at all: the operator has
	// already said where to go, and probing would only add a way to fail.
	if (force === "legacy") {
		return { outcome: { kind: "legacy-forced", verb } };
	}

	const probe = await probeRs(deps);
	const addr = probe.location.addr;

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

	const seatId = deps.ambientSeatId?.();
	// Only asked when rs is live AND there is a seat to ask about. An
	// unanswerable question stays unanswered rather than becoming a guess:
	// `undefined` here means "not known", and decidePreCall refuses to follow a
	// seat on anything less than both answers.
	const seatInRs =
		probe.kind === "live" && seatId !== undefined && deps.seatInRs !== undefined
			? await deps.seatInRs(seatId)
			: undefined;
	const pre = decidePreCall({
		verb,
		leaf,
		force,
		addr,
		rsLive: probe.kind === "live",
		seatId,
		seatInRs,
		seatInLegacy: seatId === undefined ? undefined : deps.seatInLegacy?.(seatId),
	});
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
): Promise<{ readonly outcome: RouteOutcome; readonly payload?: unknown }> {
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
	let response: Awaited<ReturnType<typeof fetch>>;
	try {
		response =
			row.method === "GET"
				? await deps.fetch(url, { headers })
				: await deps.fetch(url, {
						method: "POST",
						headers: { ...headers, "Content-Type": "application/json" },
						body: JSON.stringify({ argv }),
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
	return outcome.kind === "rs" ? { outcome, payload } : { outcome };
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
	const asked = verbs ?? [
		...NEVER_ROUTED.map((entry) => entry.verb),
		...RS_ROUTE_TABLE.map((row) => row.verb),
	];
	const probe = force === "legacy" ? undefined : await probeRs(deps);
	const location = probe?.location ?? daemonLocation(deps.env, deps.home);
	const addr = location.addr;
	const seatId = deps.ambientSeatId?.();

	return asked.map((verb) => {
		if (probe?.kind === "no-credentials") {
			const outcome: RouteOutcome = {
				kind: "legacy-no-rs-credentials",
				verb,
				addr,
				stateDir: location.stateDir,
			};
			return { verb, generation: "legacy" as const, addr, line: describeOutcome(outcome) };
		}
		if (probe?.kind === "auth-rejected") {
			const outcome: RouteOutcome = {
				kind: "rs-auth-rejected",
				verb,
				addr,
				stateDir: location.stateDir,
			};
			return { verb, generation: "rs-failed" as const, addr, line: describeOutcome(outcome) };
		}
		const pre = decidePreCall({
			verb,
			force,
			addr,
			rsLive: probe?.kind === "live",
			seatId,
			seatInLegacy: seatId === undefined ? undefined : deps.seatInLegacy?.(seatId),
		});
		if (pre.kind === "try-rs") {
			return {
				verb,
				generation: "rs" as const,
				addr,
				line: `${verb}: would be attempted against rs at ${addr} (${pre.row.rsPath}) — whether rs SERVES it or answers not-implemented is settled by rs, and this diagnostic does not perform the call to find out`,
			};
		}
		return {
			verb,
			generation: pre.kind === "rs-error" ? ("rs-failed" as const) : ("legacy" as const),
			addr,
			line: describeOutcome(pre),
		};
	});
}
