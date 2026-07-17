import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FsChannel } from "../../adapters/channel.js";
import {
	FakeDelivery,
	FakeEventLog,
	FakeProcess,
	FakeRegistry,
	FakeTmux,
} from "../../adapters/fakes.js";
import { FsRegistry } from "../../adapters/fs-registry.js";
import { FsWatchdogStore } from "../../adapters/watchdog-store.js";
import { Daemon } from "../../daemon.js";
import { dispatch, parseArgs, type WatchdogCliStore } from "../cli.js";
import type { PiRuntimePort } from "../ports.js";
import { PijSession } from "../session.js";
import { buildSpawnCommand, parseSpawnArgs } from "../spawn.js";
import type { PijMessage, SessionDescriptor, WatchdogSidecar, WatchdogWatcher } from "../types.js";
import type { DaemonPorts } from "./loop.js";
import { pauseForCompactMessage } from "./router.js";
import {
	WatchdogManager,
	type WatchdogResponseEvent,
	type WatchdogStorePort,
} from "./watchdog-manager.js";

const STARTED_AT = "1970-01-01T00:00:00.000Z";
const READY_PANE = `
 ❯ Try "edit <filepath> to..."

 ~/repo ⎇ main • Sonnet 4.6 • ⚡high
 ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
`;
const BUSY_PANE = `
 ⏺ Working on it…

   Searching the codebase (esc to interrupt)
`;

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/tmp/${over.id}`,
		eventsPath: `/tmp/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: STARTED_AT,
		harness: "claude",
		lifecycle: "bound",
		paneId: "%1",
		harnessSessionId: "native",
		state: "idle",
		lastEventAt: STARTED_AT,
		...over,
	};
}

class MemoryWatchdogStore implements WatchdogStorePort, WatchdogCliStore {
	readonly sidecars = new Map<string, WatchdogSidecar>();
	readonly revisions = new Map<string, number>();
	readonly writes: Array<{ id: string; sidecar: WatchdogSidecar }> = [];
	readonly captures: Array<{
		watcherId: string;
		targetId: string;
		nowMs: number;
		content: string;
		path: string;
	}> = [];
	readonly order: string[] = [];
	reads = 0;

	read(id: string): WatchdogSidecar | undefined {
		this.reads += 1;
		return this.sidecars.get(id);
	}

	write(id: string, sidecar: WatchdogSidecar): void {
		this.order.push(`write:${id}:${sidecar.pausedBy ?? "active"}`);
		this.sidecars.set(id, sidecar);
		this.writes.push({ id, sidecar });
		this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
	}

	revision(id: string): number | null {
		return this.revisions.get(id) ?? null;
	}

	writeCapture(watcherId: string, targetId: string, nowMs: number, content: string): string {
		const path = `/pij/${watcherId}/watchdog-captures/${nowMs}-${targetId}.txt`;
		this.captures.push({ watcherId, targetId, nowMs, content, path });
		return path;
	}
}

interface ManagerHarness {
	readonly manager: WatchdogManager;
	readonly store: MemoryWatchdogStore;
	readonly delivery: FakeDelivery;
	readonly sent: Array<{ id: string; body: string }>;
	readonly events: string[];
	readonly fires: Array<{ id: string; atMs: number }>;
	readonly responses: WatchdogResponseEvent[];
	setNow(value: number): void;
	setPane(id: string, value: string): void;
}

function managerHarness(): ManagerHarness {
	const store = new MemoryWatchdogStore();
	const delivery = new FakeDelivery();
	const sent: Array<{ id: string; body: string }> = [];
	const events: string[] = [];
	const fires: Array<{ id: string; atMs: number }> = [];
	const responses: WatchdogResponseEvent[] = [];
	const panes = new Map<string, string>();
	let nowMs = 0;
	const manager = new WatchdogManager({
		store,
		channel: delivery,
		isAlive: () => true,
		now: () => nowMs,
		capturePane: (session) => {
			events.push(`capture:${session.id}`);
			return panes.get(session.id) ?? "idle pane";
		},
		sendText: (session, body) => {
			events.push(`send:${session.id}`);
			sent.push({ id: session.id, body });
		},
		onFire: (session, atMs) => fires.push({ id: session.id, atMs }),
		onResponse: (event) => responses.push(event),
	});
	return {
		manager,
		store,
		delivery,
		sent,
		events,
		fires,
		responses,
		setNow: (value) => {
			nowMs = value;
		},
		setPane: (id, value) => panes.set(id, value),
	};
}

