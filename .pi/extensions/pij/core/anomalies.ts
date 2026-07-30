// pij-control-plane — anomaly queries (plan 054 P2 T010, AC-06/AC-07).
//
// Safety is DERIVED, never enforced (WS-6): pure queries over descriptors +
// assignments + spine events + durable team-scaffold records. Existing
// state-chain anomalies carry spine-seq evidence; record anomalies carry the
// record ref plus the timestamp that proves the stale episode. The daemon
// alerts on these (once per transition) and NEVER acts on them.
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

import { hasRoleConflict, projectOrchestrationRole } from "./orchestration/role.js";
import type { Allocation, Assignment, Dispatch, SpineEvent } from "./platform/types.js";
import {
	SPINE_KIND_STATE_CLEARED,
	SPINE_KIND_STATE_SET,
	SPINE_KIND_STATE_VERIFIED,
} from "./platform/types.js";
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
	| "role-conflict"
	| "spawn-limbo"
	| "inbox-poll-stalled"
	| "delivered-unacked-stale"
	| "allocation-half-open"
	| "status-stale";

/** A seat may sit pre-bind this long before it reads as a wedged boot. The
 *  watchdog cannot see pending/ready seats (eligible() excludes them by
 *  design — nudging a wedged update prompt is useless), so this sensor is the
 *  ONLY alarm for the bind-zombie class (T1: 2.5 days lost silently at osk).
 *  GENEROUS by design (o-prime nit): codex cold-boot + update prompt is a
 *  legitimately slow bind — 8min false-alarms nobody and still beats the
 *  2.5-day silent loss by ~450x. Harness-aware deadlines: assessment agenda. */
export const DEFAULT_SPAWN_LIMBO_MS = 8 * 60_000;

/** A live-bound seat's inbox delivery poll must have stamped `lastInboxScanAt`
 *  at least this recently, or the poll loop has stalled (plan 057 thread-1,
 *  poll-primary delivery). 6s sits well above the ~2500ms persist cadence's
 *  healthy max (~3s) with margin, giving a STATED worst-case detection SLA of
 *  ~6.6s (threshold + one 600ms daemon tick) — under the 10s target. A stalled
 *  poll is the poll-primary analogue of a silent fs.watch drop: previously the
 *  watch death was NEVER detected; now a stale stamp surfaces it. */
export const DEFAULT_INBOX_POLL_STALL_MS = 6_000;

/** Team-scaffold records may remain transitional this long before they read as
 * abandoned rather than merely in flight. Overrides keep deterministic tests
 * and operators free to choose a stricter observation window. */
export const DEFAULT_DISPATCH_UNACKED_STALE_MS = 15 * 60_000;
export const DEFAULT_ALLOCATION_HALF_OPEN_MS = 15 * 60_000;

/** How far a seat's `now`/`next` card may lag its own activity before it reads
 *  as STALE rather than merely quiet.
 *
 *  This sensor exists because the watchdog structurally cannot catch this case.
 *  The watchdog measures SILENCE — it nudges a seat that stopped emitting. A
 *  stale card belongs to the opposite seat: one emitting constantly while never
 *  refreshing what it claims to be doing. It is never silent, so it is never
 *  nudged, so the seats whose cards are read most are exactly the ones no alarm
 *  covers (observed 2026-07-30: a PM shipped two merges and a skill change while
 *  its card still read "waiting on Jordan to confirm this renders").
 *
 *  30min is chosen against the watchdog's own 20min nudge interval: a seat that
 *  has been busy for longer than a nudge cycle without restating its work has
 *  outlived the harness's other reporting prompt. Tighter would flag normal
 *  focused work; looser and a whole phase can ship behind a stale card. */
export const DEFAULT_STATUS_STALE_MS = 30 * 60_000;

export interface Anomaly {
	readonly kind: AnomalyKind;
	readonly nodeId: string;
	readonly assignmentId?: string;
	readonly detail: string;
	/** Spine seqs or a stale record's last-progress timestamp. */
	readonly evidence: readonly number[];
	/** Direct durable-record pointer for record-derived anomalies. */
	readonly recordRef?: string;
	/** Age of the stale record episode at query time. */
	readonly ageMs?: number;
}

