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
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DeliveredMessage } from "./adapters/channel.js";
import { FsChannel } from "./adapters/channel.js";
import { DaemonTmux } from "./adapters/daemon-tmux.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { FsWatchStore } from "./adapters/watch-store.js";
import { planOnceClose } from "./core/agent-peer.js";
import { sweepStaleTmp } from "./core/agents/inline.js";
import { buildDeadNotice, buildStalledNotice } from "./core/binding.js";
import { IndexState } from "./core/daemon/index-state.js";
import { evaluateLock, parseLockFile, serializeLockFile } from "./core/daemon/lock.js";
import {
	type DaemonPorts,
	type DriveState,
	drainTmuxInbox,
	driveSession,
	flushedText,
	observeActivity,
	writeMerged,
} from "./core/daemon/loop.js";
import { SendBuffer } from "./core/daemon/router.js";
import { PeerWatchManager } from "./core/daemon/watch.js";
import { daemonOwnsDelivery } from "./core/harness/pi.js";
import { receiptBody } from "./core/message.js";
import type { DeliveryPort, RegistryPort, SendOutcome } from "./core/ports.js";
import { classifyReadiness } from "./core/readiness.js";
import { classifyDeathReason, STALE_AFTER_MS } from "./core/state.js";
import type { DeathReason, SessionDescriptor } from "./core/types.js";
import { autoStartBridgeForDaemon } from "./telegram/index.js";

const TICK_MS = 600;
type PushedTransition = "stalled" | "dead" | "provider-failure";

/** One daemon, holding the cross-tick drive state. Pure-ish: `tick()` is
 *  synchronous and side-effects only through the injected ports/registry, so a
 *  smoke can drive it one tick at a time with fakes. */
export class Daemon {
	private readonly index = new IndexState();
	private readonly drives = new Map<string, DriveState>();
	private readonly buffer = new SendBuffer();
	private readonly flushed = new Set<string>();
	/** Per-bound-session latch: tracks which transitions have already been pushed
	 *  so each stalled/dead/provider-failure notice fires exactly once (T012). */
	private readonly pushed = new Map<string, Set<PushedTransition>>();
	/** Per-bound-session last captured-pane signature — the pane-content heartbeat.
	 *  ANY visible change tick-to-tick means the peer is alive (streaming reasoning
	 *  or tool output), even when its footer momentarily classifies as `booting`
	 *  (raw tool output) rather than a `busy` marker. Feeds the stall guard so a
	 *  deep-thinking / long-tool xhigh peer isn't false-flagged stalled. */
	private readonly paneSig = new Map<string, string>();
	private readonly watchManager: PeerWatchManager;

	constructor(
		private readonly pijHome: string,
		private readonly ports: DaemonPorts,
		private readonly registry: RegistryPort,
		private readonly channel: DeliveryPort,
		private readonly log: (line: string) => void = () => {},
		watchManager?: PeerWatchManager,
	) {
		this.watchManager =
			watchManager ??
			new PeerWatchManager({
				store: new FsWatchStore(pijHome),
				channel,
				isAlive: (pid) => this.ports.isAlive(pid),
				log,
			});
	}

