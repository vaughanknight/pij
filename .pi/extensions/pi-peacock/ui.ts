import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface PeacockContextUsage {
	readonly tokens: number | null;
	readonly contextWindow: number;
	readonly percent: number | null;
}

export interface PeacockFooterStatus {
	readonly key: string;
	readonly text: string;
}

export interface PeacockFooterSnapshot {
	readonly cwd: string;
	readonly branch?: string | null;
	readonly sessionName?: string;
	readonly provider?: string;
	readonly model?: string;
	readonly modelReasoning?: boolean;
	readonly modelContextWindow?: number;
	readonly thinking?: string;
	readonly availableProviderCount?: number;
	readonly usingSubscription?: boolean;
	readonly totalInputTokens?: number;
	readonly totalOutputTokens?: number;
	readonly totalCacheReadTokens?: number;
	readonly totalCacheWriteTokens?: number;
	readonly totalCostUsd?: number;
	readonly autoCompactEnabled?: boolean;
	readonly contextUsage?: PeacockContextUsage;
	readonly statuses: readonly PeacockFooterStatus[];
}

export interface PeacockFooterRenderOptions {
	readonly width: number;
	readonly colorHex?: string;
}

export interface PeacockFooterTelemetry {
	readonly lastRenderedStatusCount: number;
	readonly lineCount: number;
}

function stripAnsiSequences(value: string): string {
	let output = "";
	for (let index = 0; index < value.length; index++) {
		const code = value.codePointAt(index) ?? 0;
		if (code === 27 && value[index + 1] === "[") {
			index += 2;
			while (index < value.length) {
				const sequenceCode = value.codePointAt(index) ?? 0;
				if (sequenceCode >= 64 && sequenceCode <= 126) break;
				index++;
			}
			continue;
		}
		output += value[index] ?? "";
	}
	return output;
}

function stripControlCharacters(value: string): string {
	return Array.from(value)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code >= 32 && code !== 127;
		})
		.join("");
}

export function stripAnsiForTest(value: string): string {
	return stripAnsiSequences(value);
}

export function visibleWidthWithoutAnsi(value: string): number {
	return visibleWidth(stripAnsiForTest(value));
}

export function sanitizeFooterText(value: string | undefined | null): string {
	return stripAnsiSequences(String(value ?? ""))
		.replaceAll(/[\r\n\t]+/g, " ")
		.split(" ")
		.map(stripControlCharacters)
		.join(" ")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function parseHex(hex: string): { r: number; g: number; b: number } {
	const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
	return {
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
	};
}

function ansiForColor(hex: string): { bg: string; reset: string } {
	const { r, g, b } = parseHex(hex);
	return { bg: `\x1b[48;2;${r};${g};${b}m`, reset: "\x1b[0m" };
}

export function formatTokensCompact(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens < 0) return "?";
	if (tokens < 1000) return tokens.toString();
	if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`;
	if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
	if (tokens < 10_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	return `${Math.round(tokens / 1_000_000)}M`;
}

export function formatTokens(tokens: number): string {
	return `${formatTokensCompact(tokens)} tokens`;
}

export function formatContextUsage(usage: PeacockContextUsage | undefined): string | undefined {
	if (!usage) return undefined;
	const percent = usage.percent === null ? "?" : `${usage.percent.toFixed(1)}%`;
	return `${percent}/${formatTokens(usage.contextWindow)}`;
}

function formatBuiltInContextUsage(
	usage: PeacockContextUsage | undefined,
	contextWindow: number | undefined,
	autoCompactEnabled: boolean,
): string {
	const window = usage?.contextWindow ?? contextWindow ?? 0;
	const percent =
		usage?.percent === null || usage?.percent === undefined ? "?" : usage.percent.toFixed(1);
	const auto = autoCompactEnabled ? " (auto)" : "";
	return percent === "?"
		? `?/${formatTokensCompact(window)}${auto}`
		: `${percent}%/${formatTokensCompact(window)}${auto}`;
}

function footerPath(snapshot: PeacockFooterSnapshot): string {
	let pwd = sanitizeFooterText(snapshot.cwd);
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
	if (snapshot.branch) pwd = `${pwd} (${sanitizeFooterText(snapshot.branch)})`;
	if (snapshot.sessionName) pwd = `${pwd} • ${sanitizeFooterText(snapshot.sessionName)}`;
	return pwd;
}

function statsLeft(snapshot: PeacockFooterSnapshot): string {
	const parts: string[] = [];
	if (snapshot.totalInputTokens) parts.push(`↑${formatTokensCompact(snapshot.totalInputTokens)}`);
	if (snapshot.totalOutputTokens) parts.push(`↓${formatTokensCompact(snapshot.totalOutputTokens)}`);
	if (snapshot.totalCacheReadTokens)
		parts.push(`R${formatTokensCompact(snapshot.totalCacheReadTokens)}`);
	if (snapshot.totalCacheWriteTokens)
		parts.push(`W${formatTokensCompact(snapshot.totalCacheWriteTokens)}`);
	if (snapshot.totalCostUsd || snapshot.usingSubscription) {
		parts.push(
			`$${(snapshot.totalCostUsd ?? 0).toFixed(3)}${snapshot.usingSubscription ? " (sub)" : ""}`,
		);
	}
	parts.push(
		formatBuiltInContextUsage(
			snapshot.contextUsage,
			snapshot.modelContextWindow,
			snapshot.autoCompactEnabled ?? true,
		),
	);
	return parts.join(" ");
}

function modelRight(snapshot: PeacockFooterSnapshot): string {
	const modelName = sanitizeFooterText(snapshot.model) || "no-model";
	let withoutProvider = modelName;
	if (snapshot.modelReasoning) {
		const thinking = sanitizeFooterText(snapshot.thinking) || "off";
		withoutProvider =
			thinking === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinking}`;
	}
	const provider = sanitizeFooterText(snapshot.provider);
	if ((snapshot.availableProviderCount ?? 0) > 1 && provider.length > 0) {
		return `(${provider}) ${withoutProvider}`;
	}
	return withoutProvider;
}

