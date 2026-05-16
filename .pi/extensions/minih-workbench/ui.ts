import { truncateToWidth } from "@earendil-works/pi-tui";

import {
	DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
	MINIH_MODAL_PANES,
	MINIH_WORKBENCH_ACTIONS,
	type MinihDiagnostic,
	type MinihInventorySnapshot,
	type MinihModalPane,
	type MinihModalState,
	type MinihPaneSnapshot,
	type MinihReportSummary,
	type MinihRunSummary,
	type MinihViewSnapshot,
	type MinihWorkbenchKeybindings,
} from "./store.js";

export const MINIH_DISABLED_COMPOSER_REASON =
	"Composer disabled: Phase 2 is read-only; send/stop/push arrive in Phase 3.";

export interface MinihListRenderOptions {
	selectedIndex?: number;
	keybindings?: MinihWorkbenchKeybindings;
	showHelp?: boolean;
}

export interface MinihModalRenderOptions {
	state: MinihModalState;
	keybindings?: MinihWorkbenchKeybindings;
	showHelp?: boolean;
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
		lines.push(`  - ${timestamp}[${item.type}] ${item.text}`);
	}
	return lines;
}

export function renderReportSummary(report: MinihReportSummary, focused: MinihModalPane): string[] {
	const lines = [paneTitle("report", focused)];
	lines.push(
		`reportState:${report.state} findings:${report.findingsCount} bytes:${report.bytes} truncated:${report.truncated}`,
	);
	if (report.path) lines.push(`path:${report.path}`);
	if (report.summary && report.summary.length > 0) lines.push(`summary:${report.summary}`);
	if (!report.summary && report.state === "none") lines.push("  (no report yet)");
	return lines;
}

export function renderDiagnosticsSummary(diagnostics: readonly MinihDiagnostic[]): string[] {
	if (diagnostics.length === 0) return ["Diagnostics summary: none"];
	return [
		`Diagnostics summary: ${diagnostics.length}`,
		...diagnostics.map((item) => `${item.severity}:${item.code}:${item.message}`),
	];
}

function activePaneSnapshot(view: MinihViewSnapshot, pane: MinihModalPane): MinihPaneSnapshot | undefined {
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
		MINIH_DISABLED_COMPOSER_REASON,
		`Focused pane: ${focusedPane}`,
	];
	for (const pane of MINIH_MODAL_PANES) {
		if (pane === "report") lines.push(...renderReportSummary(view.report, focusedPane));
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
			)} pane • page keys scroll focused pane • ${keys(
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

export function renderWidthSafeModalView(
	view: MinihViewSnapshot,
	width: number,
	options: MinihModalRenderOptions,
): string[] {
	return widthSafeLines(renderModalView(view, options), width);
}
