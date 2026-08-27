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
import type { ProcessSnapshot } from "../platform/types.js";
import type { DeliveryPort, RegistryPort, SendOutcome } from "../ports.js";
import { persistDaemonWrite } from "../registry-write.js";

export { persistDaemonWrite } from "../registry-write.js";

import { classifyReadiness, type ReadinessState } from "../readiness.js";
import { classifyDeathReason } from "../state.js";
import type {
	DeathReason,
	DeliveredMessage,
	HarnessKind,
	PijMessage,
	SessionDescriptor,
	SessionId,
} from "../types.js";
import {
	type ComposerHoldTracker,
	isBlankComposer,
	type PaneListing,
	renderedComposerPayload,
} from "./pane-signals.js";
import { injectionText, route, type SendBuffer } from "./router.js";

/** The impure seam the daemon loop drives — fakes in tests, real adapters in
 *  the bin. Keystrokes are argv-level (`tmux-keys.ts`); the rest is fs/clock. */
export interface DaemonPorts {
	/** Visible text of a pane (capture-pane -p -J). */
	capturePane(paneId: string): string;
	/** Is the pane dead/exited (tmux `#{pane_dead}`)? */
	isPaneDead(paneId: string): boolean;
	/** All panes in the tmux server. Optional so pure loop fakes and non-tmux
	 * callers remain unchanged; the real daemon adapter supplies the full set. */
	listPanes?(): readonly PaneListing[];
	/** Attach, drain, and detach the one output tap used by pane signal parsing. */
	attachPaneTap?(paneId: string, sinkPath: string): void;
	drainPaneTap?(paneId: string): Uint8Array;
	detachPaneTap?(paneId: string): void;
	/** Type literal text into a pane and press Enter (a submitted line). `harness`
	 *  selects the per-harness Enter-settle (Copilot's composer needs longer than
	 *  Claude's, else the Return is swallowed and the text strands in the input box).
	 *  `pid` is the pane's app process — used to wake a backgrounded copilot before
	 *  typing (focus-IN injection + a secondary SIGWINCH) so its Enter submits instead
	 *  of stranding the message in the composer. Both optional — absent falls back to
	 *  the Claude default settle and no wake. */
	sendText(paneId: string, text: string, harness?: HarnessKind, pid?: number): SendOutcome;
	/** PoC (poc/comms-sqlite-socket): deliver a message to a Claude Code seat over
	 *  its inbox socket instead of typing into its pane. `no-socket` = the seat has
	 *  no resolvable socket (older claude, bind failure, non-claude harness) — the
	 *  caller falls back to `sendText`. `failed` = nothing landed (retry later).
	 *  Optional: pure fakes and non-claude daemons need not implement it. */
	sendSocket?(target: SessionDescriptor, message: DeliveredMessage): SendOutcome | "no-socket";
	/** Press a bare key (e.g. Escape to dismiss an interstitial, or a digit +
	 *  Enter to answer one — the copilot folder-trust auto-answer, DL-001). */
	sendKey(paneId: string, key: "Escape" | "Enter" | "1" | "2"): void;
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
	/** ONE whole-table process capture, for ONE death sweep (plan 095).
	 *
	 *  OPTIONAL BY DESIGN, in two directions. Structurally: a mandatory method
	 *  would be source-breaking for every existing implementer of this interface,
	 *  and the pure loop fakes have no process table to offer. Semantically: an
	 *  absent capability yields `unknown`, never `absent` — a probe that cannot
	 *  run has observed nothing, and this whole plan exists because a missing
	 *  observation was being read as an observation of absence.
	 *
	 *  Returns a VALUE, not a per-pid query, on purpose: the death sweep runs on
	 *  the ~600ms tick over ~500 descriptors, so a per-descriptor `ps` is ~500
	 *  process-table spawns per tick — enough to stall the tick and therefore
	 *  message delivery. */
	processSnapshot?(): ProcessSnapshot;
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
	/** One-shot answer latches keyed by interstitial label. Distinct prompts may
	 * legitimately occur in sequence (folder trust, then session resume). */
	answeredInterstitials?: Set<string>;
	/** A terminal notice (bound/failed) was already delivered. */
	settled?: boolean;
	/** ms the FIRST boot injection was refused because the pane had live human
	 * input. Anchors the bounded held-boot timeout so a held seat fails loudly
	 * instead of sitting pending forever. Cleared the moment a boot line lands. */
	initHeldSinceMs?: number;
	/** One-shot: the held-boot condition was already logged for this session. */
	heldBootLogged?: boolean;
	/** Set true the first time the pane goes `busy` after init injection —
	 *  the first-inference gate uses this to know the agent has started
	 *  processing and the pane may now show a model error (T009/T010). */
	firstInferenceSeen?: boolean;
}

