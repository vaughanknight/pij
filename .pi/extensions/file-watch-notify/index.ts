// file-watch-notify — pi wiring (Pattern P10: one session_start handler).
//
// The ONLY pi-importing files are this one and inject.ts. On session_start
// (every reason) we load .pi/file-watch.json, start a FolderWatcher per
// configured watch, and on each change inject an in-session notice — steered
// if the model is busy, immediate if idle — with no tool call. Reload-safe:
// prior watchers are disposed before new ones start.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { deliverNotices, makePiInjectPort } from "./inject.js";
import { compileWatch, parseConfig, WatchReconciler } from "./store.js";
import { FolderWatcher, nodeWatchDeps, type WatchDeps } from "./watcher.js";

const CONFIG_REL = ".pi/file-watch.json";

/** Optional injection seam for the lightweight wiring test (pi calls with 1 arg). */
export interface WiringDeps {
	cwd?: string;
	makeWatchDeps?: () => WatchDeps;
}

export default function (pi: ExtensionAPI, wiring: WiringDeps = {}) {
	const base = wiring.cwd ?? process.cwd();
	const makeWatchDeps = wiring.makeWatchDeps ?? nodeWatchDeps;
	let currentCtx: ExtensionContext | undefined;
	let disposers: Array<() => void> = [];
	// Human-readable status, refreshed each session_start; surfaced by the
	// read-only /file-watch-notify command (and the deterministic smoke).
	let statusLine = "file-watch: not configured";

	const injectPort = makePiInjectPort(pi, () => currentCtx);

	function disposeAll(): void {
		for (const d of disposers) d();
		disposers = [];
	}

	// Pattern P10: ONE handler for startup/reload/new/resume/fork. Idempotent —
	// reload disposes prior watchers and refreshes the live ctx.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		currentCtx = ctx;
		disposeAll();

		const configPath = resolve(base, CONFIG_REL);

		let rawText: string;
		try {
			rawText = readFileSync(configPath, "utf8");
		} catch {
			// No config => feature simply not enabled. Stay silent (don't nag).
			statusLine = "file-watch: not configured";
			ctx.ui.setStatus("file-watch-notify", undefined);
			return;
		}

		let raw: unknown;
		try {
			raw = JSON.parse(rawText);
		} catch (e) {
			statusLine = "file-watch: invalid (not JSON)";
			ctx.ui.notify(`file-watch: ${CONFIG_REL} is not valid JSON (${String(e)})`, "warning");
			return;
		}

		const parsed = parseConfig(raw);
		if (!parsed.ok) {
			statusLine = `file-watch: invalid (${parsed.reason})`;
			ctx.ui.notify(`file-watch: invalid config — ${parsed.reason}`, "warning");
			return;
		}
		const { config } = parsed;

		let started = 0;
		for (const watch of config.watches) {
			const dir = resolve(base, watch.dir);
			const compiled = compileWatch({ ...watch, dir }, config.ignore);
			const reconciler = new WatchReconciler(compiled, config.notice);
			const folder = new FolderWatcher(
				compiled,
				reconciler,
				config.debounceMs,
				(notices) => deliverNotices(injectPort, notices),
				makeWatchDeps(),
			);
			try {
				await folder.start();
				disposers.push(() => folder.dispose());
				started++;
			} catch (e) {
				ctx.ui.notify(`file-watch: cannot watch "${watch.dir}" (${String(e)})`, "warning");
			}
		}

		statusLine =
			started === 0
				? "file-watch: configured but 0 folders started"
				: `file-watch: watching ${started} folder${started === 1 ? "" : "s"}`;
		ctx.ui.setStatus(
			"file-watch-notify",
			started === 0 ? undefined : `watching ${started} folder${started === 1 ? "" : "s"}`,
		);
	});

	// Read-only status command — no tool call, no side effects. Lets a human (and
	// the deterministic smoke) confirm the watcher's state.
	pi.registerCommand("file-watch-notify", {
		description: "file-watch-notify — show whether folders are being watched",
		handler: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
			ctx.ui.notify(statusLine, "info");
		},
	});
}