function intervalSidecar(
	intervalMs = 100,
	watchers: readonly WatchdogWatcher[] = [],
): WatchdogSidecar {
	return { intervalMs, watchers };
}

describe("WatchdogManager — reconciliation and delivery", () => {
	it("captures before a due tmux fire, increments ordinals, and stamps through its callback", () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-tmux", intervalSidecar());
		h.store.revisions.set("pij-tmux", 1);
		h.setNow(100);
		h.manager.reconcile([desc({ id: "pij-tmux" })]);
		expect(h.events).toEqual(["capture:pij-tmux", "send:pij-tmux"]);
		expect(h.sent[0]?.body).toContain("[pij watchdog #1 for pij-tmux]");
		expect(h.fires).toEqual([{ id: "pij-tmux", atMs: 100 }]);

		h.setNow(200);
		h.manager.reconcile([desc({ id: "pij-tmux" })]);
		expect(h.sent[1]?.body).toContain("[pij watchdog #2 for pij-tmux]");
	});

	it("delivers pi turns through the inbox channel and never captures a missing pane", () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-pi", intervalSidecar());
		h.store.revisions.set("pij-pi", 1);
		h.setNow(100);
		h.manager.reconcile([
			desc({ id: "pij-pi", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		expect(h.sent).toEqual([]);
		expect(h.events).toEqual([]);
		expect(h.delivery.outbox[0]?.message).toMatchObject({
			from: "pij-watchdog",
			to: "pij-pi",
		});
		expect(h.delivery.outbox[0]?.message.body).toContain(
			"Pane capture unavailable; watching event activity only.",
		);
	});

	it("skips pre-bind, failed, dead, paused, and exempt sessions", () => {
		const h = managerHarness();
		for (const [id, sidecar] of [
			["paused", { intervalMs: 1, pausedBy: "self" }],
			["exempt", { intervalMs: 1, pausedBy: "exempt" }],
		] as const) {
			h.store.sidecars.set(id, sidecar);
			h.store.revisions.set(id, 1);
		}
		h.setNow(10_000);
		const deadManager = new WatchdogManager({
			store: h.store,
			channel: h.delivery,
			isAlive: (pid) => pid !== 999,
			now: () => 10_000,
			capturePane: () => "pane",
			sendText: (session, body) => h.sent.push({ id: session.id, body }),
		});
		deadManager.reconcile([
			desc({ id: "pending", lifecycle: "pending" }),
			desc({ id: "failed", lifecycle: "failed" }),
			desc({ id: "dead", pid: 999 }),
			desc({ id: "paused" }),
			desc({ id: "exempt" }),
		]);
		expect(h.sent).toEqual([]);
		// Paused/exempt peers remain reconciled so a sidecar revision or real
		// working transition can resume them; the other three are discarded.
		expect(deadManager.activeCount()).toBe(2);
	});

	it("mtime-gates sidecar reads until the revision changes", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(10_000));
		h.store.revisions.set("peer", 1);
		h.manager.reconcile([desc({ id: "peer" })]);
		h.manager.reconcile([desc({ id: "peer" })]);
		expect(h.store.reads).toBe(1);
		h.store.revisions.set("peer", 2);
		h.manager.reconcile([desc({ id: "peer" })]);
		expect(h.store.reads).toBe(2);
	});

	it("drops runtime state when a session closes or disappears", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar());
		h.store.revisions.set("peer", 1);
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		expect(h.manager.activeCount()).toBe(1);
		h.manager.reconcile([]);
		expect(h.manager.activeCount()).toBe(0);
		h.manager.reconcile([desc({ id: "peer", lifecycle: "dissolved" })]);
		expect(h.manager.activeCount()).toBe(0);
	});
});

