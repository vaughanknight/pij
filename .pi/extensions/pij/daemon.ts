#!/usr/bin/env -S NODE_NO_WARNINGS=1 npx tsx
// pij-control-plane — the daemon bin (impure orchestrator, Plan 019, T016).
//
// THIN glue: it owns the single-instance lock, the tick timer, and inbox-file
// I/O, and delegates EVERY decision to the TDD'd pure core — `driveSession`
// (the spawn→bind state machine), `drainTmuxInbox` + `route` (delivery
// ownership), `IndexState` (rebuild from ~/.pij/), `evaluateLock`
// (single-instance). Run it in a tmux window: `npx tsx .pi/extensions/pij/daemon.ts`.
//
// Delivery ownership (AC-08): the daemon drives + drains ONLY tmux harnesses
// (`daemonOwnsDelivery`); pi sessions keep their in-process receiver untouched.

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FsAllocationStore } from "./adapters/allocation-store.js";
import { FsAssignmentStore } from "./adapters/assignment-store.js";
import { writeJsonAtomic } from "./adapters/atomic-file.js";
import { FsBatonStore } from "./adapters/baton-store.js";
import { migrateFsInboxes, openChannel, sqliteOf } from "./adapters/channel-factory.js";
import { DaemonTmux } from "./adapters/daemon-tmux.js";
import { FsDispatchStore } from "./adapters/dispatch-store.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsFenceStore } from "./adapters/fence-store.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { releaseHeldLocks, trackHeldLock } from "./adapters/lock-reclaim.js";
import { FsOpJournal } from "./adapters/op-journal.js";
import { FsPlatformWriteLock } from "./adapters/platform-write-lock.js";
import { NodeProcess } from "./adapters/process.js";
import { TickScopedProcessStates } from "./adapters/process-states.js";
import { FsProjectStore } from "./adapters/project-store.js";
import { FsSpawnExpectationStore } from "./adapters/spawn-expectation-store.js";
import { FsSpineLog } from "./adapters/spine-store.js";
import { SqliteQueue } from "./adapters/sqlite-queue.js";

import { FsWatchStore } from "./adapters/watch-store.js";
import { FsWatchdogGlobalStore, FsWatchdogStore } from "./adapters/watchdog-store.js";
import { planOnceClose } from "./core/agent-peer.js";
import { sweepStaleTmp } from "./core/agents/inline.js";
import { resolvePijHome } from "./core/agents/paths.js";
import { ARCHIVE_PRUNE_AFTER_MS } from "./core/archive.js";
import {
	buildDeadNotice,
	buildStalledNotice,
	noLiveNoticeRecipientLine,
	noticeRecipient,
	resolveNoticeRecipient,
} from "./core/binding.js";
import { AnomalySweep } from "./core/daemon/anomaly-sweep.js";
import { BatonSweep } from "./core/daemon/baton-sweep.js";
import { reconcileDeaths, resolveDeathNotices } from "./core/daemon/death-reconciler.js";
import { IndexState } from "./core/daemon/index-state.js";
import { evaluateLock, parseLockFile, serializeLockFile } from "./core/daemon/lock.js";
import {
	backfillWindowId,
	type DaemonPorts,
	type DriveState,
	drainTmuxInbox,
	driveSession,
	flushedText,
	INIT_HELD_TIMEOUT_MS,
	observeActivity,
	POINTER_LEASE_MS,
	refreshRenderedComposerHold,
	type SendTextOptions,
} from "./core/daemon/loop.js";
import {
	ComposerHoldTracker,
	type PaneListing,
	PaneSignalMonitor,
	type PaneSignalSnapshot,
	renderedComposerPayload,
} from "./core/daemon/pane-signals.js";
import {
	COMPACT_GRACE_MS,
	COMPACT_MAX_MS,
	isCompacting,
	SendBuffer,
} from "./core/daemon/router.js";
import { RuntimeAxisTracker } from "./core/daemon/runtime-axis.js";
import { orphanedTapFiles } from "./core/daemon/tap-retention.js";
import { FsTickHeartbeatStore, type TickHeartbeatPort } from "./core/daemon/tick-heartbeat.js";
import { PeerWatchManager } from "./core/daemon/watch.js";
import { WatchdogManager, type WatchdogResponseEvent } from "./core/daemon/watchdog-manager.js";
import {
	buildSchedulerProjection,
	WATCHDOG_SCHEDULER_FILE,
} from "./core/daemon/watchdog-scheduler-projection.js";
import { resolveLivePane } from "./core/discovery.js";
import { daemonOwnsDelivery } from "./core/harness/pi.js";
import { persistReceiptEnvelope, prepareReceiptEnvelopes } from "./core/inbox.js";
import { receiptBody } from "./core/message.js";
import {
	type BatonNotice,
	type BatonNoticeReceipt,
	type BatonNoticeSink,
	renderBatonNotice,
} from "./core/orchestration/baton.js";
import { canonicalDispatchJson, isOpenDispatch, retireDispatch } from "./core/platform/dispatch.js";
import type { SpineLogPort } from "./core/platform/ports.js";
import { buildSpineEvent } from "./core/platform/spine.js";
import type { ProcessSnapshot } from "./core/platform/types.js";
import type { DeliveryPort, InboxPort, RegistryPort, SendOutcome } from "./core/ports.js";
import { classifyReadiness } from "./core/readiness.js";
import { persistDaemonWrite } from "./core/registry-write.js";
import { classifyDeathReason, STALE_AFTER_MS } from "./core/state.js";
import { type HarnessKind, ok, type SessionDescriptor, type SessionId } from "./core/types.js";
import { TELEGRAM_PEER_ID } from "./telegram/bridge.js";
import { type BridgeSupervisor, bridgeSupervisorForDaemon } from "./telegram/index.js";

const TICK_MS = 600;
/** Delivery cadence (plan 071 D2). Independent of TICK_MS so a slow
 *  reconciliation tick can never become delivery latency again. Matches the
 *  poll-primary SLA `adapters/channel.ts` already gives pi seats. */
const DELIVERY_PASS_MS = 200;
/** How often the archival janitor runs. The policy window is 48h, so this only
 *  needs to be "much more often than that, much less often than a tick". */
const ARCHIVE_SWEEP_INTERVAL_MS = 60_000;
/** Archive-prune cadence (pij#183). Hourly, not per-minute: the bound it enforces
 *  is 90 DAYS, so the difference between checking every tick and every hour is
 *  nothing at all — while a recursive size walk over ~2,500 archived directories
 *  is exactly the kind of work that has no business on a loop whose duration is
 *  fleet-wide delivery latency (pij#225). */
const ARCHIVE_PRUNE_INTERVAL_MS = 60 * 60_000;
/** Orphaned-tap sweep cadence (pij#183). Disk hygiene, not a per-tick duty: the
 *  garbage it reclaims accumulates across daemon RESTARTS, not across ticks, so a
 *  slow cadence loses nothing and keeps a `readdir` + `stat`-per-file off the hot
 *  path that pij#181 and pij#229 just finished clearing. */
const TAP_SWEEP_INTERVAL_MS = 5 * 60_000;
type PushedTransition = "stalled" | "dead" | "provider-failure";

class DaemonBatonNoticeSink implements BatonNoticeSink {
	constructor(private readonly channel: DeliveryPort) {}

	push(notice: BatonNotice): BatonNoticeReceipt {
		const delivered = this.channel.deliver({
			from: notice.from,
			to: notice.to,
			body: renderBatonNotice(notice),
		});
		return delivered.ok
			? { state: "queued", messageId: delivered.value.messageId }
			: { state: "unverified" };
	}
}

export function createDaemonRegistry(
	pijHome: string,
	log: (line: string) => void = () => {},
): FsRegistry {
	return new FsRegistry(pijHome, undefined, {
		onReclaim: (note) => log(`warning: ${note.message}`),
	});
}

/** One daemon, holding the cross-tick drive state. Pure-ish: `tick()` is
 *  synchronous and side-effects only through the injected ports/registry, so a
 *  smoke can drive it one tick at a time with fakes. */
export class Daemon {
	private readonly index = new IndexState();
	private readonly drives = new Map<string, DriveState>();
	private readonly buffer = new SendBuffer();
	private readonly paneSignals = new PaneSignalMonitor();
	/** Content-state delivery gate (see `ComposerHoldTracker`). Authoritative for
	 * every known layout; the caret tracker above remains the unknown-layout path. */
	private readonly composerHolds = new ComposerHoldTracker();
	/** Retire the seat bound to a pane tmux says does not exist.
	 *
	 *  Not a delivery failure — a stale BINDING, and a permanent one. It is written
	 *  as an arrow function assigned in the field position so it is defined before
	 *  the `sendText` gate in the constructor can call it.
	 *
	 *  Idempotent by lookup: a pane with no live descriptor is a no-op, so repeated
	 *  gone sends in one batch retire the seat once. */
	private readonly unbindGonePane = (paneId: string): void => {
		const resolved = resolveLivePane(paneId, this.registry.list());
		if (!resolved.ok) {
			this.log(`unbind pane ${paneId}: ${resolved.code} ${resolved.message}`);
			return;
		}
		const owner = resolved.value ? this.registry.read(resolved.value) : null;
		if (!owner) return;
		this.registry.dissolve(owner.id);
		this.drives.delete(owner.id);
		this.pushed.delete(owner.id);
		this.watchdogStalled.delete(owner.id);
		this.paneSig.delete(owner.id);
		this.watchManager.disposeSession(owner.id);
		this.watchdogManager.disposeSession(owner.id);
		this.log(
			`unbind ${owner.id}: pane ${paneId} does not exist — descriptor dissolved; unread mail left in the mailbox for a revive`,
		);
	};

