import {
	compileWatch,
	DEFAULT_DEBOUNCE_MS,
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
import { formatWatchNotice } from "../watch-subscription.js";

export interface WatchStorePort {
	readWatches(id: SessionId): readonly WatchSubscription[];
	revision?(id: SessionId): number | null;
}

export interface PeerWatchManagerDeps {
	readonly store: WatchStorePort;
	readonly channel: DeliveryPort;
	readonly makeWatchDeps?: () => WatchDeps;
	readonly isAlive: (pid: number) => boolean;
	readonly log?: (line: string) => void;
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

	constructor(private readonly deps: PeerWatchManagerDeps) {}

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
		const watcher = new FolderWatcher(
			compiled,
			reconciler,
			DEFAULT_DEBOUNCE_MS,
			(notices) => {
				const body = formatWatchNotice(notices);
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
}

function watchKey(id: SessionId, sub: WatchSubscription): string {
	return `${id}\0${sub.dir}\0${sub.recursive === true ? "1" : "0"}\0${[...sub.patterns].sort().join("\0")}`;
}
