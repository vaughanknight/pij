// pij-control-plane — anomaly queries (plan 054 P2 T010, AC-06/AC-07).
//
// Pure derivations over descriptors + assignments + spine events. Safety is
// DERIVED, never enforced (WS-6): these queries surface the three ruled
// shapes — axis-disagreement (the 1ca01u5 44h lost-dispatch incident),
// unverified done (survey-unanimous #1 danger), and a hold cleared by a
// non-issuer — each with spine-seq evidence refs.

import { describe, expect, it } from "vitest";
import {
	DEFAULT_IDLE_DISAGREEMENT_MS,
	DEFAULT_SPAWN_LIMBO_MS,
	detectAnomalies,
} from "./anomalies.js";
import type { Assignment, SpineEvent } from "./platform/types.js";
import type { SessionDescriptor } from "./types.js";

const NOW = Date.parse("2026-07-17T05:00:00.000Z");
const H44 = 44 * 3_600_000;

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: new Date(NOW - 2 * H44).toISOString(),
		...over,
	};
}

function asg(over: Partial<Assignment> & { id: string; nodeId: string }): Assignment {
	return {
		schema_version: 1,
		task: "work the dispatch",
		states: [],
		opened: { actor: "pij-boss", ts: new Date(NOW - H44).toISOString() },
		...over,
	};
}

function ev(over: Partial<SpineEvent> & { seq: number; kind: string }): SpineEvent {
	return {
		schema_version: 1,
		ts: new Date(NOW - H44).toISOString(),
		actor: "tester",
		refs: [],
		...over,
	};
}

function stateSet(
	seq: number,
	nodeId: string,
	assignmentId: string,
	word: string,
	actor: string,
): SpineEvent {
	return ev({
		seq,
		kind: "state-set",
		actor,
		peer: nodeId,
		refs: [`node:${nodeId}`, `assignment:${assignmentId}`, `state:${word}`],
	});
}

function verified(seq: number, nodeId: string, assignmentId: string, actor: string): SpineEvent {
	return ev({
		seq,
		kind: "state-verified",
		actor,
		verifiedBy: actor,
		peer: nodeId,
		refs: [`node:${nodeId}`, `assignment:${assignmentId}`, "state:done", `event:${seq - 1}`],
	});
}

