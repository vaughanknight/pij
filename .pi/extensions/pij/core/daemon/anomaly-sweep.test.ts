// pij-control-plane — daemon anomaly alerts (plan 054 P2 T010, AC-07).
//
// BatonSweep-pattern composition: per tick, run the pure anomaly queries and
// push ONE alert per anomaly transition to the node's effectiveParent
// (parentId ?? spawnedBy). The latch keys on the anomaly's evidence, so a
// repeated tick never re-alerts and NEW evidence (a fresh unverified done)
// alerts again. The daemon NEVER acts on an anomaly — alert once, act never.

import { describe, expect, it } from "vitest";
import {
	FakeAssignmentStore,
	FakeDelivery,
	FakeProjectStore,
	FakeRegistry,
	FakeSpineLog,
} from "../../adapters/fakes.js";
import type { Assignment, Project, SpineEvent } from "../platform/types.js";
import type { SessionDescriptor } from "../types.js";
import { AnomalySweep } from "./anomaly-sweep.js";

const NOW = Date.parse("2026-07-17T06:00:00.000Z");

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: new Date(NOW - 3_600_000).toISOString(),
		...over,
	};
}

function doneAsg(id: string, nodeId: string, seq: number): Assignment {
	return {
		schema_version: 1,
		id,
		nodeId,
		task: "ship",
		states: [seq],
		opened: { actor: "pij-boss", ts: new Date(NOW - 3_600_000).toISOString() },
	};
}

function doneEvent(seq: number, nodeId: string, assignmentId: string): SpineEvent {
	return {
		schema_version: 1,
		seq,
		ts: new Date(NOW - 60_000).toISOString(),
		actor: nodeId,
		kind: "state-set",
		peer: nodeId,
		refs: [`node:${nodeId}`, `assignment:${assignmentId}`, "state:done"],
	};
}

function rig(
	descriptors: SessionDescriptor[],
	assignments: Assignment[],
	events: SpineEvent[],
	extras: { projects?: Project[] } = {},
) {
	const delivery = new FakeDelivery();
	const logged: string[] = [];
	const sweep = new AnomalySweep({
		registry: new FakeRegistry(descriptors),
		assignmentStore: new FakeAssignmentStore(assignments),
		spineLog: new FakeSpineLog(events),
		delivery,
		now: () => NOW,
		...(extras.projects === undefined
			? {}
			: { projectStore: new FakeProjectStore(extras.projects) }),
		log: (line) => void logged.push(line),
	});
	return { delivery, sweep, logged };
}

function project(slug: string, primeId?: string): Project {
	return {
		schema_version: 1,
		slug,
		description: `project ${slug}`,
		...(primeId === undefined ? {} : { primeId }),
		created: { actor: "pij-boss", ts: new Date(NOW - 3_600_000).toISOString() },
	};
}

