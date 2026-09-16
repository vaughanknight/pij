import { describe, expect, it } from "vitest";
import {
	BIND_LIMBO_AFTER_MS,
	bindHealthDetail,
	classifyBindHealth,
	isBindDegraded,
} from "./bind-health.js";
import type { SessionDescriptor } from "./types.js";

const NOW = Date.parse("2026-07-25T12:00:00.000Z");

function descriptor(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-impressed-antlion",
		folder: "/repo",
		dataDir: "/home/.pij/pij-impressed-antlion",
		eventsPath: "/home/.pij/pij-impressed-antlion/events.ndjson",
		pid: 40082,
		startedAt: new Date(NOW - 30_000).toISOString(),
		...over,
	};
}

describe("classifyBindHealth", () => {
	it("calls a freshly spawned pending seat pre-bind — a normal spawn is never flagged", () => {
		expect(classifyBindHealth(descriptor({ lifecycle: "pending" }), NOW)).toBe("pre-bind");
		expect(classifyBindHealth(descriptor({ lifecycle: "ready" }), NOW)).toBe("pre-bind");
	});

	// The 2026-07-25 wedge: pending for ~16 minutes, reported as healthy.
	it("calls a long-pending seat bind-limbo", () => {
		const wedged = descriptor({
			lifecycle: "pending",
			startedAt: new Date(NOW - 16 * 60_000).toISOString(),
		});
		expect(classifyBindHealth(wedged, NOW)).toBe("bind-limbo");
		expect(isBindDegraded(classifyBindHealth(wedged, NOW))).toBe(true);
	});

	it("holds pre-bind right up to the threshold and flips just past it", () => {
		const at = descriptor({
			lifecycle: "pending",
			startedAt: new Date(NOW - BIND_LIMBO_AFTER_MS).toISOString(),
		});
		expect(classifyBindHealth(at, NOW)).toBe("pre-bind");
		const past = descriptor({
			lifecycle: "pending",
			startedAt: new Date(NOW - BIND_LIMBO_AFTER_MS - 1).toISOString(),
		});
		expect(classifyBindHealth(past, NOW)).toBe("bind-limbo");
	});

	it("calls a failed seat bind-failed regardless of age", () => {
		expect(classifyBindHealth(descriptor({ lifecycle: "failed" }), NOW)).toBe("bind-failed");
		expect(isBindDegraded("bind-failed")).toBe(true);
	});

	// CONTROL: a bound seat with the SAME ancient startedAt is never degraded, so
	// the classifier keys on the bind axis and not merely on age.
	it("control — a BOUND seat of identical age is ok", () => {
		const bound = descriptor({
			lifecycle: "bound",
			startedAt: new Date(NOW - 16 * 60_000).toISOString(),
		});
		expect(classifyBindHealth(bound, NOW)).toBe("ok");
		expect(isBindDegraded(classifyBindHealth(bound, NOW))).toBe(false);
	});

	it("treats a legacy descriptor with no lifecycle as ok, not as a wedge", () => {
		expect(classifyBindHealth(descriptor({ lifecycle: undefined }), NOW)).toBe("ok");
	});

	it("reads an unparseable startedAt as still-binding rather than inventing a wedge", () => {
		expect(classifyBindHealth(descriptor({ lifecycle: "pending", startedAt: "??" }), NOW)).toBe(
			"pre-bind",
		);
	});
});

describe("bindHealthDetail", () => {
	it("names the age and lifecycle for a limbo seat", () => {
		const wedged = descriptor({
			lifecycle: "pending",
			startedAt: new Date(NOW - 16 * 60_000).toISOString(),
		});
		const detail = bindHealthDetail(wedged, "bind-limbo", NOW);
		expect(detail).toContain("never bound");
		expect(detail).toContain("16min ago");
		expect(detail).toContain("pending");
	});

	it("names the failure reason when the daemon recorded one", () => {
		const failed = descriptor({ lifecycle: "failed", failureReason: "bind-timeout" });
		expect(bindHealthDetail(failed, "bind-failed", NOW)).toContain("bind-timeout");
	});

	it("returns null when there is nothing wrong — never a hedged warning", () => {
		expect(bindHealthDetail(descriptor({ lifecycle: "bound" }), "ok", NOW)).toBeNull();
		expect(bindHealthDetail(descriptor({ lifecycle: "pending" }), "pre-bind", NOW)).toBeNull();
	});
});