function padToWidth(line: string, width: number): string {
	const truncated = truncateToWidth(line, width);
	const pad = Math.max(0, width - visibleWidth(truncated));
	return `${truncated}${" ".repeat(pad)}`;
}

function builtInStatsLine(snapshot: PeacockFooterSnapshot, width: number): string {
	let left = statsLeft(snapshot);
	let leftWidth = visibleWidth(left);
	if (leftWidth > width) {
		left = truncateToWidth(left, width, "...");
		leftWidth = visibleWidth(left);
	}
	let right = modelRight(snapshot);
	const minPadding = 2;
	if (leftWidth + minPadding + visibleWidth(right) > width && right.startsWith("(")) {
		right = right.replace(/^\([^)]*\)\s*/, "");
	}
	const rightWidth = visibleWidth(right);
	if (leftWidth + minPadding + rightWidth <= width) {
		return `${left}${" ".repeat(width - leftWidth - rightWidth)}${right}`;
	}
	const availableForRight = width - leftWidth - minPadding;
	if (availableForRight > 0) {
		const truncatedRight = truncateToWidth(right, availableForRight, "");
		return `${left}${" ".repeat(Math.max(0, width - leftWidth - visibleWidth(truncatedRight)))}${truncatedRight}`;
	}
	return left;
}

function statusLine(statuses: readonly PeacockFooterStatus[], width: number): string | undefined {
	const statusText = statuses
		.filter((status: PeacockFooterStatus) => sanitizeFooterText(status.text).length > 0)
		.slice()
		.sort((a: PeacockFooterStatus, b: PeacockFooterStatus) =>
			sanitizeFooterText(a.key).localeCompare(sanitizeFooterText(b.key)),
		)
		.map((status: PeacockFooterStatus) => sanitizeFooterText(status.text))
		.join(" ");
	if (statusText.length === 0) return undefined;
	return truncateToWidth(statusText, width, "...");
}

function buildPlainLines(snapshot: PeacockFooterSnapshot, width: number): string[] {
	const lines = [
		truncateToWidth(footerPath(snapshot), width, "..."),
		builtInStatsLine(snapshot, width),
	];
	const statuses = statusLine(snapshot.statuses, width);
	if (statuses) lines.push(statuses);
	return lines.map((line) => padToWidth(line, width));
}

export function renderPeacockFooter(
	snapshot: PeacockFooterSnapshot,
	options: PeacockFooterRenderOptions,
): string[] {
	const width = Math.max(1, Math.floor(options.width));
	const lines = buildPlainLines(snapshot, width);
	if (!options.colorHex) return lines;
	const { bg, reset } = ansiForColor(options.colorHex);
	return lines.map((line) => `${bg}${line}${reset}`);
}

export class PeacockFooterComponent implements Component {
	private unsubscribeBranch: (() => void) | undefined;

	constructor(
		private readonly snapshot: () => PeacockFooterSnapshot,
		private readonly colorHex: string | undefined,
		private readonly onTelemetry?: (telemetry: PeacockFooterTelemetry) => void,
		subscribeBranch?: (callback: () => void) => () => void,
		private readonly requestRender?: () => void,
	) {
		this.unsubscribeBranch = subscribeBranch?.(() => this.requestRender?.());
	}

	render(width: number): string[] {
		const snapshot = this.snapshot();
		const lines = renderPeacockFooter(snapshot, { width, colorHex: this.colorHex });
		this.onTelemetry?.({
			lastRenderedStatusCount: snapshot.statuses.filter(
				(status) => sanitizeFooterText(status.text).length > 0,
			).length,
			lineCount: lines.length,
		});
		return lines;
	}

	invalidate(): void {}

	dispose(): void {
		this.unsubscribeBranch?.();
		this.unsubscribeBranch = undefined;
	}
}
