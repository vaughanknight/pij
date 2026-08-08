// pij — the once-per-sweep process-table capture (plan 095, T-1.5).
//
// WHY THIS IS ITS OWN FILE. It belongs on `NodeProcess` by subject matter, but
// `core/liveness-cost.test.ts` guards `adapters/process.ts` against ever
// importing `node:child_process` — and that guard is right: `process.ts` is what
// the `pij list` / `pij state` READ PATH leans on, so a `ps` in there is N forks
// per listing. The death sweep's need is the opposite shape (ONE fork per sweep,
// for the whole table), so it gets its own module that nothing on the read path
// imports. The guard stays untouched and keeps meaning what it says.
//
// The capture is DUMB ON PURPOSE: it reads the table and parses rows. Every
// decision about what a row MEANS is made by `resolveAgentLiveness` in
// `core/state.ts`, which is pure, so each measured case (agent at depth 0, agent
// at depth 1, bare `-zsh`, recycled pid, another seat's `--session-id`,
// truncation) is a table row in a test rather than a live-process experiment.

import { execFileSync } from "node:child_process";
import type { ProcessInfo, ProcessSnapshot } from "../core/platform/types.js";

/** `ps` columns, in the order the classifier expects them.
 *
 *  `-ww` IS MANDATORY, not a style choice: without it `ps` truncates the command
 *  line at the terminal width, and a truncated command line is MISSING EVIDENCE,
 *  not evidence of absence — it is exactly the input that would let the liveness
 *  probe fabricate an `absent` for a live seat. */
const PS_ARGS = ["-Awwo", "pid=,ppid=,lstart=,command="] as const;

/** 32 MiB. The whole process table of a busy machine with full argv is well
 *  under this; node's 1 MiB default is not, and an overflow throws — which the
 *  caller reports as an unavailable capture rather than an empty machine. */
const PS_MAX_BUFFER = 32 * 1024 * 1024;

/** `Sat  8 Aug 00:20:51 2026   /path/to/binary --flag` — `lstart` is five
 *  whitespace-separated fields of fixed shape, and the command is everything
 *  after them.
 *
 *  BOTH field orders are accepted because they differ by platform: macOS renders
 *  `Sat  8 Aug`, GNU renders `Sat Aug  8`. The first version of this pattern
 *  knew only the GNU order, and on macOS every row therefore fell through to the
 *  unreadable branch — see the note in `NodeProcessSnapshot.capture`. */
const PS_ROW =
	/^\s*(\d+)\s+(\d+)\s+(\w{3}\s+(?:\w{3}\s+\d{1,2}|\d{1,2}\s+\w{3})\s+\d{1,2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/;

/** Parse one `ps` row. A row we cannot split is still REPORTED — as a row whose
 *  command could not be read — because dropping it would silently shrink the
 *  process table, and a smaller table is indistinguishable from a smaller
 *  machine. That is how "unreadable" becomes "not there". */
export function parseProcessRow(row: string): ProcessInfo | undefined {
	const match = PS_ROW.exec(row);
	if (!match) {
		const loose = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(row);
		if (!loose) return undefined;
		const [, pid, ppid] = loose;
		if (pid === undefined || ppid === undefined) return undefined;
		return { pid: Number(pid), ppid: Number(ppid), command: "", truncated: true };
	}
	const [, pid, ppid, lstart, command] = match;
	if (pid === undefined || ppid === undefined || command === undefined) return undefined;
	const startedAtMs = lstart === undefined ? Number.NaN : Date.parse(lstart);
	return {
		pid: Number(pid),
		ppid: Number(ppid),
		command,
		...(Number.isFinite(startedAtMs) ? { startedAtMs } : {}),
		...(command.trim().length === 0 ? { truncated: true } : {}),
	};
}

/** The real process-table capability behind `DaemonPorts.processSnapshot`. */
export class NodeProcessSnapshot {
	/** ONE whole-table capture, for ONE death sweep.
	 *
	 *  A failed capture returns `{ ok: false }`, NEVER an empty table: an empty
	 *  table classifies every seat on the machine as absent in a single sweep.
	 *
	 *  THE RULE THIS FILE EXISTS TO HOLD — *a parse failure that degrades to
	 *  "not found" is a fleet-wide kill switch.* The portability bug is the
	 *  ordinary part; the DEFECT is that the **unreadable** case and the
	 *  **absent** case would share an output, so an instrument that can read
	 *  nothing reports that nothing is there — with full confidence, about every
	 *  seat at once. That is this whole plan's defect at maximum blast radius:
	 *  the instrument's limit rendered as the world's property, where the
	 *  instrument is the liveness ladder and the world is the entire fleet.
	 *
	 *  So: unreadable is NOT-PROBEABLE, never ABSENT. Every failure path below
	 *  returns `ok: false`, and `resolveAgentLiveness` maps that to `unknown`,
	 *  which mutates no descriptor and sends no notice. */
	capture(): ProcessSnapshot {
		let stdout: string;
		try {
			stdout = execFileSync("ps", [...PS_ARGS], {
				encoding: "utf8",
				maxBuffer: PS_MAX_BUFFER,
			});
		} catch (error) {
			return { ok: false, reason: error instanceof Error ? error.message : String(error) };
		}
		const processes: ProcessInfo[] = [];
		for (const row of stdout.split("\n")) {
			if (row.trim().length === 0) continue;
			const info = parseProcessRow(row);
			if (info !== undefined) processes.push(info);
		}
		if (processes.length === 0) {
			// `ps` succeeded and we understood none of it. That is a parser failure,
			// and reporting it as an empty machine would bury every seat at once.
			return { ok: false, reason: "ps returned no parseable rows" };
		}
		// The same failure one step subtler, and MEASURED WHILE BUILDING THIS: the
		// first `lstart` pattern matched only GNU's field order, so on macOS every
		// row split into pid/ppid with an empty command. A table of nameless
		// processes cannot identify anybody, and passing it on as `ok` hands the
		// classifier a fleet-wide false absence — the exact destructive answer this
		// stream exists to remove, delivered by this stream.
		if (!processes.some((info) => info.command.trim().length > 0)) {
			return { ok: false, reason: "ps rows carried no readable command line" };
		}
		return { ok: true, capturedAtMs: Date.now(), processes };
	}
}
