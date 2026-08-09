// pij — the daemon source-staleness sensor.
//
// BUILT RED FIRST, against the exact incident it exists to catch: on 2026-08-09
// the daemon was restarted to install three merged PRs and ran none of them,
// because its checkout was four commits behind. `pij daemon status` said
// `running` and was useless — the same shape as pij#225, where `running` was true
// throughout a ten-minute wedge.
//
// The first test below is that incident as a fixture. It failed before the module
// existed, which is the only way to know an assertion is doing work.

import { describe, expect, it } from "vitest";
import { describeSourceStaleness } from "./source-staleness.js";

describe("the 2026-08-09 incident, as a fixture", () => {
	// pid 21365, restarted at 15:27, running a checkout whose HEAD was 12b152d6
	// (12:02) — four commits behind origin/main, containing none of #181/#229/#235.
	const theIncident = { head: "12b152d6", behind: 4, dirty: false } as const;

	it("NAMES a stale checkout, with the count", () => {
		expect(describeSourceStaleness(theIncident)).toBe(
			"source @ 12b152d6: STALE by 4 commits (as of last fetch)",
		);
	});

	it("says STALE — the reader's question is 'am I running what I merged'", () => {
		// Deliberately asserting the WORD. "behind by 4" is a git fact; "STALE" is
		// the answer to the question the operator actually has, and this sensor
		// exists because the honest git fact was available all along and nobody was
		// looking at it.
		expect(describeSourceStaleness(theIncident)).toContain("STALE");
	});

	it("labels the count as being from the last fetch, because it does NOT fetch", () => {
		// A status command that hits the network is one people stop running. The
		// number is therefore possibly-understated, and says so rather than implying
		// a freshness it did not buy.
		expect(describeSourceStaleness(theIncident)).toContain("as of last fetch");
	});
});

describe("silence on the healthy path", () => {
	// A status line that always carries source noise trains readers to skip it.
	it("says NOTHING when the checkout is current and clean", () => {
		expect(describeSourceStaleness({ head: "1e5dae01", behind: 0, dirty: false })).toBe("");
	});

	it("says nothing when there is no tracked remote to compare against", () => {
		expect(describeSourceStaleness({ head: "1e5dae01", dirty: false })).toBe("");
	});
});

describe("unavailable is REPORTED, never treated as clean", () => {
	// "I could not read the checkout" and "the checkout is current" are opposite
	// facts. Collapsing them makes the sensor answer "fine" in precisely the case
	// it cannot see — which is the failure this sensor was written to end.
	it("distinguishes unreadable from current", () => {
		expect(describeSourceStaleness({ unavailable: true })).toBe(
			"source: UNKNOWN (checkout not readable)",
		);
		expect(describeSourceStaleness({ unavailable: true })).not.toBe("");
	});

	it("reports UNKNOWN even when stale facts are also present", () => {
		// If the gather failed, whatever partial numbers came back are not evidence.
		expect(describeSourceStaleness({ unavailable: true, behind: 4 })).toBe(
			"source: UNKNOWN (checkout not readable)",
		);
	});
});

describe("dirty", () => {
	it("reports a dirty tree on its own — running code nobody has committed", () => {
		expect(describeSourceStaleness({ head: "1e5dae01", behind: 0, dirty: true })).toBe(
			"source @ 1e5dae01: dirty",
		);
	});

	it("reports BOTH when a checkout is stale AND dirty", () => {
		expect(describeSourceStaleness({ head: "12b152d6", behind: 2, dirty: true })).toBe(
			"source @ 12b152d6: STALE by 2 commits (as of last fetch), dirty",
		);
	});

	it("pluralises honestly at one commit", () => {
		expect(describeSourceStaleness({ head: "12b152d6", behind: 1 })).toBe(
			"source @ 12b152d6: STALE by 1 commit (as of last fetch)",
		);
	});
});

describe("degradation", () => {
	it("still reports staleness when the HEAD sha could not be read", () => {
		// A missing sha must not suppress the warning — the count is the load-bearing
		// half, and the sha is provenance for a human.
		expect(describeSourceStaleness({ behind: 3 })).toBe(
			"source: STALE by 3 commits (as of last fetch)",
		);
	});

	it("treats a negative or nonsensical behind-count as nothing to report", () => {
		expect(describeSourceStaleness({ head: "abc1234", behind: -1 })).toBe("");
	});
});
