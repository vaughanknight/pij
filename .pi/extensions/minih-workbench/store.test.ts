import { describe, expect, it } from "vitest";

import {
	actionAvailabilityForRun,
	buildOutboundMessageDraft,
	buildStopControlDraft,
	clampListSelection,
	classifyAttention,
	classifyMaterialEvent,
	closeModalSafely,
	cycleFocusedPane,
	DEFAULT_ACTIVE_RUN_LIMIT,
	DEFAULT_COMPLETED_RUN_LIMIT,
	DEFAULT_MINIH_WORKBENCH_KEYBINDINGS,
	defaultModalState,
	deriveRunCapability,
	diagnostic,
	MINIH_MODAL_PANES,
	MINIH_WORKBENCH_ACTIONS,
	type MinihRunSummary,
	makePaneSnapshot,
	minihError,
	minihOk,
	moveListSelection,
	openModalForRun,
	pageFocusedPane,
	pageModalPane,
	projectInventory,
	readOnlyNoWriteResult,
	redactAndTruncateModelText,
	resolveSelectedRun,
	sortRunSummaries,
	validateStopConfirmation,
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

	it("exports named actions and default keybindings without raw keys as action names", () => {
		expect(DEFAULT_ACTIVE_RUN_LIMIT).toBeGreaterThan(0);
		expect(DEFAULT_COMPLETED_RUN_LIMIT).toBeGreaterThan(0);
		expect(MINIH_WORKBENCH_ACTIONS.openRun).toBe("minih.openRun");
		expect(MINIH_WORKBENCH_ACTIONS.sendMessage).toBe("minih.sendMessage");
		expect(MINIH_WORKBENCH_ACTIONS.stopRun).toBe("minih.stopRun");
		expect(DEFAULT_MINIH_WORKBENCH_KEYBINDINGS[MINIH_WORKBENCH_ACTIONS.openRun]).toContain("enter");
		expect(DEFAULT_MINIH_WORKBENCH_KEYBINDINGS[MINIH_WORKBENCH_ACTIONS.closeView]).toContain(
			"escape",
		);
		expect(DEFAULT_MINIH_WORKBENCH_KEYBINDINGS[MINIH_WORKBENCH_ACTIONS.sendMessage]).toContain(
			"ctrl+s",
		);
		expect(Object.values(MINIH_WORKBENCH_ACTIONS)).not.toContain("up");
		expect(Object.values(MINIH_WORKBENCH_ACTIONS)).not.toContain("escape");
	});

	it("creates tagged adapter result helpers", () => {
		expect(minihOk({ value: 1 })).toEqual({ ok: true, value: { value: 1 }, diagnostics: [] });
		const result = minihError("MINIH_BAD_ARTIFACT", "bad", [
			diagnostic("error", "BAD", "bad artifact", "adapter"),
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("MINIH_BAD_ARTIFACT");
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

	it("enforces completed/report-ready inventory limit independently", () => {
		const inventory = projectInventory(
			[
				summary({ slug: "active", runId: "1" }),
				summary({
					slug: "done-a",
					runId: "2",
					status: {
						liveness: "completed",
						terminal: "completed",
						inside: "complete",
						outside: "unavailable",
						attention: "none",
					},
				}),
				summary({
					slug: "done-b",
					runId: "3",
					status: {
						liveness: "completed",
						terminal: "completed",
						inside: "complete",
						outside: "unavailable",
						attention: "none",
					},
				}),
			],
			{ activeLimit: 10, completedLimit: 1 },
		);
		expect(inventory.runs).toHaveLength(2);
		expect(inventory.runs.filter((run) => run.status.liveness === "completed")).toHaveLength(1);
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

	it("clamps and moves list selection without leaving bounds", () => {
		const runs = [summary({ slug: "a", runId: "1" }), summary({ slug: "b", runId: "2" })];
		expect(clampListSelection(runs, -10)).toBe(0);
		expect(clampListSelection(runs, 10)).toBe(1);
		expect(moveListSelection({ runs, selectedIndex: 0, delta: 1 })).toBe(1);
		expect(moveListSelection({ runs, selectedIndex: 1, delta: 1 })).toBe(1);
		expect(moveListSelection({ runs, selectedIndex: 1, delta: 1, wrap: true })).toBe(0);
		expect(clampListSelection([], 5)).toBe(0);
	});

	it("resolves and opens selected runs using cloned references", () => {
		const runs = [summary({ slug: "a", runId: "1" }), summary({ slug: "b", runId: "2" })];
		const selected = resolveSelectedRun(runs, 99);
		expect(selected).toEqual({ slug: "b", runId: "2" });
		const state = openModalForRun(selected ?? { slug: "missing", runId: "missing" });
		expect(state.open).toBe(true);
		expect(state.selectedRun).toEqual({ slug: "b", runId: "2" });
		expect(state.selectedRun).not.toBe(selected);
	});

	it("closes modal safely without control or stop side effects", () => {
		const state = openModalForRun({ slug: "agent", runId: "run" });
		const result = closeModalSafely(state);
		expect(result).toMatchObject({ ok: true, sentControl: false, sentStop: false });
		expect(result.state.open).toBe(false);
		expect(result.state.selectedRun).toBeUndefined();
		expect(result.message).toContain("untouched");
	});

	it("cycles focused panes across the full modal pane set", () => {
		let state = defaultModalState();
		expect(MINIH_MODAL_PANES).toEqual([
			"transcript",
			"tools",
			"coordination",
			"diagnostics",
			"report",
		]);
		state = cycleFocusedPane(state, 1);
		expect(state.focusedPane).toBe("tools");
		state = cycleFocusedPane(state, -1);
		expect(state.focusedPane).toBe("transcript");
		state = cycleFocusedPane(state, -1);
		expect(state.focusedPane).toBe("report");
	});

	it("pages modal panes independently", () => {
		let state = defaultModalState();
		state = pageModalPane(state, "tools", "down", 200);
		state = pageFocusedPane(state, "down", 200);
		expect(state.toolsCursor.offset).toBe(80);
		expect(state.transcriptCursor.offset).toBe(80);
		expect(state.coordinationCursor.offset).toBeUndefined();
		const back = pageModalPane(state, "tools", "up", 200);
		expect(back.toolsCursor.offset).toBe(0);
		expect(back.transcriptCursor.offset).toBe(80);
	});

	it("makes Phase 2 write/control attempts explicit errors", () => {
		const result = readOnlyNoWriteResult("send");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain("read-only");
	});

	it("derives writable capability only for active coordinated inbox runs", () => {
		const writable = summary({ slug: "agent", runId: "run", kind: "coordinated", hasInbox: true });
		expect(deriveRunCapability(writable)).toMatchObject({
			writable: true,
			canSend: true,
			canStop: true,
		});
		const standalone = summary({ slug: "solo", runId: "run", kind: "standalone", hasInbox: false });
		const availability = actionAvailabilityForRun(standalone, "send");
		expect(availability.available).toBe(false);
		expect(availability.reason).toContain("not coordinated");
	});

	it("builds bounded outbound message and explicit stop-control drafts", () => {
		const run = { slug: "agent", runId: "run" };
		const message = buildOutboundMessageDraft({
			run,
			subject: " hello ",
			body: "body",
		});
		expect(message).toMatchObject({ ...run, type: "task", subject: "hello", body: "body" });
		const stop = buildStopControlDraft(run);
		expect(stop).toEqual({
			...run,
			type: "control",
			subject: "stop",
			body: "stop agent/run",
			requiredConfirmation: "stop agent/run",
		});
		expect(validateStopConfirmation(run, "stop agent/run")).toBe(true);
		expect(validateStopConfirmation(run, "stop run")).toBe(false);
	});

	it("classifies material push events and suppresses churn", () => {
		const run = { slug: "agent", runId: "run" };
		const finding = classifyMaterialEvent({
			run,
			source: "inside",
			id: "f1",
			type: "finding",
			text: "HIGH issue",
		});
		expect(finding).toMatchObject({ material: true, reason: "finding", urgency: "normal" });
		const blockedStatus = classifyMaterialEvent({
			run,
			source: "state",
			id: "s1",
			type: "inside.status",
			text: "blocked waiting for permission",
		});
		expect(blockedStatus).toMatchObject({ material: true, reason: "blocker", urgency: "urgent" });
		const recoveryStatus = classifyMaterialEvent({
			run,
			source: "state",
			id: "s2",
			type: "state.status",
			text: "needs recovery after tool failure",
		});
		expect(recoveryStatus).toMatchObject({
			material: true,
			reason: "permission_or_recovery",
			urgency: "urgent",
		});
		const progress = classifyMaterialEvent({
			run,
			source: "events",
			id: "p1",
			type: "progress",
			text: "working",
		});
		expect(progress).toMatchObject({ material: false, reason: "routine_progress" });
	});

	it("redacts and truncates model-visible push text", () => {
		const result = redactAndTruncateModelText(
			"TOKEN=secret /Users/jordanknight/pi-hacking/pij/sensitive/path",
			24,
		);
		expect(result.redacted).toBe(true);
		expect(result.truncated).toBe(true);
		expect(result.text).not.toContain("secret");
		expect(result.text).not.toContain("jordanknight");
	});
});
