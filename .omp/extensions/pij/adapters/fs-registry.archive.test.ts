// Two-tier registry (plan 071 D1, T002): hot scan, keyed archive fallback,
// idempotent atomic archival, revive.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARCHIVE_AFTER_MS } from "../core/archive.js";
import type { SessionDescriptor } from "../core/types.js";
import { FsRegistry } from "./fs-registry.js";

const NOW = Date.parse("2026-07-25T12:00:00.000Z");

let home: string;
let registry: FsRegistry;

function descriptor(id: string, over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id,
		folder: "/repo",
		dataDir: join(home, id),
		eventsPath: join(home, id, "events.ndjson"),
		pid: 4242,
		startedAt: new Date(NOW - ARCHIVE_AFTER_MS - 60_000).toISOString(),
		...over,
	};
}

/** A record with its session dir + one event line, exactly as a real seat leaves it. */
function seed(id: string, over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	const d = descriptor(id, over);
	registry.write(d);
	mkdirSync(join(home, id), { recursive: true });
	writeFileSync(join(home, id, "events.ndjson"), `{"seq":1,"id":"${id}"}\n`);
	return d;
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-arc-"));
	registry = new FsRegistry(home);
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("archive()", () => {
	it("moves descriptor AND session dir, appends the index, and clears the hot tier", () => {
		seed("pij-dead-gull", { lifecycle: "dissolved" });

		expect(registry.archive("pij-dead-gull", NOW)).toBe("archived");

		expect(existsSync(join(home, "pij-dead-gull.json"))).toBe(false);
		expect(existsSync(join(home, "pij-dead-gull"))).toBe(false);
		expect(existsSync(join(home, "archive", "pij-dead-gull.json"))).toBe(true);
		expect(readFileSync(join(home, "archive", "pij-dead-gull", "events.ndjson"), "utf8")).toContain(
			"pij-dead-gull",
		);
		const index = readFileSync(join(home, "archive", "index.jsonl"), "utf8").trim();
		expect(JSON.parse(index)).toMatchObject({ id: "pij-dead-gull", lifecycle: "dissolved" });
	});

	it("rewrites the archived copy's dataDir/eventsPath to where the data actually is", () => {
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW);

		const archived = registry.read("pij-dead-gull");
		expect(archived?.dataDir).toBe(join(home, "archive", "pij-dead-gull"));
		expect(archived?.eventsPath).toBe(join(home, "archive", "pij-dead-gull", "events.ndjson"));
		expect(existsSync(archived?.eventsPath ?? "")).toBe(true);
	});

	it("is idempotent — a second call reports already-archived and changes nothing", () => {
		seed("pij-dead-gull", { lifecycle: "dissolved" });
		registry.archive("pij-dead-gull", NOW);
		const before = readFileSync(join(home, "archive", "index.jsonl"), "utf8");

		expect(registry.archive("pij-dead-gull", NOW + 1000)).toBe("already-archived");
		expect(readFileSync(join(home, "archive", "index.jsonl"), "utf8")).toBe(before);
	});

	it("resumes a crash-interrupted move (dir already moved, descriptor still hot)", () => {
		seed("pij-dead-gull", { lifecycle: "dissolved" });
		// Simulate a crash between the dir rename and the descriptor publish.
		mkdirSync(join(home, "archive"), { recursive: true });
		writeFileSync(join(home, "archive", ".keep"), "");
		rmSync(join(home, "pij-dead-gull"), { recursive: true, force: true });
		mkdirSync(join(home, "archive", "pij-dead-gull"), { recursive: true });

		expect(registry.archive("pij-dead-gull", NOW)).toBe("archived");
		expect(registry.read("pij-dead-gull")?.id).toBe("pij-dead-gull");
		expect(existsSync(join(home, "pij-dead-gull.json"))).toBe(false);
	});

	it("REFUSES (skipped) when a session dir exists in both tiers — never merges two histories", () => {
		seed("pij-dead-gull", { lifecycle: "dissolved" });
		mkdirSync(join(home, "archive", "pij-dead-gull"), { recursive: true });
		writeFileSync(join(home, "archive", "pij-dead-gull", "events.ndjson"), '{"seq":99}\n');

		expect(registry.archive("pij-dead-gull", NOW)).toBe("skipped");
		// Both sides untouched.
		expect(existsSync(join(home, "pij-dead-gull.json"))).toBe(true);
		expect(readFileSync(join(home, "pij-dead-gull", "events.ndjson"), "utf8")).toContain('seq":1');
		expect(readFileSync(join(home, "archive", "pij-dead-gull", "events.ndjson"), "utf8")).toContain(
			"99",
		);
	});

	it("reports skipped for an id that exists in neither tier", () => {
		expect(registry.archive("pij-never-was", NOW)).toBe("skipped");
	});

	it("archives a descriptor that never had a session dir", () => {
		registry.write(descriptor("pij-bare-bones", { lifecycle: "failed" }));
		expect(registry.archive("pij-bare-bones", NOW)).toBe("archived");
		expect(registry.read("pij-bare-bones")?.lifecycle).toBe("failed");
	});
});

