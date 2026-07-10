import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { Change } from "../../../file-watch-notify/store.js";
import {
	compileWatch,
	DEFAULT_IGNORE,
	DEFAULT_NOTICE,
	WatchReconciler,
} from "../../../file-watch-notify/store.js";
import {
	FolderWatcher,
	nodeWatchDeps,
	type WatchDeps,
} from "../../../file-watch-notify/watcher.js";
import type { DeliveryPort } from "../ports.js";
import type { SessionDescriptor, SessionId, WatchSubscription } from "../types.js";
import { DEFAULT_PEER_WATCH_DEBOUNCE_MS, renderWatchNotice } from "../watch-subscription.js";

export interface WatchStorePort {
	readWatches(id: SessionId): readonly WatchSubscription[];
	revision?(id: SessionId): number | null;
}

/**
 * git seam (WS-002): repo detection + `.gitignore` matching, spawned from the
 * DAEMON only — the pi-free `file-watch-notify` core never learns about git.
 * Faked in tests.
 */
export interface GitPort {
	/** `git rev-parse --show-toplevel`; `null` outside a work tree (degrade). */
	repoRoot(dir: string): string | null;
	/** Batched `git check-ignore --stdin`; returns the ignored subset of `absPaths`. */
	checkIgnore(root: string, absPaths: readonly string[]): ReadonlySet<string>;
}

export interface PeerWatchManagerDeps {
	readonly store: WatchStorePort;
	readonly channel: DeliveryPort;
	readonly makeWatchDeps?: () => WatchDeps;
	readonly isAlive: (pid: number) => boolean;
	readonly log?: (line: string) => void;
	/** ~/.pij (or PIJ_HOME) — where `<id>/watch-diffs/` pointer files live.
	 *  Optional so the daemon's existing construction (which does not pass it)
	 *  still compiles; defaults to the same resolution the daemon + CLI use. */
	readonly pijHome?: string;
	readonly git?: GitPort;
}

interface LiveWatch {
	readonly id: SessionId;
	readonly watcher: FolderWatcher;
}

export class PeerWatchManager {
	private readonly live = new Map<string, LiveWatch>();
	private readonly revisions = new Map<SessionId, number | null>();
	private readonly cached = new Map<SessionId, readonly WatchSubscription[]>();
	private readonly pendingStarts: Promise<void>[] = [];
	private readonly git: GitPort;
	private readonly pijHome: string;

	constructor(private readonly deps: PeerWatchManagerDeps) {
		this.git = deps.git ?? nodeGitPort();
		this.pijHome = deps.pijHome ?? process.env.PIJ_HOME ?? join(homedir(), ".pij");
	}

	reconcile(sessions: readonly SessionDescriptor[]): void {
		const seenSessions = new Set<SessionId>();
		const wantedKeys = new Set<string>();
		for (const session of sessions) {
			seenSessions.add(session.id);
			if ((session.harness ?? "pi") === "pi") {
				this.disposeSession(session.id);
				continue;
			}
			if (!this.deps.isAlive(session.pid)) {
				this.disposeSession(session.id);
				continue;
			}
			for (const sub of this.readCached(session.id)) {
				const key = watchKey(session.id, sub);
				wantedKeys.add(key);
				if (this.live.has(key)) continue;
				this.live.set(key, { id: session.id, watcher: this.start(session.id, sub) });
			}
		}
		for (const [key, live] of this.live) {
			if (!seenSessions.has(live.id) || !wantedKeys.has(key)) {
				live.watcher.dispose();
				this.live.delete(key);
			}
		}
		// A session that lost its last live watch (last `unwatch`) sheds its
		// pointer dir (WS-001 cleanup). Sessions that vanished were already
		// cleaned by disposeSession above.
		for (const id of seenSessions) {
			if (![...this.live.values()].some((l) => l.id === id)) this.removeWatchDiffs(id);
		}
		for (const id of [...this.cached.keys()]) {
			if (!seenSessions.has(id)) {
				this.cached.delete(id);
				this.revisions.delete(id);
			}
		}
	}

	disposeSession(id: SessionId): void {
		for (const [key, live] of this.live) {
			if (live.id === id) {
				live.watcher.dispose();
				this.live.delete(key);
			}
		}
		this.removeWatchDiffs(id);
		this.cached.delete(id);
		this.revisions.delete(id);
	}

	async settle(): Promise<void> {
		await Promise.all(this.pendingStarts.splice(0));
	}

	activeCount(): number {
		return this.live.size;
	}

