// file-watch-notify — pi wiring (Pattern P10: one session_start handler).
//
// The ONLY pi-importing files are this one and inject.ts. On session_start
// (every reason) we load .pi/file-watch.json, start a FolderWatcher per
// configured watch, and on each change inject an in-session notice — steered
// if the model is busy, immediate if idle — with no tool call. Reload-safe:
// prior watchers are disposed before new ones start.
//
// Runtime control surface (amendment, T010-T012): a `/file-watch-notify`
// command arms/lists/stops watches live, with no reload. Both config-booted and
// runtime-armed watches live in ONE `watches` map keyed by resolved abs dir, so
// they share dedupe, `stop`, and reload-disposal. The parsed config is held at
// module/closure scope (`loadedConfig`) so runtime watches inherit its
// debounce/ignore/notice (falling back to defaults when no config exists).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { COMMAND_USAGE, parseCommand } from "./commands.js";
import { deliverNotices, makePiInjectPort } from "./inject.js";
import {
	type ChangeKind,
	type Config,
	compileWatch,
	DEFAULT_DEBOUNCE_MS,
	DEFAULT_IGNORE,
	DEFAULT_NOTICE,
	parseConfig,
	type WatchConfig,
	WatchReconciler,
} from "./store.js";
import { FolderWatcher, nodeWatchDeps, type WatchDeps } from "./watcher.js";

const CONFIG_REL = ".pi/file-watch.json";

/** Optional injection seam for the lightweight wiring test (pi calls with 1 arg). */
export interface WiringDeps {
	cwd?: string;
	makeWatchDeps?: () => WatchDeps;
}

/** A live watcher, keyed in `watches` by its resolved absolute dir. */
interface ActiveWatch {
	dispose: () => void;
	source: "config" | "runtime";
	patterns: string[];
}

