// Pure cross-harness terminal-absence reconciliation. It does not infer cause:
// `unrequested-by-pij` means only that an observed absence lacked close intent.

import { resolveNoticeRecipient } from "../binding.js";
import type { AgentLivenessProbe, ProcessSnapshot } from "../platform/types.js";
import {
	applyTerminalObservation,
	DEFAULT_SPAWN_EXPECTATION_TTL_MS,
	latchTerminalNotice,
} from "../spawn-expectation.js";
import { resolveAgentLiveness } from "../state.js";
import type { DeathReason, SessionDescriptor, SpawnExpectation } from "../types.js";
import { SENSOR_DAEMON } from "../watchdog.js";

export interface DeathNotice {
	readonly to: string;
	readonly from: string;
	readonly text: string;
	/** False for this tick's live observation; historical evidence is never relabelled. */
	readonly historical: boolean;
}

export type DeathNoticeCandidate =
	| {
			readonly kind: "descriptor";
			readonly descriptorId: string;
			readonly subjectId: string;
			readonly from: string;
			readonly text: string;
			readonly historical: boolean;
	  }
	| {
			readonly kind: "fixed";
			readonly to: string;
			readonly subjectId: string;
			readonly from: string;
			readonly text: string;
			readonly historical: boolean;
	  };

export interface DeathNoticeResolution {
	readonly notices: readonly DeathNotice[];
	readonly noticesSuppressed: number;
	/** At most three subject ids for the daemon's one aggregate summary line. */
	readonly withheldNoticeSubjects: readonly string[];
}

export interface DeathReconcileInput {
	readonly descriptors: readonly SessionDescriptor[];
	readonly expectations: readonly SpawnExpectation[];
	readonly nowIso: string;
	readonly isAlive: (pid: number) => boolean;
	/** The process table, captured ONCE PER SWEEP by the caller (R2/K9).
	 *
	 *  A VALUE, not a callback, on purpose: the sweep runs on the ~600ms tick over
	 *  ~500 descriptors, so a per-descriptor capture is ~500 `ps` spawns per tick
	 *  — enough to stall the tick and therefore message delivery. Taking a value
	 *  makes the per-descriptor shape unwritable rather than merely discouraged.
	 *
	 *  Absent ⇒ fall back to `isAlive`, which is what every pre-095 caller passes
	 *  and what the legacy tests exercise. The fallback preserves today's
	 *  behaviour EXCEPT that a throwing probe is now `unknown` (AC-6) — but it is
	 *  still a blind pid-existence test, and production must pass the snapshot.
	 *  `AC-18` in the test suite is what stops this from silently becoming
	 *  optional in practice. */
	readonly processSnapshot?: ProcessSnapshot;
	/** Optional because a PID observation is enough for registered descriptors. */
	readonly paneExists?: (paneId: string) => boolean;
	/** Compatibility projection for existing diagnostics; never changes disposition. */
	readonly failureReasonFor?: (descriptor: SessionDescriptor) => DeathReason;
	/** First sweep after daemon construction reconciles durable history, not a live event. */
	readonly historical?: boolean;
}

export interface DeathReconcileResult {
	readonly descriptorUpdates: readonly SessionDescriptor[];
	readonly expectationUpdates: readonly SpawnExpectation[];
	readonly noticeCandidates: readonly DeathNoticeCandidate[];
	readonly deadIds: readonly string[];
	readonly notices: readonly DeathNotice[];
	/** Notices withheld because the RECIPIENT is dead too. Counted, never silent:
	 *  a host reboot kills every seat in one event, so each corpse would otherwise
	 *  address an obituary to another corpse. The caller logs one summary line. */
	readonly noticesSuppressed: number;
	/** At most three subject ids for that aggregate summary. */
	readonly withheldNoticeSubjects: readonly string[];
}