	disposeAll(): void {
		this.reconcile([]);
	}

	private readCached(id: SessionId): readonly WatchSubscription[] {
		const rev = this.deps.store.revision?.(id) ?? null;
		if (this.revisions.has(id) && this.revisions.get(id) === rev) return this.cached.get(id) ?? [];
		const watches = this.deps.store.readWatches(id);
		this.revisions.set(id, rev);
		this.cached.set(id, watches);
		return watches;
	}

	private start(id: SessionId, sub: WatchSubscription): FolderWatcher {
		const compiled = compileWatch(
			{ dir: sub.dir, patterns: [...sub.patterns], recursive: sub.recursive === true },
			DEFAULT_IGNORE,
		);
		const reconciler = new WatchReconciler(compiled, DEFAULT_NOTICE);
		const mode = sub.mode ?? "notify";
		const absDir = resolve(sub.dir);
		// Repo root detected + cached ONCE at subscription start (WS-002 Q3).
		const repoRoot = this.git.repoRoot(absDir);
		const pointerDir = join(this.pijHome, id, "watch-diffs");
		const watcher = new FolderWatcher(
			compiled,
			reconciler,
			sub.debounceMs ?? DEFAULT_PEER_WATCH_DEBOUNCE_MS,
			(_notices, changes) => {
				const survivors = repoRoot ? this.filterIgnored(repoRoot, absDir, changes) : changes;
				if (survivors.length === 0) return;
				const { body, pointers } = renderWatchNotice(survivors, mode, pointerDir);
				if (pointers.length > 0) {
					try {
						mkdirSync(pointerDir, { recursive: true });
						for (const p of pointers) writeFileSync(join(pointerDir, p.fileName), p.content);
					} catch (e) {
						this.deps.log?.(`watch ${id}: pointer write failed: ${(e as Error).message}`);
					}
				}
				if (body.trim().length > 0) this.deps.channel.deliver({ from: "pij-watch", to: id, body });
			},
			(this.deps.makeWatchDeps ?? nodeWatchDeps)(),
		);
		const pending = watcher.start().catch((e: unknown) => {
			this.deps.log?.(`watch ${id}: ${(e as Error).message}`);
			watcher.dispose();
		});
		this.pendingStarts.push(pending);
		return watcher;
	}

	/** Drop changes whose resolved path is `.gitignore`d (WS-002). */
	private filterIgnored(root: string, dir: string, changes: readonly Change[]): Change[] {
		const absOf = (c: Change) => c.identityPath ?? resolve(dir, c.path);
		const ignored = this.git.checkIgnore(root, changes.map(absOf));
		if (ignored.size === 0) return [...changes];
		return changes.filter((c) => !ignored.has(absOf(c)));
	}

	private removeWatchDiffs(id: SessionId): void {
		try {
			rmSync(join(this.pijHome, id, "watch-diffs"), { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
}

/** Runtime identity includes mode + effective cadence so retuning restarts the watcher. */
function watchKey(id: SessionId, sub: WatchSubscription): string {
	return `${id}\0${sub.dir}\0${sub.recursive === true ? "1" : "0"}\0${sub.mode ?? "notify"}\0${sub.debounceMs ?? DEFAULT_PEER_WATCH_DEBOUNCE_MS}\0${[...sub.patterns].sort().join("\0")}`;
}

/** Real git via argv-only `execFileSync` (no shell) — mirrors the tmux adapters. */
function nodeGitPort(): GitPort {
	return {
		repoRoot(dir) {
			try {
				const out = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				});
				return out.trim() || null;
			} catch {
				return null; // not a work tree → degrade silently (AC-07)
			}
		},
		checkIgnore(root, absPaths) {
			if (absPaths.length === 0) return new Set();
			try {
				const out = execFileSync("git", ["-C", root, "check-ignore", "--stdin", "-z"], {
					input: absPaths.join("\0"),
					encoding: "utf8",
					stdio: ["pipe", "pipe", "ignore"],
				});
				return toPathSet(out);
			} catch (e) {
				// check-ignore exits 1 when NO path matches (not an error); on 0/1
				// stdout still carries any matches.
				const err = e as { status?: number; stdout?: string | Buffer };
				if (err.stdout) return toPathSet(String(err.stdout));
				return new Set();
			}
		},
	};
}

/** Parse NUL-delimited `git check-ignore -z` output (drop the trailing empty). */
function toPathSet(out: string): ReadonlySet<string> {
	return new Set(out.split("\0").filter((s) => s.length > 0));
}
