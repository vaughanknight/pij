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
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FsAssignmentStore } from "./adapters/assignment-store.js";
import { FsBatonStore } from "./adapters/baton-store.js";
import { FsChannel } from "./adapters/channel.js";
import { DaemonTmux } from "./adapters/daemon-tmux.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { FsOpJournal } from "./adapters/op-journal.js";
import { FsPlatformWriteLock } from "./adapters/platform-write-lock.js";
import { NodeProcess } from "./adapters/process.js";
import { FsProjectStore } from "./adapters/project-store.js";
import { FsSpineLog } from "./adapters/spine-store.js";
import { FsWatchStore } from "./adapters/watch-store.js";
import { FsWatchdogGlobalStore, FsWatchdogStore } from "./adapters/watchdog-store.js";
import { planOnceClose } from "./core/agent-peer.js";
import { sweepStaleTmp } from "./core/agents/inline.js";
import { buildDeadNotice, buildStalledNotice } from "./core/binding.js";
import { AnomalySweep } from "./core/daemon/anomaly-sweep.js";
import { BatonSweep } from "./core/daemon/baton-sweep.js";
import { IndexState } from "./core/daemon/index-state.js";
import { evaluateLock, parseLockFile, serializeLockFile } from "./core/daemon/lock.js";
import {
	backfillWindowId,
	type DaemonPorts,
	type DriveState,
	drainTmuxInbox,
	driveSession,
	flushedText,
	observeActivity,
	writeMerged,
} from "./core/daemon/loop.js";
import { PaneSignalMonitor, type PaneSignalSnapshot } from "./core/daemon/pane-signals.js";
import {
	COMPACT_GRACE_MS,
	COMPACT_MAX_MS,
	isCompacting,
	SendBuffer,
} from "./core/daemon/router.js";
import { RuntimeAxisTracker } from "./core/daemon/runtime-axis.js";
import { PeerWatchManager } from "./core/daemon/watch.js";
import { WatchdogManager, type WatchdogResponseEvent } from "./core/daemon/watchdog-manager.js";
import { daemonOwnsDelivery } from "./core/harness/pi.js";
import { persistReceiptEnvelope, prepareReceiptEnvelopes } from "./core/inbox.js";
import { receiptBody } from "./core/message.js";
import {
	type BatonNotice,
	type BatonNoticeReceipt,
	type BatonNoticeSink,
	renderBatonNotice,
} from "./core/orchestration/baton.js";
import type { DeliveryPort, InboxPort, RegistryPort, SendOutcome } from "./core/ports.js";
import { classifyReadiness } from "./core/readiness.js";
import { classifyDeathReason, STALE_AFTER_MS } from "./core/state.js";
import type { DeathReason, SessionDescriptor } from "./core/types.js";
import { autoStartBridgeForDaemon } from "./telegram/index.js";

const TICK_MS = 600;
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

/** One daemon, holding the cross-tick drive state. Pure-ish: `tick()` is
 *  synchronous and side-effects only through the injected ports/registry, so a
 *  smoke can drive it one tick at a time with fakes. */
export class Daemon {
	private readonly index = new IndexState();
	private readonly drives = new Map<string, DriveState>();
	private readonly buffer = new SendBuffer();
	private readonly paneSignals = new PaneSignalMonitor();
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
	private platformPassesDisabled = false;
	private readonly watchManager: PeerWatchManager;
	private readonly watchdogManager: WatchdogManager;
	private readonly batonSweep: BatonSweep;

