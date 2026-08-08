import { describe, expect, it } from "vitest";

import type { DaemonStartProbe, DaemonStatus } from "./lifecycle.js";
import {
	DAEMON_START_SUCCESS_MARK,
	DAEMON_START_WARN_MARK,
	DAEMON_VERIFY_BUDGET_MS,
	DAEMON_VERIFY_POLL_MS,
	daemonStartOutcome,
	daemonStatus,
	needsAutoStart,
	planStop,
	reportDaemonStart,
} from "./lifecycle.js";
import type { LockFile } from "./lock.js";

const lock = (over: Partial<LockFile> = {}): LockFile => ({
	pid: 4242,
	startedAt: "2026-06-27T00:00:00.000Z",
	...over,
});

describe("daemonStatus", () => {
	it("no lock → absent", () => {
		expect(daemonStatus(null, () => true)).toEqual({ kind: "absent" });
	});

	it("lock + holder alive → running (carries the owned window)", () => {
		expect(daemonStatus(lock({ window: "@5" }), () => true)).toEqual({
			kind: "running",
			pid: 4242,
			window: "@5",
		});
	});

	it("running without an owned window omits it (human-started daemon)", () => {
		expect(daemonStatus(lock(), () => true)).toEqual({ kind: "running", pid: 4242 });
	});

	it("lock + holder dead → stale", () => {
		expect(daemonStatus(lock(), () => false)).toEqual({ kind: "stale", pid: 4242 });
	});
});

describe("needsAutoStart", () => {
	it("only a running daemon suppresses auto-start", () => {
		expect(needsAutoStart({ kind: "running", pid: 1 })).toBe(false);
		expect(needsAutoStart({ kind: "stale", pid: 1 })).toBe(true);
		expect(needsAutoStart({ kind: "absent" })).toBe(true);
	});
});

describe("daemonStartOutcome", () => {
	it("running → verified, carrying the pid that was proven alive", () => {
		expect(daemonStartOutcome({ kind: "running", pid: 4242 })).toEqual({
			kind: "verified",
			pid: 4242,
		});
	});

	it("stale → unverified: the daemon wrote a lock and then died", () => {
		// Worse evidence than no lock at all — it got far enough to claim the
		// lock and still is not there. Never report this as a started daemon.
		expect(daemonStartOutcome({ kind: "stale", pid: 4242 })).toEqual({ kind: "unverified" });
	});

	it("absent → unverified: a created window is not a running daemon", () => {
		expect(daemonStartOutcome({ kind: "absent" })).toEqual({ kind: "unverified" });
	});

	it("carries no cause on unverified — it never asserts the daemon is dead", () => {
		// The bounded poll may simply have expired first. Over-claiming failure
		// would repeat pij#118 defect 2 in the opposite direction.
		expect(Object.keys(daemonStartOutcome({ kind: "absent" }))).toEqual(["kind"]);
	});

	it("ignores the owned window — only liveness verifies a start", () => {
		expect(daemonStartOutcome({ kind: "running", pid: 7, window: "@5" })).toEqual({
			kind: "verified",
			pid: 7,
		});
	});
});

describe("planStop", () => {
	it("absent → nothing", () => {
		expect(planStop({ kind: "absent" })).toEqual({ kind: "nothing" });
	});

	it("stale → cleanup (clear the lock, no signal)", () => {
		expect(planStop({ kind: "stale", pid: 4242 })).toEqual({ kind: "cleanup", pid: 4242 });
	});

	it("running with an owned window → kill pid AND window", () => {
		expect(planStop({ kind: "running", pid: 4242, window: "@5" })).toEqual({
			kind: "kill",
			pid: 4242,
			window: "@5",
		});
	});

	it("running without an owned window → kill pid only (never a human's window)", () => {
		expect(planStop({ kind: "running", pid: 4242 })).toEqual({ kind: "kill", pid: 4242 });
	});
});

// ---------------------------------------------------------------------------
// reportDaemonStart — THE property of pij#118 defect 2:
//
//     an unverified outcome never renders as a success note.
//
// Phase 2 tested `daemonStartOutcome()` — a pure classifier the reporting code
// merely happens to call. Every one of those tests stayed green with the poll
// loop deleted and the old unconditional success line restored, i.e. they
// agreed with reality without being able to disagree with it. These target the
// rendering DECISION, and task 8 mutation-proves that they can go red.
// ---------------------------------------------------------------------------

const CTX = { windowName: "pij-daemon", paneId: "%7" } as const;

/** A probe over a scripted status sequence. The last entry repeats forever, so
 *  a "never comes up" case is expressed as a single-element script. Records
 *  every sleep so the tests can pin the polling shape, not just the result. */
function probeOver(
	script: readonly DaemonStatus[],
	over: Partial<DaemonStartProbe> = {},
): DaemonStartProbe & { readonly sleeps: number[]; readonly statusCalls: () => number } {
	const sleeps: number[] = [];
	let i = 0;
	return {
		status: () => script[Math.min(i++, script.length - 1)] as DaemonStatus,
		sleep: (ms) => {
			sleeps.push(ms);
		},
		capturePane: () => "boot output",
		budgetMs: 200,
		pollMs: 50,
		...over,
		sleeps,
		statusCalls: () => i,
	};
}

