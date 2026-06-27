// pij-control-plane — the daemon's per-tick orchestration (Plan 019, T016).
//
// This is the spawn→bind state machine, wired to INJECTED ports so it is unit-
// testable with fakes (the bin `daemon.ts` supplies real tmux/fs/clock). It
// composes the already-TDD'd pure pieces — classifyReadiness, classifyInterstitial,
// buildInitInjection, discoverNewTranscript, applyBinding/markInitInjected/
// markFailed, evaluateWatchdog, build{Bound,Failed}Notice — into the loop the
// daemon runs once per pending/booting session each tick.
//
// Delivery ownership (AC-08) lives in the inbox drainer (`drainTmuxInbox`): the
// daemon injects only tmux targets and never touches pi inboxes.

import {
	applyBinding,
	buildBoundNotice,
	buildFailedNotice,
	evaluateWatchdog,
	markFailed,
	markInitInjected,
	shouldInjectInit,
} from "../binding.js";
import { buildInitInjection, discoverNewTranscript, transcriptDir } from "../harness/claude.js";
import { classifyInterstitial } from "../interstitial.js";
import type { DeliveryPort, RegistryPort } from "../ports.js";
import { classifyReadiness, type ReadinessState } from "../readiness.js";
import type { PijMessage, SessionDescriptor, SessionId } from "../types.js";
import { injectionText, route, type SendBuffer } from "./router.js";

/** The impure seam the daemon loop drives — fakes in tests, real adapters in
 *  the bin. Keystrokes are argv-level (`tmux-keys.ts`); the rest is fs/clock. */
export interface DaemonPorts {
	/** Visible text of a pane (capture-pane -p -J). */
	capturePane(paneId: string): string;
	/** Is the pane dead/exited (tmux `#{pane_dead}`)? */
	isPaneDead(paneId: string): boolean;
	/** Type literal text into a pane and press Enter (a submitted line). */
	sendText(paneId: string, text: string): void;
	/** Press a bare key (e.g. Escape to dismiss an interstitial). */
	sendKey(paneId: string, key: "Escape" | "Enter"): void;
	/** List `*.jsonl` transcript paths currently in a directory. */
	listTranscripts(dir: string): string[];
	/** Home dir (for the transcript path). */
	home(): string;
	/** Monotonic-ish now (ms). */
	now(): number;
	/** Liveness probe for a pid. */
	isAlive(pid: number): boolean;
}

/** Per-session, in-memory drive state the daemon threads across ticks. */
export interface DriveState {
	/** Transcript paths present when the daemon first observed this session —
	 *  the `before` set for new-path discovery (AC-03). */
	before?: readonly string[];
	/** ms the pane first read `ready` (watchdog anchor). */
	readyAtMs?: number;
	/** ms the watchdog re-sent the phonehome confirm line. */
	resentAtMs?: number;
	/** A needs-human interstitial was already surfaced (don't spam). */
	flaggedHuman?: boolean;
	/** A terminal notice (bound/failed) was already delivered. */
	settled?: boolean;
}

/** What one drive tick did, for the TUI / smoke assertions. */
export type DriveOutcome =
	| { readonly kind: "boot" } // still booting — nothing to do
	| { readonly kind: "dismissed"; readonly label: string }
	| { readonly kind: "needs-human"; readonly label: string }
	| { readonly kind: "injected-init" }
	| { readonly kind: "bound"; readonly harnessSessionId: string }
	| { readonly kind: "ambiguous"; readonly count: number }
	| { readonly kind: "resent-phonehome" }
	| { readonly kind: "failed"; readonly reason: string }
	| { readonly kind: "waiting" };

function notify(delivery: DeliveryPort, from: SessionId, to: SessionId, text: string): void {
	delivery.deliver({ from, to, body: text });
}

/** Drive ONE pending/booting session one tick. Mutates `drive` (in-memory) and
 *  persists descriptor changes through `registry`; returns what it did. */
/** While `busy`, refresh the activity ts at most this often (keeps liveness
 *  `active` against STALE_AFTER_MS=60s without a registry write every 600ms tick). */
const ACTIVITY_REFRESH_MS = 10_000;