/** What one drive tick did, for the TUI / smoke assertions. */
export type DriveOutcome =
	| { readonly kind: "boot" } // still booting — nothing to do
	| { readonly kind: "dismissed"; readonly label: string }
	| { readonly kind: "answered"; readonly label: string }
	| { readonly kind: "needs-human"; readonly label: string }
	| { readonly kind: "injected-init" }
	| { readonly kind: "bound"; readonly harnessSessionId: string }
	| { readonly kind: "ambiguous"; readonly count: number }
	| { readonly kind: "resent-phonehome" }
	| { readonly kind: "held-by-pane-input"; readonly heldForMs: number; readonly first: boolean }
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

/** One-shot windowId backfill for a legacy live node (plan 054 P2 T006,
 *  AC-09): a pane-bearing descriptor that predates windowId capture gains it
 *  from a live tmux resolve, persisted through persistDaemonWrite so concurrent
 *  writers survive. Self-latching — a node that already has one is never
 *  probed again. Returns the persisted descriptor, or null when nothing was
 *  (or could be) done. */
export function backfillWindowId(
	descriptor: SessionDescriptor,
	registry: RegistryPort,
	resolveWindowId: (paneId: string) => string | null,
): SessionDescriptor | null {
	if (descriptor.windowId !== undefined || descriptor.paneId === undefined) return null;
	const windowId = resolveWindowId(descriptor.paneId);
	if (windowId === null || !/^@\d+$/.test(windowId)) return null;
	// `windowId` is cli-owned (spawn/adopt stamp it), and this is the daemon
	// BACKFILLING it for a legacy node that has none. Declaring "cli" is correct
	// here and only here: the guard above already proved the field is absent, so
	// this cannot clobber an owner's value — it can only fill a gap.
	registry.write({ ...descriptor, windowId }, "cli");
	const persisted = registry.read(descriptor.id);
	return persisted ?? null;
}

