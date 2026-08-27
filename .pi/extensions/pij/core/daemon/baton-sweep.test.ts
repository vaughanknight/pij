import { describe, expect, it } from "vitest";
import { FakeBatonNoticeSink, FakeBatonStore, FakeRegistry } from "../../adapters/fakes.js";
import type { BatonDefinition, BatonLease } from "../orchestration/baton.js";
import { STALE_AFTER_MS } from "../state.js";
import type { SessionDescriptor } from "../types.js";
import { BatonSweep, classifyBatonHolder, evaluateBatonSweep } from "./baton-sweep.js";

const NOW = Date.parse("2026-07-11T10:00:00.000Z");

function lease(): BatonLease {
	return {
		leaseId: "lease-1",
		holder: "pij-holder",
		purpose: "run the shared gate",
		grantedBy: "pij-prime",
		requestedAt: "2026-07-11T09:55:00.000Z",
		grantedAt: "2026-07-11T09:56:00.000Z",
	};
}

function definition(holderHealth?: BatonDefinition["holderHealth"]): BatonDefinition {
	return {
		name: "dotnet",
		resource: "one build/test window",
		createdBy: "pij-prime",
		createdAt: "2026-07-11T09:00:00.000Z",
		queue: [],
		lastLease: lease(),
		...(holderHealth ? { holderHealth } : {}),
	};
}

function descriptor(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-holder",
		folder: "/repo",
		dataDir: "/tmp/pij-holder",
		eventsPath: "/tmp/pij-holder/events.ndjson",
		pid: 42,
		startedAt: "2026-07-11T09:00:00.000Z",
		state: "idle",
		lastEventAt: new Date(NOW - 1000).toISOString(),
		...overrides,
	};
}

describe("classifyBatonHolder", () => {
	it("classifies healthy, unknown, pid-dead, and stalled holders", async () => {
		expect(classifyBatonHolder(descriptor(), () => true, NOW)).toBe("healthy");
		expect(classifyBatonHolder(null, () => true, NOW)).toBe("unknown");
		expect(classifyBatonHolder(descriptor(), () => false, NOW)).toBe("dead");
		expect(
			classifyBatonHolder(
				descriptor({
					state: "working",
					lastEventAt: new Date(NOW - STALE_AFTER_MS - 1).toISOString(),
				}),
				() => true,
				NOW,
			),
		).toBe("stalled");
	});
});

describe("evaluateBatonSweep", () => {
	it("alerts once per dead/stalled transition and re-arms after recovery", async () => {
		const active = lease();
		expect(evaluateBatonSweep(active, undefined, descriptor(), () => true, NOW)).toMatchObject({
			kind: "record",
			health: { status: "healthy" },
		});
		expect(
			evaluateBatonSweep(
				active,
				{ leaseId: active.leaseId, status: "healthy" },
				descriptor({ state: "working", lastEventAt: undefined }),
				() => true,
				NOW,
			),
		).toMatchObject({ kind: "alert", transition: "stalled" });
		expect(
			evaluateBatonSweep(
				active,
				{ leaseId: active.leaseId, status: "stalled" },
				descriptor({ state: "working", lastEventAt: undefined }),
				() => true,
				NOW,
			),
		).toEqual({ kind: "none" });
		expect(
			evaluateBatonSweep(
				active,
				{ leaseId: active.leaseId, status: "stalled" },
				descriptor({ failureReason: "stalled" }),
				() => true,
				NOW,
			),
		).toMatchObject({ kind: "record", health: { status: "healthy" } });
		expect(
			evaluateBatonSweep(
				active,
				{ leaseId: active.leaseId, status: "healthy" },
				descriptor({
					state: "working",
					lastEventAt: undefined,
					failureReason: "stalled",
				}),
				() => true,
				NOW,
			),
		).toMatchObject({ kind: "alert", transition: "stalled" });
	});

	it("does not alert for healthy or unknown holders", async () => {
		const active = lease();
		expect(evaluateBatonSweep(active, undefined, descriptor(), () => true, NOW).kind).toBe(
			"record",
		);
		expect(evaluateBatonSweep(active, undefined, null, () => true, NOW).kind).toBe("record");
	});
});

describe("BatonSweep", () => {
	it("pushes one alert for a dead holder and never releases the lease", async () => {
		const active = lease();
		const store = new FakeBatonStore([definition()], [["dotnet", active]]);
		const registry = new FakeRegistry([descriptor()]);
		const notices = new FakeBatonNoticeSink("queued");
		const sweep = new BatonSweep({
			store,
			registry,
			notices,
			isAlive: () => false,
			now: () => NOW,
		});

		expect(sweep.tick()).toEqual({ ok: true, value: { alerts: 1 } });
		expect(sweep.tick()).toEqual({ ok: true, value: { alerts: 0 } });
		expect(notices.outbox).toHaveLength(1);
		expect(notices.outbox[0]).toMatchObject({
			kind: "alert",
			to: "pij-prime",
			transition: "dead",
		});
		expect(store.leases.get("dotnet")).toEqual(active);
	});

	it("records healthy/unknown status without pushing", async () => {
		const active = lease();
		const store = new FakeBatonStore([definition()], [["dotnet", active]]);
		const notices = new FakeBatonNoticeSink();
		const sweep = new BatonSweep({
			store,
			registry: new FakeRegistry([descriptor()]),
			notices,
			isAlive: () => true,
			now: () => NOW,
		});
		expect(sweep.tick()).toEqual({ ok: true, value: { alerts: 0 } });
		expect(notices.outbox).toHaveLength(0);

		const unknownStore = new FakeBatonStore([definition()], [["dotnet", active]]);
		const unknownSweep = new BatonSweep({
			store: unknownStore,
			registry: new FakeRegistry(),
			notices,
			isAlive: () => true,
			now: () => NOW,
		});
		expect(unknownSweep.tick()).toEqual({ ok: true, value: { alerts: 0 } });
		expect(notices.outbox).toHaveLength(0);
	});
});
