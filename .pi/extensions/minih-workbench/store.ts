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
	focusPreviousPane: "minih.focusPreviousPane",
	focusNextPane: "minih.focusNextPane",
	pageTranscriptUp: "minih.pageTranscriptUp",
	pageTranscriptDown: "minih.pageTranscriptDown",
	pageToolsUp: "minih.pageToolsUp",
	pageToolsDown: "minih.pageToolsDown",
	pageCoordinationUp: "minih.pageCoordinationUp",
	pageCoordinationDown: "minih.pageCoordinationDown",
	pageDiagnosticsUp: "minih.pageDiagnosticsUp",
	pageDiagnosticsDown: "minih.pageDiagnosticsDown",
	pageReportUp: "minih.pageReportUp",
	pageReportDown: "minih.pageReportDown",
	sendMessage: "minih.sendMessage",
	deleteComposerChar: "minih.deleteComposerChar",
	stopRun: "minih.stopRun",
	confirmStop: "minih.confirmStop",
} as const;

export type MinihWorkbenchAction =
	(typeof MINIH_WORKBENCH_ACTIONS)[keyof typeof MINIH_WORKBENCH_ACTIONS];

export type MinihWorkbenchKeybindings = Readonly<Record<MinihWorkbenchAction, readonly string[]>>;

export const DEFAULT_MINIH_WORKBENCH_KEYBINDINGS: MinihWorkbenchKeybindings = {
	[MINIH_WORKBENCH_ACTIONS.openList]: ["ctrl+m"],
	[MINIH_WORKBENCH_ACTIONS.openRun]: ["enter"],
	[MINIH_WORKBENCH_ACTIONS.closeView]: ["escape"],
	[MINIH_WORKBENCH_ACTIONS.refresh]: ["r", "ctrl+r"],
	[MINIH_WORKBENCH_ACTIONS.selectPrevious]: ["up", "k"],
	[MINIH_WORKBENCH_ACTIONS.selectNext]: ["down", "j"],
	[MINIH_WORKBENCH_ACTIONS.focusPreviousPane]: ["shift+tab"],
	[MINIH_WORKBENCH_ACTIONS.focusNextPane]: ["tab"],
	[MINIH_WORKBENCH_ACTIONS.pageTranscriptUp]: ["pageup"],
	[MINIH_WORKBENCH_ACTIONS.pageTranscriptDown]: ["pagedown"],
	[MINIH_WORKBENCH_ACTIONS.pageToolsUp]: ["alt+pageup"],
	[MINIH_WORKBENCH_ACTIONS.pageToolsDown]: ["alt+pagedown"],
	[MINIH_WORKBENCH_ACTIONS.pageCoordinationUp]: ["ctrl+pageup"],
	[MINIH_WORKBENCH_ACTIONS.pageCoordinationDown]: ["ctrl+pagedown"],
	[MINIH_WORKBENCH_ACTIONS.pageDiagnosticsUp]: ["shift+pageup"],
	[MINIH_WORKBENCH_ACTIONS.pageDiagnosticsDown]: ["shift+pagedown"],
	[MINIH_WORKBENCH_ACTIONS.pageReportUp]: ["home"],
	[MINIH_WORKBENCH_ACTIONS.pageReportDown]: ["end"],
	[MINIH_WORKBENCH_ACTIONS.sendMessage]: ["ctrl+s"],
	[MINIH_WORKBENCH_ACTIONS.deleteComposerChar]: ["backspace", "delete"],
	[MINIH_WORKBENCH_ACTIONS.stopRun]: ["ctrl+x"],
	[MINIH_WORKBENCH_ACTIONS.confirmStop]: ["ctrl+shift+x"],
};

export const FORBIDDEN_WORKBENCH_ACTIONS = ["launch", "install"] as const;

export type ForbiddenWorkbenchAction = (typeof FORBIDDEN_WORKBENCH_ACTIONS)[number];

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

export const MINIH_INTERACTION_ACTIONS = ["send", "stop", "report", "push_context"] as const;
export type MinihInteractionAction = (typeof MINIH_INTERACTION_ACTIONS)[number];

