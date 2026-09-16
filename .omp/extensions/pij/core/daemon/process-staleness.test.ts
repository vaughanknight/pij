// pij — is the daemon PROCESS running the code now on disk? (s101, follow-up to
// the source sensor in pij#246.)
//
// WRITTEN BEFORE THE MODULE. The one line nobody would catch by reading the diff
// is the legacy case: a lock written before this field existed must read UNKNOWN
// and never "current". A sensor that reports health it did not measure is the
// defect this whole family of commits exists to remove.
//
// TWO AXES, TWO LABELS, NEVER ONE FIELD DOING BOTH:
//
//   behind > 0                 the DISK is stale relative to the REMOTE   (pij#246)
//   lock.head !== HEAD         the PROCESS is stale relative to the DISK  (here)
//
// pij#246 caught "you did not pull". It cannot catch "you pulled AFTER starting
// the daemon" — a different failure with an identical consequence, and the state
// the o-prime was in within twenty minutes of merging the sensor, CAUSED BY
// merging it. The sensor could not see itself landing.

import { describe, expect, it } from "vitest";
import { describeProcessStaleness } from "./process-staleness.js";

describe("the legacy lock — the line that would ship silently wrong", () => {
	// A daemon started before this field existed writes no `head`. "I do not know
	// what it booted from" and "it booted from what is there now" are opposite
	// facts, and the second is the dangerous one to invent.
	it("says UNKNOWN when the lock carries no boot head", () => {
		expect(describeProcessStaleness({ currentHead: "68557676" })).toBe(
			"process: UNKNOWN (daemon lock predates the boot-head field — restart to populate it)",
		);
	});

	it("never renders a legacy lock the same as a current one", () => {
		const legacy = describeProcessStaleness({ currentHead: "68557676" });
		const current = describeProcessStaleness({ bootHead: "68557676", currentHead: "68557676" });
		expect(legacy).not.toBe(current);
		expect(current).toBe(""); // a matching pair is silent
	});
});

describe("the incident this closes", () => {
	// o-prime, 2026-08-09 16:xx: daemon 21897 booted from 12b152d6; the checkout was
	// then pulled to 68557676, which ADDED #245 and #246. `pij daemon status` said
	// nothing, because the checkout was clean and current — which is all pij#246
	// measures.
	it("names both shas and how far the checkout has moved", () => {
		expect(
			describeProcessStaleness({
				bootHead: "12b152d6",
				currentHead: "68557676",
				commitsAhead: 2,
			}),
		).toBe("process: running 12b152d6, checkout now 68557676 (2 commits newer)");
	});

	it("pluralises honestly at one commit", () => {
		expect(describeProcessStaleness({ bootHead: "a1", currentHead: "b2", commitsAhead: 1 })).toBe(
			"process: running a1, checkout now b2 (1 commit newer)",
		);
	});

	it("still reports the mismatch when the distance cannot be counted", () => {
		// A rewritten history or an unreachable boot sha makes the COUNT unknown; it
		// does not make the MISMATCH unknown, and the mismatch is the load-bearing
		// half.
		expect(describeProcessStaleness({ bootHead: "a1", currentHead: "b2" })).toBe(
			"process: running a1, checkout now b2",
		);
	});
});

describe("silence and degradation", () => {
	it("says nothing when the process and the checkout agree", () => {
		expect(describeProcessStaleness({ bootHead: "abc1234", currentHead: "abc1234" })).toBe("");
	});

	it("says UNKNOWN when the checkout's HEAD cannot be read", () => {
		// Same rule as pij#246: unreadable is not clean.
		expect(describeProcessStaleness({ bootHead: "abc1234" })).toBe(
			"process: UNKNOWN (checkout HEAD not readable)",
		);
	});

	it("says UNKNOWN when NEITHER is known, rather than nothing at all", () => {
		expect(describeProcessStaleness({})).not.toBe("");
	});

	it("treats a nonsensical negative distance as an uncounted mismatch", () => {
		expect(describeProcessStaleness({ bootHead: "a1", currentHead: "b2", commitsAhead: -3 })).toBe(
			"process: running a1, checkout now b2",
		);
	});
});