	private readonly markSelfInjection = (paneId: string, payload: string, nowMs: number): void => {
		this.paneSignals.markSelfInjection(paneId, payload, nowMs);
		this.composerHolds.markSelfInjection(paneId, payload, nowMs);
	};
	/** Per-bound-session latch: tracks which transitions have already been pushed
	 *  so each stalled/dead/provider-failure notice fires exactly once (T012). */
	private readonly pushed = new Map<string, Set<PushedTransition>>();
	/** Sessions whose current stalled episode was confirmed by the watchdog.
	 * Only a typed real-recovery response may release this stronger latch. */
	private readonly watchdogStalled = new Set<string>();
	/** Per-bound-session last captured-pane signature — the pane-content heartbeat.
	 *  ANY visible change tick-to-tick means the peer is alive (streaming reasoning
	 *  or tool output), even when its footer momentarily classifies as `booting`
	 *  (raw tool output) rather than a `busy` marker. Feeds the stall guard so a
	 *  deep-thinking / long-tool xhigh peer isn't false-flagged stalled. */
	private readonly paneSig = new Map<string, string>();
	/** One backfill attempt per session per daemon run (plan 054 P2 T006):
	 *  legacy live nodes gain windowId without per-tick tmux probing spam. */
	private readonly windowBackfillTried = new Set<string>();
	/** WS-6 mechanical-axis owner (plan 054 P2 T008): verdicts + V-05 spine
	 *  events, latch-after-successful-append. Constructed over the daemon's
	 *  own Fs platform adapters (mirrors bin deps(), the critic-finding gap)
	 *  LAZILY on the first tick: FsSpineLog creates its directory eagerly,
	 *  and a daemon under test (or on a broken home) must degrade to the
	 *  legacy passes with one honest log line, never crash at construction. */
	private runtimeAxis: RuntimeAxisTracker | undefined;
	/** Anomaly parent alerts (plan 054 P2 T010, AC-07): evidence-keyed
	 *  once-per-transition latch, alert-only — the daemon never remediates. */
	private anomalySweep: AnomalySweep | undefined;
	/** ONE `ps` per tick for the whole process table, serving the runtime axis's
	 *  suspension probe for every descriptor (pij#181). Invalidated at the top of
	 *  each tick; captures lazily on the first question, so a tick that asks
	 *  nothing forks nothing. */
	private readonly processStates = new TickScopedProcessStates();
	private tickProcessSnapshot: ProcessSnapshot | undefined;
	/** THIS TICK'S RENDERED FRAME per pane (pij#229).
	 *
	 *  `refreshPaneSignals` already captured every live pane once per tick and
	 *  said why: the caret tracker and the content gate must reason about the SAME
	 *  rendered frame. The activity axis in the drive loop was a THIRD consumer of
	 *  the same panes in the same tick, taking its own later capture — so `state`
	 *  and `lastEventAt` could be derived from a different frame than the signal
	 *  tracker saw, in the same pass, with nothing detecting the disagreement.
	 *  Shared here so all three agree by construction. */
	private readonly tickPaneCaptures = new Map<string, string>();
	/** Panes tmux listed as live THIS TICK, or `undefined` when the signals pass
	 *  did not run (its ports are optional and a fake may omit them). `undefined`
	 *  means NOTHING IS KNOWN — the drive loop must then capture directly, because
	 *  "no live-pane list" and "the pane is not in the list" are opposite facts and
	 *  must not share a branch. */
	private tickLivePanes: ReadonlySet<string> | undefined;
	private platformPassesDisabled = false;
	private readonly watchManager: PeerWatchManager;
	private readonly watchdogManager: WatchdogManager;
	private readonly batonSweep: BatonSweep;
	private readonly expectations: FsSpawnExpectationStore;
	/** The first sweep reconciles persisted state after boot; later passes are live. */
	private deathSweepIsHistorical = true;
	/** Clock anchor for the throttled archival sweep; undefined ⇒ never run, so
	 *  the first tick after boot sweeps immediately. */
	private lastArchiveSweepMs: number | undefined;
	/** Last archive PRUNE (pij#183); hourly, see {@link ARCHIVE_PRUNE_INTERVAL_MS}. */
	private lastArchivePruneMs: number | undefined;
	/** Last projected scheduler payload, so an unchanged reconcile writes nothing. */
	private lastSchedulerFingerprint: string | undefined;
	/** Last orphaned-tap sweep (pij#183); throttled like the archive sweep. */
	private lastTapSweepMs: number | undefined;
	/** Re-entrancy guard for the fast delivery pass (plan 071 D2). */
	private deliveringNow = false;
	private readonly draining = new Set<string>();
	private readonly dissolvedDrainLogged = new Set<string>();
	private tickingNow = false;

	/** Ports with the composer gate WELDED ON — see the constructor. */
	private readonly ports: DaemonPorts;

	private processSnapshotThisTick(capture: () => ProcessSnapshot): ProcessSnapshot {
		this.tickProcessSnapshot ??= capture();
		return this.tickProcessSnapshot;
	}

	constructor(
		private readonly pijHome: string,
		rawPorts: DaemonPorts,
		private readonly registry: RegistryPort,
		private readonly channel: DeliveryPort & InboxPort,
		private readonly log: (line: string) => void = () => {},
		watchManager?: PeerWatchManager,
		batonSweep?: BatonSweep,
		watchdogManager?: WatchdogManager,
		/** Tick-liveness telemetry (pij#180 Fix A). A parameter PROPERTY with a
		 *  default, so the collaborator is injected (P3) without the constructor
		 *  body growing a line — plan 100 grants only the signature here. */
		private readonly heartbeat: TickHeartbeatPort = new FsTickHeartbeatStore(pijHome),
		private readonly bridgeSupervisor?: BridgeSupervisor,
		private readonly dispatchSpineLog?: SpineLogPort,
	) {
		// THE structural gate. Every pane write in the daemon — inbox delivery,
		// buffered flush, AND driveSession's init/phone-home injections — goes
		// through `ports.sendText`, so gating HERE makes the content check
		// unavoidable rather than something each call site has to remember.
		// A held send types nothing and reports `held`; callers retry next tick.
		// NOT a spread: `{...rawPorts}` drops prototype methods, and the
		// production adapter (DaemonTmux) is a class — spreading it produced a
		// ports object with ONLY sendText, so every tick crashed on
		// `this.ports.now is not a function` (2026-07-25 fleet outage). Delegate
		// through the prototype chain so class adapters and plain-object fakes
		// both keep their full surface.
		const captureProcessSnapshot = rawPorts.processSnapshot?.bind(rawPorts);
		this.ports = Object.assign(Object.create(Object.getPrototypeOf(rawPorts)), rawPorts, {
			sendText: (
				paneId: string,
				text: string,
				harness?: HarnessKind,
				pid?: number,
				opts?: SendTextOptions,
			) => {
				// EMERGENCY BYPASS 2026-07-25: content gate disabled — fleet-wide
				// delivery failure attributed to over-hold. Step-on protection is
				// OFF until the hold algorithm is re-reviewed (s069 follow-up).
				// if (refreshRenderedComposerHold(paneId, this.ports, this.buffer, this.composerHolds)) {
				// 	return "held";
				// }
				const outcome = rawPorts.sendText(paneId, text, harness, pid, opts);
				// A GONE pane is a stale BINDING, not a failed send. Handled here rather
				// than per-call-site for the same reason the content gate is: every pane
				// write in the daemon comes through this function, so a seat whose
				// terminal has vanished is unbound exactly once, wherever it is noticed.
				// Left alone, the daemon re-targets that pane every tick forever — and
				// because tmux re-issues pane ids from `%0`, the queued message would
				// eventually land in whatever LIVE pane inherits the id (task #34).
				if (outcome === "gone") this.unbindGonePane(paneId);
				// Marked HERE, after the write actually happened. Marking before the
				// gate left a phantom echo exemption behind every HELD send — an
				// exemption for output that was never written, which the caret
				// fallback could then spend on the human's own keystrokes.
				this.markSelfInjection(paneId, text, this.ports.now());
				return outcome;
			},
			...(captureProcessSnapshot
				? { processSnapshot: () => this.processSnapshotThisTick(captureProcessSnapshot) }
				: {}),
		});
		this.expectations = new FsSpawnExpectationStore(pijHome);
		this.watchManager =
			watchManager ??
			new PeerWatchManager({
				store: new FsWatchStore(pijHome),
				channel,
				isAlive: (pid) => this.ports.isAlive(pid),
				log,
			});
		this.watchdogManager =
			watchdogManager ??
			new WatchdogManager({
				store: new FsWatchdogStore(pijHome),
				channel,
				isAlive: (pid) => this.ports.isAlive(pid),
				globallyDisabled: () => new FsWatchdogGlobalStore(pijHome).disabled(),
				now: () => this.ports.now(),
				capturePane: (session) => (session.paneId ? this.paneFrameThisTick(session.paneId) : ""),
				hasPendingWatchdog: (id) => {
					if (typeof channel.listUnread !== "function") return false;
					const unread = channel.listUnread(id);
					return (
						unread.ok &&
						unread.value.some(
							(message) => message.kind !== "receipt" && message.from === "pij-watchdog",
						)
					);
				},
				onFire: (session, atMs) => {
					const latest = this.registry.read(session.id) ?? session;
					persistDaemonWrite(this.registry, {
						...latest,
						lastWatchdogFireAt: new Date(atMs).toISOString(),
					});
				},
				onResponse: (event) => this.pushWatchdogResponse(event),
				log,
			});
		this.batonSweep =
			batonSweep ??
			new BatonSweep({
				store: new FsBatonStore(pijHome),
				registry,
				notices: new DaemonBatonNoticeSink(channel),
				isAlive: (pid) => this.ports.isAlive(pid),
				now: () => this.ports.now(),
			});
	}

	/** One pass: rebuild the index, drive pending tmux spawns, drain bound inboxes. */
	async tick(): Promise<void> {
		if (this.tickingNow) return; // never overlap two ticks
		this.tickingNow = true;
		try {
			await this.tickLocked();
		} finally {
			this.tickingNow = false;
		}
	}

