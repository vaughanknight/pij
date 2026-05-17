import { type Component, type KeyId, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

import {
	actionAvailabilityForRun,
	clampListSelection,
	clampPaneLimit,
	closeModalSafely,
	cycleFocusedPane,
	DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
	MINIH_MODAL_PANES,
	MINIH_WORKBENCH_ACTIONS,
	type MinihDiagnostic,
	type MinihInventorySnapshot,
	type MinihModalPane,
	type MinihModalState,
	type MinihPaneCursor,
	type MinihPaneSnapshot,
	type MinihReportSummary,
	type MinihRunRef,
	type MinihRunSummary,
	type MinihViewSnapshot,
	type MinihWorkbenchKeybindings,
	moveListSelection,
	pageFocusedPane,
	resolveSelectedRun,
} from "./store.js";

export const MINIH_DISABLED_COMPOSER_REASON =
	"Composer disabled: run is not an active coordinated writable Minih run.";
export const MINIH_EMPTY_COMPOSER_REASON = "Composer empty: type a message before sending.";

export interface MinihListRenderOptions {
	selectedIndex?: number;
	keybindings?: MinihWorkbenchKeybindings;
	showHelp?: boolean;
}

export interface MinihModalRenderOptions {
	state: MinihModalState;
	keybindings?: MinihWorkbenchKeybindings;
	showHelp?: boolean;
	composerText?: string;
}

export interface MinihRunListCallbacks {
	onOpenRun(run: MinihRunRef): void;
	onClose(): void;
	onRefresh(): void;
	requestRender(): void;
}

export interface MinihRunModalCallbacks {
	onClose(): void;
	onSendMessage?(body: string): void;
	onStopRun?(): void;
	onStateChange?(state: MinihModalState): void;
	requestRender(): void;
}

function matchesAction(
	data: string,
	keybindings: MinihWorkbenchKeybindings,
	action: keyof typeof DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
): boolean {
	return keybindings[action].some((key) => matchesKey(data, key as KeyId));
}

function keys(
	keybindings: MinihWorkbenchKeybindings | undefined,
	action: keyof typeof DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
): string {
	return (keybindings ?? DEFAULT_MINIH_WORKBENCH_KEYBINDINGS)[action].join("/");
}

function safeLine(line: string, width: number): string {
	return truncateToWidth(line, Math.max(1, width));
}

export function widthSafeLines(lines: readonly string[], width: number): string[] {
	return lines.map((line) => safeLine(line, width));
}

function isCompletedOrReportReady(run: MinihRunSummary): boolean {
	return run.status.liveness === "completed" || run.report.state === "ready";
}

function inlineText(text: string): string {
	return text.replace(/\r?\n/g, " ↵ ");
}

function statusSummary(run: MinihRunSummary): string {
	return [
		`live:${run.status.liveness}`,
		`terminal:${run.status.terminal}`,
		`inside:${run.status.inside}`,
		`outside:${run.status.outside}`,
		`attention:${run.status.attention}`,
	].join(" ");
}

export function formatRunSummaryLine(run: MinihRunSummary): string {
	const report = run.report.state === "ready" ? ` report:${run.report.findingsCount}` : "";
	const diagnostics = run.diagnostics.length > 0 ? ` diagnostics:${run.diagnostics.length}` : "";
	return [
		`${run.slug}/${run.runId}`,
		`kind:${run.kind}`,
		statusSummary(run),
		`material:${run.materialEventCount}`,
		`reportState:${run.report.state}${report}${diagnostics}`,
	].join(" ");
}

export function formatInventoryText(snapshot: MinihInventorySnapshot): string {
	const lines = renderInventoryList(snapshot, { showHelp: false });
	return lines.join("\n");
}

export function renderInventoryList(
	snapshot: MinihInventorySnapshot,
	options: MinihListRenderOptions = {},
): string[] {
	const selectedIndex = Math.min(
		Math.max(0, Math.floor(options.selectedIndex ?? 0)),
		Math.max(0, snapshot.runs.length - 1),
	);
	const lines = [
		"MINIH WORKBENCH — RUN LIST",
		`Runs visible:${snapshot.runs.length} active:${snapshot.activeCount} stale:${snapshot.staleCount} completed:${snapshot.completedCount} diagnostics:${snapshot.diagnosticCount}`,
		"Section: active/stale/missing/failed",
	];
	let completedHeaderAdded = false;
	if (snapshot.runs.length === 0) lines.push("No Minih runs visible");
	for (const [index, run] of snapshot.runs.entries()) {
		if (!completedHeaderAdded && isCompletedOrReportReady(run)) {
			lines.push("Section: completed/report-ready");
			completedHeaderAdded = true;
		}
		const prefix = index === selectedIndex ? "›" : " ";
		lines.push(`${prefix} ${formatRunSummaryLine(run)}`);
	}
	if (snapshot.truncated) lines.push("Inventory truncated: use /minih status --json for more");
	if (options.showHelp ?? true) {
		lines.push(
			`Keys: ${keys(options.keybindings, MINIH_WORKBENCH_ACTIONS.selectPrevious)}/${keys(
				options.keybindings,
				MINIH_WORKBENCH_ACTIONS.selectNext,
			)} select • ${keys(options.keybindings, MINIH_WORKBENCH_ACTIONS.openRun)} open • ${keys(
				options.keybindings,
				MINIH_WORKBENCH_ACTIONS.refresh,
			)} refresh • ${keys(options.keybindings, MINIH_WORKBENCH_ACTIONS.closeView)} close`,
		);
	}
	return lines;
}

function paneTitle(pane: MinihModalPane, focused: MinihModalPane): string {
	const marker = pane === focused ? "▶" : " ";
	return `${marker} Pane: ${pane}`;
}

function pageIndicator(snapshot: MinihPaneSnapshot): string {
	const start = snapshot.total === 0 ? 0 : snapshot.offset + 1;
	const end = snapshot.offset + snapshot.items.length;
	const flags = [
		snapshot.truncatedEvents ? "events-truncated" : undefined,
		snapshot.truncatedBytes ? "bytes-truncated" : undefined,
	].filter((item): item is string => item !== undefined);
	const suffix = flags.length > 0 ? ` ${flags.join(" ")}` : "";
	return `items:${start}-${end}/${snapshot.total} bytes:${snapshot.bytes}/${snapshot.maxBytes}${suffix}`;
}

export function renderPaneSnapshot(
	pane: MinihModalPane,
	snapshot: MinihPaneSnapshot,
	focused: MinihModalPane,
): string[] {
	const lines = [paneTitle(pane, focused), pageIndicator(snapshot)];
	if (snapshot.items.length === 0) lines.push("  (empty)");
	for (const item of snapshot.items) {
		const timestamp = item.timestamp ? `${item.timestamp} ` : "";
		lines.push(`  - ${timestamp}[${item.type}] ${inlineText(item.text)}`);
	}
	return lines;
}

function reportLines(report: MinihReportSummary): string[] {
	const lines = [
		`reportState:${report.state} findings:${report.findingsCount} bytes:${report.bytes} truncated:${report.truncated}`,
	];
	if (report.path) lines.push(`path:${report.path}`);
	if (report.summary && report.summary.length > 0) {
		lines.push(...report.summary.split(/\r?\n/).map((line) => `summary:${inlineText(line)}`));
	}
	if (!report.summary && report.state === "none") lines.push("  (no report yet)");
	return lines;
}

export function reportLineCount(report: MinihReportSummary): number {
	return reportLines(report).length;
}

export function renderReportSummary(
	report: MinihReportSummary,
	focused: MinihModalPane,
	cursor: MinihPaneCursor = {},
): string[] {
	const allLines = reportLines(report);
	const offset = Math.max(0, Math.floor(cursor.offset ?? 0));
	const limit = clampPaneLimit(cursor.limit);
	const visible = limit === 0 ? [] : allLines.slice(offset, offset + limit);
	const end = offset + visible.length;
	return [
		paneTitle("report", focused),
		`report lines:${allLines.length === 0 ? 0 : offset + 1}-${end}/${allLines.length}`,
		...visible,
	];
}

export function renderDiagnosticsSummary(diagnostics: readonly MinihDiagnostic[]): string[] {
	if (diagnostics.length === 0) return ["Diagnostics summary: none"];
	return [
		`Diagnostics summary: ${diagnostics.length}`,
		...diagnostics.map((item) => `${item.severity}:${item.code}:${inlineText(item.message)}`),
	];
}

function renderComposerLines(view: MinihViewSnapshot, composerText: string | undefined): string[] {
	const send = actionAvailabilityForRun(view.summary, "send");
	const stop = actionAvailabilityForRun(view.summary, "stop");
	const report = actionAvailabilityForRun(view.summary, "report");
	const controlLine = `Controls: send:${send.available ? "enabled" : `disabled(${send.reason})`} stop:${stop.available ? "enabled" : `disabled(${stop.reason})`} report:${report.available ? "ready" : "not-ready"}`;
	if (!send.available) {
		return [controlLine, `Composer: disabled — ${send.reason ?? MINIH_DISABLED_COMPOSER_REASON}`];
	}
	const text = composerText ?? "";
	return [
		controlLine,
		"Composer: enabled — type text, then send with the configured send key",
		`Draft: ${text.length > 0 ? inlineText(text) : "(empty)"}`,
	];
}

function activePaneSnapshot(
	view: MinihViewSnapshot,
	pane: MinihModalPane,
): MinihPaneSnapshot | undefined {
	switch (pane) {
		case "transcript":
			return view.transcript;
		case "tools":
			return view.tools;
		case "coordination":
			return view.coordination;
		case "diagnostics":
			return view.diagnostics;
		case "report":
			return undefined;
	}
}

export function renderModalView(
	view: MinihViewSnapshot,
	options: MinihModalRenderOptions,
): string[] {
	const focusedPane = options.state.focusedPane;
	const lines = [
		`MINIH WORKBENCH — RUN VIEW ${view.slug}/${view.runId}`,
		statusSummary(view.summary),
		`kind:${view.summary.kind} material:${view.summary.materialEventCount} hasInbox:${view.summary.hasInbox} hasState:${view.summary.hasState}`,
		`reportState:${view.report.state} diagnostics:${view.summary.diagnostics.length}`,
		...renderComposerLines(view, options.composerText),
		`Focused pane: ${focusedPane}`,
	];
	for (const pane of MINIH_MODAL_PANES) {
		if (pane === "report")
			lines.push(...renderReportSummary(view.report, focusedPane, options.state.reportCursor));
		else {
			const snapshot = activePaneSnapshot(view, pane);
			if (snapshot) lines.push(...renderPaneSnapshot(pane, snapshot, focusedPane));
		}
	}
	lines.push(...renderDiagnosticsSummary(view.summary.diagnostics));
	if (options.showHelp ?? true) {
		lines.push(
			`Keys: ${keys(options.keybindings, MINIH_WORKBENCH_ACTIONS.focusPreviousPane)}/${keys(
				options.keybindings,
				MINIH_WORKBENCH_ACTIONS.focusNextPane,
			)} pane • ${keys(
				options.keybindings,
				MINIH_WORKBENCH_ACTIONS.sendMessage,
			)} send draft • ${keys(
				options.keybindings,
				MINIH_WORKBENCH_ACTIONS.stopRun,
			)} stop • page keys scroll focused pane • ${keys(
				options.keybindings,
				MINIH_WORKBENCH_ACTIONS.closeView,
			)} close only`,
		);
	}
	return lines;
}

export function renderWidthSafeInventoryList(
	snapshot: MinihInventorySnapshot,
	width: number,
	options: MinihListRenderOptions = {},
): string[] {
	return widthSafeLines(renderInventoryList(snapshot, options), width);
}

export class MinihRunListComponent implements Component {
	private selectedIndex = 0;
	private snapshot: MinihInventorySnapshot;
	private statusLine: string | undefined;

	constructor(
		snapshot: MinihInventorySnapshot,
		private readonly callbacks: MinihRunListCallbacks,
		private readonly keybindings: MinihWorkbenchKeybindings = DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
	) {
		this.snapshot = snapshot;
		this.selectedIndex = clampListSelection(snapshot.runs, 0);
	}

	updateSnapshot(snapshot: MinihInventorySnapshot, statusLine?: string): void {
		this.snapshot = snapshot;
		this.statusLine = statusLine;
		this.selectedIndex = clampListSelection(snapshot.runs, this.selectedIndex);
		this.callbacks.requestRender();
	}

	render(width: number): string[] {
		const lines = renderWidthSafeInventoryList(this.snapshot, width, {
			selectedIndex: this.selectedIndex,
			keybindings: this.keybindings,
		});
		if (this.statusLine) return widthSafeLines([...lines, this.statusLine], width);
		return lines;
	}

	handleInput(data: string): void {
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.closeView)) {
			this.callbacks.onClose();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.refresh)) {
			this.statusLine = "minih: refreshing";
			this.callbacks.onRefresh();
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.selectPrevious)) {
			this.selectedIndex = moveListSelection({
				runs: this.snapshot.runs,
				selectedIndex: this.selectedIndex,
				delta: -1,
			});
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.selectNext)) {
			this.selectedIndex = moveListSelection({
				runs: this.snapshot.runs,
				selectedIndex: this.selectedIndex,
				delta: 1,
			});
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.openRun)) {
			const selected = resolveSelectedRun(this.snapshot.runs, this.selectedIndex);
			if (selected) this.callbacks.onOpenRun(selected);
		}
	}

	invalidate(): void {}
}

