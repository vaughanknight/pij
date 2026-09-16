import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { SessionId, WatchSidecar, WatchSubscription } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

function isWatchSubscription(v: unknown): v is WatchSubscription {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.dir === "string" &&
		Array.isArray(obj.patterns) &&
		obj.patterns.every((p) => typeof p === "string") &&
		(obj.recursive === undefined || typeof obj.recursive === "boolean") &&
		(obj.mode === undefined || obj.mode === "notify" || obj.mode === "diff") &&
		(obj.debounceMs === undefined || typeof obj.debounceMs === "number") &&
		typeof obj.addedAt === "string"
	);
}

export class FsWatchStore {
	constructor(private readonly pijHome: string) {}

	private dirFor(id: SessionId): string {
		return join(this.pijHome, id);
	}

	pathFor(id: SessionId): string {
		return join(this.dirFor(id), "watches.json");
	}

	readWatches(id: SessionId): WatchSubscription[] {
		try {
			const parsed = JSON.parse(readFileSync(this.pathFor(id), "utf8")) as WatchSidecar;
			return Array.isArray(parsed.watches) ? parsed.watches.filter(isWatchSubscription) : [];
		} catch {
			return [];
		}
	}

	writeWatches(id: SessionId, watches: readonly WatchSubscription[]): void {
		writeJsonAtomic(this.pathFor(id), { watches });
	}

	revision(id: SessionId): number | null {
		try {
			return statSync(this.pathFor(id)).mtimeMs;
		} catch {
			return null;
		}
	}
}
