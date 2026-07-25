import { describe, expect, it } from "vitest";
import { buildRevivedDescriptor, parseReviveArgs, planRevive, REVIVE_REFRAME } from "./revive.js";
import type { SessionDescriptor } from "./types.js";

const NOW = "2026-07-25T01:02:03.000Z";

function descriptor(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-finished-fox",
		role: "worker",
		folder: "/repo/s066-session-revive",
		dataDir: "/pij/pij-finished-fox",
		eventsPath: "/pij/pij-finished-fox/events.ndjson",
		pid: 10,
		startedAt: "2026-07-24T00:00:00.000Z",
		harness: "claude",
		harnessSessionId: "11111111-2222-4333-8444-555555555555",
		paneId: "%7",
		windowId: "@4",
		spawnedBy: "pij-parent",
		parentId: "pij-parent",
		lifecycle: "dissolved",
		boundModel: "claude-sonnet-5",
		effort: "high",
		closeIntent: {
			actor: "pij-parent",
			kind: "cli-close",
			requestedAt: "2026-07-24T02:00:00.000Z",
		},
		terminal: {
			disposition: "requested",
			observedAt: "2026-07-24T02:00:01.000Z",
			evidence: "pane-missing",
		},
		deathNoticeLatchedAt: "2026-07-24T02:00:01.000Z",
		failureReason: "dead",
		initInjectedAt: "2026-07-24T00:00:01.000Z",
		lastTickAt: "2026-07-24T01:00:00.000Z",
		...overrides,
	};
}

const noArtifacts = {
	claudePath: undefined,
	copilotPath: undefined,
	codexPaths: [] as string[],
	piPaths: [] as string[],
	ompPaths: [] as string[],
};