function paneTotal(view: MinihViewSnapshot, pane: MinihModalPane): number | undefined {
	switch (pane) {
		case "transcript":
			return view.transcript.total;
		case "tools":
			return view.tools.total;
		case "coordination":
			return view.coordination.total;
		case "diagnostics":
			return view.diagnostics.total;
		case "report":
			return reportLineCount(view.report);
	}
}

function isPrintableComposerInput(data: string): boolean {
	return data.length === 1 && data >= " " && data !== "\u007f";
}

function pageActionForPane(
	pane: MinihModalPane,
	direction: "up" | "down",
): keyof typeof DEFAULT_MINIH_WORKBENCH_KEYBINDINGS {
	switch (pane) {
		case "transcript":
			return direction === "up"
				? MINIH_WORKBENCH_ACTIONS.pageTranscriptUp
				: MINIH_WORKBENCH_ACTIONS.pageTranscriptDown;
		case "tools":
			return direction === "up"
				? MINIH_WORKBENCH_ACTIONS.pageToolsUp
				: MINIH_WORKBENCH_ACTIONS.pageToolsDown;
		case "coordination":
			return direction === "up"
				? MINIH_WORKBENCH_ACTIONS.pageCoordinationUp
				: MINIH_WORKBENCH_ACTIONS.pageCoordinationDown;
		case "diagnostics":
			return direction === "up"
				? MINIH_WORKBENCH_ACTIONS.pageDiagnosticsUp
				: MINIH_WORKBENCH_ACTIONS.pageDiagnosticsDown;
		case "report":
			return direction === "up"
				? MINIH_WORKBENCH_ACTIONS.pageReportUp
				: MINIH_WORKBENCH_ACTIONS.pageReportDown;
	}
}

