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

import { cardCanMislead, hasRoleConflict, owesStatusCard } from "./orchestration/role.js";
import { isOpenDispatch } from "./platform/dispatch.js";
import type { Allocation, Assignment, Dispatch, SpineEvent } from "./platform/types.js";
import {
	generalAssignmentId,
	SPINE_KIND_STATE_CLEARED,
	SPINE_KIND_STATE_SET,
	SPINE_KIND_STATE_VERIFIED,
} from "./platform/types.js";
import {
	isSemanticState,
	type SemanticState,
	type SessionDescriptor,
	type SessionId,
	type SessionLifecycle,
	type TerminalObservation,
} from "./types.js";
import { mutesWatchdogNudge } from "./watchdog.js";

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
	| "inert-subscription"
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

/** ── The `activityCredibility` contract, DECLARED STRUCTURALLY, never imported ──
 *
 *  The implementation is `s095`'s and lives in `core/state.ts`, which is that
 *  stream's file: a direct import would couple this module's merge to theirs
 *  and would not even resolve on this branch. So the shape is declared here and
 *  the function arrives as an INPUT — the same decision this module already
 *  made for `watchdog` above: a new INPUT is safe where a new READ would
 *  destroy the purity that makes its proofs mean anything (ruling s079).
 *
 *  These names are BYTE-STABLE; another stream implements against them. */
export type ActivityCredibilityCause =
	| "observed-live" // a live probe corroborated the agent
	| "uncontradicted" // nothing contradicts the recorded activity
	| "agent-absent" // observed absent (terminal record, or a live absent probe)
	| "dissolved" // lifecycle: "dissolved"
	| "close-requested" // pij asked for this teardown
	| "probe-unavailable" // the liveness observation itself was unavailable — we do not know
	| "no-activity-recorded"; // no telemetry ever recorded — NOT the same as "it was idle"

export type ActivityVerdict = "current" | "superseded" | "unknown";

export interface ActivityCredibility {
	readonly verdict: ActivityVerdict;
	readonly cause: ActivityCredibilityCause;
	/** HUMAN-READABLE. Render it, NEVER parse it — it is prose and may be
	 *  reworded at any time. Branch on `verdict`/`cause` instead. */
	readonly reason: string;
	/** ISO-8601 of the evidence (e.g. `terminal.observedAt`). */
	readonly asOf?: string;
}

export interface ActivityCredibilityInput {
	readonly state?: "working" | "idle";
	readonly lastEventAt?: string;
	readonly lifecycle?: SessionLifecycle;
	readonly terminal?: TerminalObservation;
	/** Only ever set by a caller holding a LIVE PROBE. This module reads the
	 *  registry, so it deliberately never sets it. */
	readonly agentLiveness?: "alive" | "absent" | "unknown";
}

/** What a RETIRED watcher's record still says about it (#154 F-1).
 *
 *  Structurally a narrowed `SessionDescriptor`, so a caller hands back what its
 *  registry already returned — no mapping, no cast at the call site (P6). It
 *  deliberately omits `agentLiveness`: an archived record is a RECORD, and
 *  handing one to the predicate as though it were a probe would launder it into
 *  an observation. */
