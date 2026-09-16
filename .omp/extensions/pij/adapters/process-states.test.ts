// pij — the spawn-count proof for pij#181 (stream s101, instrument A).
//
// WHY A COUNT AND NOT A TIMING. The claim in pij#181 is "one `ps` subprocess per
// descriptor per tick", and the fix's claim is "one per tick, whatever the
// descriptor count". Both are statements about a COUNT, and a wall-clock number
// cannot decide either: it moves with machine load, working-set size, and how
// many pids happen to be alive. This file asserts the count directly, with an
// injected capture, so the property holds on any machine and in CI where there is
// no fleet to measure.
//
// The wall-clock before/after (instrument B) is taken separately against an
// isolated daemon and reported with its pid and start time. It corroborates this;
// it does not establish it.
//
// EVIDENCE DISCIPLINE (this fleet's standard): a count is an assertion over a
// SET, so each test below states the set it counts over and asserts EXACTLY N —
// never "no extras". The two opposite errors that would leave `captures === 1`
// unchanged are called out where they apply and are separately excluded:
//   · a descriptor set that never populated (0 questions asked → 0 captures, which
//     also reads as "batched") — excluded by asserting the QUESTION count too;
//   · a probe that short-circuits before capturing (e.g. an early return on a
//     dead pid) — excluded by asserting every pid still receives a verdict.

import { describe, expect, it } from "vitest";
import {
	isSuspendedIn,
	type ProcessStateTable,
	parseProcessStateRow,
	TickScopedProcessStates,
} from "./process-states.js";

/** The live shape this fix was measured against (2026-08-09, daemon pid 7581):
 *  626 hot descriptors, 625 of them carrying a `paneId` and therefore asking the
 *  suspension question. Used as the fixture size so the numbers in the issue, the
 *  PR and this file are the same numbers. */
const HOT_DESCRIPTORS_WITH_PANE = 625;

function tableOf(entries: ReadonlyArray<readonly [number, string]>): ProcessStateTable {
	return { ok: true, states: new Map(entries) };
}

describe("pij#181: the suspension probe forks ONCE PER TICK, not once per descriptor", () => {
	it("625 descriptors ask the question and produce EXACTLY ONE capture", () => {
		let captures = 0;
		const probe = new TickScopedProcessStates(() => {
			captures += 1;
			return tableOf([[1, "S"]]);
		});

		let answered = 0;
		for (let pid = 1; pid <= HOT_DESCRIPTORS_WITH_PANE; pid++) {
			// Every descriptor's question is asked, and every one is answered.
			expect(probe.isSuspended(pid)).not.toBeUndefined();
			answered += 1;
		}

		// EXACTLY one capture for the whole tick — the property under test.
		expect(captures).toBe(1);
		// …and it is one capture because it was BATCHED, not because nothing asked.
		// Without this line, an empty descriptor set would satisfy the line above.
		expect(answered).toBe(HOT_DESCRIPTORS_WITH_PANE);
	});

	it("the pre-fix shape would have been 625 captures — the number this replaces", () => {
		// The per-pid probe, modelled: one capture per question. This is not a test
		// of production code; it is the BASELINE the assertion above is a claim
		// against, kept here so the ratio is visible in one file rather than
		// asserted in one place and remembered in another.
		let perPidCaptures = 0;
		for (let pid = 1; pid <= HOT_DESCRIPTORS_WITH_PANE; pid++) {
			perPidCaptures += 1;
		}
		expect(perPidCaptures).toBe(625);
	});

	it("each tick captures again — the table is never reused across ticks", () => {
		let captures = 0;
		const probe = new TickScopedProcessStates(() => {
			captures += 1;
			return tableOf([[1, "S"]]);
		});

		probe.invalidate();
		probe.isSuspended(1);
		probe.isSuspended(2);
		expect(captures).toBe(1);

		probe.invalidate();
		probe.isSuspended(1);
		expect(captures).toBe(2);
	});

	it("a tick that asks nothing forks nothing", () => {
		// The capture is lazy, so the cost is never paid for a question nobody
		// asked. A daemon with no pane-bearing descriptors must not fork at all.
		let captures = 0;
		const probe = new TickScopedProcessStates(() => {
			captures += 1;
			return tableOf([[1, "S"]]);
		});
		probe.invalidate();
		expect(captures).toBe(0);
	});

	it("a FAILED capture is not retried per pid", () => {
		// The worst possible moment to fork 625 times is the moment the machine is
		// already unhealthy enough that `ps` failed. One failure per tick.
		let captures = 0;
		const probe = new TickScopedProcessStates(() => {
			captures += 1;
			return { ok: false, reason: "boom" };
		});
		for (let pid = 1; pid <= HOT_DESCRIPTORS_WITH_PANE; pid++) {
			expect(probe.isSuspended(pid)).toBeNull();
		}
		expect(captures).toBe(1);
	});
});

