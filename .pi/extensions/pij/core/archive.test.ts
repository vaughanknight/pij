import { describe, expect, it } from "vitest";
import {
	ARCHIVE_AFTER_MS,
	archiveAgeAnchorMs,
	buildArchiveIndexEntry,
	classifyRegistryRecord,
	isTerminalRecord,
	parseArchiveIndexLine,
	REVIVE_GRACE_MS,
} from "./archive.js";
import type { SessionDescriptor } from "./types.js";

const NOW = Date.parse("2026-07-25T12:00:00.000Z");
const LONG_AGO = new Date(NOW - ARCHIVE_AFTER_MS - 60_000).toISOString();
const RECENTLY = new Date(NOW - 60_000).toISOString();

function descriptor(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-test-peer",
		folder: "/repo",
		dataDir: "/home/.pij/pij-test-peer",
		eventsPath: "/home/.pij/pij-test-peer/events.ndjson",
		pid: 4242,
		startedAt: LONG_AGO,
		...over,
	};
}

describe("isTerminalRecord", () => {
	it("counts dissolved and failed as terminal", () => {
		expect(isTerminalRecord(descriptor({ lifecycle: "dissolved" }))).toBe(true);
		expect(isTerminalRecord(descriptor({ lifecycle: "failed" }))).toBe(true);
	});

	it("counts every live lifecycle — and a legacy absent one — as non-terminal", () => {
		for (const lifecycle of ["pending", "ready", "bound"] as const) {
			expect(isTerminalRecord(descriptor({ lifecycle }))).toBe(false);
		}
		expect(isTerminalRecord(descriptor())).toBe(false);
	});
});

describe("archiveAgeAnchorMs", () => {
	it("takes the NEWEST parseable stamp, not the first present one", () => {
		const anchor = archiveAgeAnchorMs(
			descriptor({ startedAt: LONG_AGO, lastTickAt: LONG_AGO, lastEventAt: RECENTLY }),
		);
		expect(anchor).toBe(Date.parse(RECENTLY));
	});

	it("falls back past unparseable stamps to one that parses", () => {
		const anchor = archiveAgeAnchorMs(
			descriptor({ lastEventAt: "not-a-date", startedAt: LONG_AGO }),
		);
		expect(anchor).toBe(Date.parse(LONG_AGO));
	});

	it("returns null when nothing parses", () => {
		expect(archiveAgeAnchorMs(descriptor({ startedAt: "garbage" }))).toBeNull();
	});
});

describe("classifyRegistryRecord", () => {
	it("archives a terminal record older than the 48h window", () => {
		expect(classifyRegistryRecord(descriptor({ lifecycle: "dissolved" }), NOW)).toBe("archivable");
		expect(classifyRegistryRecord(descriptor({ lifecycle: "failed" }), NOW)).toBe("archivable");
	});

	it("keeps a terminal record hot inside the 48h window", () => {
		const fresh = descriptor({ lifecycle: "dissolved", lastEventAt: RECENTLY });
		expect(classifyRegistryRecord(fresh, NOW)).toBe("hot");
	});

	it("keeps a terminal record hot at EXACTLY the boundary (strictly-older archives)", () => {
		const at = descriptor({
			lifecycle: "failed",
			startedAt: new Date(NOW - ARCHIVE_AFTER_MS).toISOString(),
		});
		expect(classifyRegistryRecord(at, NOW)).toBe("archivable");
		const justInside = descriptor({
			lifecycle: "failed",
			startedAt: new Date(NOW - ARCHIVE_AFTER_MS + 1).toISOString(),
		});
		expect(classifyRegistryRecord(justInside, NOW)).toBe("hot");
	});

	// The load-bearing safety property: never move a seat that could still work.
	it("NEVER archives a live lifecycle, however stale", () => {
		const ancient = new Date(NOW - ARCHIVE_AFTER_MS * 100).toISOString();
		for (const lifecycle of ["pending", "ready", "bound"] as const) {
			const stale = descriptor({ lifecycle, startedAt: ancient, lastEventAt: ancient });
			expect(classifyRegistryRecord(stale, NOW)).toBe("hot");
		}
	});

	it("NEVER archives a legacy descriptor that carries no lifecycle at all", () => {
		expect(classifyRegistryRecord(descriptor({ lifecycle: undefined }), NOW)).toBe("hot");
	});

	it("keeps an unprovable-age terminal record hot rather than guessing", () => {
		const unparseable = descriptor({ lifecycle: "dissolved", startedAt: "¯\\_(ツ)_/¯" });
		expect(classifyRegistryRecord(unparseable, NOW)).toBe("hot");
	});

	it("keeps a future-dated terminal record hot (clock skew is not age)", () => {
		const future = descriptor({
			lifecycle: "dissolved",
			startedAt: new Date(NOW + ARCHIVE_AFTER_MS).toISOString(),
		});
		expect(classifyRegistryRecord(future, NOW)).toBe("hot");
	});
});

