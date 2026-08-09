// Daemon-side two-tier janitor + tick-duration log (plan 071 D1, T003).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { ARCHIVE_AFTER_MS, ARCHIVE_PRUNE_AFTER_MS } from "./core/archive.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const NOW_MS = Date.parse("2026-07-25T12:00:00.000Z");

let home: string;
let logs: string[];

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-daemon-arc-"));
	logs = [];
});
afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function ports(nowMs = NOW_MS): DaemonPorts {
	return {
		capturePane: () => "",
		isPaneDead: () => true,
		sendText: () => "confirmed",
		sendKey: () => {},
		killPane: () => {},
		listTranscripts: () => [],
		home: () => home,
		now: () => nowMs,
		isAlive: () => false,
	};
}

function seed(id: string, over: Partial<SessionDescriptor>): void {
	const registry = new FsRegistry(home);
	registry.write({
		id,
		folder: "/repo",
		dataDir: join(home, id),
		eventsPath: join(home, id, "events.ndjson"),
		pid: 4242,
		startedAt: new Date(NOW_MS - ARCHIVE_AFTER_MS - 60_000).toISOString(),
		...over,
	});
	mkdirSync(join(home, id), { recursive: true });
	writeFileSync(join(home, id, "events.ndjson"), `{"id":"${id}"}\n`);
}

function daemon(nowMs = NOW_MS): Daemon {
	return new Daemon(home, ports(nowMs), new FsRegistry(home), new FsChannel(home), (line) =>
		logs.push(line),
	);
}

describe("archive sweep", () => {
	it("moves a long-dead DISSOLVED record out of the hot tier on the first tick", () => {
		// Dissolved is the case that matters: 1,945 of the 2,000 corpses in the
		// 2026-07-25 incident were dissolved, and `registry.list()` HIDES those —
		// a sweep built on list() would have moved almost nothing.
		seed("pij-long-gone", { lifecycle: "dissolved" });

		daemon().tick();

		expect(existsSync(join(home, "pij-long-gone.json"))).toBe(false);
		expect(existsSync(join(home, "archive", "pij-long-gone.json"))).toBe(true);
		expect(logs).toContain("archive sweep: moved 1 terminal record(s)");
	});

	it("moves a long-dead FAILED record too", () => {
		// `failed` needs an explicit OLD death stamp where `dissolved` does not, and
		// the asymmetry is real rather than incidental: `list()` excludes `dissolved`,
		// so the death sweep never re-observes those, while a `failed` record stays
		// visible and IS re-observed — and under pij#204 the sweep's `observedAt`
		// stamp is what starts its 48h post-mortem clock.
		seed("pij-never-bound", {
			lifecycle: "failed",
			failureReason: "bind-timeout",
			terminal: {
				disposition: "requested",
				observedAt: new Date(NOW_MS - ARCHIVE_AFTER_MS - 60_000).toISOString(),
				evidence: "pane-missing",
			},
		});

		daemon().tick();

		expect(existsSync(join(home, "archive", "pij-never-bound.json"))).toBe(true);
	});

	// CONTROL: identical setup, only the age differs — proves the sweep is driven
	// by the 48h policy and not by "terminal ⇒ archive".
	it("control — the SAME dissolved record inside the 48h window is left hot", () => {
		seed("pij-recently-gone", {
			lifecycle: "dissolved",
			startedAt: new Date(NOW_MS - 60_000).toISOString(),
		});

		daemon().tick();

		expect(existsSync(join(home, "pij-recently-gone.json"))).toBe(true);
		expect(existsSync(join(home, "archive", "pij-recently-gone.json"))).toBe(false);
		expect(logs.filter((line) => line.startsWith("archive sweep: moved"))).toEqual([]);
	});

	it("never touches a live seat, however ancient", () => {
		seed("pij-old-faithful", {
			lifecycle: "bound",
			startedAt: new Date(NOW_MS - ARCHIVE_AFTER_MS * 50).toISOString(),
		});

		daemon().tick();

		expect(existsSync(join(home, "pij-old-faithful.json"))).toBe(true);
		expect(existsSync(join(home, "archive", "pij-old-faithful.json"))).toBe(false);
	});

	it("keeps the archived record addressable by keyed lookup after the sweep", () => {
		// The death stamp is explicit and OLD (pij#204): a terminal record now ages
		// from `terminal.observedAt`, and the death sweep stamps that on first
		// observation — so a record discovered dead during THIS tick is 0s into its
		// post-mortem window and correctly stays hot. Seeding the stamp is what makes
		// this fixture archivable, and states the precondition instead of relying on
		// the sweep happening to have run earlier.
		seed("pij-long-gone", {
			lifecycle: "failed",
			spawnedBy: "pij-parent",
			terminal: {
				disposition: "requested",
				observedAt: new Date(NOW_MS - ARCHIVE_AFTER_MS - 60_000).toISOString(),
				evidence: "pane-missing",
			},
		});

		daemon().tick();

		// The hot file is gone, yet `pij state <id>` still resolves it — that is the
		// whole contract of the tier split.
		expect(existsSync(join(home, "pij-long-gone.json"))).toBe(false);
		expect(new FsRegistry(home).read("pij-long-gone")).toMatchObject({
			id: "pij-long-gone",
			lifecycle: "failed",
			spawnedBy: "pij-parent",
		});
	});

	it("is throttled — a second tick in the same minute does not re-sweep", () => {
		seed("pij-long-gone", { lifecycle: "dissolved" });
		const d = daemon();

		d.tick();
		seed("pij-also-gone", { lifecycle: "dissolved" });
		d.tick();

		expect(existsSync(join(home, "pij-also-gone.json"))).toBe(true);
		expect(logs.filter((line) => line.startsWith("archive sweep: moved"))).toHaveLength(1);
	});

	it("says so out loud when a move is REFUSED rather than swallowing it", () => {
		seed("pij-conflicted", { lifecycle: "dissolved" });
		mkdirSync(join(home, "archive", "pij-conflicted"), { recursive: true });
		writeFileSync(join(home, "archive", "pij-conflicted", "events.ndjson"), "{}\n");

		daemon().tick();

		expect(logs).toContain("archive sweep: 1 record(s) SKIPPED (conflicting archive state)");
		expect(existsSync(join(home, "pij-conflicted.json"))).toBe(true);
	});
});

