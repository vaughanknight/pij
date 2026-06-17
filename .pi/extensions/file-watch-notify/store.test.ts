import { describe, expect, it } from "vitest";

import {
	compileWatch,
	DEFAULT_IGNORE,
	DEFAULT_NOTICE,
	formatNotice,
	parseConfig,
	reconcile,
	type Snapshot,
	WatchReconciler,
} from "./store.js";

function meta(mtimeMs: number, size: number) {
	return { mtimeMs, size };
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

	it("coalesces a delete→re-add within 100ms into a single modified (atomic save, Finding 02)", () => {
		const r = new WatchReconciler(compiled, DEFAULT_NOTICE);
		r.prime(snap({ "a.md": meta(1, 1) }));
		// wake 1: file vanished
		expect(r.apply(new Map(), 1000)).toEqual([{ path: "a.md", kind: "deleted" }]);
		// wake 2: reappears 50ms later → modified, not created
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
});
