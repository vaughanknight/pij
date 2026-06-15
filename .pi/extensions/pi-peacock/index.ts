import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import {
	formatPeacockList,
	type PeacockSettings,
	PiPeacockStore,
	parsePeacockCommand,
	peacockHelpText,
} from "./store.js";
import {
	PeacockFooterComponent,
	type PeacockFooterSnapshot,
	type PeacockFooterStatus,
	type PeacockFooterTelemetry,
} from "./ui.js";

const STATUS_KEY = "pi-peacock";

interface FooterDataShape {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	getAvailableProviderCount(): number;
	onBranchChange(callback: () => void): () => void;
}

interface TuiShape {
	requestRender(): void;
}

interface PeacockStatusDetails {
	readonly enabled: boolean;
	readonly colorHex?: string;
	readonly presetId?: string;
	readonly surface: string;
	readonly lastRenderedStatusCount: number;
	readonly lineCount: number;
}

function modelLabel(ctx: ExtensionContext): {
	provider?: string;
	model?: string;
	modelReasoning?: boolean;
	modelContextWindow?: number;
} {
	const model = ctx.model;
	if (!model) return {};
	return {
		provider: model.provider,
		model: model.id,
		modelReasoning: model.reasoning,
		modelContextWindow: model.contextWindow,
	};
}

function usageTotals(ctx: ExtensionContext): {
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCacheReadTokens: number;
	totalCacheWriteTokens: number;
	totalCostUsd: number;
} {
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCacheReadTokens = 0;
	let totalCacheWriteTokens = 0;
	let totalCostUsd = 0;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		totalInputTokens += entry.message.usage.input;
		totalOutputTokens += entry.message.usage.output;
		totalCacheReadTokens += entry.message.usage.cacheRead;
		totalCacheWriteTokens += entry.message.usage.cacheWrite;
		totalCostUsd += entry.message.usage.cost.total;
	}
	return {
		totalInputTokens,
		totalOutputTokens,
		totalCacheReadTokens,
		totalCacheWriteTokens,
		totalCostUsd,
	};
}

function statusesFromFooterData(footerData: FooterDataShape): PeacockFooterStatus[] {
	return Array.from(footerData.getExtensionStatuses(), ([key, text]) => ({ key, text })).filter(
		(status) => status.text.trim().length > 0,
	);
}

export function createPeacockFooterSnapshot(
	ctx: ExtensionContext,
	footerData: FooterDataShape,
	thinking: string | undefined,
): PeacockFooterSnapshot {
	return {
		cwd: ctx.sessionManager.getCwd(),
		branch: footerData.getGitBranch(),
		sessionName: ctx.sessionManager.getSessionName(),
		...modelLabel(ctx),
		...usageTotals(ctx),
		thinking,
		availableProviderCount: footerData.getAvailableProviderCount(),
		usingSubscription: ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false,
		autoCompactEnabled: true,
		contextUsage: ctx.getContextUsage(),
		statuses: statusesFromFooterData(footerData).filter((status) => status.key !== STATUS_KEY),
	};
}

function formatStatus(settings: PeacockSettings, telemetry: PeacockFooterTelemetry): string {
	const details = statusDetails(settings, telemetry);
	if (!details.enabled) return "pi-peacock: off";
	return `pi-peacock: ${details.colorHex ?? "unknown"} on ${details.surface}; rendered statuses: ${details.lastRenderedStatusCount}`;
}

function statusDetails(
	settings: PeacockSettings,
	telemetry: PeacockFooterTelemetry,
): PeacockStatusDetails {
	return {
		enabled: settings.enabled,
		colorHex: settings.colorHex,
		presetId: settings.presetId,
		surface: settings.surface,
		lastRenderedStatusCount: telemetry.lastRenderedStatusCount,
		lineCount: telemetry.lineCount,
	};
}

function statusJson(settings: PeacockSettings, telemetry: PeacockFooterTelemetry): string {
	return JSON.stringify(statusDetails(settings, telemetry), null, 2);
}

