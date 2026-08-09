import {
	type OrchestrationRole,
	owesStatusCard,
	projectOrchestrationRole,
} from "../orchestration/role.js";
import type { DeliveryPort } from "../ports.js";
import { STALE_AFTER_MS } from "../state.js";
import type { SessionDescriptor, SessionId, WatchdogSidecar, WatchdogWatcher } from "../types.js";
import {
	applyWorkingTransition,
	buildWatchdogTurn,
	captureSlice,
	type EffectiveWatchdogConfig,
	effectiveWatchdog,
	evaluateResponse,
	isAnomalyVerdict,
	isFireDue,
	mutesWatchdogNudge,
	reconcileWatchdogExemption,
	shouldCapture,
	verdictNoticeLines,
	type WatchdogResponse,
	watchdogScheduleAnchorMs,
} from "../watchdog.js";
import { pauseForCompactMessage } from "./router.js";

export interface WatchdogStorePort {
	read(id: SessionId): WatchdogSidecar | undefined;
	write(id: SessionId, sidecar: WatchdogSidecar): void;
	revision?(id: SessionId): number | null;
	writeCapture?(watcherId: SessionId, targetId: SessionId, nowMs: number, content: string): string;
}

export interface WatchdogResponseEvent {
	readonly session: SessionDescriptor;
	/** `unknown` is UNREPRESENTABLE here, and that is the whole point.
	 *
	 * `daemon.pushWatchdogResponse` (`daemon.ts:797-819`) branches
	 * `responsive` → clear the latch, `stalled` → set `failureReason: "stalled"`,
	 * anything else → silent no-op. Widening `WatchdogResponse` would have made a
	 * no-evidence verdict a silent no-op in a file this stream does not own — a
	 * stale consumer TypeScript could not see (plan 096, KF-06).
	 *
	 * Narrowing the field instead means the COMPILER, not a comment, proves that
	 * "I examined nothing" can never reach the failure latch. `daemon.ts` needs no
	 * change; a deliberate attempt to publish `unknown` fails to build. */
	readonly response: Exclude<WatchdogResponse, "unknown">;
	readonly consecutiveSilentFires: number;
}

export interface WatchdogManagerDeps {
	readonly store: WatchdogStorePort;
	readonly channel: DeliveryPort;
	readonly isAlive: (pid: number) => boolean;
	/** Machine-wide kill switch (Plan 056). When it returns true, NO peer is
	 *  watched or fired — global, not per-descriptor, so peers spawned while off
	 *  are covered without any sidecar writes. Absent ⇒ always enabled. */
	readonly globallyDisabled?: () => boolean;
	readonly now: () => number;
	readonly capturePane: (session: SessionDescriptor) => string;
	readonly hasPendingWatchdog: (id: SessionId) => boolean;
	readonly onFire?: (session: SessionDescriptor, atMs: number) => void;
	readonly onResponse?: (event: WatchdogResponseEvent) => void;
	readonly log?: (line: string) => void;
}

interface RuntimeState {
	ordinal: number;
	consecutiveSilentFires: number;
	lastFireAtMs: number | null;
	scheduleAnchorAtMs: number | null;
	activityAnchorAtMs: number | null;
	lastEventAt: string | undefined;
	lastStatusAt: string | undefined;
	lastState: SessionDescriptor["state"];
	lastPane: string | undefined;
	awaitingResponse: boolean;
	/** Did the PEER ITSELF answer since the last delivered fire? Driven from the
	 *  `session.statusAt !== state.lastStatusAt` comparison this file already
	 *  makes to re-anchor the schedule — the one signal on this path the observer
	 *  cannot fabricate (plan 096, KF-14). Reset when a fire is delivered. */
	answeredSinceLastFire: boolean;
	eventAttributionPending: boolean;
	paneAttributionPending: boolean;
	transitionAttributionPending: boolean;
	watchdogTransitionReturnPending: boolean;
	eventAdvanced: boolean;
	eventAdvanceWasWatchdog: boolean;
	workingTransition: boolean;
	workingTransitionWasWatchdog: boolean;
	anomalyWatcherStallsNotified: Set<SessionId>;
	/** Activity anchor a liveness verdict was already reported for, so sustained
	 *  freshness reports `responsive` once per anchor rather than every tick. */
	livenessReportedForAnchorMs: number | null;
}

