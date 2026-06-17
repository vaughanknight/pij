// FolderWatcher — fs adapter (internal). May import node:fs; never pi.
//
// fs.watch fires on *any* dir change; we debounce, then rebuild a matched
// {mtimeMs,size} snapshot via readdir+stat and hand it to the pure
// WatchReconciler. We never read fs.watch's event type (Key Finding 01).

import { watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { Change, CompiledWatch, Snapshot, WatchReconciler } from "./store.js";

export interface FileEntry {
	readonly rel: string;
	readonly mtimeMs: number;
	readonly size: number;
}

/** Injected side effects (Pattern P3) — node-backed by default, faked in tests. */
export interface WatchDeps {
	watch: (dir: string, opts: { recursive: boolean }, listener: () => void) => { close(): void };
	listFiles: (dir: string, recursive: boolean) => Promise<FileEntry[]>;
	now: () => number;
	setTimer: (fn: () => void, ms: number) => () => void;
}

export class FolderWatcher {
	private fsw?: { close(): void };
	private cancelTimer?: () => void;
	private scanning = false;
	private rescanQueued = false;
	private disposed = false;

	constructor(
		private readonly compiled: CompiledWatch,
		private readonly reconciler: WatchReconciler,
		private readonly debounceMs: number,
		private readonly onNotices: (notices: string[], changes: Change[]) => void,
		private readonly deps: WatchDeps,
	) {}

	/** Prime the baseline (no notices for pre-existing files) and start watching. */
	async start(): Promise<void> {
		this.reconciler.prime(await this.snapshot());
		if (this.disposed) return;
		this.fsw = this.deps.watch(this.compiled.dir, { recursive: this.compiled.recursive }, () =>
			this.schedule(),
		);
	}

	private schedule(): void {
		if (this.disposed) return;
		this.cancelTimer?.();
		this.cancelTimer = this.deps.setTimer(() => {
			void this.scan();
		}, this.debounceMs);
	}

	/** Rebuild the snapshot, reconcile, emit coalesced notices. Public for tests. */
	async scan(): Promise<void> {
		if (this.scanning) {
			this.rescanQueued = true;
			return;
		}
		this.scanning = true;
		try {
			const changes = this.reconciler.apply(await this.snapshot(), this.deps.now());
			if (changes.length > 0) {
				this.onNotices(this.reconciler.formatNotices(changes), changes);
			}
		} finally {
			this.scanning = false;
			if (this.rescanQueued && !this.disposed) {
				this.rescanQueued = false;
				this.schedule();
			}
		}
	}

	private async snapshot(): Promise<Snapshot> {
		const files = await this.deps.listFiles(this.compiled.dir, this.compiled.recursive);
		const snap: Snapshot = new Map();
		for (const f of files) {
			const base = f.rel.split("/").pop() ?? f.rel;
			if (this.compiled.isIgnored(base)) continue;
			if (!this.compiled.isMatch(f.rel)) continue;
			snap.set(f.rel, { mtimeMs: f.mtimeMs, size: f.size });
		}
		return snap;
	}

	dispose(): void {
		this.disposed = true;
		this.cancelTimer?.();
		this.fsw?.close();
	}
}

/** Node-backed deps. fs.watch is non-persistent so it never holds the event loop. */
export function nodeWatchDeps(): WatchDeps {
	return {
		watch: (dir, opts, listener) => {
			const w = watch(dir, { recursive: opts.recursive, persistent: false }, () => listener());
			return { close: () => w.close() };
		},
		listFiles: (dir, recursive) => listFilesNode(dir, recursive),
		now: () => Date.now(),
		setTimer: (fn, ms) => {
			const t = setTimeout(fn, ms);
			if (typeof t === "object" && "unref" in t) t.unref();
			return () => clearTimeout(t);
		},
	};
}

async function listFilesNode(dir: string, recursive: boolean): Promise<FileEntry[]> {
	const out: FileEntry[] = [];
	async function walk(current: string): Promise<void> {
		const entries = await readdir(current, { withFileTypes: true }).catch(() => null);
		if (entries === null) return; // dir vanished mid-walk — ignore
		for (const e of entries) {
			const abs = join(current, e.name);
			if (e.isDirectory()) {
				if (recursive) await walk(abs);
				continue;
			}
			if (!e.isFile()) continue;
			try {
				const s = await stat(abs);
				out.push({
					rel: relative(dir, abs).split(sep).join("/"),
					mtimeMs: s.mtimeMs,
					size: s.size,
				});
			} catch {
				// file vanished between readdir and stat — skip
			}
		}
	}
	await walk(dir);
	return out;
}
