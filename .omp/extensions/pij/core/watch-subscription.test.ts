import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FsWatchStore } from "../adapters/watch-store.js";
import {
	addWatch,
	formatWatchNotice,
	parseWatchGlobs,
	pointerFileName,
	removeWatch,
	renderWatchNotice,
} from "./watch-subscription.js";

describe("peer watch subscription core", () => {
	it("groups globs by picomatch base and infers recursion from **", () => {
		expect(parseWatchGlobs(["src/**/*.ts", "src/**/*.tsx", "docs/*.md"])).toEqual([
			{ dir: "src", patterns: ["**/*.ts", "**/*.tsx"], recursive: true },
			{ dir: "docs", patterns: ["*.md"], recursive: false },
		]);
	});

	it("treats a bare directory as a recursive all-files watch", () => {
		expect(parseWatchGlobs(["docs"])).toEqual([
			{ dir: "docs", patterns: ["**/*"], recursive: true },
		]);
	});

	it("adds idempotently and deduplicates by dir/patterns/recursive", () => {
		const once = addWatch([], ["src/**/*.ts"], "2026-07-06T00:00:00.000Z");
		const twice = addWatch(once, ["src/**/*.ts"], "2026-07-06T01:00:00.000Z");
		expect(twice).toHaveLength(1);
		expect(twice[0]).toMatchObject({
			dir: "src",
			patterns: ["**/*.ts"],
			recursive: true,
			addedAt: "2026-07-06T00:00:00.000Z",
		});
	});

	it("stores debounceMs on a new subscription and upserts cadence on the same glob + mode", () => {
		const once = addWatch([], ["src/**/*.ts"], "2026-07-06T00:00:00.000Z", "notify", 750);
		expect(once).toEqual([
			{
				dir: "src",
				patterns: ["**/*.ts"],
				recursive: true,
				addedAt: "2026-07-06T00:00:00.000Z",
				debounceMs: 750,
			},
		]);

		const twice = addWatch(once, ["src/**/*.ts"], "2026-07-06T01:00:00.000Z", "notify", 2000);
		expect(twice).toHaveLength(1);
		expect(twice[0]).toMatchObject({
			addedAt: "2026-07-06T00:00:00.000Z",
			debounceMs: 2000,
		});
	});

	it("keeps subscription identity debounce-blind", () => {
		const first = addWatch([], ["src/**/*.ts"], "now", "diff", 750);
		const updated = addWatch(first, ["src/**/*.ts"], "later", "diff", 2000);
		expect(updated).toHaveLength(1);
		expect(updated[0]?.debounceMs).toBe(2000);
	});

	it("removes matching globs, or all watches when no glob is supplied", () => {
		const watches = addWatch([], ["src/**/*.ts", "docs/*.md"], "now");
		expect(removeWatch(watches, ["src/**/*.ts"]).map((w) => w.dir)).toEqual(["docs"]);
		expect(removeWatch(watches)).toEqual([]);
	});

	it("formats notice batches for injection", () => {
		expect(
			formatWatchNotice([
				{ path: "a.ts", kind: "created" },
				{ path: "b.ts", kind: "modified" },
			]),
		).toBe("[file-watch] a.ts created\n[file-watch] b.ts modified");
		expect(formatWatchNotice(["[file-watch] x deleted"])).toBe("[file-watch] x deleted");
	});

	it("keeps notify and diff subs on one glob distinct, and stamps mode (AC-08)", () => {
		const notify = addWatch([], ["src/**/*.ts"], "now");
		const both = addWatch(notify, ["src/**/*.ts"], "now", "diff");
		expect(both).toHaveLength(2);
		expect(both.map((w) => w.mode)).toEqual([undefined, "diff"]);
		// adding the same diff glob again is idempotent
		expect(addWatch(both, ["src/**/*.ts"], "now", "diff")).toHaveLength(2);
	});

	it("unwatch drops every mode registered for a glob", () => {
		const subs = addWatch(addWatch([], ["src/**/*.ts"], "now"), ["src/**/*.ts"], "now", "diff");
		expect(removeWatch(subs, ["src/**/*.ts"])).toEqual([]);
	});
});

describe("FsWatchStore debounce validation", () => {
	it("accepts numeric debounceMs and rejects non-numeric values", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-watch-store-"));
		const id = "pij-c";
		try {
			mkdirSync(join(home, id));
			writeFileSync(
				join(home, id, "watches.json"),
				JSON.stringify({
					watches: [
						{
							dir: "src",
							patterns: ["**/*.ts"],
							recursive: true,
							addedAt: "now",
							debounceMs: 750,
						},
						{
							dir: "docs",
							patterns: ["**/*.md"],
							recursive: true,
							addedAt: "now",
							debounceMs: "2s",
						},
					],
				}),
			);
			expect(new FsWatchStore(home).readWatches(id)).toEqual([
				expect.objectContaining({ dir: "src", debounceMs: 750 }),
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

describe("renderWatchNotice (WS-001)", () => {
	const dir = "/home/u/.pij/pij-c/watch-diffs";

	it("notify mode renders changed-line ranges", () => {
		const r = renderWatchNotice(
			[
				{
					path: "a.ts",
					kind: "modified",
					added: 2,
					removed: 1,
					lineRanges: [{ start: 4, end: 5 }],
				},
			],
			"notify",
			dir,
		);
		expect(r.body).toBe("[file-watch] a.ts modified (+2/-1) lines 4-5");
		expect(r.pointers).toEqual([]);
	});

	it("diff mode pointer-delivers a small computed diff", () => {
		const diff = "@@ -1 +1 @@\n-a\n+b";
		const r = renderWatchNotice(
			[{ path: "a.ts", kind: "modified", added: 1, removed: 1, diff }],
			"diff",
			dir,
		);
		expect(r.body).toBe(`[file-watch] a.ts modified (+1/-1) — diff: ${dir}/a.ts.diff`);
		expect(r.body).not.toContain("+b");
		expect(r.pointers).toEqual([{ fileName: "a.ts.diff", content: diff }]);
	});

	it("diff mode pointer-delivers a large computed diff", () => {
		const bigDiff = Array.from({ length: 65 }, (_, i) => `+l${i}`).join("\n");
		const r = renderWatchNotice(
			[{ path: "src/a.ts", kind: "created", added: 65, removed: 0, diff: bigDiff }],
			"diff",
			dir,
		);
		expect(r.body).toContain(`— diff: ${dir}/src__a.ts.diff`);
		expect(r.body).not.toContain("+l0");
		expect(r.pointers).toEqual([{ fileName: "src__a.ts.diff", content: bigDiff }]);
	});

	it("diff mode keeps an over-cap or binary no-diff change as a plain notice (AC-11)", () => {
		const r = renderWatchNotice([{ path: "src/a.bin", kind: "modified" }], "diff", dir);
		expect(r.body).toBe("[file-watch] src/a.bin modified");
		expect(r.pointers).toEqual([]);
	});

	it("deleted is a plain notice regardless of mode", () => {
		expect(renderWatchNotice([{ path: "a.ts", kind: "deleted" }], "diff", dir)).toEqual({
			body: "[file-watch] a.ts deleted",
			pointers: [],
		});
	});

	it("keeps an empty delta suppressed", () => {
		expect(renderWatchNotice([], "diff", dir)).toEqual({ body: "", pointers: [] });
	});

	it("sanitizes nested paths into flat pointer filenames", () => {
		expect(pointerFileName("src/core/store.ts")).toBe("src__core__store.ts.diff");
	});
});