export function resolveDeathNotices(
	candidates: readonly DeathNoticeCandidate[],
	descriptors: readonly SessionDescriptor[],
	deadIds: Iterable<string> = [],
): DeathNoticeResolution {
	const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
	const dead = new Set(deadIds);
	for (const descriptor of descriptors) {
		if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) {
			dead.add(descriptor.id);
		}
	}
	const notices: DeathNotice[] = [];
	const withheldNoticeSubjects: string[] = [];
	let noticesSuppressed = 0;
	const withhold = (subjectId: string, count = 1): void => {
		noticesSuppressed += count;
		if (count > 0 && withheldNoticeSubjects.length < 3) {
			withheldNoticeSubjects.push(subjectId);
		}
	};
	for (const candidate of candidates) {
		let recipient: string | null;
		if (candidate.kind === "fixed") {
			recipient = candidate.to;
		} else {
			const descriptor = descriptorById.get(candidate.descriptorId);
			if (!descriptor) continue;
			const resolution = resolveNoticeRecipient(descriptor, descriptors, dead);
			recipient = resolution.recipient;
			if (!recipient) {
				withhold(candidate.descriptorId, resolution.withheld);
				continue;
			}
		}
		if (!recipient) continue;
		if (dead.has(recipient)) {
			withhold(candidate.subjectId);
			continue;
		}
		notices.push({
			to: recipient,
			from: candidate.from,
			text: candidate.text,
			historical: candidate.historical,
		});
	}
	return { notices, noticesSuppressed, withheldNoticeSubjects };
}

function noticeText(
	id: string,
	disposition: string,
	observedAt: string,
	historical: boolean,
	lastSeenAt?: string,
): string {
	const origin = historical ? "historical boot reconciliation" : "live observation";
	const lastSeen = lastSeenAt === undefined ? "" : `; last seen ${lastSeenAt}`;
	return `⚠️ ${id} has exited; terminal absence: ${origin} at ${observedAt}${lastSeen} (${disposition}).`;
}

function unavailableReason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** This sweep's verdict on one descriptor's agent.
 *
 *  With a snapshot: the identity ladder (`resolveAgentLiveness`) — a bounded
 *  descendant walk, self included, matched on parsed session id.
 *
 *  Without one: the legacy pid-existence probe, mapped onto the same
 *  three-valued vocabulary. It is BLIND in both directions (a recycled pid reads
 *  alive forever; an agent one level below the registry pid reads dead) and it
 *  exists only so pre-095 callers keep working. The one behavioural change on
 *  this path is that a THROWING probe is now `unknown` rather than an
 *  `unavailable` terminal stamp: an observation that never happened must not be
 *  recorded as an observation. */
function probeLiveness(
	input: DeathReconcileInput,
	descriptor: SessionDescriptor,
): AgentLivenessProbe {
	if (input.processSnapshot !== undefined) {
		return resolveAgentLiveness(descriptor, input.processSnapshot);
	}
	try {
		return input.isAlive(descriptor.pid)
			? { liveness: "alive", cause: "pid-present", detail: `pid ${descriptor.pid} exists` }
			: { liveness: "absent", cause: "pid-missing", detail: `pid ${descriptor.pid} is gone` };
	} catch (error) {
		return {
			liveness: "unknown",
			cause: "probe-unavailable",
			detail: unavailableReason(error),
		};
	}
}

type ExpiryAssessment =
	| { readonly kind: "pending" }
	| { readonly kind: "expired" }
	| { readonly kind: "unavailable"; readonly reason: string };

function expectationExpiry(expectation: SpawnExpectation, nowIso: string): ExpiryAssessment {
	const requestedAtMs = Date.parse(expectation.requestedAt);
	if (!Number.isFinite(requestedAtMs)) {
		return { kind: "unavailable", reason: `unparseable requestedAt '${expectation.requestedAt}'` };
	}
	const nowMs = Date.parse(nowIso);
	if (!Number.isFinite(nowMs)) {
		return { kind: "unavailable", reason: `unparseable observation time '${nowIso}'` };
	}
	const deadlineAtMs =
		expectation.deadlineAt === undefined
			? requestedAtMs + DEFAULT_SPAWN_EXPECTATION_TTL_MS
			: Date.parse(expectation.deadlineAt);
	if (!Number.isFinite(deadlineAtMs)) {
		return {
			kind: "unavailable",
			reason: `unparseable deadlineAt '${expectation.deadlineAt ?? "(derived)"}'`,
		};
	}
	return nowMs >= deadlineAtMs ? { kind: "expired" } : { kind: "pending" };
}