describe("WatchdogManager — attribution, response, and compact recovery", () => {
	it("keeps combined watchdog-attributable pane, event, and working changes silent", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar());
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "idle pane");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);

		h.setPane("peer", "watchdog turn\nworking footer");
		h.setNow(200);
		h.manager.reconcile([
			desc({
				id: "peer",
				state: "working",
				lastEventAt: new Date(150).toISOString(),
				lastWatchdogFireAt: new Date(100).toISOString(),
			}),
		]);
		expect(h.responses.at(-1)?.response).toBe("suspect");

		h.setNow(300);
		h.manager.reconcile([
			desc({
				id: "peer",
				state: "working",
				lastEventAt: new Date(150).toISOString(),
				lastWatchdogFireAt: new Date(200).toISOString(),
			}),
		]);
		expect(h.responses.at(-1)?.response).toBe("stalled");
	});

	it("does not credit the idle return edge of a watchdog-caused working transition", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar());
		h.store.revisions.set("peer", 1);
		const peer = desc({ id: "peer", harness: "pi", lifecycle: undefined, paneId: undefined });
		h.setNow(100);
		h.manager.reconcile([peer]);

		h.setNow(101);
		h.manager.reconcile([
			{ ...peer, state: "working", lastWatchdogFireAt: new Date(100).toISOString() },
		]);
		h.setNow(102);
		h.manager.reconcile([
			{ ...peer, state: "idle", lastWatchdogFireAt: new Date(100).toISOString() },
		]);
		expect(h.responses).toEqual([]);

		h.setNow(200);
		h.manager.reconcile([
			{ ...peer, state: "idle", lastWatchdogFireAt: new Date(100).toISOString() },
		]);
		expect(h.responses.at(-1)?.response).toBe("suspect");
	});

	it("recognises later real activity, clears the streak, and auto-resumes compact only on real work", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", { intervalMs: 100, pausedBy: "compact", pausedAtMs: 1 });
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "idle");
		h.setNow(10);
		h.manager.reconcile([desc({ id: "peer" })]);
		expect(h.store.read("peer")?.pausedBy).toBe("compact");

		h.setPane("peer", "real work");
		h.setNow(20);
		h.manager.reconcile([desc({ id: "peer", state: "working" })]);
		expect(h.store.read("peer")?.pausedBy).toBeUndefined();
		expect(h.responses.at(-1)?.response).toBe("responsive");

		h.store.write("peer", { intervalMs: 100, pausedBy: "self", pausedAtMs: 30 });
		h.setPane("peer", "more work");
		h.setNow(40);
		h.manager.reconcile([desc({ id: "peer", state: "idle" })]);
		h.manager.reconcile([desc({ id: "peer", state: "working" })]);
		expect(h.store.read("peer")?.pausedBy).toBe("self");
	});

	it("marks only the first post-fire pane mutation as watchdog-attributable", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar());
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "before");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		expect(h.manager.isPaneChangeWatchdogAttributed("peer", "after watchdog")).toBe(true);
		h.setPane("peer", "after watchdog");
		h.setNow(110);
		h.manager.reconcile([desc({ id: "peer", state: "working" })]);
		expect(h.manager.isPaneChangeWatchdogAttributed("peer", "real later output")).toBe(false);
	});
});