	private async tickLocked(): Promise<void> {
		const tickStartedAtMs = Date.now();
		const tickAt = new Date(this.ports.now()).toISOString();
		// One process-table capture per tick, taken lazily on the runtime axis's
		// first suspension question (pij#181). Dropping it here is what makes the
		// table THIS tick's table rather than a stale one.
		this.processStates.invalidate();
		this.tickProcessSnapshot = undefined;
		// Same discipline for pane frames (pij#229): this tick's captures and this
		// tick's live-pane list, both rebuilt by `refreshPaneSignals` below.
		this.tickPaneCaptures.clear();
		this.tickLivePanes = undefined;
		try {
			this.bridgeSupervisor?.tick();
		} catch (error) {
			this.log(`telegram supervision error: ${(error as Error).message}`);
		}
		// ONE persist for the whole owned set, not one publish per seat (pij#180
		// Fix A). The filter is unchanged — only the persistence SHAPE moved.
		// `daemonOwnsDelivery` is harness/delivery-mode only, so a long-dead seat
		// is still listed; that costs a map entry now instead of ~5 fsyncs.
		const ownedIds: string[] = [];
		for (const snapshot of this.registry.list()) {
			if (!daemonOwnsDelivery(snapshot.harness ?? "pi", snapshot.deliveryMode)) continue;
			ownedIds.push(snapshot.id);
		}
		this.heartbeat.write(ownedIds, tickAt);
		this.index.rebuild(this.registry.list());
		this.retireForClosedRecipients();
		this.refreshPaneSignals();
		// Legacy-node windowId backfill (plan 054 P2 T006, AC-09): once per
		// session per daemon run, resolve the pane's window and persist it via
		// the merge-law write. Fresh spawns/adopts already carry it.
		for (const d of this.index.all()) {
			if (d.windowId !== undefined || d.paneId === undefined) continue;
			if (this.windowBackfillTried.has(d.id)) continue;
			this.windowBackfillTried.add(d.id);
			try {
				const filled = backfillWindowId(d, this.registry, (paneId) => {
					try {
						const raw = execFileSync(
							"tmux",
							["display-message", "-p", "-t", paneId, "#{window_id}"],
							{ encoding: "utf8" },
						).trim();
						return raw === "" ? null : raw;
					} catch {
						return null; // pane gone / tmux unavailable — nothing to backfill
					}
				});
				if (filled) this.log(`backfill ${d.id}: windowId ${filled.windowId}`);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				this.log(`backfill ${d.id}: error ${detail}`);
			}
		}
		this.index.rebuild(this.registry.list());
		// Mechanical-axis pass (plan 054 P2 T008): verdicts persist merge-law
		// safe; V-05 transition events append under lock+recovery, latch flips
		// only after a successful append (skip-and-retry, never a stalled tick).
		if (this.runtimeAxis === undefined && !this.platformPassesDisabled) {
			try {
				this.runtimeAxis = new RuntimeAxisTracker({
					registry: this.registry,
					spineLog: new FsSpineLog(this.pijHome),
					opJournal: new FsOpJournal(this.pijHome),
					projectStore: new FsProjectStore(this.pijHome),
					assignmentStore: new FsAssignmentStore(this.pijHome),
					allocationStore: new FsAllocationStore(this.pijHome),
					fenceStore: new FsFenceStore(this.pijHome),
					dispatchStore: new FsDispatchStore(this.pijHome),
					platformWriteLock: new FsPlatformWriteLock(this.pijHome, {
						onReclaim: (note) => this.log(note.message),
					}),
					now: () => this.ports.now(),
					isAlive: (pid) => this.ports.isAlive(pid),
					// Suspension probe: `ps -o state=` reads 'T' for a SIGSTOP'd
					// process; an unreadable probe is null — honest missing telemetry.
					// ONE whole-table capture per tick serves every descriptor
					// (pij#181): this used to fork per descriptor, ~625 `ps` spawns
					// per tick and 26.2% of tick self-time, each one an UNBOUNDED
					// blocking call on the shared single-threaded loop (pij#225).
					isSuspended: (pid) => this.processStates.isSuspended(pid),
					log: this.log,
				});
				this.anomalySweep = new AnomalySweep({
					registry: this.registry,
					assignmentStore: new FsAssignmentStore(this.pijHome),
					spineLog: new FsSpineLog(this.pijHome),
					delivery: this.channel,
					now: () => this.ports.now(),
					// Recipient fallback + honest-drop surface (s057 dogfood).
					projectStore: new FsProjectStore(this.pijHome),
					// Watchdog wiring, projected HERE at the I/O edge so the detector
					// stays pure (s079) — the same shape `pij anomalies` builds in
					// cli.ts. Until this line, the sweep called detectAnomalies with no
					// watchdog at all, so `inert-subscription` had NEVER fired in the
					// daemon: it appeared only when a human already ran the query.
					// Built inline rather than behind a helper deliberately — an added
					// import is a second edit to a file two other streams hold regions
					// in, and this constructor argument is the only granted seam.
					watchdog: () => {
						const store = new FsWatchdogStore(this.pijHome);
						return {
							globallyDisabled: new FsWatchdogGlobalStore(this.pijHome).disabled(),
							nodes: this.registry.list().flatMap((d) => {
								const sidecar = store.read(d.id);
								if (sidecar === undefined) return [];
								return [
									{
										nodeId: d.id,
										watchers: (sidecar.watchers ?? []).map((w) => w.watcherId),
										...(sidecar.pausedBy === undefined ? {} : { pausedBy: sidecar.pausedBy }),
										...(sidecar.exemptUntilMs === undefined
											? {}
											: { exemptUntilMs: sidecar.exemptUntilMs }),
									},
								];
							}),
						};
					},
					// NOTE: `activityCredibility` is NOT wired yet and its absence is
					// deliberate rather than forgotten — `s095` owns the implementation
					// and it does not exist on this branch. Absent, the dead-recipient
					// row provably cannot fire (pinned by anomaly-sweep.test.ts "2b"),
					// so a half-wired call site is observable rather than a silent
					// half-detector. One line completes it once state.ts exports it.
					log: this.log,
				});
			} catch (error) {
				this.platformPassesDisabled = true;
				const detail = error instanceof Error ? error.message : String(error);
				this.log(
					`platform adapters unavailable (${detail}) — runtime-axis/anomaly passes disabled for this run`,
				);
			}
		}
		this.runtimeAxis?.tick(this.index.all());
		this.index.rebuild(this.registry.list());
		this.watchManager.reconcile(this.index.all());
		// Anomaly alerts (plan 054 P2 T010): derived queries + one pushed alert
		// per transition to the effectiveParent; act never.
		if (this.anomalySweep !== undefined) {
			try {
				const anomalySweep = this.anomalySweep.tick();
				if (anomalySweep.alerts > 0) {
					this.log(`anomaly sweep: pushed ${anomalySweep.alerts} parent alert(s)`);
				}
				if (anomalySweep.dropped > 0) {
					this.log(`anomaly sweep: ${anomalySweep.dropped} alert(s) had no recipient (dropped)`);
				}
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				this.log(`anomaly sweep error: ${detail}`);
			}
		}
		const batonSweep = this.batonSweep.tick();
		if (!batonSweep.ok) {
			this.log(`baton sweep error: ${batonSweep.code}: ${batonSweep.message}`);
		} else if (batonSweep.value.alerts > 0) {
			this.log(`baton sweep: pushed ${batonSweep.value.alerts} holder alert(s)`);
		}

		const processSnapshot = this.ports.processSnapshot?.();
		for (const d of this.index.pending()) {
			if (!daemonOwnsDelivery(d.harness ?? "pi", d.deliveryMode)) continue; // pi/pull self-drive
			try {
				const drive = this.drives.get(d.id) ?? {};
				this.drives.set(d.id, drive);
				const out = driveSession(
					d,
					drive,
					this.ports,
					this.registry,
					this.channel,
					undefined, // self-injection is marked by the port wrapper, post-send
					this.log,
				);
				if (out.kind === "held-by-pane-input") {
					// Never silent: say it once when it starts, and the eventual
					// `failed` outcome below reports the terminal reason.
					if (out.first) {
						this.log(
							`boot ${d.id}: init line HELD — live human input in pane ${d.paneId}; ` +
								`retrying, will fail in ${Math.round(INIT_HELD_TIMEOUT_MS / 1000)}s if it persists`,
						);
					}
				}
				if (out.kind !== "waiting" && out.kind !== "boot" && out.kind !== "held-by-pane-input") {
					const extra =
						out.kind === "bound"
							? ` ↔ ${out.harnessSessionId}`
							: out.kind === "failed"
								? ` (${out.reason})`
								: out.kind === "dismissed" || out.kind === "answered" || out.kind === "needs-human"
									? ` (${out.label})`
									: "";
					this.log(`spawn ${d.id}: ${out.kind}${extra}`);
				}
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				this.log(`session ${d.id} tick error: ${detail}`);
			}
		}

		for (const d of this.index.all()) {
			try {
				// `--once` agent peer that has pushed its report → close its pane + drop its
				// descriptor (T008 / AC-16). `planOnceClose` is true ONLY for `agentOnce &&
				// reportedAt`, so a resident peer, an un-reported once peer, and every plain
				// (non-agent) colleague are left untouched — the stalled/dead watchdog below
				// is unchanged. The report is already durable in the spawner's inbox before
				// `reportedAt` is stamped (T007), so closing the reporter never loses it.
				if (planOnceClose(d)) {
					const closeIntent = {
						actor: "pij-daemon",
						kind: "once-close" as const,
						requestedAt: new Date(this.ports.now()).toISOString(),
					};
					// Intent is durable before the owned pane teardown and dissolve.
					// "close": the once-close IS the terminal-truth authority here.
					this.registry.write({ ...d, closeIntent }, "close");
					if (d.paneId) this.ports.killPane(d.paneId);
					const observedAt = new Date(this.ports.now()).toISOString();
					this.registry.write(
						{
							...d,
							closeIntent,
							terminal: { disposition: "requested", observedAt, evidence: "pane-missing" },
							deathNoticeLatchedAt: observedAt,
						},
						"close",
					);
					this.registry.dissolve(d.id);
					this.drives.delete(d.id);
					this.pushed.delete(d.id);
					this.watchdogStalled.delete(d.id);
					this.paneSig.delete(d.id);
					this.watchManager.disposeSession(d.id);
					this.watchdogManager.disposeSession(d.id);
					this.log(
						`close ${d.id}: once-mode agent peer reported → pane killed + descriptor dissolved`,
					);
					continue;
				}
				let current = d;
				// Delivery is daemon-owned ONLY for bound tmux harnesses (claude/copilot).
				// pi self-drives its inbox via its in-process receiver, so it is excluded
				// from flush/drain/observe — the daemon must never touch a pi inbox.
				const owns =
					current.lifecycle === "bound" &&
					daemonOwnsDelivery(current.harness ?? "pi", current.deliveryMode);
				if (owns) {
					// Flush held sends only after the human composer releases. Busy is
					// intentionally absent from this condition.
					if (
						current.paneId &&
						!refreshRenderedComposerHold(
							current.paneId,
							this.ports,
							this.buffer,
							this.composerHolds,
						) &&
						this.buffer.pending(current.id) > 0
					) {
						const flushed = this.buffer.flush(current.id, this.ports.now(), current.paneId);
						for (let index = 0; index < flushed.length; index++) {
							const message = flushed[index];
							if (!message) continue;
							if (
								refreshRenderedComposerHold(
									current.paneId,
									this.ports,
									this.buffer,
									this.composerHolds,
								)
							) {
								for (const remaining of flushed.slice(index)) {
									this.buffer.enqueue(remaining.messageId, remaining.message);
								}
								break;
							}
							this.watchdogManager.beforeTmuxInject(current.id, message.message, this.ports.now());
							const injectedText = flushedText(message.message);
							const outcome = this.ports.sendText(
								current.paneId,
								injectedText,
								current.harness,
								current.pid,
							);
							if (outcome === "gone") {
								// Pane is gone: stop this batch and do NOT requeue. The seat is
								// unbound by the `sendText` gate, and every message stays unread
								// on disk so a revived seat still receives it.
								break;
							}
							if (outcome === "held" || outcome === "failed") {
								// `held`: the human started typing between the gate and the
								// send. `failed`: the send threw before submission. Either way
								// nothing landed — put this message and the rest of the batch
								// back, UNCONSUMED (plan 071 D7).
								for (const remaining of flushed.slice(index)) {
									this.buffer.enqueue(remaining.messageId, remaining.message);
								}
								break;
							}
							const marked = this.channel.markRead(current.id, message.messageId, {
								messageId: message.messageId,
								readAt: new Date(this.ports.now()).toISOString(),
								reader: current.id,
							});
							if (!marked.ok) throw new Error(`${marked.code}: ${marked.message}`);
							this.emitSendReceipt(current.id, message.message.from, message.messageId, outcome);
						}
					}
					// Persist footer activity → working|idle (+ fresh last-activity ts) so
					// `pij state`/`list` report real liveness instead of `idle · never`
					// (control-plane peers write no pij events). Writes only on a change.
					if (current.paneId) {
						const pane = this.paneFrameThisTick(current.paneId);
						const readiness = classifyReadiness(pane);
						let updated = observeActivity(current, readiness, this.ports.now());
						// Pane-content heartbeat: while WORKING, treat any visible change since
						// last tick as activity — refresh lastEventAt. `observeActivity` only
						// refreshes on a `busy` footer, but a deep-think / long-tool xhigh peer
						// renders streaming reasoning or scrolling tool output that classifies as
						// `booting` (no footer marker); its pane is still CHANGING, so this keeps
						// its liveness fresh and stops the stall watchdog false-firing (SUGG-002).
						const prevSig = this.paneSig.get(current.id);
						const paneChanged = prevSig !== undefined && pane !== prevSig;
						const effectiveState = updated?.state ?? current.state;
						const watchdogAttributedPaneChange =
							paneChanged &&
							this.watchdogManager.isPaneChangeWatchdogAttributed(current.id, pane, effectiveState);
						this.paneSig.set(current.id, pane);
						if (!watchdogAttributedPaneChange) {
							if (paneChanged && effectiveState === "working") {
								updated = {
									...(updated ?? current),
									lastEventAt: new Date(this.ports.now()).toISOString(),
								};
							}
						} else if (updated) {
							// `observeActivity` runs to derive the state edge, but watchdog-caused
							// pane movement must never move the descriptor's activity axis.
							updated = { ...updated, lastEventAt: current.lastEventAt };
						}
						if (updated) {
							// persistDaemonWrite re-reads + preserves a reportedAt stamped concurrently by
							// `pij agent report` between this tick's index rebuild and now, so the
							// activity write can't clobber the `--once` close latch (Finding 1). It
							// returns the merged descriptor so `current` (fed to the stall/dead push
							// below) also carries the preserved stamp.
							current = persistDaemonWrite(this.registry, updated);
							if (current.lifecycle === "dissolved") continue;
						}
						// Compact-window release (DL-004): clear the mark once the pane reads
						// ready again past a short grace (compaction done → drain resumes this
						// tick), or unconditionally once the mark is stale past COMPACT_MAX_MS
						// (a compact that died mid-window must never wedge the queue).
						if (current.compactingAt !== undefined) {
							const compactAgeMs = this.ports.now() - Date.parse(current.compactingAt);
							const compactDone =
								readiness === "ready" &&
								Number.isFinite(compactAgeMs) &&
								compactAgeMs >= COMPACT_GRACE_MS;
							const compactStale = !(compactAgeMs <= COMPACT_MAX_MS); // NaN-safe: NaN clears too
							if (compactDone || compactStale) {
								const { compactingAt: _compactingAt, ...cleared } = current;
								current = persistDaemonWrite(this.registry, cleared);
								if (current.lifecycle === "dissolved") continue;
								this.log(
									compactStale
										? `compact ${d.id}: mark stale (> ${COMPACT_MAX_MS}ms) — cleared, drain resumes`
										: `compact ${d.id}: pane ready — window over, drain resumes`,
								);
							}
						}
					}
					// Whole-life stalled/dead push (T012): detect transitions and push once
					// per transition to the creator. The latch (`this.pushed`) ensures each
					// transition (stalled, dead) fires exactly one creator notification. Pass
					// the JUST-OBSERVED snapshot (`current`), not the tick-start `d`, or the
					// stall check reads a stale state/lastEventAt and false-fires (SUGG-002).
					this.pushWholeLifeTransition(current);
				}
				// Provider-failure peek (FIX-A / DL-005) — read-only and HARNESS-AGNOSTIC
				// (pi INCLUDED). A spawned worker can sit idle on a fatal provider error
				// (quota/credit/auth/400) without ever dying or stalling, so the owned
				// branch above never sees it — and a pi worker never enters that branch at
				// all (no lifecycle/sendkeys). `capture-pane` is read-only, so pi keeps
				// owning its inbox, delivery, and self-written state — we only peek.
				const providerView = current.state === "working" ? current : d;
				if (providerView.paneId && noticeRecipient(providerView))
					this.pushProviderFailure(providerView);
				// Compact hold (DL-004): while the pane is compacting, do NOT drain —
				// messages stay durable-unread in the inbox (the queue), nothing is
				// marked read, and the sender's receipt stays `queued` until the
				// post-compact injection emits a real `delivered`.
				if (owns && !isCompacting(current, this.ports.now())) await this.drainInbox(current.id);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				this.log(`session ${d.id} tick error: ${detail}`);
			}
		}
		// Reconcile after descriptor activity/close paths have completed. A descriptor
		// dissolved mid-tick is therefore not announced as a terminal absence.
		const deathSweep = reconcileDeaths({
			descriptors: this.registry.list(),
			expectations: this.expectations.list(),
			nowIso: tickAt,
			isAlive: (pid) => this.ports.isAlive(pid),
			// ONE capture per sweep, never one per descriptor (s095 R2): at ~500
			// descriptors on a ~600ms tick a per-descriptor `ps` is ~500 process-table
			// spawns per tick, which stalls the tick and therefore message delivery.
			processSnapshot: processSnapshot,
			paneExists: (paneId) => !this.ports.isPaneDead(paneId),
			failureReasonFor: (descriptor) =>
				classifyDeathReason(descriptor.paneId ? this.paneFrameThisTick(descriptor.paneId) : ""),
			historical: this.deathSweepIsHistorical,
		});
		this.deathSweepIsHistorical = false;
		// "close": the death reconciler observes a dead pane and classifies it — that
		// IS terminal truth, the same authority `pij close` exercises.
		for (const update of deathSweep.descriptorUpdates) this.registry.write(update, "close");
		for (const update of deathSweep.expectationUpdates) this.expectations.write(update);
		const deathDelivery = resolveDeathNotices(
			deathSweep.noticeCandidates,
			this.noticeRegistryView(),
			deathSweep.deadIds,
		);
		for (const notice of deathDelivery.notices) {
			this.channel.deliver({ from: notice.from, to: notice.to, body: notice.text });
		}
		// One line instead of N undeliverable pushes. A host reboot kills every seat
		// in the same event, so the obituaries are all addressed to seats that died
		// alongside their subject — the operator wants the COUNT, not 200 messages
		// nobody can read (task #34).
		for (const line of deathDelivery.withheldNoticeLines) this.log(line);
		const suppressedWithoutDetail =
			deathDelivery.noticesSuppressed - deathDelivery.withheldNoticeLines.length;
		if (suppressedWithoutDetail > 0) {
			this.log(
				`death sweep: ${suppressedWithoutDetail} notice(s) withheld — recipient is dead too (terminal truth still recorded on each descriptor)`,
			);
		}
		this.watchdogManager.reconcile(this.registry.list());
		this.projectWatchdogScheduler(tickAt);
		this.sweepArchive();
		this.pruneArchive();
		// Every tick, unconditionally. Tick duration IS delivery latency for the
		// tick-driven path, and on 2026-07-25 it silently grew to ~19s with nothing
		// in the log to show it — the fleet felt it before anyone could measure it.
		this.log(`tick: ${Date.now() - tickStartedAtMs}ms, ${this.index.all().length} live`);
	}

