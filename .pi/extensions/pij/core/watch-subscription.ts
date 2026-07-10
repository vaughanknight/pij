import picomatch from "picomatch";

import { type Change, formatRanges } from "../../file-watch-notify/store.js";
import type { WatchMode, WatchSubscription } from "./types.js";

export interface ParsedWatch {
	readonly dir: string;
	readonly patterns: readonly string[];
	readonly recursive: boolean;
}

/** Default peer-watch collate window; the pi-side core keeps its own 30ms default. */
export const DEFAULT_PEER_WATCH_DEBOUNCE_MS = 750;

function normalizePath(path: string): string {
	const trimmed = path.trim();
	return trimmed.replaceAll("\\", "/").replace(/\/+$/u, "");
}

/** Dedup key INCLUDING mode — two subs on one glob differing only by mode are
 *  distinct subscriptions (AC-08). Absent mode collapses to `notify`. */
function keyOf(w: Pick<WatchSubscription, "dir" | "patterns" | "recursive" | "mode">): string {
	return `${globKeyOf(w)}\0${w.mode ?? "notify"}`;
}

/** Mode-agnostic key (dir/patterns/recursive) — `unwatch <glob>` drops every mode. */
function globKeyOf(w: Pick<WatchSubscription, "dir" | "patterns" | "recursive">): string {
	return `${w.dir}\0${w.recursive === true ? "1" : "0"}\0${[...w.patterns].sort().join("\0")}`;
}

export function parseWatchGlobs(globs: readonly string[]): ParsedWatch[] {
	const grouped = new Map<string, { dir: string; patterns: Set<string>; recursive: boolean }>();
	for (const raw of globs) {
		const input = normalizePath(raw);
		if (input.length === 0) continue;
		const scanned = picomatch.scan(input);
		const dir = normalizePath(scanned.base || ".");
		const pattern = scanned.isGlob && scanned.glob ? scanned.glob : "**/*";
		const recursive = pattern.includes("**");
		const key = `${dir}\0${recursive ? "1" : "0"}`;
		const entry = grouped.get(key) ?? { dir, patterns: new Set<string>(), recursive };
		entry.patterns.add(pattern);
		grouped.set(key, entry);
	}
	return [...grouped.values()].map((entry) => ({
		dir: entry.dir,
		patterns: [...entry.patterns].sort(),
		recursive: entry.recursive,
	}));
}

export function addWatch(
	existing: readonly WatchSubscription[],
	globs: readonly string[],
	nowIso: string = new Date().toISOString(),
	mode: WatchMode = "notify",
	debounceMs?: number,
): WatchSubscription[] {
	const out = [...existing];
	for (const parsed of parseWatchGlobs(globs)) {
		const sub: WatchSubscription = {
			dir: parsed.dir,
			patterns: parsed.patterns,
			recursive: parsed.recursive,
			addedAt: nowIso,
			...(mode === "diff" ? { mode } : {}),
			...(debounceMs !== undefined ? { debounceMs } : {}),
		};
		const key = keyOf(sub);
		const index = out.findIndex((candidate) => keyOf(candidate) === key);
		if (index === -1) {
			out.push(sub);
			continue;
		}
		out[index] = { ...sub, addedAt: out[index]?.addedAt ?? nowIso };
	}
	return out;
}

export function removeWatch(
	existing: readonly WatchSubscription[],
	globs?: readonly string[],
): WatchSubscription[] {
	if (globs === undefined || globs.length === 0) return [];
	// Match on the glob (dir/patterns/recursive) only — `unwatch <glob>` drops
	// every mode registered for that glob.
	const removeKeys = new Set(
		parseWatchGlobs(globs).map((w) =>
			globKeyOf({ dir: w.dir, patterns: w.patterns, recursive: w.recursive }),
		),
	);
	return existing.filter((w) => !removeKeys.has(globKeyOf(w)));
}

export function formatWatchNotice(notices: readonly string[] | readonly Change[]): string {
	if (notices.length === 0) return "[file-watch] no changes";
	const first = notices[0];
	if (typeof first === "string") return (notices as readonly string[]).join("\n");
	return (notices as readonly Change[]).map((c) => `[file-watch] ${c.path} ${c.kind}`).join("\n");
}

/** A unified diff written to a per-path pointer file. */
export interface PointerWrite {
	/** Sanitized flat filename, `src/store.ts` → `src__store.ts.diff`. */
	readonly fileName: string;
	readonly content: string;
}

export interface WatchNoticeRender {
	/** The single delivered message body (all changes for this wake). */
	readonly body: string;
	/** Diff pointer files to write before delivery (overwrite-in-place). */
	readonly pointers: readonly PointerWrite[];
}

/** `src/store.ts` → `src__store.ts.diff` (one flat file per watched path). */
export function pointerFileName(path: string): string {
	return `${path.replaceAll("/", "__")}.diff`;
}

/**
 * Render one wake's `Change[]` into a single notice body per `mode` + verb
 * (WS-001, findings 02/03/05):
 *  - `notify`: `[file-watch] <path> <kind> (+A/-R) lines <ranges>` (ranges/stat
 *    only when a textual delta was computed).
 *  - `diff`: every computed unified diff becomes a `— diff: <path>` pointer
 *    line, with the diff returned in `pointers` for the caller to persist.
 *  - `deleted`: always a plain notice, no diff.
 *  - over-cap/binary (no `diff`/`lineRanges`): plain notice.
 * Pure — the impure pointer write + gitignore filter live in the daemon.
 */
export function renderWatchNotice(
	changes: readonly Change[],
	mode: WatchMode,
	pointerDir: string,
): WatchNoticeRender {
	const lines: string[] = [];
	const pointers: PointerWrite[] = [];
	for (const c of changes) {
		const head = `[file-watch] ${c.path} ${c.kind}${statSummary(c)}`;
		if (c.kind === "deleted") {
			lines.push(`[file-watch] ${c.path} deleted`);
			continue;
		}
		if (mode === "notify") {
			const ranges = formatRanges(c.lineRanges);
			lines.push(ranges ? `${head} lines ${ranges}` : head);
			continue;
		}
		// diff mode
		if (!c.diff) {
			lines.push(head); // over-cap/binary → plain notice
			continue;
		}
		const fileName = pointerFileName(c.path);
		pointers.push({ fileName, content: c.diff });
		lines.push(`${head} — diff: ${pointerDir}/${fileName}`);
	}
	return { body: lines.join("\n"), pointers };
}

function statSummary(c: Change): string {
	return c.added !== undefined && c.removed !== undefined ? ` (+${c.added}/-${c.removed})` : "";
}
