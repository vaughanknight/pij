// pij — is this seat actually IN THE SCHEDULER? (s101, for the watchdog
// observability gap found across three governments on 2026-08-09.)
//
// WRITTEN BEFORE THE MODULE, ON PURPOSE. o-prime's instruction, and it is the
// right one: the single defect nobody would catch by reading this commit is the
// sensor shipping with the very failure it exists to end.
//
// THE CLASS. Every defect this fleet filed today was TWO FACTS SHARING ONE
// ANSWER:
//   · `watchers: 1` for a subscription whose watcher is a corpse
//   · `lastFireAt: None` for a seat that is missing from the scheduler entirely
//   · a green check for a check that never ran
//   · `running` for a daemon executing code four commits stale
//
// So the assertion that earns this commit is not "does it report the schedule".
// It is: **"I cannot see the scheduler" and "the seat is not in the scheduler"
// MUST NOT RENDER THE SAME.** The first is the instrument's limit; the second is
// a fact about the world. A sensor that collapses them would have told the
// meadowlark investigation `not-scheduled` with total confidence while the daemon
// had simply not written a projection yet — manufacturing the certainty that the
// 28-minute experiment was run to obtain.

import { describe, expect, it } from "vitest";
import {
	PROJECTION_STALE_AFTER_MS,
	parseSchedulerProjection,
	readSchedulerVerdict,
	renderSchedulerVerdict,
} from "./watchdog-scheduler-projection.js";

const NOW = Date.parse("2026-08-09T06:00:00.000Z");
const FRESH = new Date(NOW - 1_000).toISOString();
const STALE = new Date(NOW - PROJECTION_STALE_AFTER_MS - 1_000).toISOString();
const DUE = new Date(NOW + 5 * 60_000).toISOString();

const projection = (over: Record<string, unknown> = {}) => ({
	v: 1,
	reconciledAt: FRESH,
	sessions: { "pij-scheduled": { nextDueAt: DUE } },
	...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ASSERTION THIS COMMIT EXISTS FOR.
describe("UNKNOWN and NOT-SCHEDULED must never render the same", () => {
	it("distinguishes an ABSENT projection from a seat that is absent FROM it", () => {
		const noFile = readSchedulerVerdict(undefined, "pij-anything", NOW);
		const notInIt = readSchedulerVerdict(parseSchedulerProjection(projection()), "pij-ghost", NOW);

		expect(noFile.kind).toBe("unknown");
		expect(notInIt.kind).toBe("not-scheduled");
		// The rendered strings a human reads must differ too — a distinction that
		// exists only in the type is a distinction the operator never sees.
		expect(renderSchedulerVerdict(noFile)).not.toBe(renderSchedulerVerdict(notInIt));
	});

	it("says UNKNOWN, not not-scheduled, when the projection is STALE", () => {
		// A daemon that stopped reconciling leaves a file whose contents are a
		// snapshot of a world that has moved on. Trusting it would report every seat
		// that has since been scheduled as absent.
		const v = readSchedulerVerdict(
			parseSchedulerProjection(projection({ reconciledAt: STALE })),
			"pij-ghost",
			NOW,
		);
		expect(v.kind).toBe("unknown");
	});

	it("says UNKNOWN for a CORRUPT projection rather than an empty one", () => {
		// An unparseable file is the instrument failing. Degrading it to "no sessions
		// are scheduled" would report the whole fleet as unscheduled at once.
		expect(parseSchedulerProjection("{ not json")).toBeUndefined();
		expect(readSchedulerVerdict(undefined, "pij-scheduled", NOW).kind).toBe("unknown");
	});

	it("says UNKNOWN for a projection of an unrecognised VERSION", () => {
		expect(parseSchedulerProjection(projection({ v: 99 }))).toBeUndefined();
	});

	it("every UNKNOWN carries a reason, so the operator knows which limit they hit", () => {
		const noFile = readSchedulerVerdict(undefined, "x", NOW);
		const stale = readSchedulerVerdict(
			parseSchedulerProjection(projection({ reconciledAt: STALE })),
			"x",
			NOW,
		);
		expect(noFile.kind === "unknown" && noFile.reason.length > 0).toBe(true);
		expect(stale.kind === "unknown" && stale.reason.length > 0).toBe(true);
		// …and the two reasons differ: "never written" and "gone stale" are different
		// problems with different fixes.
		expect(renderSchedulerVerdict(noFile)).not.toBe(renderSchedulerVerdict(stale));
	});
});

describe("the positive case", () => {
	it("reports a scheduled seat and its next due time", () => {
		const v = readSchedulerVerdict(parseSchedulerProjection(projection()), "pij-scheduled", NOW);
		expect(v.kind).toBe("scheduled");
		expect(v.kind === "scheduled" && v.nextDueAt).toBe(DUE);
		expect(renderSchedulerVerdict(v)).toContain("scheduled");
	});

	it("reports a scheduled seat with NO due time as scheduled, not unknown", () => {
		// Presence in the map is the load-bearing fact; the due time is a bonus. A
		// seat tracked but not yet anchored is IN the scheduler.
		const v = readSchedulerVerdict(
			parseSchedulerProjection(projection({ sessions: { "pij-a": {} } })),
			"pij-a",
			NOW,
		);
		expect(v.kind).toBe("scheduled");
	});
});

describe("the projection file must not be mistaken for a session descriptor", () => {
	// `FsRegistry.readFile` admits any JSON file in pijHome whose `id` is a string,
	// and this file lives beside the descriptors. The tick-heartbeat file learned
	// this the hard way (plan 100); the wrapper is what keeps it structurally
	// invisible to `list()`.
	it("has NO top-level id", () => {
		expect(Object.keys(projection())).not.toContain("id");
	});
});
