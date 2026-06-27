import { describe, expect, it } from "vitest";

import {
	applyBinding,
	buildBoundNotice,
	buildFailedNotice,
	evaluateWatchdog,
	markFailed,
	markInitInjected,
	resolveAdoptSessionId,
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
