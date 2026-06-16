// pij-messaging — PijSession coordinator specs (Pattern P8: target the pure
// coordinator vs fakes, never the pi wiring). Covers findings 01,04,07,08 and
// spec AC-2/3/4/5/6/13.

import { describe, expect, it } from "vitest";
import {
	FakeDelivery,
	FakeEventLog,
	FakePiRuntime,
	FakeProcess,
	FakeRegistry,
} from "../adapters/fakes.js";
import type { BootInput, PijPorts } from "./session.js";
import { PijSession } from "./session.js";
import type { PijEvent, SessionDescriptor } from "./types.js";

const T0 = Date.parse("2026-06-16T00:00:00.000Z");

function bootInput(over: Partial<BootInput> = {}): BootInput {
	return {
		id: "alice",
		role: "worker",
		folder: "/repo",
		dataDir: "/home/.pij/alice",
		eventsPath: "/home/.pij/alice/events.ndjson",
		...over,
	};
}

function harness(
	opts: {
		idle?: boolean;
		registry?: readonly SessionDescriptor[];
		events?: readonly PijEvent[];
		now?: number;
	} = {},
) {
	const registry = new FakeRegistry(opts.registry ?? []);
	const eventLog = new FakeEventLog(opts.events ?? []);
	const delivery = new FakeDelivery();
	const pi = new FakePiRuntime(opts.idle ?? true);
	const process = new FakeProcess(4242, opts.now ?? T0);
	const ports: PijPorts = { registry, eventLog, delivery, pi, process };
	return { ports, registry, eventLog, delivery, pi, process, session: new PijSession(ports) };
}

describe("PijSession.boot", () => {
	it("fresh boot writes a descriptor, announces once, returns fresh=true", () => {
		const h = harness();
		const r = h.session.boot(bootInput());
		expect(r).toMatchObject({ id: "alice", role: "worker", fresh: true });
		const d = h.registry.read("alice");
		expect(d).toMatchObject({
			id: "alice",
			role: "worker",
			folder: "/repo",
			pid: 4242,
			startedAt: new Date(T0).toISOString(),
		});
		// announce injected immediately, exactly once, stamped with self id
		expect(h.pi.injects).toHaveLength(1);
		expect(h.pi.injects[0]).toMatchObject({ mode: "immediate" });
		expect(h.pi.injects[0]?.text).toContain("alice");
	});

	it("reload reuses the descriptor: no re-announce, startedAt preserved, fresh=false", () => {
		const existing: SessionDescriptor = {
			id: "alice",
			role: "worker",
			folder: "/repo",
			dataDir: "/home/.pij/alice",
			eventsPath: "/home/.pij/alice/events.ndjson",
			pid: 1,
			startedAt: "2026-06-15T00:00:00.000Z",
		};
		const h = harness({ registry: [existing], now: T0 });
		const r = h.session.boot(bootInput());
		expect(r.fresh).toBe(false);
		expect(h.pi.injects).toHaveLength(0); // no replay of the announce
		expect(h.registry.read("alice")?.startedAt).toBe("2026-06-15T00:00:00.000Z");
		expect(h.registry.read("alice")?.pid).toBe(4242); // pid refreshed
	});

	it("reseeds the seq counter from lastSeq() (crash-safe, finding 04)", () => {
		const events: PijEvent[] = [
			{ seq: 7, timestamp: new Date(T0).toISOString(), type: "tool_call" },
		];
		const h = harness({ events, now: T0 });
		h.session.boot(bootInput());
		h.session.capture("tool_result");
		expect(h.eventLog.read({ since: 7 })[0]?.seq).toBe(8);
	});
});

describe("PijSession.capture", () => {
	it("appends events with strictly monotonic seq + ISO timestamp", () => {
		const h = harness({ now: T0 });
		h.session.boot(bootInput());
		h.process.advance(1000);
		h.session.capture("tool_call", { name: "ctx_read" });
		h.session.capture("tool_result");
		const evs = h.eventLog.read();
		expect(evs.map((e) => e.seq)).toEqual([1, 2]);
		expect(evs[0]?.timestamp).toBe(new Date(T0 + 1000).toISOString());
		expect(evs[0]?.data).toEqual({ name: "ctx_read" });
	});
});

describe("PijSession.onInbound — free text", () => {
	it("idle peer: immediate inject, framed sender id, single delivered receipt", () => {
		const h = harness({ idle: true, now: T0 });
		h.session.boot(bootInput());
		h.pi.injects.length = 0; // drop the announce
		const res = h.session.onInbound({ from: "bob", to: "alice", body: "hi" }, "m1");
		expect(res).toMatchObject({ kind: "delivered", state: "delivered" });
		expect(h.pi.injects[0]).toMatchObject({ text: "[pij from bob] hi", mode: "immediate" });
		// receipt goes back to the sender as a kind:receipt message...
		expect(h.delivery.outbox).toHaveLength(1);
		expect(h.delivery.outbox[0]?.message).toMatchObject({
			from: "alice",
			to: "bob",
			kind: "receipt",
		});
		expect(h.delivery.outbox[0]?.message.body).toBe("[pij receipt m1] delivered");
		// ...and is recorded as an event (AC-13 visible in tail/state)
		expect(h.eventLog.read({ type: "receipt" })).toHaveLength(1);
	});

	it("busy peer: steer inject, queued receipt, then delivered at next turn_start", () => {
		const h = harness({ idle: false, now: T0 });
		h.session.boot(bootInput());
		h.pi.injects.length = 0;
		const res = h.session.onInbound({ from: "bob", to: "alice", body: "yo" }, "m2");
		expect(res).toMatchObject({ kind: "delivered", state: "queued" });
		expect(h.pi.injects[0]).toMatchObject({ mode: "steer" });
		expect(h.delivery.outbox[0]?.message.body).toBe("[pij receipt m2] queued");
		// a turn_start strictly after the inject resolves queued -> delivered
		const later = new Date(T0 + 5000).toISOString();
		h.session.onTurnStart(later);
		expect(h.delivery.outbox).toHaveLength(2);
		expect(h.delivery.outbox[1]?.message.body).toBe("[pij receipt m2] delivered");
		// a second turn_start does not re-deliver
		h.session.onTurnStart(new Date(T0 + 9000).toISOString());
		expect(h.delivery.outbox).toHaveLength(2);
	});
});