	private retireForClosedRecipients(): void {
		const closedRecipients = new Set<string>();
		for (const descriptor of this.registry.listTerminal()) {
			if (
				descriptor.lifecycle !== "dissolved" ||
				descriptor.revivePendingAt !== undefined ||
				descriptor.closeIntent === undefined ||
				descriptor.terminal?.disposition !== "requested"
			) {
				continue;
			}
			closedRecipients.add(descriptor.id);
		}
		if (closedRecipients.size === 0) return;

		const queue = sqliteOf(this.channel);
		const dispatchStore = new FsDispatchStore(this.pijHome);
		const spineLog = this.dispatchSpineLog ?? new FsSpineLog(this.pijHome);
		const dispatches = dispatchStore.list();
		for (const to of closedRecipients) {
			if (queue !== undefined) {
				const result = queue.retire({ to }, "recipient-closed");
				if (result.retired > 0) {
					this.log(`retire ${to}: ${result.retired} open deliveries retired (recipient closed)`);
				}
			}
			let retiredDispatches = 0;
			for (const previous of dispatches) {
				if (previous.to !== to || !isOpenDispatch(previous)) continue;
				const transitionAt = new Date(this.ports.now()).toISOString();
				const next = retireDispatch(previous, {
					reason: "recipient-closed",
					actor: "daemon",
					ts: transitionAt,
				});
				if (!next.ok) throw new Error(`${next.code}: ${next.message}`);
				const written = dispatchStore.write(next.value);
				if (!written.ok) throw new Error(`${written.code}: ${written.message}`);
				const noted = spineLog.append({
					schema_version: 1,
					ts: transitionAt,
					actor: "daemon",
					kind: "dispatch-retired",
					refs: [
						`dispatch:${previous.id}`,
						"reason:recipient-closed",
						`prior-state:${previous.state}`,
					],
					peer: previous.to,
					prev: canonicalDispatchJson(previous),
					next: canonicalDispatchJson(next.value),
				});
				if (!noted.ok) {
					this.log(
						`retire ${previous.id}: dispatch retired but spine note failed (${noted.code}: ${noted.message})`,
					);
				}
				retiredDispatches += 1;
			}
			if (retiredDispatches > 0) {
				this.log(`retire ${to}: ${retiredDispatches} open dispatches retired (recipient closed)`);
			}
		}
	}