describe("the tier split", () => {
	it("list() returns ONLY the hot tier — this is the O(live) invariant", () => {
		seed("pij-live-one", { lifecycle: "bound" });
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW);

		expect(registry.list().map((d) => d.id)).toEqual(["pij-live-one"]);
	});

	// CONTROL for the refusal above: without archival the dead record IS listed,
	// so the assertion is proving the move, not an unrelated filter.
	it("control — the same dead record IS in list() before it is archived", () => {
		seed("pij-live-one", { lifecycle: "bound" });
		seed("pij-dead-gull", { lifecycle: "failed" });

		expect(
			registry
				.list()
				.map((d) => d.id)
				.sort(),
		).toEqual(["pij-dead-gull", "pij-live-one"]);
	});

	it("keyed read() finds an archived record by direct path", () => {
		seed("pij-dead-gull", { lifecycle: "failed", failureReason: "bind-timeout" });
		registry.archive("pij-dead-gull", NOW);

		expect(registry.read("pij-dead-gull")).toMatchObject({
			id: "pij-dead-gull",
			failureReason: "bind-timeout",
		});
	});

	it("read() prefers the hot copy when a record somehow exists in both tiers", () => {
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW);
		registry.write(descriptor("pij-dead-gull", { lifecycle: "bound", pid: 999 }));

		expect(registry.read("pij-dead-gull")).toMatchObject({ lifecycle: "bound", pid: 999 });
	});

	it("never reports a keyed lookup as missing across the move", () => {
		seed("pij-dead-gull", { lifecycle: "dissolved" });
		expect(registry.read("pij-dead-gull")).not.toBeNull();
		registry.archive("pij-dead-gull", NOW);
		expect(registry.read("pij-dead-gull")).not.toBeNull();
	});
});

describe("listArchived()", () => {
	it("is empty before anything is archived", () => {
		expect(registry.listArchived()).toEqual([]);
	});

	it("returns archived rows newest-first", () => {
		seed("pij-old-one", { lifecycle: "failed" });
		seed("pij-new-one", { lifecycle: "dissolved" });
		registry.archive("pij-old-one", NOW - 10_000);
		registry.archive("pij-new-one", NOW);

		expect(registry.listArchived().map((entry) => entry.id)).toEqual([
			"pij-new-one",
			"pij-old-one",
		]);
	});

	it("drops rows whose archived descriptor is gone, so the listing matches reality", () => {
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW);
		rmSync(join(home, "archive", "pij-dead-gull.json"));

		expect(registry.listArchived()).toEqual([]);
	});

	it("survives a torn index tail — one bad line loses one row, not the listing", () => {
		seed("pij-good-row", { lifecycle: "failed" });
		registry.archive("pij-good-row", NOW);
		writeFileSync(
			join(home, "archive", "index.jsonl"),
			`${readFileSync(join(home, "archive", "index.jsonl"), "utf8")}{"id":"half-writ`,
		);

		expect(registry.listArchived().map((entry) => entry.id)).toEqual(["pij-good-row"]);
	});
});