describe("WatchdogManager — watcher captures", () => {
	const watcher: WatchdogWatcher = {
		watcherId: "owner",
		addedAt: "2026-07-17T00:00:00.000Z",
		capture: { mode: "anomaly", maxLines: 2, maxBytes: 64 },
	};

	it("writes an always-mode capture on a healthy first due fire", () => {
		const h = managerHarness();
		const alwaysWatcher: WatchdogWatcher = {
			...watcher,
			capture: { mode: "always", maxLines: 2, maxBytes: 64 },
		};
		h.store.sidecars.set("peer", intervalSidecar(100, [alwaysWatcher]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "healthy\nidle");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);

		expect(h.store.captures).toEqual([
			expect.objectContaining({ watcherId: "owner", targetId: "peer", content: "healthy\nidle" }),
		]);
		const notice =
			h.delivery.outbox.find((item) => item.message.to === "owner")?.message.body ?? "";
		expect(notice).toContain("watchdog responsive: peer");
	});

	it("writes an anomaly pointer from the pre-injection pane and includes at most five head lines", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcher]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "one\ntwo\nthree");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		h.events.length = 0;
		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", lastWatchdogFireAt: new Date(100).toISOString() })]);

		expect(h.events).toEqual(["capture:peer", "send:peer"]);
		expect(h.store.captures[0]).toMatchObject({
			watcherId: "owner",
			targetId: "peer",
			content: "two\nthree",
		});
		const notice =
			h.delivery.outbox.find((item) => item.message.to === "owner")?.message.body ?? "";
		expect(notice).toContain("watchdog suspect: peer");
		expect(notice).toContain(h.store.captures[0]?.path);
		expect(notice).toContain("two\nthree");
		expect(notice.split("\n").slice(2)).toHaveLength(2);
	});

	it("reports capture-n/a for a paneless pi target", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcher]));
		h.store.revisions.set("peer", 1);
		const peer = desc({ id: "peer", harness: "pi", lifecycle: undefined, paneId: undefined });
		h.setNow(100);
		h.manager.reconcile([peer]);
		h.setNow(200);
		h.manager.reconcile([{ ...peer, lastWatchdogFireAt: new Date(100).toISOString() }]);
		const notice =
			h.delivery.outbox.find((item) => item.message.to === "owner")?.message.body ?? "";
		expect(notice).toContain("capture unavailable (paneless target)");
		expect(h.store.captures).toEqual([]);
	});

	it("notifies an anomaly watcher once per stalled episode and again after recovery", () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcher]));
		h.store.revisions.set("peer", 1);
		const peer = desc({ id: "peer", harness: "pi", lifecycle: undefined, paneId: undefined });
		const stalledNoticeCount = () =>
			h.delivery.outbox.filter(
				(item) => item.message.to === "owner" && item.message.body.startsWith("watchdog stalled:"),
			).length;

		for (const nowMs of [100, 200, 300, 400]) {
			h.setNow(nowMs);
			h.manager.reconcile([peer]);
		}
		expect(stalledNoticeCount()).toBe(1);

		const attributed = { ...peer, lastEventAt: new Date(401).toISOString() };
		h.setNow(401);
		h.manager.reconcile([attributed]);
		const recovered = { ...peer, lastEventAt: new Date(402).toISOString() };
		h.setNow(402);
		h.manager.reconcile([recovered]);
		for (const nowMs of [502, 602, 702]) {
			h.setNow(nowMs);
			h.manager.reconcile([recovered]);
		}
		expect(stalledNoticeCount()).toBe(2);
	});
});

