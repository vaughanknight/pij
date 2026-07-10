// FileWatchNotify core — pi-free pure logic (Pattern P2).
//
// Imports nothing from @earendil-works/*. The ONLY change-classification
// mechanism is reconciling a {mtimeMs,size} snapshot per debounced wake —
// never `fs.watch` event types (research Key Finding 01: the directory-watch
// trap). The watcher adapter (watcher.ts) supplies snapshots; this module
// decides what changed and how to phrase it.

import { createPatch, structuredPatch } from "diff";
import picomatch from "picomatch";

// ─── domain types ──────────────────────────────────────────────────────────
export type ChangeKind = "created" | "modified" | "deleted";

export interface FileMeta {
	readonly mtimeMs: number;
	readonly size: number;
	/** Resolved physical file identity; used only for cross-watch dedup keys. */
	readonly identityPath?: string;
	/**
	 * Under-cap textual content captured at snapshot time — the self-snapshot
	 * baseline the reconciler diffs against. `undefined` when the file is
	 * over the cap (`MAX_CONTENT_BYTES`) or binary (Key Finding 01); such a
	 * `modified` still reports, but without a textual delta.
	 */
	readonly content?: string;
}

/** path (relative to a watch dir) → file metadata. */
export type Snapshot = Map<string, FileMeta>;

/** A contiguous run of changed lines in the *new* file (1-based, inclusive). */
export interface LineRange {
	readonly start: number;
	readonly end: number;
}

export interface Change {
	readonly path: string;
	readonly kind: ChangeKind;
	/** Resolved physical file identity; rendered notices still use `path`. */
	readonly identityPath?: string;
	/**
	 * Changed-line ranges in the new file — present for `created`/`modified`
	 * only when content was captured on both baselines. Absent → no textual
	 * delta was computable (over-cap/binary/`deleted`).
	 */
	readonly lineRanges?: readonly LineRange[];
	/** Unified diff body (hunks only, no `---`/`+++` preamble). */
	readonly diff?: string;
	/** Added / removed line counts for the `(+A/-R)` stat summary. */
	readonly added?: number;
	readonly removed?: number;
}

export interface WatchConfig {
	readonly dir: string;
	readonly patterns: string[];
	/** optional kind filter; default = all kinds. */
	readonly events?: ChangeKind[];
	readonly recursive?: boolean;
}

export interface Config {
	readonly watches: WatchConfig[];
	readonly debounceMs: number;
	readonly ignore: string[];
	readonly notice: string;
}

// ─── defaults (Pattern P5: live with the data they constrain) ───────────────
export const DEFAULT_DEBOUNCE_MS = 30;
/** editor atomic-save artifacts (research Key Finding 02). */
export const DEFAULT_IGNORE = ["4913", "*~", ".goutputstream*", ".tmp*", ".*"];
export const DEFAULT_NOTICE = "[file-watch] {path} {kind}";
/** a re-add this soon after a delete is reclassified "modified" (not "created"). */
export const REDELETE_COALESCE_MS = 100;
/**
 * Cap for content capture. Files larger than this are snapshotted without
 * content (over-cap → plain notice, no textual delta), bounding memory (Risk:
 * memory growth from the content cache).
 */
export const MAX_CONTENT_BYTES = 256 * 1024;
const ALL_KINDS: readonly ChangeKind[] = ["created", "modified", "deleted"];

// ─── textual delta (self-snapshot baseline, findings 01/02) ─────────────────
export interface Delta {
	readonly lineRanges: LineRange[];
	readonly added: number;
	readonly removed: number;
	/** Unified diff body (hunks only). */
	readonly diff: string;
}

function mergeRanges(lines: number[]): LineRange[] {
	if (lines.length === 0) return [];
	const sorted = [...new Set(lines)].sort((a, b) => a - b);
	const ranges: LineRange[] = [];
	let start = sorted[0] as number;
	let end = start;
	for (let i = 1; i < sorted.length; i++) {
		const n = sorted[i] as number;
		if (n === end + 1) {
			end = n;
		} else {
			ranges.push({ start, end });
			start = n;
			end = n;
		}
	}
	ranges.push({ start, end });
	return ranges;
}

/** Strip jsdiff's `Index:`/`===`/`---`/`+++` preamble, leaving the `@@` hunks. */
function stripPatchHeader(patch: string): string {
	const lines = patch.split("\n");
	const firstHunk = lines.findIndex((l) => l.startsWith("@@"));
	if (firstHunk === -1) return "";
	return lines.slice(firstHunk).join("\n").replace(/\n$/u, "");
}

/**
 * Compute changed-line ranges + a unified diff from old/new text. Returns
 * `null` when the two texts are byte-identical (AC-03: an mtime-only touch has
 * an empty textual delta and must be suppressed). A `created` file is diffed
 * against `""` so the whole file renders as additions (AC-11).
 */