/** Persist a bound control-plane peer's footer activity onto its descriptor so
 *  `pij state`/`list` report real working|idle|done instead of a frozen
 *  `idle · never` (control-plane feedback round 3 — these peers write no pij
 *  events, so state/lastEventAt never moved). `busy` → working + a freshened
 *  lastEventAt (so the EXISTING liveness stops reading 'stale' mid-turn); `ready`
 *  → idle, preserving the last-activity ts (so an idle-after-working peer reads
 *  `done`, not `idle`). Returns the updated descriptor iff something changed, so
 *  the daemon writes only on a transition or a throttled working refresh — never
 *  every tick. Other readiness (booting/interstitial/dead) → no-op (driveSession
 *  owns those). Pure: `nowMs` in, ISO out. */
export function observeActivity(
	descriptor: SessionDescriptor,
	readiness: ReadinessState,
	nowMs: number,
): SessionDescriptor | null {
	if (readiness !== "busy" && readiness !== "ready") return null;
	const state: "working" | "idle" = readiness === "busy" ? "working" : "idle";
	let lastEventAt = descriptor.lastEventAt;
	if (readiness === "busy") {
		const ageMs = lastEventAt ? nowMs - Date.parse(lastEventAt) : Number.POSITIVE_INFINITY;
		if (ageMs >= ACTIVITY_REFRESH_MS) lastEventAt = new Date(nowMs).toISOString();
	}
	if (descriptor.state === state && descriptor.lastEventAt === lastEventAt) return null;
	return { ...descriptor, state, lastEventAt };
}

export function driveSession(
	descriptor: SessionDescriptor,
	drive: DriveState,
	ports: DaemonPorts,
	registry: RegistryPort,
	delivery: DeliveryPort,
): DriveOutcome {
	const paneId = descriptor.paneId;
	if (!paneId) return { kind: "waiting" }; // no pane yet (pre-split)

	// Dead pane → terminal failure (authoritative death signal).
	if (ports.isPaneDead(paneId)) {
		return fail(descriptor, drive, registry, delivery, "pane exited before binding");
	}

	// The `before` set for new-path discovery (AC-03). Prefer the spawn-time
	// snapshot persisted on the descriptor (captured before the pane existed, so
	// a pre-existing active transcript is in `before` and never chosen — review
	// H1); only fall back to a live snapshot for sessions spawned without it
	// (e.g. adopt). phone-home remains the confirmatory backstop.
	const dir = transcriptDir(ports.home(), descriptor.folder);
	if (drive.before === undefined) {
		drive.before = descriptor.transcriptsAtSpawn ?? ports.listTranscripts(dir);
	}

	const pane = ports.capturePane(paneId);
	const readiness = classifyReadiness(pane);

	if (readiness === "dead") {
		return fail(descriptor, drive, registry, delivery, "pane reported dead");
	}
	if (readiness === "interstitial") {
		const verdict = classifyInterstitial(pane);
		if (verdict.action === "dismiss") {
			ports.sendKey(paneId, "Escape");
			return { kind: "dismissed", label: verdict.label ?? "interstitial" };
		}
		if (verdict.action === "needs-human") {
			if (!drive.flaggedHuman && descriptor.spawnedBy) {
				drive.flaggedHuman = true;
				notify(
					delivery,
					descriptor.id,
					descriptor.spawnedBy,
					`🙋 ${descriptor.id} needs a human: ${verdict.label ?? "interstitial"} (pane ${paneId}).`,
				);
			}
			return { kind: "needs-human", label: verdict.label ?? "interstitial" };
		}
		return { kind: "waiting" };
	}
	if (readiness === "booting") return { kind: "boot" };

	// readiness is `ready` or `busy` — the pane exists and is interactive.
	// 1) Inject the init exactly once (only when truly ready, not mid-turn busy).
	if (readiness === "ready" && shouldInjectInit(descriptor)) {
		const init = buildInitInjection(descriptor.id);
		ports.sendText(paneId, init.body);
		const at = new Date(ports.now()).toISOString();
		registry.write(markInitInjected(descriptor, at));
		drive.readyAtMs = ports.now();
		return { kind: "injected-init" };
	}
	// Anchor the watchdog clock only once init is actually in (review M3): a pane
	// that reads `busy` BEFORE init would otherwise start the timer with the agent
	// never told its pij-id — the watchdog would then re-send a bare phonehome and
	// ultimately fail a spawn that simply hadn't been initialised yet.
	if (descriptor.initInjectedAt && drive.readyAtMs === undefined) {
		drive.readyAtMs = ports.now();
	}
	if (drive.readyAtMs === undefined) return { kind: "waiting" };

	// 2) Binding. Copilot is the easy case: `copilot --session-id <uuid>` SET the
	// session id at spawn, so the daemon binds deterministically to the planned id
	// the instant the pane is interactive — no transcript discovery, no race.
	if (descriptor.harness === "copilot" && descriptor.plannedHarnessSessionId) {
		const bound = applyBinding(descriptor, descriptor.plannedHarnessSessionId);
		registry.write(bound);
		if (!drive.settled && descriptor.spawnedBy) {
			drive.settled = true;
			const note = buildBoundNotice(bound);
			if (note) notify(delivery, descriptor.id, note.to, note.text);
		}
		return { kind: "bound", harnessSessionId: descriptor.plannedHarnessSessionId };
	}

	// Claude: the session id is auto-generated, so discover it by NEW path
	// appearance — a transcript path that did not exist at spawn (AC-03).
	const discovery = discoverNewTranscript(drive.before, ports.listTranscripts(dir));
	if (discovery.status === "found") {
		const bound = applyBinding(descriptor, discovery.sessionId);
		registry.write(bound);
		if (!drive.settled && descriptor.spawnedBy) {
			drive.settled = true;
			const note = buildBoundNotice(bound);
			if (note) notify(delivery, descriptor.id, note.to, note.text);
		}
		return { kind: "bound", harnessSessionId: discovery.sessionId };
	}
	if (discovery.status === "ambiguous") {
		// Concurrent boots in the same cwd — discovery can't pick deterministically;
		// surface it (review M4) and let phone-home + the watchdog resolve it.
		return { kind: "ambiguous", count: discovery.paths.length };
	}

	// 3) Watchdog: re-send the confirm line once, then fail (AC-04).
	const decision = evaluateWatchdog({
		bound: false,
		readyAtMs: drive.readyAtMs,
		resentAtMs: drive.resentAtMs,
		nowMs: ports.now(),
		timeoutMs: WATCHDOG_TIMEOUT_MS,
	});
	if (decision.kind === "resend-phonehome") {
		ports.sendText(paneId, buildInitInjection(descriptor.id).phonehomeLine);
		drive.resentAtMs = ports.now();
		return { kind: "resent-phonehome" };
	}
	if (decision.kind === "fail") {
		return fail(descriptor, drive, registry, delivery, decision.reason);
	}
	return { kind: "waiting" };
}

