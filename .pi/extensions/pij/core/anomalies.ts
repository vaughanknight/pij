// pij-control-plane — anomaly queries (plan 054 P2 T010, AC-06/AC-07).
//
// Safety is DERIVED, never enforced (WS-6): pure queries over descriptors +
// assignments + spine events, each anomaly carrying spine-seq evidence so a
// prime or UI can chain straight to the audit trail. The daemon alerts on
// these (once per transition) and NEVER acts on them.
//
// The three ruled shapes:
//  • axis-disagreement — an OPEN assignment that expects activity (no
//    declared state yet, or declared `ready`) while the mechanical axis
//    reads `idle` beyond the threshold: the 1ca01u5 44h lost-dispatch
//    incident. Parked states (blocked/question/hold/waiting) are LEGITIMATE
//    idleness and never flag.
//  • unverified-done — a chain whose latest declared state is `done` with no
//    LATER state-verified event (AC-06: done is a claim until verified; the
//    survey's unanimous #1 danger).
//  • foreign-hold-clear — a `hold` whose NEXT declared state comes from a
//    different actor than the hold's issuer (WS-6: hold carries an issuer).

import type { Assignment, SpineEvent } from "./platform/types.js";
import { SPINE_KIND_STATE_SET, SPINE_KIND_STATE_VERIFIED } from "./platform/types.js";
import { isSemanticState, type SemanticState, type SessionDescriptor } from "./types.js";

/** Default semantic-active + system-idle disagreement threshold (AC-07's
 *  "> threshold"). Hours-scale: a seat quietly idle for a work-morning with
 *  an undeclared open dispatch is the incident shape; minutes-scale would
 *  flag every coffee break. */
export const DEFAULT_IDLE_DISAGREEMENT_MS = 4 * 3_600_000;

export type AnomalyKind =
	| "axis-disagreement"
	| "unverified-done"
	| "foreign-hold-clear"
	| "spawn-limbo";

/** A seat may sit pre-bind this long before it reads as a wedged boot. The
 *  watchdog cannot see pending/ready seats (eligible() excludes them by
 *  design — nudging a wedged update prompt is useless), so this sensor is the
 *  ONLY alarm for the bind-zombie class (T1: 2.5 days lost silently at osk).
 *  GENEROUS by design (o-prime nit): codex cold-boot + update prompt is a
 *  legitimately slow bind — 8min false-alarms nobody and still beats the
 *  2.5-day silent loss by ~450x. Harness-aware deadlines: assessment agenda. */
export const DEFAULT_SPAWN_LIMBO_MS = 8 * 60_000;

export interface Anomaly {
	readonly kind: AnomalyKind;
	readonly nodeId: string;
	readonly assignmentId?: string;
	readonly detail: string;
	/** Spine seqs chaining this anomaly to the audit trail. */
	readonly evidence: readonly number[];
}

export interface AnomalyInputs {
	readonly descriptors: readonly SessionDescriptor[];
	readonly assignments: readonly Assignment[];
	readonly events: readonly SpineEvent[];
	readonly nowMs: number;
	readonly idleThresholdMs?: number;
	readonly spawnLimboMs?: number;
}

/** The declared-state view of one assignment's chain (states[] seqs joined
 *  back to their spine events, seq-ascending). Shared by `node show` and the
 *  anomaly queries so "latest state" and "verified" mean ONE thing. */
export interface ChainState {
	/** Latest declared semantic state, if any state-set exists in the chain. */
	readonly state?: SemanticState;
	readonly stateSeq?: number;
	readonly stateActor?: string;
	/** True iff the latest declared state is `done` AND a state-verified
	 *  event follows it in the chain (AC-06). */
	readonly verified: boolean;
	readonly verifiedBy?: string;
}

/** The `state:<word>` structured ref of a chain event. */
function stateWordOf(event: SpineEvent): string | undefined {
	for (const ref of event.refs) {
		if (ref.startsWith("state:")) return ref.slice("state:".length);
	}
	return undefined;
}

/** Chain events for one assignment: the spine events its states[] refs name,
 *  seq-ascending. */
function chainEventsOf(assignment: Assignment, events: readonly SpineEvent[]): SpineEvent[] {
	const seqs = new Set(assignment.states);
	return events.filter((e) => seqs.has(e.seq)).sort((a, b) => a.seq - b.seq);
}

export function chainStateOf(assignment: Assignment, events: readonly SpineEvent[]): ChainState {
	const chain = chainEventsOf(assignment, events);
	let latest: SpineEvent | undefined;
	for (const event of chain) {
		if (event.kind === SPINE_KIND_STATE_SET) latest = event;
	}
	if (latest === undefined) return { verified: false };
	const word = stateWordOf(latest);
	const state = isSemanticState(word) ? word : undefined;
	let verifiedBy: string | undefined;
	if (state === "done") {
		for (const event of chain) {
			if (event.kind === SPINE_KIND_STATE_VERIFIED && event.seq > latest.seq) {
				verifiedBy = event.verifiedBy ?? event.actor;
			}
		}
	}
	return {
		...(state === undefined ? {} : { state }),
		stateSeq: latest.seq,
		stateActor: latest.actor,
		verified: verifiedBy !== undefined,
		...(verifiedBy === undefined ? {} : { verifiedBy }),
	};
}

/** Semantic-ACTIVE = the chain expects the node to be doing something right
 *  now: no declared state yet (a fresh dispatch), or declared `ready`.
 *  Parked states are legitimate idleness. */