export interface AnomalyInputs {
	readonly descriptors: readonly SessionDescriptor[];
	readonly assignments: readonly Assignment[];
	readonly events: readonly SpineEvent[];
	readonly dispatches?: readonly Dispatch[];
	readonly allocations?: readonly Allocation[];
	readonly nowMs: number;
	readonly idleThresholdMs?: number;
	readonly spawnLimboMs?: number;
	readonly inboxPollStallMs?: number;
	readonly dispatchStaleMs?: number;
	readonly allocationHalfOpenMs?: number;
	readonly statusStaleMs?: number;
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
		if (event.kind === SPINE_KIND_STATE_SET || event.kind === SPINE_KIND_STATE_CLEARED) {
			latest = event;
		}
	}
	// Clear is a transition, never a semantic word: its latest occurrence
	// intentionally restores the assignment to the undeclared projection.
	if (latest === undefined || latest.kind === SPINE_KIND_STATE_CLEARED) return { verified: false };
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

function validTimestampMs(value: string): number | undefined {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function ageLabel(ageMs: number): string {
	const minutes = Math.round(ageMs / 60_000);
	return minutes >= 1 ? `${minutes}min` : `${Math.round(ageMs / 1000)}s`;
}

function successfulAllocationSteps(allocation: Allocation): ReadonlySet<string> {
	return new Set(allocation.steps.filter((step) => step.ok).map((step) => step.name));
}

function incompleteAllocationStep(allocation: Allocation): string | undefined {
	if (allocation.state !== "created") return undefined;
	const successful = successfulAllocationSteps(allocation);
	if (!successful.has("worktree-created")) return "worktree-created";
	if (!successful.has("allocation-committed")) return "allocation-committed";
	const closeStarted = allocation.steps.some((step) =>
		["wip-preserved", "worktree-removed", "allocation-closed"].includes(step.name),
	);
	if (closeStarted && !successful.has("allocation-closed")) return "allocation-closed";
	return undefined;
}

/** Has this descriptor already been observed terminal (closed, or absent)?
 *
 *  LIVENESS anomalies must never fire for one. `pij close` stamps
 *  `terminal: requested` BEFORE it dissolves (cli.ts / session.ts), and the
 *  registry lists the record throughout that window — so a just-closed seat is
 *  still `lifecycle: "bound"` (or `"pending"`) with a frozen `lastInboxScanAt`,
 *  which is exactly the shape these detectors call an anomaly. The result was a
 *  pij-REQUESTED close false-alerting its own owner, routed via
 *  effectiveParent→spawnedBy.
 *
 *  Same failure class as the s070 `unrequested-by-pij` defect: terminal truth was
 *  recorded correctly and the notify path simply never asked. Liveness is a claim
 *  about a RUNNING seat; once a seat is terminal, "it stopped polling" is the
 *  expected outcome, not an anomaly. */
function isTerminallyObserved(node: SessionDescriptor): boolean {
	return node.terminal !== undefined;
}

export function detectAnomalies(inputs: AnomalyInputs): Anomaly[] {
	const threshold = inputs.idleThresholdMs ?? DEFAULT_IDLE_DISAGREEMENT_MS;
	const out: Anomaly[] = [];
	const byNode = new Map<string, SessionDescriptor>();
	for (const descriptor of inputs.descriptors) byNode.set(descriptor.id, descriptor);

	for (const descriptor of inputs.descriptors) {
		if (!hasRoleConflict(descriptor)) continue;
		out.push({
			kind: "role-conflict",
			nodeId: descriptor.id,
			detail: `'${descriptor.id}' is prime but also stores orchestrationRole='${descriptor.orchestrationRole}' — prime wins projection, but the conflicting writable source must be cleared`,
			evidence: [],
		});
	}

	const dispatchStaleMs = inputs.dispatchStaleMs ?? DEFAULT_DISPATCH_UNACKED_STALE_MS;

	// status-stale — the seat is ACTIVELY EMITTING but its now/next card has not
	// moved. The watchdog cannot reach this class: it fires on silence, and this
	// seat is the opposite of silent.
	const statusStaleMs = inputs.statusStaleMs ?? DEFAULT_STATUS_STALE_MS;
	for (const descriptor of inputs.descriptors) {
		if (descriptor.lifecycle === "dissolved" || descriptor.lifecycle === "failed") continue;
		// Scoped to seats whose card is actually CONSUMED. Status renders for
		// prime/PM seats (JC-1 OQ-7); a worker's now/next is recorded but shown
		// nowhere, so its staleness misinforms nobody and flagging it is pure
		// noise. This is not arbitrary tuning — it mirrors the consumer.
		//
		// It is also what keeps the sensor CREDIBLE. Measured on the live fleet the
		// day this shipped: 26 of 29 live seats had never reported at all, so an
		// unscoped rule would have fired on ~90% of the fleet on its first run, and
		// a sensor that loud is one operators learn to scroll past (F-17's lesson:
		// a detector nobody believes is worse than no detector).
		if (projectOrchestrationRole(descriptor) === null) continue;
		const lastEventMs =
			descriptor.lastEventAt === undefined ? undefined : validTimestampMs(descriptor.lastEventAt);
		// No telemetry at all means no proof of activity — and this sensor accuses
		// a seat of working without reporting, so it must never fire on a seat it
		// cannot prove was working.
		if (lastEventMs === undefined) continue;
		// Only judge a seat that is busy RIGHT NOW. One that stopped emitting is
		// the watchdog's jurisdiction, and double-reporting it here would just
		// re-flag every finished seat forever.
		if (inputs.nowMs - lastEventMs > statusStaleMs) continue;
		// A seat that has PARKED itself is exempt: `waiting`/`hold`/`blocked`/
		// `question` are deliberate declarations, and re-nudging them punishes the
		// seats that did the right thing (same exemption axis-disagreement uses).
		if (descriptor.semanticState !== undefined && descriptor.semanticState !== "ready") continue;
		const statusAtMs =
			descriptor.statusAt === undefined ? undefined : validTimestampMs(descriptor.statusAt);
		// Never reported at all: age from the seat's own start, so a seat that has
		// been working for an hour without ever filing a card is caught. Mirrors
		// A-2 — keying on statusAt alone would never fire for exactly that seat.
		const anchorMs = statusAtMs ?? validTimestampMs(descriptor.startedAt);
		if (anchorMs === undefined) continue;
		const driftMs = lastEventMs - anchorMs;
		if (driftMs <= statusStaleMs) continue;
		out.push({
			kind: "status-stale",
			nodeId: descriptor.id,
			detail:
				`'${descriptor.id}' has been working for ${Math.round(driftMs / 60_000)}min since its card was last updated` +
				`${statusAtMs === undefined ? " (it has never reported)" : ""} (threshold ${Math.round(statusStaleMs / 60_000)}min)` +
				" — consumers render now/next as CURRENT, so a stale card actively misinforms." +
				` Ask '${descriptor.id}' to run: pij report now "<what I just did>" "<what's next>"` +
				" (or declare a parked state: waiting|hold|blocked|question — parked seats never flag)",
			// Evidence carries the drift BUCKET, not an empty array: the sweep's
			// latch keys on `kind:node:evidence`, so a constant key would alert the
			// parent exactly once and then stay silent forever no matter how far
			// the card drifted afterwards. Bucketing by 30min re-alerts as it gets
			// materially worse without chattering every tick.
			evidence: [Math.floor(driftMs / (30 * 60_000))],
			ageMs: driftMs,
		});
	}

	for (const dispatch of inputs.dispatches ?? []) {
		if (dispatch.state !== "delivered-unacked") continue;
		const updatedMs = validTimestampMs(dispatch.updated.ts);
		if (updatedMs === undefined) continue;
		const ageMs = inputs.nowMs - updatedMs;
		if (ageMs <= dispatchStaleMs) continue;
		const recordRef = `dispatch:${dispatch.id}`;
		out.push({
			kind: "delivered-unacked-stale",
			nodeId: dispatch.to,
			detail: `${recordRef} has remained delivered-unacked for ${ageLabel(ageMs)} (threshold ${ageLabel(dispatchStaleMs)}) — delivery landed but no durable brief ack followed`,
			evidence: [updatedMs],
			recordRef,
			ageMs,
		});
	}

	const allocationHalfOpenMs = inputs.allocationHalfOpenMs ?? DEFAULT_ALLOCATION_HALF_OPEN_MS;
	for (const allocation of inputs.allocations ?? []) {
		const missingStep = incompleteAllocationStep(allocation);
		if (missingStep === undefined) continue;
		const progressMs = allocation.steps
			.map((step) => validTimestampMs(step.ts))
			.filter((value): value is number => value !== undefined)
			.reduce(
				(latest, value) => Math.max(latest, value),
				validTimestampMs(allocation.created.ts) ?? Number.NEGATIVE_INFINITY,
			);
		if (!Number.isFinite(progressMs)) continue;
		const ageMs = inputs.nowMs - progressMs;
		if (ageMs <= allocationHalfOpenMs) continue;
		const recordRef = `allocation:${allocation.id}`;
		out.push({
			kind: "allocation-half-open",
			nodeId: allocation.id,
			detail: `${recordRef} has made no journal progress for ${ageLabel(ageMs)} (threshold ${ageLabel(allocationHalfOpenMs)}); required successful step '${missingStep}' is absent`,
			evidence: [progressMs],
			recordRef,
			ageMs,
		});
	}

	// spawn-limbo (descriptor-driven, assignment-free — the second cross-node
	// pass this module carries): a seat still pending/ready long past spawn is
	// a wedged boot the watchdog structurally cannot see. Surface once; the
	// sweep routes to the creator. Evidence: the seat's own spine events when
	// any exist (a pre-bind wedge usually has none — the emptiness IS the
	// symptom, and the detail says so).
	const limboMs = inputs.spawnLimboMs ?? DEFAULT_SPAWN_LIMBO_MS;
	for (const node of inputs.descriptors) {
		if (isTerminallyObserved(node)) continue;
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

	// inbox-poll-stalled (plan 057 thread-1): poll-primary delivery's liveness
	// heartbeat. A BOUND seat stamps `lastInboxScanAt` from its delivery poll loop
	// (persisted at a coarse ~2500ms cadence); a stamp older than the threshold
	// means the poll stalled — a long synchronous block, or a seat that stopped
	// draining — so inbound messages may be stranded. This is the poll-primary
	// analogue of the silent fs.watch drop, now OBSERVABLE. Evidence = the frozen
	// stamp (ms): a persisting stall latches ONE alert, while a fresh stall after
	// recovery has a new stamp → re-alerts. Absent stamp = a seat that does not
	// self-poll (tmux is drained by the daemon tick) — skipped, no false positive.
	const stallMs = inputs.inboxPollStallMs ?? DEFAULT_INBOX_POLL_STALL_MS;
	for (const node of inputs.descriptors) {
		if (isTerminallyObserved(node)) continue;
		if (node.lifecycle !== "bound") continue;
		if (node.lastInboxScanAt === undefined) continue;
		const scanMs = Date.parse(node.lastInboxScanAt);
		if (Number.isNaN(scanMs)) continue;
		const staleMs = inputs.nowMs - scanMs;
		if (staleMs <= stallMs) continue;
		out.push({
			kind: "inbox-poll-stalled",
			nodeId: node.id,
			detail: `'${node.id}' inbox delivery poll last ran ${Math.round(staleMs / 1000)}s ago (stall threshold ${Math.round(stallMs / 1000)}s) — poll-primary delivery may be stranding messages (long synchronous block, or a seat that stopped draining)`,
			evidence: [scanMs],
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

		// foreign hold-clear — every hold whose NEXT declaration transition has
		// a different actor. A state-cleared transition is the canonical hold
		// release too. Evidence: [holdSeq, clearSeq].
		const declared = chain.filter(
			(e) => e.kind === SPINE_KIND_STATE_SET || e.kind === SPINE_KIND_STATE_CLEARED,
		);
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
				detail: `hold issued by ${hold.actor} on '${assignment.id}' was cleared by ${next.actor} (→ ${next.kind === SPINE_KIND_STATE_CLEARED ? "clear" : (stateWordOf(next) ?? "?")})`,
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
			detail: `'${assignment.nodeId}' has open ${chainState.state === "ready" ? "ready" : "undeclared"} assignment '${assignment.id}' but has been mechanically idle ${Number.isFinite(idleMs) ? `${Math.round(idleMs / 3_600_000)}h` : "since forever"} (threshold ${Math.round(threshold / 3_600_000)}h) — the lost-dispatch shape. If this idle is legitimate, ask '${assignment.nodeId}' to run: pij report state waiting|hold|blocked|question (parked states never flag)`,
			evidence,
		});
	}
	return out;
}
