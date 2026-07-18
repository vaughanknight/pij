import type { DeliveryPort } from "../ports.js";
import type { SessionDescriptor, SessionId, WatchdogSidecar, WatchdogWatcher } from "../types.js";
import {
	applyWorkingTransition,
	buildWatchdogTurn,
	captureSlice,
	effectiveWatchdog,
	evaluateResponse,
	isFireDue,
	shouldCapture,
	type WatchdogResponse,
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
	readonly sendText: (session: SessionDescriptor, body: string) => void;
	readonly onFire?: (session: SessionDescriptor, atMs: number) => void;
	readonly onResponse?: (event: WatchdogResponseEvent) => void;
	readonly log?: (line: string) => void;
}

interface RuntimeState {
	ordinal: number;
	consecutiveSilentFires: number;
	lastFireAtMs: number | null;
	activityAnchorAtMs: number | null;
	lastEventAt: string | undefined;
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
}

function timestampMs(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function eligible(session: SessionDescriptor): boolean {
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

	/** Persist the tmux compact pause before the router injects `/compact`. */
	beforeTmuxInject(id: SessionId, message: { readonly command?: string }, nowMs: number): void {
		const current = this.readSidecar(id);
		const next = pauseForCompactMessage(message, current, nowMs);
		if (next !== current && next !== undefined) this.writeSidecar(id, next);
	}

	private reconcileSession(session: SessionDescriptor, reanchorNowMs?: number): void {
		const nowMs = this.deps.now();
		let sidecar = this.readSidecar(session.id);
		let state = this.states.get(session.id);
		if (!state) {
			state = {
				ordinal: 0,
				consecutiveSilentFires: 0,
				// On a global re-enable, anchor to now so the disabled window does
				// not count as silence (else a long-disabled peer fires instantly).
				lastFireAtMs: reanchorNowMs ?? timestampMs(session.lastWatchdogFireAt),
				// A session that has never emitted an event still needs watching —
				// it is the likeliest to be hung at boot. startedAt is its birth
				// anchor; without this fallback both anchors are null and
				// `isFireDue` never fires (found live, activation day).
				activityAnchorAtMs:
					reanchorNowMs ?? timestampMs(session.lastEventAt) ?? timestampMs(session.startedAt),
				lastEventAt: session.lastEventAt,
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
		if (!isFireDue(cfg, state.lastFireAtMs, state.activityAnchorAtMs, nowMs)) return;

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
		let delivered = true;
		if ((session.harness ?? "pi") === "pi" || session.deliveryMode === "pull") {
			const outcome = this.deps.channel.deliver({
				from: "pij-watchdog",
				to: session.id,
				body,
			});
			delivered = outcome.ok;
			if (!outcome.ok)
				this.deps.log?.(`watchdog ${session.id}: ${outcome.code} ${outcome.message}`);
		} else {
			this.deps.sendText(session, body);
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
