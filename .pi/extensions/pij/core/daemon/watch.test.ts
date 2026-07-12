import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { WatchDeps } from "../../../file-watch-notify/watcher.js";
import { FsChannel } from "../../adapters/channel.js";
import { FakeDelivery } from "../../adapters/fakes.js";
import { FsRegistry } from "../../adapters/fs-registry.js";
import { Daemon } from "../../daemon.js";
import type { SessionDescriptor, WatchSubscription } from "../types.js";
import type { DaemonPorts } from "./loop.js";
import { type GitPort, PeerWatchManager, type WatchStorePort } from "./watch.js";

/** A never-a-repo git port — keeps unit tests hermetic (no `git` subprocess). */
const NO_GIT: GitPort = { repoRoot: () => null, checkIgnore: () => new Set() };

/** Shared throwaway pijHome so pointer writes / cleanup never touch real ~/.pij. */
const TEST_HOME = mkdtempSync(join(tmpdir(), "pij-watch-home-"));
afterAll(() => rmSync(TEST_HOME, { recursive: true, force: true }));

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

interface FakeFile {
	rel: string;
	mtimeMs: number;
	size: number;
	content?: string;
}

function fakeWatchDeps(files: FakeFile[]): {
	deps: WatchDeps;
	fire(): Promise<void>;
	disposed(): number;
	timerDelays(): readonly number[];
} {
	let listener: (() => void) | undefined;
	let pending: (() => void) | undefined;
	let closeCount = 0;
	const delays: number[] = [];
	const deps: WatchDeps = {
		watch: (_dir, _opts, cb) => {
			listener = cb;
			return { close: () => closeCount++ };
		},
		listFiles: async () => files.map((f) => ({ ...f })),
		now: () => 1000,
		setTimer: (fn, ms) => {
			delays.push(ms);
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
		timerDelays: () => delays,
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
			pijHome: TEST_HOME,
			git: NO_GIT,
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
			pijHome: TEST_HOME,
			git: NO_GIT,
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
			pijHome: TEST_HOME,
			git: NO_GIT,
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
			pijHome: TEST_HOME,
			git: NO_GIT,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		mgr.reconcile([desc({ id: "pij-c" })]);
		expect(store.reads).toBe(1);
		store.rev = 2;
		mgr.reconcile([desc({ id: "pij-c" })]);
		expect(store.reads).toBe(2);
	});

	it("uses a 750ms default and restarts the watcher when debounce cadence changes", async () => {
		const store = new MemoryWatchStore([sub()]);
		const watches: ReturnType<typeof fakeWatchDeps>[] = [];
		const mgr = new PeerWatchManager({
			store,
			channel: new FakeDelivery(),
			makeWatchDeps: () => {
				const watch = fakeWatchDeps([]);
				watches.push(watch);
				return watch.deps;
			},
			isAlive: () => true,
			pijHome: TEST_HOME,
			git: NO_GIT,
		});

		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		await watches[0]?.fire();
		expect(watches[0]?.timerDelays()).toEqual([750]);

		store.watches = [sub({ debounceMs: 2000 })];
		store.rev = 2;
		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		expect(mgr.activeCount()).toBe(1);
		expect(watches).toHaveLength(2);
		expect(watches[0]?.disposed()).toBe(1);

		await watches[1]?.fire();
		expect(watches[1]?.timerDelays()).toEqual([2000]);
	});
});