const TEMP_DIRS: string[] = [];
afterEach(() => {
	for (const dir of TEMP_DIRS.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("FsWatchdogStore", () => {
	it("round-trips a validated sidecar, exposes revision, and writes bounded capture pointers", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-store-"));
		TEMP_DIRS.push(home);
		const store = new FsWatchdogStore(home);
		expect(store.read("peer")).toBeUndefined();
		expect(store.revision("peer")).toBeNull();
		const sidecar = intervalSidecar(123, [
			{
				watcherId: "owner",
				addedAt: "2026-07-17T00:00:00.000Z",
				capture: { mode: "always", maxLines: 5, maxBytes: 100 },
			},
		]);
		store.write("peer", sidecar);
		expect(store.read("peer")).toEqual(sidecar);
		expect(store.revision("peer")).toEqual(expect.any(Number));
		const pointer = store.writeCapture("owner", "peer", 123, "pane tail");
		expect(pointer).toBe(join(home, "owner", "watchdog-captures", "123-peer.txt"));
		expect(readFileSync(pointer, "utf8")).toBe("pane tail");
	});
});

describe("compact seams", () => {
	it("router applies compact pause only to compact commands and preserves stronger tiers", () => {
		const compact: PijMessage = { from: "a", to: "b", body: "", command: "compact" };
		expect(pauseForCompactMessage(compact, undefined, 10)).toEqual({
			pausedBy: "compact",
			pausedAtMs: 10,
		});
		expect(
			pauseForCompactMessage({ from: "a", to: "b", body: "hi" }, undefined, 10),
		).toBeUndefined();
		const exempt: WatchdogSidecar = { pausedBy: "exempt", pausedAtMs: 1 };
		expect(pauseForCompactMessage(compact, exempt, 10)).toBe(exempt);
	});

	it("daemon tmux delivery persists compact pause before injecting --command compact", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-compact-"));
		TEMP_DIRS.push(home);
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "peer",
				dataDir: join(home, "peer"),
				eventsPath: join(home, "peer", "events.ndjson"),
			}),
		);
		registry.write(
			desc({
				id: "owner",
				harness: "pi",
				lifecycle: undefined,
				paneId: undefined,
				dataDir: join(home, "owner"),
				eventsPath: join(home, "owner", "events.ndjson"),
			}),
		);
		const channel = new FsChannel(home);
		const delivered = channel.deliver({
			from: "owner",
			to: "peer",
			body: "",
			command: "compact",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		const observed: string[] = [];
		const ports: DaemonPorts = {
			capturePane: () => "idle pane",
			isPaneDead: () => false,
			sendText: (_pane, text) => {
				observed.push(`${new FsWatchdogStore(home).read("peer")?.pausedBy}:${text}`);
				return "confirmed";
			},
			sendKey: () => {},
			killPane: () => {},
			listTranscripts: () => [],
			home: () => home,
			now: () => 100,
			isAlive: () => true,
		};
		new Daemon(home, ports, registry, channel).tick();
		expect(observed).toContain("compact:/compact");
		expect(new FsWatchdogStore(home).read("peer")?.pausedBy).toBe("compact");

		const bare = parseArgs(["send", "peer", "/compact"]);
		expect(bare).toMatchObject({ ok: true, value: { command: "compact", text: undefined } });
	});

	it("pi inbound persists compact pause before calling the runtime and resumes on turn start", () => {
		const store = new MemoryWatchdogStore();
		const order = store.order;
		const pi: PiRuntimePort = {
			isIdle: () => true,
			inject: () => {},
			compact: () => order.push("compact"),
			control: () => true,
		};
		const registry = new FakeRegistry();
		const session = new PijSession({
			registry,
			eventLog: new FakeEventLog(),
			delivery: new FakeDelivery(),
			pi,
			process: new FakeProcess(1, 10),
			tmux: new FakeTmux(),
			watchdog: store,
		});
		session.boot({
			id: "peer",
			folder: "/repo",
			dataDir: "/tmp/peer",
			eventsPath: "/tmp/peer/events.ndjson",
			harness: "pi",
		});
		session.onInbound({ from: "owner", to: "peer", body: "", command: "compact" }, "m1");
		expect(order.slice(0, 2)).toEqual(["write:peer:compact", "compact"]);
		expect(store.read("peer")?.pausedBy).toBe("compact");
		session.onTurnStart(new Date(20).toISOString());
		expect(store.read("peer")?.pausedBy).toBeUndefined();
	});
});