describe("PijSession.onInbound — commands (AC-6, finding 05)", () => {
	it("compact is executed and recorded; no inject", () => {
		const h = harness();
		h.session.boot(bootInput());
		h.pi.injects.length = 0;
		const res = h.session.onInbound(
			{ from: "bob", to: "alice", body: "", command: "compact" },
			"c1",
		);
		expect(res).toMatchObject({ kind: "command-executed", command: "compact" });
		expect(h.pi.compactCount).toBe(1);
		expect(h.pi.injects).toHaveLength(0);
	});

	it("unknown command is rejected with E-CMD and never reaches pi", () => {
		const h = harness();
		h.session.boot(bootInput());
		const before = h.pi.compactCount;
		const res = h.session.onInbound({ from: "bob", to: "alice", body: "", command: "rm-rf" }, "c2");
		expect(res).toMatchObject({ kind: "command-rejected", code: "E-CMD" });
		expect(h.pi.compactCount).toBe(before);
	});

	it("new fires via the captured command context when armed; no compact, no inject", () => {
		const h = harness();
		h.session.boot(bootInput());
		h.pi.injects.length = 0;
		const res = h.session.onInbound({ from: "bob", to: "alice", body: "", command: "new" }, "c3");
		expect(res).toMatchObject({ kind: "command-executed", command: "new" });
		expect(h.pi.controlCalls).toEqual(["new"]);
		expect(h.pi.compactCount).toBe(0);
		expect(h.pi.injects).toHaveLength(0);
	});

	it("reload is deferred when un-armed: queued + wakes, then drained on /pij", () => {
		const h = harness();
		h.session.boot(bootInput());
		h.pi.setArmed(false);
		h.pi.injects.length = 0;
		const res = h.session.onInbound(
			{ from: "bob", to: "alice", body: "", command: "reload" },
			"c4",
		);
		expect(res).toMatchObject({ kind: "command-deferred", command: "reload" });
		expect(h.pi.controlCalls).toHaveLength(0);
		expect(h.pi.injects[0]?.text).toContain("/reload");
		// a `/pij` invocation arms the channel and drains the queue exactly once
		h.pi.setArmed(true);
		expect(h.session.applyPendingControl()).toEqual(["reload"]);
		expect(h.pi.controlCalls).toEqual(["reload"]);
		expect(h.session.applyPendingControl()).toEqual([]);
	});
});

describe("PijSession.onInbound — receipts never wake the peer", () => {
	it("a kind:receipt message is recorded as an event, never injected", () => {
		const h = harness();
		h.session.boot(bootInput());
		h.pi.injects.length = 0;
		const res = h.session.onInbound(
			{ from: "bob", to: "alice", body: "[pij receipt x] delivered", kind: "receipt" },
			"r1",
		);
		expect(res).toMatchObject({ kind: "receipt-recorded" });
		expect(h.pi.injects).toHaveLength(0); // the parent is NOT woken
		expect(h.delivery.outbox).toHaveLength(0); // no receipt-of-a-receipt
		expect(h.eventLog.read({ type: "receipt" })).toHaveLength(1);
	});
});

describe("PijSession descriptor state (D-A / AC-9, AC-7a)", () => {
	it("boots idle, goes working on turn_start, idle again on turn_end", () => {
		const h = harness({ now: T0 });
		h.session.boot(bootInput());
		expect(h.registry.read("alice")?.state).toBe("idle");
		h.session.onTurnStart(new Date(T0).toISOString());
		expect(h.registry.read("alice")?.state).toBe("working");
		h.session.onTurnEnd();
		expect(h.registry.read("alice")?.state).toBe("idle");
	});

	it("capture refreshes lastEventAt to the event's ISO timestamp", () => {
		const h = harness({ now: T0 });
		h.session.boot(bootInput());
		expect(h.registry.read("alice")?.lastEventAt).toBeUndefined();
		h.process.advance(2000);
		h.session.capture("tool_call");
		expect(h.registry.read("alice")?.lastEventAt).toBe(new Date(T0 + 2000).toISOString());
	});

	it("reload preserves state + lastEventAt", () => {
		const existing: SessionDescriptor = {
			id: "alice",
			role: "worker",
			folder: "/repo",
			dataDir: "/home/.pij/alice",
			eventsPath: "/home/.pij/alice/events.ndjson",
			pid: 1,
			startedAt: "2026-06-15T00:00:00.000Z",
			state: "working",
			lastEventAt: "2026-06-15T01:00:00.000Z",
		};
		const h = harness({ registry: [existing], now: T0 });
		h.session.boot(bootInput());
		expect(h.registry.read("alice")?.state).toBe("working");
		expect(h.registry.read("alice")?.lastEventAt).toBe("2026-06-15T01:00:00.000Z");
	});
});

describe("PijSession.shutdown", () => {
	it("removes the descriptor from the registry", () => {
		const h = harness();
		h.session.boot(bootInput());
		expect(h.registry.read("alice")).not.toBeNull();
		h.session.shutdown();
		expect(h.registry.read("alice")).toBeNull();
	});
});