describe("AnomalySweep", () => {
	it("alerts the effectiveParent exactly once per anomaly transition (latch pinned)", () => {
		const { delivery, sweep } = rig(
			[desc({ id: "pij-n", lifecycle: "bound", parentId: "pij-parent" })],
			[doneAsg("asg-a", "pij-n", 5)],
			[doneEvent(5, "pij-n", "asg-a")],
		);
		expect(sweep.tick().alerts).toBe(1);
		expect(sweep.tick().alerts).toBe(0);
		expect(sweep.tick().alerts).toBe(0);
		const toParent = delivery.outbox.filter((e) => e.message.to === "pij-parent");
		expect(toParent).toHaveLength(1);
		expect(toParent[0]?.message.from).toBe("pij-n");
		expect(toParent[0]?.message.body).toContain("unverified-done");
		expect(toParent[0]?.message.body).toContain("asg-a");
		expect(toParent[0]?.message.body).toContain("5"); // evidence seq
	});

	it("falls back to spawnedBy when no parentId is linked (effectiveParent law)", () => {
		const { delivery, sweep } = rig(
			[desc({ id: "pij-n", lifecycle: "bound", spawnedBy: "pij-spawner" })],
			[doneAsg("asg-a", "pij-n", 5)],
			[doneEvent(5, "pij-n", "asg-a")],
		);
		sweep.tick();
		expect(delivery.outbox.some((e) => e.message.to === "pij-spawner")).toBe(true);
	});

	it("a parentless root just records the anomaly + dropped counts — no delivery, no crash", () => {
		const { delivery, sweep } = rig(
			[desc({ id: "pij-root", lifecycle: "bound", parentId: null })],
			[doneAsg("asg-a", "pij-root", 5)],
			[doneEvent(5, "pij-root", "asg-a")],
		);
		const first = sweep.tick();
		expect(first.alerts).toBe(0);
		expect(first.dropped).toBe(1); // surfaced, never silent
		expect(delivery.outbox).toHaveLength(0);
	});

	it("FALLBACK: a parentless node's alert goes to its assignment's project prime (s057)", () => {
		const { delivery, sweep, logged } = rig(
			[desc({ id: "pij-root", lifecycle: "bound", parentId: null })],
			[{ ...doneAsg("asg-a", "pij-root", 5), projectSlug: "alpha" }],
			[doneEvent(5, "pij-root", "asg-a")],
			{ projects: [project("alpha", "pij-prime")] },
		);
		const first = sweep.tick();
		expect(first.alerts).toBe(1);
		expect(first.dropped).toBe(0);
		expect(logged).toHaveLength(0);
		const toPrime = delivery.outbox.filter((e) => e.message.to === "pij-prime");
		expect(toPrime).toHaveLength(1);
		expect(toPrime[0]?.message.from).toBe("pij-root");
		expect(toPrime[0]?.message.body).toContain("unverified-done");
		// the latch covers the fallback path too: tick 2 is quiet.
		const second = sweep.tick();
		expect(second.alerts).toBe(0);
		expect(second.dropped).toBe(0);
	});

	it("HONEST DROP: no projectSlug on the assignment — counted, logged once, latched", () => {
		const { delivery, sweep, logged } = rig(
			[desc({ id: "pij-root", lifecycle: "bound", parentId: null })],
			[doneAsg("asg-a", "pij-root", 5)],
			[doneEvent(5, "pij-root", "asg-a")],
			{ projects: [project("alpha", "pij-prime")] },
		);
		const first = sweep.tick();
		expect(first.alerts).toBe(0);
		expect(first.dropped).toBe(1);
		expect(delivery.outbox).toHaveLength(0);
		expect(logged).toHaveLength(1);
		expect(logged[0]).toContain("anomaly alert dropped");
		expect(logged[0]).toContain("no effective parent, no project prime");
		// the latch already fired — tick 2 neither re-drops nor re-logs.
		const second = sweep.tick();
		expect(second.dropped).toBe(0);
		expect(logged).toHaveLength(1);
	});

	it("HONEST DROP: the assignment's project has no primeId on record", () => {
		const { delivery, sweep, logged } = rig(
			[desc({ id: "pij-root", lifecycle: "bound", parentId: null })],
			[{ ...doneAsg("asg-a", "pij-root", 5), projectSlug: "alpha" }],
			[doneEvent(5, "pij-root", "asg-a")],
			{ projects: [project("alpha")] }, // primeless project
		);
		const first = sweep.tick();
		expect(first.alerts).toBe(0);
		expect(first.dropped).toBe(1);
		expect(delivery.outbox).toHaveLength(0);
		expect(logged).toHaveLength(1);
	});

	it("NEW evidence re-alerts: a fresh done after a verify is a new transition", () => {
		const registry = new FakeRegistry([
			desc({ id: "pij-n", lifecycle: "bound", parentId: "pij-parent" }),
		]);
		const assignmentStore = new FakeAssignmentStore([doneAsg("asg-a", "pij-n", 5)]);
		const spineLog = new FakeSpineLog([doneEvent(5, "pij-n", "asg-a")]);
		const delivery = new FakeDelivery();
		const sweep = new AnomalySweep({
			registry,
			assignmentStore,
			spineLog,
			delivery,
			now: () => NOW,
		});
		expect(sweep.tick().alerts).toBe(1);
		// verify lands (chain 5,6) then a NEW done (chain 5,6,9)
		const verifyEvent: SpineEvent = {
			schema_version: 1,
			seq: 6,
			ts: new Date(NOW).toISOString(),
			actor: "pij-reviewer",
			kind: "state-verified",
			verifiedBy: "pij-reviewer",
			peer: "pij-n",
			refs: ["node:pij-n", "assignment:asg-a", "state:done", "event:5"],
		};
		const spineLog2 = new FakeSpineLog([
			doneEvent(5, "pij-n", "asg-a"),
			verifyEvent,
			doneEvent(9, "pij-n", "asg-a"),
		]);
		const sweep2 = new AnomalySweep({
			registry,
			assignmentStore: new FakeAssignmentStore([
				{ ...doneAsg("asg-a", "pij-n", 5), states: [5, 6, 9] },
			]),
			spineLog: spineLog2,
			delivery,
			now: () => NOW,
		});
		// carry the first sweep's latch across (same daemon run shape):
		// a NEW sweep would re-alert seq 5's shape too — the point here is the
		// evidence-keyed latch distinguishes seq-9's anomaly from seq-5's.
		expect(sweep2.tick().alerts).toBe(1); // only the seq-9 unverified done exists now
		const bodies = delivery.outbox.map((e) => e.message.body);
		expect(bodies.some((b) => b.includes("9"))).toBe(true);
	});
});