describe("PeerWatchManager — modes (AC-02, AC-08, AC-11)", () => {
	it("keeps a notify and a diff sub on the same glob as distinct watchers (AC-08)", async () => {
		const store = new MemoryWatchStore([sub(), sub({ mode: "diff" })]);
		const watch = fakeWatchDeps([]);
		const mgr = new PeerWatchManager({
			store,
			channel: new FakeDelivery(),
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
			pijHome: TEST_HOME,
			git: NO_GIT,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		expect(mgr.activeCount()).toBe(2);
	});

	it("notify renders ranges; diff pointer-delivers a unified diff (AC-01, AC-02)", async () => {
		for (const mode of ["notify", "diff"] as const) {
			const store = new MemoryWatchStore([sub({ mode })]);
			const delivery = new FakeDelivery();
			const files: FakeFile[] = [{ rel: "a.ts", mtimeMs: 1, size: 5, content: "one\ntwo\n" }];
			const watch = fakeWatchDeps(files);
			const mgr = new PeerWatchManager({
				store,
				channel: delivery,
				makeWatchDeps: () => watch.deps,
				isAlive: () => true,
				pijHome: TEST_HOME,
				git: NO_GIT,
			});
			mgr.reconcile([desc({ id: "pij-c" })]);
			await mgr.settle();
			files[0] = { rel: "a.ts", mtimeMs: 2, size: 6, content: "one\nTWO\n" };
			await watch.fire();
			const body = delivery.outbox[0]?.message.body ?? "";
			if (mode === "notify") {
				expect(body).toBe("[file-watch] a.ts modified (+1/-1) lines 2");
			} else {
				const pointerPath = join(TEST_HOME, "pij-c", "watch-diffs", "a.ts.diff");
				expect(body).toBe(`[file-watch] a.ts modified (+1/-1) — diff: ${pointerPath}`);
				expect(readFileSync(pointerPath, "utf8")).toContain("+TWO");
				expect(readFileSync(pointerPath, "utf8")).toContain("-two");
			}
		}
	});

	it("deleted is always a plain notice, no diff (AC-11)", async () => {
		const store = new MemoryWatchStore([sub({ mode: "diff" })]);
		const delivery = new FakeDelivery();
		const files: FakeFile[] = [{ rel: "a.ts", mtimeMs: 1, size: 5, content: "x\n" }];
		const watch = fakeWatchDeps(files);
		const mgr = new PeerWatchManager({
			store,
			channel: delivery,
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
			pijHome: TEST_HOME,
			git: NO_GIT,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		files.length = 0; // file removed
		await watch.fire();
		expect(delivery.outbox[0]?.message.body).toBe("[file-watch] a.ts deleted");
	});
});

describe("PeerWatchManager — computed-diff pointer delivery (WS-001, AC-05)", () => {
	async function bigWatch(id: string, home: string) {
		const store = new MemoryWatchStore([sub({ mode: "diff" })]);
		const delivery = new FakeDelivery();
		const files: FakeFile[] = [];
		const watch = fakeWatchDeps(files);
		const mgr = new PeerWatchManager({
			store,
			channel: delivery,
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
			pijHome: home,
			git: NO_GIT,
		});
		mgr.reconcile([desc({ id })]);
		await mgr.settle();
		return { store, delivery, files, watch, mgr };
	}

	it("writes computed diffs to a pointer file overwritten in place", async () => {
		const home = mkdtempSync(join(tmpdir(), "pij-ptr-"));
		try {
			const { delivery, files, watch } = await bigWatch("pij-c", home);
			const big = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
			files.push({ rel: "big.ts", mtimeMs: 2, size: big.length, content: `${big}\n` });
			await watch.fire();
			const body = delivery.outbox[0]?.message.body ?? "";
			const pointerPath = join(home, "pij-c", "watch-diffs", "big.ts.diff");
			expect(body).toContain(`— diff: ${pointerPath}`);
			expect(body).not.toContain("+line 0"); // not inlined
			expect(readFileSync(pointerPath, "utf8")).toContain("+line 0");

			const big2 = Array.from({ length: 120 }, (_, i) => `L ${i}`).join("\n");
			files[0] = { rel: "big.ts", mtimeMs: 3, size: big2.length, content: `${big2}\n` };
			await watch.fire();
			expect(readdirSync(join(home, "pij-c", "watch-diffs"))).toEqual(["big.ts.diff"]);
			expect(readFileSync(pointerPath, "utf8")).toContain("+L 0");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("removes watch-diffs/ when the session's last watch is unwatched", async () => {
		const home = mkdtempSync(join(tmpdir(), "pij-ptr2-"));
		try {
			const { store, files, watch, mgr } = await bigWatch("pij-c", home);
			const big = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
			files.push({ rel: "big.ts", mtimeMs: 2, size: big.length, content: `${big}\n` });
			await watch.fire();
			expect(readdirSync(join(home, "pij-c", "watch-diffs"))).toHaveLength(1);
			store.watches = [];
			store.rev = 2;
			mgr.reconcile([desc({ id: "pij-c" })]);
			let existed = true;
			try {
				readdirSync(join(home, "pij-c", "watch-diffs"));
			} catch {
				existed = false;
			}
			expect(existed).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

describe("PeerWatchManager — .gitignore honoring (WS-002, AC-07)", () => {
	it("drops changes git check-ignore matches; keeps tracked ones", async () => {
		const store = new MemoryWatchStore([sub({ dir: "/repo/src" })]);
		const delivery = new FakeDelivery();
		const files: FakeFile[] = [];
		const watch = fakeWatchDeps(files);
		const git: GitPort = {
			repoRoot: () => "/repo",
			checkIgnore: (_root, abs) => new Set(abs.filter((p) => p.includes("node_modules"))),
		};
		const mgr = new PeerWatchManager({
			store,
			channel: delivery,
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
			pijHome: TEST_HOME,
			git,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		files.push({ rel: "a.ts", mtimeMs: 2, size: 3 });
		files.push({ rel: "node_modules/x.ts", mtimeMs: 2, size: 3 });
		await watch.fire();
		expect(delivery.outbox).toHaveLength(1);
		expect(delivery.outbox[0]?.message.body).toBe("[file-watch] a.ts created");
	});

	it("outside a repo (repoRoot null) delivers unchanged, no error (AC-07)", async () => {
		const store = new MemoryWatchStore([sub()]);
		const delivery = new FakeDelivery();
		const files: FakeFile[] = [];
		const watch = fakeWatchDeps(files);
		const mgr = new PeerWatchManager({
			store,
			channel: delivery,
			makeWatchDeps: () => watch.deps,
			isAlive: () => true,
			pijHome: TEST_HOME,
			git: NO_GIT,
		});
		mgr.reconcile([desc({ id: "pij-c" })]);
		await mgr.settle();
		files.push({ rel: "a.ts", mtimeMs: 2, size: 3 });
		await watch.fire();
		expect(delivery.outbox).toHaveLength(1);
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
			const targetInbox = join(home, "pij-c", "inbox");
			const targetNames = readdirSync(targetInbox);
			const retained = targetNames.filter((n) => n.startsWith("msg-"));
			expect(retained).toHaveLength(1);
			const message = JSON.parse(readFileSync(join(targetInbox, retained[0] ?? ""), "utf8")) as {
				messageId: string;
			};
			expect(targetNames).toContain(`read-${message.messageId}.json`);
			const unread = new FsChannel(home).listUnread("pij-c");
			if (!unread.ok) throw new Error(unread.message);
			expect(unread.value).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
