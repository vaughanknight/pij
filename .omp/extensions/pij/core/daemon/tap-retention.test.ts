// pij#183 — which pane-signal tap files are garbage.
//
// The dangerous cases first, because this module DELETES FILES and every test
// below is really asking "what would make it delete the wrong one".

import { describe, expect, it } from "vitest";
import { orphanedTapFiles, TAP_ORPHAN_GRACE_MS, tapFileStem } from "./tap-retention.js";

const NOW = Date.parse("2026-08-09T02:00:00.000Z");
/** Old enough to be swept — comfortably past the attach grace. */
const OLD = NOW - TAP_ORPHAN_GRACE_MS - 60_000;

function sweep(
	files: readonly string[],
	livePaneIds: readonly string[],
	mtimes: Record<string, number> = {},
): string[] {
	return orphanedTapFiles({
		files,
		livePaneIds,
		modifiedAtMs: (file) => mtimes[file] ?? OLD,
		nowMs: NOW,
	});
}

describe("pij#183: an empty pane list is REFUSED, not obeyed", () => {
	// THE ONE THAT MATTERS MOST. `listPanes()` returns [] for both "no panes
	// exist" and "tmux could not be reached", and those are opposite facts
	// arriving as the same value. Obeying the first reading deletes every tap on
	// the machine — including the live ones — the moment tmux hiccups.
	it("sweeps NOTHING when no live panes are reported", () => {
		expect(sweep(["_1.raw", "_2.raw", "_3.raw"], [])).toEqual([]);
	});

	// The property stated the other way round, so the test above cannot pass by
	// the sweep simply never returning anything.
	it("…but DOES sweep the same files once even one pane is known live", () => {
		expect(sweep(["_1.raw", "_2.raw", "_3.raw"], ["%1"])).toEqual(["_2.raw", "_3.raw"]);
	});
});

describe("pij#183: a live pane's tap is never swept", () => {
	it("keeps the tap of every live pane", () => {
		expect(sweep(["_4.raw", "_5.raw"], ["%4", "%5"])).toEqual([]);
	});

	it("matches on the SANITISED name, which is how the file was named", () => {
		// `attachPaneTap` writes `<sanitised>.raw`, so the comparison has to happen
		// in the same space. `%954` → `_954`.
		expect(tapFileStem("%954")).toBe("_954");
		expect(sweep(["_954.raw"], ["%954"])).toEqual([]);
	});

	it("resolves a sanitisation COLLISION in the safe direction", () => {
		// The mapping is not reversible: `%9`, `$9` and `-9` all sanitise to `_9`.
		// A file that COULD belong to a live pane is kept rather than guessed at.
		expect(tapFileStem("$9")).toBe(tapFileStem("%9"));
		expect(sweep(["_9.raw"], ["$9"])).toEqual([]);
	});
});

describe("pij#183: the attach race", () => {
	// `attachPaneTap` creates the sink file and only THEN runs `tmux pipe-pane`.
	// A sweep landing between those two steps would delete the sink out from under
	// the pipe about to be attached to it — cleanup turning into data loss on a
	// LIVE pane. Anything younger than the grace is untouchable.
	it("never sweeps a file younger than the grace, even with no live pane", () => {
		expect(sweep(["_77.raw"], ["%1"], { "_77.raw": NOW - 1_000 })).toEqual([]);
	});

	it("sweeps it once the grace has elapsed", () => {
		expect(sweep(["_77.raw"], ["%1"], { "_77.raw": NOW - TAP_ORPHAN_GRACE_MS - 1 })).toEqual([
			"_77.raw",
		]);
	});

	it("KEEPS a file whose mtime is unreadable — NaN must not sweep", () => {
		// The adapter returns NaN when `stat` fails. Every comparison against NaN is
		// false, and the guard is written so that falsity means KEEP. Asserted here
		// because the opposite spelling (`age < GRACE` → skip) would sweep it.
		expect(sweep(["_88.raw"], ["%1"], { "_88.raw": Number.NaN })).toEqual([]);
	});

	it("KEEPS a file with a future mtime rather than treating skew as age", () => {
		expect(sweep(["_89.raw"], ["%1"], { "_89.raw": NOW + 60_000 })).toEqual([]);
	});
});

describe("pij#183: only files this daemon recognises are swept", () => {
	it("ignores entries that are not .raw taps", () => {
		// The directory is not owned exclusively enough to delete things whose shape
		// we do not recognise.
		expect(sweep(["notes.md", "subdir", "_2.raw"], ["%1"])).toEqual(["_2.raw"]);
	});

	it("does not mistake a .raw SUFFIX inside a longer name for a stem match", () => {
		// `_1.raw` is live; `_10.raw` is a different pane and must still be swept.
		expect(sweep(["_1.raw", "_10.raw"], ["%1"])).toEqual(["_10.raw"]);
	});
});

describe("pij#183: the measured case that motivated this", () => {
	it("sweeps 185 orphans while keeping all 28 live taps", () => {
		// Live shape 2026-08-09: 213 tap files, 28 live panes, 185 orphans (205MB of
		// 244MB). Asserted as EXACT counts on both sides — a sweep that kept nothing
		// and a sweep that deleted nothing would each satisfy a one-sided check.
		const live = Array.from({ length: 28 }, (_, i) => `%${i + 1}`);
		const files = [
			...live.map((pane) => `${tapFileStem(pane)}.raw`),
			...Array.from({ length: 185 }, (_, i) => `_${900 + i}.raw`),
		];
		expect(files).toHaveLength(213);
		const orphans = sweep(files, live);
		expect(orphans).toHaveLength(185);
		for (const pane of live) expect(orphans).not.toContain(`${tapFileStem(pane)}.raw`);
	});
});
