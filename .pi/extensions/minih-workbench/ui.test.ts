import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { diagnostic, type MinihViewSnapshot, openModalForRun, pageModalPane } from "./store.js";
import {
	MINIH_DISABLED_COMPOSER_REASON,
	MinihRunListComponent,
	MinihRunModalComponent,
	renderWidthSafeModalView,
	reportLineCount,
} from "./ui.js";

function viewWithMultilineText(): MinihViewSnapshot {
	return {
		slug: "agent",
		runId: "run",
		summary: {
			slug: "agent",
			runId: "run",
			kind: "coordinated",
			runPath: "/tmp/agent/run",
			status: {
				liveness: "active",
				terminal: "running",
				inside: "reviewing",
				outside: "available",
				attention: "needs_attention",
			},
			report: {
				state: "ready",
				path: "/tmp/agent/run/output/report.json",
				summary: "first line\nsecond line",
				findingsCount: 1,
				bytes: 22,
				truncated: false,
			},
			diagnostics: [diagnostic("warning", "MULTI", "diag one\ndiag two", "adapter")],
			materialEventCount: 2,
			hasInbox: true,
			hasState: true,
		},
		transcript: {
			items: [{ id: "1", type: "message", text: "hello\nworld" }],
			offset: 0,
			limit: 80,
			total: 1,
			maxBytes: 1024,
			bytes: 11,
			truncatedEvents: false,
			truncatedBytes: false,
			truncationMarker: "[truncated]",
		},
		tools: {
			items: [],
			offset: 0,
			limit: 80,
			total: 0,
			maxBytes: 1024,
			bytes: 0,
			truncatedEvents: false,
			truncatedBytes: false,
			truncationMarker: "[truncated]",
		},
		coordination: {
			items: [],
			offset: 0,
			limit: 80,
			total: 0,
			maxBytes: 1024,
			bytes: 0,
			truncatedEvents: false,
			truncatedBytes: false,
			truncationMarker: "[truncated]",
		},
		diagnostics: {
			items: [{ id: "d1", type: "warning", text: "diag pane\nline" }],
			offset: 0,
			limit: 80,
			total: 1,
			maxBytes: 1024,
			bytes: 14,
			truncatedEvents: false,
			truncatedBytes: false,
			truncationMarker: "[truncated]",
		},
		report: {
			state: "ready",
			path: "/tmp/agent/run/output/report.json",
			summary: "first line\nsecond line",
			findingsCount: 1,
			bytes: 22,
			truncated: false,
		},
	};
}

describe("minih-workbench UI rendering", () => {
	it("renders list anchors and moves selection with injected component keys", () => {
		const first = viewWithMultilineText().summary;
		const second = { ...first, slug: "other", runId: "run-2" };
		const opened: string[] = [];
		let renders = 0;
		const component = new MinihRunListComponent(
			{
				runs: [first, second],
				activeCount: 2,
				staleCount: 0,
				completedCount: 0,
				diagnosticCount: 1,
				truncated: false,
			},
			{
				onOpenRun: (run) => opened.push(`${run.slug}/${run.runId}`),
				onClose: () => {},
				onRefresh: () => {},
				requestRender: () => {
					renders += 1;
				},
			},
		);
		expect(component.render(120).join("\n")).toContain("MINIH WORKBENCH — RUN LIST");
		component.handleInput("\u001b[B");
		component.handleInput("\r");
		expect(opened).toEqual(["other/run-2"]);
		expect(renders).toBeGreaterThan(0);
	});

	it("renders modal anchors and changes focused pane without closing", () => {
		let closed = false;
		let state = openModalForRun({ slug: "agent", runId: "run" });
		const component = new MinihRunModalComponent(viewWithMultilineText(), state, {
			onClose: () => {
				closed = true;
			},
			onStateChange: (next) => {
				state = next;
			},
			requestRender: () => {},
		});
		const initial = component.render(120).join("\n");
		expect(initial).toContain("MINIH WORKBENCH — RUN VIEW agent/run");
		expect(initial).toContain(MINIH_DISABLED_COMPOSER_REASON);
		component.handleInput("\t");
		expect(state.focusedPane).toBe("tools");
		expect(closed).toBe(false);
		component.handleInput("\u001b");
		expect(closed).toBe(true);
		expect(state.open).toBe(false);
	});

	it("keeps multiline pane/report text on width-safe physical lines", () => {
		const lines = renderWidthSafeModalView(viewWithMultilineText(), 42, {
			state: openModalForRun({ slug: "agent", runId: "run" }),
		});
		expect(lines.every((line) => !line.includes("\n"))).toBe(true);
		expect(lines.every((line) => visibleWidth(line) <= 42)).toBe(true);
		expect(lines.join("\n")).toContain("hello ↵ world");
		expect(lines.join("\n")).toContain("summary:first line");
		expect(lines.join("\n")).toContain("summary:second line");
	});

	it("uses report cursor paging to change the visible report window", () => {
		const view = viewWithMultilineText();
		const longSummary = Array.from({ length: 6 }, (_item, index) => `line-${index}`).join("\n");
		view.report.summary = longSummary;
		view.summary.report.summary = longSummary;
		let state = {
			...openModalForRun({ slug: "agent", runId: "run" }),
			focusedPane: "report" as const,
			reportCursor: { limit: 2 },
		};
		const firstWindow = renderWidthSafeModalView(view, 80, { state }).join("\n");
		state = pageModalPane(state, "report", "down", reportLineCount(view.report));
		const secondWindow = renderWidthSafeModalView(view, 80, { state }).join("\n");
		expect(firstWindow).toContain("reportState:ready");
		expect(firstWindow).not.toContain("summary:line-0");
		expect(secondWindow).toContain("summary:line-0");
		expect(secondWindow).not.toBe(firstWindow);
	});
});
