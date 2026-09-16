// pij — is the running daemon executing the code you think you merged? (pij#183
// follow-up; the sensor gap found by s101 on 2026-08-09.)
//
// WHY THIS EXISTS. `pij daemon status` reported a pid and a window. Both were
// true, and neither answered the question anybody actually has after a merge.
// This repo hit the resulting trap TWICE IN TWO DAYS, in OPPOSITE directions:
//
//   · pij#180 merged 2026-08-08 21:46 and the daemon running the next morning had
//     started 12.5h EARLIER, so it executed pre-fix code for an entire eight-stream
//     wave while the issue read CLOSED.
//   · The lesson taken from that was RESTART BEFORE MEASURING. On 2026-08-09 a
//     restart was performed correctly — and the new process still ran pre-fix code,
//     because the checkout it runs FROM was four commits behind origin/main. Three
//     PRs read merged; none of them was executing.
//
// **A restart installs whatever is on disk; it does not fetch. Necessary, and not
// sufficient.** A rule derived from one instance of a class closes that instance,
// not the class — which is why this is a sensor and not a line in a runbook.
//
// The second occurrence was caught only because someone was suspicious enough to
// run five forensic commands. That is not a control; it is luck with a good mood.
//
// NO NETWORK, ON PURPOSE. The behind-count is computed from the last fetch and is
// LABELLED as such. A status command that hits the network is a status command
// people stop running — and a slow `pij daemon status` is exactly the tool nobody
// reaches for during an incident, which is when this question matters most.

/** What the caller measured about the daemon's source checkout. Pure input: the
 *  reader does the `git` calls, this module decides what it MEANS. */
export interface SourceCheckoutFacts {
	/** Short sha of the checkout's HEAD, or undefined when it could not be read. */
	readonly head?: string;
	/** True when the working tree has uncommitted changes. */
	readonly dirty?: boolean;
	/** Commits on the tracked remote ref that HEAD does not contain, AS OF THE LAST
	 *  FETCH. Undefined when there is no tracked remote or the count failed. */
	readonly behind?: number;
	/** True when the facts could not be gathered at all (not a git checkout, git
	 *  missing, permissions). Distinct from "gathered, and everything is current". */
	readonly unavailable?: boolean;
}

/** The one-line suffix `pij daemon status` appends, or "" when there is nothing
 *  worth saying.
 *
 *  SILENT ON THE HEALTHY PATH. A status line that always carries source noise
 *  trains readers to skip it, and this string only earns its place by appearing
 *  when something is wrong. A clean, current checkout adds nothing.
 *
 *  UNAVAILABLE IS REPORTED, NEVER TREATED AS CLEAN. "I could not read the
 *  checkout" and "the checkout is current" are opposite facts, and collapsing them
 *  would make the sensor answer "fine" in exactly the situation it cannot see —
 *  the failure this whole stream has been cataloguing. */
export function describeSourceStaleness(facts: SourceCheckoutFacts): string {
	if (facts.unavailable === true) return "source: UNKNOWN (checkout not readable)";
	const parts: string[] = [];
	if (typeof facts.behind === "number" && facts.behind > 0) {
		// The headline. Named STALE rather than "behind" because the reader's
		// question is "am I running what I merged", not "what is my git topology".
		parts.push(
			`STALE by ${facts.behind} commit${facts.behind === 1 ? "" : "s"} (as of last fetch)`,
		);
	}
	if (facts.dirty === true) parts.push("dirty");
	if (parts.length === 0) return "";
	const head = facts.head === undefined ? "" : ` @ ${facts.head}`;
	return `source${head}: ${parts.join(", ")}`;
}
