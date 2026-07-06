import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { WatchDeps } from "../../../file-watch-notify/watcher.js";
import { FsChannel } from "../../adapters/channel.js";
import { FakeDelivery } from "../../adapters/fakes.js";
import { FsRegistry } from "../../adapters/fs-registry.js";
import { Daemon } from "../../daemon.js";
import type { SessionDescriptor, WatchSubscription } from "../types.js";
import type { DaemonPorts } from "./loop.js";
import { PeerWatchManager, type WatchStorePort } from "./watch.js";

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/tmp/${over.id}`,
		eventsPath: `/tmp/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-07-06T00:00:00.000Z",
		harness: "claude",
		lifecycle: "bound",
		paneId: "%1",
		harnessSessionId: "sess",
		...over,
	};
}

function sub(over: Partial<WatchSubscription> = {}): WatchSubscription {
	return {
		dir: "/repo/src",
		patterns: ["**/*.ts"],
		recursive: true,
		addedAt: "2026-07-06T00:00:00.000Z",
		...over,
	};
}

function fakeWatchDeps(files: Array<{ rel: string; mtimeMs: number; size: number }>): {
	deps: WatchDeps;
	fire(): Promise<void>;
	disposed(): number;
} {
	let listener: (() => void) | undefined;
	let pending: (() => void) | undefined;
	let closeCount = 0;
	const deps: WatchDeps = {
		watch: (_dir, _opts, cb) => {
			listener = cb;
			return { close: () => closeCount++ };
		},
		listFiles: async () => files,
		now: () => 1000,
		setTimer: (fn) => {
			pending = fn;
			return () => {
				pending = undefined;
			};
		},
	};
	return {
		deps,
		fire: async () => {
			listener?.();
			pending?.();
			await Promise.resolve();
		},
		disposed: () => closeCount,
	};
}

class MemoryWatchStore implements WatchStorePort {
	rev: number | null = 1;
	reads = 0;
	constructor(public watches: readonly WatchSubscription[]) {}
	readWatches(): readonly WatchSubscription[] {
		this.reads += 1;
		return this.watches;
	}
	revision(): number | null {
		return this.rev;
	}
}

describe("PeerWatchManager", () => {
	it("reconciles non-pi sidecars into watchers and delivers coalesced notices", async () => {
		const store = new MemoryWatchStore([sub()]);
		const delivery = new FakeDelivery();
		const files: Array<{ rel: string; mtimeMs: number; size: number }> = [];
		const watch = fakeWatchDeps(files);
		const mgr = new PeerWatchManager({
			store,
			channel: delivery,
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		files.push({ rel: "a.ts", mtimeMs: 2, size: 10 });
		await watch.fire();
		expect(delivery.outbox).toHaveLength(1);
		expect(delivery.outbox[0]?.message).toMatchObject({
			from: "pij-watch",
			to: "pij-c",
			body: "[file-watch] a.ts created",
		});
	});

	it("filters pi peers and isolates delivery per peer", async () => {
		const store = new MemoryWatchStore([sub()]);
		const delivery = new FakeDelivery();
		const files: Array<{ rel: string; mtimeMs: number; size: number }> = [];
		const watch = fakeWatchDeps(files);
		const mgr = new PeerWatchManager({
			store,
			channel: delivery,
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
		});
		mgr.reconcile([
			desc({ id: "pij-p", harness: "pi" }),
			desc({ id: "pij-c", harness: "copilot" }),
		]);
		await mgr.settle();
		files.push({ rel: "b.ts", mtimeMs: 3, size: 1 });
		await watch.fire();
		expect(delivery.outbox.map((m) => m.message.to)).toEqual(["pij-c"]);
	});

	it("disposes removed subscriptions, missing descriptors, and pid-dead sessions", async () => {
		const store = new MemoryWatchStore([sub()]);
		const watch = fakeWatchDeps([]);
		const mgr = new PeerWatchManager({
			store,
			channel: new FakeDelivery(),
			makeWatchDeps: () => watch.deps,
			isAlive: (pid) => pid === 100,
		});
		mgr.reconcile([desc({ id: "pij-c", pid: 100 })]);
		await mgr.settle();
		expect(mgr.activeCount()).toBe(1);
		store.watches = [];
		store.rev = 2;
		mgr.reconcile([desc({ id: "pij-c", pid: 100 })]);
		expect(mgr.activeCount()).toBe(0);
		expect(watch.disposed()).toBe(1);

		store.watches = [sub()];
		store.rev = 3;
		mgr.reconcile([desc({ id: "pij-c", pid: 100 })]);
		await mgr.settle();
		mgr.reconcile([desc({ id: "pij-c", pid: 101 })]);
		expect(mgr.activeCount()).toBe(0);
	});

	it("mtime-gates sidecar reads while the revision is unchanged", () => {
		const store = new MemoryWatchStore([sub()]);
		const watch = fakeWatchDeps([]);
		const mgr = new PeerWatchManager({
			store,
			channel: new FakeDelivery(),
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		mgr.reconcile([desc({ id: "pij-c" })]);
		expect(store.reads).toBe(1);
		store.rev = 2;
		mgr.reconcile([desc({ id: "pij-c" })]);
		expect(store.reads).toBe(2);
	});
});

describe("Daemon receipt guard for synthetic watch sender", () => {
	it("does not create a phantom pij-watch inbox after a watch delivery is injected", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watch-test-"));
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-c",
				dataDir: join(home, "pij-c"),
				eventsPath: join(home, "pij-c", "events.ndjson"),
			}),
		);
		const delivered = new FsChannel(home).deliver({
			from: "pij-watch",
			to: "pij-c",
			body: "[file-watch] a.ts modified",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		const ports: DaemonPorts = {
			capturePane: () => "⏵⏵ auto mode on",
			isPaneDead: () => false,
			sendText: () => "confirmed",
			sendKey: () => {},
			killPane: () => {},
			listTranscripts: () => [],
			home: () => home,
			now: () => 1000,
			isAlive: () => true,
		};
		try {
			new Daemon(home, ports, registry, new FsChannel(home)).tick();
			let names: string[] = [];
			try {
				names = readdirSync(join(home, "pij-watch", "inbox"));
			} catch {
				names = [];
			}
			expect(names).toEqual([]);
			const consumed = readdirSync(join(home, "pij-c", "inbox")).filter((n) =>
				n.startsWith("msg-"),
			);
			expect(consumed).toHaveLength(0);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
