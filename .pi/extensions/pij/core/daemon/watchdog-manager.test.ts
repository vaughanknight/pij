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
import { type OrchestrationRole, STORED_ORCHESTRATION_ROLES } from "../orchestration/role.js";
import type { PiRuntimePort } from "../ports.js";
import { PijSession } from "../session.js";
import { buildSpawnCommand, parseSpawnArgs } from "../spawn.js";
import type { PijMessage, SessionDescriptor, WatchdogSidecar, WatchdogWatcher } from "../types.js";
import { isFireDue } from "../watchdog.js";
import type { DaemonPorts } from "./loop.js";
import { pauseForCompactMessage } from "./router.js";
import {
	roleNeedsSupervision,
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
		orchestrationRole: "pm",
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
	readonly logs: string[];
	setNow(value: number): void;
	setPane(id: string, value: string): void;
	setPendingWatchdog(id: string, pending: boolean): void;
	setGlobalDisabled(value: boolean): void;
}

function managerHarness(): ManagerHarness {
	const store = new MemoryWatchdogStore();
	const delivery = new FakeDelivery();
	const sent: Array<{ id: string; body: string }> = [];
	const events: string[] = [];
	const fires: Array<{ id: string; atMs: number }> = [];
	const responses: WatchdogResponseEvent[] = [];
	const logs: string[] = [];
	const panes = new Map<string, string>();
	const pendingWatchdogs = new Set<string>();
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
		hasPendingWatchdog: (id) => pendingWatchdogs.has(id),
		onFire: (session, atMs) => fires.push({ id: session.id, atMs }),
		onResponse: (event) => responses.push(event),
		log: (line) => logs.push(line),
	});
	return {
		manager,
		store,
		delivery,
		sent,
		events,
		fires,
		responses,
		logs,
		setNow: (value) => {
			nowMs = value;
		},
		setPane: (id, value) => panes.set(id, value),
		setPendingWatchdog: (id, pending) => {
			if (pending) pendingWatchdogs.add(id);
			else pendingWatchdogs.delete(id);
		},
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
	it("watches the DESIGNATED seats — pm and prime — and nobody else", async () => {
		// Primes were excluded until 2026-07-30 (the gate read `!== "pm"`, and a
		// prime projects to "prime"), so the fleet's governing seats were the only
		// ones no reporting clock touched. Measured cost: a prime went 12 days
		// without writing a card, with no prompt of any kind — its own status-stale
		// anomaly could not reach it either, because a prime has no parent for the
		// sweep to deliver to.
		const h = managerHarness();
		for (const id of ["pm", "worker", "unknown", "prime", "conflict"]) {
			h.store.sidecars.set(id, intervalSidecar(1));
			h.store.revisions.set(id, 1);
		}
		h.setNow(10);
		h.manager.reconcile([
			desc({ id: "pm", orchestrationRole: "pm" }),
			desc({ id: "worker", orchestrationRole: "worker" }),
			desc({ id: "unknown", orchestrationRole: undefined }),
			desc({ id: "prime", prime: true, orchestrationRole: undefined }),
			// prime + a stored role is the conflict shape: prime WINS the projection
			// (role.ts), so it is watched as a prime rather than skipped.
			desc({ id: "conflict", prime: true, orchestrationRole: "pm" }),
		]);

		expect(h.delivery.outbox.map((entry) => entry.message.to).sort()).toEqual([
			"conflict",
			"pm",
			"prime",
		]);
		expect(h.manager.activeCount()).toBe(3);
		// Still nobody else: an unstamped seat and a worker are never watched,
		// because a reporting clock on a seat whose card renders nowhere is noise.
		expect(h.delivery.outbox.map((entry) => entry.message.to)).not.toContain("worker");
		expect(h.delivery.outbox.map((entry) => entry.message.to)).not.toContain("unknown");
	});

	it("nudges a never-reported PM from startedAt even while ordinary activity stays fresh", async () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-never-reported", intervalSidecar());
		h.store.revisions.set("pij-never-reported", 1);
		h.setNow(50);
		h.manager.reconcile([
			desc({
				id: "pij-never-reported",
				statusAt: undefined,
				lastEventAt: new Date(40).toISOString(),
			}),
		]);
		h.setNow(100);
		h.manager.reconcile([
			desc({
				id: "pij-never-reported",
				statusAt: undefined,
				lastEventAt: new Date(90).toISOString(),
			}),
		]);

		expect(h.fires).toEqual([{ id: "pij-never-reported", atMs: 100 }]);
	});

	it("keys the PM schedule on statusAt, so ordinary activity no longer re-anchors it", async () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-reporting-pm", intervalSidecar());
		h.store.revisions.set("pij-reporting-pm", 1);
		h.setNow(60);
		h.manager.reconcile([
			desc({
				id: "pij-reporting-pm",
				statusAt: new Date(10).toISOString(),
				lastEventAt: new Date(50).toISOString(),
			}),
		]);
		h.setNow(110);
		h.manager.reconcile([
			desc({
				id: "pij-reporting-pm",
				statusAt: new Date(10).toISOString(),
				lastEventAt: new Date(100).toISOString(),
			}),
		]);

		expect(h.fires).toEqual([{ id: "pij-reporting-pm", atMs: 110 }]);
	});

	it("projects the live fire clock and keeps statusAt re-anchoring", async () => {
		const h = managerHarness();
		const cfg = { enabled: true, intervalMs: 100, pausedBy: undefined };
		h.store.sidecars.set("peer", intervalSidecar(cfg.intervalMs));
		h.store.revisions.set("peer", 1);

		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer", statusAt: undefined })]);
		expect(h.manager.schedulerProjection().peer?.nextDueAt).toBe(new Date(200).toISOString());
		expect(isFireDue(cfg, 100, 0, 199)).toBe(false);
		expect(isFireDue(cfg, 100, 0, 200)).toBe(true);

		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", statusAt: undefined })]);
		expect(h.manager.schedulerProjection().peer?.nextDueAt).toBe(new Date(300).toISOString());

		h.setNow(250);
		h.manager.reconcile([desc({ id: "peer", statusAt: new Date(250).toISOString() })]);
		expect(h.manager.schedulerProjection().peer?.nextDueAt).toBe(new Date(350).toISOString());
	});

	it("keeps at most one due tmux watchdog turn in the durable channel", async () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-tmux", intervalSidecar());
		h.store.revisions.set("pij-tmux", 1);
		h.setNow(100);
		h.manager.reconcile([desc({ id: "pij-tmux" })]);
		expect(h.events).toEqual(["capture:pij-tmux"]);
		expect(h.sent).toEqual([]);
		expect(h.delivery.outbox[0]?.message).toMatchObject({
			from: "pij-watchdog",
			to: "pij-tmux",
		});
		expect(h.delivery.outbox[0]?.message.body).toContain("[pij watchdog #1 for pij-tmux]");
		expect(h.fires).toEqual([{ id: "pij-tmux", atMs: 100 }]);

		h.setPendingWatchdog("pij-tmux", true);
		h.setNow(200);
		h.manager.reconcile([desc({ id: "pij-tmux" })]);
		expect(h.delivery.outbox).toHaveLength(1);

		h.setPendingWatchdog("pij-tmux", false);
		h.setNow(300);
		h.manager.reconcile([desc({ id: "pij-tmux" })]);
		expect(h.delivery.outbox[1]?.message.body).toContain("[pij watchdog #2 for pij-tmux]");
	});

	it("fires for a session that has never emitted an event, anchored on startedAt", async () => {
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
		expect(h.delivery.outbox[0]?.message.body).toContain("[pij watchdog #1 for pij-newborn]");
		expect(h.fires).toEqual([{ id: "pij-newborn", atMs: 100 }]);
	});

	it("does not fire a never-emitted session before its interval elapses since startedAt", async () => {
		const h = managerHarness();
		h.store.sidecars.set("pij-newborn", intervalSidecar());
		h.store.revisions.set("pij-newborn", 1);
		h.setNow(10); // startedAt = epoch, interval = 50 → not due yet
		h.manager.reconcile([desc({ id: "pij-newborn", lastEventAt: undefined })]);
		expect(h.sent).toEqual([]);
		expect(h.fires).toEqual([]);
	});

	it("never fires at an EXTERNAL pull target — the daemon does not own its delivery", async () => {
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

	it("delivers pi turns through the inbox channel and never captures a missing pane", async () => {
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

	it("skips pre-bind, failed, dead, paused, and exempt sessions", async () => {
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
			hasPendingWatchdog: () => false,
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

	it("retains the exact persisted deadline across manager restart without extending it", async () => {
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

	it("persists an expired exemption before capture or delivery makes the peer active", async () => {
		const store = new MemoryWatchdogStore();
		store.sidecars.set("peer", {
			intervalMs: 1,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 100,
		});
		store.revisions.set("peer", 1);
		const delivery = new FakeDelivery();
		const manager = new WatchdogManager({
			store,
			channel: delivery,
			isAlive: () => true,
			now: () => 100,
			capturePane: () => {
				store.order.push("capture");
				return "idle";
			},
			hasPendingWatchdog: () => false,
		});
		manager.reconcile([desc({ id: "peer" })]);
		expect(store.order).toEqual(["write:peer:active", "capture"]);
		expect(delivery.outbox).toHaveLength(1);
	});

	it("fires nothing while off, and RE-ANCHORS on re-enable so the off-window isn't counted (Plan 056)", async () => {
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

	it("never watches a relay/bridge peer — the deliberate-silence class (Plan 056)", async () => {
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

	it("mtime-gates sidecar reads until the revision changes", async () => {
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

	it("drops runtime state when a session closes or disappears", async () => {
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
	it("keeps combined watchdog-attributable pane, event, and working changes silent", async () => {
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

	it("does not credit the idle return edge of a watchdog-caused working transition", async () => {
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

	it("recognises later real activity, clears the streak, and auto-resumes compact only on real work", async () => {
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

	it("marks only the first post-fire pane mutation as watchdog-attributable", async () => {
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

	// s096 / pij#161, inverted by item 31 rather than deleted: a no-evidence fire
	// is still delivered to the seat and arms response tracking, but is not a
	// watcher verdict and therefore creates neither a notice nor a capture.
	it("logs a first-fire unknown without delivering it to watchers", async () => {
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

		expect(h.delivery.outbox.filter((item) => item.message.to === "owner")).toEqual([]);
		expect(h.store.captures).toEqual([]);
		expect(h.logs.filter((line) => line.startsWith("watchdog unknown: peer"))).toEqual([
			"watchdog unknown: peer (not delivered)",
		]);
		expect(h.delivery.outbox.filter((item) => item.message.to === "peer")).toHaveLength(1);
		expect(h.manager.isPaneChangeWatchdogAttributed("peer", "watchdog turn")).toBe(true);
	});

	it("keeps always-mode capture and notice for a real verdict", async () => {
		const h = managerHarness();
		const alwaysWatcher: WatchdogWatcher = {
			...watcher,
			watcherId: "always-watcher",
			capture: { mode: "always", maxLines: 2, maxBytes: 64 },
		};
		h.store.sidecars.set("peer", intervalSidecar(100, [alwaysWatcher]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "healthy\nidle");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);

		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", lastWatchdogFireAt: new Date(100).toISOString() })]);

		expect(h.store.captures).toEqual([
			expect.objectContaining({
				watcherId: "always-watcher",
				targetId: "peer",
				content: "healthy\nidle",
			}),
		]);
		const notices = h.delivery.outbox.filter((item) => item.message.to === "always-watcher");
		// The paired positive: a measured verdict still reaches an always watcher,
		// so the unknown-case silence above cannot pass because delivery is broken.
		expect(notices).toHaveLength(1);
		expect(notices[0]?.message.body).toContain("watchdog suspect: peer");
	});

	it("writes an anomaly pointer from the pre-injection pane and includes at most five lines", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcher]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "one\ntwo\nthree");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		h.events.length = 0;
		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", lastWatchdogFireAt: new Date(100).toISOString() })]);

		expect(h.events).toEqual(["capture:peer"]);
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

	// Every capture test above uses maxLines <= 5, where the head and the tail of
	// the window are the SAME five lines — so none of them could tell a
	// head-anchored notice from a tail-anchored one, and the defect survived. This
	// one uses a window WIDER than the notice, which is the only shape that can.
	it("takes the NEWEST five lines of the window, so a wider window is not a staler notice", async () => {
		const h = managerHarness();
		const wide: WatchdogWatcher = {
			...watcher,
			capture: { mode: "always", maxLines: 12, maxBytes: 4096 },
		};
		h.store.sidecars.set("peer", intervalSidecar(100, [wide]));
		h.store.revisions.set("peer", 1);
		// 20 lines; the capture keeps the last 12 (line09..line20).
		h.setPane("peer", Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n"));
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", lastWatchdogFireAt: new Date(100).toISOString() })]);

		expect(h.store.captures[0]?.content).toBe(
			Array.from({ length: 12 }, (_, i) => `line${i + 9}`).join("\n"),
		);
		const notice =
			h.delivery.outbox.find((item) => item.message.to === "owner")?.message.body ?? "";
		// The newest five of that window — NOT line09..line13, which is what a
		// front slice returned and which is 7 lines staler than the pane's tail.
		expect(notice).toContain("line16\nline17\nline18\nline19\nline20");
		expect(notice).not.toContain("line09");
		expect(notice).not.toContain("line13");
	});

	it("reports capture-n/a for a paneless pi target", async () => {
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

	it("notifies an anomaly watcher once per stalled episode and again after recovery", async () => {
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
/** Daemons built by a test, released in afterEach. A `Daemon` holds pane taps
 *  plus watch/watchdog manager state; leaving instances alive across a long file
 *  leaks handles and shows up as unrelated 5s timeouts elsewhere in the suite. */
const DAEMONS: Daemon[] = [];
function tracked(daemon: Daemon): Daemon {
	DAEMONS.push(daemon);
	return daemon;
}
afterEach(async () => {
	for (const daemon of DAEMONS.splice(0)) daemon.dispose();
	for (const dir of TEMP_DIRS.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("FsWatchdogStore", () => {
	it("round-trips a validated sidecar, exposes revision, and writes bounded capture pointers", async () => {
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
	it("router applies compact pause only to compact commands and preserves stronger tiers", async () => {
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

	it("daemon tmux delivery persists compact pause before injecting --command compact", async () => {
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

	it("pi inbound persists compact pause before calling the runtime and resumes on turn start", async () => {
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

	it("parses every watchdog verb and capture policy", async () => {
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

	it("mutates pause tiers and manages the caller's watcher subscription", async () => {
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

	it("disable-all / enable-all flip the machine-wide switch (Plan 056)", async () => {
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

	it("interval sets a per-peer timeout from a human duration (Plan 056)", async () => {
		const h = cliHarness();
		const parsed = parseArgs(["watchdog", "interval", "target", "20m"]);
		if (!parsed.ok) throw new Error(parsed.message);
		expect(dispatch(parsed.value, h.deps).exitCode).toBe(0);
		expect(h.watchdog.read("target")?.intervalMs).toBe(1_200_000);
		expect(parseArgs(["watchdog", "interval", "target"]).ok).toBe(false); // needs duration
		expect(parseArgs(["watchdog", "interval", "target", "nope"]).ok).toBe(false); // bad duration
	});

	it("reset clears a peer back to default, including un-exempting it (Plan 056)", async () => {
		const h = cliHarness();
		// Exempt it first — resume can't undo exempt, so reset is the only CLI path.
		h.watchdog.sidecars.set("target", { pausedBy: "exempt", pausedAtMs: 1, intervalMs: 5 });
		const parsed = parseArgs(["watchdog", "reset", "target"]);
		if (!parsed.ok) throw new Error(parsed.message);
		expect(dispatch(parsed.value, h.deps).exitCode).toBe(0);
		expect(h.watchdog.read("target")).toEqual({}); // default: on, 20min, unpaused, un-exempt
	});

	it("status reports globally-disabled after disable-all, not a bare 'enabled' (Plan 056)", async () => {
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

	it("status reports a relay peer as never-watched, not 'enabled' (Plan 056 review MEDIUM-1)", async () => {
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

	it("rejects a stray third positional for non-interval verbs (review LOW)", async () => {
		expect(parseArgs(["watchdog", "status", "target", "junk"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "reset", "target", "junk"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "pause", "target", "junk"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "interval", "target", "20m"]).ok).toBe(true); // interval keeps its 3rd
	});

	it("disable-all / enable-all take no id", async () => {
		expect(parseArgs(["watchdog", "disable-all", "target"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "enable-all", "x"]).ok).toBe(false);
		expect(parseArgs(["watchdog", "disable-all"]).ok).toBe(true);
	});

	it("rejects pause after exemption without weakening the tier", async () => {
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

	it("accepts default and custom exemption durations, and reports their live deadline truthfully", async () => {
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

	it("adds the watchdog envelope to status, state --json, and list --json", async () => {
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
	it("accepts --no-watchdog and threads the pi child exemption marker", async () => {
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

	it("pi boot persists an exempt sidecar when the spawn marker is present", async () => {
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
	it("keeps an idle watchdog stall latched until real recovery and notices once", async () => {
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
		for (nowMs of [100, 200, 300]) await daemon.tick();
		expect(registry.read("peer")?.failureReason).toBe("stalled");
		const notices = delivery.outbox.filter(
			(item) => item.message.to === "owner" && item.message.body.includes("stalled"),
		);
		expect(notices).toHaveLength(1);

		nowMs = 301;
		await daemon.tick();
		expect(registry.read("peer")?.failureReason).toBe("stalled");
		nowMs = 400;
		await daemon.tick();
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

	// s070 #1. `pij watchdog exempt` was one-directional: it silenced the peer-facing
	// nudge but NOT the owner-facing stall notice, so an operator who had explicitly
	// put a peer on standby still got 3 "gone quiet (stalled)" notices in ~13 min.
	//
	// These two tests are a matched pair and MUST be read together: byte-identical
	// setup except for the exempt sidecar. The control proves the notice genuinely
	// fires for this scenario, so the exempt case is asserting real suppression
	// rather than the absence of something that was never going to happen.
	function exemptHarness(sidecar: WatchdogSidecar | undefined): {
		readonly delivery: FakeDelivery;
		readonly tick: () => void;
	} {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-exempt-"));
		TEMP_DIRS.push(home);
		// state "working" + lastEventAt far past STALE_AFTER_MS (60s) = the legacy
		// detector's exact stall trigger.
		const registry = new FakeRegistry([
			desc({
				id: "peer",
				spawnedBy: "owner",
				state: "working",
				lastEventAt: new Date(0).toISOString(),
			}),
			desc({ id: "owner", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		if (sidecar) new FsWatchdogStore(home).write("peer", sidecar);
		const delivery = new FakeDelivery();
		const nowMs = 1_000_000; // ~16 min of silence — comfortably past STALE_AFTER_MS
		return {
			delivery,
			tick: () =>
				tracked(
					new Daemon(
						home,
						{
							capturePane: () => "working pane",
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
						delivery,
					),
				).tick(),
		};
	}

	const ownerStallNotices = (delivery: FakeDelivery): number =>
		delivery.outbox.filter(
			(item) => item.message.to === "owner" && item.message.body.includes("gone quiet"),
		).length;

	it("CONTROL: a stalled peer with no exemption does notify its owner", async () => {
		const h = exemptHarness(undefined);
		await h.tick();
		expect(ownerStallNotices(h.delivery)).toBe(1);
	});

	it("sends the owner NO stall notice while the peer is watchdog-exempt", async () => {
		const h = exemptHarness({
			intervalMs: 100,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 3_600_000, // still live at now = 1_000_000
		});
		await h.tick();
		expect(ownerStallNotices(h.delivery)).toBe(0);
		// Zero traffic in EITHER direction — the peer must not be nudged either.
		expect(h.delivery.outbox.filter((item) => item.message.to === "peer")).toEqual([]);
	});

	it("resumes owner stall notices once the exemption has EXPIRED", async () => {
		// A lapsed safety exemption must never become permanent notification
		// blindness — the whole reason exemptions carry a TTL.
		const h = exemptHarness({
			intervalMs: 100,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 1_000, // long expired at now = 1_000_000
		});
		await h.tick();
		expect(ownerStallNotices(h.delivery)).toBe(1);
	});

	it("exempt does NOT suppress a genuine provider failure — decided, not accidental", async () => {
		// s070 ruling. `watchdog exempt` silences SILENCE notices (the peer is
		// intentionally idle). It must never silence a real fault: a quota/auth/400
		// failure stays actionable while a peer sits on standby, and swallowing one
		// would be a worse bug than the notification noise s070 fixed.
		// This test exists so nobody "completes" the exempt work by adding an
		// isExempt() guard to pushProviderFailure. If you are here because you just
		// added one: that is the bug, not this test.
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-exempt-provider-"));
		TEMP_DIRS.push(home);
		const nowMs = 1_000_000;
		const registry = new FakeRegistry([
			desc({
				id: "peer",
				spawnedBy: "owner",
				state: "idle", // idle + stale is what makes the daemon peek at the pane
				lastEventAt: new Date(0).toISOString(),
			}),
			desc({ id: "owner", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		new FsWatchdogStore(home).write("peer", {
			intervalMs: 100,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 3_600_000, // live exemption
		});
		const delivery = new FakeDelivery();
		await tracked(
			new Daemon(
				home,
				{
					capturePane: () => "Error: 401 Unauthorized — authentication_error",
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
				delivery,
			),
		).tick();

		// The fault reaches the owner...
		expect(
			delivery.outbox.filter(
				(item) => item.message.to === "owner" && item.message.body.includes("auth"),
			),
		).toHaveLength(1);
		expect(registry.read("peer")?.failureReason).toBe("auth");
		// ...while the silence notice stays suppressed. Both, in the same tick.
		expect(
			delivery.outbox.filter(
				(item) => item.message.to === "owner" && item.message.body.includes("gone quiet"),
			),
		).toEqual([]);
	});

	it("derives NO watchdog response at all while paused — the unstated invariant, pinned", async () => {
		// s070 ruling. The watchdog's own stall notice (daemon.pushWatchdogResponse)
		// is safe under exemption only BY CONSTRUCTION: isFireDue refuses to fire
		// while paused, so no response is ever derived to notify from. Nothing stated
		// that, which makes it a bug waiting for a refactor — any future path that
		// derives a response outside a fire would start leaking notices immediately.
		// Pin it at the pure seam AND at the manager.
		const cfg = { enabled: true, intervalMs: 100, pausedBy: "exempt" as const };
		expect(isFireDue(cfg, null, 0, 10_000_000)).toBe(false); // wildly overdue, still no
		expect(isFireDue({ ...cfg, pausedBy: "self" }, null, 0, 10_000_000)).toBe(false);
		expect(isFireDue({ ...cfg, pausedBy: undefined }, null, 0, 10_000_000)).toBe(true);

		const h = managerHarness();
		h.store.sidecars.set("pij-paused", {
			intervalMs: 100,
			pausedBy: "exempt",
			pausedAtMs: 0,
			exemptUntilMs: 3_600_000,
		});
		h.store.revisions.set("pij-paused", 1);
		h.setNow(1_000_000); // far past due
		h.manager.reconcile([desc({ id: "pij-paused" })]);
		expect(h.responses).toEqual([]); // nothing to notify FROM
		expect(h.fires).toEqual([]);
		expect(h.delivery.outbox).toEqual([]);
	});

	it("clears a durable stalled flag on a creator-less peer that is demonstrably alive", async () => {
		// Reported live (s070 #2): `pij state` showed `failure: stalled` while
		// `last-event` was 2–3 minutes fresh — peer alive, ticking, daemon tick fresh.
		//
		// Two clear paths exist and BOTH miss this peer:
		//  - `pushWholeLifeTransition` returns early when `spawnedBy` is absent, so a
		//    creator-less peer's flag is never cleared there — even though the watchdog
		//    detector happily SETS the flag on one (see the root-session test below).
		//  - the watchdog reported recovery only on an activity EDGE, and a daemon
		//    restart rebuilds RuntimeState seeded from the descriptor, consuming the
		//    edge at birth so it can never fire again.
		// Net: set-without-clear pins `stalled` on a provably live peer forever.
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-liveness-clear-"));
		TEMP_DIRS.push(home);
		// Fresh event at t=990, interval 100, now=1000 → 10ms old: demonstrably alive.
		const registry = new FakeRegistry([
			desc({
				id: "root",
				harness: "pi",
				lifecycle: undefined,
				paneId: undefined,
				spawnedBy: undefined,
				state: "idle",
				lastEventAt: new Date(990).toISOString(),
				failureReason: "stalled",
			}),
		]);
		new FsWatchdogStore(home).write("root", { intervalMs: 100 });
		const nowMs = 1_000;
		const ports: DaemonPorts = {
			capturePane: () => "",
			isPaneDead: () => false,
			sendText: () => "confirmed",
			sendKey: () => {},
			killPane: () => {},
			listTranscripts: () => [],
			home: () => home,
			now: () => nowMs,
			isAlive: () => true,
		};
		// A NEW Daemon is the daemon-restart case: empty in-memory latches and a
		// RuntimeState about to be rebuilt from this descriptor.
		const daemon = tracked(new Daemon(home, ports, registry, new FakeDelivery()));

		// Non-vacuity: the flag is really set going in, and no fix has run yet.
		expect(registry.read("root")?.failureReason).toBe("stalled");

		await daemon.tick();

		// Without the sustained-liveness verdict this stays "stalled" — no edge is
		// ever produced (lastEventAt never changes) and the creator-less early return
		// blocks the other clear path entirely.
		expect(registry.read("root")?.failureReason).toBeUndefined();

		// PM scheduling is deliberately status-keyed: fresh ordinary activity can
		// prove liveness, but it no longer postpones a missing report.
		expect(registry.read("root")?.lastWatchdogFireAt).toBe(new Date(nowMs).toISOString());
	});

	it("does not fabricate recovery for a peer whose newest event is older than the interval", async () => {
		// Guards the fix above from becoming a blanket amnesty: a genuinely silent
		// peer keeps its stalled label. Same shape as the test above, only the event
		// age changes (890 → 110ms old, past the 100ms interval).
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-liveness-stale-"));
		TEMP_DIRS.push(home);
		const registry = new FakeRegistry([
			desc({
				id: "root",
				harness: "pi",
				lifecycle: undefined,
				paneId: undefined,
				spawnedBy: undefined,
				state: "idle",
				lastEventAt: new Date(890).toISOString(),
				failureReason: "stalled",
			}),
		]);
		new FsWatchdogStore(home).write("root", { intervalMs: 100 });
		const nowMs = 1_000;
		const daemon = tracked(
			new Daemon(
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
			),
		);
		await daemon.tick();
		expect(registry.read("root")?.failureReason).toBe("stalled");
	});

	it("does not clear stalled from a five-minute-old event on a 20-minute interval", async () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-liveness-window-"));
		TEMP_DIRS.push(home);
		const nowMs = 20 * 60_000;
		const registry = new FakeRegistry([
			desc({
				id: "root",
				harness: "pi",
				lifecycle: undefined,
				paneId: undefined,
				spawnedBy: undefined,
				state: "idle",
				lastEventAt: new Date(nowMs - 5 * 60_000).toISOString(),
				failureReason: "stalled",
			}),
		]);
		new FsWatchdogStore(home).write("root", { intervalMs: 20 * 60_000 });
		const daemon = tracked(
			new Daemon(
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
			),
		);

		await daemon.tick();

		expect(registry.read("root")?.failureReason).toBe("stalled");
	});

	it("does not call a peer alive on the DEFAULT interval when it is stale by the stall threshold", async () => {
		// Regression, caught by daemon-push.test.ts: the liveness window was first
		// written as the watchdog interval, which defaults to 20 MINUTES. A peer
		// 65s into its silence — already stalled by STALE_AFTER_MS (60s) — was
		// therefore declared alive and had its flag cleared. Freshness has to
		// satisfy the TIGHTER of the two detectors, so the window is
		// min(interval, STALE_AFTER_MS). No sidecar here ⇒ the real 20-min default.
		const home = mkdtempSync(join(tmpdir(), "pij-watchdog-liveness-window-"));
		TEMP_DIRS.push(home);
		const nowMs = 1_000_000;
		const registry = new FakeRegistry([
			desc({
				id: "root",
				harness: "pi",
				lifecycle: undefined,
				paneId: undefined,
				spawnedBy: undefined,
				state: "idle",
				lastEventAt: new Date(nowMs - 65_000).toISOString(), // past the 60s stall line
				failureReason: "stalled",
			}),
		]);
		await tracked(
			new Daemon(
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
			),
		).tick();
		expect(registry.read("root")?.failureReason).toBe("stalled");
	});

	it("stamps a watchdog-only stalled verdict on a root session", async () => {
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
		for (nowMs of [1, 2, 3]) await daemon.tick();
		expect(registry.read("root")?.failureReason).toBe("stalled");
	});

	it("keeps descriptor-only watchdog event movement silent until the persisted stall", async () => {
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
		await daemon.tick();
		const afterFire = registry.read("peer");
		if (!afterFire) throw new Error("peer descriptor disappeared");
		registry.write({ ...afterFire, lastEventAt: new Date(2).toISOString() });
		nowMs = 2;
		await daemon.tick();
		nowMs = 3;
		await daemon.tick();
		expect(registry.read("peer")?.failureReason).toBe("stalled");
	});

	it("keeps persisted lastEventAt byte-identical across a watchdog-attributable busy pane", async () => {
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
		await daemon.tick();
		const before = registry.read("peer")?.lastEventAt;
		pane = BUSY_PANE;
		nowMs = 100_001;
		await daemon.tick();
		expect(registry.read("peer")?.state).toBe("working");
		expect(registry.read("peer")?.lastEventAt).toBe(before);
	});

	it("stamps fires through persistDaemonWrite and emits one stalled notice across both detectors", async () => {
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
		await daemon.tick();
		expect(registry.read("peer")?.lastWatchdogFireAt).toBe(new Date(nowMs).toISOString());
		const stalledAfterLegacy = delivery.outbox.filter((item) =>
			item.message.body.includes("stalled"),
		).length;
		nowMs += 2;
		await daemon.tick();
		nowMs += 2;
		await daemon.tick();
		expect(delivery.outbox.filter((item) => item.message.body.includes("stalled"))).toHaveLength(
			stalledAfterLegacy,
		);

		const stalledPeer = registry.read("peer");
		if (!stalledPeer) throw new Error("peer descriptor disappeared");
		registry.write({ ...stalledPeer, state: "idle", failureReason: "stalled" });
		pane = "idle pane";
		nowMs += 2;
		await daemon.tick();
		expect(registry.read("peer")?.failureReason).toBeUndefined();
	});
});

describe("parked seats are muted, not unwatched (plan 076, DL-002)", () => {
	// Live evidence for this fix: the PM who wrote it burned four nudges while
	// correctly parked on a human-gated merge. Both anomaly detectors already
	// exempt the parked states; the watchdog — the only mechanism that pushes a
	// turn into a human-visible pane — did not.
	function parkedHarness(semanticState: SessionDescriptor["semanticState"]) {
		const h = managerHarness();
		h.store.sidecars.set("pij-parked", intervalSidecar());
		h.store.revisions.set("pij-parked", 1);
		h.setNow(100);
		h.manager.reconcile([desc({ id: "pij-parked", lastEventAt: undefined, semanticState })]);
		return h;
	}

	it("sends NO nudge to a seat that declared a parked state", async () => {
		for (const state of ["waiting", "hold", "blocked", "question"] as const) {
			const h = parkedHarness(state);
			expect(h.delivery.outbox).toEqual([]);
			expect(h.sent).toEqual([]);
		}
	});

	it("STILL nudges an undeclared seat under identical conditions", async () => {
		// The control. Without it the assertion above would also pass if the
		// watchdog were simply broken, which is the vacuous-pass shape.
		const h = parkedHarness(undefined);
		expect(h.delivery.outbox[0]?.message.body).toContain("[pij watchdog #1 for pij-parked]");
	});

	it("STILL nudges a seat claiming done — a terminal claim is verified, not trusted", async () => {
		// s075's lesson carried forward: muting and discharging are different acts.
		const h = parkedHarness("done");
		expect(h.delivery.outbox[0]?.message.body).toContain("[pij watchdog #1 for pij-parked]");
	});

	it("keeps the seat WATCHED — muting is not unwatching", async () => {
		// The design constraint from the brief: parked-state muting must not weaken
		// the supervision axes. Muting records NO fire (it is not a nudge), but the
		// seat must remain under management — proven by it firing normally once it
		// un-parks and its interval elapses. A seat dropped from management would
		// never fire again.
		const h = parkedHarness("question");
		expect(h.fires).toEqual([]);
		h.setNow(200); // interval 50, muted tick at 100 → due again
		h.manager.reconcile([desc({ id: "pij-parked", lastEventAt: undefined })]);
		expect(h.delivery.outbox[0]?.message.body).toContain("[pij watchdog #1 for pij-parked]");
		expect(h.fires).toEqual([{ id: "pij-parked", atMs: 200 }]);
	});

	it("does not fire the instant a seat UN-parks — the clock advanced while muted", async () => {
		// If the muted tick left lastFireAt standing, the seat would be permanently
		// overdue and get nudged the moment it un-parked: punishing the declaration
		// one tick late rather than on time.
		const h = parkedHarness("question");
		h.delivery.outbox.length = 0;
		h.setNow(120); // < interval (50) after the muted tick at 100
		h.manager.reconcile([desc({ id: "pij-parked", lastEventAt: undefined })]);
		expect(h.delivery.outbox).toEqual([]);
	});
});

/** The gate that was wrong twice, now total by compiler.
 *
 * It first read `role !== "pm"` and silently excluded every prime; 94d4564
 * widened one name to two, PRESERVING THE SHAPE, so `pa` was excluded before
 * any anchor or interval logic ran — five PAs, zero fires, ever. The previous
 * test iterated a HAND-WRITTEN list of roles, which by construction cannot
 * contain a role nobody added to it, which is why it passed throughout.
 *
 * These drive the vocabulary itself, so a role added to `StoredOrchestrationRole`
 * and left unclassified fails HERE as well as at the compiler.
 */
describe("roleNeedsSupervision is total over the role vocabulary", () => {
	it("classifies every member of the union, and null", async () => {
		const roles: readonly (OrchestrationRole | null)[] = [
			"prime",
			...STORED_ORCHESTRATION_ROLES,
			null,
		];
		expect(roles.length).toBeGreaterThan(3);
		for (const role of roles) {
			expect(
				typeof roleNeedsSupervision(role),
				`role '${role ?? "unroled"}' has no supervision decision`,
			).toBe("boolean");
		}
	});

	it("watches a PA — the seat whose trigger is the condition it detects", async () => {
		expect(roleNeedsSupervision("pa")).toBe(true);
	});

	it("keeps watching prime and pm, the two the gate was widened for", async () => {
		expect(roleNeedsSupervision("prime")).toBe(true);
		expect(roleNeedsSupervision("pm")).toBe(true);
	});

	it("records the exclusions as DECISIONS — worker and unroled stay out", async () => {
		expect(roleNeedsSupervision("worker")).toBe(false);
		expect(roleNeedsSupervision(null)).toBe(false);
	});
});

describe("a watched PA is nudged without being told to write a card", () => {
	it("fires for a pa and gives it the card-less copy", async () => {
		const h = managerHarness();
		h.store.sidecars.set("aide", intervalSidecar(1));
		h.store.revisions.set("aide", 1);
		h.setNow(10);
		h.manager.reconcile([desc({ id: "aide", orchestrationRole: "pa" })]);
		const sent = h.delivery.outbox.filter((e) => e.message.to === "aide");
		expect(sent, "a pa must be watched at all").toHaveLength(1);
		// Jordan's ruling 2026-07-31: a PA owes no card. Eligibility and
		// owesStatusCard are separate questions and only the COPY branches on the
		// second — so the nudge must never teach a PA to break its own ruling.
		expect(sent[0]?.message.body).not.toContain("pij report now");
	});
});

// ─── s096 / pij#161 + pij#148 — the verdict has three values and four meanings ──
//
// PRE-FIX GATE. Every test in this block is a BEHAVIOURAL criterion and every one
// of them must FAIL against unmodified source. They are written before the fix and
// their failure output is recorded in the plan's execution log as evidence.
//
// Assertion discipline (fleet relay, s097): adding a member to an existing enum
// makes SET-LEVEL assertions uninformative by construction. So no test here
// asserts merely "a notice was emitted", and none rests on a bare negative — a
// bare negative is satisfied by ABSENCE (no notice at all, a delivery failure, an
// unrelated early return) and would pass for reasons unrelated to the fix. Each
// case positively identifies the verdict AND separately asserts delivery happened.
//
// These cases preserve the distinctions introduced by pij#161 while item 31
// changes the delivery policy: unknown is still an explicit internal verdict,
// but it is logged rather than published to watchers.
describe("s096 watchdog verdicts: no-evidence, unreadable panes, answered fires", () => {
	const watcherOf = (id: string, mode: "always" | "anomaly"): WatchdogWatcher => ({
		watcherId: id,
		addedAt: STARTED_AT,
		capture: { mode, maxLines: 2, maxBytes: 64 },
	});

	const noticesTo = (h: ReturnType<typeof managerHarness>, to: string): string[] =>
		h.delivery.outbox
			.filter((item) => item.message.to === to)
			.map((item) => item.message.body)
			.filter((body) => body.startsWith("watchdog "));

	it("AC-01 logs rather than publishes a fire that examined no evidence", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcherOf("owner", "always")]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "healthy\nidle");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);

		expect(noticesTo(h, "owner")).toEqual([]);
		expect(h.delivery.outbox.filter((item) => item.message.to === "peer")).toHaveLength(1);
		expect(h.logs.filter((line) => line.startsWith("watchdog unknown: peer"))).toEqual([
			"watchdog unknown: peer (not delivered)",
		]);
	});

	it("AC-04 keeps a no-evidence fire out of every watcher and capture policy", async () => {
		const h = managerHarness();
		h.store.sidecars.set(
			"peer",
			intervalSidecar(100, [
				watcherOf("always-watcher", "always"),
				watcherOf("anomaly-watcher", "anomaly"),
			]),
		);
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "healthy\nidle");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);

		expect(noticesTo(h, "always-watcher")).toEqual([]);
		expect(noticesTo(h, "anomaly-watcher")).toEqual([]);
		expect(h.store.captures).toEqual([]);
		expect(h.logs).toContain("watchdog unknown: peer (not delivered)");
	});

	// AC-05 — pij#161's live instance: a 0-byte capture from a pane that no longer
	// exists, presented to the watcher as corroboration of health. The real adapter
	// returns "" for a missing pane and never throws
	// (daemon-real-adapter.test.ts:130-136), so "" means "no usable pane evidence".
	//
	// SPLIT into two tests (fleet correction, 2026-08-08). `expect()` THROWS, so a
	// pre-fix red on a multi-assertion test only ever proves THE FIRST ASSERTION
	// THAT FIRED — everything after it never ran and is unproven. The original
	// single AC-05 fired on the notice assertion, so its recorded red said nothing
	// at all about the capture-write claim below, which is a SEPARATE observable
	// behaviour: "the notice says unavailable" and "no bytes were written as
	// content" are two different things that happened to share a test.
	it("AC-05a reports an unreadable pane as unavailable in the notice", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcherOf("owner", "always")]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "baseline");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		h.setPane("peer", ""); // paneId is set, but the pane cannot be read
		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", lastWatchdogFireAt: new Date(100).toISOString() })]);

		const notices = noticesTo(h, "owner");
		// The delivery pin lives HERE only: it exists so the content assertion that
		// follows it cannot be satisfied by absence.
		expect(notices).toHaveLength(1);
		expect(notices[0]).toContain("capture unavailable");
	});

	// AC-05b — the second, independent claim. A 0-byte read is not content, so
	// nothing may be WRITTEN for it. This assertion never ran in the original
	// pre-fix red (the notice assertion above threw first), so it carries no
	// recorded red of its own and is proven by MUTATION instead — a revert-style
	// mutant restoring `""`-as-content must turn this test red.
	it("AC-05b writes no capture at all for an unreadable pane", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, [watcherOf("owner", "always")]));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "baseline");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]);
		h.setPane("peer", "");
		h.setNow(200);
		h.manager.reconcile([desc({ id: "peer", lastWatchdogFireAt: new Date(100).toISOString() })]);

		expect(h.store.captures).toEqual([]);
	});

	// AC-06 / KF-02 — the state-corrupting half of the family. `paneChanged` is a
	// raw string inequality, so a pane that DIES ("...text..." -> "") reads as pane
	// ACTIVITY; with no fire outstanding that calls reportRealRecovery, which emits
	// `responsive` to onResponse, which clears failureReason:"stalled" in the daemon.
	//
	// The path is only reachable with `awaitingResponse === false`, so the peer must
	// FIRST post a real recovery — otherwise the watchdog's own attribution absorbs
	// the pane delta and the test passes for the wrong reason (measuring a
	// neighbour). The legitimate recovery is therefore snapshotted and excluded, so
	// the assertion is about the pane-death tick ALONE.
	it("AC-06 does not read a vanishing pane as recovery", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, []));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "alive\nprompt");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]); // fire #1: lastPane recorded

		// Event #1 after the fire is watchdog-attributed and must not recover.
		h.setNow(150);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(150).toISOString() })]);
		// Event #2 is independent work — a REAL recovery, clearing awaitingResponse.
		h.setNow(160);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(160).toISOString() })]);

		const before = h.responses.length;
		expect(h.responses.at(-1)?.response).toBe("responsive"); // the legitimate one

		h.setPane("peer", ""); // the pane is gone
		h.setNow(300);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(160).toISOString() })]);

		// A disappearing pane is absence of evidence. This tick alone must not
		// manufacture a recovery.
		expect(h.responses.slice(before).map((r) => r.response)).not.toContain("responsive");
	});

	// AC-07 / pij#148 — a seat that ANSWERS every nudge must never be labelled
	// stalled. The answer signal is `statusAt`, which only the peer's own
	// `pij report` can move (registry-write.ts:90 maps it to the "cli" writer);
	// `lastEventAt` is NOT usable — the delivery plumbing itself advances it
	// (session.ts capture("receipt") -> persist({lastEventAt})), so the act of
	// supervising writes the field supervision reads.
	//
	// The peer answers AFTER each fire (card + event advance), and the clock then
	// runs a full interval past that answer so the next fire genuinely becomes due.
	// Holding statusAt equal to `now` every tick instead would re-anchor the
	// schedule forever and fire ZERO times — passing by absence, proving nothing.
	it("AC-07 never stalls a seat whose statusAt advances after every fire", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, []));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "idle pane");

		let now = 1000;
		let answeredAt = 0;
		for (let round = 0; round < 4; round += 1) {
			// The fire becomes due one interval after the peer's last answer.
			h.setNow(now);
			h.manager.reconcile([
				desc({
					id: "peer",
					semanticState: "ready",
					...(answeredAt > 0
						? {
								statusAt: new Date(answeredAt).toISOString(),
								lastEventAt: new Date(answeredAt).toISOString(),
							}
						: {}),
				}),
			]);
			expect(h.fires.length).toBe(round + 1); // the fire really happened

			// The peer answers it: files a status card and writes an event.
			answeredAt = now + 10;
			h.setNow(answeredAt);
			h.manager.reconcile([
				desc({
					id: "peer",
					semanticState: "ready",
					statusAt: new Date(answeredAt).toISOString(),
					lastEventAt: new Date(answeredAt).toISOString(),
				}),
			]);
			now = answeredAt + 150;
		}

		// It answered every single fire, by its own hand. `stalled` must mean SILENT.
		expect(h.responses.map((r) => r.response)).not.toContain("stalled");
	});

	// ── guards: the properties this PR must NOT change ───────────────────────

	// PRESERVED-PROPERTY (task 1.2) — Phase 1 changes nothing for a fire that DID
	// examine something. A silent fire still climbs and real work still recovers.
	// Passes before and after; declared a regression guard, never evidence.
	it("still climbs on silent fires and still recovers on real work", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, []));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "idle pane");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]); // fire #1 — examined nothing

		h.setNow(250);
		h.manager.reconcile([desc({ id: "peer" })]); // fire #2 — silent
		h.setNow(400);
		h.manager.reconcile([desc({ id: "peer" })]); // fire #3 — silent again
		expect(h.responses.map((r) => r.response)).toEqual(["suspect", "stalled"]);

		// The first advance after a fire is the watchdog's own receipt; the second is
		// independent work, and that still recovers the peer.
		h.setNow(450);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(450).toISOString() })]);
		h.setNow(460);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(460).toISOString() })]);
		expect(h.responses.at(-1)?.response).toBe("responsive");
	});

	// Task 2.4 — three DISTINCT reasons a watcher gets no capture, told apart.
	// Merging "I have no pane", "I could not read the pane" and "you asked me not
	// to look" would be the same absence-renders-as-something defect one level
	// down, in the notice text.
	it("tells paneless target, unreadable pane and policy-disabled capture apart", async () => {
		const paneless = managerHarness();
		paneless.store.sidecars.set("peer", intervalSidecar(100, [watcherOf("owner", "always")]));
		paneless.store.revisions.set("peer", 1);
		paneless.setNow(100);
		paneless.manager.reconcile([
			desc({ id: "peer", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		paneless.setNow(200);
		paneless.manager.reconcile([
			desc({ id: "peer", harness: "pi", lifecycle: undefined, paneId: undefined }),
		]);
		expect(noticesTo(paneless, "owner")[0]).toContain("capture unavailable (paneless target)");

		const unreadable = managerHarness();
		unreadable.store.sidecars.set("peer", intervalSidecar(100, [watcherOf("owner", "always")]));
		unreadable.store.revisions.set("peer", 1);
		unreadable.setPane("peer", "baseline");
		unreadable.setNow(100);
		unreadable.manager.reconcile([desc({ id: "peer" })]);
		unreadable.setPane("peer", "");
		unreadable.setNow(200);
		unreadable.manager.reconcile([desc({ id: "peer" })]);
		expect(noticesTo(unreadable, "owner")[0]).toContain(
			"capture unavailable (pane could not be read)",
		);

		// mode:"never" still receives the notice on an anomaly, without a capture.
		const disabled = managerHarness();
		disabled.store.sidecars.set(
			"peer",
			intervalSidecar(100, [
				{ watcherId: "owner", addedAt: STARTED_AT, capture: { mode: "never" } },
			]),
		);
		disabled.store.revisions.set("peer", 1);
		disabled.setPane("peer", "alive");
		disabled.setNow(100);
		disabled.manager.reconcile([desc({ id: "peer" })]); // fire #1 — no evidence
		disabled.setNow(250);
		disabled.manager.reconcile([desc({ id: "peer" })]); // fire #2 — suspect
		const disabledNotice = noticesTo(disabled, "owner").at(-1) ?? "";
		expect(disabledNotice).toContain("watchdog suspect: peer");
		expect(disabledNotice).toContain("capture disabled by watcher policy");
	});

	// AC-09 / task 3.1 — PRESERVED-PROPERTY, and the anti-over-application guard
	// for the whole of Phase 3. An ALIVE peer whose only activity is the observer's
	// own — an injected pane redraw AND a delivery receipt advancing `lastEventAt`
	// — but which never writes a status card must still reach `stalled`.
	//
	// This is the exact case the first Phase 3 design (keyed on `lastEventAt`)
	// would have made UNREACHABLE, converting pij#148's false negative into a false
	// positive. Written as a permanent test so nobody re-derives that design.
	// Passes before and after the fix; never evidence of it.
	it("AC-09 still stalls a wedged peer whose only activity is watchdog-caused", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, []));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "redraw-0");
		h.setNow(100);
		h.manager.reconcile([desc({ id: "peer" })]); // fire #1

		// The nudge lands: the pane redraws and the pij plumbing emits a receipt,
		// which persists lastEventAt. No model involvement, and no status card.
		h.setPane("peer", "redraw-1");
		h.setNow(110);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(110).toISOString() })]);
		h.setNow(250);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(110).toISOString() })]); // fire #2

		h.setPane("peer", "redraw-2");
		h.setNow(260);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(260).toISOString() })]);
		h.setNow(400);
		h.manager.reconcile([desc({ id: "peer", lastEventAt: new Date(260).toISOString() })]); // fire #3

		// statusAt never moved, so the peer never answered — it is silent, and
		// silence is what `stalled` means.
		expect(h.responses.map((r) => r.response)).toEqual(["suspect", "stalled"]);
	});

	// Task 3.7 / KF-15 — the no-op rows of the transition table are the ones that
	// bite. An ANSWERED fire must not increment the SILENT counter, or a long
	// answered run would bank silence and one later genuine silence would jump
	// straight to `stalled`.
	it("resumes the climb at suspect after a long answered run, never at stalled", async () => {
		const h = managerHarness();
		h.store.sidecars.set("peer", intervalSidecar(100, []));
		h.store.revisions.set("peer", 1);
		h.setPane("peer", "idle pane");

		let now = 1000;
		let answeredAt = 0;
		for (let round = 0; round < 3; round += 1) {
			h.setNow(now);
			h.manager.reconcile([
				desc({
					id: "peer",
					...(answeredAt > 0
						? {
								statusAt: new Date(answeredAt).toISOString(),
								lastEventAt: new Date(answeredAt).toISOString(),
							}
						: {}),
				}),
			]);
			answeredAt = now + 10;
			h.setNow(answeredAt);
			h.manager.reconcile([
				desc({
					id: "peer",
					statusAt: new Date(answeredAt).toISOString(),
					lastEventAt: new Date(answeredAt).toISOString(),
				}),
			]);
			now = answeredAt + 150;
		}

		const silent = desc({
			id: "peer",
			statusAt: new Date(answeredAt).toISOString(),
			lastEventAt: new Date(answeredAt).toISOString(),
		});
		// One more fire consumes the last answer — still capped.
		h.setNow(now);
		h.manager.reconcile([silent]);
		expect(h.responses.at(-1)?.response).toBe("suspect");

		// Now the peer goes genuinely silent. The answered run banked nothing, so
		// the climb restarts at `suspect` rather than resuming mid-air at `stalled`.
		h.setNow(now + 150);
		h.manager.reconcile([silent]);
		expect(h.responses.at(-1)?.response).toBe("suspect");
		expect(h.responses.map((r) => r.response)).not.toContain("stalled");

		// And a SECOND consecutive silence does stall: the cap is a property of
		// answering, not a blanket suppression of the climb.
		h.setNow(now + 300);
		h.manager.reconcile([silent]);
		expect(h.responses.at(-1)?.response).toBe("stalled");
	});
});