describe("watchdog CLI and state surfaces", () => {
	function cliHarness() {
		const caller = desc({ id: "caller", harness: "pi", lifecycle: undefined });
		const target = desc({ id: "target", lastWatchdogFireAt: new Date(50).toISOString() });
		const registry = new FakeRegistry([caller, target]);
		const watchdog = new MemoryWatchdogStore();
		const process = new FakeProcess(10, 100, { PIJ_SESSION_ID: "caller" });
		return {
			registry,
			watchdog,
			deps: {
				registry,
				eventLogFor: () => new FakeEventLog(),
				delivery: new FakeDelivery(),
				process,
				cwd: "/repo",
				pijHome: "/tmp/pij",
				watchdogStore: watchdog,
			},
		};
	}

	it("parses every watchdog verb and capture policy", () => {
		for (const argv of [
			["watchdog", "status", "target"],
			["watchdog", "pause", "target"],
			["watchdog", "resume", "target"],
			["watchdog", "exempt", "target"],
			["watchdog", "unwatch", "target"],
			["watchdog", "list"],
		]) {
			expect(parseArgs(argv).ok).toBe(true);
		}
		const watch = parseArgs([
			"watchdog",
			"watch",
			"target",
			"--capture",
			"always",
			"--max-lines",
			"5",
			"--max-bytes",
			"100",
		]);
		expect(watch).toMatchObject({
			ok: true,
			value: {
				verb: "watchdog",
				action: "watch",
				id: "target",
				capture: { mode: "always", maxLines: 5, maxBytes: 100 },
			},
		});
	});

	it("mutates pause tiers and manages the caller's watcher subscription", () => {
		const h = cliHarness();
		for (const action of ["pause", "resume", "exempt"] as const) {
			const parsed = parseArgs(["watchdog", action, "target"]);
			if (!parsed.ok) throw new Error(parsed.message);
			expect(dispatch(parsed.value, h.deps).exitCode).toBe(0);
		}
		expect(h.watchdog.read("target")?.pausedBy).toBe("exempt");

		const watch = parseArgs(["watchdog", "watch", "target", "--capture", "anomaly"]);
		if (!watch.ok) throw new Error(watch.message);
		dispatch(watch.value, h.deps);
		expect(h.watchdog.read("target")?.watchers).toEqual([
			expect.objectContaining({ watcherId: "caller", capture: { mode: "anomaly" } }),
		]);
		const unwatch = parseArgs(["watchdog", "unwatch", "target"]);
		if (!unwatch.ok) throw new Error(unwatch.message);
		dispatch(unwatch.value, h.deps);
		expect(h.watchdog.read("target")?.watchers).toEqual([]);
	});

	it("rejects pause after exemption without weakening the tier", () => {
		const h = cliHarness();
		h.watchdog.sidecars.set("target", { pausedBy: "exempt", pausedAtMs: 1 });
		const parsed = parseArgs(["watchdog", "pause", "target"]);
		if (!parsed.ok) throw new Error(parsed.message);
		const result = dispatch(parsed.value, h.deps);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("exempt");
		expect(h.watchdog.read("target")).toEqual({ pausedBy: "exempt", pausedAtMs: 1 });
	});

	it("adds the watchdog envelope to status, state --json, and list --json", () => {
		const h = cliHarness();
		h.watchdog.sidecars.set("target", {
			intervalMs: 500,
			pausedBy: "self",
			watchers: [{ watcherId: "caller", addedAt: "2026-07-17T00:00:00.000Z", capture: {} }],
		});
		for (const argv of [
			["watchdog", "status", "target", "--json"],
			["state", "target", "--json"],
			["list", "--json"],
		]) {
			const parsed = parseArgs(argv);
			if (!parsed.ok) throw new Error(parsed.message);
			const output = JSON.parse(dispatch(parsed.value, h.deps).stdout) as
				| { watchdog?: Record<string, unknown> }
				| Array<{ id: string; watchdog?: Record<string, unknown> }>;
			const block = Array.isArray(output)
				? output.find((row) => row.id === "target")?.watchdog
				: output.watchdog;
			expect(block).toMatchObject({
				enabled: true,
				intervalMs: 500,
				pausedBy: "self",
				exempt: false,
				lastFireAt: new Date(50).toISOString(),
				watchers: ["caller"],
			});
		}
	});
});

