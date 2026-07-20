import { describe, expect, it } from "vitest";
import { createSpawnExpectation } from "../spawn-expectation.js";
import type { SessionDescriptor } from "../types.js";
import { reconcileDeaths } from "./death-reconciler.js";

const descriptor = (over: Partial<SessionDescriptor> = {}): SessionDescriptor => ({
	id: "pij-child",
	folder: "/repo",
	dataDir: "/tmp/pij-child",
	eventsPath: "/tmp/pij-child/events.ndjson",
	pid: 44,
	startedAt: "2026-07-20T00:00:00.000Z",
	harness: "copilot",
	lifecycle: "bound",
	spawnedBy: "pij-parent",
	...over,
});

describe("death reconciler", () => {
	it("classifies a missing registered process as unrequested-by-pij and emits one live notice", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor()],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
		});
		expect(result.descriptorUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "pid-missing",
		});
		expect(result.notices).toEqual([
			expect.objectContaining({ to: "pij-parent", historical: false }),
		]);
	});

	it("does not treat a live provider-stuck PID as terminal", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor({ failureReason: "quota" })],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
		});
		expect(result.descriptorUpdates).toEqual([]);
		expect(result.notices).toEqual([]);
	});

	it("reconciles a vanished pre-register expectation once and labels later recreation historical", () => {
		const expectation = createSpawnExpectation({
			spawnId: "s-no-show",
			creatorId: "pij-parent",
			requestedHarness: "pi",
			requestedAt: "2026-07-20T00:00:00.000Z",
			paneId: "%9",
		});
		const first = reconcileDeaths({
			descriptors: [],
			expectations: [expectation],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
			paneExists: () => false,
		});
		expect(first.expectationUpdates[0]?.terminal?.disposition).toBe("unrequested-by-pij");
		expect(first.notices[0]).toMatchObject({ historical: false });
		const restarted = reconcileDeaths({
			descriptors: [],
			expectations: first.expectationUpdates,
			nowIso: "2026-07-20T00:00:03.000Z",
			isAlive: () => false,
			paneExists: () => false,
		});
		expect(restarted.notices).toEqual([]);
	});

	it("records a requested terminal observation and says boot reconciliation when requested", () => {
		const result = reconcileDeaths({
			descriptors: [
				descriptor({
					closeIntent: {
						actor: "pij-parent",
						kind: "in-process-close",
						requestedAt: "2026-07-20T00:00:01.000Z",
					},
				}),
			],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
			historical: true,
		});
		expect(result.descriptorUpdates[0]?.terminal?.disposition).toBe("requested");
		expect(result.notices[0]).toMatchObject({ historical: true });
		expect(result.notices[0]?.text).toContain("historical boot reconciliation");
	});

	it("persists unavailable rather than guessing absence when a probe throws", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor()],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => {
				throw new Error("permission denied");
			},
		});
		expect(result.descriptorUpdates[0]?.terminal).toMatchObject({
			disposition: "unavailable",
			evidence: "observation-unavailable",
			unavailableReason: "permission denied",
		});
	});

	it("expires an unregistered expectation by parsed epoch without inventing pane evidence", () => {
		const result = reconcileDeaths({
			descriptors: [],
			expectations: [
				{
					spawnId: "s-expired",
					creatorId: "pij-parent",
					requestedHarness: "claude",
					requestedAt: "2026-07-20T00:00:00.000Z",
					// Same instant as 00:00Z; lexical comparison incorrectly treats this as later.
					deadlineAt: "2026-07-20T01:00:00.000+01:00",
				},
			],
			nowIso: "2026-07-20T00:00:01.000Z",
			isAlive: () => true,
		});
		expect(result.expectationUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "expectation-expired",
		});
		expect(result.expectationUpdates[0]?.runtimeHarness).toBeUndefined();
	});

	it.each([
		["requestedAt", { requestedAt: "not-a-time", deadlineAt: "2026-07-20T00:00:01.000Z" }],
		["deadlineAt", { requestedAt: "2026-07-20T00:00:00.000Z", deadlineAt: "not-a-time" }],
	] as const)("terminalizes malformed persisted %s as unavailable", (field, times) => {
		const result = reconcileDeaths({
			descriptors: [],
			expectations: [
				{
					spawnId: `s-malformed-${field}`,
					creatorId: "pij-parent",
					requestedHarness: "pi",
					...times,
				},
			],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
		});
		expect(result.expectationUpdates[0]?.terminal).toMatchObject({
			disposition: "unavailable",
			evidence: "observation-unavailable",
			unavailableReason: expect.stringContaining(field),
		});
	});

	it("keeps pane disappearance distinct from deadline expiry", () => {
		const result = reconcileDeaths({
			descriptors: [],
			expectations: [
				createSpawnExpectation({
					spawnId: "s-pane-vanished",
					creatorId: "pij-parent",
					requestedHarness: "pi",
					requestedAt: "2026-07-20T00:00:00.000Z",
					paneId: "%9",
				}),
			],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
			paneExists: () => false,
		});
		expect(result.expectationUpdates[0]?.terminal?.evidence).toBe("pane-missing");
	});

	it("contains a failure-reason capture throw after PID absence without erasing absence", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor()],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
			failureReasonFor: () => {
				throw new Error("capture-pane unavailable");
			},
		});
		expect(result.descriptorUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "pid-missing",
		});
		expect(result.descriptorUpdates[0]?.failureReason).toBeUndefined();
	});

	it("suppresses an expectation no-show when any descriptor shares its spawn id", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor({ spawnId: "s-bound", pid: 44 })],
			expectations: [
				createSpawnExpectation({
					spawnId: "s-bound",
					creatorId: "pij-parent",
					requestedHarness: "copilot",
					requestedAt: "2026-07-20T00:00:00.000Z",
					paneId: "%9",
				}),
			],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
			paneExists: () => false,
		});
		expect(result.expectationUpdates).toEqual([]);
		expect(result.notices).toEqual([]);
	});
});
