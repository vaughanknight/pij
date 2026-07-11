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
import { detectBadModelInPane, extractBoundModel } from "../harness/badmodel.js";
import { buildInitInjection, discoverNewTranscript } from "../harness/claude.js";
import { type TranscriptListing, transcriptLayout } from "../harness/transcript.js";
import { classifyInterstitial } from "../interstitial.js";
import type { DeliveryPort, RegistryPort, SendOutcome } from "../ports.js";
import { classifyReadiness, type ReadinessState } from "../readiness.js";
import { classifyDeathReason } from "../state.js";
import type {
	DeathReason,
	HarnessKind,
	PijMessage,
	SessionDescriptor,
	SessionId,
} from "../types.js";
import { injectionText, route, type SendBuffer } from "./router.js";

/** The impure seam the daemon loop drives — fakes in tests, real adapters in
 *  the bin. Keystrokes are argv-level (`tmux-keys.ts`); the rest is fs/clock. */
export interface DaemonPorts {
	/** Visible text of a pane (capture-pane -p -J). */
	capturePane(paneId: string): string;
	/** Is the pane dead/exited (tmux `#{pane_dead}`)? */
	isPaneDead(paneId: string): boolean;
	/** Type literal text into a pane and press Enter (a submitted line). `harness`
	 *  selects the per-harness Enter-settle (Copilot's composer needs longer than
	 *  Claude's, else the Return is swallowed and the text strands in the input box).
	 *  `pid` is the pane's app process — used to wake a backgrounded copilot before
	 *  typing (focus-IN injection + a secondary SIGWINCH) so its Enter submits instead
	 *  of stranding the message in the composer. Both optional — absent falls back to
	 *  the Claude default settle and no wake. */
	sendText(paneId: string, text: string, harness?: HarnessKind, pid?: number): SendOutcome;
	/** Press a bare key (e.g. Escape to dismiss an interstitial). */
	sendKey(paneId: string, key: "Escape" | "Enter"): void;
	/** Kill a pane (tmux `kill-pane`). Idempotent — a gone pane is a no-op. Used by
	 *  the `--once` agent-peer auto-close (Plan 029 T008). */
	killPane(paneId: string): void;
	/** List `*.jsonl` transcript paths currently in a directory (FLAT — claude). */
	listTranscripts(dir: string): string[];
	/** List rollout `*.jsonl` paths RECURSIVELY under a dir (codex's date-nested
	 *  global tree, Plan 022). Optional — only codex discovery uses it; absent ⇒
	 *  the discovery path falls back to the flat `listTranscripts`. */
	listTranscriptsDeep?(dir: string): string[];
	/** Read a codex rollout's `session_meta.cwd` (Plan 022) for the cwd-confirm
	 *  tiebreak on the global sessions dir (R-2). Optional — only codex uses it;
	 *  absent ⇒ no cwd-confirm (raw new-path discovery). `null` if unreadable. */
	readTranscriptCwd?(path: string): string | null;
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
	/** Set true the first time the pane goes `busy` after init injection —
	 *  the first-inference gate uses this to know the agent has started
	 *  processing and the pane may now show a model error (T009/T010). */
	firstInferenceSeen?: boolean;
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

/** Descriptor fields the daemon NEVER owns: they are stamped out-of-band by a
 *  DIFFERENT process. `reportedAt` is written by `pij agent report` running in
 *  the peer's own pane (`executeAgentReport`). Every daemon write derives from
 *  the tick-start index snapshot, so a naïve `registry.write` clobbers a stamp
 *  landed mid-tick — the lost-update that kept `--once` peers open forever
 *  (rev-0004 Finding 1 / AC-16). Extend this list if another out-of-band writer
 *  is ever added; the daemon owns everything else (state/lastEventAt/
 *  failureReason/boundModel/harnessSessionId/lifecycle/initInjectedAt/…). */
const EXTERNALLY_OWNED_FIELDS = ["reportedAt"] as const;

/** Persist a daemon-computed descriptor WITHOUT clobbering a field a concurrent
 *  writer stamped after this tick's index snapshot was taken. Re-reads the latest
 *  on-disk descriptor and carries forward any {@link EXTERNALLY_OWNED_FIELDS} the
 *  daemon-computed value lacks (the daemon never writes them itself, so "lacks"
 *  is always the case). Re-reads after the write and returns registry truth, which
 *  may be a concurrent dissolved tombstone when the registry rejects this stale
 *  daemon write. Use this for EVERY daemon descriptor write — it is a no-op when
 *  nothing external is present, so it is safe (and behavior-preserving) even on
 *  the pending-only bind path. */
export function writeMerged(
	registry: RegistryPort,
	computed: SessionDescriptor,
): SessionDescriptor {
	const latest = registry.read(computed.id);
	let merged = computed;
	if (latest) {
		for (const field of EXTERNALLY_OWNED_FIELDS) {
			if (merged[field] === undefined && latest[field] !== undefined) {
				merged = { ...merged, [field]: latest[field] };
			}
		}
	}
	registry.write(merged);
	const persisted = registry.read(merged.id);
	if (!persisted) throw new Error(`daemon write for ${merged.id} did not persist`);
	return persisted;
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
		const pane0 = ports.capturePane(paneId);
		const dr = classifyDeathReason(pane0);
		return fail(descriptor, drive, registry, delivery, "pane exited before binding", dr);
	}

