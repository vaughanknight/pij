import { describe, expect, it } from "vitest";

import {
	applyBinding,
	buildBoundNotice,
	buildDeadNotice,
	buildFailedNotice,
	buildStalledNotice,
	evaluateWatchdog,
	markFailed,
	markInitInjected,
	reattachIdentity,
	resolveAdoptSessionId,
	resolveAdoptSessionIdForHarness,
	resolveStableIdentity,
	shouldInjectInit,
} from "./binding.js";
import type { SessionDescriptor } from "./types.js";

const PENDING: SessionDescriptor = {
	id: "pij-worker",
	folder: "/Users/jo/pi-hacking/pij",
	dataDir: "/Users/jo/.pij/pij-worker",
	eventsPath: "/Users/jo/.pij/pij-worker/events.ndjson",
	pid: 4242,
	startedAt: "2026-06-27T00:00:00.000Z",
	harness: "claude",
	lifecycle: "pending",
	spawnedBy: "pij-creator",
};

describe("applyBinding", () => {
	it("attaches harnessSessionId and flips lifecycle to bound", () => {
		const bound = applyBinding(PENDING, "claude-sess-123");
		expect(bound.harnessSessionId).toBe("claude-sess-123");
		expect(bound.lifecycle).toBe("bound");
		expect(bound.id).toBe(PENDING.id); // identity preserved
	});
});

describe("init exactly-once", () => {
	it("shouldInjectInit is true until the marker is set, false after (survives restart)", () => {
		expect(shouldInjectInit(PENDING)).toBe(true);
		const injected = markInitInjected(PENDING, "2026-06-27T00:00:05.000Z");
		expect(injected.initInjectedAt).toBe("2026-06-27T00:00:05.000Z");
		expect(shouldInjectInit(injected)).toBe(false);
	});
});

describe("markFailed", () => {
	it("flips lifecycle to failed", () => {
		expect(markFailed(PENDING).lifecycle).toBe("failed");
	});
});

describe("evaluateWatchdog", () => {
	const base = { readyAtMs: 1000, timeoutMs: 5000 };

	it("bound → stand down regardless of time", () => {
		expect(evaluateWatchdog({ ...base, bound: true, nowMs: 999_999 }).kind).toBe("bound");
	});

	it("within the first window → wait", () => {
		expect(evaluateWatchdog({ ...base, bound: false, nowMs: 1000 + 4999 }).kind).toBe("wait");
	});

	it("first window elapsed, not yet re-sent → resend-phonehome", () => {
		expect(evaluateWatchdog({ ...base, bound: false, nowMs: 1000 + 5000 }).kind).toBe(
			"resend-phonehome",
		);
	});

	it("after the re-send, within the second window → wait", () => {
		const d = evaluateWatchdog({ ...base, bound: false, nowMs: 1000 + 8000, resentAtMs: 6000 });
		expect(d.kind).toBe("wait");
	});

	it("second window elapsed after the re-send → fail (no silent dead spawn)", () => {
		const d = evaluateWatchdog({
			...base,
			bound: false,
			nowMs: 6000 + 5000,
			resentAtMs: 6000,
		});
		expect(d.kind).toBe("fail");
		if (d.kind === "fail") expect(d.reason).toContain("phonehome re-sent");
	});
});

describe("resolveAdoptSessionId (adopt's own binding rule, AC-14)", () => {
	it("prefers the adopting shell's CLAUDE_CODE_SESSION_ID (self-adopt)", () => {
		expect(resolveAdoptSessionId("sess-self", ["newest", "older"])).toBe("sess-self");
	});
	it("falls back to the newest transcript stem (pane-start-time proxy)", () => {
		expect(resolveAdoptSessionId(undefined, ["newest", "older"])).toBe("newest");
		expect(resolveAdoptSessionId("  ", ["newest"])).toBe("newest");
	});
	it("returns null when nothing resolves (caller writes pending + asks phonehome)", () => {
		expect(resolveAdoptSessionId(undefined, [])).toBeNull();
	});
});

