import { describe, expect, it } from "vitest";

import {
	compileWatch,
	computeDelta,
	DEFAULT_IGNORE,
	DEFAULT_NOTICE,
	formatNotice,
	formatRanges,
	parseConfig,
	reconcile,
	type Snapshot,
	WatchReconciler,
} from "./store.js";

function meta(mtimeMs: number, size: number, content?: string) {
	return content === undefined ? { mtimeMs, size } : { mtimeMs, size, content };
}
function snap(entries: Record<string, { mtimeMs: number; size: number }>): Snapshot {
	return new Map(Object.entries(entries));
}

describe("parseConfig", () => {
	it("accepts the documented minimal config and applies defaults", () => {
		const r = parseConfig({
			watches: [{ dir: "docs", patterns: ["**/*.md"] }],
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.config.watches).toHaveLength(1);
		expect(r.config.watches[0].dir).toBe("docs");
		expect(r.config.debounceMs).toBe(30);
		expect(r.config.ignore).toEqual(DEFAULT_IGNORE);
		expect(r.config.notice).toBe(DEFAULT_NOTICE);
	});

	it("supports multiple watches, multiple patterns, events filter, recursive", () => {
		const r = parseConfig({
			watches: [
				{ dir: "docs", patterns: ["*.md", "*.mdx"], events: ["modified"] },
				{ dir: "src", patterns: ["**/*.ts"], recursive: true },
			],
			debounceMs: 50,
			notice: "{kind}: {path}",
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.config.watches).toHaveLength(2);
		expect(r.config.watches[0].patterns).toEqual(["*.md", "*.mdx"]);
		expect(r.config.watches[1].recursive).toBe(true);
		expect(r.config.debounceMs).toBe(50);
	});

	it("normalizes chokidar-style event aliases add/change/unlink", () => {
		const r = parseConfig({
			watches: [{ dir: "docs", patterns: ["*.md"], events: ["add", "change", "unlink"] }],
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.config.watches[0].events).toEqual(["created", "modified", "deleted"]);
	});

	it("rejects malformed config with a reason (tagged-union, not throw)", () => {
		expect(parseConfig(null).ok).toBe(false);
		expect(parseConfig({}).ok).toBe(false); // no watches
		expect(parseConfig({ watches: [] }).ok).toBe(false); // empty
		expect(parseConfig({ watches: [{ dir: "x", patterns: [] }] }).ok).toBe(false);
		expect(parseConfig({ watches: [{ patterns: ["*.md"] }] }).ok).toBe(false); // no dir
		const bad = parseConfig({ watches: [{ dir: "x", patterns: ["*"], events: ["nope"] }] });
		expect(bad.ok).toBe(false);
	});
});

describe("compileWatch — glob + ignore (AC-03, AC-04)", () => {
	it("matches one-or-more patterns, top-level vs recursive", () => {
		const top = compileWatch({ dir: "d", patterns: ["*.md"] }, DEFAULT_IGNORE);
		expect(top.isMatch("foo.md")).toBe(true);
		expect(top.isMatch("foo.txt")).toBe(false);
		expect(top.isMatch("sub/foo.md")).toBe(false); // *.md is top-level only

		const deep = compileWatch({ dir: "d", patterns: ["**/*.md", "*.mdx"] }, DEFAULT_IGNORE);
		expect(deep.isMatch("sub/deep/foo.md")).toBe(true);
		expect(deep.isMatch("bar.mdx")).toBe(true);
	});

	it("ignores editor atomic-save artifacts", () => {
		const w = compileWatch({ dir: "d", patterns: ["*.md"] }, DEFAULT_IGNORE);
		expect(w.isIgnored("4913")).toBe(true);
		expect(w.isIgnored("notes.md~")).toBe(true);
		expect(w.isIgnored(".goutputstream-AB12")).toBe(true);
		expect(w.isIgnored(".anything")).toBe(true); // dotfiles
		expect(w.isIgnored("notes.md")).toBe(false);
	});
});

describe("reconcile — snapshot diff, never event types (AC-05, Finding 01)", () => {
	it("classifies created / modified / deleted from {mtimeMs,size} alone", () => {
		const prev = snap({ "a.md": meta(100, 10), "b.md": meta(200, 20) });
		const next = snap({ "a.md": meta(150, 10), "c.md": meta(300, 30) }); // a modified, b deleted, c created
		const changes = reconcile(prev, next);
		const byPath = Object.fromEntries(changes.map((c) => [c.path, c.kind]));
		expect(byPath).toEqual({ "a.md": "modified", "b.md": "deleted", "c.md": "created" });
	});

	it("size-only change still classifies as modified", () => {
		const prev = snap({ "a.md": meta(100, 10) });
		const next = snap({ "a.md": meta(100, 11) });
		expect(reconcile(prev, next)).toEqual([{ path: "a.md", kind: "modified" }]);
	});

	it("identical snapshots yield no changes", () => {
		const s = snap({ "a.md": meta(100, 10) });
		expect(reconcile(s, new Map(s))).toEqual([]);
	});
});

describe("WatchReconciler — stateful classify + filter + coalesce", () => {
	const compiled = compileWatch({ dir: "d", patterns: ["*.md"] }, DEFAULT_IGNORE);

	it("prime() seeds baseline without emitting (AC-01: only real changes notify)", () => {
		const r = new WatchReconciler(compiled, DEFAULT_NOTICE);
		r.prime(snap({ "a.md": meta(1, 1) }));
		expect(r.apply(snap({ "a.md": meta(1, 1) }), 1000)).toEqual([]);
	});

	it("emits created then modified across wakes", () => {
		const r = new WatchReconciler(compiled, DEFAULT_NOTICE);
		expect(r.apply(snap({ "a.md": meta(1, 1) }), 1000)).toEqual([
			{ path: "a.md", kind: "created" },
		]);
		expect(r.apply(snap({ "a.md": meta(2, 1) }), 1010)).toEqual([
			{ path: "a.md", kind: "modified" },
		]);
	});

	it("reclassifies a cross-wake delete→re-add within 100ms as modified (a preceding 'deleted' may surface — see known limitation)", () => {
		const r = new WatchReconciler(compiled, DEFAULT_NOTICE);
		r.prime(snap({ "a.md": meta(1, 1) }));
		// wake 1: file vanished → reported deleted (held-delete flushing is out of scope)
		expect(r.apply(new Map(), 1000)).toEqual([{ path: "a.md", kind: "deleted" }]);
		// wake 2: reappears 50ms later → reclassified modified, NOT a spurious created
		expect(r.apply(snap({ "a.md": meta(2, 2) }), 1050)).toEqual([
			{ path: "a.md", kind: "modified" },
		]);
	});

	it("a re-add AFTER the coalesce window is a genuine created", () => {
		const r = new WatchReconciler(compiled, DEFAULT_NOTICE);
		r.prime(snap({ "a.md": meta(1, 1) }));
		r.apply(new Map(), 1000); // deleted
		expect(r.apply(snap({ "a.md": meta(2, 2) }), 2000)).toEqual([
			{ path: "a.md", kind: "created" },
		]);
	});

	it("honours the events filter (AC-03: events:['modified'] drops created)", () => {
		const only = compileWatch(
			{ dir: "d", patterns: ["*.md"], events: ["modified"] },
			DEFAULT_IGNORE,
		);
		const r = new WatchReconciler(only, DEFAULT_NOTICE);
		expect(r.apply(snap({ "a.md": meta(1, 1) }), 1000)).toEqual([]); // created suppressed
		expect(r.apply(snap({ "a.md": meta(2, 1) }), 1010)).toEqual([
			{ path: "a.md", kind: "modified" },
		]);
	});

	it("formats notices from the template", () => {
		const r = new WatchReconciler(compiled, "[file-watch] {path} {kind}");
		expect(r.formatNotices([{ path: "x.md", kind: "created" }])).toEqual([
			"[file-watch] x.md created",
		]);
	});
});

describe("formatNotice", () => {
	it("substitutes {path} and {kind}", () => {
		expect(formatNotice("{kind} -> {path}", { path: "a/b.md", kind: "deleted" })).toBe(
			"deleted -> a/b.md",
		);
	});

	it("substitutes {ranges} {added} {removed} from a delta-bearing change", () => {
		const change = {
			path: "a.ts",
			kind: "modified" as const,
			lineRanges: [
				{ start: 40, end: 42 },
				{ start: 88, end: 88 },
			],
			added: 12,
			removed: 3,
		};
		expect(formatNotice("{path} {kind} (+{added}/-{removed}) {ranges}", change)).toBe(
			"a.ts modified (+12/-3) 40-42,88",
		);
	});
});

describe("computeDelta — ranges + unified diff (AC-01, AC-03)", () => {
	it("returns null for byte-identical text (empty-delta suppression)", () => {
		expect(computeDelta("a\nb\nc\n", "a\nb\nc\n")).toBeNull();
	});

	it("extracts changed-line ranges on the new-file side", () => {
		const oldText = "1\n2\n3\n4\n5\n";
		const newText = "1\n2\nCHANGED\n4\n5\n";
		const delta = computeDelta(oldText, newText, "f.txt");
		expect(delta).not.toBeNull();
		if (!delta) return;
		expect(delta.added).toBe(1);
		expect(delta.removed).toBe(1);
		expect(delta.lineRanges).toEqual([{ start: 3, end: 3 }]);
		expect(delta.diff).toContain("@@");
		expect(delta.diff).toContain("+CHANGED");
		expect(delta.diff).not.toContain("+++"); // header stripped
	});

	it("renders a created file (old = '') as whole-file additions", () => {
		const delta = computeDelta("", "x\ny\nz\n", "new.txt");
		expect(delta).not.toBeNull();
		if (!delta) return;
		expect(delta.added).toBe(3);
		expect(delta.removed).toBe(0);
		expect(formatRanges(delta.lineRanges)).toBe("1-3");
	});

	it("collapses multiple contiguous edits into merged ranges", () => {
		const oldText = "a\nb\nc\nd\ne\nf\ng\n";
		const newText = "a\nB\nC\nd\ne\nf\nG\n"; // lines 2,3 and 7 changed
		const delta = computeDelta(oldText, newText, "f.txt");
		expect(delta).not.toBeNull();
		if (!delta) return;
		expect(formatRanges(delta.lineRanges)).toBe("2-3,7");
	});
});

describe("reconcile — content baseline delta + empty-delta suppression (AC-01, AC-03)", () => {
	it("attaches lineRanges/diff/added/removed to a modified change when content is captured", () => {
		const prev = snap({ "a.ts": meta(100, 5, "one\ntwo\n") });
		const next = snap({ "a.ts": meta(200, 6, "one\nTWO\n") });
		const changes = reconcile(prev, next);
		expect(changes).toHaveLength(1);
		const c = changes[0];
		expect(c?.kind).toBe("modified");
		expect(c?.added).toBe(1);
		expect(c?.removed).toBe(1);
		expect(c?.lineRanges).toEqual([{ start: 2, end: 2 }]);
		expect(c?.diff).toContain("+TWO");
	});

	it("suppresses a modified change whose content is byte-identical (mtime-only touch)", () => {
		const prev = snap({ "a.ts": meta(100, 5, "same\n") });
		const next = snap({ "a.ts": meta(999, 5, "same\n") }); // mtime bumped, content equal
		expect(reconcile(prev, next)).toEqual([]);
	});

	it("still reports a modified without content (over-cap/binary → plain notice)", () => {
		const prev = snap({ "a.ts": meta(100, 5) });
		const next = snap({ "a.ts": meta(200, 6) });
		expect(reconcile(prev, next)).toEqual([{ path: "a.ts", kind: "modified" }]);
	});

	it("attaches whole-file additions to a created change with content", () => {
		const next = snap({ "a.ts": meta(100, 5, "hi\nthere\n") });
		const changes = reconcile(new Map(), next);
		expect(changes[0]?.kind).toBe("created");
		expect(changes[0]?.added).toBe(2);
		expect(formatRanges(changes[0]?.lineRanges)).toBe("1-2");
	});
});
