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
import { resolvePijHome } from "../core/agents/paths.js";
import { mergeSessionRows } from "../core/cli.js";
import {
	DaemonRefusalError,
	decodeEnvelope,
	PijNoDaemonError,
	PijWireSkewError,
} from "../core/daemon-wire.js";
import { filterByFolder, selectByRepository } from "../core/discovery.js";
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
import { buildSessionJoinRows, type JoinRow } from "../core/session-join.js";
import {
	type DaemonLocation,
	daemonLocation,
	detectDaemonGeneration,
	observedProcessStart,
} from "./daemon-http.js";
import { FsRegistry } from "./fs-registry.js";
import { GitRepositoryAdapter } from "./git-repository.js";

export interface GenerationRouterDeps {
	readonly fetch: typeof fetch;
	readonly readFile: typeof fsReadFile;
	/** Read a `--body-file` argument: a path, or `-` for this process's stdin.
	 *
	 *  Separate from `readFile` because `-` is not a path and the stdin read is
	 *  the whole reason this indirection exists — a test must be able to supply
	 *  a body without a file system or a live stdin. */
	readonly readBody: (path: string) => Promise<string>;
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
	/** Which rs seat owns this pane, if any. See [`rsSeatByPane`]. */
	readonly rsSeatByPane?:
		| ((pane: string) => Promise<string | undefined | "unreadable">)
		| undefined;
	readonly seatInRs?:
		| ((id: string) => Promise<boolean | "unreadable"> | boolean | "unreadable")
		| undefined;
	/** Where the caller is running. */
	readonly cwd?: (() => string) | undefined;
	/** Resolve a folder to the repository identity shared by linked worktrees. */
	readonly gitCommonDir?: ((folder: string) => string | null) | undefined;
	/** The caller's own pid, and when that process started. The pair matters:
	 *  a pid is recycled at boot, so the start time is what makes it identify
	 *  anything. Best-effort — a start time we cannot read is omitted, never
	 *  guessed. */
	readonly pid?: (() => number) | undefined;
	readonly procStart?: ((pid: number) => number) | undefined;
	/** Legacy half of the sessions union. The argv is supplied so `--here`
	 *  preserves the existing legacy filter before the rs rows are merged. */
	readonly legacySessionRows?: ((argv: readonly string[]) => readonly JoinRow[]) | undefined;
}

/** The addr/state-dir routing resolves against. Re-exported so the CLI wires
 *  its rs seat lookup against the SAME location routing will use, rather than
 *  resolving a second one that could drift. */
export function daemonLocationForRouting(env: NodeJS.ProcessEnv, home: string): DaemonLocation {
	return daemonLocation(env, home);
}

export function defaultRouterDeps(): GenerationRouterDeps {
	const repository = new GitRepositoryAdapter();
	const env = process.env;
	const cwd = () => process.cwd();
	return {
		fetch,
		readFile: fsReadFile,
		readBody: async (path: string) =>
			path === "-"
				? await fsReadFile(0 as unknown as string, "utf8")
				: await fsReadFile(path, "utf8"),
		env,
		home: homedir(),
		cwd,
		gitCommonDir: (folder) => repository.gitCommonDir(folder),
		pid: () => process.pid,
		procStart: observedProcessStart,
		legacySessionRows: (argv) => {
			let descriptors = new FsRegistry(resolvePijHome(env)).list();
			if (argv.includes("--here")) {
				const folder = cwd();
				const selection = selectByRepository(descriptors, folder, repository);
				descriptors =
					selection.gitCommonDir === null
						? filterByFolder(descriptors, folder)
						: selection.descriptors;
			}
			return buildSessionJoinRows(descriptors);
		},
	};
}

/** What the rs daemon looked like when we asked. */
/** What a routed call produced. `row` rides along so the caller can render
 *  the payload the way that row says to. */