export interface RetiredWatcherRecord {
	readonly state?: "working" | "idle";
	readonly lastEventAt?: string;
	readonly lifecycle?: SessionLifecycle;
	readonly terminal?: TerminalObservation;
}

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
	/** Watchdog state as a PLAIN PROJECTION, passed IN like every other input.
	 *
	 *  Deliberately NOT a store handle and NOT a live probe: the sensor's purity
	 *  is the only reason its mutation proofs mean anything, so a new INPUT is
	 *  safe where a new READ would destroy it (albatross's ruling, s079). Absent
	 *  keeps every existing caller's behaviour byte-for-byte. */
	readonly watchdog?: WatchdogSubscriptionInputs;
	/** Injected, never imported: `state.ts` is another stream's file and a direct
	 *  import would couple this module's merge to theirs. Optional by
	 *  construction — absent keeps every existing caller byte-for-byte, and makes
	 *  "wiring absent" and "no row" the SAME observable, so an unwired production
	 *  call site is detectable rather than silently inert. */
	readonly activityCredibility?: (input: ActivityCredibilityInput) => ActivityCredibility;
	/** Resolves a watcher id the LIVE tier could not — i.e. a RETIRED seat.
	 *
	 *  Without this, the detector cannot see the one death it was built for.
	 *  `FsRegistry.list()` omits `lifecycle: "dissolved"` records by design
	 *  (`adapters/fs-registry.ts:148` — a dissolved seat is not live), and this
	 *  module never counts `unknown` as gone (also by design — an id that does
	 *  not resolve was never validated at write time, so calling it a death
	 *  reports a typo as a fatality). Each rule is right; COMPOSED they mean a
	 *  seat pij itself dissolved — the most clearly-dead watcher there is —
	 *  is precisely the case that produces no row. Measured against
	 *  `pij-continuing-ermine` / `pij-respectable-starfish`.
	 *
	 *  The repair is to distinguish "absent because RETIRED" from "absent
	 *  because it NEVER EXISTED", which are different facts that collapsed into
	 *  one bucket. It arrives as an INPUT like `watchdog` and
	 *  `activityCredibility`, so purity holds; it is consulted ONLY for ids that
	 *  miss the live tier, so the caller can serve it from a keyed O(1) archive
	 *  read and never enumerate; and what it returns is fed through the SAME
	 *  credibility predicate, so this module still never decides death itself.
	 *
	 *  Absent ⇒ behaviour byte-for-byte as before. Returning `undefined` for an
	 *  id keeps it `unknown` — this widens WHO can be resolved, never WHAT
	 *  counts as gone. */
	readonly resolveRetired?: (id: SessionId) => RetiredWatcherRecord | undefined;
}

/** One node's supervision wiring, projected. */
export interface WatchdogNodeView {
	readonly nodeId: SessionId;
	/** Seats subscribed to this node's notices. */
	readonly watchers: readonly SessionId[];
	/** Who paused it, if paused at all (`"self"` for a self-pause). */
	readonly pausedBy?: string;
	/** Absolute deadline of a time-bounded exemption. */
	readonly exemptUntilMs?: number;
}

