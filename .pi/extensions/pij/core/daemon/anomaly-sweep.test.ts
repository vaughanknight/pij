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
import type {
	ActivityCredibility,
	ActivityCredibilityInput,
	WatchdogSubscriptionInputs,
} from "../anomalies.js";
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
	extras: {
		projects?: Project[];
		watchdog?: WatchdogSubscriptionInputs;
		activityCredibility?: (input: ActivityCredibilityInput) => ActivityCredibility;
	} = {},
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
		...(extras.watchdog === undefined ? {} : { watchdog: () => extras.watchdog }),
		...(extras.activityCredibility === undefined
			? {}
			: { activityCredibility: extras.activityCredibility }),
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

/** T-3/T-4 — the sweep must actually RUN the recipient check.
 *
 *  `AnomalySweepDeps` had no watchdog input and `tick()` called
 *  `detectAnomalies` without one, so `inert-subscription` has NEVER fired in
 *  the daemon in any form — it appeared only when a human ran `pij anomalies`.
 *  A `#154` fix that never reaches the alert path is not a fix (V-3). */
describe("AnomalySweep — watchdog recipient wiring (#154)", () => {
	const credibility = (input: ActivityCredibilityInput): ActivityCredibility =>
		input.lifecycle === "dissolved"
			? {
					verdict: "superseded",
					cause: "dissolved",
					reason: "lifecycle is dissolved",
					...(input.terminal === undefined ? {} : { asOf: input.terminal.observedAt }),
				}
			: input.terminal === undefined
				? {
						verdict: "current",
						cause: "uncontradicted",
						reason: "nothing contradicts the recorded activity",
					}
				: {
						verdict: "superseded",
						cause: "agent-absent",
						reason: "a terminal observation is on record",
						asOf: input.terminal.observedAt,
					};

	const fleet = (): SessionDescriptor[] => [
		desc({ id: "pij-node", lifecycle: "bound", parentId: "pij-parent" }),
		desc({
			id: "pij-watcher",
			lifecycle: "bound",
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: new Date(NOW - 42 * 3_600_000).toISOString(),
				evidence: "pid-missing",
			},
		}),
	];

	const allGone: WatchdogSubscriptionInputs = {
		globallyDisabled: false,
		nodes: [{ nodeId: "pij-node", watchers: ["pij-watcher"] }],
	};

	it("1 · BEHAVIOURAL — with a projection + credibility fn it emits an inert-subscription alert", () => {
		const { delivery, sweep } = rig(fleet(), [], [], {
			watchdog: allGone,
			activityCredibility: credibility,
		});
		expect(sweep.tick().alerts).toBe(1);
		const toParent = delivery.outbox.filter((e) => e.message.to === "pij-parent");
		expect(toParent).toHaveLength(1);
		expect(toParent[0]?.message.body).toContain("inert-subscription");
		expect(toParent[0]?.message.body).toContain("no LIVE watcher remains");
	});

	it("2 · PRESERVED-PROPERTY — without them the sweep behaves exactly as today", () => {
		const { delivery, sweep } = rig(fleet(), [], []);
		const first = sweep.tick();
		expect(first.alerts).toBe(0);
		expect(first.anomalies).toBe(0);
		expect(delivery.outbox).toHaveLength(0);
	});

	it("2b · a projection WITHOUT the credibility fn cannot fire the recipient row", () => {
		const { sweep } = rig(fleet(), [], [], { watchdog: allGone });
		// The unwired-call-site property, end to end: half-wired is the same
		// observable as unwired, never a silent half-detector.
		expect(sweep.tick().anomalies).toBe(0);
	});

	it("3 · STORM GUARD — two consecutive ticks on an unchanged condition alert ONCE", () => {
		const { delivery, sweep } = rig(fleet(), [], [], {
			watchdog: allGone,
			activityCredibility: credibility,
		});
		expect(sweep.tick().alerts).toBe(1);
		// The latch keys on `kind:node:evidence`. A row whose evidence changed
		// every tick would re-notify the parent every 600ms; one whose evidence
		// is constant alerts once and then stays silent however much worse it
		// gets. This pins the no-op tick explicitly.
		expect(sweep.tick().alerts).toBe(0);
		expect(sweep.tick().alerts).toBe(0);
		expect(delivery.outbox).toHaveLength(1);
	});

	it("F-1 · BEHAVIOURAL — the ORIGINAL 42h incident alerts end to end (dissolved watcher)", () => {
		// The incident as it actually was: `pij-continuing-ermine` watched only by
		// `pij-respectable-starfish`, which pij had DISSOLVED. `list()` hides a
		// dissolved record by design, so the detector never saw the watcher at all
		// and bucketed it `unknown` → no row → 42 hours of silence that read as
		// health. `FakeRegistry` reproduces the tier split faithfully (hidden from
		// `list()`, findable by `read()`), so this is the real path, not a mock of
		// the conclusion.
		//
		// Written as the INCIDENT and not as the fleet's current shape on purpose:
		// current state is where the fix was developed, so it is the one
		// configuration guaranteed to agree with it. Ermine's watcher today is
		// terminal but NOT dissolved — visible to `list()`, and the pre-F-1 code
		// already fired on it. The passing case and the motivating case differed
		// by ONE LIFECYCLE VALUE, and that value was the entire defect.
		const { delivery, sweep } = rig(
			[
				desc({ id: "pij-continuing-ermine", lifecycle: "bound", parentId: "pij-parent" }),
				desc({
					id: "pij-respectable-starfish",
					lifecycle: "dissolved",
					terminal: {
						disposition: "requested",
						observedAt: "2026-08-06T01:31:59.006Z",
						evidence: "pane-missing",
					},
				}),
			],
			[],
			[],
			{
				watchdog: {
					globallyDisabled: false,
					nodes: [{ nodeId: "pij-continuing-ermine", watchers: ["pij-respectable-starfish"] }],
				},
				activityCredibility: credibility,
			},
		);
		expect(sweep.tick().alerts).toBe(1);
		const body = delivery.outbox[0]?.message.body ?? "";
		expect(body).toContain("no LIVE watcher remains");
		expect(body).toContain("pij-respectable-starfish");
		expect(body).toContain("0 unresolvable/unknown");
	});

	it("F-1 · an id NO tier resolves is still unknown, and the sweep stays silent", () => {
		const { delivery, sweep } = rig(
			[desc({ id: "pij-node", lifecycle: "bound", parentId: "pij-parent" })],
			[],
			[],
			{
				watchdog: {
					globallyDisabled: false,
					nodes: [{ nodeId: "pij-node", watchers: ["pij-typo-or-cross-home"] }],
				},
				activityCredibility: credibility,
			},
		);
		expect(
			sweep.tick().anomalies,
			"the archive lookup widens WHO can be resolved, never WHAT counts as gone",
		).toBe(0);
		expect(delivery.outbox).toHaveLength(0);
	});

	it("the recipient row and the paused-trigger row do NOT collide in the latch", () => {
		// Both carry `kind: "inert-subscription"` on the SAME node, and the paused
		// row's evidence is `[watchers.length]` — identical to the recipient row's
		// gone-count whenever every watcher is gone. A one-element evidence key
		// would silently swallow whichever row the sweep saw second.
		const { delivery, sweep } = rig(fleet(), [], [], {
			watchdog: {
				globallyDisabled: false,
				nodes: [{ nodeId: "pij-node", watchers: ["pij-watcher"], pausedBy: "self" }],
			},
			activityCredibility: credibility,
		});
		const first = sweep.tick();
		expect(first.anomalies).toBe(2);
		expect(first.alerts).toBe(2);
		const bodies = delivery.outbox.map((e) => e.message.body);
		expect(bodies.some((b) => b.includes("no LIVE watcher remains"))).toBe(true);
		expect(bodies.some((b) => b.includes("PAUSED by self"))).toBe(true);
	});
});