describe("resolveAdoptSessionIdForHarness (harness-aware adopt, findings 02/02b/03)", () => {
	const CLAUDE_STEM = "claude-stem-uuid";
	const CODEX_PATH =
		"/Users/jo/.codex/sessions/2026/07/04/rollout-2026-07-04T00-00-00-abcdef01-2222-3333-4444-555555555555.jsonl";
	const COPILOT_UUID = "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad";

	const base = {
		envSessionId: undefined,
		claudeStemsNewestFirst: [] as readonly string[],
		codexRolloutPathsNewestFirst: [] as readonly string[],
		copilotSessionId: null as string | null,
	};

	it("claude → env id when present (byte-for-byte the existing rule)", () => {
		const r = resolveAdoptSessionIdForHarness({
			...base,
			harness: "claude",
			envSessionId: "sess-self",
			claudeStemsNewestFirst: ["newest"],
		});
		expect(r).toEqual({ harnessSessionId: "sess-self" });
	});

	it("claude → newest stem when no env id", () => {
		const r = resolveAdoptSessionIdForHarness({
			...base,
			harness: "claude",
			claudeStemsNewestFirst: [CLAUDE_STEM, "older"],
		});
		expect(r).toEqual({ harnessSessionId: CLAUDE_STEM });
	});

	it("codex → newest rollout's trailing UUID + its absolute transcriptPath", () => {
		const r = resolveAdoptSessionIdForHarness({
			...base,
			harness: "codex",
			codexRolloutPathsNewestFirst: [CODEX_PATH],
		});
		expect(r).toEqual({
			harnessSessionId: "abcdef01-2222-3333-4444-555555555555",
			transcriptPath: CODEX_PATH,
		});
	});

	it("copilot → the scanned session-state uuid (NEVER a claude stem, finding 02b)", () => {
		const r = resolveAdoptSessionIdForHarness({
			...base,
			harness: "copilot",
			// A claude transcript sits in-cwd — it must NOT be picked for copilot.
			claudeStemsNewestFirst: [CLAUDE_STEM],
			copilotSessionId: COPILOT_UUID,
		});
		expect(r).toEqual({ harnessSessionId: COPILOT_UUID });
	});

	it("copilot with no session-state dir → null (never falls through to claude)", () => {
		const r = resolveAdoptSessionIdForHarness({
			...base,
			harness: "copilot",
			claudeStemsNewestFirst: [CLAUDE_STEM],
			copilotSessionId: null,
		});
		expect(r).toEqual({ harnessSessionId: null });
	});

	it("codex with no rollout → null, no transcriptPath (pending preserved, AC-4)", () => {
		const r = resolveAdoptSessionIdForHarness({ ...base, harness: "codex" });
		expect(r).toEqual({ harnessSessionId: null });
	});
});

describe("restart-stable identity resolution (T029 / AC-15)", () => {
	const bound = (over: Partial<SessionDescriptor> = {}): SessionDescriptor => ({
		...PENDING,
		id: "pij-original",
		harness: "claude",
		harnessSessionId: "native-1",
		lifecycle: "bound",
		dataDir: "/Users/jo/.pij/pij-original",
		eventsPath: "/Users/jo/.pij/pij-original/events.ndjson",
		...over,
	});

	it("one exact tuple match reuses its existing pij id", () => {
		expect(resolveStableIdentity([bound()], "claude", "native-1", "pij-derived")).toEqual({
			ok: true,
			value: { kind: "reuse", descriptor: bound() },
		});
	});

	it("zero matches claims the deterministic candidate id", () => {
		expect(resolveStableIdentity([], "claude", "native-1", "pij-derived")).toEqual({
			ok: true,
			value: { kind: "claim", id: "pij-derived" },
		});
	});

	it("the same native id in another harness is not a match", () => {
		const copilot = bound({ id: "pij-copilot", harness: "copilot" });
		expect(resolveStableIdentity([copilot], "claude", "native-1", "pij-derived")).toEqual({
			ok: true,
			value: { kind: "claim", id: "pij-derived" },
		});
	});

	it("multiple exact matches fail loudly instead of minting another identity", () => {
		const result = resolveStableIdentity(
			[bound(), bound({ id: "pij-duplicate" })],
			"claude",
			"native-1",
			"pij-derived",
		);
		expect(result).toMatchObject({ ok: false, code: "E-AMBIG" });
	});

	it("a deterministic candidate occupied by another tuple is a collision", () => {
		const result = resolveStableIdentity(
			[bound({ id: "pij-derived", harnessSessionId: "someone-else" })],
			"claude",
			"native-1",
			"pij-derived",
		);
		expect(result).toMatchObject({ ok: false, code: "E-AMBIG" });
	});

	it("a legacy untagged Pi descriptor at its derived id is upgraded in place", () => {
		const legacy = bound({
			id: "pij-derived",
			harness: undefined,
			harnessSessionId: undefined,
		});
		expect(resolveStableIdentity([legacy], "pi", "pi-native-1", "pij-derived")).toEqual({
			ok: true,
			value: { kind: "reuse", descriptor: legacy },
		});
	});

	it("reattachment preserves identity/history and replaces runtime attachment fields", () => {
		const existing = bound({
			paneId: "%1",
			pid: 10,
			folder: "/old",
			state: "working",
			lastEventAt: "2026-07-10T00:00:00.000Z",
			failureReason: "dead",
			prime: false,
		});
		const reattached = reattachIdentity(existing, {
			harness: "claude",
			harnessSessionId: "native-1",
			paneId: "%9",
			pid: 99,
			folder: "/new",
		});
		expect(reattached).toMatchObject({
			id: "pij-original",
			dataDir: "/Users/jo/.pij/pij-original",
			eventsPath: "/Users/jo/.pij/pij-original/events.ndjson",
			startedAt: PENDING.startedAt,
			lastEventAt: "2026-07-10T00:00:00.000Z",
			folder: "/new",
			paneId: "%9",
			pid: 99,
			state: "idle",
			lifecycle: "bound",
			prime: false,
		});
		expect(reattached.failureReason).toBeUndefined();
	});
});