export interface WatchdogSubscriptionInputs {
	/** The fleet-wide switch — ONE row when off, never one per seat. */
	readonly globallyDisabled: boolean;
	readonly nodes: readonly WatchdogNodeView[];
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

/** The remedies for an idle open assignment, BRANCHED ON TARGET KIND.
 *
 * A GENERAL assignment must never be offered `task close`. All three causes the
 * original text enumerated — work finished, genuinely waiting, real lost
 * dispatch — presuppose a record that CAN complete. A general assignment by
 * design never completes: it is the seat's standing existence, not a unit of
 * work. So "the work is finished" is not a case that can arise for it, and
 * offering a terminal action for a record with no terminal case is a category
 * error in the TEXT rather than a bug in the guard that refuses it.
 *
 * The cost of getting this wrong was measured: a seat that closes its general
 * burns a DETERMINISTIC id (`asg-general-<node>`) that can never be recycled,
 * and cannot declare a semantic state again until it has some other open
 * assignment. Recoverable via `pij task set`, but SILENT — nothing tells the
 * seat until it next tries to park, which can be days, while `report now` keeps
 * working and its card keeps rendering as current.
 *
 * Condition first, verb second, and no option offered that is untrue of the
 * target it is offered to.
 */
export function axisRemedy(nodeId: string, assignmentId: string): string {
	if (assignmentId === generalAssignmentId(nodeId)) {
		return (
			`'${assignmentId}' is the seat's GENERAL assignment, which never completes — do NOT close it (the id is deterministic and is not recyclable).` +
			` If the card is merely stale, ask '${nodeId}' to run: pij report now "<what I just did>" "<what's next>".` +
			` If it is genuinely parked, ask it to declare the state: pij report state waiting|hold|blocked|question --assignment ${assignmentId} (parked states never flag).` +
			" If neither is true, the seat really is idle with standing work and this row is the alarm"
		);
	}
	return (
		`If the WORK IS FINISHED and only the record is stale, ask '${nodeId}' to run: pij task close ${assignmentId} --reason done (only the assignee may attest done).` +
		` If it is genuinely WAITING on something with no known end: pij report state waiting|hold|blocked|question --assignment ${assignmentId} (parked states never flag).` +
		" If neither is true, the dispatch really is lost and this row is the alarm"
	);
}

/** The three buckets a subscription's watchers resolve into (#154).
 *
 *  `unknown` is a THIRD bucket and never folds into `gone`, for two independently
 *  measured reasons: verdict `unknown` covers `probe-unavailable`, where the
 *  observation ITSELF failed and is evidence of nothing; and an id that does not
 *  resolve at all is not a death, because watcher ids are never referentially
 *  validated at write time (`pij watchdog watch <target> --for <id>` validates
 *  only the TARGET, and the sidecar parser accepts any string), so a typo'd or
 *  cross-home `--for` would otherwise be reported as a fatality.
 *
 *  That guard stands. What F-1 fixes is a DIFFERENT confusion hiding under it:
 *  "absent because RETIRED" was collapsing into "absent because it NEVER
 *  EXISTED". `resolveRetired` separates them — and it does so by widening WHO
 *  can be resolved, never by widening WHAT counts as gone. Every id it resolves
 *  still goes through the credibility predicate; an id it cannot resolve is
 *  still `unknown`. */
interface WatcherComposition {
	readonly live: number;
	/** One rendered line per gone watcher — `reason`/`asOf` verbatim, for the
	 *  human. Rendered, never parsed. */
	readonly gone: readonly string[];
	readonly unknown: number;
}

function classifyWatchers(
	watchers: readonly SessionId[],
	byNode: ReadonlyMap<string, SessionDescriptor>,
	activityCredibility: (input: ActivityCredibilityInput) => ActivityCredibility,
	resolveRetired?: (id: SessionId) => RetiredWatcherRecord | undefined,
): WatcherComposition {
	let live = 0;
	let unknown = 0;
	const gone: string[] = [];
	for (const watcherId of watchers) {
		// LIVE TIER FIRST, and it is authoritative: a watcher the registry still
		// lists is present, and an archived copy of the same id is by definition
		// staler. The retirement lookup is a FALLBACK, never a merge — so it is
		// consulted only on a miss, which is also what keeps it a keyed O(1) read
		// of ids we already hold rather than an enumeration of the archive.
		const watcher: RetiredWatcherRecord | undefined =
			byNode.get(watcherId) ?? resolveRetired?.(watcherId);
		if (watcher === undefined) {
			unknown += 1;
			continue;
		}
		// `agentLiveness` is deliberately OMITTED: this module reads the registry,
		// it never holds a probe, and claiming one would launder a record into an
		// observation.
		const credibility = activityCredibility({
			...(watcher.state === undefined ? {} : { state: watcher.state }),
			...(watcher.lastEventAt === undefined ? {} : { lastEventAt: watcher.lastEventAt }),
			...(watcher.lifecycle === undefined ? {} : { lifecycle: watcher.lifecycle }),
			...(watcher.terminal === undefined ? {} : { terminal: watcher.terminal }),
		});
		if (credibility.verdict === "current") {
			live += 1;
			continue;
		}
		if (credibility.verdict === "unknown") {
			unknown += 1;
			continue;
		}
		gone.push(
			`${watcherId}: ${credibility.reason}${credibility.asOf === undefined ? "" : ` (as of ${credibility.asOf})`}`,
		);
	}
	return { live, gone, unknown };
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

	// inert-subscription — the wiring is REAL and the trigger is DEAD. A watcher
	// subscribed to a paused seat receives nothing, so it reports nothing, and
	// that reads as "no stalls". The subscription succeeds silently at install
	// and rots later when the target pauses itself mid-flight, so a setup-time
	// check is a chore that cannot catch the case it exists for — and the PA
	// cannot self-check it, because if its triggers are dead no sweep runs to
	// notice. So the check lives HERE, where dead triggers cannot silence it.
	if (inputs.watchdog !== undefined) {
		const wd = inputs.watchdog;
		const parked = new Map(
			inputs.descriptors.map((d) => [d.id, mutesWatchdogNudge(d.semanticState)]),
		);
		if (wd.globallyDisabled) {
			// ONE fleet-level row, NEVER one per seat: disable-all is a deliberate
			// operator action across every seat, and N rows for one switch is an
			// alarm storm that teaches everyone to ignore the instrument.
			const watched = wd.nodes.filter((n) => n.watchers.length > 0);
			if (watched.length > 0) {
				out.push({
					kind: "inert-subscription",
					// DEFERRED — pij#179. `watched[0]` follows FILESYSTEM ENUMERATION
					// ORDER, and the sweep routes each anomaly to that node's effective
					// parent: if the first watched seat happens to be a prime or a
					// parentless root, a FLEET-WIDE outage is dropped and then latched,
					// never to alert again. Harmless while this row only surfaced in a
					// human-run CLI query — Phase 0 activated it by making the row a
					// daemon alert, so the nondeterminism is now real. Left unchanged
					// deliberately: no deterministic fleet-level recipient exists in the
					// inputs this detector already holds, and inventing one here would
					// grow this PR into a routing redesign. Tracked as its own issue.
					nodeId: watched[0]?.nodeId ?? "",
					detail:
						`the watchdog is DISABLED FLEET-WIDE, so ${watched.length} live subscription(s) across ${watched.length} seat(s) will not fire —` +
						" every watcher is receiving silence and reading it as 'no stalls'." +
						" Re-arm with: pij watchdog enable-all",
					evidence: [watched.length],
				});
			}
		} else {
			for (const node of wd.nodes) {
				if (node.watchers.length === 0) continue;
				// #154 — the RECIPIENT half of an inert subscription. The block below
				// interrogates only the TRIGGER (paused / exempt / disabled); nothing
				// ever asked whether anyone is still on the far end. Measured live:
				// `pij-continuing-ermine` ran 42h with its sole watcher terminal since
				// 2026-08-06T01:31:59Z and produced zero rows of any kind — and the
				// absence of a nudge is indistinguishable from healthy operation,
				// which is the exact property the watchdog exists to defeat.
				//
				// Deliberately OUTSIDE the pause/exempt/parked guards below: those
				// three all describe the TRIGGER, and a subscription whose recipients
				// are gone delivers to nobody whatever the trigger is doing.
				if (inputs.activityCredibility !== undefined) {
					const composition = classifyWatchers(
						node.watchers,
						byNode,
						inputs.activityCredibility,
						inputs.resolveRetired,
					);
					// PARTIAL DEGRADATION DOES NOT FIRE (deliberate scope decision, not
					// an oversight): one live watcher still receives every notice, and a
					// row for "fewer readers than you configured" is a much noisier
					// signal about subscription INTEGRITY rather than DELIVERY (F-17 — a
					// detector nobody believes is worse than none).
					//
					// `gone > 0` is REQUIRED alongside `live === 0`, and it is not a
					// tightening of the rule but the rule itself. `live === 0` alone
					// fires on a subscription whose every watcher is merely UNKNOWN —
					// an unresolvable id, or a probe that failed — which is precisely
					// the fatality-from-nothing this detector must never commit, and is
					// what criteria 4 and 5 pin. #154's claim is "every watcher is a
					// terminated session": that needs at least one OBSERVED terminal
					// recipient and no live one.
					if (composition.live === 0 && composition.gone.length > 0) {
						out.push({
							kind: "inert-subscription",
							nodeId: node.nodeId,
							detail:
								`'${node.nodeId}' has ${node.watchers.length} watcher(s) (${node.watchers.join(", ")}) and no LIVE watcher remains:` +
								` ${composition.gone.length} carry a terminal or retirement observation [${composition.gone.join("; ")}],` +
								` ${composition.unknown} unresolvable/unknown (never counted against the subscription — an id that does not resolve was never validated at write time, and an unavailable probe is evidence of nothing).` +
								" The wiring is real and the far end receives nothing, so every notice this seat would raise is delivered to nobody." +
								" This row reports an OBSERVATION, not a fatality: `terminal` is a latch written by a blind probe, and 2 of 31 sampled seats carried one while their agent was running." +
								` Re-subscribe a live watcher: pij watchdog watch ${node.nodeId} --for <live-seat>.` +
								" It is not resolved by resuming a pause (this row is about the RECIPIENT, not the trigger) and not by refreshing a card.",
							// Evidence must CHANGE as the condition worsens — the sweep
							// latches on `kind:node:evidence`, so a constant alerts once and
							// then stays silent forever (the `status-stale` precedent).
							//
							// TWO elements, and that is load-bearing: the paused-trigger row
							// for this same node carries `[watchers.length]`, which is
							// exactly `gone` whenever every watcher is gone — a one-element
							// key would COLLIDE with it and silently swallow whichever row
							// the sweep saw second.
							evidence: [composition.gone.length, composition.unknown],
						});
					}
				}
				// (c) EXEMPT is silent while live: an exemption is time-bounded with a
				// persisted absolute deadline that re-arms itself, so it cannot rot —
				// that is precisely what distinguishes it from a pause.
				if (node.exemptUntilMs !== undefined && node.exemptUntilMs > inputs.nowMs) continue;
				if (node.pausedBy === undefined) continue;
				// (d) A `compact` pause is SYSTEM-INITIATED and SELF-CLEARING, so it is
				// not a withdrawal from supervision at all: pij sets it around its own
				// compaction (`core/watchdog.ts` applyCompactPause) and
				// `applyWorkingTransition` lifts it on the next working transition
				// without anyone being asked. The row below says a seat "removed itself
				// from supervision unilaterally" and prescribes a manual
				// `pij watchdog resume` — both false here, and the remedy is
				// "wait", which is not a remedy.
				//
				// Latent until Phase 0 turned this row on in the daemon: a 600ms sweep
				// can see the transient window a human running the CLI never would. A
				// false positive on a healthy seat is the most expensive possible
				// output for a detector, because it spends the fleet's willingness to
				// believe the next TRUE row.
				if (node.pausedBy === "compact") continue;
				// (a) PAUSED + a DECLARED parked state is SILENT: the seat said out
				// loud why it is quiet, and that is healthy. This keeps faith with
				// parked-states-never-flag rather than carving an exception into it.
				// (b) PAUSED + NO declared state EMITS: a seat has removed itself from
				// supervision unilaterally while its watchers believe they are armed.
				if (parked.get(node.nodeId) === true) continue;
				out.push({
					kind: "inert-subscription",
					nodeId: node.nodeId,
					detail:
						`'${node.nodeId}' has ${node.watchers.length} watcher(s) (${node.watchers.join(", ")}) but its watchdog is PAUSED by ${node.pausedBy} with no declared state —` +
						" the subscription is real and the trigger is dead, so its watchers receive silence and read it as 'no stalls'." +
						` Either resume supervision (pij watchdog resume ${node.nodeId}) or declare why it is quiet (pij report state waiting|hold|blocked|question).` +
						" This row is about SUPERVISION WIRING, not card freshness — it is not resolved by reporting.",
					evidence: [node.watchers.length],
				});
			}
		}
	}

	const dispatchStaleMs = inputs.dispatchStaleMs ?? DEFAULT_DISPATCH_UNACKED_STALE_MS;

	// status-stale — the seat is ACTIVELY EMITTING but its now/next card has not
	// moved. The watchdog cannot reach this class: it fires on silence, and this
	// seat is the opposite of silent.
	const statusStaleMs = inputs.statusStaleMs ?? DEFAULT_STATUS_STALE_MS;
	for (const descriptor of inputs.descriptors) {
		if (descriptor.lifecycle === "dissolved" || descriptor.lifecycle === "failed") continue;
		// Scoped by the TWO-PREDICATE split (Jordan's rulings, 2026-07-30):
		//
		//   owesStatusCard  — may this seat be CHASED for a card?   PM only.
		//   cardCanMislead  — can its card MISINFORM a reader?      anyone holding one.
		//
		// Deliberately asymmetric, because THE CONSUMER CANNOT TELL WHO OWED THE
		// CARD. A rotten card misinforms identically whether the seat was obliged
		// to write it or chose to. Collapsing these into one role test is what put
		// a card obligation on every prime in the first place.
		//
		// This gate is where BOTH exclusions actually land, so it is the line to
		// keep honest: a worker holding a card is skipped (renders nowhere), and a
		// prime holding none is skipped (nothing to rot). Its worker half also
		// keeps the sensor CREDIBLE — measured on the live fleet the day it
		// shipped, 26 of 29 live seats had never reported, so an unscoped rule
		// fires on ~90% of the fleet on its first run (F-17: a detector nobody
		// believes is worse than no detector).
		const owesCard = owesStatusCard(descriptor);
		if (!cardCanMislead(descriptor) && !owesCard) continue;
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
		// Never reported at all: age from the seat's own start, so a PM that has
		// worked an hour without filing one is caught (A-2 — keying on statusAt
		// alone would never fire for exactly that seat).
		//
		// Only a card-OWING seat can reach this branch: a seat holding no card and
		// owing none was already skipped by the scope gate above, which is what
		// makes absence-without-obligation a non-event rather than the
		// false-positive-by-CLASS it used to be. `owesCard` here is belt-and-braces
		// so the intent survives if that gate is ever loosened — the gate is the
		// mutation-verified half.
		const anchorMs = statusAtMs ?? (owesCard ? validTimestampMs(descriptor.startedAt) : undefined);
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
				// ORDERED BY SITUATION, not by preference, and the ordering is
				// load-bearing. status-stale's detector INPUT is `statusAt`, and
				// `report now` writes `statusAt` — so for a seat parked on something
				// with no known end, the card refresh CANNOT resolve this row by
				// construction: it resets the clock on an unchanged wait and the row
				// returns every threshold, forever. Offering both as equals (and the
				// ineffective one first) taught a correctly-parked seat to snooze an
				// alarm indefinitely, which is how a fleet learns to discount an
				// instrument. Declaring a parked state changes the CONDITION, so it
				// is the only one of the two that ends the row.
				//
				// The `why` is stated rather than implied: a seat that learns the
				// difference once will not make this mistake at any OTHER detector.
				` If '${descriptor.id}' is waiting on something with no known end, it should declare a parked state: pij report state waiting|hold|blocked|question` +
				" (parked seats never flag). Otherwise it should update its card:" +
				` pij report now "<what I just did>" "<what's next>"` +
				" — note that refreshing a card resets this timer WITHOUT changing the wait, so a parked seat that reports instead of declaring will be asked again every threshold.",
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
		if (!isOpenDispatch(dispatch)) continue;
		if (dispatch.state === "undelivered") continue;
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
		// REMEDIATION MUST NAME THE ASSIGNMENT (plan 077). A bare `report state`
		// resolves through currentAssignment and then the general fall-through, and
		// under the s077 guard that REFUSES when the resolved record is closed — so
		// a bare remediation line could hand a seat a command the platform then
		// rejects. Naming `--assignment <id>` makes it precondition-free BY
		// CONSTRUCTION: this row only exists for an assignment the detector just
		// proved OPEN (`assignment.closed !== undefined` continues above), so the
		// targeted record can never be the closed one. An automatically-emitted
		// instruction must not be refusable by the system that emitted it.
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
		// THE REMEDY OMITTED THE COMMONEST CAUSE. This row correctly detects an
		// open assignment with no matching activity, but it offered ONLY parked
		// states — and the usual reason is neither: THE WORK IS FINISHED AND THE
		// RECORD IS STALE. `task close --reason done` is the discharging action
		// and the line never named it.
		//
		// That made it the worst of the three bad-remedy sites we found: a
		// COMPLIANT seat, following the instruction exactly, would declare a
		// parked state and PERMANENTLY SILENCE a row pointing at genuine
		// undischarged work — the snooze, arrived at by obeying. Found on this
		// government's own record: #71's assignment sat open four hours after it
		// merged, and every option the row offered was false of it.
		//
		// Condition first, verb second, and all three causes named — including
		// the one where the row is RIGHT, so a reader can tell "I should discharge
		// this" from "I should declare a wait" from "this is a real lost dispatch".
		out.push({
			kind: "axis-disagreement",
			nodeId: assignment.nodeId,
			assignmentId: assignment.id,
			detail: `'${assignment.nodeId}' has open ${chainState.state === "ready" ? "ready" : "undeclared"} assignment '${assignment.id}' but has been mechanically idle ${Number.isFinite(idleMs) ? `${Math.round(idleMs / 3_600_000)}h` : "since forever"} (threshold ${Math.round(threshold / 3_600_000)}h) — the lost-dispatch shape. ${axisRemedy(assignment.nodeId, assignment.id)}`,
			evidence,
		});
	}
	return out;
}