	// The `before` set for new-path discovery (AC-03). The transcript LAYOUT is
	// harness-selected (Plan 022, Finding 03): claude = cwd-scoped dir + FLAT
	// listing + stem id (byte-unchanged); codex = global date-tree + DEEP listing
	// + trailing-UUID id. `deep`/cwd-confirm fall back gracefully if a port is
	// absent (e.g. a test fake or adopt). Prefer the spawn-time snapshot persisted
	// on the descriptor (captured before the pane existed, so a pre-existing active
	// transcript is in `before` and never chosen — review H1); only fall back to a
	// live snapshot for sessions spawned without it. phone-home is the backstop.
	const harness = descriptor.harness ?? "claude";
	const layout = transcriptLayout(harness);
	const dir = layout.dir(ports.home(), descriptor.folder);
	const listing: TranscriptListing = {
		flat: (d) => ports.listTranscripts(d),
		deep: (d) => ports.listTranscriptsDeep?.(d) ?? ports.listTranscripts(d),
	};
	if (drive.before === undefined) {
		drive.before = descriptor.transcriptsAtSpawn ?? layout.list(listing, dir);
	}

	const pane = ports.capturePane(paneId);
	const readiness = classifyReadiness(pane);

	if (readiness === "dead") {
		const dr = classifyDeathReason(pane);
		return fail(descriptor, drive, registry, delivery, "pane reported dead", dr);
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
		const init = buildInitInjection(
			descriptor.id,
			descriptor.branchedFrom != null,
			descriptor.spawnedBy,
		);
		ports.sendText(paneId, init.body, harness, descriptor.pid);
		const at = new Date(ports.now()).toISOString();
		writeMerged(registry, markInitInjected(descriptor, at));
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

	// Track the first inference: once init is injected, the next `busy` tick is
	// the agent processing the init (first inference). Mark it so the gate below
	// knows a round trip has completed.
	if (descriptor.initInjectedAt && readiness === "busy" && !drive.firstInferenceSeen) {
		drive.firstInferenceSeen = true;
	}

	// 2) Binding. The deterministic case: a session whose id pij CHOSE at spawn —
	// copilot (`--session-id <uuid>`) OR a branched claude (`--resume <src>
	// --fork-session --session-id <new>`, Plan 020). Either way the daemon binds to
	// the planned id the instant the pane is interactive — no transcript discovery,
	// no race, and no wait on a (possibly slow) context load (Finding 06). Keyed on
	// the planned id, not the harness, so claude-branch rides the same path.
	//
	// First-inference gate (T009/T010): if the pane shows a bad-model error after
	// the init-inject turn, fail with reason "model-not-supported" instead of
	// binding. Good models bind immediately — the gate never delays a valid spawn.
	if (descriptor.plannedHarnessSessionId) {
		const harness = descriptor.harness ?? "claude";
		// Bad-model check runs BEFORE the first-inference gate so a 400 error visible
		// on the very first ready tick is caught immediately (the error signal does not
		// require a busy→ready round-trip — the harness rejects the model synchronously).
		const badModel = detectBadModelInPane(harness, pane);
		if (badModel.detected) {
			return fail(
				descriptor,
				drive,
				registry,
				delivery,
				`bad model in pane: ${badModel.reason ?? "model-not-supported"}`,
				badModel.reason ?? "model-not-supported",
			);
		}
		// First-inference gate (FIX-1): do NOT bind until the init-inject turn has
		// completed a round-trip (pane went busy at least once after init injection).
		// A good model still binds on the next ready tick — exactly one extra tick.
		// Removing this gate lets the daemon bind on the very first ready tick before
		// any model error has had a chance to surface → false-healthy bind.
		if (!drive.firstInferenceSeen) return { kind: "waiting" };
		const model = extractBoundModel(harness, pane);
		const bound = {
			...applyBinding(descriptor, descriptor.plannedHarnessSessionId),
			...(model ? { boundModel: model } : {}),
		};
		writeMerged(registry, bound);
		if (!drive.settled && descriptor.spawnedBy) {
			drive.settled = true;
			const note = buildBoundNotice(bound);
			if (note) notify(delivery, descriptor.id, note.to, note.text);
		}
		return { kind: "bound", harnessSessionId: descriptor.plannedHarnessSessionId };
	}

	// Claude/codex: the session id is auto-generated, so discover it by NEW path
	// appearance — a transcript that did not exist at spawn (AC-03). The layout
	// picks the listing (flat vs deep) and the id extraction (stem vs trailing UUID).
	let after = layout.list(listing, dir);
	// Codex's sessions dir is GLOBAL (every cwd's rollouts land here), so a
	// concurrent codex in ANOTHER cwd surfaces as a spurious "new" path. Confirm
	// each FRESH candidate's cwd via its session_meta before considering it; paths
	// already in the before-set are kept untouched, so only genuinely-new files pay
	// the read, and an unreadable head (mid-write) defers to a later tick (R-2).
	if (harness === "codex" && ports.readTranscriptCwd) {
		const confirmCwd = ports.readTranscriptCwd;
		const beforeSet = new Set(drive.before);
		after = after.filter((p) => beforeSet.has(p) || confirmCwd(p) === descriptor.folder);
	}
	const discovery = discoverNewTranscript(drive.before, after);
	if (discovery.status === "found") {
		// The bind id is layout-derived: codex's trailing UUID, NOT discovery's
		// claude-stem default (Finding 06). Codex also persists the absolute rollout
		// path — its date-nested path can't be rebuilt from the bare UUID for tail.
		const harnessSessionId = layout.sessionIdOf(discovery.path);
		const bound = {
			...applyBinding(descriptor, harnessSessionId),
			...(harness === "codex" ? { transcriptPath: discovery.path } : {}),
		};
		writeMerged(registry, bound);
		if (!drive.settled && descriptor.spawnedBy) {
			drive.settled = true;
			const note = buildBoundNotice(bound);
			if (note) notify(delivery, descriptor.id, note.to, note.text);
		}
		return { kind: "bound", harnessSessionId };
	}
	if (discovery.status === "ambiguous") {
		// Concurrent boots discovery can't pick deterministically; surface it
		// (review M4) and let phone-home + the watchdog resolve it.
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
		ports.sendText(
			paneId,
			buildInitInjection(descriptor.id).phonehomeLine,
			harness,
			descriptor.pid,
		);
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
	deathReason?: DeathReason,
): DriveOutcome {
	const failed = {
		...markFailed(descriptor),
		...(deathReason ? { failureReason: deathReason } : {}),
	};
	writeMerged(registry, failed);
	if (!drive.settled && descriptor.spawnedBy) {
		drive.settled = true;
		const note = buildFailedNotice(failed, reason);
		if (note) notify(delivery, descriptor.id, note.to, note.text);
	}
	return { kind: "failed", reason };
}

/** Default watchdog window (ms) per stage. The bin may override at the call site
 *  via a wrapped port set; kept here as the documented default. */
export const WATCHDOG_TIMEOUT_MS = 20_000;

export interface DrainedTmuxMessage {
	readonly messageId: string;
	readonly from: SessionId;
	readonly outcome?: SendOutcome;
}

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
): DrainedTmuxMessage[] {
	const consumed: DrainedTmuxMessage[] = [];
	for (const m of messages) {
		// Preserve the REAL sender so the injected text is framed `[pij from <from>]`
		// and the receiving agent knows who messaged it (parity with the pi receiver).
		const msg: PijMessage = { from: m.from, to: target.id, body: m.body, command: m.command };
		const decision = route(target, msg);
		if (decision.kind === "inject") {
			const outcome = ports.sendText(decision.paneId, decision.text, target.harness, target.pid);
			consumed.push({ messageId: m.messageId, from: m.from, outcome });
		} else if (decision.kind === "buffer") {
			buffer.enqueue(m.messageId, msg);
			consumed.push({ messageId: m.messageId, from: m.from }); // final receipt emits on flush
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