function isSemanticActive(chain: ChainState): boolean {
	return chain.state === undefined || chain.state === "ready";
}

export function detectAnomalies(inputs: AnomalyInputs): Anomaly[] {
	const threshold = inputs.idleThresholdMs ?? DEFAULT_IDLE_DISAGREEMENT_MS;
	const out: Anomaly[] = [];
	const byNode = new Map<string, SessionDescriptor>();
	for (const descriptor of inputs.descriptors) byNode.set(descriptor.id, descriptor);

	// spawn-limbo (descriptor-driven, assignment-free — the second cross-node
	// pass this module carries): a seat still pending/ready long past spawn is
	// a wedged boot the watchdog structurally cannot see. Surface once; the
	// sweep routes to the creator. Evidence: the seat's own spine events when
	// any exist (a pre-bind wedge usually has none — the emptiness IS the
	// symptom, and the detail says so).
	const limboMs = inputs.spawnLimboMs ?? DEFAULT_SPAWN_LIMBO_MS;
	for (const node of inputs.descriptors) {
		if (node.lifecycle !== "pending" && node.lifecycle !== "ready") continue;
		const bornMs = Date.parse(node.startedAt);
		if (Number.isNaN(bornMs)) continue;
		const ageMs = inputs.nowMs - bornMs;
		if (ageMs <= limboMs) continue;
		const evidence: number[] = [];
		for (const event of inputs.events) {
			if (event.peer === node.id) evidence.push(event.seq);
			if (evidence.length >= 3) break;
		}
		out.push({
			kind: "spawn-limbo",
			nodeId: node.id,
			detail: `'${node.id}' spawned ${Math.round(ageMs / 60_000)}min ago and is still '${node.lifecycle}' — never bound (wedged boot? the watchdog cannot see pre-bind seats${evidence.length === 0 ? "; zero spine events, which is itself the symptom" : ""})`,
			evidence,
		});
	}

	for (const assignment of inputs.assignments) {
		const chain = chainEventsOf(assignment, inputs.events);
		const chainState = chainStateOf(assignment, inputs.events);

		// unverified done (AC-06) — evidence: the done event's seq.
		if (chainState.state === "done" && !chainState.verified && chainState.stateSeq !== undefined) {
			out.push({
				kind: "unverified-done",
				nodeId: assignment.nodeId,
				assignmentId: assignment.id,
				detail: `assignment '${assignment.id}' declared done by ${chainState.stateActor ?? "unknown"} with no verify — done is a claim until verified`,
				evidence: [chainState.stateSeq],
			});
		}

		// foreign hold-clear — every hold whose NEXT declared state has a
		// different actor. Evidence: [holdSeq, clearSeq].
		const declared = chain.filter((e) => e.kind === SPINE_KIND_STATE_SET);
		for (let i = 0; i < declared.length - 1; i++) {
			const hold = declared[i];
			const next = declared[i + 1];
			if (hold === undefined || next === undefined) continue;
			if (stateWordOf(hold) !== "hold") continue;
			if (next.actor === hold.actor) continue;
			out.push({
				kind: "foreign-hold-clear",
				nodeId: assignment.nodeId,
				assignmentId: assignment.id,
				detail: `hold issued by ${hold.actor} on '${assignment.id}' was cleared by ${next.actor} (→ ${stateWordOf(next) ?? "?"})`,
				evidence: [hold.seq, next.seq],
			});
		}

		// axis-disagreement (AC-07, the ruled case) — open + semantic-active
		// + system idle beyond the threshold.
		if (assignment.closed !== undefined) continue;
		const node = byNode.get(assignment.nodeId);
		if (node === undefined || node.systemState !== "idle") continue;
		if (!isSemanticActive(chainState)) continue;
		// Idle duration from lastEventAt, BOUNDED by the node's own age — a
		// node cannot have been idle longer than it has existed. A fresh spawn
		// with no telemetry yet is NOT a lost dispatch (kingfisher
		// false-positive, dogfood findings #2); only a node whose timestamps
		// are all unparseable reads as idle-since-forever.
		const lastMs = node.lastEventAt === undefined ? Number.NaN : Date.parse(node.lastEventAt);
		const startMs = Date.parse(node.startedAt);
		const stamps = [lastMs, startMs].filter((t) => !Number.isNaN(t));
		const idleMs =
			stamps.length === 0 ? Number.POSITIVE_INFINITY : inputs.nowMs - Math.max(...stamps);
		if (idleMs <= threshold) continue;
		// Evidence: the assignment's task-set event (the dispatch) plus its
		// latest declared state, whichever exist.
		const evidence: number[] = [];
		for (const event of inputs.events) {
			if (
				event.kind === "task-set" &&
				event.refs.includes(`assignment:${assignment.id}`) &&
				!evidence.includes(event.seq)
			) {
				evidence.push(event.seq);
			}
		}
		if (chainState.stateSeq !== undefined) evidence.push(chainState.stateSeq);
		out.push({
			kind: "axis-disagreement",
			nodeId: assignment.nodeId,
			assignmentId: assignment.id,
			detail: `'${assignment.nodeId}' has open ${chainState.state === "ready" ? "ready" : "undeclared"} assignment '${assignment.id}' but has been mechanically idle ${Number.isFinite(idleMs) ? `${Math.round(idleMs / 3_600_000)}h` : "since forever"} (threshold ${Math.round(threshold / 3_600_000)}h) — the lost-dispatch shape`,
			evidence,
		});
	}
	return out;
}
