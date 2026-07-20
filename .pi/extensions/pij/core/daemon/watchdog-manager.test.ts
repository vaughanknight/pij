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
	setGlobalDisabled(value: boolean): void;
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
	let globalDisabled = false;
	const manager = new WatchdogManager({
		store,
		channel: delivery,
		isAlive: () => true,
		globallyDisabled: () => globalDisabled,
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
		setGlobalDisabled: (value: boolean) => {
			globalDisabled = value;
		},
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

	it("fires for a session that has never emitted an event, anchored on startedAt", () => {
		// Found live on activation day: a freshly spawned peer that never emits an
		// event has no lastEventAt, and lastWatchdogFireAt is null until the first
		// fire — so both anchors were null and the watchdog never fired at all.
		// That silently excluded the peer most in need of watching: spawned but
		// hung at boot. startedAt always exists; it is the birth anchor.
		const h = managerHarness();
		h.store.sidecars.set("pij-newborn", intervalSidecar());
		h.store.revisions.set("pij-newborn", 1);
		h.setNow(100);
		h.manager.reconcile([desc({ id: "pij-newborn", lastEventAt: undefined })]);
		expect(h.sent[0]?.body).toContain("[pij watchdog #1 for pij-newborn]");
		expect(h.fires).toEqual([{ id: "pij-newborn", atMs: 100 }]);
	});

	it("does not fire a never-emitted session before its interval elapses since startedAt", () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-newborn", intervalSidecar());
		h.store.revisions.set("pij-newborn", 1);
		h.setNow(10); // startedAt = epoch, interval = 50 → not due yet
		h.manager.reconcile([desc({ id: "pij-newborn", lastEventAt: undefined })]);
		expect(h.sent).toEqual([]);
		expect(h.fires).toEqual([]);
	});

	it("never fires at an EXTERNAL pull target — the daemon does not own its delivery", () => {
		// The delivery-ownership invariant (daemon.test.ts) says an external pull
		// target is never tick-owned, driven, buffered, or drained. The watchdog
		// honoured that only by accident: pull targets never emit events, so the
		// null-anchor bug kept them silent. Fixing the anchor exposed the missing
		// guard — a pi peer still gets its inbox turn (AC-10), an external pull
		// target never does.
		const h = managerHarness();
		h.store.sidecars.set("pij-ext-pull", intervalSidecar());
		h.store.revisions.set("pij-ext-pull", 1);
		h.setNow(100);
		h.manager.reconcile([
			desc({
				id: "pij-ext-pull",
				harness: "copilot",
				deliveryMode: "pull",
				lastEventAt: undefined,
			}),
		]);
		expect(h.sent).toEqual([]);
		expect(h.delivery.outbox).toEqual([]);
		expect(h.fires).toEqual([]);
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
			["exempt", { intervalMs: 1, pausedBy: "exempt", pausedAtMs: 1 }],
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

	it("retains the exact persisted deadline across manager restart without extending it", () => {
		const store = new MemoryWatchdogStore();
		store.sidecars.set("peer", {
			intervalMs: 1,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 200,
		});
		store.revisions.set("peer", 1);
		const first = managerHarness();
		first.store.sidecars.set("peer", store.sidecars.get("peer") as WatchdogSidecar);
		first.store.revisions.set("peer", 1);
		first.setNow(100);
		first.manager.reconcile([desc({ id: "peer" })]);
		expect(first.store.read("peer")?.exemptUntilMs).toBe(200);

		const restarted = managerHarness();
		restarted.store.sidecars.set("peer", first.store.read("peer") as WatchdogSidecar);
		restarted.store.revisions.set("peer", 1);
		restarted.setNow(199);
		restarted.manager.reconcile([desc({ id: "peer" })]);
		expect(restarted.store.read("peer")?.exemptUntilMs).toBe(200);
		restarted.setNow(200);
		restarted.manager.reconcile([desc({ id: "peer" })]);
		expect(restarted.store.read("peer")).toEqual({ intervalMs: 1 });
	});

	it("persists an expired exemption before capture or delivery makes the peer active", () => {
		const store = new MemoryWatchdogStore();
		store.sidecars.set("peer", {
			intervalMs: 1,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 100,
		});
		store.revisions.set("peer", 1);
		const manager = new WatchdogManager({
			store,
			channel: new FakeDelivery(),
			isAlive: () => true,
			now: () => 100,
			capturePane: () => {
				store.order.push("capture");
				return "idle";
			},
			sendText: () => store.order.push("send"),
		});
		manager.reconcile([desc({ id: "peer" })]);
		expect(store.order).toEqual(["write:peer:active", "capture", "send"]);
	});

	it("fires nothing while off, and RE-ANCHORS on re-enable so the off-window isn't counted (Plan 056)", () => {
		// The machine-wide kill switch: one flag disables every peer's watchdog
		// regardless of its sidecar, and — being global, not per-descriptor — a
		// peer spawned while off is covered too. No per-sidecar writes.
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(1_000));
		h.store.revisions.set("peer", 1);
		h.setGlobalDisabled(true);
		h.setNow(1_000_000); // long past due, but disabled
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(0).toISOString() })]);
		expect(h.fires).toEqual([]);

		// Re-enable: must NOT fire immediately even though the peer's last event is
		// ancient — the disabled window is re-anchored, not treated as silence.
		h.setGlobalDisabled(false);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(0).toISOString() })]);
		expect(h.fires).toEqual([]);

		// One full interval AFTER re-enable, it fires.
		h.setNow(1_001_000);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(0).toISOString() })]);
		expect(h.fires).toEqual([{ id: "peer", atMs: 1_001_000 }]);
	});

	it("never watches a relay/bridge peer — the deliberate-silence class (Plan 056)", () => {
		// The pij-telegram bridge forwards its inbox to the operator's phone. A
		// watchdog nudge into it became 20 real messages. A relay's idleness is
		// correct by design, never a stall — it must never be reconciled or fired,
		// even with a due, enabled sidecar.
		const h = managerHarness();
		h.store.sidecars.set("pij-telegram", intervalSidecar(1));
		h.store.revisions.set("pij-telegram", 1);
		h.setNow(10_000);
		h.manager.reconcile([desc({ id: "pij-telegram", relay: true })]);
		expect(h.sent).toEqual([]);
		expect(h.delivery.outbox).toEqual([]);
		expect(h.fires).toEqual([]);
		expect(h.manager.activeCount()).toBe(0); // never even tracked
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
		store.write("peer", { ...sidecar, pausedBy: "exempt", pausedAtMs: 123, exemptUntilMs: 456 });
		expect(new FsWatchdogStore(home).read("peer")).toMatchObject({
			pausedBy: "exempt",
			pausedAtMs: 123,
			exemptUntilMs: 456,
		});
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
		let globalDisabled = false;
		const watchdogGlobal = {
			disabled: () => globalDisabled,
			setEnabled: (enabled: boolean) => {
				globalDisabled = !enabled;
			},
		};
		const process = new FakeProcess(10, 100, { PIJ_SESSION_ID: "caller" });
		return {
			registry,
			watchdog,
			watchdogGlobal,
			deps: {
				registry,
				eventLogFor: () => new FakeEventLog(),
				delivery: new FakeDelivery(),
				process,
				cwd: "/repo",
				pijHome: "/tmp/pij",
				watchdogStore: watchdog,
				watchdogGlobalStore: watchdogGlobal,
			},
		};
	}

	it("parses every watchdog verb and capture policy", () => {
		for (const argv of [
			["watchdog", "status", "target"],
			["watchdog", "pause", "target"],
			["watchdog", "resume", "target"],
			["watchdog", "exempt", "target"],
			["watchdog", "exempt", "target", "30s"],
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
		expect(h.watchdog.read("target")).toMatchObject({
			pausedBy: "exempt",
			exemptUntilMs: 3_600_100,
		});

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

	it("disable-all / enable-all flip the machine-wide switch (Plan 056)", () => {
		const h = cliHarness();
		const disable = parseArgs(["watchdog", "disable-all"]);
		if (!disable.ok) throw new Error(disable.message);
		const dres = dispatch(disable.value, h.deps);
		expect(dres.exitCode).toBe(0);
		expect(dres.stdout).toContain("DISABLED machine-wide");
		expect(h.watchdogGlobal.disabled()).toBe(true);

		const enable = parseArgs(["watchdog", "enable-all"]);
		if (!enable.ok) throw new Error(enable.message);
		const eres = dispatch(enable.value, h.deps);
		expect(eres.exitCode).toBe(0);
		expect(h.watchdogGlobal.disabled()).toBe(false);
	});

	it("interval sets a per-peer timeout from a human duration (Plan 056)", () => {
		const h = cliHarness();
		const parsed = parseArgs(["watchdog", "interval", "target", "20m"]);
		if (!parsed.ok) throw new Error(parsed.message);
		expect(dispatch(parsed.value, h.deps).exitCode).toBe(0);
		expect(h.watchdog.read("target")?.intervalMs).toBe(1_200_000);
		expect(parseArgs(["watchdog", "interval", "target"]).ok).toBe(false); // needs duration
		expect(parseArgs(["watchdog", "interval", "target", "nope"]).ok).toBe(false); // bad duration
	});

	it("reset clears a peer back to default, including un-exempting it (Plan 056)", () => {
		const h = cliHarness();
		// Exempt it first — resume can't undo exempt, so reset is the only CLI path.
		h.watchdog.sidecars.set("target", { pausedBy: "exempt", pausedAtMs: 1, intervalMs: 5 });
		const parsed = parseArgs(["watchdog", "reset", "target"]);
		if (!parsed.ok) throw new Error(parsed.message);
		expect(dispatch(parsed.value, h.deps).exitCode).toBe(0);
		expect(h.watchdog.read("target")).toEqual({}); // default: on, 20min, unpaused, un-exempt
	});

	it("status reports globally-disabled after disable-all, not a bare 'enabled' (Plan 056)", () => {
		const h = cliHarness();
		const off = parseArgs(["watchdog", "disable-all"]);
		if (!off.ok) throw new Error(off.message);
		dispatch(off.value, h.deps);
		const status = parseArgs(["watchdog", "status", "target", "--json"]);
		if (!status.ok) throw new Error(status.message);
		const out = JSON.parse(dispatch(status.value, h.deps).stdout) as {
			watchdog: { enabled: boolean; globallyDisabled: boolean };
		};
		expect(out.watchdog.globallyDisabled).toBe(true);
		expect(out.watchdog.enabled).toBe(false); // the switch dominates the sidecar
	});

	it("status reports a relay peer as never-watched, not 'enabled' (Plan 056 review MEDIUM-1)", () => {
		const h = cliHarness();
		h.registry.write(desc({ id: "bridge", relay: true }));
		const status = parseArgs(["watchdog", "status", "bridge", "--json"]);
		if (!status.ok) throw new Error(status.message);
		const out = JSON.parse(dispatch(status.value, h.deps).stdout) as {
			watchdog: { enabled: boolean; relay: boolean };
		};
		expect(out.watchdog.relay).toBe(true);
		expect(out.watchdog.enabled).toBe(false); // relay dominates — never watched
	});

	it("rejects a stray third positional for non-interval verbs (review LOW)", () => {
		expect(parseArgs(["watchdog", "status", "target", "junk"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "reset", "target", "junk"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "pause", "target", "junk"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "interval", "target", "20m"]).ok).toBe(true); // interval keeps its 3rd
	});

	it("disable-all / enable-all take no id", () => {
		expect(parseArgs(["watchdog", "disable-all", "target"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "enable-all", "x"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "disable-all"]).ok).toBe(true);
	});

	it("rejects pause after exemption without weakening the tier", () => {
		const h = cliHarness();
		h.watchdog.sidecars.set("target", { pausedBy: "exempt", pausedAtMs: 1 });
		const parsed = parseArgs(["watchdog", "pause", "target"]);
		if (!parsed.ok) throw new Error(parsed.message);
		const result = dispatch(parsed.value, h.deps);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("active exemption");
		expect(h.watchdog.read("target")).toMatchObject({
			pausedBy: "exempt",
			pausedAtMs: 1,
			exemptUntilMs: 3_600_001,
		});
	});

	it("accepts default and custom exemption durations, and reports their live deadline truthfully", () => {
		const h = cliHarness();
		const custom = parseArgs(["watchdog", "exempt", "target", "30s", "--json"]);
		if (!custom.ok) throw new Error(custom.message);
		const customOut = JSON.parse(dispatch(custom.value, h.deps).stdout) as {
			watchdog: { exemptUntilMs: number; exemptRemainingMs: number; pausedBy: string };
		};
		expect(customOut.watchdog).toMatchObject({
			pausedBy: "exempt",
			exemptUntilMs: 30_100,
			exemptRemainingMs: 30_000,
		});
		const status = parseArgs(["watchdog", "status", "target"]);
		if (!status.ok) throw new Error(status.message);
		expect(dispatch(status.value, h.deps).stdout).toContain("remaining");
		expect(parseArgs(["watchdog", "exempt", "target", "bad"]).ok).toBe(false);
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
		expect(store.read("peer")).toMatchObject({
			pausedBy: "exempt",
			pausedAtMs: 50,
			exemptUntilMs: 3_600_050,
		});
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