describe("axis-disagreement (AC-07 — the 44h lost-dispatch shape, ruled non-negotiable)", () => {
	const idleFor44h = desc({
		id: "pij-lost",
		lifecycle: "bound",
		systemState: "idle",
		state: "idle",
		lastEventAt: new Date(NOW - H44).toISOString(),
	});
	const dispatched = asg({ id: "asg-dispatch", nodeId: "pij-lost" });

	it("an open undeclared assignment + system idle past the threshold is flagged with evidence", () => {
		const taskSet = ev({
			seq: 7,
			kind: "task-set",
			peer: "pij-lost",
			refs: ["node:pij-lost", "assignment:asg-dispatch"],
		});
		const anomalies = detectAnomalies({
			descriptors: [idleFor44h],
			assignments: [dispatched],
			events: [taskSet],
			nowMs: NOW,
		});
		expect(anomalies).toHaveLength(1);
		expect(anomalies[0]).toMatchObject({
			kind: "axis-disagreement",
			nodeId: "pij-lost",
			assignmentId: "asg-dispatch",
		});
		expect(anomalies[0]?.evidence).toContain(7);
	});

	it("idle BELOW the threshold is not an anomaly", () => {
		const fresh = { ...idleFor44h, lastEventAt: new Date(NOW - 60_000).toISOString() };
		expect(
			detectAnomalies({ descriptors: [fresh], assignments: [dispatched], events: [], nowMs: NOW }),
		).toHaveLength(0);
	});

	it("a FRESH spawn with no telemetry yet is NOT a lost dispatch — idle is bounded by startedAt (kingfisher false-positive, dogfood #2)", () => {
		const justBorn = desc({
			id: "pij-lost",
			lifecycle: "bound",
			systemState: "idle",
			state: "idle",
			startedAt: new Date(NOW - 60_000).toISOString(),
			// no lastEventAt at all — zero activity samples
		});
		expect(
			detectAnomalies({
				descriptors: [justBorn],
				assignments: [dispatched],
				events: [],
				nowMs: NOW,
			}),
		).toHaveLength(0);
	});

	it("no telemetry on an OLD node still fires — bounded by age, detail carries hours not 'forever'", () => {
		const oldSilent = desc({
			id: "pij-lost",
			lifecycle: "bound",
			systemState: "idle",
			state: "idle",
			// desc() default startedAt = NOW - 88h; no lastEventAt
		});
		const anomalies = detectAnomalies({
			descriptors: [oldSilent],
			assignments: [dispatched],
			events: [],
			nowMs: NOW,
		});
		expect(anomalies).toHaveLength(1);
		expect(anomalies[0]?.detail).toContain("88h");
		expect(anomalies[0]?.detail).not.toContain("since forever");
	});

	it("a PARKED semantic state (waiting/hold/blocked/question) is legitimate idleness", () => {
		for (const word of ["waiting", "hold", "blocked", "question"]) {
			const withState = asg({ id: "asg-dispatch", nodeId: "pij-lost", states: [3] });
			const anomalies = detectAnomalies({
				descriptors: [idleFor44h],
				assignments: [withState],
				events: [stateSet(3, "pij-lost", "asg-dispatch", word, "pij-lost")],
				nowMs: NOW,
			});
			expect(anomalies.filter((a) => a.kind === "axis-disagreement")).toHaveLength(0);
		}
	});

	it("ready + idle past threshold IS the disagreement (claims ready to act, never acts)", () => {
		const withReady = asg({ id: "asg-dispatch", nodeId: "pij-lost", states: [3] });
		const anomalies = detectAnomalies({
			descriptors: [idleFor44h],
			assignments: [withReady],
			events: [stateSet(3, "pij-lost", "asg-dispatch", "ready", "pij-lost")],
			nowMs: NOW,
		});
		expect(anomalies.filter((a) => a.kind === "axis-disagreement")).toHaveLength(1);
	});

	it("a WORKING system never disagrees; a closed assignment never disagrees", () => {
		const working = { ...idleFor44h, systemState: "working" as const };
		expect(
			detectAnomalies({
				descriptors: [working],
				assignments: [dispatched],
				events: [],
				nowMs: NOW,
			}).filter((a) => a.kind === "axis-disagreement"),
		).toHaveLength(0);
		const closed = asg({
			id: "asg-dispatch",
			nodeId: "pij-lost",
			closed: { actor: "pij-boss", ts: new Date(NOW).toISOString(), reason: "done" },
		});
		expect(
			detectAnomalies({
				descriptors: [idleFor44h],
				assignments: [closed],
				events: [],
				nowMs: NOW,
			}).filter((a) => a.kind === "axis-disagreement"),
		).toHaveLength(0);
	});

	it("the default threshold is hours-scale, not minutes (44h incident >> default)", () => {
		expect(DEFAULT_IDLE_DISAGREEMENT_MS).toBeGreaterThanOrEqual(3_600_000);
		expect(H44).toBeGreaterThan(DEFAULT_IDLE_DISAGREEMENT_MS);
	});
});

describe("unverified done (AC-06 — done is a claim until verified)", () => {
	const node = desc({ id: "pij-n", lifecycle: "bound", systemState: "idle" });

	it("a chain whose latest state is done WITHOUT a later verify is flagged, evidence = done seq", () => {
		const a = asg({ id: "asg-a", nodeId: "pij-n", states: [5] });
		const anomalies = detectAnomalies({
			descriptors: [node],
			assignments: [a],
			events: [stateSet(5, "pij-n", "asg-a", "done", "pij-n")],
			nowMs: NOW,
		});
		const found = anomalies.filter((x) => x.kind === "unverified-done");
		expect(found).toHaveLength(1);
		expect(found[0]?.evidence).toEqual([5]);
	});

	it("a verify AFTER the done flips it clean; a NEW done after that flags again", () => {
		const verifiedChain = asg({ id: "asg-a", nodeId: "pij-n", states: [5, 6] });
		expect(
			detectAnomalies({
				descriptors: [node],
				assignments: [verifiedChain],
				events: [
					stateSet(5, "pij-n", "asg-a", "done", "pij-n"),
					verified(6, "pij-n", "asg-a", "pij-reviewer"),
				],
				nowMs: NOW,
			}).filter((x) => x.kind === "unverified-done"),
		).toHaveLength(0);

		const redone = asg({ id: "asg-a", nodeId: "pij-n", states: [5, 6, 9] });
		expect(
			detectAnomalies({
				descriptors: [node],
				assignments: [redone],
				events: [
					stateSet(5, "pij-n", "asg-a", "done", "pij-n"),
					verified(6, "pij-n", "asg-a", "pij-reviewer"),
					stateSet(9, "pij-n", "asg-a", "done", "pij-n"),
				],
				nowMs: NOW,
			}).filter((x) => x.kind === "unverified-done"),
		).toHaveLength(1);
	});
});

