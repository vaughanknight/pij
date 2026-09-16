// pij — the once-per-TICK process STATE table (pij#181).
//
// WHY THIS EXISTS. `RuntimeAxisTracker` asks `isSuspended(pid)` for every
// descriptor that has a pane, and the daemon used to answer it with
// `execFileSync("ps", ["-o","state=","-p",pid])` written INLINE IN `daemon.ts`.
// One subprocess per descriptor per tick. Measured on the live machine: 625 of
// 626 hot descriptors carry a `paneId`, and a V8 CPU profile attributed 2956ms —
// 26.2% of the whole tick — to exactly that path, 100% of `spawn` self time.
//
// One `ps` can report the state of every pid at once, so it does.
//
// WHY IT IS A SEPARATE MODULE FROM `process-snapshot.ts`, which also reads the
// process table: that one captures `pid,ppid,lstart,command` for the DEATH SWEEP,
// whose classifier (`resolveAgentLiveness`) needs the command line and start time
// to tell a live agent from a recycled pid. This one needs a single extra column
// the other does not carry, on a different cadence, for a different consumer.
// Merging them into one capture is a real and worthwhile follow-up — it would take
// the tick from two whole-table `ps` calls to one — but it changes that module's
// row parser and couples the runtime axis's freshness to the death sweep's capture
// point, so it is deliberately NOT bundled into the fix for #181. See the note on
// pid reuse below, which is the reason the merge is more than a micro-optimisation.
//
// WHICH QUESTION `state=` ANSWERS, AND WHY THAT IS NOT THE SAME QUESTION AS
// `kill(pid, 0)`. Both are asked of a PID, and a pid is not an identity: the OS
// recycles them. `kill(pid,0)` answers "does SOME process hold this pid" and
// `state=` answers "what is the state of WHATEVER process currently holds this
// pid". Neither can tell you it is still YOUR process. They therefore diverge
// exactly on a recycled pid — one can say `alive` while the other reports the
// state of a stranger — and this machine has already had pid/pane reuse advance a
// dead seat's `lastEventAt` from a live one (pij#172). A registry that is 95.9%
// dead rows (650 of 678, measured 2026-08-09) is the condition that MAXIMISES the
// chance of a recycled pid, because it holds the most stale pids for longest.
//
// This module does not fix that, and must not be read as fixing it: it answers the
// SAME question the inline probe answered, at 1/625th the cost. The disambiguating
// evidence (`lstart` + `command`) lives in `process-snapshot.ts`, which is the
// other half of why merging the two captures is worth doing properly later.
//
// THE RULE THIS MODULE INHERITS FROM `process-snapshot.ts`: an unreadable probe is
// NOT-PROBEABLE, never a verdict. Every failure path yields `null` per pid, which
// `systemStateOf` renders as honest missing telemetry — never `false` ("not
// suspended"), which would be a fabricated negative for every seat at once.

import { execFileSync } from "node:child_process";

/** Whole-table, two columns, no header. `-A` = every process; the `=` suffixes
 *  suppress headers so every line is data. NOT `-p <pid>`: the per-pid form is
 *  the defect this module exists to remove. */
const PS_STATE_ARGS = ["-Ao", "pid=,state="] as const;

/** 8 MiB. Two short columns over a few thousand processes is a few hundred KiB;
 *  node's 1 MiB default is close enough to a busy machine's output to be worth
 *  raising, and an overflow throws — reported as an unavailable capture. */
const PS_STATE_MAX_BUFFER = 8 * 1024 * 1024;

/** THE BOUND, and it is the point of this module as much as the batching is.
 *
 *  pij#225: one `tmux send-keys` with no timeout blocked inside the tick and
 *  halted message delivery for EVERY seat in EVERY government on the machine for
 *  ten minutes (measured `tick: 606939ms`), while `pij daemon status` read
 *  `running` throughout. The tick is a SHARED SINGLE-THREADED RESOURCE, so any
 *  unbounded blocking call inside it is a fleet-wide outage waiting for a slow
 *  syscall. The inline probe this replaces had no timeout and ran 625 times per
 *  tick — 625 chances per 600ms tick to own the loop forever.
 *
 *  Batching alone takes that to 1. The timeout takes it to 0: on expiry
 *  `execFileSync` throws, which this module reports as an unavailable capture,
 *  and the tick continues with honest missing telemetry instead of stopping.
 *
 *  5s is deliberately far above any plausible `ps` (measured ~5.4ms here) — this
 *  is a wedge bound, not a latency budget. */