describe("spawn exemption parsing", () => {
	it("accepts --no-watchdog and threads the pi child exemption marker", () => {
		expect(parseSpawnArgs(["--harness", "claude", "--no-watchdog"])).toMatchObject({
			ok: true,
			value: { harness: "claude", noWatchdog: true },
		});
		expect(
			buildSpawnCommand({
				spawnId: "s1",
				announceTo: "owner",
				cwd: "/repo",
				role: "worker",
				noWatchdog: true,
			}).env.PIJ_NO_WATCHDOG,
		).toBe("1");
	});

	it("pi boot persists an exempt sidecar when the spawn marker is present", () => {
		const store = new MemoryWatchdogStore();
		const session = new PijSession({
			registry: new FakeRegistry(),
			eventLog: new FakeEventLog(),
			delivery: new FakeDelivery(),
			pi: {
				isIdle: () => true,
				inject: () => {},
				compact: () => {},
				control: () => true,
			},
			process: new FakeProcess(1, 50, { PIJ_NO_WATCHDOG: "1" }),
			tmux: new FakeTmux(),
			watchdog: store,
		});
		session.boot({
			id: "peer",
			folder: "/repo",
			dataDir: "/tmp/peer",
			eventsPath: "/tmp/peer/events.ndjson",
			harness: "pi",
		});
		expect(store.read("peer")).toMatchObject({ pausedBy: "exempt", pausedAtMs: 50 });
	});
});

