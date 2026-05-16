import { describe, expect, it } from "vitest";

import {
	defaultFixtureRoot,
	listMinihRuns,
	readMinihReport,
	readMinihRunStatus,
} from "./minih-adapter.js";

const rootDir = defaultFixtureRoot();

function expectOk<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

describe("minih-adapter fixtures", () => {
	it("lists active, stale, completed, malformed, missing, permission-like, and large runs", async () => {
		const result = await listMinihRuns({ rootDir, nowMs: Date.parse("2026-05-16T03:55:00.000Z") });
		const inventory = expectOk(result);
		const keys = inventory.runs.map((run) => `${run.slug}/${run.runId}`);
		expect(keys).toContain("code-review-companion/run-active");
		expect(keys).toContain("slow-worker/run-stale");
		expect(keys).toContain("companion-completed/run-completed");
		expect(keys).toContain("broken-agent/run-malformed");
		expect(keys).toContain("partial-agent/run-missing");
		expect(keys).toContain("permission-agent/run-permission");
		expect(keys).toContain("large-output/run-large");
	});

	it("separates active/stale/completed status axes", async () => {
		const result = await listMinihRuns({ rootDir, nowMs: Date.parse("2026-05-16T03:55:00.000Z") });
		const inventory = expectOk(result);
		const active = inventory.runs.find((run) => run.slug === "code-review-companion");
		const stale = inventory.runs.find((run) => run.slug === "slow-worker");
		const completed = inventory.runs.find((run) => run.slug === "companion-completed");
		expect(active?.status).toMatchObject({
			liveness: "active",
			terminal: "running",
			inside: "reviewing",
		});
		expect(stale?.status.liveness).toBe("stale");
		expect(completed?.status).toMatchObject({
			liveness: "completed",
			terminal: "completed",
			inside: "complete",
		});
	});

	it("reads a coordinated run view with transcript, tools, and coordination panes", async () => {
		const result = await readMinihRunStatus({
			rootDir,
			slug: "code-review-companion",
			runId: "run-active",
			nowMs: Date.parse("2026-05-16T03:55:00.000Z"),
		});
		const view = expectOk(result);
		expect(view.summary.kind).toBe("coordinated");
		expect(view.transcript.items.map((item) => item.text).join("\n")).toContain("Loaded briefing");
		expect(view.tools.items.map((item) => item.text).join("\n")).toContain("rg");
		expect(view.coordination.items.map((item) => item.text).join("\n")).toContain(
			"Review read-only",
		);
	});

	it("reads a completed report summary", async () => {
		const result = await readMinihReport({
			rootDir,
			slug: "companion-completed",
			runId: "run-completed",
		});
		const report = expectOk(result);
		expect(report.state).toBe("ready");
		expect(report.findingsCount).toBe(1);
		expect(report.summary).toContain("Completed companion review");
	});

	it("turns malformed, missing, and permission-like artifacts into diagnostics", async () => {
		const malformed = expectOk(
			await readMinihRunStatus({ rootDir, slug: "broken-agent", runId: "run-malformed" }),
		);
		const missing = expectOk(
			await readMinihRunStatus({ rootDir, slug: "partial-agent", runId: "run-missing" }),
		);
		const permission = expectOk(
			await readMinihRunStatus({ rootDir, slug: "permission-agent", runId: "run-permission" }),
		);
		expect(malformed.diagnostics.items.map((item) => item.text).join("\n")).toContain(
			"MINIH_BAD_RUN_JSON",
		);
		expect(missing.summary.status.liveness).toBe("missing");
		expect(permission.summary.status.attention).toBe("blocked");
	});

	it("bounds large tool output with truncation markers", async () => {
		const result = await readMinihRunStatus({
			rootDir,
			slug: "large-output",
			runId: "run-large",
			tools: { maxBytes: 80, limit: 10 },
		});
		const view = expectOk(result);
		expect(view.tools.truncatedBytes).toBe(true);
		expect(view.tools.items.at(-1)?.text).toContain("[truncated]");
	});

	it("returns a tagged error for an unknown run", async () => {
		const result = await readMinihRunStatus({ rootDir, slug: "missing", runId: "nope" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("MINIH_RUN_NOT_FOUND");
	});
});