/** What a fire could actually READ from the target's pane.
 *
 * `unreadable` is the case pij#161 hit live. The real adapter maps a capture
 * failure to `""` and never throws (`adapters/daemon-tmux.ts:231-236`, proven at
 * `daemon-real-adapter.test.ts:130-136`), so a pane that no longer exists arrives
 * here as an empty string. That is the ABSENCE of a reading, and absence of a
 * reading is not a reading: it must never be graded, never be written as a
 * capture, and never — the state-corrupting half, KF-02 — be read as pane
 * activity, because a raw string inequality made `"…text…"` → `""` look like
 * movement and manufactured a recovery that cleared a real `stalled` latch.
 *
 * Residual, stated rather than hidden (KF-04): a genuinely blank LIVE pane is
 * indistinguishable from a dead one at this seam and is therefore also reported
 * unavailable. Treating it conservatively as unread is the honest reading. */
type PaneEvidence =
	| { readonly kind: "paneless" }
	| { readonly kind: "unreadable" }
	| { readonly kind: "content"; readonly text: string };

function timestampMs(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Does a seat in this role need the watchdog watching it?
 *
 * EXHAUSTIVE BY COMPILER, not by convention. This gate has been wrong twice in
 * the same way: it first read `role !== "pm"`, silently excluding every prime;
 * 94d4564 fixed that by widening one name to two — and the remedy PRESERVED
 * THE SHAPE THAT CAUSED THE BUG, so when `pa` arrived the gate excluded all
 * five PAs on the box before any anchor, interval or pause logic ran. Zero
 * fires, ever. A widening buys exactly one role and re-arms the trap for the
 * next, silently, because the failure mode is a role that is simply NOT
 * MENTIONED and nothing knows the list was meant to be complete.
 *
 * This is not a new idea — it is a ruling this file did not get. role.ts:18
 * already says that "a type and a hand-written validator drift silently …
 * widening a union produces ZERO compile errors at every parser that guards on
 * literals. That is exactly how `pa` became a legal type and an illegal
 * argument." That comment diagnoses the old line 97 by description. The parser
 * seam was fixed with a derived vocabulary; this gate was the straggler.
 *
 * `null` is a REAL inhabitant (an unroled seat), not an impossible case, so it
 * is handled rather than defaulted. Every arm is a written decision INCLUDING
 * the exclusions — an exclusion that exists because nobody listed the name is
 * indistinguishable from one that was reasoned about, and this gate is the
 * proof of that.
 *
 * Named for the QUESTION rather than the identity (meadowlark): the thing that
 * matters is whether a seat needs supervision, and a role list is only the
 * honest way to answer it while supervision is a hierarchy fact rather than a
 * structural one. If a structural derivation ever exists, replace the body and
 * keep the name.
 *
 * SCOPE — THIS ANSWERS THE NUDGE AXIS ONLY, and the seam is recorded rather
 * than assumed away (albatross, s080). `eligible()` gates two different things
 * with different right answers. The NUDGE is delivered to `session.id` itself,
 * so a recipient ALWAYS exists and no has-someone-to-tell condition applies —
 * which is why a role switch is the honest predicate here. `notifyWatchers()`
 * is a separate call over `sidecar.watchers` and that axis genuinely does need
 * somebody to tell. NOT split in this change: a structural
 * `parent != null || watchers.length > 0` predicate was proposed for
 * eligibility and REJECTED, because measured against the live fleet three of
 * seven primes have neither, so it would silently un-watch them and reverse
 * Jordan's 2026-07-30 ruling. Do not let this function's answer leak to the
 * watcher axis on the assumption that one serves both.
 */
export function roleNeedsSupervision(role: OrchestrationRole | null): boolean {
	switch (role) {
		// The only seat with NO SUPERVISOR. A wedged PM is caught by its prime; a
		// wedged prime is caught by nobody, and `pushWholeLifeTransition` returns
		// early for a creator-less seat, so this ping is its only heartbeat.
		case "prime":
			return true;
		// Reports up to a prime, and holds a card consumers render as current.
		case "pm":
			return true;
		// WATCHED, for a reason stronger than either of the above: a PA's chore is
		// to notice when its prime goes QUIET, so its only other trigger — the
		// prime messaging it — fires precisely when the condition it exists to
		// detect is ABSENT. Excluded, it is unreachable BY CONSTRUCTION rather
		// than merely delayed.
		case "pa":
			return true;
		// NOT watched, and this is a DECISION rather than an omission: a worker
		// has a PM directly above it, and that PM is itself watched, so a wedged
		// worker is caught one level up. The argument is the SUPERVISOR, not
		// seniority — revisit if workers ever run unparented.
		case "worker":
			return false;
		// NOT watched: an unroled seat has no declared place in the hierarchy, so
		// there is nobody to notify and no cadence to hold it to. Stamping a role
		// is what opts a seat in.
		case null:
			return false;
		default: {
			// Adding a role to OrchestrationRole FAILS THE BUILD here until someone
			// makes an explicit supervision decision for it. The decision becomes
			// unavoidable rather than remembered — considered by the compiler
			// rather than by whoever happens to grep.
			const _exhaustive: never = role;
			return false;
		}
	}
}

function eligible(session: SessionDescriptor): boolean {
	// PRIMES ARE WATCHED TOO (Jordan's ruling, 2026-07-30). The original gate was
	// `!== "pm"`, which silently excluded every prime — a prime projects to
	// "prime", never "pm". So the fleet's governing seats were the only ones no
	// reporting clock ever touched, in the direction nobody checks.
	//
	// ELIGIBILITY IS NOT `owesStatusCard`. The two are separate questions and
	// only the NUDGE COPY branches on the second — a PA is watched and owes no
	// card, which is the live case that keeps them apart. (This comment used to
	// justify the split with "a prime owes no card", citing the 2026-07-30
	// ruling BY DATE — which Jordan REVERSED on 2026-07-31. The split is right;
	// the example it leaned on had been overturned.)
	// The justification for watching a prime is not its card: it is that a prime
	// is the only seat with NO SUPERVISOR. A wedged PM is caught by its prime; a
	// wedged prime is caught by nobody — the owner-facing "stalled" notice cannot
	// reach anyone for it either, since `pushWholeLifeTransition` returns early
	// when `spawnedBy` is absent and a prime is creator-less. This ping is its
	// only external heartbeat.
	if (!roleNeedsSupervision(projectOrchestrationRole(session))) return false;
	// An EXTERNAL pull target is never tick-owned, driven, buffered, or drained —
	// the daemon does not own its delivery, so it must not buffer a watchdog turn
	// into it either. (A pi peer pulls its own inbox but IS watchdog-delivered:
	// AC-10.) This guard was latent until the startedAt anchor fix made pull
	// targets fire-eligible for the first time.
	// Deliberate-silence class (Plan 056): a relay/bridge peer forwards its inbox
	// to an external sink (the pij-telegram bridge → the operator's phone). Its
	// idleness is correct by design; a watchdog nudge into it becomes a real-world
	// message. Never watch it.
	if (session.relay) return false;
	if (session.deliveryMode === "pull" && (session.harness ?? "pi") !== "pi") return false;
	const deliveryAvailable =
		(session.harness ?? "pi") === "pi" ||
		session.deliveryMode === "pull" ||
		session.paneId !== undefined;
	return (
		deliveryAvailable &&
		session.lifecycle !== "pending" &&
		session.lifecycle !== "ready" &&
		session.lifecycle !== "failed" &&
		session.lifecycle !== "dissolved"
	);
}

/** Daemon-owned runtime coordinator. Pure watchdog decisions remain in watchdog.ts. */
export class WatchdogManager {
	private readonly states = new Map<SessionId, RuntimeState>();
	private readonly revisions = new Map<SessionId, number | null>();
	private readonly sidecars = new Map<SessionId, WatchdogSidecar | undefined>();
	/** Next-due stamp per scheduled seat, for the projection (s101). Derived, never
	 *  authoritative: PRESENCE in `states` is what "in the scheduler" means, and
	 *  this map only decorates it. */
	private readonly nextDueAt = new Map<SessionId, string>();

	private wasGloballyDisabled = false;

	constructor(private readonly deps: WatchdogManagerDeps) {}

	reconcile(sessions: readonly SessionDescriptor[]): void {
		// Machine-wide kill switch (Plan 056): drop all runtime state and fire
		// nothing while globally off.
		if (this.deps.globallyDisabled?.()) {
			for (const id of [...this.states.keys()]) this.disposeSession(id);
			this.wasGloballyDisabled = true;
			return;
		}
		// On the disabled→enabled edge, RE-ANCHOR every peer to now: the disabled
		// window must not count toward isFireDue(), or every otherwise-due peer
		// fires the instant the switch flips back on (a re-enable nudge-storm).
		// Dropping in-memory state alone does NOT re-anchor — reconcileSession
		// rebuilds the anchor from the descriptor's old timestamps, which is
		// exactly the disabled window. So force a fresh `now` anchor here.
		const reanchorNowMs = this.wasGloballyDisabled ? this.deps.now() : undefined;
		this.wasGloballyDisabled = false;
		const seen = new Set<SessionId>();
		for (const session of sessions) {
			if (!eligible(session) || !this.deps.isAlive(session.pid)) {
				this.disposeSession(session.id);
				continue;
			}
			seen.add(session.id);
			this.reconcileSession(session, reanchorNowMs);
		}
		for (const id of this.states.keys()) {
			if (!seen.has(id)) this.disposeSession(id);
		}
	}

	activeCount(): number {
		return this.states.size;
	}

	/** What the daemon projects to disk so `pij watchdog status` can answer "is
	 *  this seat actually in the scheduler?" (s101).
	 *
	 *  Keyed off `states`, which IS the scheduler — `activeCount()` above has
	 *  reported its size since this class was written, and its only callers were
	 *  tests, because no other PROCESS could reach it. That is the gap: a fact
	 *  observable from inside the daemon and nowhere else. */
	schedulerProjection(): Record<SessionId, { readonly nextDueAt?: string }> {
		const out: Record<SessionId, { readonly nextDueAt?: string }> = {};
		for (const id of this.states.keys()) {
			const due = this.nextDueAt.get(id);
			out[id] = due === undefined ? {} : { nextDueAt: due };
		}
		return out;
	}

	disposeSession(id: SessionId): void {
		this.states.delete(id);
		this.nextDueAt.delete(id);
		this.revisions.delete(id);
		this.sidecars.delete(id);
	}

	disposeAll(): void {
		this.states.clear();
		this.nextDueAt.clear();
		this.revisions.clear();
		this.sidecars.clear();
	}

	/** The daemon asks before crediting paneSig movement as peer activity. */
	isPaneChangeWatchdogAttributed(
		id: SessionId,
		pane: string,
		observedState?: SessionDescriptor["state"],
	): boolean {
		const state = this.states.get(id);
		if (!state?.awaitingResponse || state.lastPane === undefined || pane === state.lastPane) {
			return false;
		}
		const firstMutation = state.paneAttributionPending;
		const returnMutation =
			state.watchdogTransitionReturnPending &&
			state.lastState === "working" &&
			observedState === "idle";
		if (!firstMutation && !returnMutation) return false;
		state.lastPane = pane;
		if (firstMutation) state.paneAttributionPending = false;
		return true;
	}

	/** Is this peer on a live safety exemption — i.e. is its silence DELIBERATE?
	 *
	 *  `pij watchdog exempt` says "this peer is intentionally idle on standby".
	 *  That is a claim about the peer, not merely a request to stop nudging it, so
	 *  it must silence watchdog traffic in BOTH directions: the peer-facing nudge
	 *  AND the owner-facing "gone quiet (stalled)" notice. The nudge path gets this
	 *  for free — `isFireDue` refuses to fire while paused — but the daemon runs a
	 *  SECOND, independent stall detector that derives `stalled` straight from
	 *  descriptor state and event age and never reads this sidecar at all. This is
	 *  the seam that lets it ask.
	 *
	 *  Deliberately narrower than "any pause tier": `pause`/`compact` mean "stop
	 *  nudging", which is not the same claim as "silence here is expected", so they
	 *  are NOT treated as exemptions. Reconciled against the clock on every call so
	 *  an EXPIRED exemption stops suppressing immediately — a lapsed safety
	 *  exemption must never become permanent notification blindness. */
	isExempt(id: SessionId): boolean {
		const sidecar = this.readSidecar(id);
		if (sidecar === undefined) return false;
		return reconcileWatchdogExemption(sidecar, this.deps.now()).effectivePause === "exempt";
	}

	/** Persist the tmux compact pause before the router injects `/compact`. */
	beforeTmuxInject(id: SessionId, message: { readonly command?: string }, nowMs: number): void {
		const current = this.readSidecar(id);
		const next = pauseForCompactMessage(message, current, nowMs);
		if (next !== current && next !== undefined) this.writeSidecar(id, next);
	}

	private reconcileSession(session: SessionDescriptor, reanchorNowMs?: number): void {
		const nowMs = this.deps.now();
		let sidecar = this.readSidecar(session.id);
		// Re-arm before any scheduler decision or effective activity can fire.
		// This durable write is the restart boundary: an expired in-memory view
		// must never deliver one turn while watchdog.json still says exempt.
		const reconciled = reconcileWatchdogExemption(sidecar, nowMs);
		if (reconciled.sidecar !== sidecar && reconciled.sidecar !== undefined) {
			this.writeSidecar(session.id, reconciled.sidecar);
		}
		sidecar = reconciled.sidecar;
		let state = this.states.get(session.id);
		if (!state) {
			state = {
				ordinal: 0,
				consecutiveSilentFires: 0,
				// On a global re-enable, anchor to now so the disabled window does
				// not count as silence (else a long-disabled peer fires instantly).
				lastFireAtMs: reanchorNowMs ?? timestampMs(session.lastWatchdogFireAt),
				scheduleAnchorAtMs: reanchorNowMs ?? watchdogScheduleAnchorMs(session),
				activityAnchorAtMs:
					reanchorNowMs ?? timestampMs(session.lastEventAt) ?? timestampMs(session.startedAt),
				lastEventAt: session.lastEventAt,
				lastStatusAt: session.statusAt,
				lastState: session.state,
				lastPane: undefined,
				awaitingResponse: false,
				answeredSinceLastFire: false,
				eventAttributionPending: false,
				paneAttributionPending: false,
				transitionAttributionPending: false,
				watchdogTransitionReturnPending: false,
				eventAdvanced: false,
				eventAdvanceWasWatchdog: false,
				workingTransition: false,
				workingTransitionWasWatchdog: false,
				anomalyWatcherStallsNotified: new Set<SessionId>(),
				livenessReportedForAnchorMs: null,
			};
			this.states.set(session.id, state);
		}

		const eventAdvanced =
			session.lastEventAt !== undefined && session.lastEventAt !== state.lastEventAt;
		if (eventAdvanced) {
			const wasWatchdog = state.awaitingResponse && state.eventAttributionPending;
			state.eventAdvanced = true;
			state.eventAdvanceWasWatchdog = wasWatchdog;
			state.eventAttributionPending = false;
			state.lastEventAt = session.lastEventAt;
			if (!wasWatchdog) {
				state.activityAnchorAtMs = timestampMs(session.lastEventAt);
				this.reportRealRecovery(session, state);
			}
		}

		if (session.statusAt !== state.lastStatusAt) {
			state.scheduleAnchorAtMs = watchdogScheduleAnchorMs(session);
			state.lastStatusAt = session.statusAt;
			// The peer ITSELF wrote a status card. `statusAt` moves only through the
			// CLI writer (`registry-write.ts:90`), so this is the one liveness signal
			// on this path the observer cannot fabricate — unlike `lastEventAt`,
			// which the delivery of a watchdog turn advances all by itself (KF-13).
			state.answeredSinceLastFire = true;
		}

		const idleTransition = state.lastState === "working" && session.state === "idle";
		if (idleTransition && state.awaitingResponse) {
			if (state.watchdogTransitionReturnPending) {
				state.watchdogTransitionReturnPending = false;
			} else {
				this.reportRealRecovery(session, state);
			}
		}

		const workingTransition = state.lastState !== "working" && session.state === "working";
		if (workingTransition) {
			const wasWatchdog = state.awaitingResponse && state.transitionAttributionPending;
			state.workingTransition = true;
			state.workingTransitionWasWatchdog = wasWatchdog;
			state.transitionAttributionPending = false;
			state.watchdogTransitionReturnPending = wasWatchdog;
			if (!wasWatchdog) {
				const resumed = applyWorkingTransition(sidecar ?? {});
				if (resumed !== sidecar && sidecar?.pausedBy === "compact") {
					this.writeSidecar(session.id, resumed);
					sidecar = resumed;
				}
				this.reportRealRecovery(session, state);
			}
		}
		state.lastState = session.state;

		const cfg = effectiveWatchdog(sidecar);
		// Projected for `pij watchdog status` (s101). Cheap: the anchor and interval
		// are both already in hand here, so this costs an addition and a map set.
		const anchorMs = state.scheduleAnchorAtMs;
		if (anchorMs !== null && Number.isFinite(anchorMs)) {
			this.nextDueAt.set(session.id, new Date(anchorMs + cfg.intervalMs).toISOString());
		} else {
			this.nextDueAt.delete(session.id);
		}
		const descriptorFire = timestampMs(session.lastWatchdogFireAt);
		if (
			descriptorFire !== null &&
			(state.lastFireAtMs === null || descriptorFire > state.lastFireAtMs)
		) {
			state.lastFireAtMs = descriptorFire;
		}
		this.reportSustainedLiveness(session, state, cfg, nowMs);

		if (!isFireDue(cfg, state.lastFireAtMs, state.scheduleAnchorAtMs, nowMs)) return;
		// PARKED SEATS ARE NOT NUDGED (plan 076, DL-002). Placed HERE, not in
		// `eligible()`, and the distinction is the whole design: `eligible()` gates
		// ALL watchdog involvement, so muting there would also switch off stall
		// classification and the dead/provider-failure axes for a parked seat — and
		// a parked seat can still die. This suppresses exactly one outbound nudge.
		//
		// Note `reportSustainedLiveness` above runs BEFORE this return, so liveness
		// supervision continues unchanged for a parked seat; only the pane-facing
		// ping stops.
		//
		// The fire clock is deliberately ADVANCED rather than left standing: not
		// advancing it would leave the seat permanently "overdue", so the instant it
		// un-parks it would be nudged immediately — punishing the declaration one
		// tick late instead of on time.
		if (mutesWatchdogNudge(session.semanticState)) {
			state.lastFireAtMs = nowMs;
			this.deps.log?.(
				`watchdog ${session.id}: parked (${session.semanticState}) — nudge muted, supervision unchanged`,
			);
			return;
		}
		if (this.deps.hasPendingWatchdog(session.id)) {
			state.lastFireAtMs = nowMs;
			this.deps.log?.(`watchdog ${session.id}: pending ping exists — coalesced`);
			return;
		}

		const paneAvailable = session.paneId !== undefined;
		const captured = paneAvailable ? this.deps.capturePane(session) : undefined;
		const paneEvidence: PaneEvidence =
			captured === undefined
				? { kind: "paneless" }
				: captured === ""
					? { kind: "unreadable" }
					: { kind: "content", text: captured };
		const pane = paneEvidence.kind === "content" ? paneEvidence.text : undefined;
		// A pane that could not be read has not CHANGED — it has gone quiet as a
		// source. Comparing `""` against the last content is a raw string
		// inequality, and it read a DYING pane as pane activity; with no fire
		// outstanding that reached `reportRealRecovery`, which emits `responsive`,
		// which clears `failureReason: "stalled"` in the daemon (KF-02). A pane
		// disappearing must never manufacture a recovery.
		const paneChanged =
			paneEvidence.kind === "content" &&
			state.lastPane !== undefined &&
			paneEvidence.text !== state.lastPane;
		const paneChangeWasWatchdog =
			paneChanged && state.awaitingResponse && state.paneAttributionPending;
		if (paneChanged && !paneChangeWasWatchdog) this.reportRealRecovery(session, state);

		const answeredSinceLastFire = state.answeredSinceLastFire;
		const nextSilent = state.consecutiveSilentFires + 1;
		// NO INITIALISER, deliberately. Until plan 096 this read
		// `let response: WatchdogResponse = "responsive"`, and on any fire with no
		// response outstanding the evidence block below never ran — so a variable's
		// declaration, which examined nothing, was delivered to the watcher as a
		// health verdict (pij#161). Every verdict now comes from a branch that
		// either examined something or says plainly that it did not.
		const response: WatchdogResponse = state.awaitingResponse
			? evaluateResponse({
					cfg,
					consecutiveSilentFires: nextSilent,
					eventAdvanced: state.eventAdvanced,
					eventAdvanceWasWatchdog: state.eventAdvanceWasWatchdog,
					answeredSinceLastFire,
					...(paneAvailable
						? {
								pane: {
									changed: paneChanged,
									changeWasWatchdog: paneChangeWasWatchdog,
									workingTransition: state.workingTransition,
									workingTransitionWasWatchdog: state.workingTransitionWasWatchdog,
								},
							}
						: {}),
				})
			: "unknown";
		// The narrowing is WRITTEN, not inferred: TypeScript cannot know that
		// `awaitingResponse` excludes `"unknown"`, and `WatchdogResponseEvent`
		// forbids it — which is how the compiler rather than a comment proves a
		// no-evidence verdict can never reach the daemon's stalled latch.
		if (response !== "unknown") {
			// An ANSWERED fire is not a SILENT one. Incrementing the silent counter
			// for it would let one later genuine silence jump straight from a long
			// answered run to `stalled` (KF-15) — the counter must only ever count
			// fires the peer said nothing to.
			if (response === "responsive") state.consecutiveSilentFires = 0;
			else if (!answeredSinceLastFire) state.consecutiveSilentFires = nextSilent;
			this.deps.onResponse?.({
				session,
				response,
				consecutiveSilentFires: state.consecutiveSilentFires,
			});
		}
		this.notifyWatchers(
			session,
			state,
			sidecar?.watchers ?? [],
			response,
			paneEvidence,
			nowMs,
			isAnomalyVerdict(response),
		);

		const ordinal = state.ordinal + 1;
		const body = buildWatchdogTurn(session.id, ordinal, {
			...cfg,
			paneAvailable,
			owesCard: owesStatusCard(session),
			ownAltitude: projectOrchestrationRole(session) === "prime",
		});
		const outcome = this.deps.channel.deliver({
			from: "pij-watchdog",
			to: session.id,
			body,
		});
		const delivered = outcome.ok;
		if (!outcome.ok) {
			this.deps.log?.(`watchdog ${session.id}: ${outcome.code} ${outcome.message}`);
		}
		if (!delivered) return;

		state.ordinal = ordinal;
		state.lastFireAtMs = nowMs;
		state.lastPane = pane;
		state.awaitingResponse = true;
		state.answeredSinceLastFire = false;
		state.eventAttributionPending = true;
		state.paneAttributionPending = paneAvailable;
		state.transitionAttributionPending = true;
		state.eventAdvanced = false;
		state.eventAdvanceWasWatchdog = false;
		state.workingTransition = false;
		state.workingTransitionWasWatchdog = false;
		this.deps.onFire?.(session, nowMs);
	}

	/** Report `responsive` from DEMONSTRATED freshness, not only from an activity
	 *  edge. A peer whose newest event is younger than one watchdog interval is
	 *  alive by observation and must never keep a `stalled` label.
	 *
	 *  Why the edge alone is not enough: `reportRealRecovery` fires only when
	 *  `lastEventAt` CHANGES between reconciles, and a freshly built RuntimeState
	 *  seeds `lastEventAt` from the descriptor it was born with — so the edge is
	 *  consumed at birth. After any `disposeSession` (daemon restart, the global
	 *  disable→enable cycle, or a tick where the peer was briefly ineligible) a
	 *  live peer can therefore never report recovery again.
	 *
	 *  That turns durable on a creator-less peer: the daemon's OTHER stalled-flag
	 *  clear path (`pushWholeLifeTransition`) returns early when `spawnedBy` is
	 *  absent, while the watchdog detector happily SETS the flag on such a peer.
	 *  Set-without-clear leaves `failure: stalled` pinned on a peer that is
	 *  provably ticking — reported live: `failure: stalled` alongside a
	 *  `last-event` 2–3 minutes fresh.
	 *
	 *  Reported once per activity anchor, and never while a watchdog turn is
	 *  outstanding — with a fire in flight, the attribution machinery above owns
	 *  the verdict, and freshness there could be the watchdog's own injected turn
	 *  echoing back as fabricated recovery. */
	private reportSustainedLiveness(
		session: SessionDescriptor,
		state: RuntimeState,
		cfg: EffectiveWatchdogConfig,
		nowMs: number,
	): void {
		if (state.awaitingResponse) return;
		const anchorMs = state.activityAnchorAtMs;
		if (anchorMs === null || !Number.isFinite(anchorMs)) return;
		// Freshness must satisfy BOTH detectors' notion of "not stale", so the window
		// is the tighter of the two. STALE_AFTER_MS is what the descriptor-based
		// detector calls stalled; the watchdog interval (20 min by default) is far
		// looser, and using it alone would declare a peer alive that the other
		// detector had just correctly flagged 65s into its silence.
		const livenessWindowMs = Math.min(cfg.intervalMs, STALE_AFTER_MS);
		if (nowMs - anchorMs >= livenessWindowMs) return;
		if (state.livenessReportedForAnchorMs === anchorMs) return;
		state.livenessReportedForAnchorMs = anchorMs;
		this.deps.onResponse?.({ session, response: "responsive", consecutiveSilentFires: 0 });
	}

	private reportRealRecovery(session: SessionDescriptor, state: RuntimeState): void {
		state.consecutiveSilentFires = 0;
		state.awaitingResponse = false;
		state.eventAttributionPending = false;
		state.paneAttributionPending = false;
		state.transitionAttributionPending = false;
		state.watchdogTransitionReturnPending = false;
		state.anomalyWatcherStallsNotified.clear();
		this.deps.onResponse?.({ session, response: "responsive", consecutiveSilentFires: 0 });
	}

	private notifyWatchers(
		session: SessionDescriptor,
		state: RuntimeState,
		watchers: readonly WatchdogWatcher[],
		response: WatchdogResponse,
		paneEvidence: PaneEvidence,
		nowMs: number,
		anomaly: boolean,
	): void {
		for (const watcher of watchers) {
			const alwaysMode = watcher.capture?.mode === "always";
			const noticeAllowed =
				response !== "stalled" ||
				alwaysMode ||
				!state.anomalyWatcherStallsNotified.has(watcher.watcherId);
			if (!noticeAllowed) continue;
			const captureRequested = shouldCapture(watcher.capture ?? {}, anomaly);
			if (!anomaly && !captureRequested) continue;
			const lines = verdictNoticeLines(response, session.id);
			if (paneEvidence.kind === "paneless") {
				lines.push("capture unavailable (paneless target)");
			} else if (paneEvidence.kind === "unreadable") {
				// A 0-byte read is not content. It is never written as a capture and
				// never shown to a watcher as corroboration — the live pij#161 instance
				// was exactly this: an empty capture pointer beside a health verdict.
				lines.push("capture unavailable (pane could not be read)");
			} else if (captureRequested && this.deps.store.writeCapture) {
				const captured = captureSlice(paneEvidence.text, watcher.capture ?? {});
				const pointer = this.deps.store.writeCapture(
					watcher.watcherId,
					session.id,
					nowMs,
					captured,
				);
				lines.push(`capture: ${pointer}`);
				// TAIL, not head. `captured` is already tail-anchored (last maxLines
				// lines, then the last maxBytes of those), so slicing from the FRONT
				// handed the watcher the OLDEST five lines of the window — and made a
				// bigger window mean a STALER notice. At the default maxLines 40 the
				// notice showed lines 40..36 from the end while the newest output
				// reached the capture file only. Every existing test used maxLines <= 5,
				// where head and tail coincide, so nothing could see it.
				lines.push(...captured.split("\n").slice(-5));
			} else {
				lines.push("capture disabled by watcher policy");
			}
			const delivered = this.deps.channel.deliver({
				from: "pij-watchdog",
				to: watcher.watcherId,
				body: lines.join("\n"),
			});
			if (delivered.ok && response === "stalled" && !alwaysMode) {
				state.anomalyWatcherStallsNotified.add(watcher.watcherId);
			}
		}
	}

	private readSidecar(id: SessionId): WatchdogSidecar | undefined {
		const revision = this.deps.store.revision?.(id) ?? null;
		if (this.revisions.has(id) && this.revisions.get(id) === revision) return this.sidecars.get(id);
		const sidecar = this.deps.store.read(id);
		this.revisions.set(id, revision);
		this.sidecars.set(id, sidecar);
		return sidecar;
	}

	private writeSidecar(id: SessionId, sidecar: WatchdogSidecar): void {
		this.deps.store.write(id, sidecar);
		this.sidecars.set(id, sidecar);
		this.revisions.set(id, this.deps.store.revision?.(id) ?? null);
	}
}