describe("Daemon watchdog mount and shared stalled latch", () => {
	it("keeps an idle watchdog stall latched until real recovery and notices once", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-idle-stall-"));
		TEMP_DIRS.push(home);
		const registry = new FakeRegistry([
			desc({ id: "peer", spawnedBy: "owner", state: "idle", lastEventAt: STARTED_AT }),
			desc({ id: "owner", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		new FsWatchdogStore(home).write("peer", {
			intervalMs: 100,
			watchers: [
				{
					watcherId: "watcher",
					addedAt: STARTED_AT,
					capture: { mode: "anomaly" },
				},
			],
		});
		const delivery = new FakeDelivery();
		let nowMs = 100;
		const ports: DaemonPorts = {
			capturePane: () => READY_PANE,
			isPaneDead: () => false,
			sendText: () => "confirmed",
			sendKey: () => {},
			killPane: () => {},
			listTranscripts: () => [],
			home: () => home,
			now: () => nowMs,
			isAlive: () => true,
		};
		const daemon = new Daemon(home, ports, registry, delivery);
		for (nowMs of [100, 200, 300]) daemon.tick();
		expect(registry.read("peer")?.failureReason).toBe("stalled");
		const notices = delivery.outbox.filter(
			(item) => item.message.to === "owner" && item.message.body.includes("stalled"),
		);
		expect(notices).toHaveLength(1);

		nowMs = 301;
		daemon.tick();
		expect(registry.read("peer")?.failureReason).toBe("stalled");
		nowMs = 400;
		daemon.tick();
		expect(
			delivery.outbox.filter(
				(item) => item.message.to === "owner" && item.message.body.includes("stalled"),
			),
		).toHaveLength(1);
		expect(
			delivery.outbox.filter(
				(item) =>
					item.message.to === "watcher" && item.message.body.startsWith("watchdog stalled:"),
			),
		).toHaveLength(1);
	});

	it("stamps a watchdog-only stalled verdict on a root session", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-root-stall-"));
		TEMP_DIRS.push(home);
		const registry = new FakeRegistry([
			desc({ id: "root", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		new FsWatchdogStore(home).write("root", { intervalMs: 1 });
		let nowMs = 1;
		const daemon = new Daemon(
			home,
			{
				capturePane: () => "",
				isPaneDead: () => false,
				sendText: () => "confirmed",
				sendKey: () => {},
				killPane: () => {},
				listTranscripts: () => [],
				home: () => home,
				now: () => nowMs,
				isAlive: () => true,
			},
			registry,
			new FakeDelivery(),
		);
		for (nowMs of [1, 2, 3]) daemon.tick();
		expect(registry.read("root")?.failureReason).toBe("stalled");
	});

	it("keeps descriptor-only watchdog event movement silent until the persisted stall", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-event-axis-"));
		TEMP_DIRS.push(home);
		const registry = new FakeRegistry([
			desc({
				id: "peer",
				harness: "pi",
				lifecycle: undefined,
				paneId: undefined,
				spawnedBy: "owner",
			}),
			desc({ id: "owner", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		new FsWatchdogStore(home).write("peer", { intervalMs: 1 });
		let nowMs = 1;
		const daemon = new Daemon(
			home,
			{
				capturePane: () => "",
				isPaneDead: () => false,
				sendText: () => "confirmed",
				sendKey: () => {},
				killPane: () => {},
				listTranscripts: () => [],
				home: () => home,
				now: () => nowMs,
				isAlive: () => true,
			},
			registry,
			new FakeDelivery(),
		);
		daemon.tick();
		const afterFire = registry.read("peer");
		if (!afterFire) throw new Error("peer descriptor disappeared");
		registry.write({ ...afterFire, lastEventAt: new Date(2).toISOString() });
		nowMs = 2;
		daemon.tick();
		nowMs = 3;
		daemon.tick();
		expect(registry.read("peer")?.failureReason).toBe("stalled");
	});

	it("keeps persisted lastEventAt byte-identical across a watchdog-attributable busy pane", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-pane-axis-"));
		TEMP_DIRS.push(home);
		const registry = new FakeRegistry([desc({ id: "peer", state: "idle" })]);
		new FsWatchdogStore(home).write("peer", { intervalMs: 100 });
		let nowMs = 100_000;
		let pane = READY_PANE;
		const daemon = new Daemon(
			home,
			{
				capturePane: () => pane,
				isPaneDead: () => false,
				sendText: () => "confirmed",
				sendKey: () => {},
				killPane: () => {},
				listTranscripts: () => [],
				home: () => home,
				now: () => nowMs,
				isAlive: () => true,
			},
			registry,
			new FakeDelivery(),
		);
		daemon.tick();
		const before = registry.read("peer")?.lastEventAt;
		pane = BUSY_PANE;
		nowMs = 100_001;
		daemon.tick();
		expect(registry.read("peer")?.state).toBe("working");
		expect(registry.read("peer")?.lastEventAt).toBe(before);
	});

	it("stamps fires through writeMerged and emits one stalled notice across both detectors", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-daemon-"));
		TEMP_DIRS.push(home);
		const registry = new FakeRegistry([
			desc({
				id: "peer",
				spawnedBy: "owner",
				state: "working",
				lastEventAt: STARTED_AT,
			}),
			desc({ id: "owner", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		new FsWatchdogStore(home).write("peer", { intervalMs: 1 });
		const delivery = new FakeDelivery();
		let nowMs = 1_000_000;
		let pane = "working pane";
		const ports: DaemonPorts = {
			capturePane: () => pane,
			isPaneDead: () => false,
			sendText: () => "confirmed",
			sendKey: () => {},
			killPane: () => {},
			listTranscripts: () => [],
			home: () => home,
			now: () => nowMs,
			isAlive: () => true,
		};
		const daemon = new Daemon(home, ports, registry, delivery);
		daemon.tick();
		expect(registry.read("peer")?.lastWatchdogFireAt).toBe(new Date(nowMs).toISOString());
		const stalledAfterLegacy = delivery.outbox.filter((item) =>
			item.message.body.includes("stalled"),
		).length;
		nowMs += 2;
		daemon.tick();
		nowMs += 2;
		daemon.tick();
		expect(delivery.outbox.filter((item) => item.message.body.includes("stalled"))).toHaveLength(
			stalledAfterLegacy,
		);

		const stalledPeer = registry.read("peer");
		if (!stalledPeer) throw new Error("peer descriptor disappeared");
		registry.write({ ...stalledPeer, state: "idle", failureReason: "stalled" });
		pane = "idle pane";
		nowMs += 2;
		daemon.tick();
		expect(registry.read("peer")?.failureReason).toBeUndefined();
	});
});
