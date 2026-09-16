// s095 — the snapshot path THROUGH the reconciler.
//
// DECLARED NEW-API EXCEPTION. Everything in this file needs symbols that do not
// exist on the pre-fix tree (`processSnapshot`, `fakeProcessSnapshot`,
// `DaemonTmux.processSnapshot`), so it fails to COMPILE there rather than
// failing an assertion. That is not evidence of anything, which is exactly why
// it lives in its own file: the behavioural block in `death-reconciler.test.ts`
// is written against the pre-095 `isAlive` input so it CAN be run, and observed
// failing, against the unfixed tree.
//
// What is tested here is the thing a unit test of a pure function structurally
// cannot see: that the transition table consults the SNAPSHOT and not the legacy
// pid probe. Every case below passes an `isAlive` that answers the OPPOSITE of
// the truth, so a reconciler that quietly kept using it fails loudly rather than
// agreeing by luck.

import { describe, expect, it } from "vitest";
import { DaemonTmux } from "../../adapters/daemon-tmux.js";
import { fakeProcessSnapshot, fakeProcessSnapshotUnavailable } from "../../adapters/fakes.js";
import type { SessionDescriptor } from "../types.js";
import { reconcileDeaths } from "./death-reconciler.js";

const SEAT_ID = "9f3a1c2e-0000-4000-8000-000000000001";

const seat = (over: Partial<SessionDescriptor> = {}): SessionDescriptor => ({
	id: "pij-mental-dajeil",
	folder: "/repo",
	dataDir: "/tmp/pij-mental-dajeil",
	eventsPath: "/tmp/pij-mental-dajeil/events.ndjson",
	pid: 39585,
	startedAt: "2026-08-07T00:00:00.000Z",
	harness: "claude",
	harnessSessionId: SEAT_ID,
	lifecycle: "bound",
	spawnedBy: "pij-parent",
	...over,
});

const latched = (over: Partial<SessionDescriptor> = {}): SessionDescriptor =>
	seat({
		terminal: {
			disposition: "unrequested-by-pij",
			observedAt: "2026-08-07T23:14:05.850Z",
			evidence: "pid-missing",
		},
		deathNoticeLatchedAt: "2026-08-07T23:14:05.850Z",
		...over,
	});

describe("s095 — the reconciler classifies from the process snapshot", () => {
	it("clears a latched terminal from an agent found ONE LEVEL BELOW the registry pid", () => {
		const result = reconcileDeaths({
			descriptors: [latched()],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			// The blind probe says DEAD. The snapshot says otherwise, and wins.
			isAlive: () => false,
			processSnapshot: fakeProcessSnapshot([
				{ pid: 39585, command: "-zsh" },
				{
					pid: 39670,
					ppid: 39585,
					command: `claude --dangerously-skip-permissions --resume ${SEAT_ID}`,
				},
			]),
		});
		expect(result.descriptorUpdates[0]?.terminal).toBeUndefined();
	});

	it("stamps a recycled pid that the blind probe reports as alive forever", () => {
		// `pij-weak-gurgeh`: pid 952, recycled at the reboot to a system daemon.
		// `isAlive(952)` is `true` and always will be — the false-ALIVE direction.
		const result = reconcileDeaths({
			descriptors: [seat({ id: "pij-weak-gurgeh", pid: 952 })],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => true,
			processSnapshot: fakeProcessSnapshot([
				{ pid: 952, command: "/Library/Intune/Microsoft Intune Agent.app/…/IntuneMdmDaemon" },
			]),
		});
		expect(result.descriptorUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "pid-missing",
		});
	});

	it("mutates nothing when the capture failed, whatever the blind probe says", () => {
		const result = reconcileDeaths({
			descriptors: [seat()],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => false,
			processSnapshot: fakeProcessSnapshotUnavailable("ps: exit 1"),
		});
		expect(result.descriptorUpdates).toEqual([]);
	});

	it("still skips a dissolved descriptor without probing it", () => {
		const result = reconcileDeaths({
			descriptors: [seat({ lifecycle: "dissolved" })],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => false,
			processSnapshot: fakeProcessSnapshot([]),
		});
		expect(result.descriptorUpdates).toEqual([]);
	});

	// The other end of AC-18's wire. `processSnapshot` is OPTIONAL on
	// `DaemonPorts` — which is what keeps every fake and every structural
	// implementer compiling, and is also exactly how this feature could sit green
	// and inert: if the REAL adapter never implements it, `?.()` is `undefined`
	// on every tick, the sweep silently falls back to the blind pid probe, and
	// nothing anywhere goes red. So this runs the real capture.
	it("the real DaemonPorts adapter actually supplies a process table", () => {
		const snapshot = new DaemonTmux().processSnapshot();
		expect(snapshot.ok && snapshot.processes.some((p) => p.pid === process.pid)).toBe(true);
	});
});