	/** Delivery, decoupled from the tick (plan 071 D2).
	 *
	 *  Delivery used to ride INSIDE `tick()`, so tick duration WAS delivery
	 *  latency: when the registry scan grew to ~19s on 2026-07-25, every message
	 *  waited that long. This pass runs on its own fast timer
	 *  ({@link DELIVERY_PASS_MS}) and does one thing — get pending mail into panes.
	 *  The tick keeps its own drain as RECONCILIATION, so a seat missed here (bound
	 *  since the last index rebuild, mid-compact, momentarily held) still drains.
	 *
	 *  Deliberately a poll, not `fs.watch`. This codebase already paid for that
	 *  lesson and wrote it down in `adapters/channel.ts`: the live inbox watchers
	 *  DROPPED fs.watch because FSEvents costs ~0.6–1.6s per handle to open and
	 *  drops events SILENTLY under load — precisely when a busy seat most needs
	 *  delivery. A fixed-cadence pass instead gives a LOAD-INDEPENDENT SLA, which
	 *  is the property the brief actually asks for ("sub-second delivery to an idle
	 *  pane"), and it is the same choice `POLL_PRIMARY_DELIVERY_MS` already makes
	 *  for pi seats.
	 *
	 *  Reads the in-memory index rather than the registry: a registry scan at this
	 *  cadence would re-create the cost this pass exists to escape. A seat bound
	 *  within the last tick therefore waits one tick for its first delivery — the
	 *  tick's own drain covers exactly that case. */
	async deliverPass(): Promise<void> {
		if (this.deliveringNow) return; // never re-enter
		this.deliveringNow = true;
		try {
			const seats = this.index.all().filter((d) => {
				if (d.lifecycle !== "bound") return false;
				if (!daemonOwnsDelivery(d.harness ?? "pi", d.deliveryMode)) return false;
				if (!d.paneId) return false;
				// Same hold the tick honours: input injected mid-compaction is eaten by
				// the harness's fresh-context reset, so mail stays durable-unread.
				return !isCompacting(d, this.ports.now());
			});
			// Seats drain concurrently (a socket await on one seat must not delay
			// another); within a seat the drain is sequential, so order holds.
			await Promise.all(
				seats.map(async (d) => {
					try {
						await this.drainInbox(d.id);
					} catch (error) {
						const detail = error instanceof Error ? error.message : String(error);
						this.log(`delivery pass ${d.id}: ${detail}`);
					}
				}),
			);
		} finally {
			this.deliveringNow = false;
		}
	}