export function driveSession(
	descriptor: SessionDescriptor,
	drive: DriveState,
	ports: DaemonPorts,
	registry: RegistryPort,
	delivery: DeliveryPort,
	beforeSelfInjection?: (paneId: string, payload: string, nowMs: number) => void,
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
	const harnessVerdict = classifyInterstitial(pane, harness);
	// The exact Copilot resume modal is intentionally invisible to harness-less
	// readiness so ordinary prose can never become a keypress. Override booting
	// only after harness-aware classification; ready/busy always win, preventing
	// a verbatim modal quoted in live output from firing automation.
	const actionableHarnessModal =
		readiness === "booting" && harnessVerdict.label === "session-in-use";

	if (readiness === "dead") {
		const dr = classifyDeathReason(pane);
		return fail(descriptor, drive, registry, delivery, "pane reported dead", dr);
	}
	if (readiness === "interstitial" || actionableHarnessModal) {
		const verdict = harnessVerdict;
		// Auto-answer each recognized prompt exactly once. A persistent modal
		// degrades to needs-human; a second distinct prompt still gets one answer.
		const label = verdict.label ?? "interstitial";
		const answered = drive.answeredInterstitials ?? new Set<string>();
		if (verdict.action === "answer" && !answered.has(label)) {
			answered.add(label);
			drive.answeredInterstitials = answered;
			for (const key of verdict.keys ?? []) ports.sendKey(paneId, key);
			return { kind: "answered", label };
		}
		if (verdict.action === "dismiss") {
			ports.sendKey(paneId, "Escape");
			return { kind: "dismissed", label: verdict.label ?? "interstitial" };
		}
		if (verdict.action === "needs-human" || verdict.action === "answer") {
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
			descriptor.revivePendingAt !== undefined,
		);
		beforeSelfInjection?.(paneId, init.body, ports.now());
		// A human can be typing in a freshly spawned pane. `held` means nothing was
		// typed — retry, but on a clock that ends in a legible failure.
		if (ports.sendText(paneId, init.body, harness, descriptor.pid) === "held") {
			return heldBoot(descriptor, drive, registry, delivery, ports.now());
		}
		drive.initHeldSinceMs = undefined;
		const at = new Date(ports.now()).toISOString();
		persistDaemonWrite(registry, markInitInjected(descriptor, at));
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
		persistDaemonWrite(registry, bound);
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
		persistDaemonWrite(registry, bound);
		if (!drive.settled && descriptor.spawnedBy) {
			drive.settled = true;
			const note = buildBoundNotice(bound);
			if (note) notify(delivery, descriptor.id, note.to, note.text);
		}
		return { kind: "bound", harnessSessionId };
	}
	// Concurrent boots discovery can't pick deterministically; surface it (review
	// M4) and let phone-home + the watchdog resolve it.
	//
	// s071 D3 — this used to `return` here, which meant an ambiguity BYPASSED the
	// watchdog block below entirely. Two claude peers sharing one cwd share one
	// transcript dir, so both boots look "new" on every tick: discovery stayed
	// ambiguous forever, the watchdog never ran, and the seat sat `pending` /
	// `idle · active` with `failureReason: null` indefinitely. That is the exact
	// never-bind wedge signature. It now FALLS THROUGH: the ambiguity is still
	// reported while the clock is running, but the clock IS running.
	const ambiguousCount = discovery.status === "ambiguous" ? discovery.paths.length : undefined;

	// 3) Watchdog: re-send the confirm line once, then fail (AC-04).
	const decision = evaluateWatchdog({
		bound: false,
		readyAtMs: drive.readyAtMs,
		resentAtMs: drive.resentAtMs,
		nowMs: ports.now(),
		timeoutMs: WATCHDOG_TIMEOUT_MS,
	});
	if (decision.kind === "resend-phonehome") {
		const phonehomeLine = buildInitInjection(descriptor.id).phonehomeLine;
		beforeSelfInjection?.(paneId, phonehomeLine, ports.now());
		if (ports.sendText(paneId, phonehomeLine, harness, descriptor.pid) === "held") {
			return heldBoot(descriptor, drive, registry, delivery, ports.now());
		}
		drive.initHeldSinceMs = undefined;
		drive.resentAtMs = ports.now();
		return { kind: "resent-phonehome" };
	}
	if (decision.kind === "fail") {
		// Always carry a machine-stable reason. A `failed` lifecycle with
		// `failureReason: null` is exactly the shape that made the wedge
		// unreadable in `pij state`/`list --json`.
		return fail(
			descriptor,
			drive,
			registry,
			delivery,
			ambiguousCount === undefined
				? decision.reason
				: `${decision.reason}; transcript discovery stayed ambiguous across ${ambiguousCount} candidate transcripts ` +
						"(concurrent boots in one folder) — nothing could be bound deterministically",
			"bind-timeout",
		);
	}
	if (ambiguousCount !== undefined) return { kind: "ambiguous", count: ambiguousCount };
	return { kind: "waiting" };
}

/** A boot line was refused by live pane input. Anchor the clock on first refusal
 * and fail loudly once the bounded window passes — never return to an unanchored
 * `waiting`, which left the seat pending indefinitely and unlogged. */