describe("unarchive()", () => {
	it("pulls descriptor and session dir back into the hot tier", () => {
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW);

		const revived = registry.unarchive("pij-dead-gull");

		expect(revived?.dataDir).toBe(join(home, "pij-dead-gull"));
		expect(existsSync(join(home, "pij-dead-gull.json"))).toBe(true);
		expect(existsSync(join(home, "pij-dead-gull", "events.ndjson"))).toBe(true);
		expect(existsSync(join(home, "archive", "pij-dead-gull.json"))).toBe(false);
		expect(registry.list().map((d) => d.id)).toEqual(["pij-dead-gull"]);
	});

	it("drops the revived row from the archived listing", () => {
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW);
		registry.unarchive("pij-dead-gull");

		expect(registry.listArchived()).toEqual([]);
	});

	it("returns null for an id that was never archived", () => {
		expect(registry.unarchive("pij-never-was")).toBeNull();
	});

	it("re-archiving after a revive records the newer archivedAt, not the stale one", () => {
		seed("pij-dead-gull", { lifecycle: "failed" });
		registry.archive("pij-dead-gull", NOW - 10_000);
		registry.unarchive("pij-dead-gull");
		registry.archive("pij-dead-gull", NOW);

		const rows = registry.listArchived();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.archivedAt).toBe(new Date(NOW).toISOString());
	});
});

// s066 × s071 D1 integration. `pij revive` relaunches a DISSOLVED seat; the
// janitor archives dissolved seats after 48h. The seats most worth reviving are
// therefore the ones most likely to be archived.
describe("unarchive composes with the revive verb's preconditions", () => {
	it("restores an archived seat to a state the revive verb can use", () => {
		seed("pij-long-gone", { lifecycle: "dissolved", harness: "claude" });
		registry.archive("pij-long-gone", NOW);

		// Pre-condition the bug would have hit: the archived descriptor's paths
		// point INTO the archive, so a revived session would write its events there.
		expect(registry.read("pij-long-gone")?.dataDir).toBe(join(home, "archive", "pij-long-gone"));

		registry.unarchive("pij-long-gone");

		const restored = registry.read("pij-long-gone");
		expect(restored?.dataDir).toBe(join(home, "pij-long-gone"));
		expect(restored?.eventsPath).toBe(join(home, "pij-long-gone", "events.ndjson"));
		expect(existsSync(join(home, "pij-long-gone", "events.ndjson"))).toBe(true);
		// And it no longer claims to be archived.
		expect(registry.listArchived()).toEqual([]);
	});

	it("is a safe no-op for an id that was never archived (the common revive case)", () => {
		seed("pij-recently-gone", { lifecycle: "dissolved" });
		const before = registry.read("pij-recently-gone");

		expect(registry.unarchive("pij-recently-gone")).toBeNull();

		expect(registry.read("pij-recently-gone")).toEqual(before);
	});
});

// Review round 1 §2.2 — the unarchive belongs INSIDE the registry. A CLI-only
// unarchive missed `session.ts`'s boot-time `wasDissolved → revive()`, which runs
// in the SEAT's own process where no `pij revive` ever executed.
describe("no write splits an id across both tiers", () => {
	it("revive() unarchives first — a revived seat never writes into archive/", () => {
		seed("pij-split", { lifecycle: "dissolved", harness: "claude", harnessSessionId: "n1" });
		registry.archive("pij-split", NOW);

		const revived = registry.revive({
			...(registry.read("pij-split") as SessionDescriptor),
			lifecycle: "bound",
			pid: 5150,
			dataDir: join(home, "pij-split"),
			eventsPath: join(home, "pij-split", "events.ndjson"),
			revivePendingAt: new Date(NOW).toISOString(),
		});

		expect(revived.ok).toBe(true);
		expect(existsSync(join(home, "pij-split.json"))).toBe(true);
		expect(existsSync(join(home, "archive", "pij-split.json"))).toBe(false);
		expect(registry.read("pij-split")?.dataDir).toBe(join(home, "pij-split"));
		expect(registry.listArchived()).toEqual([]);
	});

	it("a plain write() that brings a record back to life unarchives it too", () => {
		seed("pij-split", { lifecycle: "failed" });
		registry.archive("pij-split", NOW);

		registry.write({
			...(registry.read("pij-split") as SessionDescriptor),
			lifecycle: "bound",
			dataDir: join(home, "pij-split"),
			eventsPath: join(home, "pij-split", "events.ndjson"),
		});

		expect(existsSync(join(home, "archive", "pij-split.json"))).toBe(false);
		expect(registry.read("pij-split")?.dataDir).toBe(join(home, "pij-split"));
		expect(registry.listArchived()).toEqual([]);
	});

	// CONTROL: a write that does NOT bring the record back to life leaves the
	// archive alone, so the unarchive is targeted rather than a blanket un-tiering.
	it("control — a dissolved write does not drag the record out of the archive", () => {
		seed("pij-split", { lifecycle: "dissolved" });
		registry.archive("pij-split", NOW);

		registry.write({ ...(registry.read("pij-split") as SessionDescriptor), state: "idle" });

		expect(existsSync(join(home, "archive", "pij-split.json"))).toBe(true);
	});

	// §2.4 — unarchive now mirrors archive()'s ordering: data first, then the
	// descriptor that points at it, so no window returns a path that lies.
	it("never publishes a hot descriptor whose dataDir does not exist", () => {
		seed("pij-torn", { lifecycle: "failed" });
		registry.archive("pij-torn", NOW);

		const restored = registry.unarchive("pij-torn");

		expect(restored).not.toBeNull();
		expect(existsSync(restored?.dataDir ?? "")).toBe(true);
	});
});