describe("tick duration log", () => {
	it("logs a duration and a live count on EVERY tick", () => {
		seed("pij-live-one", { lifecycle: "bound" });
		const d = daemon();

		d.tick();
		d.tick();

		const ticks = logs.filter((line) => line.startsWith("tick: "));
		expect(ticks).toHaveLength(2);
		for (const line of ticks) expect(line).toMatch(/^tick: \d+ms, \d+ live$/);
	});

	it("logs even on a completely empty registry — silence is never the signal", () => {
		daemon().tick();
		expect(logs.filter((line) => line.startsWith("tick: "))).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// pij#183 — the archive retention bound, on disk. Jordan-ruled 90 days:
// DELETE THE WRECKAGE, KEEP THE TOMBSTONE.
describe("archive prune", () => {
	/** Put a record straight into the archive tier, with an explicit death age. */
	function seedArchived(id: string, diedMsAgo: number): void {
		const registry = new FsRegistry(home);
		seed(id, {
			lifecycle: "dissolved",
			terminal: {
				disposition: "requested",
				observedAt: new Date(NOW_MS - diedMsAgo).toISOString(),
				evidence: "pane-missing",
			},
		});
		registry.archive(id, NOW_MS);
	}

	it("deletes the record and its session dir, and KEEPS the index tombstone", () => {
		seedArchived("pij-ancient", ARCHIVE_PRUNE_AFTER_MS + 60_000);
		const indexBefore = readFileSync(join(home, "archive", "index.jsonl"), "utf8");
		expect(indexBefore).toContain("pij-ancient");

		daemon().tick();

		// The bulk is gone…
		expect(existsSync(join(home, "archive", "pij-ancient.json"))).toBe(false);
		expect(existsSync(join(home, "archive", "pij-ancient"))).toBe(false);
		// …and the one line that answers "did this seat exist, when did it die"
		// survives, byte-for-byte. That asymmetry IS the ruling.
		expect(readFileSync(join(home, "archive", "index.jsonl"), "utf8")).toBe(indexBefore);
	});

	it("leaves a record INSIDE the bound completely alone", () => {
		seedArchived("pij-recent-corpse", ARCHIVE_PRUNE_AFTER_MS - 60_000);

		daemon().tick();

		expect(existsSync(join(home, "archive", "pij-recent-corpse.json"))).toBe(true);
		expect(existsSync(join(home, "archive", "pij-recent-corpse"))).toBe(true);
	});

	it("says what it removed, in records AND bytes", () => {
		// A count alone cannot distinguish 2,000 empty stubs from the one 94MB seat
		// somebody wanted, so the log carries both.
		seedArchived("pij-ancient", ARCHIVE_PRUNE_AFTER_MS + 60_000);

		daemon().tick();

		expect(logs.some((line) => line.startsWith("archive prune: removed 1 record(s)"))).toBe(true);
		expect(logs.some((line) => line.includes("index tombstones kept"))).toBe(true);
	});

	it("is silent when it removes nothing — no noise on the 99% of ticks", () => {
		seedArchived("pij-recent-corpse", ARCHIVE_PRUNE_AFTER_MS - 60_000);

		daemon().tick();

		expect(logs.filter((line) => line.startsWith("archive prune:"))).toEqual([]);
	});
});