describe("the batched verdict is IDENTICAL to the per-pid probe it replaces", () => {
	// The per-pid probe was:
	//   ps -o state= -p <pid>  →  trim  →  "" ? null : state.startsWith("T")
	//   (and any throw → null)
	// These cases pin each branch of that to the batched equivalent, because the
	// whole claim of pij#181's fix is that it changes COST and not MEANING.

	it("a stopped process reads suspended", () => {
		expect(isSuspendedIn(tableOf([[42, "T"]]), 42)).toBe(true);
	});

	it("a stopped process with a modifier suffix still reads suspended", () => {
		expect(isSuspendedIn(tableOf([[42, "T+"]]), 42)).toBe(true);
	});

	it("a running process reads NOT suspended", () => {
		expect(isSuspendedIn(tableOf([[42, "S"]]), 42)).toBe(false);
	});

	it("multi-character states are not mistaken for stopped", () => {
		// macOS renders `Ss`, `S+`, `SN`, `SNs`, `Ss+`, `R+`, `Rs` and at least one
		// `?+`. Only a leading `T` means stopped; nothing else may.
		for (const state of ["Ss", "S+", "SN", "SNs", "Ss+", "R", "R+", "Rs", "?+"]) {
			expect(isSuspendedIn(tableOf([[42, state]]), 42), state).toBe(false);
		}
	});

	it("a pid ABSENT from the table is unknown, NEVER 'not suspended'", () => {
		// The per-pid probe got empty stdout for a dead pid and returned null. A
		// missing row is the batched form of the same fact. Returning `false` here
		// would fabricate a confident negative for every dead seat at once — and
		// 650 of 678 descriptors on the live machine carry a dead pid.
		expect(isSuspendedIn(tableOf([[1, "S"]]), 42)).toBeNull();
	});

	it("an UNREADABLE table is unknown for every pid, NEVER 'not suspended'", () => {
		const failed: ProcessStateTable = { ok: false, reason: "ps blew up" };
		for (const pid of [1, 42, 999]) {
			expect(isSuspendedIn(failed, pid)).toBeNull();
		}
	});
});

describe("row parsing", () => {
	it("parses the macOS two-column form, including leading padding", () => {
		expect(parseProcessStateRow("    1 Ss")).toEqual([1, "Ss"]);
		expect(parseProcessStateRow("55980 T+")).toEqual([55980, "T+"]);
	});

	it("tolerates trailing whitespace, which `ps -o state=` emits", () => {
		expect(parseProcessStateRow("  256 Ss  ")).toEqual([256, "Ss"]);
	});

	it("returns undefined for a row it cannot split, rather than guessing", () => {
		// A guessed row is worse than a dropped one: a dropped row degrades that
		// pid to `null` (not probeable), which is the safe side of the answer.
		for (const row of ["", "   ", "not-a-row", "abc S"]) {
			expect(parseProcessStateRow(row), row).toBeUndefined();
		}
	});
});