export default function (pi: ExtensionAPI) {
	const store = new PiPeacockStore((customType, data) => pi.appendEntry(customType, data));
	let currentCtx: ExtensionContext | undefined;
	let currentThinking: string | undefined;
	let telemetry: PeacockFooterTelemetry = { lastRenderedStatusCount: 0, lineCount: 0 };

	function refreshStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}

	function installOrClearFooter(ctx: ExtensionContext): void {
		const settings = store.snapshot();
		const colorHex =
			settings.enabled && settings.surface === "footer" ? settings.colorHex : undefined;
		ctx.ui.setFooter(
			(tui: TUI, _theme, footerData): Component & { dispose?(): void } =>
				new PeacockFooterComponent(
					() => createPeacockFooterSnapshot(ctx, footerData, currentThinking),
					colorHex,
					(nextTelemetry) => {
						telemetry = nextTelemetry;
					},
					(callback) => footerData.onBranchChange(callback),
					() => (tui as TuiShape).requestRender(),
				),
		);
		refreshStatus(ctx);
	}

	function rehydrate(ctx: ExtensionContext): void {
		store.rehydrate(ctx.sessionManager.getEntries());
		installOrClearFooter(ctx);
	}

	async function runCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
		currentCtx = ctx;
		const parsed = parsePeacockCommand(args);
		if (!parsed.ok) {
			ctx.ui.notify(parsed.message, "error");
			refreshStatus(ctx);
			return;
		}
		switch (parsed.command.action) {
			case "help":
				ctx.ui.notify(peacockHelpText(), "info");
				refreshStatus(ctx);
				return;
			case "list":
				ctx.ui.notify(formatPeacockList(), "info");
				refreshStatus(ctx);
				return;
			case "status":
				ctx.ui.notify(
					parsed.command.json
						? statusJson(store.snapshot(), telemetry)
						: formatStatus(store.snapshot(), telemetry),
					"info",
				);
				refreshStatus(ctx);
				return;
			case "surface":
				ctx.ui.notify(store.setSurface(parsed.command.surface).message, "info");
				installOrClearFooter(ctx);
				return;
			case "apply": {
				const result = store.applyColor({
					colorHex: parsed.command.colorHex,
					presetId: parsed.command.presetId,
				});
				ctx.ui.notify(result.message, result.ok ? "info" : "error");
				installOrClearFooter(ctx);
				return;
			}
			case "off":
				ctx.ui.notify(store.off().message, "info");
				installOrClearFooter(ctx);
				return;
			case "reset":
				ctx.ui.notify(store.reset().message, "info");
				installOrClearFooter(ctx);
				return;
		}
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;
		currentThinking = pi.getThinkingLevel();
		rehydrate(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setFooter(undefined);
		ctx.ui.setStatus(STATUS_KEY, undefined);
		currentCtx = undefined;
	});

	pi.on("model_select", async (_event, ctx) => {
		currentCtx = ctx;
		installOrClearFooter(ctx);
	});

	pi.on("thinking_level_select", async (event, ctx) => {
		currentCtx = ctx;
		currentThinking = event.level;
		installOrClearFooter(ctx);
	});

	pi.registerCommand("peacock", {
		description: "Color Pi's bottom footer/status area with VS Code Peacock presets",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase();
			return ["list", "status", "status --json", "off", "reset", "surface footer", "reactBlue"]
				.filter((value) => value.toLowerCase().startsWith(normalized))
				.map((value) => ({ value, label: value }));
		},
		handler: runCommand,
	});

	pi.registerCommand("pi-peacock", {
		description: "Alias for /peacock",
		handler: runCommand,
	});

	pi.on("turn_end", async (_event, ctx) => {
		currentCtx = ctx;
		refreshStatus(ctx);
	});

	pi.events.on("session-sql:changed", () => {
		if (currentCtx) refreshStatus(currentCtx);
	});
}
