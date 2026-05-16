// Minih Workbench store — pi-free product contracts and projections.
//
// Imports nothing from @earendil-works/*. All Pi wiring belongs in index.ts;
// all Minih filesystem/CLI/helper IO belongs in minih-adapter.ts.

import { Buffer } from "node:buffer";

export const WORKBENCH_NAME = "minih-workbench";
export const MINIH_COMMAND_NAME = "minih";
export const MINIH_STATUS_KEY = "minih-workbench";

export const DEFAULT_ACTIVE_RUN_LIMIT = 20;
export const DEFAULT_COMPLETED_RUN_LIMIT = 5;
export const MAX_RUN_LIMIT = 100;
export const DEFAULT_MAX_PANE_EVENTS = 80;
export const MAX_PANE_EVENTS = 500;
export const DEFAULT_MAX_PANE_BYTES = 48 * 1024;
export const MAX_PANE_BYTES = 256 * 1024;
export const DEFAULT_REPORT_BYTES = 16 * 1024;
export const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;
export const TRUNCATION_MARKER = "\n…[truncated]";

export const MINIH_WORKBENCH_ACTIONS = {
	openList: "minih.openList",
	openRun: "minih.openRun",
	closeView: "minih.closeView",
	refresh: "minih.refresh",
	selectPrevious: "minih.selectPrevious",
	selectNext: "minih.selectNext",
	pageTranscript: "minih.pageTranscript",
	pageTools: "minih.pageTools",
	pageDiagnostics: "minih.pageDiagnostics",
} as const;

export type MinihWorkbenchAction =
	(typeof MINIH_WORKBENCH_ACTIONS)[keyof typeof MINIH_WORKBENCH_ACTIONS];

export const PHASE_1_FORBIDDEN_ACTIONS = [
	"send",
	"stop",
	"control",
	"push_context",
	"launch",
	"install",
] as const;

export type Phase1ForbiddenAction = (typeof PHASE_1_FORBIDDEN_ACTIONS)[number];

export const MINIH_RUN_KINDS = ["coordinated", "standalone", "unknown"] as const;
export type MinihRunKind = (typeof MINIH_RUN_KINDS)[number];

export const MINIH_LIVENESS = [
	"active",
	"stale",
	"completed",
	"failed",
	"missing",
	"unknown",
] as const;
export type MinihLiveness = (typeof MINIH_LIVENESS)[number];

export const MINIH_TERMINAL_RESULTS = [
	"running",
	"completed",
	"failed",
	"stopped",
	"unknown",
] as const;
export type MinihTerminalResult = (typeof MINIH_TERMINAL_RESULTS)[number];

export const MINIH_INSIDE_STATUSES = [
	"idle",
	"running",
	"reading",
	"reviewing",
	"reporting",
	"blocked",
	"stopping",
	"complete",
	"needs_recovery",
	"unknown",
] as const;
export type MinihInsideStatus = (typeof MINIH_INSIDE_STATUSES)[number];

export const MINIH_OUTSIDE_STATUSES = [
	"available",
	"polling",
	"waiting",
	"unavailable",
	"unknown",
] as const;
export type MinihOutsideStatus = (typeof MINIH_OUTSIDE_STATUSES)[number];

export const MINIH_ATTENTION_STATES = ["none", "info", "needs_attention", "blocked"] as const;
export type MinihAttentionState = (typeof MINIH_ATTENTION_STATES)[number];

export const MINIH_REPORT_STATES = ["none", "ready", "partial", "error"] as const;
export type MinihReportState = (typeof MINIH_REPORT_STATES)[number];

export type MinihDiagnosticSeverity = "info" | "warning" | "error";

export interface MinihRunRef {
	slug: string;
	runId: string;
}

export interface MinihDiagnostic {
	severity: MinihDiagnosticSeverity;
	code: string;
	message: string;
	source?: "run" | "events" | "state" | "inbox" | "report" | "adapter";
}

export interface MinihReportSummary {
	state: MinihReportState;
	path?: string;
	summary?: string;
	findingsCount: number;
	bytes: number;
	truncated: boolean;
}

export interface MinihStatusAxes {
	liveness: MinihLiveness;
	terminal: MinihTerminalResult;
	inside: MinihInsideStatus;
	outside: MinihOutsideStatus;
	attention: MinihAttentionState;
}

export interface MinihRunSummary extends MinihRunRef {
	kind: MinihRunKind;
	runPath: string;
	startedAt?: string;
	updatedAt?: string;
	completedAt?: string;
	status: MinihStatusAxes;
	report: MinihReportSummary;
	diagnostics: MinihDiagnostic[];
	materialEventCount: number;
	hasInbox: boolean;
	hasState: boolean;
}