describe("foreign hold-clear (hold released by an actor other than its issuer)", () => {
	const node = desc({ id: "pij-n", lifecycle: "bound" });

	it("hold by A, next state by B ≠ A → flagged with both seqs as evidence", () => {
		const a = asg({ id: "asg-a", nodeId: "pij-n", states: [4, 8] });
		const anomalies = detectAnomalies({
			descriptors: [node],
			assignments: [a],
			events: [
				stateSet(4, "pij-n", "asg-a", "hold", "pij-issuer"),
				stateSet(8, "pij-n", "asg-a", "ready", "pij-meddler"),
			],
			nowMs: NOW,
		});
		const found = anomalies.filter((x) => x.kind === "foreign-hold-clear");
		expect(found).toHaveLength(1);
		expect(found[0]?.evidence).toEqual([4, 8]);
		expect(found[0]?.detail).toContain("pij-issuer");
		expect(found[0]?.detail).toContain("pij-meddler");
	});

	it("the issuer clearing their own hold is clean", () => {
		const a = asg({ id: "asg-a", nodeId: "pij-n", states: [4, 8] });
		expect(
			detectAnomalies({
				descriptors: [node],
				assignments: [a],
				events: [
					stateSet(4, "pij-n", "asg-a", "hold", "pij-issuer"),
					stateSet(8, "pij-n", "asg-a", "ready", "pij-issuer"),
				],
				nowMs: NOW,
			}).filter((x) => x.kind === "foreign-hold-clear"),
		).toHaveLength(0);
	});
});

describe("spawn-limbo (T1 — the bind-zombie class the watchdog cannot see)", () => {
	const NOW_MS = NOW;
	function limboDesc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
		return desc({
			lifecycle: "pending",
			startedAt: new Date(NOW_MS - 10 * 60_000).toISOString(),
			...over,
		});
	}

	it("a seat pending past the deadline fires with an honest zero-events detail", () => {
		const anomalies = detectAnomalies({
			descriptors: [limboDesc({ id: "pij-wedged" })],
			assignments: [],
			events: [],
			nowMs: NOW_MS,
		});
		const limbo = anomalies.filter((a) => a.kind === "spawn-limbo");
		expect(limbo).toHaveLength(1);
		expect(limbo[0]?.nodeId).toBe("pij-wedged");
		expect(limbo[0]?.detail).toContain("never bound");
		expect(limbo[0]?.detail).toContain("zero spine events");
		expect(limbo[0]?.evidence).toEqual([]);
	});

	it("ready counts as limbo too; bound never does; young pending never does", () => {
		const ready = limboDesc({ id: "pij-r", lifecycle: "ready" });
		const bound = limboDesc({ id: "pij-b", lifecycle: "bound" });
		const young = limboDesc({
			id: "pij-y",
			startedAt: new Date(NOW_MS - 2 * 60_000).toISOString(),
		});
		const kinds = detectAnomalies({
			descriptors: [ready, bound, young],
			assignments: [],
			events: [],
			nowMs: NOW_MS,
		}).filter((a) => a.kind === "spawn-limbo");
		expect(kinds.map((a) => a.nodeId)).toEqual(["pij-r"]);
	});

	it("cites the seat's own spine events as evidence when any exist", () => {
		const anomalies = detectAnomalies({
			descriptors: [limboDesc({ id: "pij-wedged" })],
			assignments: [],
			events: [ev({ seq: 9, kind: "system-state", peer: "pij-wedged" })],
			nowMs: NOW_MS,
		});
		expect(anomalies.find((a) => a.kind === "spawn-limbo")?.evidence).toEqual([9]);
	});

	it("the deadline is generous — default is minutes-scale, several times a slow cold boot", () => {
		expect(DEFAULT_SPAWN_LIMBO_MS).toBeGreaterThanOrEqual(5 * 60_000);
	});
});

describe("axis-disagreement remedy hint (mastodon intake — a confusing alarm becomes self-clearing)", () => {
	it("the detail names the self-serve remedy with the node's own id", () => {
		const idler = desc({
			id: "pij-lost",
			lifecycle: "bound",
			systemState: "idle",
			state: "idle",
			lastEventAt: new Date(NOW - H44).toISOString(),
		});
		const a = detectAnomalies({
			descriptors: [idler],
			assignments: [asg({ id: "asg-d", nodeId: "pij-lost" })],
			events: [],
			nowMs: NOW,
		}).find((x) => x.kind === "axis-disagreement");
		expect(a?.detail).toContain("pij state set pij-lost waiting|hold|blocked|question");
		expect(a?.detail).toContain("parked states never flag");
	});
});
