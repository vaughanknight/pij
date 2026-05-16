import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { diagnostic, type MinihViewSnapshot, openModalForRun } from "./store.js";
import { renderWidthSafeModalView } from "./ui.js";

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
	it("keeps multiline pane/report text on width-safe physical lines", () => {
		const lines = renderWidthSafeModalView(viewWithMultilineText(), 42, {
			state: openModalForRun({ slug: "agent", runId: "run" }),
		});
		expect(lines.every((line) => !line.includes("\n"))).toBe(true);
		expect(lines.every((line) => visibleWidth(line) <= 42)).toBe(true);
		expect(lines.join("\n")).toContain("hello ↵ world");
		expect(lines.join("\n")).toContain("summary:first line ↵ second line");
	});
});