export const MINIH_OUTBOUND_MESSAGE_TYPES = [
	"task",
	"question",
	"directive",
	"briefing",
	"review-request",
	"note",
] as const;
export type MinihOutboundMessageType = (typeof MINIH_OUTBOUND_MESSAGE_TYPES)[number];

export const MINIH_PUSH_SOURCES = ["events", "inside", "outside", "report", "state"] as const;
export type MinihPushSource = (typeof MINIH_PUSH_SOURCES)[number];

export const MINIH_MATERIAL_EVENT_REASONS = [
	"finding",
	"question",
	"blocker",
	"permission_or_recovery",
	"terminal_report",
	"farewell",
	"user_addressed",
] as const;
export type MinihMaterialEventReason = (typeof MINIH_MATERIAL_EVENT_REASONS)[number];

export const MINIH_SUPPRESSED_EVENT_REASONS = [
	"routine_progress",
	"raw_tool_activity",
	"counter_churn",
	"status_churn",
	"large_raw_output",
] as const;
export type MinihSuppressedEventReason = (typeof MINIH_SUPPRESSED_EVENT_REASONS)[number];

export const DEFAULT_OUTBOUND_SUBJECT_BYTES = 160;
export const DEFAULT_OUTBOUND_BODY_BYTES = 16 * 1024;
export const DEFAULT_PUSH_TEXT_BYTES = 1200;
export const DEFAULT_PUSH_METADATA_TEXT_BYTES = 240;
export const REDACTION_MARKER = "[redacted]";

export type MinihDiagnosticSeverity = "info" | "warning" | "error";

export interface MinihRunRef {
	slug: string;
	runId: string;
}

export interface MinihRunCapability {
	run: MinihRunRef;
	coordinated: boolean;
	active: boolean;
	writable: boolean;
	canSend: boolean;
	canStop: boolean;
	canPush: boolean;
	reasons: string[];
}

export interface MinihActionAvailability {
	action: MinihInteractionAction;
	available: boolean;
	reason?: string;
	capability: MinihRunCapability;
}

export interface MinihOutboundMessageDraft extends MinihRunRef {
	type: MinihOutboundMessageType;
	subject: string;
	body: string;
	ackOf?: string;
	subjectTruncated: boolean;
	bodyTruncated: boolean;
}

export interface MinihStopControlDraft extends MinihRunRef {
	type: "control";
	subject: "stop";
	body: string;
	requiredConfirmation: string;
}

export interface MinihMaterialEventInput {
	run: MinihRunRef;
	source: MinihPushSource;
	id: string;
	type: string;
	text: string;
	timestamp?: string;
	severity?: MinihDiagnosticSeverity;
	addressedToUser?: boolean;
	terminal?: boolean;
}

export type MinihPushUrgency = "normal" | "urgent";

export type MinihPushClassification =
	| {
			material: true;
			reason: MinihMaterialEventReason;
			urgency: MinihPushUrgency;
			dedupeKey: string;
			modelText: string;
			truncated: boolean;
			redacted: boolean;
	  }
	| {
			material: false;
			reason: MinihSuppressedEventReason;
			dedupeKey: string;
	  };

export interface MinihPushedContextEnvelope {
	customType: "minih.materialEvent";
	content: string;
	display: true;
	details: {
		slug: string;
		runId: string;
		source: MinihPushSource;
		eventId: string;
		eventType: string;
		reason: MinihMaterialEventReason;
		urgency: MinihPushUrgency;
		dedupeKey: string;
		redacted: boolean;
		truncated: boolean;
		timestamp?: string;
	};
}

export interface MinihPushScopeInput {
	opened: boolean;
	observed: boolean;
	optedIn: boolean;
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

export const MINIH_MODAL_PANES = [
	"transcript",
	"tools",
	"coordination",
	"diagnostics",
	"report",
] as const;

export type MinihModalPane = (typeof MINIH_MODAL_PANES)[number];

export interface MinihListSelection {
	selectedIndex: number;
	selectedRun?: MinihRunRef;
}

export interface MinihSafeCloseResult {
	ok: true;
	state: MinihModalState;
	sentControl: false;
	sentStop: false;
	message: string;
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
	focusedPane: MinihModalPane;
	transcriptCursor: MinihPaneCursor;
	toolsCursor: MinihPaneCursor;
	coordinationCursor: MinihPaneCursor;
	diagnosticsCursor: MinihPaneCursor;
	reportCursor: MinihPaneCursor;
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
	| "MINIH_WRITE_UNAVAILABLE"
	| "MINIH_WRITE_REJECTED"
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
		reportCursor: {},
	};
}

