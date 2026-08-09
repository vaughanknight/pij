// pij-control-plane — anomaly queries (plan 054 P2 T010, AC-06/AC-07).
//
// Pure derivations over descriptors + assignments + spine events. Safety is
// DERIVED, never enforced (WS-6): these queries surface the three ruled
// shapes — axis-disagreement (the 1ca01u5 44h lost-dispatch incident),
// unverified done (survey-unanimous #1 danger), and a hold cleared by a
// non-issuer — each with spine-seq evidence refs.

import { describe, expect, it } from "vitest";
import type {
	ActivityCredibility,
	ActivityCredibilityInput,
	RetiredWatcherRecord,
	WatchdogSubscriptionInputs,
} from "./anomalies.js";
import {
	axisRemedy,
	chainStateOf,
	DEFAULT_IDLE_DISAGREEMENT_MS,
	DEFAULT_INBOX_POLL_STALL_MS,
	DEFAULT_SPAWN_LIMBO_MS,
	DEFAULT_STATUS_STALE_MS,
	detectAnomalies,
} from "./anomalies.js";
import type { Allocation, Assignment, Dispatch, SpineEvent } from "./platform/types.js";
import type { SessionDescriptor, TerminalObservation } from "./types.js";

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

	/** The remedy omitted the COMMONEST cause. This row detects an open
	 *  assignment with no matching activity, and the usual reason is neither
	 *  waiting nor a lost dispatch — the work is FINISHED and the record is
	 *  stale. `task close --reason done` discharges it, and the line never named
	 *  it, so a COMPLIANT seat would declare a parked state and permanently
	 *  silence a row pointing at genuine undischarged work.
	 *
	 *  Found on this government's own record: #71's assignment sat open four
	 *  hours after it merged and every option offered was false of it. */
	it("offers `task close` for the finished-work case, which had no true option", () => {
		const taskSet = ev({
			seq: 7,
			kind: "task-set",
			peer: "pij-lost",
			refs: ["node:pij-lost", "assignment:asg-dispatch"],
		});
		const detail =
			detectAnomalies({
				descriptors: [idleFor44h],
				assignments: [dispatched],
				events: [taskSet],
				nowMs: NOW,
			})[0]?.detail ?? "";
		expect(detail).toContain("pij task close asg-dispatch --reason done");
		expect(detail).toContain("WORK IS FINISHED");
		// The authorship rule is stated where it is needed, not left to be
		// discovered by tripping an E-OWN refusal.
		expect(detail).toContain("only the assignee may attest done");
	});

	it("keeps the parked option GATED on a genuine wait, and still names the alarm case", () => {
		const taskSet = ev({
			seq: 7,
			kind: "task-set",
			peer: "pij-lost",
			refs: ["node:pij-lost", "assignment:asg-dispatch"],
		});
		const detail =
			detectAnomalies({
				descriptors: [idleFor44h],
				assignments: [dispatched],
				events: [taskSet],
				nowMs: NOW,
			})[0]?.detail ?? "";
		// Condition first, verb second — the discharge option must come BEFORE
		// the parked one, since a stale record is the commoner cause and a seat
		// takes the first option that looks plausible.
		expect(detail.indexOf("task close")).toBeLessThan(detail.indexOf("report state waiting"));
		expect(detail).toContain("genuinely WAITING");
		// The third cause: the row is simply RIGHT. A remediation that never
		// admits this teaches seats that every row has a way to make it go away.
		expect(detail).toContain("the dispatch really is lost and this row is the alarm");
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
		// The remedy is still self-serve and still names the node's own id — what
		// changed is that it now names the DISCHARGING action too. This assertion
		// used to pin the parked-only text; that was not wrong about the code, it
		// was wrong about the world, since the commonest cause is a finished unit
		// with a stale record and the line had no option for it.
		expect(a?.detail).toContain("pij task close asg-d --reason done");
		expect(a?.detail).toContain(
			"pij report state waiting|hold|blocked|question --assignment asg-d",
		);
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

describe("status-stale (the card a busy seat forgot to update)", () => {
	const MIN = 60_000;
	// Busy RIGHT NOW: emitting seconds ago, so the watchdog would never fire.
	const busy = (over: Partial<SessionDescriptor> & { id: string }) =>
		desc({ lastEventAt: new Date(NOW - 5_000).toISOString(), orchestrationRole: "pm", ...over });

	function detect(descriptors: readonly SessionDescriptor[]) {
		return detectAnomalies({
			descriptors,
			assignments: [],
			events: [],
			nowMs: NOW,
		}).filter((a) => a.kind === "status-stale");
	}

	it("flags a seat that is actively emitting while its card has not moved", () => {
		const found = detect([
			busy({ id: "pij-busy", statusAt: new Date(NOW - 45 * MIN).toISOString() }),
		]);
		expect(found.map((a) => a.nodeId)).toEqual(["pij-busy"]);
		expect(found[0]?.detail).toContain("pij report now");
		expect(found[0]?.ageMs).toBeGreaterThan(DEFAULT_STATUS_STALE_MS);
	});

	/** A REMEDIATION THAT WRITES THE DETECTOR'S OWN INPUT IS A SNOOZE; ONE THAT
	 *  CHANGES THE CONDITION IS A RESOLUTION. This detector's input is `statusAt`
	 *  and `report now` writes `statusAt`, so for a seat parked on something with
	 *  no known end the card refresh cannot resolve the row by construction — it
	 *  returns every threshold, forever. The line used to offer both as equals
	 *  with the ineffective one FIRST, and a seat parked 39h on a human ruling
	 *  took it, clearing the row and re-arming it indefinitely.
	 *
	 *  Asserted on ORDER and on the stated WHY, because a reader picks the first
	 *  option offered and only the reason generalises to other detectors. */
	it("leads with the remedy that RESOLVES, not the one that resets the timer", () => {
		const detail =
			detect([busy({ id: "pij-parked", statusAt: new Date(NOW - 45 * MIN).toISOString() })])[0]
				?.detail ?? "";
		const parked = detail.indexOf("declare a parked state");
		const refresh = detail.indexOf("pij report now");
		expect(parked, "the parked-state remedy is missing").toBeGreaterThan(-1);
		expect(refresh, "the card-refresh remedy is missing").toBeGreaterThan(-1);
		expect(parked, "the resetting remedy is offered before the resolving one").toBeLessThan(
			refresh,
		);
	});

	it("says WHY refreshing does not resolve it, so the lesson generalises", () => {
		const detail =
			detect([busy({ id: "pij-parked", statusAt: new Date(NOW - 45 * MIN).toISOString() })])[0]
				?.detail ?? "";
		expect(detail).toContain("resets this timer");
		expect(detail).toContain("WITHOUT changing the wait");
	});

	it("gates the remedy on the seat's SITUATION rather than its preference", () => {
		const detail =
			detect([busy({ id: "pij-parked", statusAt: new Date(NOW - 45 * MIN).toISOString() })])[0]
				?.detail ?? "";
		expect(detail).toContain("waiting on something with no known end");
	});

	it("stays quiet when the card is fresh", () => {
		expect(
			detect([busy({ id: "pij-fresh", statusAt: new Date(NOW - 2 * MIN).toISOString() })]),
		).toEqual([]);
	});

	it("flags a busy seat that has NEVER reported, ageing from its own start", () => {
		// A-2's shape: keying on statusAt alone would never fire for exactly the
		// seat that has never filed a card.
		const found = detect([
			busy({ id: "pij-never", startedAt: new Date(NOW - 90 * MIN).toISOString() }),
		]);
		expect(found.map((a) => a.nodeId)).toEqual(["pij-never"]);
		expect(found[0]?.detail).toContain("never reported");
	});

	// ── the two ways this sensor could earn distrust ──────────────────────────
	it("never flags a seat that is merely QUIET — that is the watchdog's job", () => {
		// Stale card AND stopped emitting: the watchdog owns this one. Flagging it
		// here would re-accuse every finished seat forever.
		expect(
			detect([
				desc({
					id: "pij-quiet",
					// MUST carry a role, or the role scope filters this row out and the
					// assertion passes without ever reaching the busy-now gate it exists
					// to pin (caught by mutation: dropping the gate failed 0 tests).
					orchestrationRole: "pm",
					lastEventAt: new Date(NOW - 3 * 3_600_000).toISOString(),
					statusAt: new Date(NOW - 4 * 3_600_000).toISOString(),
				}),
			]),
		).toEqual([]);
	});

	it("never flags a seat that PARKED itself, however stale the card", () => {
		// Declaring waiting/hold/blocked/question is the correct behaviour; a
		// sensor that punishes it teaches seats not to declare.
		for (const state of ["waiting", "hold", "blocked", "question"] as const) {
			expect(
				detect([
					busy({
						id: `pij-${state}`,
						semanticState: state,
						statusAt: new Date(NOW - 5 * 3_600_000).toISOString(),
					}),
				]),
			).toEqual([]);
		}
	});

	it("never flags a seat it cannot prove was working, or one already buried", () => {
		expect(detect([desc({ id: "pij-no-telemetry" })])).toEqual([]);
		expect(
			detect([
				busy({
					id: "pij-buried",
					lifecycle: "dissolved",
					statusAt: new Date(NOW - 5 * 3_600_000).toISOString(),
				}),
			]),
		).toEqual([]);
	});
});

describe("status-stale stays scoped to seats whose card is consumed", () => {
	const MIN = 60_000;
	function detect(descriptors: readonly SessionDescriptor[]) {
		return detectAnomalies({
			descriptors,
			assignments: [],
			events: [],
			nowMs: NOW,
		}).filter((a) => a.kind === "status-stale");
	}

	it("never flags a role-less worker — its now/next renders nowhere", () => {
		// The credibility guard. Measured on the live fleet the day this shipped,
		// 26 of 29 live seats had never reported; without this scope the sensor
		// fires on ~90% of the fleet and becomes background noise.
		expect(
			detect([
				desc({
					id: "pij-worker",
					lastEventAt: new Date(NOW - 5_000).toISOString(),
					statusAt: new Date(NOW - 5 * 3_600_000).toISOString(),
				}),
			]),
		).toEqual([]);
	});

	it("never flags an explicitly-STAMPED worker holding a rotten card", () => {
		// The case the old `role === null` gate silently let through: a stamped
		// worker projects to "worker", not null, so it passed the scope test and —
		// holding a real statusAt — reached the anchor and fired, despite the
		// comment beside that gate claiming workers were excluded. Only
		// `cardCanMislead` (prime||pm) actually excludes it.
		expect(
			detect([
				desc({
					id: "pij-stamped-worker",
					orchestrationRole: "worker",
					lastEventAt: new Date(NOW - 5_000).toISOString(),
					statusAt: new Date(NOW - 5 * 3_600_000).toISOString(),
				}),
			]),
		).toEqual([]);
	});

	it("flags prime and pm seats alike", () => {
		const stale = { statusAt: new Date(NOW - 90 * MIN).toISOString() };
		const found = detect([
			desc({
				id: "pij-prime",
				prime: true,
				lastEventAt: new Date(NOW - 5_000).toISOString(),
				...stale,
			}),
			desc({
				id: "pij-pm",
				orchestrationRole: "pm",
				lastEventAt: new Date(NOW - 5_000).toISOString(),
				...stale,
			}),
		]);
		expect(found.map((a) => a.nodeId).sort()).toEqual(["pij-pm", "pij-prime"]);
	});

	// ── primes owe a card (Jordan's ruling, 2026-07-31, REVERSING 2026-07-30) ──
	// government/rulings/2026-07-31-primes-owe-status-cards.md
	it("DOES flag a prime that has never reported — a prime owes a card", () => {
		// SPEC, not a pin. This test previously asserted the exact opposite and
		// was not wrong about the code — it was WRONG ABOUT THE WORLD, pinning the
		// 2026-07-30 position after the human overturned it. Its old rationale
		// ("a prime owes no card, so nothing renders and nobody can be
		// misinformed") is precisely the claim the reversal retired.
		//
		// A prime that has never written a card is now the clearest case for the
		// never-reported fallback rather than an exclusion from it: it owes one
		// and there is nothing there.
		const found = detect([
			desc({
				id: "pij-prime-silent",
				prime: true,
				lastEventAt: new Date(NOW - 5_000).toISOString(),
				startedAt: new Date(NOW - 12 * 24 * 3_600_000).toISOString(),
			}),
		]);
		expect(found.map((a) => a.nodeId)).toEqual(["pij-prime-silent"]);
		expect(found[0]?.detail).toContain("it has never reported");
	});

	it("still never flags a PA that has never reported — a PA owes nothing", () => {
		// The exclusion did not disappear, it MOVED. A PA assists a prime and does
		// not report, so ageing it from startedAt would accuse it of neglecting an
		// obligation it never had — which is what the retired prime rule was
		// protecting against, now applied where it is actually true.
		expect(
			detect([
				desc({
					id: "pij-aide-silent",
					orchestrationRole: "pa",
					lastEventAt: new Date(NOW - 5_000).toISOString(),
					startedAt: new Date(NOW - 12 * 24 * 3_600_000).toISOString(),
				}),
			]),
		).toEqual([]);
	});

	it("STILL flags a prime whose VOLUNTARY card has rotted", () => {
		// The asymmetry that makes the two predicates worth splitting: the consumer
		// cannot tell who owed the card, so a rotten one misinforms identically.
		// Writing it is the act that creates the expectation. Observed live on
		// 2026-07-30 — a prime wrote a real card and let it rot past threshold; a
		// blanket prime exclusion would have left that unpoliced.
		const found = detect([
			desc({
				id: "pij-prime-rotten",
				prime: true,
				lastEventAt: new Date(NOW - 5_000).toISOString(),
				statusAt: new Date(NOW - 90 * MIN).toISOString(),
			}),
		]);
		expect(found.map((a) => a.nodeId)).toEqual(["pij-prime-rotten"]);
		expect(found[0]?.detail).not.toContain("never reported");
	});

	it("still flags a PM that has never reported — a PM does owe one", () => {
		// The other side of the split: killing the fallback wholesale would have
		// taken A-2's case with it.
		const found = detect([
			desc({
				id: "pij-pm-silent",
				orchestrationRole: "pm",
				lastEventAt: new Date(NOW - 5_000).toISOString(),
				startedAt: new Date(NOW - 90 * MIN).toISOString(),
			}),
		]);
		expect(found.map((a) => a.nodeId)).toEqual(["pij-pm-silent"]);
		expect(found[0]?.detail).toContain("never reported");
	});
});

describe("status-stale re-alerts as it gets worse", () => {
	it("keys evidence on a drift bucket, not a constant", () => {
		// AnomalySweep latches on `kind:node:evidence`. With empty evidence the key
		// never changes, so a seat is alerted once and then never again however
		// stale it becomes — found by reading the sweep after writing this sensor.
		const at = (driftMin: number) =>
			detectAnomalies({
				descriptors: [
					desc({
						id: "pij-drift",
						orchestrationRole: "pm",
						lastEventAt: new Date(NOW - 5_000).toISOString(),
						statusAt: new Date(NOW - driftMin * 60_000).toISOString(),
					}),
				],
				assignments: [],
				events: [],
				nowMs: NOW,
			}).filter((a) => a.kind === "status-stale")[0];
		expect(at(35)?.evidence).not.toEqual(at(95)?.evidence);
	});
});

/** A subscription that EXISTS but cannot FIRE. `watchers:1` proves the wiring
 *  is present exactly as a green check proves a check RAN — neither proves
 *  delivery. A watcher on a paused seat receives silence and reads it as "no
 *  stalls", and the PA cannot self-check it: if its triggers are dead, no sweep
 *  runs to notice. So it is detected here, where dead triggers cannot silence
 *  it. Intent ruling (albatross, s079): the discriminator is an EXPLICIT
 *  DECLARATION, never the pause itself. */
describe("inert-subscription (the wiring is real, the trigger is dead)", () => {
	const seat = (id: string, over: Partial<SessionDescriptor> = {}) => desc({ id, ...over });
	const detectWd = (
		descriptors: readonly SessionDescriptor[],
		watchdog: NonNullable<Parameters<typeof detectAnomalies>[0]["watchdog"]>,
	) =>
		detectAnomalies({ descriptors, assignments: [], events: [], nowMs: NOW, watchdog }).filter(
			(a) => a.kind === "inert-subscription",
		);

	it("(b) EMITS for paused with NO declared state — unilateral removal from supervision", () => {
		const found = detectWd([seat("pij-quiet")], {
			globallyDisabled: false,
			nodes: [{ nodeId: "pij-quiet", watchers: ["pij-pa"], pausedBy: "self" }],
		});
		expect(found.map((a) => a.nodeId)).toEqual(["pij-quiet"]);
		expect(found[0]?.detail).toContain("pij-pa");
		// The interlock: it must not read as a status-stale contradiction.
		expect(found[0]?.detail).toContain("not card freshness");
	});

	it("(a) SILENT for paused WITH a declared parked state — the seat said why", () => {
		for (const state of ["waiting", "hold", "blocked", "question"] as const) {
			expect(
				detectWd([seat("pij-quiet", { semanticState: state })], {
					globallyDisabled: false,
					nodes: [{ nodeId: "pij-quiet", watchers: ["pij-pa"], pausedBy: "self" }],
				}),
				`declared '${state}' should stay silent`,
			).toEqual([]);
		}
	});

	it("(c) SILENT for a LIVE exemption, and emits once it lapses", () => {
		const node = { nodeId: "pij-quiet", watchers: ["pij-pa"], pausedBy: "self" };
		expect(
			detectWd([seat("pij-quiet")], {
				globallyDisabled: false,
				nodes: [{ ...node, exemptUntilMs: NOW + 60_000 }],
			}),
		).toEqual([]);
		expect(
			detectWd([seat("pij-quiet")], {
				globallyDisabled: false,
				nodes: [{ ...node, exemptUntilMs: NOW - 1 }],
			}),
		).toHaveLength(1);
	});

	it("(d) globallyDisabled raises ONE fleet row, never one per seat", () => {
		const found = detectWd([seat("pij-a"), seat("pij-b"), seat("pij-c")], {
			globallyDisabled: true,
			nodes: [
				{ nodeId: "pij-a", watchers: ["pij-pa"] },
				{ nodeId: "pij-b", watchers: ["pij-pa"] },
				{ nodeId: "pij-c", watchers: ["pij-pa"] },
			],
		});
		expect(found, "an alarm storm teaches everyone to ignore the instrument").toHaveLength(1);
		expect(found[0]?.detail).toContain("FLEET-WIDE");
	});

	it("says nothing about a seat nobody is watching — there is no promise to break", () => {
		expect(
			detectWd([seat("pij-quiet")], {
				globallyDisabled: false,
				nodes: [{ nodeId: "pij-quiet", watchers: [], pausedBy: "self" }],
			}),
		).toEqual([]);
	});

	it("is ABSENT entirely when no watchdog projection is supplied", () => {
		expect(
			detectAnomalies({
				descriptors: [seat("pij-quiet")],
				assignments: [],
				events: [],
				nowMs: NOW,
			}).filter((a) => a.kind === "inert-subscription"),
		).toEqual([]);
	});
});

/** #154 — the OTHER half of an inert subscription: the wiring is live and the
 *  TRIGGER is fine, but every RECIPIENT is gone, so the notices are delivered
 *  to nobody. Live instance: `pij-continuing-ermine` ran 42 hours with its sole
 *  watcher terminal since 2026-08-06T01:31:59Z and produced zero rows.
 *
 *  Three buckets, and `unknown` is NEVER counted as gone: an unresolvable id is
 *  not a death (watcher ids are never referentially validated at write time),
 *  and `probe-unavailable` means the observation itself failed. */
describe("inert-subscription — dead RECIPIENTS (#154)", () => {
	const seat = (id: string, over: Partial<SessionDescriptor> = {}) => desc({ id, ...over });

	const terminalRecord = (over: Partial<TerminalObservation> = {}): TerminalObservation => ({
		disposition: "unrequested-by-pij",
		observedAt: new Date(NOW - H44).toISOString(),
		evidence: "pid-missing",
		...over,
	});

	/** Stands in for `s095`'s `activityCredibility`, which lives in `state.ts` and
	 *  is INJECTED here rather than imported (T-0). It sees only the structural
	 *  input, never the id — so fixtures must differ in descriptor FIELDS. */
	const credibility = (input: ActivityCredibilityInput): ActivityCredibility => {
		if (input.terminal !== undefined) {
			return input.terminal.disposition === "unavailable"
				? {
						verdict: "unknown",
						cause: "probe-unavailable",
						reason: "the liveness observation itself was unavailable",
						asOf: input.terminal.observedAt,
					}
				: {
						verdict: "superseded",
						cause: "agent-absent",
						reason: "a terminal observation is on record",
						asOf: input.terminal.observedAt,
					};
		}
		if (input.lifecycle === "dissolved") {
			return { verdict: "superseded", cause: "dissolved", reason: "lifecycle is dissolved" };
		}
		return {
			verdict: "current",
			cause: "uncontradicted",
			reason: "nothing contradicts the recorded activity",
		};
	};

	const detectWd = (
		descriptors: readonly SessionDescriptor[],
		watchdog: WatchdogSubscriptionInputs,
		withCredibility = true,
	) =>
		detectAnomalies({
			descriptors,
			assignments: [],
			events: [],
			nowMs: NOW,
			watchdog,
			...(withCredibility ? { activityCredibility: credibility } : {}),
		}).filter((a) => a.kind === "inert-subscription");

	/** Both rows carry `kind: "inert-subscription"`, so filtering by kind cannot
	 *  tell them apart — an assertion over the SET is not evidence about the
	 *  MEMBER this phase adds. Discriminate on the new row's own content. */
	const deadRecipientRows = (rows: readonly { readonly detail: string }[]) =>
		rows.filter((a) => a.detail.includes("no LIVE watcher remains"));

	it("1 · BEHAVIOURAL — all watchers superseded FIRES the dead-recipient row", () => {
		const rows = detectWd(
			[
				seat("pij-continuing-ermine"),
				seat("pij-respectable-starfish", { terminal: terminalRecord() }),
			],
			{
				globallyDisabled: false,
				nodes: [
					{
						nodeId: "pij-continuing-ermine",
						watchers: ["pij-respectable-starfish"],
						pausedBy: "self",
					},
				],
			},
		);
		// NOT `rows.length === 1`: the paused-trigger row shares the kind and
		// would satisfy that assertion on PRE-FIX code (measured — it did).
		const dead = deadRecipientRows(rows);
		expect(dead).toHaveLength(1);
		expect(dead[0]?.nodeId).toBe("pij-continuing-ermine");
		// names the composition
		expect(dead[0]?.detail).toContain("1 watcher(s)");
		expect(dead[0]?.detail).toContain("1 carry a terminal or retirement observation");
		expect(dead[0]?.detail).toContain("0 unresolvable/unknown");
		// reports an OBSERVATION, never a death
		expect(dead[0]?.detail).not.toMatch(/\bis dead\b|\bare dead\b/);
		// remedy = re-subscribe a LIVE watcher, explicitly not resuming a pause
		expect(dead[0]?.detail).toContain("pij watchdog watch pij-continuing-ermine --for");
		expect(dead[0]?.detail).toContain("not resolved by resuming a pause");
	});

	it("2 · one CURRENT watcher among several superseded does NOT fire", () => {
		const rows = detectWd(
			[
				seat("pij-node"),
				seat("pij-gone-a", { terminal: terminalRecord() }),
				seat("pij-gone-b", { lifecycle: "dissolved" }),
				seat("pij-live"),
			],
			{
				globallyDisabled: false,
				nodes: [{ nodeId: "pij-node", watchers: ["pij-gone-a", "pij-gone-b", "pij-live"] }],
			},
		);
		expect(
			deadRecipientRows(rows),
			"partial degradation is a DELIBERATE scope decision, not an oversight",
		).toEqual([]);
	});

	it("3 · zero watchers does NOT fire — unwatched by choice is healthy", () => {
		const rows = detectWd([seat("pij-node")], {
			globallyDisabled: false,
			nodes: [{ nodeId: "pij-node", watchers: [] }],
		});
		expect(deadRecipientRows(rows)).toEqual([]);
	});

	it("4 · an UNRESOLVABLE watcher id is never counted as gone", () => {
		const rows = detectWd([seat("pij-node")], {
			globallyDisabled: false,
			nodes: [{ nodeId: "pij-node", watchers: ["pij-typo-or-cross-home"] }],
		});
		expect(
			deadRecipientRows(rows),
			"watcher ids are never referentially validated at write time — unknown is not death",
		).toEqual([]);
	});

	it("5 · verdict `unknown` (probe-unavailable) is never counted as gone", () => {
		const rows = detectWd(
			[
				seat("pij-node"),
				seat("pij-unprobed", {
					terminal: terminalRecord({
						disposition: "unavailable",
						evidence: "observation-unavailable",
					}),
				}),
			],
			{
				globallyDisabled: false,
				nodes: [{ nodeId: "pij-node", watchers: ["pij-unprobed"] }],
			},
		);
		expect(
			deadRecipientRows(rows),
			"the observation ITSELF failed — that is not evidence of anything",
		).toEqual([]);
	});

	it("6 · PRESERVED-PROPERTY — the paused-trigger row still fires exactly as before", () => {
		const nodes = [{ nodeId: "pij-quiet", watchers: ["pij-live-pa"], pausedBy: "self" }];
		const descriptors = [seat("pij-quiet"), seat("pij-live-pa")];
		const before = detectAnomalies({
			descriptors,
			assignments: [],
			events: [],
			nowMs: NOW,
			watchdog: { globallyDisabled: false, nodes },
		}).filter((a) => a.kind === "inert-subscription");
		const after = detectWd(descriptors, { globallyDisabled: false, nodes });
		expect(before).toHaveLength(1);
		// byte-identical for an input that already produced a row: the live
		// watcher means the new row is silent, so the set is unchanged.
		expect(after).toEqual(before);
		expect(after[0]?.detail).toContain("PAUSED by self");
	});

	it("7 · BEHAVIOURAL — a NON-PAUSED node with all-superseded watchers fires", () => {
		const rows = detectWd([seat("pij-node"), seat("pij-gone", { terminal: terminalRecord() })], {
			globallyDisabled: false,
			nodes: [{ nodeId: "pij-node", watchers: ["pij-gone"] }],
		});
		// A node with live wiring and dead recipients is NOT paused, so pre-fix
		// it falls straight through the `pausedBy === undefined` guard.
		expect(rows).toHaveLength(1);
		expect(deadRecipientRows(rows)).toHaveLength(1);
		expect(rows[0]?.nodeId).toBe("pij-node");
	});

	it("8 · with NO `activityCredibility` injected the row CANNOT fire", () => {
		const rows = detectWd(
			[seat("pij-node"), seat("pij-gone", { terminal: terminalRecord() })],
			{
				globallyDisabled: false,
				nodes: [{ nodeId: "pij-node", watchers: ["pij-gone"] }],
			},
			false,
		);
		expect(
			rows,
			"'wiring absent' and 'no row' must be the SAME observable — that is how an unwired production call site becomes detectable",
		).toEqual([]);
	});

	it("evidence is the CHANGING gone-count, never a constant (the sweep latches on it)", () => {
		const goneCount = (n: number) => {
			const watchers = Array.from({ length: n }, (_, i) => `pij-gone-${i}`);
			const rows = detectWd(
				[seat("pij-node"), ...watchers.map((id) => seat(id, { terminal: terminalRecord() }))],
				{ globallyDisabled: false, nodes: [{ nodeId: "pij-node", watchers }] },
			);
			return deadRecipientRows(rows)[0]?.evidence;
		};
		expect(goneCount(1)).not.toEqual(goneCount(3));
	});

	it("renders the credibility `reason`/`asOf` for the human, and never parses it", () => {
		const rows = detectWd([seat("pij-node"), seat("pij-gone", { terminal: terminalRecord() })], {
			globallyDisabled: false,
			nodes: [{ nodeId: "pij-node", watchers: ["pij-gone"] }],
		});
		const dead = deadRecipientRows(rows)[0];
		expect(dead?.detail).toContain("a terminal observation is on record");
	});

	/** ── F-1 · the RETIRED watcher, the one case the first cut could not see ──
	 *
	 *  `FsRegistry.list()` deliberately omits `lifecycle: "dissolved"` records
	 *  (`adapters/fs-registry.ts:148`) — correct, a dissolved seat is not live.
	 *  And `unknown` is never counted as gone — also correct, and mandated. But
	 *  COMPOSED they silence the clearest death available: a seat pij itself
	 *  dissolved never lands in `byNode`, buckets `unknown`, and suppresses the
	 *  row. That is this stream's own defect class, reproduced inside its fix.
	 *
	 *  So the detector must be able to tell "absent because RETIRED" from
	 *  "absent because it NEVER EXISTED" — two different facts that collapsed
	 *  into one bucket. Retirement arrives as an INPUT (purity holds), is fed
	 *  through the SAME credibility predicate (the detector never decides death
	 *  on its own), and an id nobody can resolve is STILL unknown. */
	const detectRetired = (
		descriptors: readonly SessionDescriptor[],
		watchdog: WatchdogSubscriptionInputs,
		resolveRetired?: (id: string) => RetiredWatcherRecord | undefined,
	) =>
		detectAnomalies({
			descriptors,
			assignments: [],
			events: [],
			nowMs: NOW,
			watchdog,
			activityCredibility: credibility,
			...(resolveRetired === undefined ? {} : { resolveRetired }),
		}).filter((a) => a.kind === "inert-subscription");

	/** ── THE ORIGINAL INCIDENT, RECONSTRUCTED — not the current fleet state ──
	 *
	 *  This fixture is the actual 42-hour `#154` case, field for field:
	 *  `pij-continuing-ermine` with the sole watcher `pij-respectable-starfish`,
	 *  `lifecycle: "dissolved"`, terminal `requested` / `pane-missing` observed
	 *  at 2026-08-06T01:31:59.006Z. It is deliberately NOT the shape ermine has
	 *  today.
	 *
	 *  The reason is general and worth stating plainly: THE CURRENT FLEET STATE
	 *  IS WHERE THE FIX WAS DEVELOPED, so it is the one configuration guaranteed
	 *  to agree with it. Testing against it proves the fix agrees with itself.
	 *  Measured here: ermine's watcher TODAY is terminal-but-NOT-dissolved, so
	 *  it survives `list()`, lands in `byNode`, and the first cut fired on it
	 *  correctly — while the seat from the incident, dissolved and therefore
	 *  omitted from `list()`, produced nothing at all. The passing case and the
	 *  motivating case differed by ONE LIFECYCLE VALUE, and that single value
	 *  was the whole defect. A regression test that reconstructs the incident
	 *  catches that; one that mirrors current state cannot, by construction.
	 *
	 *  `descriptors` omits starfish ON PURPOSE — that is exactly what
	 *  `FsRegistry.list()` does with a dissolved record, and it is the only
	 *  faithful way to reproduce the case. */
	const STARFISH_RECORD: RetiredWatcherRecord = {
		lifecycle: "dissolved",
		terminal: {
			disposition: "requested",
			observedAt: "2026-08-06T01:31:59.006Z",
			evidence: "pane-missing",
		},
	};

	const ERMINE = {
		descriptors: [seat("pij-continuing-ermine")],
		watchdog: {
			globallyDisabled: false,
			nodes: [{ nodeId: "pij-continuing-ermine", watchers: ["pij-respectable-starfish"] }],
		},
	} as const;

	const archive = (records: Readonly<Record<string, RetiredWatcherRecord>>) => {
		const asked: string[] = [];
		const lookup = (id: string): RetiredWatcherRecord | undefined => {
			asked.push(id);
			return records[id];
		};
		return { asked, lookup };
	};

	it("F-1 · BEHAVIOURAL — REGRESSION for the original 42h incident: ermine + DISSOLVED starfish fires", () => {
		const { lookup } = archive({ "pij-respectable-starfish": STARFISH_RECORD });
		const dead = deadRecipientRows(detectRetired(ERMINE.descriptors, ERMINE.watchdog, lookup));
		expect(
			dead,
			"a seat pij deliberately dissolved is the most clearly-dead watcher there is, and was the one case the detector could not see",
		).toHaveLength(1);
		expect(dead[0]?.nodeId).toBe("pij-continuing-ermine");
		expect(dead[0]?.detail).toContain("pij-respectable-starfish");
		expect(dead[0]?.detail).toContain("1 carry a terminal or retirement observation");
		expect(dead[0]?.detail).toContain("0 unresolvable/unknown");
		// the incident's own evidence timestamp is rendered for the human
		expect(dead[0]?.detail).toContain("2026-08-06T01:31:59.006Z");
		// still an OBSERVATION, never a death sentence
		expect(dead[0]?.detail).not.toMatch(/\bis dead\b|\bare dead\b/);
	});

	it("F-1 · the incident shape and the CURRENT-STATE shape differ by ONE lifecycle value", () => {
		// Ermine's watcher TODAY is terminal but NOT dissolved, so `list()` keeps
		// it, `byNode` resolves it, and the row fires with no archive lookup at
		// all — which is why developing against current state could not surface
		// the defect. Same node, same watcher id, same terminal record; the only
		// difference is `lifecycle`, and it decided whether the seat was VISIBLE.
		const { lifecycle: _dissolved, ...notDissolved } = STARFISH_RECORD;
		const currentShape = deadRecipientRows(
			detectRetired(
				[...ERMINE.descriptors, seat("pij-respectable-starfish", notDissolved)],
				ERMINE.watchdog,
			),
		);
		expect(
			currentShape,
			"the shape that already worked — and therefore proved nothing",
		).toHaveLength(1);

		const incidentShape = deadRecipientRows(detectRetired(ERMINE.descriptors, ERMINE.watchdog));
		expect(
			incidentShape,
			"and the shape that mattered, still invisible without the retirement input",
		).toEqual([]);
	});

	it("F-1 · PRESERVED-PROPERTY — with NO retirement input, behaviour is byte-for-byte today's", () => {
		const withOut = detectRetired(ERMINE.descriptors, ERMINE.watchdog);
		expect(
			deadRecipientRows(withOut),
			"absent input must change nothing — the dissolved watcher buckets `unknown`, as before",
		).toEqual([]);
		expect(withOut).toEqual(
			detectAnomalies({
				descriptors: ERMINE.descriptors,
				assignments: [],
				events: [],
				nowMs: NOW,
				watchdog: ERMINE.watchdog,
				activityCredibility: credibility,
			}).filter((a) => a.kind === "inert-subscription"),
		);
	});

	it("F-1 · an id NO tier can resolve is STILL unknown, never a death", () => {
		const { lookup } = archive({});
		expect(
			deadRecipientRows(
				detectRetired(
					[seat("pij-node")],
					{
						globallyDisabled: false,
						nodes: [{ nodeId: "pij-node", watchers: ["pij-typo-or-cross-home"] }],
					},
					lookup,
				),
			),
			"a typo must never be reported as a fatality — the retirement lookup widens WHO can be resolved, never WHAT counts as gone",
		).toEqual([]);
	});

	it("F-1 · a retired lookup NEVER overrides a watcher the live tier already resolved", () => {
		const { asked, lookup } = archive({
			// a stale archive copy that would wrongly kill a live watcher if the
			// lookup were consulted (or preferred) for an id already in `byNode`
			"pij-live": { lifecycle: "dissolved" },
		});
		const rows = detectRetired(
			[seat("pij-node"), seat("pij-live")],
			{ globallyDisabled: false, nodes: [{ nodeId: "pij-node", watchers: ["pij-live"] }] },
			lookup,
		);
		expect(deadRecipientRows(rows)).toEqual([]);
		expect(
			asked,
			"the live tier is authoritative — the archive is a FALLBACK, not a merge",
		).toEqual([]);
	});

	it("F-1 · the lookup is asked ONLY for the ids held, never enumerated", () => {
		const { asked, lookup } = archive({
			"pij-respectable-starfish": { lifecycle: "dissolved" },
		});
		detectRetired(
			[seat("pij-continuing-ermine"), seat("pij-live")],
			{
				globallyDisabled: false,
				nodes: [
					{ nodeId: "pij-continuing-ermine", watchers: ["pij-respectable-starfish", "pij-live"] },
				],
			},
			lookup,
		);
		expect(
			asked,
			"keyed O(1) lookup of ids we already hold — the archive is never listed or globbed",
		).toEqual(["pij-respectable-starfish"]);
	});

	it("F-1 · a DISSOLVED record with no terminal observation still fires, via the predicate", () => {
		const { lookup } = archive({ "pij-respectable-starfish": { lifecycle: "dissolved" } });
		const dead = deadRecipientRows(detectRetired(ERMINE.descriptors, ERMINE.watchdog, lookup));
		expect(dead).toHaveLength(1);
		// the verdict came from the injected predicate reading `lifecycle`, NOT
		// from set membership — this module still never decides death itself.
		expect(dead[0]?.detail).toContain("lifecycle is dissolved");
	});
});

/** ── F-2 · `compact` pauses are SYSTEM-initiated and self-clearing ──
 *
 *  Latent until Phase 0 turned the paused-trigger row on in the daemon for the
 *  first time. `applyCompactPause` is set by pij itself around a compaction
 *  (`core/watchdog.ts:124-130`) and cleared automatically on the next working
 *  transition (`:114-116`), so it is neither unilateral nor durable — but the
 *  600ms sweep can observe that transient window, call it a withdrawal from
 *  supervision, and prescribe a manual `pij watchdog resume` for a pause that
 *  was already going to lift itself. A row whose remedy is "wait" is a row that
 *  teaches people to ignore the instrument. */
describe("inert-subscription — a `compact` pause is not a withdrawal from supervision (F-2)", () => {
	const wd = (pausedBy: string) =>
		detectAnomalies({
			descriptors: [desc({ id: "pij-node" }), desc({ id: "pij-watcher" })],
			assignments: [],
			events: [],
			nowMs: NOW,
			watchdog: {
				globallyDisabled: false,
				nodes: [{ nodeId: "pij-node", watchers: ["pij-watcher"], pausedBy }],
			},
		}).filter((a) => a.kind === "inert-subscription");

	it('F-2 · BEHAVIOURAL — `pausedBy: "compact"` does NOT emit', () => {
		expect(
			wd("compact"),
			"system-initiated and auto-cleared: the operator has nothing to do, so there is nothing to say",
		).toEqual([]);
	});

	it('F-2 · PRESERVED-PROPERTY — `pausedBy: "self"` still emits', () => {
		const rows = wd("self");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.detail).toContain("PAUSED by self");
	});

	it("F-2 · PRESERVED-PROPERTY — an operator pause by any other hand still emits", () => {
		expect(wd("pij-orchestrator")).toHaveLength(1);
	});
});

/** A GENERAL assignment never completes — it is the seat's standing existence,
 *  not a unit of work. So `task close` must never be offered against one: all
 *  three causes the original text enumerated presuppose a record that CAN
 *  complete, and offering a terminal action for a record with no terminal case
 *  is a category error in the TEXT rather than a bug in the guard.
 *
 *  Measured cost of the old text: a compliant seat closing its general burns a
 *  deterministic id that cannot be recycled, and cannot declare a semantic
 *  state until it has some other open assignment. */
describe("axisRemedy never offers a terminal action against a general assignment", () => {
	const NODE = "pij-seat";
	const GENERAL = `asg-general-${NODE}`;

	it("does NOT offer task close for the general, and says why", () => {
		const r = axisRemedy(NODE, GENERAL);
		expect(r).not.toContain("task close");
		expect(r).toContain("never completes");
		expect(r).toContain("not recyclable");
	});

	it("offers only remedies that are true of a general — report now, or declare a state", () => {
		const r = axisRemedy(NODE, GENERAL);
		expect(r).toContain("pij report now");
		expect(r).toContain("pij report state waiting|hold|blocked|question");
		// The alarm case survives: a remediation that never admits the row may be
		// right teaches seats that every row has a way to make it go away.
		expect(r).toContain("this row is the alarm");
	});

	it("STILL offers task close for an ordinary dispatch — the fix is scoped, not a retreat", () => {
		const r = axisRemedy(NODE, "asg-dispatch-1");
		expect(r).toContain("pij task close asg-dispatch-1 --reason done");
		expect(r).toContain("only the assignee may attest done");
	});

	it("keys on the DERIVED general id, not on the `asg-general-` PREFIX", () => {
		// `general` is a LIVE ADJECTIVE (name-corpus.ts) and named assignments mint
		// as `asg-<adjective>-<animal>` (platform/assignment.ts), so
		// `asg-general-eel` is a perfectly ordinary MINTABLE DISPATCH that must
		// keep its terminal remedy.
		//
		// What separates the families is that a general always embeds the full
		// `pij-` id — `asg-general-pij-<adj>-<animal>` — and an animal token can
		// never be one, so the two cannot collide.
		//
		// THIS IS THE TEST THAT MATTERS: it fails the moment someone "hardens" the
		// guard to `startsWith("asg-general-")`, which is the obvious next edit and
		// reads as strictly safer, and which would silently make every
		// `asg-general-<animal>` dispatch un-closeable.
		expect(axisRemedy(NODE, "asg-general-eel")).toContain("task close");
	});
});