export class MinihRunModalComponent implements Component {
	private view: MinihViewSnapshot;
	private state: MinihModalState;
	private statusLine: string | undefined;
	private composerText = "";

	constructor(
		view: MinihViewSnapshot,
		state: MinihModalState,
		private readonly callbacks: MinihRunModalCallbacks,
		private readonly keybindings: MinihWorkbenchKeybindings = DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
	) {
		this.view = view;
		this.state = state;
	}

	updateView(view: MinihViewSnapshot, statusLine?: string): void {
		this.view = view;
		this.statusLine = statusLine;
		this.callbacks.requestRender();
	}

	render(width: number): string[] {
		const lines = renderWidthSafeModalView(this.view, width, {
			state: this.state,
			keybindings: this.keybindings,
			composerText: this.composerText,
		});
		if (this.statusLine) return widthSafeLines([...lines, this.statusLine], width);
		return lines;
	}

	handleInput(data: string): void {
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.closeView)) {
			const result = closeModalSafely(this.state);
			this.state = result.state;
			this.callbacks.onStateChange?.(this.state);
			this.callbacks.onClose();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.sendMessage)) {
			const availability = actionAvailabilityForRun(this.view.summary, "send");
			const body = this.composerText.trim();
			if (!availability.available) {
				this.statusLine = availability.reason ?? MINIH_DISABLED_COMPOSER_REASON;
			} else if (body.length === 0) {
				this.statusLine = MINIH_EMPTY_COMPOSER_REASON;
			} else {
				this.callbacks.onSendMessage?.(body);
				this.composerText = "";
				this.statusLine = "minih: sending message";
			}
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.stopRun)) {
			const availability = actionAvailabilityForRun(this.view.summary, "stop");
			if (!availability.available) {
				this.statusLine = availability.reason ?? "stop disabled";
			} else {
				this.callbacks.onStopRun?.();
				this.statusLine = "minih: stop confirmation requested";
			}
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.focusPreviousPane)) {
			this.state = cycleFocusedPane(this.state, -1);
			this.callbacks.onStateChange?.(this.state);
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.focusNextPane)) {
			this.state = cycleFocusedPane(this.state, 1);
			this.callbacks.onStateChange?.(this.state);
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, pageActionForPane(this.state.focusedPane, "up"))) {
			this.state = pageFocusedPane(this.state, "up", paneTotal(this.view, this.state.focusedPane));
			this.callbacks.onStateChange?.(this.state);
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, pageActionForPane(this.state.focusedPane, "down"))) {
			this.state = pageFocusedPane(
				this.state,
				"down",
				paneTotal(this.view, this.state.focusedPane),
			);
			this.callbacks.onStateChange?.(this.state);
			this.callbacks.requestRender();
			return;
		}
		if (matchesAction(data, this.keybindings, MINIH_WORKBENCH_ACTIONS.deleteComposerChar)) {
			this.composerText = this.composerText.slice(0, -1);
			this.callbacks.requestRender();
			return;
		}
		if (isPrintableComposerInput(data)) {
			this.composerText = `${this.composerText}${data}`;
			this.callbacks.requestRender();
		}
	}

	invalidate(): void {}
}

export function renderWidthSafeModalView(
	view: MinihViewSnapshot,
	width: number,
	options: MinihModalRenderOptions,
): string[] {
	return widthSafeLines(renderModalView(view, options), width);
}