export interface RouteResult {
	readonly outcome: RouteOutcome;
	readonly payload?: unknown;
	readonly row?: RsRouteRow;
	/** Finish a two-step read, AFTER the caller has decoded and shown it.
	 *
	 *  F4. `inbox` is a claim-then-acknowledge contract: the claim moves the job
	 *  to `running` and records nothing, and the client acknowledges only once it
	 *  actually HAS the message — so a client that dies mid-read gets a duplicate
	 *  rather than a silent loss. A routed read that never acked left the job
	 *  running, recorded no `ReaderRead`, and let the message be claimed again
	 *  after the lease expired, while printing "claimed" perfectly honestly.
	 *
	 *  It is a closure rather than something the caller assembles because the key
	 *  and the addr live here, and it is returned rather than performed here
	 *  because the ORDER is the contract: rendering first, acknowledging second.
	 *
	 *  Resolves to a warning when the acknowledgement fails. Never throws: the
	 *  message is already in the caller's hands, and a duplicate read is safer
	 *  than a failure that hides a body they have already been shown. */
	readonly acknowledge?: () => Promise<string | undefined>;
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
	let seatInRs: boolean | "unreadable" | undefined =
		probe.kind === "live" && seatId !== undefined && deps.seatInRs !== undefined
			? await deps.seatInRs(seatId)
			: undefined;
	// F2, plan 119 — CALLER EVIDENCE, for the rows that demand rs residency.
	//
	// `ambientSeatId` reads the LEGACY registry, so a fresh rs-only seat resolves
	// to nothing: `seatId` is undefined, `seatInRs` is never even asked, and
	// `requiresSeatInRs` then refuses to route for precisely the population the
	// routing exists to serve. The precondition was right and the only evidence
	// it could see came from the wrong store.
	//
	// A pane is evidence the caller already carries and rs can check against its
	// own roster. Matching it claims NOTHING — no session id is asserted, and the
	// daemon still derives the acting seat itself through the ladder on every
	// call. This only answers "does rs hold a live seat on my pane".
	//
	// Deliberately narrow: it runs only for a row that asks for it, only when the
	// legacy answer did not already establish residency, and an `"unreadable"`
	// roster stays unreadable rather than becoming a yes.
	const resolved = applyPaneResidency(
		row,
		seatId,
		seatInRs,
		await paneOwnerIfNeeded([row], probe.kind === "live", deps),
	);
	const subjectSeatId = resolved.seatId;
	seatInRs = resolved.seatInRs;
	const pre = decidePreCall(
		{
			verb,
			leaf,
			force,
			addr,
			rsLive: probe.kind === "live",
			seatId: subjectSeatId,
			seatInRs,
			seatInLegacy: subjectSeatId === undefined ? undefined : deps.seatInLegacy?.(subjectSeatId),
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
	// `--body-file <path|->` is resolved HERE, by the caller, because only the
	// caller can: the path is relative to this process's cwd and `-` is this
	// process's stdin, neither of which the daemon shares. The bytes travel in
	// their own field and NEVER through argv — on the legacy path a body
	// re-appended to argv and re-parsed turned a body starting `--` into a FLAG,
	// and a valued flag swallowed a whole file (cli.ts, plan 093 D4). Same
	// defect, avoided the same way: the parser never sees the body.
	let bodyLiteral: string | undefined;
	const bodyFileAt = argv.indexOf("--body-file");
	if (bodyFileAt !== -1) {
		const path = argv[bodyFileAt + 1];
		if (path === undefined || path.startsWith("--")) {
			return {
				outcome: {
					kind: "rs-error",
					verb,
					addr: location.addr,
					detail: "--body-file takes a path (or - for stdin)",
				},
			};
		}
		try {
			bodyLiteral = await deps.readBody(path);
		} catch (error) {
			return {
				outcome: {
					kind: "rs-error",
					verb,
					addr: location.addr,
					detail: `--body-file: ${error instanceof Error ? error.message : String(error)}`,
				},
			};
		}
	}
	let response: Awaited<ReturnType<typeof fetch>>;
	try {
		response =
			row.method === "GET"
				? await deps.fetch(url, { headers })
				: await deps.fetch(url, {
						method: "POST",
						headers: { ...headers, "Content-Type": "application/json" },
						// `body_literal` is OMITTED when absent rather than sent as
						// null: the shim request is `deny_unknown_fields` on the rs
						// side, and "the caller had none" must stay distinguishable
						// from "the caller sent an empty one".
						body: JSON.stringify(
							bodyLiteral === undefined
								? { argv, caller }
								: { argv, caller, body_literal: bodyLiteral },
						),
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
	if (outcome.kind !== "rs") return { outcome, row };
	const acknowledge =
		row.acknowledgePath === undefined
			? undefined
			: buildAcknowledge(row.acknowledgePath, payload, url, headers, deps);
	let routedPayload = payload;
	if (row.unionWithLegacySessions) {
		try {
			const folder = deps.cwd?.() ?? "";
			const hereIdentity = argv.includes("--here")
				? (deps.gitCommonDir?.(folder) ?? folder)
				: undefined;
			routedPayload = mergeSessionRows(deps.legacySessionRows?.(argv) ?? [], payload, hereIdentity);
		} catch (error) {
			return {
				outcome: {
					kind: "rs-error",
					verb,
					addr: location.addr,
					detail: `could not merge legacy sessions: ${error instanceof Error ? error.message : String(error)}`,
				},
				row,
			};
		}
	}
	return { outcome, payload: routedPayload, row, acknowledge };
}

/** Build the deferred acknowledgement for a claim-then-ack row. See
 *  [`RouteResult.acknowledge`]. */
function buildAcknowledge(
	path: string,
	payload: unknown,
	url: string,
	headers: Record<string, string>,
	deps: GenerationRouterDeps,
): (() => Promise<string | undefined>) | undefined {
	const claims = Array.isArray(payload) ? payload : [];
	const jobIds = claims
		.map((claim) => (claim as { readonly job_id?: unknown } | null)?.job_id)
		.filter((jobId): jobId is number | string => jobId !== undefined && jobId !== null);
	if (jobIds.length === 0) return undefined;
	const ackUrl = url.replace(/\/v1\/shim\/inbox$/, path);
	const caller = buildCallerContext(deps.env, callerProcessFacts(deps));
	return async () => {
		for (const jobId of jobIds) {
			try {
				const response = await deps.fetch(ackUrl, {
					method: "POST",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({ caller, job_id: jobId }),
				});
				if (!response.ok) {
					return `messages were received but acknowledgement failed; they may be read again (HTTP ${response.status})`;
				}
			} catch (error) {
				return `messages were received but acknowledgement failed; they may be read again: ${
					error instanceof Error ? error.message : String(error)
				}`;
			}
		}
		return undefined;
	};
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
	const paneOwner = await paneOwnerIfNeeded(
		asked.map(({ verb, leaf }) => findRoute(verb, leaf)),
		probe?.kind === "live",
		deps,
	);

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
		// F6 — THE SAME resolution the real call uses, from the SAME function.
		const resolved = applyPaneResidency(findRoute(verb, leaf), seatId, seatInRs, paneOwner);
		const pre = decidePreCall({
			verb,
			leaf,
			force,
			addr,
			rsLive: probe?.kind === "live",
			seatId: resolved.seatId,
			seatInRs: resolved.seatInRs,
			seatInLegacy:
				resolved.seatId === undefined ? undefined : deps.seatInLegacy?.(resolved.seatId),
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

/** Which rs seat owns the caller's pane — ONE lookup, or `undefined` when the
 *  question does not arise (no row needs it, no pane, rs not live).
 *
 *  Split from the decision below so the decision can be PURE and shared. The
 *  diagnostic maps synchronously over many rows; doing the I/O per row would
 *  either force that map async or tempt a second, drifting implementation. */
async function paneOwnerIfNeeded(
	rows: readonly (RsRouteRow | undefined)[],
	rsLive: boolean,
	deps: GenerationRouterDeps,
): Promise<string | undefined | "unreadable"> {
	const pane = deps.env.TMUX_PANE;
	if (
		!rsLive ||
		pane === undefined ||
		pane === "" ||
		deps.rsSeatByPane === undefined ||
		!rows.some((row) => row?.requiresSeatInRs === true)
	) {
		return undefined;
	}
	return await deps.rsSeatByPane(pane);
}

/** Establish rs residency from caller evidence, for a row that demands it.
 *
 *  F6. PURE, and shared by the real call and the diagnostic, because the two
 *  must answer identically: `pij generation` is what an operator consults to
 *  find out what just happened, and a diagnostic wired to different inputs than
 *  the call it explains lies exactly when someone is trying to understand a
 *  failure. Before this, `routeVerb` consulted the pane and `probeDecisionOnly`
 *  did not, so the diagnostic reported `legacy-seat-not-in-rs` for a seat whose
 *  real `pij send` went to rs. Two answers, one question.
 *
 *  Sharing the FUNCTION rather than the intent is the point: a second
 *  implementation that agrees today is a second thing to keep in agreement. */
export function applyPaneResidency(
	row: RsRouteRow | undefined,
	seatId: string | undefined,
	seatInRs: boolean | "unreadable" | undefined,
	paneOwner: string | undefined | "unreadable",
): {
	readonly seatId: string | undefined;
	readonly seatInRs: boolean | "unreadable" | undefined;
} {
	if (row?.requiresSeatInRs !== true || seatInRs === true || paneOwner === undefined) {
		return { seatId, seatInRs };
	}
	if (paneOwner === "unreadable") return { seatId, seatInRs: "unreadable" };
	return { seatId: paneOwner, seatInRs: true };
}

/** Ask rs which seat owns a PANE — the caller-evidence route to rs residency.
 *
 *  F2, plan 119. `ambientSeatId` resolves through the LEGACY registry, so a
 *  fresh rs-only seat — the entire acceptance population — yields no ambient id,
 *  `seatInRs` is never even asked, and `requiresSeatInRs` therefore refuses to
 *  route for exactly the callers the routing exists to serve. The precondition
 *  was right; the only evidence it could see was from the wrong store.
 *
 *  A pane is evidence the caller already carries and the daemon can check
 *  against its own roster, so residency is established WITHOUT the caller
 *  claiming a session id — which stays forbidden. This answers "does rs hold a
 *  live seat on my pane", nothing more; the daemon still derives the acting seat
 *  itself, through the ladder, on every call.
 *
 *  `undefined` means no live rs seat owns it. `"unreadable"` means we could not
 *  find out, and is NEVER collapsed into "no" — that collapse is the verified
 *  negative we never verified. */
export function rsSeatByPane(
	location: DaemonLocation,
	deps: GenerationRouterDeps,
): (pane: string) => Promise<string | undefined | "unreadable"> {
	let roster: Promise<ReadonlyMap<string, string> | undefined> | undefined;
	return async (pane: string) => {
		roster ??= (async () => {
			try {
				const key = (await deps.readFile(join(location.stateDir, "daemon.key"), "utf8")).trim();
				const response = await deps.fetch(`http://${location.addr}/v1/seats`, {
					headers: { Authorization: `Bearer ${key}` },
				});
				const data = decodeEnvelope<{
					readonly seats?: readonly {
						readonly id?: string;
						readonly pane?: string;
						readonly tombstoned_at?: number;
					}[];
				}>(await response.text()).data;
				const byPane = new Map<string, string>();
				for (const seat of data.seats ?? []) {
					// F5 — LIVE ROWS ONLY. `/v1/seats` lists tombstones too
					// (`Registry::list` with no live filter), while the ladder this
					// hands off to resolves only `is_live` rows. Indexing a dead row
					// would make a REUSED pane held by an old tombstone look
					// rs-resident: the shim would route, rs would refuse the seat it
					// cannot resolve, and an rs refusal never falls back — so legacy
					// never runs and the caller is stuck. The lookup would be
					// contradicting its own claim to find a LIVE rs seat.
					//
					// `tombstoned_at` is `skip_serializing_if = "Option::is_none"`,
					// so PRESENT means dead and absent means live.
					if (seat.tombstoned_at !== undefined) continue;
					if (seat.id !== undefined && seat.pane !== undefined && !byPane.has(seat.pane)) {
						byPane.set(seat.pane, seat.id);
					}
				}
				return byPane;
			} catch {
				return undefined;
			}
		})();
		const resolved = await roster;
		return resolved === undefined ? "unreadable" : resolved.get(pane);
	};
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