describe("archive index entries", () => {
	it("denormalises the fields a listing needs without reopening the descriptor", () => {
		const entry = buildArchiveIndexEntry(
			descriptor({
				lifecycle: "failed",
				failureReason: "bind-timeout",
				harness: "claude",
				folder: "/repo/worktree",
				lastEventAt: LONG_AGO,
			}),
			NOW,
		);
		expect(entry).toMatchObject({
			id: "pij-test-peer",
			archivedAt: new Date(NOW).toISOString(),
			lifecycle: "failed",
			failureReason: "bind-timeout",
			harness: "claude",
			folder: "/repo/worktree",
			lastActivityAt: LONG_AGO,
		});
	});

	it("omits a lastActivityAt it cannot compute", () => {
		const entry = buildArchiveIndexEntry(
			descriptor({ lifecycle: "dissolved", startedAt: "nope" }),
			NOW,
		);
		expect(entry.lastActivityAt).toBeUndefined();
	});

	it("round-trips through the jsonl line format", () => {
		const entry = buildArchiveIndexEntry(descriptor({ lifecycle: "dissolved" }), NOW);
		expect(parseArchiveIndexLine(JSON.stringify(entry))).toEqual(entry);
	});

	it("returns null for blank, corrupt, and shape-invalid lines (a torn tail loses one row, not the listing)", () => {
		expect(parseArchiveIndexLine("")).toBeNull();
		expect(parseArchiveIndexLine("   ")).toBeNull();
		expect(parseArchiveIndexLine('{"id":"half-writ')).toBeNull();
		expect(parseArchiveIndexLine('{"archivedAt":"2026-07-25T12:00:00.000Z"}')).toBeNull();
		expect(parseArchiveIndexLine('{"id":"x"}')).toBeNull();
		expect(parseArchiveIndexLine("[1,2,3]")).toBeNull();
	});
});

// Review round 1 §2.1 — a revive in flight must be invisible to the janitor.
// The seats worth reviving are >=48h old by definition, so age alone can never
// distinguish "dead for two days" from "dead for two days and booting right now".
describe("revive-in-flight exemption", () => {
	it("keeps a dissolved record HOT while its revive marker is fresh", () => {
		const reviving = descriptor({
			lifecycle: "dissolved",
			revivePendingAt: new Date(NOW - 5_000).toISOString(),
		});
		expect(classifyRegistryRecord(reviving, NOW)).toBe("hot");
	});

	// CONTROL: byte-identical record WITHOUT the marker is archivable, so the
	// exemption is doing the work and not some unrelated age quirk.
	it("control — the same record without the marker is archivable", () => {
		expect(classifyRegistryRecord(descriptor({ lifecycle: "dissolved" }), NOW)).toBe("archivable");
	});

	it("stops protecting once the grace window passes — the marker cannot pin a record forever", () => {
		const stale = descriptor({
			lifecycle: "dissolved",
			revivePendingAt: new Date(NOW - REVIVE_GRACE_MS - 1).toISOString(),
		});
		expect(classifyRegistryRecord(stale, NOW)).toBe("archivable");
	});

	it("ignores an unparseable or future-dated marker rather than trusting it", () => {
		expect(
			classifyRegistryRecord(descriptor({ lifecycle: "dissolved", revivePendingAt: "soon" }), NOW),
		).toBe("archivable");
		expect(
			classifyRegistryRecord(
				descriptor({
					lifecycle: "dissolved",
					revivePendingAt: new Date(NOW + 60_000).toISOString(),
				}),
				NOW,
			),
		).toBe("archivable");
	});
});
