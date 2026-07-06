import { describe, expect, it } from "vitest";

import { addWatch, formatWatchNotice, parseWatchGlobs, removeWatch } from "./watch-subscription.js";

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
});