describe("reportDaemonStart", () => {
	describe("the property: an unverified outcome never renders as a success note", () => {
		// Every status sequence that never reaches `running`. If any of these
		// renders a success note, pij#118 defect 2 is back.
		const neverRunning: readonly (readonly [string, readonly DaemonStatus[]])[] = [
			["absent throughout — the daemon never wrote a lock", [{ kind: "absent" }]],
			["stale throughout — it wrote a lock and died", [{ kind: "stale", pid: 4242 }]],
			[
				"absent then stale — it got as far as the lock, then crashed",
				[{ kind: "absent" }, { kind: "stale", pid: 4242 }],
			],
			[
				"stale then absent — the lock was reaped and nothing replaced it",
				[{ kind: "stale", pid: 4242 }, { kind: "absent" }],
			],
		];

		for (const [name, script] of neverRunning) {
			it(name, () => {
				const note = reportDaemonStart(CTX, probeOver(script));
				expect(note.startsWith(DAEMON_START_SUCCESS_MARK)).toBe(false);
				expect(note.startsWith(DAEMON_START_WARN_MARK)).toBe(true);
				expect(note).toContain("could NOT verify");
				// The hedge is load-bearing: unverified is not dead, and a false
				// obituary is the same mistake as a false success, reversed.
				expect(note).toContain("may still be coming up");
				// No pid may be claimed — none was proven.
				expect(note).not.toContain("verified up as pid");
			});
		}
	});

	it("polls rather than returning early: absent → absent → running verifies after exactly 2 sleeps", () => {
		const probe = probeOver([
			{ kind: "absent" },
			{ kind: "absent" },
			{ kind: "running", pid: 4242 },
		]);
		const note = reportDaemonStart(CTX, probe);

		expect(note.startsWith(DAEMON_START_SUCCESS_MARK)).toBe(true);
		expect(note).toContain("verified up as pid 4242");
		expect(note).toContain("pane %7");
		// Exactly two — one per failed check. Zero would mean it never polled;
		// more would mean it kept going after proof.
		expect(probe.sleeps).toEqual([50, 50]);
	});

	it("returns the instant the lock goes live — a daemon already up costs no sleeps", () => {
		const probe = probeOver([{ kind: "running", pid: 99 }]);
		expect(reportDaemonStart(CTX, probe)).toContain("verified up as pid 99");
		expect(probe.sleeps).toEqual([]);
	});

	it("bounds the failure case at budgetMs / pollMs polls", () => {
		const probe = probeOver([{ kind: "absent" }], { budgetMs: 500, pollMs: 50 });
		const note = reportDaemonStart(CTX, probe);

		expect(probe.sleeps).toHaveLength(10);
		expect(probe.statusCalls()).toBe(10);
		expect(note).toContain("within 500ms");
		expect(note.startsWith(DAEMON_START_WARN_MARK)).toBe(true);
	});

	it("defaults to the MEASURED budget when the probe does not override it", () => {
		// 584/572/576ms cold starts: a sub-second budget would flag every healthy
		// auto-start as unverified — the old lie, inverted.
		expect(DAEMON_VERIFY_BUDGET_MS).toBe(2_500);
		expect(DAEMON_VERIFY_POLL_MS).toBe(50);

		const probe = probeOver([{ kind: "absent" }], { budgetMs: undefined, pollMs: undefined });
		const note = reportDaemonStart(CTX, probe);
		expect(note).toContain(`within ${DAEMON_VERIFY_BUDGET_MS}ms`);
		expect(probe.sleeps).toHaveLength(DAEMON_VERIFY_BUDGET_MS / DAEMON_VERIFY_POLL_MS);
	});

	it("a stale lock renders unverified, never verified — it is WORSE evidence than no lock", () => {
		const note = reportDaemonStart(CTX, probeOver([{ kind: "stale", pid: 4242 }]));
		expect(note.startsWith(DAEMON_START_SUCCESS_MARK)).toBe(false);
		// Specifically: the dead holder's pid is never presented as a live one.
		expect(note).not.toContain("verified up as pid 4242");
	});

	describe("the failure note shows the pane instead of naming a cause", () => {
		it("carries the pane tail, trimmed", () => {
			const note = reportDaemonStart(
				CTX,
				probeOver([{ kind: "absent" }], {
					capturePane: () => "Error: ENOENT … daemon.lock\n\n",
				}),
			);
			expect(note).toContain("--- pane %7 ---");
			expect(note).toContain("Error: ENOENT … daemon.lock");
			expect(note.endsWith("\n")).toBe(false);
		});

		it("still renders when capturePane THROWS — a failed capture degrades the note, never replaces the outcome", () => {
			const note = reportDaemonStart(
				CTX,
				probeOver([{ kind: "absent" }], {
					capturePane: () => {
						throw new Error("no server running");
					},
				}),
			);
			expect(note).toContain("could NOT verify");
			expect(note).toContain("could not capture pane %7: no server running");
			expect(note.startsWith(DAEMON_START_WARN_MARK)).toBe(true);
		});

		it("omits the pane block entirely when the pane is empty", () => {
			const note = reportDaemonStart(
				CTX,
				probeOver([{ kind: "absent" }], { capturePane: () => "" }),
			);
			expect(note).not.toContain("--- pane");
		});
	});
});