function heldBoot(
	descriptor: SessionDescriptor,
	drive: DriveState,
	registry: RegistryPort,
	delivery: DeliveryPort,
	nowMs: number,
): DriveOutcome {
	const first = drive.initHeldSinceMs === undefined;
	if (drive.initHeldSinceMs === undefined) drive.initHeldSinceMs = nowMs;
	const heldForMs = nowMs - drive.initHeldSinceMs;
	if (heldForMs >= INIT_HELD_TIMEOUT_MS) {
		return fail(
			descriptor,
			drive,
			registry,
			delivery,
			`boot injection blocked by active pane input for ${Math.round(heldForMs / 1000)}s — ` +
				"a human was typing in this pane, so pij never wrote the init line",
			"pane-input-blocked",
		);
	}
	return { kind: "held-by-pane-input", heldForMs, first };
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
	persistDaemonWrite(registry, failed);
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

/** How long boot traffic may be refused by live pane input before the spawn is
 * failed OUT LOUD. The composer gate protects a human mid-sentence, but a seat
 * that can never be booted must say so — silence here would be the same
 * indefinite-pending deadlock class this guard exists to prevent. */
export const INIT_HELD_TIMEOUT_MS = 20_000;

export interface DrainedTmuxMessage {
	readonly messageId: string;
	readonly from: SessionId;
	readonly outcome?: SendOutcome;
	/** PoC: which transport carried it. Absent = pane (send-keys). */
	readonly via?: "socket" | "pointer";
}

/** Decide the hold from the composer's CONTENT, captured immediately before this
 * one send-key. Called once per message, never once per batch.
 *
 * The capture taken here is authoritative and may ACQUIRE a hold, not only
 * release one. That is the whole fix: the old gate re-checked before every send
 * yet could only ever release, so a message arriving in the same 600ms tick the
 * human started typing landed on top of a composer that visibly read `❯ hello`.
 *
 * An unrecognised layout defers to the caret tracker's byte-stream signal — we
 * never act on a guessed region.
 *
 * `holds` is REQUIRED, not optional: this call is the capture immediately before
 * `sendText`, so it is the only thing that can see a keystroke landing between
 * the caller's own check and the send. Making it optional let that race back in. */
export function refreshRenderedComposerHold(
	paneId: string,
	ports: Pick<DaemonPorts, "capturePane" | "now">,
	buffer: SendBuffer,
	holds: ComposerHoldTracker,
): boolean {
	const nowMs = ports.now();
	const content = renderedComposerPayload(ports.capturePane(paneId));
	const verdict = holds.observe(paneId, content, nowMs);
	if (!verdict.deferred) {
		// Mirror the decision so `isPaneHeld` (and `flush`, which consults it)
		// agree with the verdict just reached from live content.
		const previous = buffer.paneSignal(paneId);
		buffer.setPaneSignal(paneId, {
			busy: previous?.busy ?? false,
			userTyping: verdict.hold,
			...(verdict.hold ? { lastActivityAt: verdict.lastChangeAt ?? nowMs } : {}),
		});
		return verdict.hold;
	}
	if (isBlankComposer(content)) {
		const previous = buffer.paneSignal(paneId);
		buffer.setPaneSignal(paneId, {
			busy: previous?.busy ?? false,
			userTyping: false,
			lastActivityAt: undefined,
		});
	}
	return buffer.isPaneHeld(paneId, nowMs);
}

/** The ONE line typed into a pane instead of a body (review §7): ASCII, no
 *  newline, far under one pty chunk, framed so the model knows it is pij. The
 *  recipient reads the bodies with `pij inbox`; the rows stay unread until then. */
export function pointerLine(from: SessionId, count: number): string {
	return count === 1
		? `[pij from ${from}] 1 new message — run: pij inbox`
		: `[pij from ${from}] ${count} new messages — run: pij inbox`;
}

/** Route one bound tmux target's unread messages and return each completed
 *  injection outcome. The impure caller owns the post-outcome read marker.
 *  Delivery ownership (AC-08): pi targets route to `observe` and remain for the
 *  in-process receiver. A not-yet-bound tmux target buffers (R-02). */
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
	beforeSelfInjection: ((paneId: string, payload: string, nowMs: number) => void) | undefined,
	holds: ComposerHoldTracker,
	opts: { readonly pointer?: boolean } = {},
): DrainedTmuxMessage[] {
	const consumed: DrainedTmuxMessage[] = [];
	for (const m of messages) {
		// Preserve the REAL sender so the injected text is framed `[pij from <from>]`
		// and the receiving agent knows who messaged it (parity with the pi receiver).
		const msg: PijMessage = { from: m.from, to: target.id, body: m.body, command: m.command };
		const decision = route(target, msg);
		// Socket-first for Claude seats (review §5/§7) and Copilot seats spawned with
		// `--ui-server` (descriptor.rpcPort): the body never touches the
		// pty, so the 1022-byte chunk clip cannot happen and a busy recipient reads
		// it between tool calls. Commands (`/compact`) must still be TYPED — Claude
		// Code renders a socket-delivered slash command as plain text.
		if (
			decision.kind === "inject" &&
			(target.harness === "claude" ||
				(target.harness === "copilot" && target.rpcPort !== undefined)) &&
			!m.command &&
			ports.sendSocket
		) {
			const outcome = ports.sendSocket(target, { ...msg, messageId: m.messageId });
			if (outcome === "confirmed") {
				consumed.push({ messageId: m.messageId, from: m.from, outcome, via: "socket" });
				continue;
			}
			if (outcome === "failed") {
				buffer.enqueue(m.messageId, msg);
				continue;
			}
			// `no-socket` (or any other outcome) → fall through to the pane path.
		}
		// Pointer path (review §7, pij-comms PoC): when the store can hold the row
		// for a later `pij inbox` (opts.pointer), a seat with no endpoint gets ONE
		// short line instead of its body — the body never crosses the pty, so it
		// cannot be clipped. The caller marks the row `injected` (not read).
		// Commands still type raw.
		if (decision.kind === "inject" && opts.pointer && !m.command) {
			if (refreshRenderedComposerHold(decision.paneId, ports, buffer, holds)) {
				buffer.enqueue(m.messageId, msg);
				continue;
			}
			const line = pointerLine(m.from, 1);
			beforeSelfInjection?.(decision.paneId, line, ports.now());
			const outcome = ports.sendText(decision.paneId, line, target.harness, target.pid);
			if (outcome === "gone") continue;
			if (outcome === "held" || outcome === "failed") {
				buffer.enqueue(m.messageId, msg);
				continue;
			}
			consumed.push({ messageId: m.messageId, from: m.from, outcome, via: "pointer" });
			continue;
		}
		if (decision.kind === "inject") {
			if (refreshRenderedComposerHold(decision.paneId, ports, buffer, holds)) {
				buffer.enqueue(m.messageId, msg);
				continue;
			}
			beforeSelfInjection?.(decision.paneId, decision.text, ports.now());
			const outcome = ports.sendText(decision.paneId, decision.text, target.harness, target.pid);
			// `held` = nothing typed (a human is at the composer). `failed` = the send
			// threw BEFORE submission, so nothing reliably landed either. Both must
			// leave the inbox copy UNREAD, so a retry — or a daemon restart — can still
			// deliver it (plan 071 D7). Only `unverified` consumes, because there the
			// payload WAS typed and replaying could duplicate an accepted turn.
			if (outcome === "gone") {
				// The pane does not exist. Falling through to `consumed` would mark this
				// message READ — deleting the only durable copy of something that was
				// never delivered. Not buffered either: an in-memory retry against a
				// dead pane can never succeed, and the id is recycled, so a queued
				// message eventually lands in whatever LIVE pane inherits it. Leave it
				// unread on disk; the caller unbinds the seat.
				continue;
			}
			if (outcome === "held" || outcome === "failed") {
				buffer.enqueue(m.messageId, msg);
				continue;
			}
			consumed.push({ messageId: m.messageId, from: m.from, outcome });
		} else if (decision.kind === "buffer") {
			// Buffer WITHOUT consuming (plan 071 D7). Reporting this as consumed made
			// the caller mark the message read, which deleted the only durable copy
			// of a message that existed nowhere but in an in-memory FIFO — so a
			// daemon restart silently destroyed it while the sender held a `queued`
			// receipt. The inbox file stays unread until the text is actually in a
			// pane; a restart therefore re-derives the work, exactly as the buffer's
			// contract always claimed.
			buffer.enqueue(m.messageId, msg);
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
