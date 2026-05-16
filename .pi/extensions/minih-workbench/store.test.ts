import { describe, expect, it } from "vitest";

import {
	classifyAttention,
	defaultModalState,
	diagnostic,
	type MinihRunSummary,
	makePaneSnapshot,
	phase1NoWriteResult,
	projectInventory,
	sortRunSummaries,
} from "./store.js";

function summary(
	input: Partial<MinihRunSummary> & Pick<MinihRunSummary, "slug" | "runId">,
): MinihRunSummary {
	return {
		slug: input.slug,
		runId: input.runId,
		kind: input.kind ?? "unknown",
		runPath: input.runPath ?? `/tmp/${input.slug}/${input.runId}`,
		startedAt: input.startedAt,
		updatedAt: input.updatedAt,
		completedAt: input.completedAt,
		status: input.status ?? {
			liveness: "active",
			terminal: "running",
			inside: "running",
			outside: "available",
			attention: "none",
		},
		report: input.report ?? {
			state: "none",
			findingsCount: 0,
			bytes: 0,
			truncated: false,
		},
		diagnostics: input.diagnostics ?? [],
		materialEventCount: input.materialEventCount ?? 0,
		hasInbox: input.hasInbox ?? false,
		hasState: input.hasState ?? false,
	};
}

describe("minih-workbench store contracts", () => {
	it("starts with a closed modal state", () => {
		expect(defaultModalState()).toMatchObject({ open: false, focusedPane: "transcript" });
	});

	it("sorts active and stale runs before completed runs", () => {
		const runs = sortRunSummaries([
			summary({
				slug: "done",
				runId: "3",
				status: {
					liveness: "completed",
					terminal: "completed",
					inside: "complete",
					outside: "unavailable",
					attention: "none",
				},
			}),
			summary({
				slug: "stale",
				runId: "2",
				status: {
					liveness: "stale",
					terminal: "running",
					inside: "running",
					outside: "waiting",
					attention: "needs_attention",
				},
			}),
			summary({ slug: "active", runId: "1" }),
		]);
		expect(runs.map((run) => run.slug)).toEqual(["active", "stale", "done"]);
	});

	it("projects active plus bounded completed/report-ready inventory", () => {
		const inventory = projectInventory(
			[
				summary({ slug: "active", runId: "1" }),
				summary({
					slug: "done",
					runId: "2",
					status: {
						liveness: "completed",
						terminal: "completed",
						inside: "complete",
						outside: "unavailable",
						attention: "none",
					},
					report: { state: "ready", findingsCount: 1, bytes: 100, truncated: false },
				}),
			],
			{ activeLimit: 10, completedLimit: 1 },
		);
		expect(inventory.runs.map((run) => run.slug)).toEqual(["active", "done"]);
		expect(inventory.completedCount).toBe(1);
	});

	it("does not duplicate active report-ready runs in inventory", () => {
		const inventory = projectInventory(
			[
				summary({
					slug: "active-report",
					runId: "1",
					report: { state: "ready", findingsCount: 1, bytes: 100, truncated: false },
				}),
				summary({
					slug: "done",
					runId: "2",
					status: {
						liveness: "completed",
						terminal: "completed",
						inside: "complete",
						outside: "unavailable",
						attention: "none",
					},
				}),
			],
			{ activeLimit: 10, completedLimit: 5 },
		);
		expect(inventory.runs.map((run) => `${run.slug}/${run.runId}`)).toEqual([
			"active-report/1",
			"done/2",
		]);
	});

	it("bounds pane snapshots with truncation markers", () => {
		const pane = makePaneSnapshot(
			[
				{ id: "1", type: "message", text: "abcdef" },
				{ id: "2", type: "message", text: "ghijkl" },
			],
			{ limit: 2, maxBytes: 10 },
		);
		expect(pane.truncatedBytes).toBe(true);
		expect(pane.items.at(-1)?.text).toContain("[truncated]");
	});

	it("keeps attention classification separate from terminal status", () => {
		expect(
			classifyAttention({
				status: { liveness: "active", inside: "running" },
				diagnostics: [diagnostic("warning", "STALE_PEER", "peer is slow")],
			}),
		).toBe("needs_attention");
	});

	it("makes Phase 1 write/control attempts explicit errors", () => {
		const result = phase1NoWriteResult("send");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain("read-only");
	});
});