	constructor(
		private readonly pijHome: string,
		private readonly ports: DaemonPorts,
		private readonly registry: RegistryPort,
		private readonly channel: DeliveryPort & InboxPort,
		private readonly log: (line: string) => void = () => {},
		watchManager?: PeerWatchManager,
		batonSweep?: BatonSweep,
		watchdogManager?: WatchdogManager,
	) {
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
				capturePane: (session) => (session.paneId ? this.ports.capturePane(session.paneId) : ""),
				sendText: (session, body) => {
					if (!session.paneId) return;
					this.ports.sendText(session.paneId, body, session.harness, session.pid);
				},
				onFire: (session, atMs) => {
					const latest = this.registry.read(session.id) ?? session;
					writeMerged(this.registry, {
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
	tick(): void {
		const tickAt = new Date(this.ports.now()).toISOString();
		for (const snapshot of this.registry.list()) {
			if (!daemonOwnsDelivery(snapshot.harness ?? "pi", snapshot.deliveryMode)) continue;
			const latest = this.registry.read(snapshot.id);
			if (latest) this.registry.write({ ...latest, lastTickAt: tickAt });
		}
		this.index.rebuild(this.registry.list());
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
					platformWriteLock: new FsPlatformWriteLock(this.pijHome),
					now: () => this.ports.now(),
					isAlive: (pid) => this.ports.isAlive(pid),
					// Suspension probe: `ps -o state=` reads 'T' for a SIGSTOP'd
					// process; an unreadable probe is null — honest missing telemetry.
					isSuspended: (pid) => {
						try {
							const state = execFileSync("ps", ["-o", "state=", "-p", String(pid)], {
								encoding: "utf8",
							}).trim();
							return state === "" ? null : state.startsWith("T");
						} catch {
							return null;
						}
					},
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

		for (const d of this.index.pending()) {
			if (!daemonOwnsDelivery(d.harness ?? "pi", d.deliveryMode)) continue; // pi/pull self-drive
			try {
				const drive = this.drives.get(d.id) ?? {};
				this.drives.set(d.id, drive);
				const out = driveSession(d, drive, this.ports, this.registry, this.channel);
				if (out.kind !== "waiting" && out.kind !== "boot") {
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
					if (d.paneId) this.ports.killPane(d.paneId);
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
						!this.buffer.isPaneHeld(current.paneId) &&
						this.buffer.pending(current.id) > 0
					) {
						for (const m of this.buffer.flush(current.id, current.paneId)) {
							this.watchdogManager.beforeTmuxInject(current.id, m.message, this.ports.now());
							const outcome = this.ports.sendText(
								current.paneId,
								flushedText(m.message),
								current.harness,
								current.pid,
							);
							const marked = this.channel.markRead(current.id, m.messageId, {
								messageId: m.messageId,
								readAt: new Date(this.ports.now()).toISOString(),
								reader: current.id,
							});
							if (!marked.ok) throw new Error(`${marked.code}: ${marked.message}`);
							this.emitSendReceipt(current.id, m.message.from, m.messageId, outcome);
						}
					}
					// Persist footer activity → working|idle (+ fresh last-activity ts) so
					// `pij state`/`list` report real liveness instead of `idle · never`
					// (control-plane peers write no pij events). Writes only on a change.
					if (current.paneId) {
						const pane = this.ports.capturePane(current.paneId);
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
							// writeMerged re-reads + preserves a reportedAt stamped concurrently by
							// `pij agent report` between this tick's index rebuild and now, so the
							// activity write can't clobber the `--once` close latch (Finding 1). It
							// returns the merged descriptor so `current` (fed to the stall/dead push
							// below) also carries the preserved stamp.
							current = writeMerged(this.registry, updated);
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
								current = writeMerged(this.registry, cleared);
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
				if (providerView.paneId && providerView.spawnedBy) this.pushProviderFailure(providerView);
				// Compact hold (DL-004): while the pane is compacting, do NOT drain —
				// messages stay durable-unread in the inbox (the queue), nothing is
				// marked read, and the sender's receipt stays `queued` until the
				// post-compact injection emits a real `delivered`.
				if (owns && !isCompacting(current, this.ports.now())) this.drainInbox(current.id);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				this.log(`session ${d.id} tick error: ${detail}`);
			}
		}
		this.watchdogManager.reconcile(this.registry.list());
	}

	/** Detect and push stalled/dead transitions for a bound session. The push
	 *  lives HERE (impure: it holds the delivery port) — NOT in `observeActivity`
	 *  (pure, returns null for non-busy/ready, has no delivery port). One push per
	 *  transition, latched by `this.pushed`. */
	private pushWholeLifeTransition(d: SessionDescriptor): void {
		if (!d.spawnedBy) return; // no creator to notify
		const latch = this.pushed.get(d.id) ?? new Set<PushedTransition>();
		this.pushed.set(d.id, latch);

		// Dead: pid gone (authoritative)
		const pidAlive = this.ports.isAlive(d.pid);
		if (!pidAlive && !latch.has("dead")) {
			latch.add("dead");
			const pane = d.paneId ? this.ports.capturePane(d.paneId) : "";
			const reason: DeathReason = classifyDeathReason(pane);
			// Persist failureReason so pij state/list --json surface the machine-stable reason (FIX-4).
			const persisted = writeMerged(this.registry, { ...d, failureReason: reason });
			if (persisted.lifecycle === "dissolved") return;
			const note = buildDeadNotice(persisted, reason, { authoritativeDeath: true });
			if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
			this.log(`push ${d.id}: dead (${reason})`);
			return;
		}

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
			const persisted = writeMerged(this.registry, { ...d, failureReason: "stalled" });
			if (persisted.lifecycle === "dissolved") return;
			const note = buildStalledNotice(persisted);
			if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
			this.log(`push ${d.id}: stalled`);
		} else if (
			!stalled &&
			!this.watchdogStalled.has(d.id) &&
			(latch.delete("stalled") || d.failureReason === "stalled")
		) {
			writeMerged(this.registry, { ...d, failureReason: undefined });
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
				writeMerged(this.registry, { ...d, failureReason: undefined });
				this.log(`push ${d.id}: watchdog stalled cleared on recovery`);
			}
			return;
		}
		if (event.response !== "stalled") return;
		this.watchdogStalled.add(d.id);
		if (latch.has("stalled")) return;
		latch.add("stalled");
		const persisted = writeMerged(this.registry, { ...d, failureReason: "stalled" });
		if (persisted.lifecycle === "dissolved") return;
		if (persisted.spawnedBy) {
			const note = buildStalledNotice(persisted);
			if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
		}
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
		if (!d.spawnedBy || !d.paneId) return; // no creator / no pane to peek
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
				writeMerged(this.registry, recovered);
				this.log(`push ${d.id}: provider-failure cleared on recovery`);
			}
			return;
		}
		const ageMs = d.lastEventAt ? this.ports.now() - Date.parse(d.lastEventAt) : null;
		const staleAge = ageMs === null || ageMs > STALE_AFTER_MS;
		if (!staleAge) return;
		if (latch.has("provider-failure")) return;
		const reason = classifyDeathReason(this.ports.capturePane(d.paneId));
		const isFatal = reason === "quota" || reason === "auth" || reason === "model-not-supported";
		if (!isFatal) return;
		latch.add("provider-failure");
		const persisted = writeMerged(this.registry, { ...d, failureReason: reason });
		if (persisted.lifecycle === "dissolved") return;
		const note = buildDeadNotice(persisted, reason, { authoritativeDeath: false });
		if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
		this.log(`push ${d.id}: provider-failure (${reason})`);
	}

	/** Read a bound tmux session's durable unread inbox, inject each user message,
	 *  then mark it read after the injection outcome. Receipt envelopes are
	 *  persisted as events before marking and are never injected. */
	private drainInbox(id: string): void {
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

		const listed = this.channel.listUnread(id);
		if (!listed.ok) throw new Error(`${listed.code}: ${listed.message}`);
		const messages = listed.value
			.filter((message) => message.kind !== "receipt")
			.map((message) => ({
				messageId: message.messageId,
				from: message.from,
				body: message.body,
				command: message.command,
			}));
		if (messages.length === 0) return;
		let consumedCount = 0;
		let compactFired = false;
		for (const message of messages) {
			if (!this.buffer.isPaneHeld(target.paneId)) {
				this.watchdogManager.beforeTmuxInject(target.id, message, nowMs);
			}
			const consumed = drainTmuxInbox(target, [message], this.ports, this.buffer);
			// A remote `/compact` just went into the pane: mark the compact window
			// (DL-004) so drain HOLDS until the pane reads ready again — the trigger
			// itself must go through, but anything injected behind it mid-compact
			// would be eaten by the harness's fresh-context reset.
			if (message.command === "compact" && consumed.some((item) => item.outcome !== undefined)) {
				const latest = this.registry.read(target.id);
				if (latest && latest.lifecycle !== "dissolved") {
					writeMerged(this.registry, {
						...latest,
						compactingAt: new Date(this.ports.now()).toISOString(),
					});
					this.log(`compact ${id}: remote /compact injected — holding drain until ready`);
					compactFired = true;
				}
			}
			for (const item of consumed) {
				const marked = this.channel.markRead(id, item.messageId, {
					messageId: item.messageId,
					readAt,
					reader: id,
				});
				if (!marked.ok) {
					throw new Error(`${marked.code}: ${marked.message}`);
				}
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
		const listings = this.ports.listPanes();
		const diff = this.paneSignals.reconcile(listings);
		for (const pane of diff.added) {
			const safePane = pane.paneId.replaceAll(/[^A-Za-z0-9_-]/g, "_");
			this.ports.attachPaneTap(pane.paneId, join(this.pijHome, "pane-signals", `${safePane}.raw`));
		}
		for (const paneId of this.paneSignals.paneIds()) {
			const bytes = this.ports.drainPaneTap(paneId);
			if (bytes.byteLength > 0) this.paneSignals.ingest(paneId, bytes, this.ports.now());
		}
		this.paneSignals.tick(this.ports.now());
		for (const paneId of this.paneSignals.paneIds()) {
			const signal = this.paneSignals.snapshot(paneId, this.ports.now());
			if (signal) {
				this.buffer.setPaneSignal(paneId, {
					busy: signal.busy,
					userTyping: signal.userTyping,
				});
			}
		}
		for (const paneId of diff.retired) {
			this.ports.detachPaneTap(paneId);
			this.buffer.forgetPane(paneId);
		}
	}

	private emitSendReceipt(
		peer: string,
		sender: string,
		messageId: string,
		outcome: SendOutcome,
	): void {
		if (!this.registry.read(sender)) return;
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
		this.watchManager.disposeAll();
		this.watchdogManager.disposeAll();
	}
}

export interface DaemonOptions {
	readonly pijHome?: string;
	readonly tickMs?: number;
	readonly log?: (line: string) => void;
}

/** Acquire the single-instance lock (AC-10) and run the tick loop. Returns a
 *  stop() disposer (clears the timer + releases the lock). Throws if a live
 *  daemon already holds the lock (the caller prints + exits). */
export function runDaemon(opts: DaemonOptions = {}): () => void {
	const pijHome = opts.pijHome ?? process.env.PIJ_HOME ?? join(homedir(), ".pij");
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
	const lockBody = serializeLockFile({
		pid: process.pid,
		startedAt: new Date().toISOString(),
		...(ownedWindow ? { window: ownedWindow } : {}),
	});
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

	const daemon = new Daemon(
		pijHome,
		new DaemonTmux(),
		new FsRegistry(pijHome),
		new FsChannel(pijHome),
		log,
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
		try {
			daemon.tick();
		} catch (e) {
			log(`tick error: ${(e as Error).message}`);
		}
	}, opts.tickMs ?? TICK_MS);

	// Auto-start the Telegram bridge IN-PROCESS when a scoped telegram.env is present
	// (else a no-op, so a bridge-less daemon is unchanged). The bridge stays a harness:"pi"
	// peer the tick loop OBSERVES, so co-locating it changes only who owns the long-poll.
	// A bridge failure tears down only the bridge (never the daemon); its teardown folds
	// into the disposer below.
	const stopBridge = autoStartBridgeForDaemon(pijHome, log);

	return () => {
		clearInterval(timer);
		daemon.dispose();
		stopBridge();
		try {
			const held = parseLockFile(readFileSync(lockPath, "utf8"));
			if (held?.pid === process.pid) rmSync(lockPath);
		} catch {
			/* already gone */
		}
	};
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
	const shutdown = () => {
		stop?.();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}