function fail(
	descriptor: SessionDescriptor,
	drive: DriveState,
	registry: RegistryPort,
	delivery: DeliveryPort,
	reason: string,
): DriveOutcome {
	registry.write(markFailed(descriptor));
	if (!drive.settled && descriptor.spawnedBy) {
		drive.settled = true;
		const note = buildFailedNotice(descriptor, reason);
		if (note) notify(delivery, descriptor.id, note.to, note.text);
	}
	return { kind: "failed", reason };
}

/** Default watchdog window (ms) per stage. The bin may override at the call site
 *  via a wrapped port set; kept here as the documented default. */
export const WATCHDOG_TIMEOUT_MS = 20_000;

/** Drain one bound tmux target's inbox: inject each message and return the
 *  messageIds consumed (the bin unlinks them). Delivery ownership (AC-08): the
 *  daemon ONLY drains tmux targets — pi targets route to `observe` and are left
 *  for the in-process receiver. A not-yet-bound tmux target buffers (R-02). */
export function drainTmuxInbox(
	target: SessionDescriptor,
	messages: ReadonlyArray<{
		readonly messageId: string;
		readonly from: SessionId;
		readonly body: string;
		readonly command?: string;
	}>,
	ports: DaemonPorts,
	buffer: SendBuffer,
): string[] {
	const consumed: string[] = [];
	for (const m of messages) {
		// Preserve the REAL sender so the injected text is framed `[pij from <from>]`
		// and the receiving agent knows who messaged it (parity with the pi receiver).
		const msg: PijMessage = { from: m.from, to: target.id, body: m.body, command: m.command };
		const decision = route(target, msg);
		if (decision.kind === "inject") {
			ports.sendText(decision.paneId, decision.text);
			consumed.push(m.messageId);
		} else if (decision.kind === "buffer") {
			buffer.enqueue(msg);
			consumed.push(m.messageId); // moved into the in-memory buffer; file can go
		}
		// `observe` (pi target) — never reached here; the bin doesn't drain pi inboxes.
	}
	return consumed;
}

/** Render the injection text for a buffered message flushed on bind (the bin
 *  calls this after `SendBuffer.flush`) — preserves the sender's framing. */
export function flushedText(message: PijMessage): string {
	return injectionText(message);
}