describe("parseReviveArgs", () => {
	it("accepts one id with layout and json", () => {
		expect(parseReviveArgs(["pij-finished-fox", "--layout", "window", "--json"])).toEqual({
			ok: true,
			value: { id: "pij-finished-fox", layout: "window", json: true },
		});
	});

	it("rejects unknown flags and missing ids", () => {
		expect(parseReviveArgs(["--fresh"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseReviveArgs([])).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("planRevive — exact native continuation only", () => {
	it("builds Claude --resume without fork/create flags", () => {
		const result = planRevive(
			descriptor(),
			{ ...noArtifacts, claudePath: "/home/.claude/native.jsonl" },
			{ spawnId: "revive-1", parentId: "pij-parent" },
		);
		expect(result).toMatchObject({ ok: true, value: { runtime: "claude" } });
		if (!result.ok) return;
		expect(result.value.command).toMatchObject({ cmd: "claude" });
		expect(result.value.command.args).toEqual([
			"--dangerously-skip-permissions",
			"--resume",
			"11111111-2222-4333-8444-555555555555",
			"--model",
			"claude-sonnet-5",
			"--effort",
			"high",
		]);
		expect(result.value.command.args).not.toContain("--fork-session");
		expect(result.value.command.args).not.toContain("--session-id");
	});

	it("uses Copilot's fail-loud --resume form, never create-when-missing --session-id", () => {
		const result = planRevive(
			descriptor({ harness: "copilot", boundModel: "gpt-5.6-sol" }),
			{ ...noArtifacts, copilotPath: "/home/.copilot/session-state/native/events.jsonl" },
			{ spawnId: "revive-2", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.command.cmd).toBe("copilot");
		expect(result.value.command.args).toContain("--resume=11111111-2222-4333-8444-555555555555");
		expect(result.value.command.args).not.toContain("--session-id");
	});

	it("puts Codex resume after global options and retains the exact rollout", () => {
		const rollout = "/home/.codex/sessions/2026/07/24/rollout-native.jsonl";
		const result = planRevive(
			descriptor({ harness: "codex", transcriptPath: rollout, boundModel: "gpt-5.5" }),
			{ ...noArtifacts, codexPaths: [rollout] },
			{ spawnId: "revive-3", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifactPath).toBe(rollout);
		expect(result.value.command.args).toEqual([
			"--dangerously-bypass-approvals-and-sandbox",
			"--model",
			"gpt-5.5",
			"-c",
			"model_reasoning_effort=high",
			"resume",
			"11111111-2222-4333-8444-555555555555",
		]);
	});

	it("uses existing-only Pi --session and persists runtime provenance", () => {
		const session = "/home/.pi/agent/sessions/repo/timestamp_native.jsonl";
		const result = planRevive(
			descriptor({ harness: "pi", runtimeBin: "pi", boundModel: "openai/gpt-5.5" }),
			{ ...noArtifacts, piPaths: [session] },
			{ spawnId: "revive-4", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.command.cmd).toBe("pi");
		expect(result.value.command.args.slice(0, 2)).toEqual(["--session", session]);
		expect(result.value.command.args).not.toContain("--session-id");
		expect(result.value.command.env.PIJ_PI_BIN).toBe("pi");
		expect(result.value.command.env.PIJ_SPAWN_TASK).toBe(REVIVE_REFRAME);
	});

	it("uses fail-loud OMP --resume and infers a legacy runtime only from one exact store match", () => {
		const session = "/home/.omp/agent/sessions/repo/timestamp_native.jsonl";
		const result = planRevive(
			descriptor({ harness: "pi", runtimeBin: undefined }),
			{ ...noArtifacts, ompPaths: [session] },
			{ spawnId: "revive-5", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.runtime).toBe("omp");
		expect(result.value.command.cmd).toBe("omp");
		expect(result.value.command.args).toContain(`--resume=${session}`);
		expect(result.value.command.args).not.toContain("--session-id");
	});

	it("accepts terminal or proven-dead descriptors but refuses a live prior attachment", () => {
		const artifact = { ...noArtifacts, claudePath: "/home/.claude/native.jsonl" };
		expect(
			planRevive(descriptor({ lifecycle: "bound" }), artifact, { spawnId: "terminal" }),
		).toMatchObject({ ok: true });
		expect(
			planRevive(descriptor({ lifecycle: "bound", terminal: undefined }), artifact, {
				spawnId: "dead",
				priorAttachmentAlive: false,
			}),
		).toMatchObject({ ok: true });
		expect(
			planRevive(descriptor(), artifact, {
				spawnId: "alive",
				priorAttachmentAlive: true,
			}),
		).toMatchObject({ ok: false, code: "E-ARG", message: expect.stringContaining("live prior") });
	});

	it("rejects multiple exact artifacts for an explicitly recorded runtime", () => {
		expect(
			planRevive(
				descriptor({ harness: "pi", runtimeBin: "pi" }),
				{ ...noArtifacts, piPaths: ["/pi/a.jsonl", "/pi/b.jsonl"] },
				{ spawnId: "ambiguous" },
			),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
	});

	it("fails before launch when identity, lifecycle, artifact, or legacy runtime is ambiguous", () => {
		expect(planRevive(null, noArtifacts, { spawnId: "r" })).toMatchObject({
			ok: false,
			code: "E-NOID",
		});
		expect(
			planRevive(descriptor({ lifecycle: "bound", terminal: undefined }), noArtifacts, {
				spawnId: "r",
			}),
		).toMatchObject({ ok: false, code: "E-ARG" });
		expect(planRevive(descriptor(), noArtifacts, { spawnId: "r" })).toMatchObject({
			ok: false,
			code: "E-NOREG",
		});
		expect(
			planRevive(
				descriptor({ harness: "pi", runtimeBin: undefined }),
				{ ...noArtifacts, piPaths: ["/pi/session.jsonl"], ompPaths: ["/omp/session.jsonl"] },
				{ spawnId: "r" },
			),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
	});
});

describe("buildRevivedDescriptor", () => {
	it("preserves durable identity but removes terminal runtime state", () => {
		const revived = buildRevivedDescriptor(descriptor(), {
			paneId: "%99",
			windowId: "@20",
			pid: 999,
			spawnId: "revive-9",
			nowIso: NOW,
			reviverId: "pij-current-operator",
		});
		expect(revived).toMatchObject({
			id: "pij-finished-fox",
			dataDir: "/pij/pij-finished-fox",
			spawnedBy: "pij-current-operator",
			parentId: "pij-current-operator",
			paneId: "%99",
			windowId: "@20",
			pid: 999,
			lifecycle: "pending",
			plannedHarnessSessionId: "11111111-2222-4333-8444-555555555555",
			revivePendingAt: NOW,
		});
		for (const key of [
			"closeIntent",
			"terminal",
			"deathNoticeLatchedAt",
			"failureReason",
			"initInjectedAt",
			"lastTickAt",
		]) {
			expect(revived).not.toHaveProperty(key);
		}
	});

	it("the revive reframe forbids continuation without carrying a recall answer", () => {
		expect(REVIVE_REFRAME).toMatch(/REVIVED/);
		expect(REVIVE_REFRAME).toMatch(/Do NOT continue/i);
		expect(REVIVE_REFRAME).toMatch(/wait for new instructions/i);
		expect(REVIVE_REFRAME).not.toMatch(/seed|golden|answer/i);
	});
});
