import { projectOrchestrationRole } from "../orchestration/role.js";
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
	isFireDue,
	reconcileWatchdogExemption,
	shouldCapture,
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
	readonly response: WatchdogResponse;
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

function timestampMs(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function eligible(session: SessionDescriptor): boolean {
	// PRIMES ARE WATCHED TOO (Jordan's ruling, 2026-07-30). The original gate was
	// `!== "pm"`, which silently excluded every prime — a prime projects to
	// "prime", never "pm". So the fleet's five governing seats were the only ones
	// no reporting clock ever touched, in the direction nobody checks: the whole
	// point of a prime is that it watches others.
	//
	// Measured cost of that gap: a prime went 12 days and 3 hours without ever
	// writing a card, and learned of it from a peer running an unrelated query.
	// Its own status-stale anomaly could not reach it either (a prime has no
	// parent, so the sweep drops it), which left it with NO reporting prompt of
	// any kind. This one line is the whole fix for that seat: the nudge copy,
	// interval, and anchor are already role-agnostic.
	const role = projectOrchestrationRole(session);
	if (role !== "pm" && role !== "prime") return false;
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

	disposeSession(id: SessionId): void {
		this.states.delete(id);
		this.revisions.delete(id);
		this.sidecars.delete(id);
	}

	disposeAll(): void {
		this.states.clear();
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
		const descriptorFire = timestampMs(session.lastWatchdogFireAt);
		if (
			descriptorFire !== null &&
			(state.lastFireAtMs === null || descriptorFire > state.lastFireAtMs)
		) {
			state.lastFireAtMs = descriptorFire;
		}
		this.reportSustainedLiveness(session, state, cfg, nowMs);

		if (!isFireDue(cfg, state.lastFireAtMs, state.scheduleAnchorAtMs, nowMs)) return;
		if (this.deps.hasPendingWatchdog(session.id)) {
			state.lastFireAtMs = nowMs;
			this.deps.log?.(`watchdog ${session.id}: pending ping exists — coalesced`);
			return;
		}

		const paneAvailable = session.paneId !== undefined;
		const pane = paneAvailable ? this.deps.capturePane(session) : undefined;
		const paneChanged =
			pane !== undefined && state.lastPane !== undefined && pane !== state.lastPane;
		const paneChangeWasWatchdog =
			paneChanged && state.awaitingResponse && state.paneAttributionPending;
		if (paneChanged && !paneChangeWasWatchdog) this.reportRealRecovery(session, state);

		let response: WatchdogResponse = "responsive";
		if (state.awaitingResponse) {
			const nextSilent = state.consecutiveSilentFires + 1;
			response = evaluateResponse({
				cfg,
				consecutiveSilentFires: nextSilent,
				eventAdvanced: state.eventAdvanced,
				eventAdvanceWasWatchdog: state.eventAdvanceWasWatchdog,
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
			});
			state.consecutiveSilentFires = response === "responsive" ? 0 : nextSilent;
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
			pane,
			nowMs,
			response !== "responsive",
		);

		const ordinal = state.ordinal + 1;
		const body = buildWatchdogTurn(session.id, ordinal, { ...cfg, paneAvailable });
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
		pane: string | undefined,
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
			const lines = [`watchdog ${response}: ${session.id}`];
			if (pane === undefined) {
				lines.push("capture unavailable (paneless target)");
			} else if (captureRequested && this.deps.store.writeCapture) {
				const captured = captureSlice(pane, watcher.capture ?? {});
				const pointer = this.deps.store.writeCapture(
					watcher.watcherId,
					session.id,
					nowMs,
					captured,
				);
				lines.push(`capture: ${pointer}`);
				lines.push(...captured.split("\n").slice(0, 5));
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