// Review round 2 §3.1 — the tier pull-back must move the RECORD *and* its PATHS.
// The first fix unarchived correctly, then published the caller's descriptor —
// read BEFORE the unarchive — whose dataDir/eventsPath are uncontested and so
// overwrote the correction. Worse than the original split: the path then named a
// directory that did not exist at all.
describe("the registry owns tier paths, never the caller", () => {
	it("a life-giving write lands paths in the HOT tier even from a stale archived snapshot", () => {
		seed("pij-stale-path", { lifecycle: "failed" });
		registry.archive("pij-stale-path", NOW);
		// Exactly what a caller holds: the descriptor as read from the ARCHIVE.
		const asRead = registry.read("pij-stale-path") as SessionDescriptor;
		expect(asRead.dataDir).toBe(join(home, "archive", "pij-stale-path"));

		registry.write({ ...asRead, lifecycle: "bound" });

		const live = registry.read("pij-stale-path") as SessionDescriptor;
		expect(live.dataDir).toBe(join(home, "pij-stale-path"));
		expect(live.eventsPath).toBe(join(home, "pij-stale-path", "events.ndjson"));
		// The whole point: the path must NAME SOMETHING THAT EXISTS.
		expect(existsSync(live.dataDir)).toBe(true);
		expect(existsSync(live.eventsPath)).toBe(true);
	});

	// The harness split that made this bite in production: s066's
	// buildRevivedDescriptor never touches dataDir, so claude/copilot/codex kept the
	// broken path while pi/omp self-healed via session.ts's own computation.
	it("revive() corrects the paths too, for the harnesses that do not self-heal", () => {
		seed("pij-revived", { lifecycle: "dissolved", harness: "claude", harnessSessionId: "n1" });
		registry.archive("pij-revived", NOW);
		const asRead = registry.read("pij-revived") as SessionDescriptor;

		const result = registry.revive({
			...asRead, // carries archive/ paths verbatim, exactly like buildRevivedDescriptor
			lifecycle: "bound",
			pid: 7788,
			revivePendingAt: new Date(NOW).toISOString(),
		});

		expect(result.ok).toBe(true);
		const live = registry.read("pij-revived") as SessionDescriptor;
		expect(live.dataDir).toBe(join(home, "pij-revived"));
		expect(existsSync(live.eventsPath)).toBe(true);
	});

	// CONTROL: an ARCHIVED record still reports archive paths — the rule is
	// "paths follow the tier", not "paths are always hot".
	it("control — an archived record still names the archive tier", () => {
		seed("pij-buried", { lifecycle: "failed" });
		registry.archive("pij-buried", NOW);

		const buried = registry.read("pij-buried") as SessionDescriptor;
		expect(buried.dataDir).toBe(join(home, "archive", "pij-buried"));
		expect(existsSync(buried.eventsPath)).toBe(true);
	});
});
