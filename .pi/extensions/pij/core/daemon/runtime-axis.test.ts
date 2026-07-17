// pij-control-plane — daemon runtime axis (plan 054 P2 T008, AC-04 + V-05).
//
// Single-step tick() over fake ports (Finding 10). The tracker computes the
// WS-6 mechanical verdict per node, persists it via the merge-law write, and
// appends a spine event `actor: daemon` for EVERY axis transition (V-05) —
// with the transition latch flipping ONLY after a successful append: an
// append/lock/recovery failure skips honestly (logged once) and the next
// tick retries, so events are never lost to a transient fault and never
// spammed on quiet ticks.

import { describe, expect, it } from "vitest";
import {
	FakeAssignmentStore,
	FakeOpJournal,
	FakePlatformWriteLock,
	FakeProjectStore,
	FakeRegistry,
	FakeSpineLog,
} from "../../adapters/fakes.js";
import { SPINE_KIND_SYSTEM_STATE } from "../platform/types.js";
import type { SessionDescriptor } from "../types.js";
import { RuntimeAxisTracker } from "./runtime-axis.js";

const NOW = Date.parse("2026-07-17T04:00:00.000Z");

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: new Date(NOW - 60_000).toISOString(),
		...over,
	};
}

interface Rig {
	readonly registry: FakeRegistry;
	readonly spineLog: FakeSpineLog;
	readonly opJournal: FakeOpJournal;
	readonly platformWriteLock: FakePlatformWriteLock;
	readonly logs: string[];
	readonly tracker: RuntimeAxisTracker;
	tick(): void;
}

function rig(
	descriptors: SessionDescriptor[],
	opts: { alive?: boolean; suspended?: boolean | null } = {},
): Rig {
	const registry = new FakeRegistry(descriptors);
	const spineLog = new FakeSpineLog();
	const opJournal = new FakeOpJournal();
	const platformWriteLock = new FakePlatformWriteLock();
	const logs: string[] = [];
	const tracker = new RuntimeAxisTracker({
		registry,
		spineLog,
		opJournal,
		projectStore: new FakeProjectStore(),
		assignmentStore: new FakeAssignmentStore(),
		platformWriteLock,
		now: () => NOW,
		isAlive: () => opts.alive ?? true,
		isSuspended: () => opts.suspended ?? false,
		log: (line) => logs.push(line),
	});
	return {
		registry,
		spineLog,
		opJournal,
		platformWriteLock,
		logs,
		tracker,
		tick: () => tracker.tick(registry.list()),
	};
}

describe("runtime axis verdicts (AC-04)", () => {
	it("a just-spawned unbound node reads starting — persisted + V-05 event with actor daemon", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "pending" })]);
		r.tick();
		expect(r.registry.read("pij-n")?.systemState).toBe("starting");
		const events = r.spineLog.read();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: SPINE_KIND_SYSTEM_STATE,
			actor: "daemon",
			peer: "pij-n",
			next: "starting",
		});
		expect(events[0]?.refs).toContain("node:pij-n");
		expect(events[0]?.prev).toBeUndefined();
	});

	it("a suspended-but-alive pane reads stopped", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "bound", paneId: "%1", state: "working" })], {
			suspended: true,
		});
		r.tick();
		expect(r.registry.read("pij-n")?.systemState).toBe("stopped");
	});

	it("bound with NO state telemetry reads unknown — never inferred idle — with a reason ref", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "bound" })]);
		r.tick();
		expect(r.registry.read("pij-n")?.systemState).toBe("unknown");
		const event = r.spineLog.read()[0];
		expect(event?.next).toBe("unknown");
		expect(event?.refs).toContain("reason:missing-telemetry");
	});

	it("a gone pid reads dead", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "bound", state: "idle" })], { alive: false });
		r.tick();
		expect(r.registry.read("pij-n")?.systemState).toBe("dead");
	});
});

describe("V-05 transition events — latch after successful append", () => {
	it("no transition, no event: a quiet second tick appends NOTHING (spam impossible)", () => {
		const r = rig([
			desc({
				id: "pij-n",
				lifecycle: "bound",
				state: "working",
				lastEventAt: new Date(NOW - 1_000).toISOString(),
			}),
		]);
		r.tick();
		r.tick();
		r.tick();
		expect(r.spineLog.read()).toHaveLength(1); // absent→working only
	});

	it("a transition carries prev→next mechanical words", () => {
		const r = rig([
			desc({
				id: "pij-n",
				lifecycle: "bound",
				state: "working",
				lastEventAt: new Date(NOW - 1_000).toISOString(),
			}),
		]);
		r.tick(); // absent → working
		r.registry.write(
			desc({ id: "pij-n", lifecycle: "bound", state: "idle", systemState: "working" }),
		);
		r.tick(); // working → idle
		const events = r.spineLog.read();
		expect(events).toHaveLength(2);
		expect(events[1]).toMatchObject({ prev: "working", next: "idle", actor: "daemon" });
	});

	it("a daemon restart does NOT re-append the persisted current state (latch seeds from disk)", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "bound", state: "idle", systemState: "idle" })]);
		r.tick();
		expect(r.spineLog.read()).toHaveLength(0);
	});

	it("append failure: verdict persists, latch does NOT flip, next tick retries — exactly one event lands", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "pending" })]);
		r.spineLog.failNext("append");
		r.tick();
		expect(r.registry.read("pij-n")?.systemState).toBe("starting"); // truth never waits
		expect(r.spineLog.read()).toHaveLength(0);
		r.tick(); // retry lands
		r.tick(); // and never duplicates
		expect(r.spineLog.read()).toHaveLength(1);
	});

	it("lock-contended tick SKIPS honestly (logged once), never stalls, retries next tick", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "pending" })]);
		r.platformWriteLock.failNext();
		r.tick();
		expect(r.spineLog.read()).toHaveLength(0);
		expect(r.logs.some((l) => l.includes("pij-n"))).toBe(true);
		const logged = r.logs.length;
		r.platformWriteLock.failNext();
		r.tick(); // still contended — no log spam
		expect(r.logs.length).toBe(logged);
		r.tick(); // lock free — event lands
		expect(r.spineLog.read()).toHaveLength(1);
	});

	it("recovery-blocked tick skips the append honestly and retries once the journal drains", () => {
		const r = rig([desc({ id: "pij-n", lifecycle: "pending" })]);
		const recorded = r.opJournal.record({
			schema_version: 1,
			ts: new Date(NOW).toISOString(),
			actor: "tester",
			kind: "note", // unadjudicable intent — recovery blocks
			refs: [],
		});
		if (!recorded.ok) throw new Error(recorded.message);
		r.tick();
		expect(r.spineLog.read()).toHaveLength(0);
		const cleared = r.opJournal.clear(recorded.value);
		if (!cleared.ok) throw new Error(cleared.message);
		r.tick();
		expect(r.spineLog.read().filter((e) => e.kind === SPINE_KIND_SYSTEM_STATE)).toHaveLength(1);
	});
});