export function computeDelta(oldText: string, newText: string, path = "file"): Delta | null {
	if (oldText === newText) return null;
	const structured = structuredPatch(path, path, oldText, newText, "", "", { context: 3 });
	const changedNewLines: number[] = [];
	let added = 0;
	let removed = 0;
	for (const hunk of structured.hunks) {
		let newLine = hunk.newStart;
		let sawAdd = false;
		for (const line of hunk.lines) {
			const tag = line[0];
			if (tag === "+") {
				changedNewLines.push(newLine);
				newLine++;
				added++;
				sawAdd = true;
			} else if (tag === "-") {
				removed++;
			} else {
				newLine++;
			}
		}
		// A pure-deletion hunk contributes no new line; anchor it at newStart so
		// the range still points the reader at where content vanished.
		if (!sawAdd && removed > 0) changedNewLines.push(Math.max(1, hunk.newStart));
	}
	return {
		lineRanges: mergeRanges(changedNewLines),
		added,
		removed,
		diff: stripPatchHeader(createPatch(path, oldText, newText, "", "", { context: 3 })),
	};
}

// ─── config parsing (Pattern P4: tagged-union over throws) ──────────────────
export type ConfigResult = { ok: true; config: Config } | { ok: false; reason: string };

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Canonical change kinds + the chokidar-style aliases the docs use. */
const EVENT_ALIASES: Readonly<Record<string, ChangeKind>> = {
	created: "created",
	modified: "modified",
	deleted: "deleted",
	add: "created",
	change: "modified",
	unlink: "deleted",
};

function normalizeEvent(v: unknown): ChangeKind | undefined {
	return typeof v === "string" ? EVENT_ALIASES[v] : undefined;
}

/** Parse raw JSON (already `JSON.parse`d) into a validated Config. */
export function parseConfig(raw: unknown): ConfigResult {
	if (typeof raw !== "object" || raw === null) {
		return { ok: false, reason: "config must be a JSON object" };
	}
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.watches) || obj.watches.length === 0) {
		return { ok: false, reason: "config.watches must be a non-empty array" };
	}

	const watches: WatchConfig[] = [];
	for (let i = 0; i < obj.watches.length; i++) {
		const w = obj.watches[i] as Record<string, unknown>;
		if (typeof w !== "object" || w === null) {
			return { ok: false, reason: `watches[${i}] must be an object` };
		}
		if (typeof w.dir !== "string" || w.dir.length === 0) {
			return { ok: false, reason: `watches[${i}].dir must be a non-empty string` };
		}
		if (!isStringArray(w.patterns) || w.patterns.length === 0) {
			return {
				ok: false,
				reason: `watches[${i}].patterns must be a non-empty string array`,
			};
		}
		let events: ChangeKind[] | undefined;
		if (w.events !== undefined) {
			if (!Array.isArray(w.events)) {
				return { ok: false, reason: `watches[${i}].events must be an array` };
			}
			const norm: ChangeKind[] = [];
			for (const e of w.events) {
				const kind = normalizeEvent(e);
				if (!kind) {
					return {
						ok: false,
						reason: `watches[${i}].events entries must be created|modified|deleted (aliases add|change|unlink ok)`,
					};
				}
				norm.push(kind);
			}
			events = norm;
		}
		if (w.recursive !== undefined && typeof w.recursive !== "boolean") {
			return { ok: false, reason: `watches[${i}].recursive must be a boolean` };
		}
		watches.push({
			dir: w.dir,
			patterns: w.patterns,
			events,
			recursive: w.recursive === true,
		});
	}

	if (obj.debounceMs !== undefined && typeof obj.debounceMs !== "number") {
		return { ok: false, reason: "config.debounceMs must be a number" };
	}
	if (obj.ignore !== undefined && !isStringArray(obj.ignore)) {
		return { ok: false, reason: "config.ignore must be a string array" };
	}
	if (obj.notice !== undefined && typeof obj.notice !== "string") {
		return { ok: false, reason: "config.notice must be a string" };
	}

	return {
		ok: true,
		config: {
			watches,
			debounceMs: typeof obj.debounceMs === "number" ? obj.debounceMs : DEFAULT_DEBOUNCE_MS,
			ignore: isStringArray(obj.ignore) ? obj.ignore : DEFAULT_IGNORE,
			notice: typeof obj.notice === "string" ? obj.notice : DEFAULT_NOTICE,
		},
	};
}

// ─── glob compilation (Pattern P3: compile once, reuse per path) ────────────
export interface CompiledWatch {
	readonly dir: string;
	/** does a path (relative to dir) match the configured patterns? */
	readonly isMatch: (relPath: string) => boolean;
	/** is a basename an editor artifact we should never report? */
	readonly isIgnored: (basename: string) => boolean;
	readonly events: ReadonlySet<ChangeKind>;
	readonly recursive: boolean;
}

