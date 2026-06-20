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
	/** Apply Claude-style per-segment foreground colors. Off by default in the pure render API. */
	readonly claudeColors?: boolean;
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

// Claude Code-inspired palette. Foreground segments use the 39 (default-fg) reset
// so an optional Peacock background wrap survives underneath them.
const CLAUDE_PALETTE = {
	path: "#cbb994",
	dim: "#8a8173",
	branch: "#9ec07c",
	input: "#6cae9d",
	output: "#9ec07c",
	cache: "#7d8c8a",
	cost: "#d97757",
	model: "#d97757",
	ctxGood: "#9ec07c",
	ctxWarn: "#e0b54e",
	ctxHot: "#e06c75",
} as const;

function fg(hex: string, text: string): string {
	const { r, g, b } = parseHex(hex);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

const THINKING_WORDS = new Set(["thinking", "off", "minimal", "low", "medium", "high", "xhigh"]);

function contextColor(token: string): string {
	if (token.startsWith("?")) return CLAUDE_PALETTE.dim;
	const match = /^(\d+(?:\.\d+)?)%/.exec(token);
	const pct = match ? Number.parseFloat(match[1] ?? "0") : 0;
	if (pct > 90) return CLAUDE_PALETTE.ctxHot;
	if (pct > 70) return CLAUDE_PALETTE.ctxWarn;
	return CLAUDE_PALETTE.ctxGood;
}

function colorizeContextBar(token: string): string {
	const inner = token.slice(1, -1);
	const total = inner.length || 1;
	const filled = (inner.match(/▮/g) ?? []).length;
	const pct = (filled / total) * 100;
	const fillColor =
		pct > 90 ? CLAUDE_PALETTE.ctxHot : pct > 70 ? CLAUDE_PALETTE.ctxWarn : CLAUDE_PALETTE.ctxGood;
	let out = fg(CLAUDE_PALETTE.dim, "[");
	for (const ch of inner) {
		out += ch === "▮" ? fg(fillColor, ch) : fg(CLAUDE_PALETTE.dim, ch);
	}
	return out + fg(CLAUDE_PALETTE.dim, "]");
}

function colorizeStatsToken(token: string): string {
	if (token.length === 0) return token;
	if (token.startsWith("[") && (token.includes("▮") || token.includes("▯"))) {
		return colorizeContextBar(token);
	}
	const first = token[0] ?? "";
	if (first === "\u2191")
		return fg(CLAUDE_PALETTE.dim, "\u2191") + fg(CLAUDE_PALETTE.input, token.slice(1));
	if (first === "\u2193")
		return fg(CLAUDE_PALETTE.dim, "\u2193") + fg(CLAUDE_PALETTE.output, token.slice(1));
	if ((first === "R" || first === "W") && /\d/.test(token[1] ?? "")) {
		return fg(CLAUDE_PALETTE.dim, first) + fg(CLAUDE_PALETTE.cache, token.slice(1));
	}
	if (first === "$") return fg(CLAUDE_PALETTE.cost, token);
	if (token === "(sub)" || token === "(auto)") return fg(CLAUDE_PALETTE.dim, token);
	if (token.includes("/") && (token.includes("%") || token.startsWith("?"))) {
		return fg(contextColor(token), token);
	}
	if (/^\(.+\)$/.test(token)) return fg(CLAUDE_PALETTE.dim, token);
	if (token === "\u2022") return fg(CLAUDE_PALETTE.dim, token);
	if (THINKING_WORDS.has(token)) return fg(CLAUDE_PALETTE.dim, token);
	return fg(CLAUDE_PALETTE.model, token);
}

function colorizeByToken(line: string, color: (token: string) => string): string {
	return line
		.split(/(\s+)/)
		.map((part) => (part.length === 0 || /^\s+$/.test(part) ? part : color(part)))
		.join("");
}

function colorizePathToken(token: string): string {
	if (/^\(.+\)$/.test(token)) return fg(CLAUDE_PALETTE.branch, token);
	if (token === "\u2022") return fg(CLAUDE_PALETTE.dim, token);
	return fg(CLAUDE_PALETTE.path, token);
}

function colorizeFooterLines(lines: string[]): string[] {
	return lines.map((line, index) => {
		if (index === 0) return colorizeByToken(line, colorizePathToken);
		if (index === 1) return colorizeByToken(line, colorizeStatsToken);
		return fg(CLAUDE_PALETTE.dim, line);
	});
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

const CONTEXT_BAR_SEGMENTS = 8;

export function makeContextBar(percent: number | null | undefined): string {
	if (percent === null || percent === undefined) {
		return `[${"▯".repeat(CONTEXT_BAR_SEGMENTS)}]`;
	}
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.max(
		0,
		Math.min(CONTEXT_BAR_SEGMENTS, Math.round((clamped / 100) * CONTEXT_BAR_SEGMENTS)),
	);
	return `[${"▮".repeat(filled)}${"▯".repeat(CONTEXT_BAR_SEGMENTS - filled)}]`;
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
	const bar = makeContextBar(usage?.percent);
	return percent === "?"
		? `${bar} ?/${formatTokensCompact(window)}${auto}`
		: `${bar} ${percent}%/${formatTokensCompact(window)}${auto}`;
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
	let lines = buildPlainLines(snapshot, width);
	if (options.claudeColors) lines = colorizeFooterLines(lines);
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
		private readonly claudeColors: boolean = true,
	) {
		this.unsubscribeBranch = subscribeBranch?.(() => this.requestRender?.());
	}

	render(width: number): string[] {
		const snapshot = this.snapshot();
		const lines = renderPeacockFooter(snapshot, {
			width,
			colorHex: this.colorHex,
			claudeColors: this.claudeColors,
		});
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