function cloneRunRef(run: MinihRunRef): MinihRunRef {
	return { slug: run.slug, runId: run.runId };
}

export function clampListSelection(
	runs: readonly MinihRunSummary[],
	selectedIndex: number | undefined,
): number {
	if (runs.length === 0) return 0;
	if (selectedIndex === undefined || !Number.isFinite(selectedIndex)) return 0;
	return Math.min(Math.max(0, Math.floor(selectedIndex)), runs.length - 1);
}

export function moveListSelection(input: {
	runs: readonly MinihRunSummary[];
	selectedIndex: number | undefined;
	delta: number;
	wrap?: boolean;
}): number {
	if (input.runs.length === 0) return 0;
	const current = clampListSelection(input.runs, input.selectedIndex);
	const next = current + Math.trunc(input.delta);
	if (input.wrap) return ((next % input.runs.length) + input.runs.length) % input.runs.length;
	return clampListSelection(input.runs, next);
}

export function resolveSelectedRun(
	runs: readonly MinihRunSummary[],
	selectedIndex: number | undefined,
): MinihRunRef | undefined {
	const selected = runs[clampListSelection(runs, selectedIndex)];
	return selected ? cloneRunRef(selected) : undefined;
}

export function openModalForRun(
	run: MinihRunRef,
	previous: MinihModalState = defaultModalState(),
): MinihModalState {
	return { ...previous, open: true, selectedRun: cloneRunRef(run) };
}

export function closeModalSafely(state: MinihModalState): MinihSafeCloseResult {
	return {
		ok: true,
		state: { ...state, open: false, selectedRun: undefined },
		sentControl: false,
		sentStop: false,
		message: "minih-workbench: view closed; Minih run untouched",
	};
}

export function cycleFocusedPane(state: MinihModalState, delta: number): MinihModalState {
	const current = MINIH_MODAL_PANES.indexOf(state.focusedPane);
	const next =
		((current + Math.trunc(delta)) % MINIH_MODAL_PANES.length) + MINIH_MODAL_PANES.length;
	const focusedPane = MINIH_MODAL_PANES[next % MINIH_MODAL_PANES.length] ?? "transcript";
	return { ...state, focusedPane };
}

export function paneCursorFor(state: MinihModalState, pane: MinihModalPane): MinihPaneCursor {
	switch (pane) {
		case "transcript":
			return state.transcriptCursor;
		case "tools":
			return state.toolsCursor;
		case "coordination":
			return state.coordinationCursor;
		case "diagnostics":
			return state.diagnosticsCursor;
		case "report":
			return state.reportCursor;
	}
}

export function withPaneCursor(
	state: MinihModalState,
	pane: MinihModalPane,
	cursor: MinihPaneCursor,
): MinihModalState {
	switch (pane) {
		case "transcript":
			return { ...state, transcriptCursor: { ...cursor } };
		case "tools":
			return { ...state, toolsCursor: { ...cursor } };
		case "coordination":
			return { ...state, coordinationCursor: { ...cursor } };
		case "diagnostics":
			return { ...state, diagnosticsCursor: { ...cursor } };
		case "report":
			return { ...state, reportCursor: { ...cursor } };
	}
}

export function pagePaneCursor(
	cursor: MinihPaneCursor,
	direction: "up" | "down",
	total?: number,
): MinihPaneCursor {
	const limit = clampPaneLimit(cursor.limit);
	const pageSize = limit <= 0 ? DEFAULT_MAX_PANE_EVENTS : limit;
	const rawOffset = Math.max(0, Math.floor(cursor.offset ?? 0));
	const delta = direction === "up" ? -pageSize : pageSize;
	const maxOffset = total === undefined ? Number.POSITIVE_INFINITY : Math.max(0, total - pageSize);
	return { ...cursor, offset: Math.min(maxOffset, Math.max(0, rawOffset + delta)), limit };
}