export function reconcileDeaths(input: DeathReconcileInput): DeathReconcileResult {
	const descriptorUpdates: SessionDescriptor[] = [];
	const expectationUpdates: SpawnExpectation[] = [];
	const noticeCandidates: DeathNoticeCandidate[] = [];
	const descriptorBySpawnId = new Set(
		input.descriptors.flatMap((descriptor) =>
			descriptor.spawnId === undefined ? [] : [descriptor.spawnId],
		),
	);

	// A death notice is worth generating only if someone is ALIVE to read it.
	// Seeded with the seats that were already gone before this sweep; the loops
	// below add each seat they bury. Filtering happens after both loops so a
	// notice addressed to a seat that dies LATER in the same sweep is still
	// suppressed — on a reboot the order of the array is meaningless.
	const dead = new Set<string>(
		input.descriptors.flatMap((descriptor) =>
			descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined
				? [descriptor.id]
				: [],
		),
	);

	for (const descriptor of input.descriptors) {
		// TRANSITION TABLE (plan 095 Phase 2). `terminal` is a REVISABLE
		// OBSERVATION, not a latch — but revisable must not mean rewritten every
		// tick, so each row states what it writes AND what it announces.
		//
		//  # | current state                     | probe     | action              | notice
		//  1 | lifecycle "dissolved"             | not probed| skip entirely       | none
		//  2 | no terminal                       | absent    | stamp once          | send once
		//  3 | terminal present                  | absent    | NO WRITE            | none
		//  4 | terminal, unrequested-by-pij      | alive     | CLEAR terminal      | none
		//  5 | terminal, requested               | alive     | retain              | none
		//  6 | any                               | unknown   | NO MUTATION         | none
		//
		// Row 1 — `dissolved` keeps its unconditional skip. It is the ONE
		// unambiguous terminal state: a dissolve is an act, not an inference.
		if (descriptor.lifecycle === "dissolved") continue;
		const probe = probeLiveness(input, descriptor);
		// Row 6 — `unknown` mutates NOTHING. Not the descriptor, not a notice. An
		// observation that did not happen is not evidence, and the previous
		// behaviour (stamping `disposition: "unavailable"`) recorded it as if it
		// were — which every downstream consumer then read as terminal truth.
		if (probe.liveness === "unknown") continue;
		if (probe.liveness === "alive") {
			if (descriptor.terminal === undefined) continue;
			// Row 5 — a teardown pij ASKED for is not undone by a process that is
			// still draining. `requested` records an intent, not an inference, so
			// contrary liveness does not contradict it.
			if (descriptor.terminal.disposition === "requested") continue;
			// Row 4 — the seat came back. Clear the observation AND the notice latch,
			// and take it out of `dead` so its mail is deliverable again.
			//
			// `applyTerminalObservation` early-returns whenever `terminal` is already
			// set (spawn-expectation.ts:91), so clearing CANNOT be a side effect of
			// re-running the reducer — it has to be explicit and local, which is what
			// this is.
			const { terminal: _terminal, deathNoticeLatchedAt: _latched, ...cleared } = descriptor;
			descriptorUpdates.push(cleared);
			dead.delete(descriptor.id);
			continue;
		}
		// Row 3 — already stamped and still absent: the idempotent steady state.
		// Without this, every already-dead descriptor goes down the update+notice
		// path on every 600ms tick, because the update path rebuilds the
		// expectation WITHOUT the existing `terminal`, so `applyTerminalObservation`
		// never early-returns and `latchTerminalNotice` re-latches. A notice storm
		// is not a smaller bug than the latch it replaces.
		if (descriptor.terminal !== undefined) continue;
		// Row 2 — stamp once, send once.
		const observation: Parameters<typeof applyTerminalObservation>[1] = {
			kind: "absent",
			observedAt: input.nowIso,
			evidence: "pid-missing",
			...(descriptor.lastEventAt !== undefined ? { lastSeenAt: descriptor.lastEventAt } : {}),
		};
		const terminal = applyTerminalObservation(
			{
				spawnId: descriptor.spawnId ?? descriptor.id,
				requestedHarness: descriptor.harness ?? "pi",
				requestedAt: descriptor.startedAt,
				...(descriptor.spawnedBy !== undefined ? { creatorId: descriptor.spawnedBy } : {}),
				...(descriptor.closeIntent !== undefined ? { closeIntent: descriptor.closeIntent } : {}),
				...(descriptor.paneId !== undefined ? { paneId: descriptor.paneId } : {}),
				sessionId: descriptor.id,
				...(descriptor.harness !== undefined ? { runtimeHarness: descriptor.harness } : {}),
			},
			observation,
		);
		const latched = latchTerminalNotice(terminal, input.nowIso);
		let failureReason: DeathReason | undefined;
		if (input.failureReasonFor) {
			try {
				failureReason = input.failureReasonFor(descriptor);
			} catch {
				// PID absence is already observed. A compatibility pane capture must
				// never erase that terminal truth; omit the optional reason instead.
			}
		}
		descriptorUpdates.push({
			...descriptor,
			...(failureReason !== undefined ? { failureReason } : {}),
			terminal: latched.terminal,
			deathNoticeLatchedAt: latched.deathNoticeLatchedAt,
		});
		dead.add(descriptor.id);
		if (latched.terminal) {
			noticeCandidates.push({
				kind: "descriptor",
				descriptorId: descriptor.id,
				subjectId: descriptor.id,
				from: SENSOR_DAEMON,
				text: noticeText(
					descriptor.id,
					latched.terminal.disposition,
					latched.terminal.observedAt,
					input.historical === true,
					latched.terminal.lastSeenAt,
				),
				historical: input.historical === true,
			});
		}
	}

	for (const expectation of input.expectations) {
		if (
			expectation.terminal !== undefined ||
			expectation.sessionId !== undefined ||
			descriptorBySpawnId.has(expectation.spawnId)
		)
			continue;
		let observation: Parameters<typeof applyTerminalObservation>[1] | undefined;
		const expiry = expectationExpiry(expectation, input.nowIso);
		if (expiry.kind === "unavailable") {
			observation = {
				kind: "unavailable",
				observedAt: input.nowIso,
				evidence: "observation-unavailable",
				reason: expiry.reason,
			};
		} else if (expiry.kind === "expired") {
			observation = {
				kind: "absent",
				observedAt: input.nowIso,
				evidence: "expectation-expired",
			};
		} else if (expectation.paneId !== undefined && input.paneExists !== undefined) {
			try {
				if (input.paneExists(expectation.paneId)) continue;
				observation = { kind: "absent", observedAt: input.nowIso, evidence: "pane-missing" };
			} catch (error) {
				observation = {
					kind: "unavailable",
					observedAt: input.nowIso,
					evidence: "observation-unavailable",
					reason: unavailableReason(error),
				};
			}
		}
		if (!observation) continue;
		const next = latchTerminalNotice(
			applyTerminalObservation(expectation, observation),
			input.nowIso,
		);
		expectationUpdates.push(next);
		if (next.sessionId !== undefined) dead.add(next.sessionId);
		if (next.creatorId && next.terminal) {
			noticeCandidates.push({
				kind: "fixed",
				to: next.creatorId,
				subjectId: next.sessionId ?? next.spawnId,
				from: SENSOR_DAEMON,
				text: noticeText(
					next.sessionId ?? next.spawnId,
					next.terminal.disposition,
					next.terminal.observedAt,
					input.historical === true,
					next.terminal.lastSeenAt,
				),
				historical: input.historical === true,
			});
		}
	}

	const descriptorAfter = new Map(
		input.descriptors.map((descriptor) => [descriptor.id, descriptor]),
	);
	for (const update of descriptorUpdates) descriptorAfter.set(update.id, update);
	const resolved = resolveDeathNotices(noticeCandidates, [...descriptorAfter.values()], dead);
	return {
		descriptorUpdates,
		expectationUpdates,
		noticeCandidates,
		deadIds: [...dead],
		...resolved,
	};
}