export function compileWatch(w: WatchConfig, ignore: string[]): CompiledWatch {
	const match = picomatch(w.patterns);
	const ignoreMatch = ignore.length > 0 ? picomatch(ignore, { dot: true }) : null;
	return {
		dir: w.dir,
		isMatch: (relPath: string) => match(relPath),
		isIgnored: (basename: string) => (ignoreMatch ? ignoreMatch(basename) : false),
		events: new Set(w.events ?? ALL_KINDS),
		recursive: w.recursive === true,
	};
}

// ─── snapshot reconcile (the trap fix, Key Finding 01) ──────────────────────
/**
 * Diff two snapshots into changes. Created = in next only; deleted = in prev
 * only; modified = in both with a different mtimeMs or size. There is NO way
 * to pass a raw fs event here — classification is structurally snapshot-based.
 */
export function reconcile(prev: Snapshot, next: Snapshot): Change[] {
	const changes: Change[] = [];
	for (const [path, meta] of next) {
		const before = prev.get(path);
		if (before === undefined) {
			const delta = meta.content !== undefined ? computeDelta("", meta.content, path) : null;
			changes.push(withDelta({ path, kind: "created", identityPath: meta.identityPath }, delta));
		} else if (before.mtimeMs !== meta.mtimeMs || before.size !== meta.size) {
			if (before.content !== undefined && meta.content !== undefined) {
				const delta = computeDelta(before.content, meta.content, path);
				// Empty textual delta (mtime-only touch) → suppress (AC-03).
				if (delta === null) continue;
				changes.push(withDelta({ path, kind: "modified", identityPath: meta.identityPath }, delta));
			} else {
				changes.push({ path, kind: "modified", identityPath: meta.identityPath });
			}
		}
	}
	for (const [path, meta] of prev) {
		if (!next.has(path)) changes.push({ path, kind: "deleted", identityPath: meta.identityPath });
	}
	return changes;
}

/** Attach a computed delta to a change (no-op when `delta` is null). */
function withDelta(change: Change, delta: Delta | null): Change {
	if (delta === null) return change;
	return {
		...change,
		lineRanges: delta.lineRanges,
		diff: delta.diff,
		added: delta.added,
		removed: delta.removed,
	};
}

/**
 * Per-watch stateful classifier: holds the last snapshot + recently-deleted
 * paths so a delete→re-add inside REDELETE_COALESCE_MS (a delete+recreate split
 * across two wakes) is reclassified "modified" rather than a spurious "created".
 * NB: a preceding "deleted" from the earlier wake may still have been emitted
 * (single-notice cross-wake coalescing is out of scope — see plan Known
 * Limitations). Applies the event filter and formats notices. The snapshot it
 * receives is already pattern-matched and
 * ignore-filtered by the watcher adapter.
 */
export class WatchReconciler {
	private snapshot: Snapshot = new Map();
	private readonly recentDeletes = new Map<string, number>();

	constructor(
		private readonly compiled: CompiledWatch,
		private readonly notice: string,
	) {}

	/** Seed the baseline without emitting changes (initial scan at boot). */
	prime(initial: Snapshot): void {
		this.snapshot = new Map(initial);
	}

	/** Diff against the new snapshot; return reportable, filtered changes. */
	apply(next: Snapshot, now: number = Date.now()): Change[] {
		const raw = reconcile(this.snapshot, next);
		this.snapshot = new Map(next);

		const out: Change[] = [];
		for (const c of raw) {
			let kind = c.kind;
			if (kind === "created") {
				const deletedAt = this.recentDeletes.get(c.path);
				if (deletedAt !== undefined && now - deletedAt <= REDELETE_COALESCE_MS) {
					kind = "modified";
				}
			}
			if (kind === "deleted") this.recentDeletes.set(c.path, now);
			else this.recentDeletes.delete(c.path);
			if (this.compiled.events.has(kind)) {
				out.push({ ...c, kind });
			}
		}

		for (const [path, at] of this.recentDeletes) {
			if (now - at > REDELETE_COALESCE_MS) this.recentDeletes.delete(path);
		}
		return out;
	}

	/** Render one notice line per change using the config template. */
	formatNotices(changes: Change[]): string[] {
		return changes.map((c) => formatNotice(this.notice, c));
	}
}

/** Render `[{start,end}]` as a compact `"40-42,88"` (single-line ranges collapse). */
export function formatRanges(ranges: readonly LineRange[] | undefined): string {
	if (!ranges || ranges.length === 0) return "";
	return ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(",");
}

export function formatNotice(template: string, change: Change): string {
	return template
		.replaceAll("{path}", change.path)
		.replaceAll("{kind}", change.kind)
		.replaceAll("{ranges}", formatRanges(change.lineRanges))
		.replaceAll("{added}", String(change.added ?? 0))
		.replaceAll("{removed}", String(change.removed ?? 0));
}