describe("creator notices", () => {
	it("buildBoundNotice targets the creator and names the binding (AC-05)", () => {
		const bound = applyBinding(PENDING, "claude-sess-123");
		expect(buildBoundNotice(bound)).toEqual({
			to: "pij-creator",
			text: "✅ pij-worker is ready (bound to claude session claude-sess-123).",
		});
	});

	it("buildFailedNotice targets the creator with the reason (AC-04)", () => {
		const n = buildFailedNotice(PENDING, "timed out");
		expect(n).toMatchObject({ to: "pij-creator" });
		expect(n?.text).toContain("failed to bind: timed out");
	});

	it("returns null when there is no creator to notify", () => {
		const orphan: SessionDescriptor = { ...PENDING, spawnedBy: undefined };
		expect(buildBoundNotice(orphan)).toBeNull();
		expect(buildFailedNotice(orphan, "x")).toBeNull();
	});
});

// ─── T011: stalled/dead notices (whole-life push) ────────────────────────────

const BOUND_DESC: SessionDescriptor = {
	...PENDING,
	lifecycle: "bound",
	harnessSessionId: "claude-sess-123",
	boundModel: "claude-sonnet-4-6",
};

describe("buildStalledNotice", () => {
	it("targets the creator with a stall message (AC-03)", () => {
		const n = buildStalledNotice(BOUND_DESC);
		expect(n).not.toBeNull();
		expect(n?.to).toBe("pij-creator");
		expect(n?.text).toMatch(/stall|stalled|quiet/i);
		expect(n?.text).toContain(BOUND_DESC.id);
	});

	it("includes boundModel when available", () => {
		const n = buildStalledNotice(BOUND_DESC);
		expect(n?.text).toContain("claude-sonnet-4-6");
	});

	it("returns null when there is no creator", () => {
		const orphan: SessionDescriptor = { ...BOUND_DESC, spawnedBy: undefined };
		expect(buildStalledNotice(orphan)).toBeNull();
	});
});

describe("buildDeadNotice", () => {
	it("targets the creator with a dead-peer message", () => {
		const n = buildDeadNotice(BOUND_DESC, "dead");
		expect(n?.to).toBe("pij-creator");
		expect(n?.text).toMatch(/dead|exit|gone/i);
		expect(n?.text).toContain(BOUND_DESC.id);
	});

	it("includes the machine-stable reason", () => {
		const n = buildDeadNotice(BOUND_DESC, "model-not-supported");
		expect(n?.text).toContain("model-not-supported");
	});

	it("does not claim provider failures have exited or will not recover", () => {
		const n = buildDeadNotice(BOUND_DESC, "quota");
		expect(n?.text).toContain("quota");
		expect(n?.text).not.toContain("has exited");
		expect(n?.text).not.toContain("will not recover");
		expect(n?.text).toMatch(/appears stuck|provider error/i);
	});

	it("returns null when there is no creator", () => {
		const orphan: SessionDescriptor = { ...BOUND_DESC, spawnedBy: undefined };
		expect(buildDeadNotice(orphan, "dead")).toBeNull();
	});
});