export function pageModalPane(
	state: MinihModalState,
	pane: MinihModalPane,
	direction: "up" | "down",
	total?: number,
): MinihModalState {
	return withPaneCursor(state, pane, pagePaneCursor(paneCursorFor(state, pane), direction, total));
}

export function pageFocusedPane(
	state: MinihModalState,
	direction: "up" | "down",
	total?: number,
): MinihModalState {
	return pageModalPane(state, state.focusedPane, direction, total);
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

export function requiredStopConfirmation(run: MinihRunRef): string {
	return `stop ${run.slug}/${run.runId}`;
}

export function validateStopConfirmation(run: MinihRunRef, confirmation: string): boolean {
	return confirmation === requiredStopConfirmation(run);
}

export function buildStopControlDraft(run: MinihRunRef): MinihStopControlDraft {
	const requiredConfirmation = requiredStopConfirmation(run);
	return {
		...cloneRunRef(run),
		type: "control",
		subject: "stop",
		body: requiredConfirmation,
		requiredConfirmation,
	};
}

export function buildOutboundMessageDraft(input: {
	run: MinihRunRef;
	type?: MinihOutboundMessageType;
	subject: string;
	body: string;
	ackOf?: string;
	subjectMaxBytes?: number;
	bodyMaxBytes?: number;
}): MinihOutboundMessageDraft {
	const subject = truncateText(
		input.subject.trim(),
		input.subjectMaxBytes ?? DEFAULT_OUTBOUND_SUBJECT_BYTES,
	);
	const body = truncateText(input.body, input.bodyMaxBytes ?? DEFAULT_OUTBOUND_BODY_BYTES);
	return {
		...cloneRunRef(input.run),
		type: input.type ?? "task",
		subject: subject.text,
		body: body.text,
		ackOf: input.ackOf,
		subjectTruncated: subject.truncated,
		bodyTruncated: body.truncated,
	};
}

export function deriveRunCapability(run: MinihRunSummary): MinihRunCapability {
	const reasons: string[] = [];
	const coordinated = run.kind === "coordinated";
	const active = run.status.liveness === "active" && run.status.terminal === "running";
	if (!coordinated) reasons.push("run is not coordinated");
	if (!run.hasInbox) reasons.push("run has no Minih inbox");
	if (run.status.liveness !== "active") reasons.push(`run liveness is ${run.status.liveness}`);
	if (run.status.terminal !== "running")
		reasons.push(`run terminal status is ${run.status.terminal}`);
	if (run.diagnostics.some((item) => item.severity === "error")) {
		reasons.push("run has blocking diagnostics");
	}
	const writable = reasons.length === 0;
	return {
		run: cloneRunRef(run),
		coordinated,
		active,
		writable,
		canSend: writable,
		canStop: writable,
		canPush: coordinated && run.hasInbox,
		reasons,
	};
}

export function actionAvailabilityForRun(
	run: MinihRunSummary,
	action: MinihInteractionAction,
): MinihActionAvailability {
	const capability = deriveRunCapability(run);
	if (action === "report") {
		return {
			action,
			available: run.report.state === "ready",
			reason: run.report.state === "ready" ? undefined : "run has no ready report",
			capability,
		};
	}
	if (action === "push_context") {
		return {
			action,
			available: capability.canPush,
			reason: capability.canPush ? undefined : capability.reasons.join("; ") || "push disabled",
			capability,
		};
	}
	const available = action === "send" ? capability.canSend : capability.canStop;
	return {
		action,
		available,
		reason: available ? undefined : capability.reasons.join("; ") || `${action} disabled`,
		capability,
	};
}

export function dedupeKeyForMaterialEvent(event: MinihMaterialEventInput): string {
	return `${event.run.slug}\u0000${event.run.runId}\u0000${event.source}\u0000${event.type}\u0000${event.id}`;
}

export function redactAndTruncateModelText(
	text: string,
	maxBytes: number = DEFAULT_PUSH_TEXT_BYTES,
): { text: string; redacted: boolean; truncated: boolean } {
	const redacted = text
		.replace(/\b[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s]+/g, `${REDACTION_MARKER}=<value>`)
		.replace(
			/\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*[^\s]+/gi,
			`${REDACTION_MARKER}=<value>`,
		)
		.replace(/(?:\/[\w.-]+){3,}/g, `${REDACTION_MARKER}:path`);
	const truncated = truncateText(redacted, maxBytes);
	return { text: truncated.text, redacted: redacted !== text, truncated: truncated.truncated };
}

export function classifyMaterialEvent(event: MinihMaterialEventInput): MinihPushClassification {
	const key = dedupeKeyForMaterialEvent(event);
	const type = event.type.toLowerCase();
	const text = event.text.toLowerCase();
	if (byteLength(event.text) > DEFAULT_PUSH_TEXT_BYTES * 4 && type.includes("tool")) {
		return { material: false, reason: "large_raw_output", dedupeKey: key };
	}
	if (type.includes("tool")) {
		return { material: false, reason: "raw_tool_activity", dedupeKey: key };
	}
	let reason: MinihMaterialEventReason | undefined;
	if (event.addressedToUser) reason = "user_addressed";
	else if (type.includes("finding")) reason = "finding";
	else if (type.includes("question")) reason = "question";
	else if (type.includes("block") || text.includes("blocked")) reason = "blocker";
	else if (
		type.includes("permission") ||
		type.includes("recovery") ||
		text.includes("needs recovery")
	) {
		reason = "permission_or_recovery";
	} else if (type.includes("report") || event.terminal) reason = "terminal_report";
	else if (type.includes("farewell")) reason = "farewell";
	if (!reason && (type.includes("token") || type.includes("counter"))) {
		return { material: false, reason: "counter_churn", dedupeKey: key };
	}
	if (!reason && (type.includes("progress") || type.includes("heartbeat"))) {
		return { material: false, reason: "routine_progress", dedupeKey: key };
	}
	if (!reason && type.includes("status") && !event.terminal) {
		return { material: false, reason: "status_churn", dedupeKey: key };
	}
	if (!reason) return { material: false, reason: "routine_progress", dedupeKey: key };
	const model = redactAndTruncateModelText(event.text);
	const urgent: MinihPushUrgency =
		reason === "question" ||
		reason === "blocker" ||
		reason === "permission_or_recovery" ||
		event.severity === "error"
			? "urgent"
			: "normal";
	return {
		material: true,
		reason,
		urgency: urgent,
		dedupeKey: key,
		modelText: model.text,
		truncated: model.truncated,
		redacted: model.redacted,
	};
}

export function isPushScopeEligible(scope: MinihPushScopeInput): boolean {
	return scope.opened || scope.observed || scope.optedIn;
}

export function buildPushedContextEnvelope(
	event: MinihMaterialEventInput,
	classification: MinihPushClassification = classifyMaterialEvent(event),
): MinihPushedContextEnvelope | undefined {
	if (!classification.material) return undefined;
	const timestamp = event.timestamp ? ` at ${event.timestamp}` : "";
	return {
		customType: "minih.materialEvent",
		content: `[minih:${classification.reason}:${classification.urgency}] ${event.run.slug}/${event.run.runId}${timestamp}: ${classification.modelText}`,
		display: true,
		details: {
			slug: event.run.slug,
			runId: event.run.runId,
			source: event.source,
			eventId: event.id,
			eventType: event.type,
			reason: classification.reason,
			urgency: classification.urgency,
			dedupeKey: classification.dedupeKey,
			redacted: classification.redacted,
			truncated: classification.truncated,
			timestamp: event.timestamp,
		},
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

export function isForbiddenWorkbenchAction(action: string): action is ForbiddenWorkbenchAction {
	return FORBIDDEN_WORKBENCH_ACTIONS.includes(action as ForbiddenWorkbenchAction);
}

export function readOnlyNoWriteResult(action: string): MinihAdapterResult<never> {
	return minihError(
		"MINIH_BAD_ARTIFACT",
		`minih-workbench phase 2 is read-only; '${action}' is not available`,
		[
			diagnostic(
				"warning",
				"MINIH_PHASE2_READ_ONLY",
				"Phase 2 exposes read-only list, modal, and pull surfaces only",
			),
		],
	);
}
