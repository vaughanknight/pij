// FileWatchNotify core — pi-free pure logic (Pattern P2).
//
// Imports nothing from @earendil-works/*. The ONLY change-classification
// mechanism is reconciling a {mtimeMs,size} snapshot per debounced wake —
// never `fs.watch` event types (research Key Finding 01: the directory-watch
// trap). The watcher adapter (watcher.ts) supplies snapshots; this module
// decides what changed and how to phrase it.

import picomatch from "picomatch";

// ─── domain types ──────────────────────────────────────────────────────────
export type ChangeKind = "created" | "modified" | "deleted";

export interface FileMeta {
	readonly mtimeMs: number;
	readonly size: number;
}

/** path (relative to a watch dir) → file metadata. */
export type Snapshot = Map<string, FileMeta>;

export interface Change {
	readonly path: string;
	readonly kind: ChangeKind;
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
const ALL_KINDS: readonly ChangeKind[] = ["created", "modified", "deleted"];

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
			changes.push({ path, kind: "created" });
		} else if (before.mtimeMs !== meta.mtimeMs || before.size !== meta.size) {
			changes.push({ path, kind: "modified" });
		}
	}
	for (const path of prev.keys()) {
		if (!next.has(path)) changes.push({ path, kind: "deleted" });
	}
	return changes;
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
			if (this.compiled.events.has(kind)) out.push({ path: c.path, kind });
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

export function formatNotice(template: string, change: Change): string {
	return template.replaceAll("{path}", change.path).replaceAll("{kind}", change.kind);
}
