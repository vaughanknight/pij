// pij-control-plane — the stale-card nudge carried by every pij command.

import { describe, expect, it } from "vitest";
import { STATUS_NUDGE_AFTER_MS, statusNudgeLine } from "./status-nudge.js";
import type { SessionDescriptor } from "./types.js";

const NOW = Date.parse("2026-07-30T02:00:00.000Z");
const MIN = 60_000;

function seat(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-seat",
		folder: "/repo",
		dataDir: "/home/.pij/pij-seat",
		eventsPath: "/home/.pij/pij-seat/events.ndjson",
		pid: 100,
		startedAt: new Date(NOW - 4 * 60 * MIN).toISOString(),
		orchestrationRole: "pm",
		statusAt: new Date(NOW - 30 * MIN).toISOString(),
		...over,
	};
}

const nudge = (over: Partial<SessionDescriptor> = {}, verb = "list") =>
	statusNudgeLine({ descriptor: seat(over), verb, nowMs: NOW });

describe("statusNudgeLine", () => {
	it("names the age and the exact fix, in one line", () => {
		const line = nudge();
		expect(line).toBe('⚠ pij: your now/next card is 30m old — pij report now "<did>" "<next>"');
		// It rides on EVERY command, so its cost is paid over and over.
		expect(line?.split("\n")).toHaveLength(1);
	});

	it("stays quiet while the card is fresh", () => {
		expect(nudge({ statusAt: new Date(NOW - 2 * MIN).toISOString() })).toBeUndefined();
	});

	it("says so when the seat has never reported, ageing from its own start", () => {
		const line = statusNudgeLine({
			descriptor: { ...seat(), statusAt: undefined },
			verb: "list",
			nowMs: NOW,
		});
		expect(line).toContain("never reported");
		expect(line).toContain("240m old");
	});

	it("never fires on report itself, nor on machine-read surfaces", () => {
		// Nagging somebody for not reporting WHILE they report is absurd; the
		// others are parsed or eval'd, where a stray stderr line is a hazard.
		for (const verb of ["report now", "report state", "inbox", "whoami", "spine events"]) {
			expect(nudge({}, verb)).toBeUndefined();
		}
		expect(nudge({}, "list")).toBeDefined();
	});

	it("never fires for a seat whose card renders nowhere", () => {
		// A worker's now/next surfaces in no card; reminding it is pure noise, and
		// a noisy reminder is one nobody reads.
		expect(nudge({ orchestrationRole: undefined })).toBeUndefined();
		expect(nudge({ orchestrationRole: undefined, prime: true })).toBeDefined();
	});

	it("never fires for a seat that PARKED itself", () => {
		// waiting/hold/blocked/question are deliberate declarations — nudging them
		// punishes exactly the behaviour the rail wants.
		for (const state of ["waiting", "hold", "blocked", "question"] as const) {
			expect(nudge({ semanticState: state })).toBeUndefined();
		}
	});

	it("stays silent rather than guessing when there is no seat or no clock", () => {
		expect(statusNudgeLine({ descriptor: undefined, verb: "list", nowMs: NOW })).toBeUndefined();
		expect(nudge({ statusAt: "not-a-date", startedAt: "also-not" })).toBeUndefined();
		// Clock skew putting the stamp in the future is not staleness.
		expect(nudge({ statusAt: new Date(NOW + 5 * MIN).toISOString() })).toBeUndefined();
	});

	it("fires exactly at the threshold boundary, not before", () => {
		const at = (ms: number) =>
			statusNudgeLine({
				descriptor: seat({ statusAt: new Date(NOW - ms).toISOString() }),
				verb: "list",
				nowMs: NOW,
			});
		expect(at(STATUS_NUDGE_AFTER_MS)).toBeUndefined();
		expect(at(STATUS_NUDGE_AFTER_MS + 1)).toBeDefined();
	});
});
