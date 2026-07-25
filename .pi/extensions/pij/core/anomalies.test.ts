// pij-control-plane — anomaly queries (plan 054 P2 T010, AC-06/AC-07).
//
// Pure derivations over descriptors + assignments + spine events. Safety is
// DERIVED, never enforced (WS-6): these queries surface the three ruled
// shapes — axis-disagreement (the 1ca01u5 44h lost-dispatch incident),
// unverified done (survey-unanimous #1 danger), and a hold cleared by a
// non-issuer — each with spine-seq evidence refs.

import { describe, expect, it } from "vitest";
import {
	chainStateOf,
	DEFAULT_IDLE_DISAGREEMENT_MS,
	DEFAULT_INBOX_POLL_STALL_MS,
	DEFAULT_SPAWN_LIMBO_MS,
	detectAnomalies,
} from "./anomalies.js";
import type { Allocation, Assignment, Dispatch, SpineEvent } from "./platform/types.js";
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

function stateCleared(
	seq: number,
	nodeId: string,
	assignmentId: string,
	actor: string,
): SpineEvent {
	return ev({
		seq,
		kind: "state-cleared",
		actor,
		peer: nodeId,
		refs: [`node:${nodeId}`, `assignment:${assignmentId}`, "transition:clear"],
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

	it("foreign clear after hold is flagged with both seqs; issuer clear is clean", () => {
		const a = asg({ id: "asg-a", nodeId: "pij-n", states: [4, 8] });
		const foreign = detectAnomalies({
			descriptors: [node],
			assignments: [a],
			events: [
				stateSet(4, "pij-n", "asg-a", "hold", "pij-issuer"),
				stateCleared(8, "pij-n", "asg-a", "pij-meddler"),
			],
			nowMs: NOW,
		}).filter((x) => x.kind === "foreign-hold-clear");
		expect(foreign).toHaveLength(1);
		expect(foreign[0]?.evidence).toEqual([4, 8]);

		expect(
			detectAnomalies({
				descriptors: [node],
				assignments: [a],
				events: [
					stateSet(4, "pij-n", "asg-a", "hold", "pij-issuer"),
					stateCleared(8, "pij-n", "asg-a", "pij-issuer"),
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

describe("inbox-poll-stalled (plan 057 thread-1 — poll-primary delivery liveness)", () => {
	const STALL = DEFAULT_INBOX_POLL_STALL_MS;

	function stalledOnly(descriptors: SessionDescriptor[], nowMs = NOW, over: object = {}) {
		return detectAnomalies({ descriptors, assignments: [], events: [], nowMs, ...over }).filter(
			(x) => x.kind === "inbox-poll-stalled",
		);
	}

	it("flags a BOUND seat whose poll stamp is older than the threshold — evidence is the frozen stamp ms", () => {
		const scanMs = NOW - (STALL + 2_000);
		const a = stalledOnly([
			desc({
				id: "pij-stalled",
				lifecycle: "bound",
				lastInboxScanAt: new Date(scanMs).toISOString(),
			}),
		]);
		expect(a).toHaveLength(1);
		expect(a[0]?.nodeId).toBe("pij-stalled");
		expect(a[0]?.evidence).toEqual([scanMs]);
		expect(a[0]?.detail).toContain("stranding messages");
	});

	it("does NOT flag a BOUND seat whose stamp is fresh (within threshold)", () => {
		expect(
			stalledOnly([
				desc({
					id: "pij-fresh",
					lifecycle: "bound",
					lastInboxScanAt: new Date(NOW - 1_000).toISOString(),
				}),
			]),
		).toHaveLength(0);
	});

	it("does NOT flag a seat with NO stamp — a non-self-polling seat (tmux, daemon-drained) never registers", () => {
		expect(stalledOnly([desc({ id: "pij-tmux", lifecycle: "bound" })])).toHaveLength(0);
	});

	// s070 / warbler finding — the FOURTH owner-facing notify path. `pij close`
	// stamps `terminal: requested` BEFORE it dissolves, and fs-registry lists the
	// record throughout that window, so a just-closed seat is still `bound` with a
	// frozen poll stamp — the exact shape this detector calls an anomaly. It then
	// routed to effectiveParent→spawnedBy, so a pij-REQUESTED close false-alerted
	// its own owner. Same failure class as the `unrequested-by-pij` defect: terminal
	// truth was recorded correctly and the notify path never asked.
	const CLOSED_TERMINAL = {
		disposition: "requested" as const,
		observedAt: new Date(NOW).toISOString(),
		evidence: "pane-missing" as const,
	};

	it("CONTROL: the identical seat WITHOUT a terminal record does flag", () => {
		// Byte-identical to the test below except for `terminal`. Without this, the
		// suppression test below would pass even if the detector never fired at all.
		const a = stalledOnly([
			desc({
				id: "pij-closing",
				lifecycle: "bound",
				lastInboxScanAt: new Date(NOW - (STALL + 2_000)).toISOString(),
			}),
		]);
		expect(a).toHaveLength(1);
	});

	it("does NOT flag a seat already observed TERMINAL — a requested close is not a stall", () => {
		expect(
			stalledOnly([
				desc({
					id: "pij-closing",
					lifecycle: "bound",
					lastInboxScanAt: new Date(NOW - (STALL + 2_000)).toISOString(),
					terminal: CLOSED_TERMINAL,
				}),
			]),
		).toHaveLength(0);
	});

	it("does NOT flag a terminal seat in spawn-limbo either — same window, same rule", () => {
		// warbler named inbox-poll-stalled; spawn-limbo has the identical exposure,
		// because closing a PENDING seat leaves lifecycle 'pending' + terminal set in
		// that same pre-dissolve window. CONTROL first, then the suppression.
		const born = new Date(NOW - (DEFAULT_SPAWN_LIMBO_MS + 60_000)).toISOString();
		const limboOnly = (descriptors: SessionDescriptor[]) =>
			detectAnomalies({ descriptors, assignments: [], events: [], nowMs: NOW }).filter(
				(x) => x.kind === "spawn-limbo",
			);
		expect(
			limboOnly([desc({ id: "pij-limbo", lifecycle: "pending", startedAt: born })]),
		).toHaveLength(1);
		expect(
			limboOnly([
				desc({
					id: "pij-limbo",
					lifecycle: "pending",
					startedAt: born,
					terminal: CLOSED_TERMINAL,
				}),
			]),
		).toHaveLength(0);
	});

	it("does NOT flag a non-bound seat even with a stale stamp (only live-bound delivery loops are watched)", () => {
		expect(
			stalledOnly([
				desc({
					id: "pij-ready",
					lifecycle: "ready",
					lastInboxScanAt: new Date(NOW - (STALL + 10_000)).toISOString(),
				}),
			]),
		).toHaveLength(0);
	});

	it("re-alerts per episode: a fresh stall after recovery has a new evidence key", () => {
		const first = NOW - (STALL + 1_000);
		const second = NOW - (STALL + 500); // a later, distinct frozen stamp
		const a1 = stalledOnly([
			desc({ id: "pij-x", lifecycle: "bound", lastInboxScanAt: new Date(first).toISOString() }),
		]);
		const a2 = stalledOnly([
			desc({ id: "pij-x", lifecycle: "bound", lastInboxScanAt: new Date(second).toISOString() }),
		]);
		expect(a1[0]?.evidence).toEqual([first]);
		expect(a2[0]?.evidence).toEqual([second]);
		expect(a1[0]?.evidence).not.toEqual(a2[0]?.evidence); // distinct latch key => re-alert
	});

	it("honors an override threshold", () => {
		const seat = [
			desc({
				id: "pij-tuned",
				lifecycle: "bound",
				lastInboxScanAt: new Date(NOW - 4_000).toISOString(),
			}),
		];
		expect(stalledOnly(seat)).toHaveLength(0); // 4s-stale not flagged at the 6s default
		expect(stalledOnly(seat, NOW, { inboxPollStallMs: 3_000 })).toHaveLength(1); // flagged at 3s
	});
});

describe("state-cleared chain transition", () => {
	it("clear makes the latest declaration undeclared, retains history, and a later set wins", () => {
		const assignment = asg({ id: "asg-clear", nodeId: "pij-n", states: [3, 5, 7] });
		const events = [
			stateSet(3, "pij-n", "asg-clear", "hold", "pij-owner"),
			ev({
				seq: 5,
				kind: "state-cleared",
				actor: "pij-owner",
				peer: "pij-n",
				refs: ["node:pij-n", "assignment:asg-clear"],
			}),
			stateSet(7, "pij-n", "asg-clear", "ready", "pij-owner"),
		];
		expect(chainStateOf({ ...assignment, states: [3, 5] }, events)).toEqual({ verified: false });
		expect(chainStateOf(assignment, events)).toMatchObject({ state: "ready", stateSeq: 7 });
	});

	it("a cleared parked state again participates in the existing idle-disagreement predicate", () => {
		const assignment = asg({ id: "asg-clear", nodeId: "pij-lost", states: [3, 5] });
		const events = [
			stateSet(3, "pij-lost", "asg-clear", "hold", "pij-owner"),
			ev({
				seq: 5,
				kind: "state-cleared",
				actor: "pij-owner",
				peer: "pij-lost",
				refs: ["node:pij-lost", "assignment:asg-clear"],
			}),
		];
		const anomalies = detectAnomalies({
			descriptors: [
				desc({
					id: "pij-lost",
					lifecycle: "bound",
					systemState: "idle",
					lastEventAt: new Date(NOW - H44).toISOString(),
				}),
			],
			assignments: [assignment],
			events,
			nowMs: NOW,
		});
		expect(anomalies.some((anomaly) => anomaly.kind === "axis-disagreement")).toBe(true);
	});
});

describe("team-scaffold record anomalies (plan 061 AC-07)", () => {
	const RECORD_STALE_MS = 15 * 60_000;

	function dispatchRecord(over: Partial<Dispatch> = {}): Dispatch {
		return {
			schema_version: 1,
			id: "dispatch-stale",
			packetPath: "/repo/packet.md",
			packetSha256: "a".repeat(64),
			from: "pij-parent",
			to: "pij-worker",
			messageId: "msg-1",
			deliveryState: "delivered",
			state: "delivered-unacked",
			created: { actor: "pij-parent", ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString() },
			updated: { actor: "pij-parent", ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString() },
			...over,
		};
	}

	function allocationRecord(over: Partial<Allocation> = {}): Allocation {
		return {
			schema_version: 1,
			id: "alloc-s061-half-open",
			project: "team-scaffold",
			ordinal: 61,
			slug: "half-open",
			worktree: "/repo-worktrees/s061-half-open",
			branch: "s061/half-open",
			baseSha: "base-sha",
			state: "created",
			steps: [
				{
					name: "ordinal-reserved",
					ok: true,
					evidence: "reserved",
					ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
				},
			],
			created: {
				actor: "pij-prime",
				ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
			},
			...over,
		};
	}

	it("freezes the existing clean fixture output before record-derived classes are added", () => {
		expect(
			detectAnomalies({
				descriptors: [],
				assignments: [],
				events: [],
				nowMs: NOW,
			}),
		).toEqual([]);
	});

	it("flags only stale delivered-unacked dispatches with record and age evidence", () => {
		const stale = dispatchRecord();
		const fresh = dispatchRecord({
			id: "dispatch-fresh",
			updated: { actor: "pij-parent", ts: new Date(NOW - 1_000).toISOString() },
		});
		const acked = dispatchRecord({
			id: "dispatch-acked",
			state: "acked",
			ack: {
				schema_version: 1,
				kind: "brief-ack",
				messageId: "msg-1",
				packetId: "dispatch-acked",
				packetSha256: "a".repeat(64),
				declaredRuntime: { model: "test/model", effort: "high", source: "self-report" },
				seat: "pij-worker",
				ts: new Date(NOW - RECORD_STALE_MS).toISOString(),
			},
		});
		const undelivered = dispatchRecord({
			id: "dispatch-undelivered",
			messageId: undefined,
			deliveryState: undefined,
			state: "undelivered",
		});

		const found = detectAnomalies({
			descriptors: [],
			assignments: [],
			events: [],
			dispatches: [stale, fresh, acked, undelivered],
			allocations: [],
			nowMs: NOW,
			dispatchStaleMs: RECORD_STALE_MS,
		}).filter((anomaly) => anomaly.kind === "delivered-unacked-stale");

		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			nodeId: "pij-worker",
			recordRef: "dispatch:dispatch-stale",
			ageMs: 2 * RECORD_STALE_MS,
		});
		expect(found[0]?.detail).toContain("dispatch:dispatch-stale");
		expect(found[0]?.detail).toContain("30min");
		expect(found[0]?.evidence).toEqual([Date.parse(stale.updated.ts)]);
	});

	it("flags stale incomplete create and close journals while complete active allocations stay clean", () => {
		const halfCreated = allocationRecord();
		const halfClosed = allocationRecord({
			id: "alloc-s062-half-close",
			ordinal: 62,
			slug: "half-close",
			steps: [
				...allocationRecord().steps,
				{
					name: "worktree-created",
					ok: true,
					evidence: "created",
					ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
				},
				{
					name: "allocation-committed",
					ok: true,
					evidence: "committed",
					ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
				},
				{
					name: "wip-preserved",
					ok: true,
					evidence: "clean",
					ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
				},
			],
		});
		const complete = allocationRecord({
			id: "alloc-s063-complete",
			ordinal: 63,
			slug: "complete",
			steps: [
				...allocationRecord().steps,
				{
					name: "worktree-created",
					ok: true,
					evidence: "created",
					ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
				},
				{
					name: "allocation-committed",
					ok: true,
					evidence: "committed",
					ts: new Date(NOW - 2 * RECORD_STALE_MS).toISOString(),
				},
			],
		});

		const found = detectAnomalies({
			descriptors: [],
			assignments: [],
			events: [],
			dispatches: [],
			allocations: [halfCreated, halfClosed, complete],
			nowMs: NOW,
			allocationHalfOpenMs: RECORD_STALE_MS,
		}).filter((anomaly) => anomaly.kind === "allocation-half-open");

		expect(found.map((anomaly) => anomaly.recordRef)).toEqual([
			"allocation:alloc-s061-half-open",
			"allocation:alloc-s062-half-close",
		]);
		expect(found[0]?.detail).toContain("worktree-created");
		expect(found[1]?.detail).toContain("allocation-closed");
		expect(found.every((anomaly) => anomaly.ageMs === 2 * RECORD_STALE_MS)).toBe(true);
	});

	it("produces zero false positives on clean records and never mutates scanned stores", () => {
		const dispatches = [
			dispatchRecord({
				id: "dispatch-fresh",
				updated: { actor: "pij-parent", ts: new Date(NOW - 1_000).toISOString() },
			}),
		];
		const allocations = [
			allocationRecord({
				steps: [
					...allocationRecord().steps,
					{
						name: "worktree-created",
						ok: true,
						evidence: "created",
						ts: new Date(NOW - 1_000).toISOString(),
					},
					{
						name: "allocation-committed",
						ok: true,
						evidence: "committed",
						ts: new Date(NOW - 1_000).toISOString(),
					},
				],
			}),
		];
		const before = structuredClone({ dispatches, allocations });

		expect(
			detectAnomalies({
				descriptors: [],
				assignments: [],
				events: [],
				dispatches,
				allocations,
				nowMs: NOW,
				dispatchStaleMs: RECORD_STALE_MS,
				allocationHalfOpenMs: RECORD_STALE_MS,
			}),
		).toEqual([]);
		expect({ dispatches, allocations }).toEqual(before);
	});
});