export interface MinihPaneCursor {
	offset?: number;
	limit?: number;
	maxBytes?: number;
}

export interface MinihPaneItem {
	id: string;
	timestamp?: string;
	type: string;
	text: string;
}

export interface MinihPaneSnapshot {
	items: MinihPaneItem[];
	offset: number;
	limit: number;
	total: number;
	maxBytes: number;
	bytes: number;
	truncatedEvents: boolean;
	truncatedBytes: boolean;
	truncationMarker: string;
}

export interface MinihViewSnapshot extends MinihRunRef {
	summary: MinihRunSummary;
	transcript: MinihPaneSnapshot;
	tools: MinihPaneSnapshot;
	coordination: MinihPaneSnapshot;
	diagnostics: MinihPaneSnapshot;
	report: MinihReportSummary;
}

export interface MinihModalState {
	open: boolean;
	selectedRun?: MinihRunRef;
	focusedPane: "transcript" | "tools" | "coordination" | "diagnostics" | "report";
	transcriptCursor: MinihPaneCursor;
	toolsCursor: MinihPaneCursor;
	coordinationCursor: MinihPaneCursor;
	diagnosticsCursor: MinihPaneCursor;
}

export interface MinihInventorySnapshot {
	runs: MinihRunSummary[];
	activeCount: number;
	staleCount: number;
	completedCount: number;
	diagnosticCount: number;
	truncated: boolean;
}

export type MinihAdapterErrorCode =
	| "MINIH_ROOT_MISSING"
	| "MINIH_RUN_NOT_FOUND"
	| "MINIH_BAD_ARTIFACT"
	| "MINIH_PERMISSION_DENIED"
	| "MINIH_IO_ERROR";

export type MinihAdapterResult<T> =
	| { ok: true; value: T; diagnostics: MinihDiagnostic[] }
	| {
			ok: false;
			code: MinihAdapterErrorCode;
			message: string;
			diagnostics: MinihDiagnostic[];
	  };

export function minihOk<T>(value: T, diagnostics: MinihDiagnostic[] = []): MinihAdapterResult<T> {
	return { ok: true, value, diagnostics };
}

export function minihError<T>(
	code: MinihAdapterErrorCode,
	message: string,
	diagnostics: MinihDiagnostic[] = [],
): MinihAdapterResult<T> {
	return { ok: false, code, message, diagnostics };
}

export function diagnostic(
	severity: MinihDiagnosticSeverity,
	code: string,
	message: string,
	source?: MinihDiagnostic["source"],
): MinihDiagnostic {
	return { severity, code, message, source };
}

export function defaultModalState(): MinihModalState {
	return {
		open: false,
		focusedPane: "transcript",
		transcriptCursor: {},
		toolsCursor: {},
		coordinationCursor: {},
		diagnosticsCursor: {},
	};
}

export function clampRunLimit(value: number | undefined, fallback: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	if (value <= 0) return 0;
	return Math.min(Math.floor(value), MAX_RUN_LIMIT);
}

export function clampPaneLimit(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_PANE_EVENTS;
	if (value <= 0) return 0;
	return Math.min(Math.floor(value), MAX_PANE_EVENTS);
}

export function clampPaneBytes(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_PANE_BYTES;
	if (value <= 0) return 0;
	return Math.min(Math.floor(value), MAX_PANE_BYTES);
}

export function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

export function truncateText(text: string, maxBytes: number): { text: string; truncated: boolean } {
	if (maxBytes <= 0) return { text: "", truncated: text.length > 0 };
	if (byteLength(text) <= maxBytes) return { text, truncated: false };
	const markerBytes = byteLength(TRUNCATION_MARKER);
	const budget = Math.max(0, maxBytes - markerBytes);
	let truncated = text;
	while (byteLength(truncated) > budget && truncated.length > 0) {
		truncated = truncated.slice(0, -1);
	}
	return { text: `${truncated}${TRUNCATION_MARKER}`, truncated: true };
}

export function makePaneSnapshot(
	items: readonly MinihPaneItem[],
	cursor: MinihPaneCursor = {},
): MinihPaneSnapshot {
	const offset = Math.max(0, Math.floor(cursor.offset ?? 0));
	const limit = clampPaneLimit(cursor.limit);
	const maxBytes = clampPaneBytes(cursor.maxBytes);
	const visible: MinihPaneItem[] = [];
	let bytes = 0;
	let truncatedBytes = false;
	const windowed = items.slice(offset, limit === 0 ? offset : offset + limit);
	for (const item of windowed) {
		const remaining = maxBytes - bytes;
		if (remaining <= 0) {
			truncatedBytes = true;
			break;
		}
		const truncated = truncateText(item.text, remaining);
		const next: MinihPaneItem = { ...item, text: truncated.text };
		visible.push(next);
		bytes += byteLength(next.text);
		if (truncated.truncated) {
			truncatedBytes = true;
			break;
		}
	}
	return {
		items: visible,
		offset,
		limit,
		total: items.length,
		maxBytes,
		bytes,
		truncatedEvents: offset + windowed.length < items.length,
		truncatedBytes,
		truncationMarker: TRUNCATION_MARKER.trim(),
	};
}