	/** Two-tier janitor (plan 071 D1): move terminal records past the 48h window
	 *  out of the hot tier, so the hot scan stays O(live).
	 *
	 *  Throttled to {@link ARCHIVE_SWEEP_INTERVAL_MS} rather than run per tick: the
	 *  policy window is 48 hours, so sub-minute precision buys nothing and the
	 *  sweep's own readdir would just be more per-tick cost. The daemon is the
	 *  SINGLE WRITER for archival moves — no CLI path ever calls this. */
	/** Delete the wreckage of archived records past {@link ARCHIVE_PRUNE_AFTER_MS},
	 *  keeping their index tombstone (pij#183, Jordan-ruled 90 days).
	 *
	 *  Unlike the orphaned-tap sweep, THIS IS A POLICY, not a one-directional
	 *  interlock: removing the age check would delete a DIFFERENT set, not merely a
	 *  larger one, so it inherits whatever its anchor is wrong about. That is why it
	 *  rides on the pij#204 death anchor rather than on a file mtime, and why it
	 *  says out loud what it removed. */
	private pruneArchive(): void {
		const registry = this.registry;
		if (!(registry instanceof FsRegistry)) return;
		const nowMs = this.ports.now();
		if (
			this.lastArchivePruneMs !== undefined &&
			nowMs - this.lastArchivePruneMs < ARCHIVE_PRUNE_INTERVAL_MS
		) {
			return;
		}
		this.lastArchivePruneMs = nowMs;
		try {
			const { pruned, bytes } = registry.prunePrunableArchive(nowMs);
			if (pruned > 0) {
				this.log(
					`archive prune: removed ${pruned} record(s) past ${Math.round(ARCHIVE_PRUNE_AFTER_MS / 86_400_000)}d, ${Math.round(bytes / 1_048_576)}MB — index tombstones kept`,
				);
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.log(`archive prune: error ${detail}`);
		}
	}

	private sweepArchive(): void {
		if (!this.registry.sweepArchivable) return;
		const nowMs = this.ports.now();
		if (
			this.lastArchiveSweepMs !== undefined &&
			nowMs - this.lastArchiveSweepMs < ARCHIVE_SWEEP_INTERVAL_MS
		) {
			return;
		}
		this.lastArchiveSweepMs = nowMs;
		try {
			const swept = this.registry.sweepArchivable(nowMs);
			if (swept.archived > 0) this.log(`archive sweep: moved ${swept.archived} terminal record(s)`);
			// Never silent: a refused move means a conflicting half-archive on disk,
			// which a human has to look at.
			if (swept.skipped > 0) {
				this.log(`archive sweep: ${swept.skipped} record(s) SKIPPED (conflicting archive state)`);
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.log(`archive sweep error: ${detail}`);
		}
	}

	/** Detect and push stalled/dead transitions for a bound session. The push
	 *  lives HERE (impure: it holds the delivery port) — NOT in `observeActivity`
	 *  (pure, returns null for non-busy/ready, has no delivery port). One push per
	 *  transition, latched by `this.pushed`. */
	private pushWholeLifeTransition(d: SessionDescriptor): void {
		if (!noticeRecipient(d)) return; // no current or historical creator to notify
		// A safety-exempted peer is intentionally idle on standby, so its silence is
		// expected and must generate NO watchdog traffic in either direction. The
		// watchdog's own path honours that via `isFireDue`; this detector derives
		// `stalled` independently from descriptor state + event age, so it has to ask.
		// Without this it kept notifying the owner about a peer they had already told
		// pij to leave alone (3 stall notices in ~13 min, live).
		if (this.watchdogManager.isExempt(d.id)) return;
		const latch = this.pushed.get(d.id) ?? new Set<PushedTransition>();
		this.pushed.set(d.id, latch);

		// Terminal absence is reconciled after all tick-local activity/teardown paths.
		// A live PID with provider text is intentionally not terminal here.
		if (!this.ports.isAlive(d.pid)) return;

		// Stalled: `state === "working"` (daemon's descriptor vocab) + event age past stale.
		// Note: `isStalled` uses SessionState ("in-progress"|"reviewing") which is different
		// from the daemon's descriptor state ("working"|"idle") — compare directly.
		const ageMs = d.lastEventAt ? this.ports.now() - Date.parse(d.lastEventAt) : null;
		const isWorking = d.state === "working";
		const staleAge = ageMs === null || ageMs > STALE_AFTER_MS;
		const stalled = isWorking && staleAge;
		if (stalled && !latch.has("stalled")) {
			latch.add("stalled");
			// Persist failureReason so pij state/list --json surface the machine-stable reason (FIX-4).
			const persisted = persistDaemonWrite(this.registry, { ...d, failureReason: "stalled" });
			if (persisted.lifecycle === "dissolved") return;
			const recipient = this.lifecycleNoticeRecipient("stalled", persisted);
			const note = buildStalledNotice(persisted, recipient);
			if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
			this.log(`push ${d.id}: stalled`);
		} else if (
			!stalled &&
			!this.watchdogStalled.has(d.id) &&
			(latch.delete("stalled") || d.failureReason === "stalled")
		) {
			persistDaemonWrite(this.registry, { ...d, failureReason: undefined });
			this.log(`push ${d.id}: legacy stalled cleared on recovery`);
		}
	}

	/** Watchdog derivation shares the same `stalled` latch as the legacy
	 * whole-life detector, so either detector may win but an episode pushes once. */
	private pushWatchdogResponse(event: WatchdogResponseEvent): void {
		const d = this.registry.read(event.session.id) ?? event.session;
		const latch = this.pushed.get(d.id) ?? new Set<PushedTransition>();
		this.pushed.set(d.id, latch);
		if (event.response === "responsive") {
			this.watchdogStalled.delete(d.id);
			if (latch.delete("stalled") || d.failureReason === "stalled") {
				persistDaemonWrite(this.registry, { ...d, failureReason: undefined });
				this.log(`push ${d.id}: watchdog stalled cleared on recovery`);
			}
			return;
		}
		if (event.response !== "stalled") return;
		this.watchdogStalled.add(d.id);
		if (latch.has("stalled")) return;
		latch.add("stalled");
		const persisted = persistDaemonWrite(this.registry, { ...d, failureReason: "stalled" });
		if (persisted.lifecycle === "dissolved") return;
		const recipient = this.lifecycleNoticeRecipient("stalled", persisted);
		const note = buildStalledNotice(persisted, recipient);
		if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
		this.log(`push ${d.id}: watchdog stalled`);
	}

	/** Read-only provider-failure peek (FIX-A / DL-005). For ANY spawned, paned
	 *  session — **pi INCLUDED** — capture the pane and, if it shows a positively-
	 *  identified terminal provider error (quota/credit, auth, or model 400), push
	 *  ONE notice to the creator and persist `failureReason`. This covers the
	 *  motivating Case-3 gap: a worker that registers, hits a fatal provider error,
	 *  then sits idle (pid alive, never stalled) is invisible to the dead/stalled
	 *  branches — and a pi worker never reaches them at all. `capture-pane` is
	 *  read-only, so pi keeps owning its inbox, delivery, and self-written state;
	 *  this only PEEKS. "unknown" (no recognisable pattern, e.g. "Retrying…") never
	 *  fires. Dead sessions are left to `pushWholeLifeTransition`'s dead branch.
	 *  Latched once per session via the shared `this.pushed`. */
	private pushProviderFailure(d: SessionDescriptor): void {
		// DECIDED, not accidental (s070): this path deliberately does NOT consult
		// `watchdog exempt`, unlike the stall detector above. Exempt means "this peer
		// is intentionally idle, stop nagging me about SILENCE". A provider failure is
		// not silence — it is a real, actionable fault, and it stays actionable while
		// a peer is on standby. Swallowing a quota/auth/model-400 failure because
		// someone exempted the peer would be a worse bug than the notification noise
		// s070 set out to fix. `staleAge` is only the trigger for LOOKING; the notice
		// fires on positively-identified provider-error evidence in the pane, never on
		// silence alone. A test pins this so it cannot be "fixed" by accident.
		if (!noticeRecipient(d) || !d.paneId) return; // no recipient / no pane to peek
		if (d.lifecycle === "pending") return; // mid-bind → driveSession owns it (its bad-model detect fails it)
		if (!this.ports.isAlive(d.pid)) return; // dead → handled by the dead branch
		const latch = this.pushed.get(d.id) ?? new Set<PushedTransition>();
		this.pushed.set(d.id, latch);
		const isWorking = d.state === "working";
		const providerFailureReason =
			d.failureReason === "quota" ||
			d.failureReason === "auth" ||
			d.failureReason === "model-not-supported";
		if (isWorking) {
			const hadProviderFailureLatch = latch.delete("provider-failure");
			if (providerFailureReason || hadProviderFailureLatch) {
				const { failureReason: _failureReason, ...recovered } = d;
				persistDaemonWrite(this.registry, recovered);
				this.log(`push ${d.id}: provider-failure cleared on recovery`);
			}
			return;
		}
		const ageMs = d.lastEventAt ? this.ports.now() - Date.parse(d.lastEventAt) : null;
		const staleAge = ageMs === null || ageMs > STALE_AFTER_MS;
		if (!staleAge) return;
		if (latch.has("provider-failure")) return;
		const reason = classifyDeathReason(this.paneFrameThisTick(d.paneId));
		const isFatal = reason === "quota" || reason === "auth" || reason === "model-not-supported";
		if (!isFatal) return;
		latch.add("provider-failure");
		const persisted = persistDaemonWrite(this.registry, { ...d, failureReason: reason });
		if (persisted.lifecycle === "dissolved") return;
		const recipient = this.lifecycleNoticeRecipient("dead", persisted);
		const note = buildDeadNotice(persisted, reason, { authoritativeDeath: false }, recipient);
		if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
		this.log(`push ${d.id}: provider-failure (${reason})`);
	}

	private noticeRegistryView(): SessionDescriptor[] {
		return [...this.registry.listTerminal(), ...this.registry.list()];
	}

	private lifecycleNoticeRecipient(
		kind: "stalled" | "dead",
		descriptor: SessionDescriptor,
	): SessionId | null {
		const resolution = resolveNoticeRecipient(descriptor, this.noticeRegistryView());
		const line = noLiveNoticeRecipientLine(kind, descriptor, resolution);
		if (line) this.log(line);
		return resolution.recipient;
	}

	/** Read a bound tmux session's durable unread inbox, inject each user message,
	 *  then mark it read after the injection outcome. Receipt envelopes are
	 *  persisted as events before marking and are never injected. */
	private drainInbox(id: string): Promise<void> {
		// One drain per seat at a time: the delivery pass and the tick's reconciliation
		// drain both call here, and an awaited socket send must not be overtaken by a
		// second drain re-reading the same queued rows.
		if (this.draining.has(id)) return Promise.resolve();
		this.draining.add(id);
		return this.drainInboxLocked(id).finally(() => this.draining.delete(id));
	}

	private async drainInboxLocked(id: string): Promise<void> {
		const current = this.registry.read(id);
		if (current?.lifecycle === "dissolved") {
			if (!this.dissolvedDrainLogged.has(id)) {
				this.dissolvedDrainLogged.add(id);
				this.log(`route ${id}: skip dissolved recipient ${id}`);
			}
			return;
		}
		this.dissolvedDrainLogged.delete(id);
		const target = this.index.get(id);
		if (!target?.paneId) return;

		const nowMs = this.ports.now();
		const readAt = new Date(nowMs).toISOString();
		const prepared = prepareReceiptEnvelopes({
			inbox: this.channel,
			self: id,
			readAt,
		});
		if (!prepared.ok) {
			throw new Error(`${prepared.code}: ${prepared.message}`);
		}
		if (prepared.value.length > 0) {
			const eventLog = new FsEventLog(this.pijHome, id);
			for (const action of prepared.value) {
				const persisted = persistReceiptEnvelope({
					inbox: this.channel,
					eventLog,
					self: id,
					action,
					nowMs,
				});
				if (!persisted.ok) {
					throw new Error(`${persisted.code}: ${persisted.message}`);
				}
			}
		}

		// PoC: on the SQLite backend the daemon only acts on `queued` rows (a row
		// with a pointer out, or a socket send in flight, is `injected`/`claimed`
		// until acked or its lease expires); the fs backend keeps its unread scan.
		const sq = sqliteOf(this.channel);
		if (sq) sq.recoverStaleClaims();
		const listed = sq ? ok(sq.listQueued(id)) : this.channel.listUnread(id);
		if (!listed.ok) throw new Error(`${listed.code}: ${listed.message}`);
		const messages: Array<{
			messageId: string;
			from: SessionId;
			body: string;
			command?: string;
		}> = [];
		let watchdogPending = false;
		for (const message of listed.value) {
			if (message.kind === "receipt") continue;
			if (message.from === "pij-watchdog") {
				if (watchdogPending) {
					const marked = this.channel.markRead(id, message.messageId, {
						messageId: message.messageId,
						readAt,
						reader: id,
					});
					if (!marked.ok) throw new Error(`${marked.code}: ${marked.message}`);
					this.log(`watchdog ${id}: coalesced duplicate pending ping`);
					continue;
				}
				watchdogPending = true;
			}
			messages.push({
				messageId: message.messageId,
				from: message.from,
				body: message.body,
				command: message.command,
			});
		}
		if (messages.length === 0) return;
		let consumedCount = 0;
		let compactFired = false;
		for (const message of messages) {
			if (
				!refreshRenderedComposerHold(target.paneId, this.ports, this.buffer, this.composerHolds)
			) {
				this.watchdogManager.beforeTmuxInject(target.id, message, nowMs);
			}
			const consumed = await drainTmuxInbox(
				target,
				[message],
				this.ports,
				this.buffer,
				undefined, // self-injection is marked by the port wrapper, post-send
				this.composerHolds,
				{ pointer: sq !== undefined },
			);
			// A remote `/compact` just went into the pane: mark the compact window
			// (DL-004) so drain HOLDS until the pane reads ready again — the trigger
			// itself must go through, but anything injected behind it mid-compact
			// would be eaten by the harness's fresh-context reset.
			if (message.command === "compact" && consumed.some((item) => item.outcome !== undefined)) {
				const latest = this.registry.read(target.id);
				if (latest && latest.lifecycle !== "dissolved") {
					persistDaemonWrite(this.registry, {
						...latest,
						compactingAt: new Date(this.ports.now()).toISOString(),
					});
					this.log(`compact ${id}: remote /compact injected — holding drain until ready`);
					compactFired = true;
				}
			}
			for (const item of consumed) {
				if (item.via === "pointer" && sq) {
					// Told, not read: the body waits in the store for `pij inbox`. The
					// lease re-announces if the seat never pulls (review §7 AckWait).
					const seq = sq.seqOf(item.messageId);
					if (seq !== undefined) sq.settle(seq, "injected", { leaseMs: POINTER_LEASE_MS });
					this.buffer.forget(item.messageId);
					consumedCount += 1;
					continue;
				}
				const marked = this.channel.markRead(id, item.messageId, {
					messageId: item.messageId,
					readAt,
					reader: id,
				});
				if (!marked.ok) {
					throw new Error(`${marked.code}: ${marked.message}`);
				}
				// Delivered by THIS path — drop any buffered copy so a later flush
				// cannot inject it a second time (plan 071 D7). Buffered messages now
				// stay durably unread, so the drain can legitimately reach one first.
				this.buffer.forget(item.messageId);
				if (target.lifecycle === "bound" && item.outcome !== undefined) {
					this.emitSendReceipt(target.id, item.from, item.messageId, item.outcome);
				}
				consumedCount += 1;
			}
			// Stop this batch behind the compact trigger — the rest of the unread
			// queue stays durable and flushes once the window clears.
			if (compactFired) break;
		}
		if (consumedCount > 0) this.log(`route ${id}: injected ${consumedCount} message(s)`);
	}

	/** THIS TICK'S frame for one pane, captured at most once (pij#229).
	 *
	 *  Three answers, and the distinction between the last two is the whole point:
	 *
	 *   1. ALREADY CAPTURED this tick — return that frame, so every consumer in the
	 *      tick reasons about the same rendered frame. `refreshPaneSignals` already
	 *      made this argument for the caret tracker and the content gate; the
	 *      activity axis is simply a third consumer of it.
	 *   2. tmux LISTED the live panes this tick and this one is NOT among them —
	 *      the pane is gone. `capturePane` on a gone pane returns `""` (its own
	 *      catch), so this returns `""` WITHOUT forking. Same output, no
	 *      subprocess. Measured: 84 of 117 owned panes per tick are in this branch,
	 *      and a capture of a gone pane costs MORE than a live one (9.05ms vs
	 *      6.70ms), so the wasted majority is also the expensive majority.
	 *   3. NOTHING IS KNOWN — the signals pass did not run (its ports are optional),
	 *      so there is no live-pane list. Capture directly. A missing list must
	 *      never be read as "the pane is absent": that is the instrument's limit
	 *      rendered as the world's property, and it would report every pane on the
	 *      machine as gone in one tick. */
	private paneFrameThisTick(paneId: string): string {
		const captured = this.tickPaneCaptures.get(paneId);
		if (captured !== undefined) return captured;
		if (this.tickLivePanes !== undefined && !this.tickLivePanes.has(paneId)) {
			this.tickPaneCaptures.set(paneId, "");
			return "";
		}
		const pane = this.ports.capturePane(paneId);
		this.tickPaneCaptures.set(paneId, pane);
		return pane;
	}

	/** Project which seats the watchdog scheduler is actually tracking (s101).
	 *
	 *  `WatchdogManager.states` is private and in-memory, so "is this seat in the
	 *  scheduler?" was unanswerable from any command — the CLI is a different
	 *  process. Establishing it for ONE seat previously cost a prime 28 minutes of
	 *  deliberately withheld status cards, because the cadence we mandate is what
	 *  suppresses the trigger being measured.
	 *
	 *  WRITTEN ONLY WHEN THE CONTENT CHANGES. `nextDueAt` is an absolute stamp, so
	 *  the payload is stable across most reconciles and the steady-state cost is
	 *  ZERO. The alternative — stamping it on the per-seat sidecar, which already
	 *  exists — would be ~94 atomic writes per tick at current seat counts, and at
	 *  the 18.1ms/write this repo measured in pij#180 that is ~1.7s per tick,
	 *  against the 3.27s pij#181 and pij#229 removed. One file, one write, and only
	 *  when it says something new. */
	private projectWatchdogScheduler(tickAt: string): void {
		try {
			const sessions = this.watchdogManager.schedulerProjection();
			const fingerprint = JSON.stringify(sessions);
			if (fingerprint === this.lastSchedulerFingerprint) return;
			this.lastSchedulerFingerprint = fingerprint;
			writeJsonAtomic(
				join(this.pijHome, WATCHDOG_SCHEDULER_FILE),
				buildSchedulerProjection(sessions, tickAt),
			);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.log(`watchdog projection: error ${detail}`);
		}
	}

	/** Reclaim tap sinks no live pane owns (pij#183).
	 *
	 *  `detachPaneTap` already deletes a tap file — but only for a pane THIS daemon
	 *  process saw retire, because the path it deletes comes from an in-memory map
	 *  rebuilt empty on every start. So the deletion path is correct and its index
	 *  is ephemeral, while the garbage is durable: every tap whose pane retired
	 *  while the daemon was down is unreachable by any code path. Measured
	 *  2026-08-09: 185 orphans, 205 MB of the 244 MB in `pane-signals/`.
	 *
	 *  This reconciles the DIRECTORY against tmux's live pane list — the only
	 *  pairing where both sides outlive the process. Throttled like the archive
	 *  sweep: it is a disk-hygiene pass, not a per-tick obligation, and it costs a
	 *  `readdir` plus one `stat` per file. */
	private sweepOrphanedTaps(listings: readonly PaneListing[]): void {
		const nowMs = this.ports.now();
		if (this.lastTapSweepMs !== undefined && nowMs - this.lastTapSweepMs < TAP_SWEEP_INTERVAL_MS) {
			return;
		}
		this.lastTapSweepMs = nowMs;
		const dir = join(this.pijHome, "pane-signals");
		let files: string[];
		try {
			files = readdirSync(dir);
		} catch {
			return; // no tap directory yet — nothing to reclaim
		}
		const orphans = orphanedTapFiles({
			files,
			livePaneIds: listings.map((listing) => listing.paneId),
			modifiedAtMs: (file) => {
				try {
					return statSync(join(dir, file)).mtimeMs;
				} catch {
					return Number.NaN; // unreadable → fails the grace test → KEPT
				}
			},
			nowMs,
		});
		if (orphans.length === 0) return;
		let reclaimed = 0;
		let removed = 0;
		for (const file of orphans) {
			try {
				reclaimed += statSync(join(dir, file)).size;
				rmSync(join(dir, file), { force: true });
				removed += 1;
			} catch {
				// A tap that vanished under us is the outcome we wanted anyway.
			}
		}
		if (removed > 0) {
			this.log(
				`tap sweep: reclaimed ${removed} orphaned pane tap(s), ${Math.round(reclaimed / 1024)}KB`,
			);
		}
	}

	/** Read-only signal surface for a future UI. Busy is deliberately not a
	 * delivery gate; callers can inspect it without changing daemon behaviour. */
	paneSignal(paneId: string): PaneSignalSnapshot | undefined {
		return this.paneSignals.snapshot(paneId, this.ports.now());
	}

	private refreshPaneSignals(): void {
		if (
			!this.ports.listPanes ||
			!this.ports.attachPaneTap ||
			!this.ports.drainPaneTap ||
			!this.ports.detachPaneTap
		) {
			return;
		}
		const allListings = this.ports.listPanes();
		// tickLivePanes stays the FULL server set — death detection asks "is this
		// pane still alive", which is a fact about the server, not about ownership.
		this.tickLivePanes = new Set(allListings.map((listing) => listing.paneId));
		// PoC day-2 item 7: only ever `pipe-pane`/tap panes THIS daemon owns (a
		// registered, non-dissolved seat). The old code tapped EVERY pane in the
		// tmux server, so a second daemon on a shared server stole the first's
		// taps — the isolation hazard the review flagged (§11). Filtering here
		// (rather than in the adapter) keeps the tap surface exactly the fleet.
		const ownedPaneIds = new Set<string>();
		for (const d of this.index.all()) {
			if (d.paneId && d.lifecycle !== "dissolved") ownedPaneIds.add(d.paneId);
		}
		const listings = allListings.filter((listing) => ownedPaneIds.has(listing.paneId));
		const diff = this.paneSignals.reconcile(listings);
		this.sweepOrphanedTaps(listings);
		for (const pane of diff.added) {
			const safePane = pane.paneId.replaceAll(/[^A-Za-z0-9_-]/g, "_");
			this.ports.attachPaneTap(pane.paneId, join(this.pijHome, "pane-signals", `${safePane}.raw`));
		}
		// One capture per pane per tick, shared by the caret tracker and the
		// content gate so both reason about the same rendered frame.
		const captured = new Map<string, string>();
		for (const paneId of this.paneSignals.paneIds()) {
			const bytes = this.ports.drainPaneTap(paneId);
			if (bytes.byteLength > 0) this.paneSignals.ingest(paneId, bytes, this.ports.now());
			const pane = this.ports.capturePane(paneId);
			captured.set(paneId, pane);
			// Publish this pane's frame for every other consumer in THIS tick
			// (pij#229) — the drive loop's activity axis reads it instead of taking
			// its own later capture of the same pane.
			this.tickPaneCaptures.set(paneId, pane);
			this.paneSignals.observeRenderedComposer(paneId, pane, this.ports.now());
		}
		this.paneSignals.tick(this.ports.now());
		for (const paneId of this.paneSignals.paneIds()) {
			const signal = this.paneSignals.snapshot(paneId, this.ports.now());
			if (!signal) continue;
			// Keep the content gate current between sends; when it recognises the
			// layout it OVERRIDES the caret tracker, which is the unknown-layout path.
			const verdict = this.composerHolds.observe(
				paneId,
				renderedComposerPayload(captured.get(paneId) ?? ""),
				this.ports.now(),
			);
			const userTyping = verdict.deferred ? signal.userTyping : verdict.hold;
			const lastActivityAt = verdict.deferred
				? signal.lastKeyAt
				: verdict.hold
					? (verdict.lastChangeAt ?? this.ports.now())
					: undefined;
			this.buffer.setPaneSignal(paneId, {
				busy: signal.busy,
				userTyping,
				...(lastActivityAt === undefined ? {} : { lastActivityAt }),
			});
		}
		for (const paneId of diff.retired) {
			this.ports.detachPaneTap(paneId);
			this.buffer.forgetPane(paneId);
			this.composerHolds.forget(paneId);
		}
	}

	private emitSendReceipt(
		peer: string,
		sender: string,
		messageId: string,
		outcome: SendOutcome,
	): void {
		if (!this.registry.read(sender)) return;
		// Honest mapping: ONLY a positively observed submission earns `delivered`.
		// Text that was typed but never confirmed submitted (the swallowed-Enter
		// wedge, plan 127) reports `unverified` — never `delivered`.
		//
		// Precondition, and the reason two receipt words are enough: the callers only
		// reach here for `confirmed`/`unverified`. `gone` returns early and `held`/
		// `failed` requeue the message UNCONSUMED (plan 071 D7), so the outcomes where
		// nothing landed never produce a receipt at all.
		const state = outcome === "confirmed" ? "delivered" : "unverified";
		this.channel.deliver({
			from: peer,
			to: sender,
			body: receiptBody(messageId, state),
			kind: "receipt",
		});
	}

	dispose(): void {
		for (const paneId of this.paneSignals.paneIds()) this.ports.detachPaneTap?.(paneId);
		this.bridgeSupervisor?.dispose();
		this.watchManager.disposeAll();
		this.watchdogManager.disposeAll();
	}
}

export interface DaemonOptions {
	readonly pijHome?: string;
	readonly tickMs?: number;
	/** Delivery-pass cadence (plan 071 D2); defaults to {@link DELIVERY_PASS_MS}. */
	readonly deliveryMs?: number;
	readonly log?: (line: string) => void;
}

/** Heartbeat rider (#40 Defect 2): stamp the daemon.lock mtime `now` so downstream
 *  liveness checks that stat the lock stop reading the hours-old STARTUP mtime as
 *  "daemon stale". Called from the tick loop ONLY after a tick that did not throw.
 *  Safe: the lock mtime is diagnostics-only — `evaluateLock` decides purely on pid
 *  liveness — so refreshing it cannot affect single-instance reclaim. Best-effort:
 *  a touch failure (the lock racing teardown, an unwritable path) is swallowed and
 *  never breaks the loop; liveness is advisory, delivery is not. */
export function touchDaemonHeartbeat(lockPath: string, at: Date = new Date()): void {
	try {
		utimesSync(lockPath, at, at);
	} catch {
		/* lock gone / unwritable — liveness is best-effort */
	}
}

/** Acquire the single-instance lock (AC-10) and run the tick loop. Returns a
 *  stop() disposer (clears the timer + releases the lock). Throws if a live
 *  daemon already holds the lock (the caller prints + exits). */
export function runDaemon(opts: DaemonOptions = {}): () => void {
	const pijHome = opts.pijHome ?? resolvePijHome();
	const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
	const proc = new NodeProcess();
	const lockPath = join(pijHome, "daemon.lock");

	// When pij auto-started us, it created our tmux window and set PIJ_DAEMON_OWNED.
	// Record that window id (resolved from our own $TMUX_PANE) in the lock so
	// `pij daemon stop` can tear down the window it owns — and ONLY that one (a
	// human-started daemon has no PIJ_DAEMON_OWNED, so its window is never killed).
	let ownedWindow: string | undefined;
	if (process.env.PIJ_DAEMON_OWNED === "1" && process.env.TMUX_PANE) {
		try {
			ownedWindow = execFileSync(
				"tmux",
				["display-message", "-p", "-t", process.env.TMUX_PANE, "#{window_id}"],
				{ encoding: "utf8" },
			).trim();
		} catch {
			/* not resolvable → leave unset (stop just won't kill a window) */
		}
	}

	// Atomic acquire (review M2): `wx` = O_CREAT|O_EXCL, so two daemons racing
	// can't both "win" a stale-lock read. On EEXIST, evaluate the holder: a live
	// one → refuse; a dead one → reclaim (unlink + retry the exclusive create).
	// The checkout this process is about to execute (s101). ONE `git rev-parse` at
	// boot — measured at 8ms — against a boot that already writes a lock, acquires
	// it under `wx`, resolves its tmux window and sweeps stale temp packs. Recorded
	// because ONLY THE BOOTING PROCESS KNOWS IT: minutes later the tree may have
	// moved, and then nothing on disk can say what is actually running.
	let bootHead: string | undefined;
	try {
		bootHead = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd: dirname(fileURLToPath(import.meta.url)),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 2_000,
		}).trim();
	} catch {
		bootHead = undefined; // not a checkout / no git → readers render UNKNOWN
	}
	const lockBody = serializeLockFile({
		pid: process.pid,
		startedAt: new Date().toISOString(),
		...(ownedWindow ? { window: ownedWindow } : {}),
		...(bootHead ? { head: bootHead } : {}),
	});
	// FIRST RUN: on a fresh install nothing has created PIJ_HOME yet, so the lock
	// write below — the daemon's very first filesystem write — dies with ENOENT
	// before anything can report why (pij#118). Invisible to every developer,
	// because their ~/.pij already exists. `dirname(lockPath)`, not `pijHome`:
	// with PIJ_HOME="" the lock is the cwd-relative "daemon.lock", where dirname
	// is "." (a no-op) but mkdirSync("") would itself throw ENOENT.
	mkdirSync(dirname(lockPath), { recursive: true });
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			writeFileSync(lockPath, lockBody, { flag: "wx" });
			break; // acquired
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
			let existing: ReturnType<typeof parseLockFile> = null;
			try {
				existing = parseLockFile(readFileSync(lockPath, "utf8"));
			} catch {
				existing = null;
			}
			const decision = evaluateLock(existing, (pid) => proc.isAlive(pid), process.pid);
			if (decision.kind === "refuse") {
				throw new Error(
					`pij daemon already running (pid ${decision.holderPid}); refusing second instance`,
				);
			}
			// acquire (our own pid) or reclaim (dead holder) → clear and retry wx.
			if (decision.kind === "reclaim")
				log(`reclaiming stale daemon lock (dead pid ${decision.stalePid})`);
			rmSync(lockPath, { force: true });
		}
	}

	const channel = openChannel(pijHome);
	const registry = createDaemonRegistry(pijHome, log);
	const sqlite = sqliteOf(channel);
	if (sqlite) {
		// First-start fs→sqlite migration (Amendment 4): carry any unread fs inbox
		// mail into the queue before delivery begins. Idempotent — a second start
		// imports nothing. The fs files stay in place (rollback-safe).
		const migrated = migrateFsInboxes(pijHome, sqlite, () => {
			const ids = new Set<string>();
			for (const d of registry.list()) ids.add(d.id);
			try {
				for (const name of readdirSync(pijHome)) {
					if (existsSync(join(pijHome, name, "inbox"))) ids.add(name);
				}
			} catch {
				/* pijHome unreadable → registry set only */
			}
			return [...ids];
		});
		// A claim without a live daemon is meaningless: put every in-flight row
		// back to `queued` so a crash between claim and inject redelivers.
		const reset =
			channel instanceof SqliteQueue ? channel.resetClaimsOnStart() : sqlite.resetClaimsOnStart();
		const backendName = channel instanceof SqliteQueue ? "sqlite" : "dual (sqlite+fs mirror)";
		log(
			`queue backend: ${backendName} (${sqlite.dbPath})` +
				(migrated.imported > 0
					? ` — migrated ${migrated.imported} fs message(s) from ${migrated.seats} seat(s)`
					: "") +
				(reset > 0 ? ` — re-queued ${reset} in-flight message(s)` : ""),
		);
	} else {
		log("queue backend: fs (per-message JSON inbox files)");
	}
	const bridgeSpine = new FsSpineLog(pijHome);
	const bridgeCaptures = new FsWatchdogStore(pijHome);
	const bridgeSupervisor = bridgeSupervisorForDaemon(pijHome, {
		now: () => Date.now(),
		log,
		note: (message) => {
			const built = buildSpineEvent({
				nowMs: Date.now(),
				actor: "pij-daemon",
				kind: "telegram-bridge-restarted",
				peer: TELEGRAM_PEER_ID,
				refs: ["supervision", "restart"],
				next: message,
			});
			if (!built.ok) {
				log(`telegram: restart spine note invalid — ${built.message}`);
				return;
			}
			const appended = bridgeSpine.append(built.value);
			if (!appended.ok) log(`telegram: restart spine note failed — ${appended.message}`);
		},
		notifyOwner: (message) => {
			const owners = registry
				.list()
				.filter(
					(descriptor) =>
						descriptor.prime === true &&
						descriptor.lifecycle !== "dissolved" &&
						descriptor.lifecycle !== "failed",
				);
			if (owners.length !== 1) {
				log(
					`telegram: restart owner notice skipped — expected one live prime, found ${owners.length}`,
				);
				return;
			}
			const owner = owners[0];
			if (!owner) return;
			let captureText = message;
			try {
				captureText += `\n\n${readFileSync(join(pijHome, "telegram-bridge.log"), "utf8").slice(-4096)}`;
			} catch (error) {
				log(`telegram: restart capture has no bridge log tail — ${(error as Error).message}`);
			}
			try {
				const capture = bridgeCaptures.writeCapture(
					owner.id,
					TELEGRAM_PEER_ID,
					Date.now(),
					captureText,
				);
				// Direct delivery is intentional: the bridge is relay/exempt, but an
				// infrastructure restart must still reach its owner.
				const delivered = channel.deliver({
					from: TELEGRAM_PEER_ID,
					to: owner.id,
					body: `⚠️ ${message}. Capture: ${capture}`,
				});
				if (!delivered.ok) log(`telegram: restart owner notice failed — ${delivered.message}`);
			} catch (error) {
				log(`telegram: restart owner capture failed — ${(error as Error).message}`);
			}
		},
	});
	const daemon = new Daemon(
		pijHome,
		new DaemonTmux(),
		registry,
		channel,
		log,
		undefined,
		undefined,
		undefined,
		undefined,
		bridgeSupervisor,
		bridgeSpine,
	);
	log(
		`pij daemon up (pid ${process.pid}, home ${pijHome}) — watching for pending spawns + tmux inboxes`,
	);

	// Crash-leftover sweep (agent-runtime AC-05): clear stale inline temp packs
	// under ~/.pij/tmp/agents on daemon start. Inline-only users who never start
	// the daemon still get swept at the start of each `pij agent run`.
	try {
		const swept = sweepStaleTmp(pijHome);
		if (swept.length > 0) log(`swept ${swept.length} stale inline temp pack(s)`);
	} catch (e) {
		log(`inline temp sweep skipped: ${(e as Error).message}`);
	}
	const timer = setInterval(() => {
		daemon
			.tick()
			// Heartbeat rider (#40 Defect 2): refresh the lock mtime AFTER a successful
			// tick — a wedged tick (threw) must not advertise liveness.
			.then(() => touchDaemonHeartbeat(lockPath))
			.catch((e: unknown) => log(`tick error: ${(e as Error).message}`));
	}, opts.tickMs ?? TICK_MS);

	// Delivery on its OWN timer (plan 071 D2), so reconciliation cost and delivery
	// latency stop being the same number.
	const deliveryTimer = setInterval(() => {
		daemon.deliverPass().catch((e: unknown) => {
			log(`delivery pass error: ${(e as Error).message}`);
		});
	}, opts.deliveryMs ?? DELIVERY_PASS_MS);

	return () => {
		clearInterval(timer);
		clearInterval(deliveryTimer);
		daemon.dispose();
		try {
			const held = parseLockFile(readFileSync(lockPath, "utf8"));
			if (held?.pid === process.pid) rmSync(lockPath);
		} catch {
			/* already gone */
		}
	};
}

