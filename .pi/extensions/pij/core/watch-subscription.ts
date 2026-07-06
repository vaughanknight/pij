import picomatch from "picomatch";

import type { Change } from "../../file-watch-notify/store.js";
import type { WatchSubscription } from "./types.js";

export interface ParsedWatch {
	readonly dir: string;
	readonly patterns: readonly string[];
	readonly recursive: boolean;
}

function normalizePath(path: string): string {
	const trimmed = path.trim();
	return trimmed.replaceAll("\\", "/").replace(/\/+$/u, "");
}

function keyOf(w: Pick<WatchSubscription, "dir" | "patterns" | "recursive">): string {
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
): WatchSubscription[] {
	const out = [...existing];
	const seen = new Set(out.map(keyOf));
	for (const parsed of parseWatchGlobs(globs)) {
		const sub: WatchSubscription = {
			dir: parsed.dir,
			patterns: parsed.patterns,
			recursive: parsed.recursive,
			addedAt: nowIso,
		};
		const key = keyOf(sub);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(sub);
	}
	return out;
}

export function removeWatch(
	existing: readonly WatchSubscription[],
	globs?: readonly string[],
): WatchSubscription[] {
	if (globs === undefined || globs.length === 0) return [];
	const removeKeys = new Set(
		parseWatchGlobs(globs).map((w) =>
			keyOf({ dir: w.dir, patterns: w.patterns, recursive: w.recursive }),
		),
	);
	return existing.filter((w) => !removeKeys.has(keyOf(w)));
}

export function formatWatchNotice(notices: readonly string[] | readonly Change[]): string {
	if (notices.length === 0) return "[file-watch] no changes";
	const first = notices[0];
	if (typeof first === "string") return (notices as readonly string[]).join("\n");
	return (notices as readonly Change[]).map((c) => `[file-watch] ${c.path} ${c.kind}`).join("\n");
}