const PS_STATE_TIMEOUT_MS = 5_000;

/** A successful whole-table read, or a stated reason it could not be taken.
 *  There is deliberately no "empty table" success: `ps` returning nothing we can
 *  parse is a failure of the instrument, and reporting it as an empty machine
 *  would answer `null`-vs-`false` for every seat on the wrong side. */
export type ProcessStateTable =
	| { readonly ok: true; readonly states: ReadonlyMap<number, string> }
	| { readonly ok: false; readonly reason: string };

/** `    1 Ss` → `[1, "Ss"]`. macOS renders multi-character states (`Ss`, `S+`,
 *  `SNs`, `Ss+`) and at least one non-alphabetic one (`?+`), so the state column
 *  is captured as an opaque token and interpreted exactly once, in
 *  {@link isSuspendedIn}. A row we cannot split is dropped rather than guessed —
 *  a missing pid degrades to `null` (not probeable), which is the safe side. */
export function parseProcessStateRow(row: string): readonly [number, string] | undefined {
	const match = /^\s*(\d+)\s+(\S+)\s*$/.exec(row);
	if (!match) return undefined;
	const [, pid, state] = match;
	if (pid === undefined || state === undefined) return undefined;
	return [Number(pid), state];
}

/** The suspension verdict for one pid against a captured table.
 *
 *  `T` is `ps`'s state letter for a SIGSTOP'd (stopped) process. A pid ABSENT
 *  from the table is not "running normally" — it is not running at all, and the
 *  probe this replaces returned `null` for it (empty stdout), so `null` it stays.
 *  Preserving that exactly is what makes this a pure cost change: `systemStateOf`
 *  already distinguishes `null` (unknown) from `false` (known not suspended). */
export function isSuspendedIn(table: ProcessStateTable, pid: number): boolean | null {
	if (!table.ok) return null;
	const state = table.states.get(pid);
	if (state === undefined) return null;
	return state.startsWith("T");
}

/** ONE whole-table capture. Bounded in time and in memory; every failure is a
 *  stated reason, never an empty table. */
export function captureProcessStates(): ProcessStateTable {
	let stdout: string;
	try {
		stdout = execFileSync("ps", [...PS_STATE_ARGS], {
			encoding: "utf8",
			maxBuffer: PS_STATE_MAX_BUFFER,
			timeout: PS_STATE_TIMEOUT_MS,
		});
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
	const states = new Map<number, string>();
	for (const row of stdout.split("\n")) {
		if (row.trim().length === 0) continue;
		const parsed = parseProcessStateRow(row);
		if (parsed !== undefined) states.set(parsed[0], parsed[1]);
	}
	if (states.size === 0) {
		// `ps` succeeded and we understood none of it. That is a parser failure, and
		// calling it an empty machine would answer every pid with the same confident
		// wrong shape. Same rule as `process-snapshot.ts`.
		return { ok: false, reason: "ps returned no parseable pid/state rows" };
	}
	return { ok: true, states };
}

/** Serves `isSuspended(pid)` for a whole tick from ONE capture.
 *
 *  LAZY ON PURPOSE: the capture happens on the first question of a tick, not at
 *  `invalidate()`. A tick with no pane-bearing descriptors therefore forks
 *  nothing at all, and the cost is never paid for a question nobody asked.
 *
 *  A FAILED capture is cached for the tick exactly like a successful one. It must
 *  not be retried per pid — that would restore the per-descriptor spawn shape on
 *  precisely the path where the machine is already unhealthy, which is the worst
 *  possible moment to fork 625 times. One failure per tick, every pid honestly
 *  `null`, retry next tick. */
export class TickScopedProcessStates {
	private table: ProcessStateTable | undefined;

	constructor(private readonly capture: () => ProcessStateTable = captureProcessStates) {}

	/** Drop the cached table so the next question re-captures. Called once per
	 *  tick; safe to call when nothing was captured. */
	invalidate(): void {
		this.table = undefined;
	}

	isSuspended(pid: number): boolean | null {
		this.table ??= this.capture();
		return isSuspendedIn(this.table, pid);
	}
}