export default function (pi: ExtensionAPI, wiring: WiringDeps = {}) {
	const base = wiring.cwd ?? process.cwd();
	const makeWatchDeps = wiring.makeWatchDeps ?? nodeWatchDeps;
	let currentCtx: ExtensionContext | undefined;
	// Config + runtime watches share one map keyed by resolved abs dir (enables
	// per-dir stop, dedupe-on-arm, and reload disposal in one place).
	const watches = new Map<string, ActiveWatch>();
	// The parsed config, lifted to closure scope so the runtime command handler
	// can inherit debounce/ignore/notice. null = no/invalid config (use defaults).
	let loadedConfig: Config | null = null;
	// Human-readable status, refreshed each session_start; surfaced by the
	// /file-watch-notify command (and the deterministic smoke).
	let statusLine = "file-watch: not configured";

	const injectPort = makePiInjectPort(pi, () => currentCtx);

	function disposeAll(): void {
		for (const w of watches.values()) w.dispose();
		watches.clear();
	}

	/**
	 * Compile + arm a FolderWatcher for one dir, registering it in `watches`.
	 * Fully try-guarded: a bad glob or unreadable dir returns {ok:false} rather
	 * than throwing (so neither session_start nor the command handler can crash).
	 * Arming a dir already watched disposes the prior watcher first (dedupe).
	 */
	async function startWatch(
		rawDir: string,
		patterns: string[],
		source: "config" | "runtime",
		extra?: { events?: ChangeKind[]; recursive?: boolean },
	): Promise<{ ok: true } | { ok: false; reason: string }> {
		const dir = resolve(base, rawDir);
		const debounceMs = loadedConfig?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		const ignore = loadedConfig?.ignore ?? DEFAULT_IGNORE;
		const notice = loadedConfig?.notice ?? DEFAULT_NOTICE;

		const existing = watches.get(dir);
		if (existing) {
			existing.dispose();
			watches.delete(dir);
		}

		const watchCfg: WatchConfig = {
			dir,
			patterns,
			events: extra?.events,
			recursive: extra?.recursive,
		};
		try {
			const compiled = compileWatch(watchCfg, ignore);
			const reconciler = new WatchReconciler(compiled, notice);
			const folder = new FolderWatcher(
				compiled,
				reconciler,
				debounceMs,
				(notices) => deliverNotices(injectPort, notices),
				makeWatchDeps(),
			);
			await folder.start();
			watches.set(dir, { dispose: () => folder.dispose(), source, patterns });
			return { ok: true };
		} catch (e) {
			return { ok: false, reason: String(e) };
		}
	}

	/** Recompute the status line + status bar from the live watch count (runtime ops). */
	function refreshStatus(): void {
		const n = watches.size;
		statusLine =
			n === 0
				? "file-watch: not watching any folders"
				: `file-watch: watching ${n} folder${n === 1 ? "" : "s"}`;
		currentCtx?.ui.setStatus(
			"file-watch-notify",
			n === 0 ? undefined : `watching ${n} folder${n === 1 ? "" : "s"}`,
		);
	}

	// Pattern P10: ONE handler for startup/reload/new/resume/fork. Idempotent —
	// reload disposes prior watchers (config AND runtime) and refreshes the live ctx.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		currentCtx = ctx;
		disposeAll();
		loadedConfig = null;

		const configPath = resolve(base, CONFIG_REL);

		let rawText: string;
		try {
			rawText = readFileSync(configPath, "utf8");
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				// No config => feature simply not enabled. Stay silent (don't nag).
				statusLine = "file-watch: not configured";
			} else {
				statusLine = `file-watch: cannot read config (${code ?? String(e)})`;
				ctx.ui.notify(`file-watch: cannot read ${CONFIG_REL} (${code ?? String(e)})`, "warning");
			}
			ctx.ui.setStatus("file-watch-notify", undefined);
			return;
		}

		let raw: unknown;
		try {
			raw = JSON.parse(rawText);
		} catch (e) {
			statusLine = "file-watch: invalid (not JSON)";
			ctx.ui.setStatus("file-watch-notify", undefined);
			ctx.ui.notify(`file-watch: ${CONFIG_REL} is not valid JSON (${String(e)})`, "warning");
			return;
		}

		const parsed = parseConfig(raw);
		if (!parsed.ok) {
			statusLine = `file-watch: invalid (${parsed.reason})`;
			ctx.ui.setStatus("file-watch-notify", undefined);
			ctx.ui.notify(`file-watch: invalid config — ${parsed.reason}`, "warning");
			return;
		}
		const { config } = parsed;
		loadedConfig = config;

		let started = 0;
		for (const watch of config.watches) {
			const r = await startWatch(watch.dir, watch.patterns, "config", {
				events: watch.events,
				recursive: watch.recursive,
			});
			if (r.ok) started++;
			else ctx.ui.notify(`file-watch: cannot watch "${watch.dir}" (${r.reason})`, "warning");
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

	// Runtime control surface — no tool call. `status`/no-args shows the status
	// line + usage; `watch`/`list`/`stop` arm/list/dispose watches live (T010-T012).
	pi.registerCommand("file-watch-notify", {
		description: "file-watch-notify — watch/list/stop folder watches live (no args = status)",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const cmd = parseCommand(args);
			switch (cmd.kind) {
				case "status":
					ctx.ui.notify(`${statusLine}\n${COMMAND_USAGE}`, "info");
					return;
				case "list": {
					if (watches.size === 0) {
						ctx.ui.notify("file-watch: no active watches", "info");
						return;
					}
					const lines = [...watches.entries()].map(
						([dir, w]) => `watching: ${dir} [${w.patterns.join(", ")}] (${w.source})`,
					);
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}
				case "watch": {
					const r = await startWatch(cmd.dir, cmd.patterns, "runtime");
					if (r.ok) {
						refreshStatus();
						ctx.ui.notify(
							`file-watch: now watching ${resolve(base, cmd.dir)} [${cmd.patterns.join(", ")}]`,
							"info",
						);
					} else {
						ctx.ui.notify(`file-watch: cannot watch "${cmd.dir}" — ${r.reason}`, "warning");
					}
					return;
				}
				case "stop": {
					const resolved = resolve(base, cmd.dir);
					const w = watches.get(resolved);
					if (!w) {
						ctx.ui.notify(`file-watch: not watching ${resolved}`, "warning");
						return;
					}
					w.dispose();
					watches.delete(resolved);
					refreshStatus();
					ctx.ui.notify(`file-watch: stopped watching ${resolved}`, "info");
					return;
				}
				case "error":
					ctx.ui.notify(`file-watch: ${cmd.reason}`, "warning");
					return;
			}
		},
	});
}