export function classifyAttention(input: {
	status: Pick<MinihStatusAxes, "liveness" | "inside">;
	diagnostics?: readonly MinihDiagnostic[];
}): MinihAttentionState {
	if (input.diagnostics?.some((item) => item.severity === "error")) return "blocked";
	if (input.status.inside === "blocked" || input.status.inside === "needs_recovery")
		return "blocked";
	if (
		input.status.liveness === "stale" ||
		input.diagnostics?.some((item) => item.severity === "warning")
	) {
		return "needs_attention";
	}
	if (input.diagnostics && input.diagnostics.length > 0) return "info";
	return "none";
}

export function sortRunSummaries(runs: readonly MinihRunSummary[]): MinihRunSummary[] {
	return [...runs].sort((left, right) => {
		const rank = (run: MinihRunSummary): number => {
			switch (run.status.liveness) {
				case "active":
					return 0;
				case "stale":
					return 1;
				case "missing":
				case "failed":
					return 2;
				case "completed":
					return 3;
				case "unknown":
					return 4;
			}
		};
		const rankDelta = rank(left) - rank(right);
		if (rankDelta !== 0) return rankDelta;
		const leftTime = Date.parse(left.updatedAt ?? left.completedAt ?? left.startedAt ?? "") || 0;
		const rightTime =
			Date.parse(right.updatedAt ?? right.completedAt ?? right.startedAt ?? "") || 0;
		if (leftTime !== rightTime) return rightTime - leftTime;
		return `${left.slug}/${left.runId}`.localeCompare(`${right.slug}/${right.runId}`);
	});
}

export function projectInventory(
	runs: readonly MinihRunSummary[],
	limits: { activeLimit?: number; completedLimit?: number } = {},
): MinihInventorySnapshot {
	const activeLimit = clampRunLimit(limits.activeLimit, DEFAULT_ACTIVE_RUN_LIMIT);
	const completedLimit = clampRunLimit(limits.completedLimit, DEFAULT_COMPLETED_RUN_LIMIT);
	const sorted = sortRunSummaries(runs);
	const selected: MinihRunSummary[] = [];
	const selectedKeys = new Set<string>();
	const keyForRun = (run: MinihRunSummary): string => `${run.slug}\u0000${run.runId}`;
	const addRun = (run: MinihRunSummary): void => {
		const key = keyForRun(run);
		if (selectedKeys.has(key)) return;
		selectedKeys.add(key);
		selected.push(run);
	};

	for (const run of sorted
		.filter((item) => item.status.liveness !== "completed")
		.slice(0, activeLimit)) {
		addRun(run);
	}
	let completedAdded = 0;
	for (const run of sorted.filter(
		(item) => item.status.liveness === "completed" || item.report.state === "ready",
	)) {
		if (completedAdded >= completedLimit) break;
		const before = selectedKeys.size;
		addRun(run);
		if (selectedKeys.size > before) completedAdded += 1;
	}
	const uniqueTotal = new Set(sorted.map((run) => keyForRun(run))).size;
	return {
		runs: selected,
		activeCount: sorted.filter((run) => run.status.liveness === "active").length,
		staleCount: sorted.filter((run) => run.status.liveness === "stale").length,
		completedCount: sorted.filter((run) => run.status.liveness === "completed").length,
		diagnosticCount: sorted.reduce((total, run) => total + run.diagnostics.length, 0),
		truncated: selectedKeys.size < uniqueTotal,
	};
}

export function isPhase1ForbiddenAction(action: string): action is Phase1ForbiddenAction {
	return PHASE_1_FORBIDDEN_ACTIONS.includes(action as Phase1ForbiddenAction);
}

export function phase1NoWriteResult(action: string): MinihAdapterResult<never> {
	return minihError(
		"MINIH_BAD_ARTIFACT",
		`minih-workbench phase 1 is read-only; '${action}' is not available`,
		[
			diagnostic(
				"warning",
				"MINIH_PHASE1_READ_ONLY",
				"Phase 1 exposes read-only pull surfaces only",
			),
		],
	);
}