	/** One pass: rebuild the index, drive pending tmux spawns, drain bound inboxes. */
	tick(): void {
		this.index.rebuild(this.registry.list());
		this.watchManager.reconcile(this.index.all());

		for (const d of this.index.pending()) {
			if (!daemonOwnsDelivery(d.harness ?? "pi")) continue; // pi self-drives
			const drive = this.drives.get(d.id) ?? {};
			this.drives.set(d.id, drive);
			const out = driveSession(d, drive, this.ports, this.registry, this.channel);
			if (out.kind !== "waiting" && out.kind !== "boot") {
				const extra =
					out.kind === "bound"
						? ` ↔ ${out.harnessSessionId}`
						: out.kind === "failed"
							? ` (${out.reason})`
							: out.kind === "dismissed" || out.kind === "needs-human"
								? ` (${out.label})`
								: "";
				this.log(`spawn ${d.id}: ${out.kind}${extra}`);
			}
		}

		for (const d of this.index.all()) {
			// `--once` agent peer that has pushed its report → close its pane + drop its
			// descriptor (T008 / AC-16). `planOnceClose` is true ONLY for `agentOnce &&
			// reportedAt`, so a resident peer, an un-reported once peer, and every plain
			// (non-agent) colleague are left untouched — the stalled/dead watchdog below
			// is unchanged. The report is already durable in the spawner's inbox before
			// `reportedAt` is stamped (T007), so closing the reporter never loses it.
			if (planOnceClose(d)) {
				if (d.paneId) this.ports.killPane(d.paneId);
				this.registry.remove(d.id);
				this.drives.delete(d.id);
				this.pushed.delete(d.id);
				this.flushed.delete(d.id);
				this.paneSig.delete(d.id);
				this.watchManager.disposeSession(d.id);
				this.log(`close ${d.id}: once-mode agent peer reported → pane killed + descriptor removed`);
				continue;
			}
			let current = d;
			// Delivery is daemon-owned ONLY for bound tmux harnesses (claude/copilot).
			// pi self-drives its inbox via its in-process receiver, so it is excluded
			// from flush/drain/observe — the daemon must never touch a pi inbox.
			const owns = current.lifecycle === "bound" && daemonOwnsDelivery(current.harness ?? "pi");
			if (owns) {
				// Flush buffered pre-bind sends — but ONLY once we have a pane to send to.
				// `SendBuffer.flush` deletes the queue unconditionally, so guarding the
				// flush (not just the send) avoids silently dropping them (review M1).
				if (current.paneId && !this.flushed.has(current.id)) {
					this.flushed.add(current.id);
					for (const m of this.buffer.flush(current.id)) {
						const outcome = this.ports.sendText(
							current.paneId,
							flushedText(m.message),
							current.harness,
							current.pid,
						);
						this.emitSendReceipt(current.id, m.message.from, m.messageId, outcome);
					}
				}
				this.drainInbox(current.id);
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
					this.paneSig.set(current.id, pane);
					const effectiveState = updated?.state ?? current.state;
					if (prevSig !== undefined && pane !== prevSig && effectiveState === "working") {
						updated = {
							...(updated ?? current),
							lastEventAt: new Date(this.ports.now()).toISOString(),
						};
					}
					if (updated) {
						// writeMerged re-reads + preserves a reportedAt stamped concurrently by
						// `pij agent report` between this tick's index rebuild and now, so the
						// activity write can't clobber the `--once` close latch (Finding 1). It
						// returns the merged descriptor so `current` (fed to the stall/dead push
						// below) also carries the preserved stamp.
						current = writeMerged(this.registry, updated);
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
		}
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
			writeMerged(this.registry, { ...d, failureReason: reason });
			const note = buildDeadNotice(d, reason, { authoritativeDeath: true });
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
			writeMerged(this.registry, { ...d, failureReason: "stalled" });
			const note = buildStalledNotice(d);
			if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
			this.log(`push ${d.id}: stalled`);
		}
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
		writeMerged(this.registry, { ...d, failureReason: reason });
		const note = buildDeadNotice(d, reason, { authoritativeDeath: false });
		if (note) this.channel.deliver({ from: d.id, to: note.to, body: note.text });
		this.log(`push ${d.id}: provider-failure (${reason})`);
	}

	/** Read a bound tmux session's inbox, inject each message, unlink consumed.
	 *  The pane is re-resolved per message via `route` (review L3 — no pane arg). */
	private drainInbox(id: string): void {
		const inbox = join(this.pijHome, id, "inbox");
		let names: string[];
		try {
			names = readdirSync(inbox);
		} catch {
			return; // no inbox yet
		}
		const files = names.filter((n) => n.startsWith("msg-") && n.endsWith(".json")).sort();
		const messages: Array<{ messageId: string; from: string; body: string; command?: string }> = [];
		const pathById = new Map<string, string>();
		for (const n of files) {
			const p = join(inbox, n);
			try {
				const m = JSON.parse(readFileSync(p, "utf8")) as DeliveredMessage;
				if (m.kind === "receipt") {
					rmSync(p); // receipts are never injected (would wake/bill the peer)
					continue;
				}
				messages.push({ messageId: m.messageId, from: m.from, body: m.body, command: m.command });
				pathById.set(m.messageId, p);
			} catch {
				/* malformed → skip */
			}
		}
		if (messages.length === 0) return;
		const target = this.index.get(id);
		if (!target) return;
		const consumed = drainTmuxInbox(target, messages, this.ports, this.buffer);
		for (const item of consumed) {
			const p = pathById.get(item.messageId);
			if (p) {
				try {
					rmSync(p);
				} catch {
					/* already gone */
				}
			}
			if (target.lifecycle === "bound" && item.outcome !== undefined) {
				this.emitSendReceipt(target.id, item.from, item.messageId, item.outcome);
			}
		}
		if (consumed.length > 0) this.log(`route ${id}: injected ${consumed.length} message(s)`);
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
		this.watchManager.disposeAll();
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