type DaemonShutdownSignal = "SIGINT" | "SIGTERM";

interface DaemonShutdownOptions {
	readonly onSignal?: (signal: DaemonShutdownSignal, handler: () => void) => void;
	readonly releaseHeldLocks?: () => void;
	readonly exit?: (code: number) => void;
}

export function installDaemonShutdownHandlers(
	stop: (() => void) | undefined,
	options: DaemonShutdownOptions = {},
): void {
	const onSignal =
		options.onSignal ??
		((signal: DaemonShutdownSignal, handler: () => void) => {
			process.on(signal, handler);
		});
	const exit = options.exit ?? ((code: number) => process.exit(code));
	const shutdown = () => {
		stop?.();
		(options.releaseHeldLocks ?? releaseHeldLocks)();
		exit(0);
	};
	onSignal("SIGINT", shutdown);
	onSignal("SIGTERM", shutdown);
}

function holdSignalTestLocks(pijHome: string): void {
	if (process.env.PIJ_TEST_HOLD_LOCKS_ON_START !== "1") return;
	const dir = join(pijHome, "spine");
	mkdirSync(dir, { recursive: true });
	for (const name of ["write.lock", "events.lock"]) {
		const path = join(dir, name);
		const token = `${process.pid}:signal-test-${name}\n`;
		writeFileSync(path, token, { flag: "wx" });
		trackHeldLock(path, token);
	}
	process.stdout.write("PIJ_TEST_LOCKS_HELD\n");
}

// Run-if-main (tsx/ESM): start the loop and keep the process alive until SIGINT.
if (import.meta.url === `file://${process.argv[1]}`) {
	let stop: (() => void) | undefined;
	try {
		stop = runDaemon();
	} catch (e) {
		process.stderr.write(`${(e as Error).message}\n`);
		process.exit(1);
	}
	installDaemonShutdownHandlers(stop);
	holdSignalTestLocks(resolvePijHome());
}
