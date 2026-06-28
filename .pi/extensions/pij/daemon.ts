#!/usr/bin/env -S npx tsx
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
} from "./core/daemon/loop.js";
import { SendBuffer } from "./core/daemon/router.js";
import { daemonOwnsDelivery } from "./core/harness/pi.js";
import type { DeliveryPort, RegistryPort } from "./core/ports.js";
import { classifyReadiness } from "./core/readiness.js";
import { classifyDeathReason, STALE_AFTER_MS } from "./core/state.js";
import type { DeathReason, SessionDescriptor } from "./core/types.js";

const TICK_MS = 600;

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
	private readonly pushed = new Map<string, Set<"stalled" | "dead" | "provider-failure">>();

	constructor(
		private readonly pijHome: string,
		private readonly ports: DaemonPorts,
		private readonly registry: RegistryPort,
		private readonly channel: DeliveryPort,
		private readonly log: (line: string) => void = () => {},
	) {}

	/** One pass: rebuild the index, drive pending tmux spawns, drain bound inboxes. */
	tick(): void {
		this.index.rebuild(this.registry.list());

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
			// Delivery is daemon-owned ONLY for bound tmux harnesses (claude/copilot).
			// pi self-drives its inbox via its in-process receiver, so it is excluded
			// from flush/drain/observe — the daemon must never touch a pi inbox.
			const owns = d.lifecycle === "bound" && daemonOwnsDelivery(d.harness ?? "pi");
			if (owns) {
				// Flush buffered pre-bind sends — but ONLY once we have a pane to send to.
				// `SendBuffer.flush` deletes the queue unconditionally, so guarding the
				// flush (not just the send) avoids silently dropping them (review M1).
				if (d.paneId && !this.flushed.has(d.id)) {
					this.flushed.add(d.id);
					for (const m of this.buffer.flush(d.id)) {
						this.ports.sendText(d.paneId, flushedText(m));
					}
				}
				this.drainInbox(d.id);
				// Persist footer activity → working|idle (+ fresh last-activity ts) so
				// `pij state`/`list` report real liveness instead of `idle · never`
				// (control-plane peers write no pij events). Writes only on a change.
				if (d.paneId) {
					const readiness = classifyReadiness(this.ports.capturePane(d.paneId));
					const updated = observeActivity(d, readiness, this.ports.now());
					if (updated) this.registry.write(updated);
				}
				// Whole-life stalled/dead push (T012): detect transitions and push once
				// per transition to the creator. The latch (`this.pushed`) ensures each
				// transition (stalled, dead) fires exactly one creator notification.
				this.pushWholeLifeTransition(d);
			}
			// Provider-failure peek (FIX-A / DL-005) — read-only and HARNESS-AGNOSTIC
			// (pi INCLUDED). A spawned worker can sit idle on a fatal provider error
			// (quota/credit/auth/400) without ever dying or stalling, so the owned
			// branch above never sees it — and a pi worker never enters that branch at
			// all (no lifecycle/sendkeys). `capture-pane` is read-only, so pi keeps
			// owning its inbox, delivery, and self-written state — we only peek.
			if (d.paneId && d.spawnedBy) this.pushProviderFailure(d);
		}
	}

	/** Detect and push stalled/dead transitions for a bound session. The push
	 *  lives HERE (impure: it holds the delivery port) — NOT in `observeActivity`
	 *  (pure, returns null for non-busy/ready, has no delivery port). One push per
	 *  transition, latched by `this.pushed`. */
	private pushWholeLifeTransition(d: SessionDescriptor): void {
		if (!d.spawnedBy) return; // no creator to notify
		const latch = this.pushed.get(d.id) ?? new Set<"stalled" | "dead" | "provider-failure">();
		this.pushed.set(d.id, latch);

		// Dead: pid gone (authoritative)
		const pidAlive = this.ports.isAlive(d.pid);
		if (!pidAlive && !latch.has("dead")) {
			latch.add("dead");
			const pane = d.paneId ? this.ports.capturePane(d.paneId) : "";
			const reason: DeathReason = classifyDeathReason(pane);
			// Persist failureReason so pij state/list --json surface the machine-stable reason (FIX-4).
			this.registry.write({ ...d, failureReason: reason });
			const note = buildDeadNotice(d, reason);
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
			this.registry.write({ ...d, failureReason: "stalled" });
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
		const latch = this.pushed.get(d.id) ?? new Set<"stalled" | "dead" | "provider-failure">();
		this.pushed.set(d.id, latch);
		if (latch.has("provider-failure")) return;
		const reason = classifyDeathReason(this.ports.capturePane(d.paneId));
		const isFatal = reason === "quota" || reason === "auth" || reason === "model-not-supported";
		if (!isFatal) return;
		latch.add("provider-failure");
		this.registry.write({ ...d, failureReason: reason });
		const note = buildDeadNotice(d, reason);
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
		for (const mid of consumed) {
			const p = pathById.get(mid);
			if (p) {
				try {
					rmSync(p);
				} catch {
					/* already gone */
				}
			}
		}
		if (consumed.length > 0) this.log(`route ${id}: injected ${consumed.length} message(s)`);
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
	const timer = setInterval(() => {
		try {
			daemon.tick();
		} catch (e) {
			log(`tick error: ${(e as Error).message}`);
		}
	}, opts.tickMs ?? TICK_MS);

	return () => {
		clearInterval(timer);
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
