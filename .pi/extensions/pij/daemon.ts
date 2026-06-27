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

import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DeliveredMessage } from "./adapters/channel.js";
import { FsChannel } from "./adapters/channel.js";
import { DaemonTmux } from "./adapters/daemon-tmux.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { IndexState } from "./core/daemon/index-state.js";
import { evaluateLock, parseLockFile, serializeLockFile } from "./core/daemon/lock.js";
import {
	type DaemonPorts,
	type DriveState,
	drainTmuxInbox,
	driveSession,
	flushedText,
} from "./core/daemon/loop.js";
import { SendBuffer } from "./core/daemon/router.js";
import { daemonOwnsDelivery } from "./core/harness/pi.js";
import type { DeliveryPort, RegistryPort } from "./core/ports.js";

const TICK_MS = 600;

/** One daemon, holding the cross-tick drive state. Pure-ish: `tick()` is
 *  synchronous and side-effects only through the injected ports/registry, so a
 *  smoke can drive it one tick at a time with fakes. */
export class Daemon {
	private readonly index = new IndexState();
	private readonly drives = new Map<string, DriveState>();
	private readonly buffer = new SendBuffer();
	private readonly flushed = new Set<string>();

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
			if (d.lifecycle !== "bound" || !daemonOwnsDelivery(d.harness ?? "pi")) continue;
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
		}
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

	// Atomic acquire (review M2): `wx` = O_CREAT|O_EXCL, so two daemons racing
	// can't both "win" a stale-lock read. On EEXIST, evaluate the holder: a live
	// one → refuse; a dead one → reclaim (unlink + retry the exclusive create).
	const lockBody = serializeLockFile({ pid: process.pid, startedAt: new Date().toISOString() });
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
