import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
	SessionId,
	WatchdogCapturePolicy,
	WatchdogSidecar,
	WatchdogWatcher,
} from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

function isCapturePolicy(value: unknown): value is WatchdogCapturePolicy {
	if (typeof value !== "object" || value === null) return false;
	const policy = value as Record<string, unknown>;
	return (
		(policy.mode === undefined ||
			policy.mode === "anomaly" ||
			policy.mode === "always" ||
			policy.mode === "never") &&
		(policy.maxLines === undefined || typeof policy.maxLines === "number") &&
		(policy.maxBytes === undefined || typeof policy.maxBytes === "number")
	);
}

function isWatcher(value: unknown): value is WatchdogWatcher {
	if (typeof value !== "object" || value === null) return false;
	const watcher = value as Record<string, unknown>;
	return (
		typeof watcher.watcherId === "string" &&
		typeof watcher.addedAt === "string" &&
		(watcher.capture === undefined || isCapturePolicy(watcher.capture))
	);
}

function parseSidecar(value: unknown): WatchdogSidecar | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const sidecar = value as Record<string, unknown>;
	if (sidecar.enabled !== undefined && typeof sidecar.enabled !== "boolean") return undefined;
	if (sidecar.intervalMs !== undefined && typeof sidecar.intervalMs !== "number") return undefined;
	if (
		sidecar.pausedBy !== undefined &&
		sidecar.pausedBy !== "self" &&
		sidecar.pausedBy !== "compact" &&
		sidecar.pausedBy !== "exempt"
	) {
		return undefined;
	}
	if (sidecar.pausedAtMs !== undefined && typeof sidecar.pausedAtMs !== "number") return undefined;
	if (sidecar.watchers !== undefined) {
		if (!Array.isArray(sidecar.watchers) || !sidecar.watchers.every(isWatcher)) return undefined;
	}
	return {
		...(typeof sidecar.enabled === "boolean" ? { enabled: sidecar.enabled } : {}),
		...(typeof sidecar.intervalMs === "number" ? { intervalMs: sidecar.intervalMs } : {}),
		...(sidecar.pausedBy === "self" ||
		sidecar.pausedBy === "compact" ||
		sidecar.pausedBy === "exempt"
			? { pausedBy: sidecar.pausedBy }
			: {}),
		...(typeof sidecar.pausedAtMs === "number" ? { pausedAtMs: sidecar.pausedAtMs } : {}),
		...(Array.isArray(sidecar.watchers) ? { watchers: sidecar.watchers.filter(isWatcher) } : {}),
	};
}

/** Filesystem adapter for `~/.pij/<id>/watchdog.json` plus capture pointers. */
export class FsWatchdogStore {
	constructor(private readonly pijHome: string) {}

	pathFor(id: SessionId): string {
		return join(this.pijHome, id, "watchdog.json");
	}

	read(id: SessionId): WatchdogSidecar | undefined {
		try {
			return parseSidecar(JSON.parse(readFileSync(this.pathFor(id), "utf8")) as unknown);
		} catch {
			return undefined;
		}
	}

	write(id: SessionId, sidecar: WatchdogSidecar): void {
		writeJsonAtomic(this.pathFor(id), sidecar);
	}

	revision(id: SessionId): number | null {
		try {
			return statSync(this.pathFor(id)).mtimeMs;
		} catch {
			return null;
		}
	}

	writeCapture(watcherId: SessionId, targetId: SessionId, nowMs: number, content: string): string {
		const path = join(
			this.pijHome,
			watcherId,
			"watchdog-captures",
			`${Math.floor(nowMs)}-${targetId}.txt`,
		);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
		return path;
	}
}
