import { describe, expect, it } from "vitest";
import type { WatchdogSidecar } from "./types.js";
import {
	applyCompactPause,
	applyWatchdogExemption,
	applyWatchdogResume,
	applyWorkingTransition,
	buildWatchdogTurn,
	captureSlice,
	describeWatchdogState,
	effectiveWatchdog,
	evaluateResponse,
	isFireDue,
	parseWatchdogInterval,
	reconcileWatchdogExemption,
	shouldCapture,
} from "./watchdog.js";

describe("effectiveWatchdog and pause tiers", () => {
	it("is default-on at a twenty-minute interval when the sidecar is absent", () => {
		expect(effectiveWatchdog()).toEqual({
			enabled: true,
			intervalMs: 1_200_000,
			pausedBy: undefined,
		});
	});

	it("respects enabled and interval overrides", () => {
		expect(effectiveWatchdog({ enabled: false, intervalMs: 30_000 })).toEqual({
			enabled: false,
			intervalMs: 30_000,
			pausedBy: undefined,
		});
	});

	it("keeps a self pause through working transitions and resumes it only by verb", () => {
		const sidecar: WatchdogSidecar = { pausedBy: "self", pausedAtMs: 10 };
		expect(applyWorkingTransition(sidecar)).toBe(sidecar);
		expect(applyWatchdogResume(sidecar)).toEqual({});
	});

	it("auto-resumes a compact pause on the next observed working transition", () => {
		const sidecar: WatchdogSidecar = {
			enabled: true,
			intervalMs: 60_000,
			pausedBy: "compact",
			pausedAtMs: 10,
		};
		expect(applyWorkingTransition(sidecar)).toEqual({ enabled: true, intervalMs: 60_000 });
	});

	it("never resumes an exemption through either ordinary transition", () => {
		const sidecar: WatchdogSidecar = { pausedBy: "exempt", pausedAtMs: 10 };
		expect(applyWorkingTransition(sidecar)).toBe(sidecar);
		expect(applyWatchdogResume(sidecar)).toBe(sidecar);
	});
});

describe("bounded watchdog exemptions", () => {
	it("pins the exact expiry boundary and clears an expired exemption", () => {
		const exempt = applyWatchdogExemption({ intervalMs: 1 }, 1_000, 100);
		expect(exempt).toMatchObject({
			pausedBy: "exempt",
			pausedAtMs: 1_000,
			exemptUntilMs: 1_100,
		});
		for (const [nowMs, paused] of [
			[1_099, "exempt"],
			[1_100, undefined],
			[1_101, undefined],
		] as const) {
			const reconciled = reconcileWatchdogExemption(exempt, nowMs);
			expect(reconciled.effectivePause).toBe(paused);
			expect(reconciled.sidecar?.pausedBy).toBe(paused);
		}
	});

	it("migrates a valid legacy exemption once, and fails closed for missing or invalid time", () => {
		const legacy: WatchdogSidecar = { pausedBy: "exempt", pausedAtMs: 10 };
		expect(reconcileWatchdogExemption(legacy, 11)).toMatchObject({
			effectivePause: "exempt",
			sidecar: { exemptUntilMs: 3_600_010 },
		});
		for (const sidecar of [
			{ pausedBy: "exempt" },
			{ pausedBy: "exempt", pausedAtMs: Number.NaN },
			{ pausedBy: "exempt", pausedAtMs: 1, exemptUntilMs: Number.NaN },
		] as const) {
			expect(reconcileWatchdogExemption(sidecar, 2)).toMatchObject({
				effectivePause: undefined,
				sidecar: {},
			});
		}
	});
});

describe("isFireDue", () => {
	const enabled = effectiveWatchdog({ intervalMs: 100 });

	it("fires at the exact interval anchored to the newest activity", () => {
		expect(isFireDue(enabled, null, 1_000, 1_099)).toBe(false);
		expect(isFireDue(enabled, null, 1_000, 1_100)).toBe(true);
	});

	it("re-anchors the clock when the peer works after the previous fire", () => {
		expect(isFireDue(enabled, 1_000, 1_090, 1_150)).toBe(false);
		expect(isFireDue(enabled, 1_000, 1_090, 1_190)).toBe(true);
	});

	it("keeps every interval for a frozen peer rather than skipping later fires", () => {
		const fireTimes = [100, 200, 300, 400];
		let lastFireAt: number | null = null;
		for (const nowMs of fireTimes) {
			expect(isFireDue(enabled, lastFireAt, 0, nowMs)).toBe(true);
			lastFireAt = nowMs;
			expect(isFireDue(enabled, lastFireAt, 0, nowMs + 99)).toBe(false);
		}
	});

	it("never fires while disabled, paused, or exempt", () => {
		const blocked = [
			effectiveWatchdog({ enabled: false, intervalMs: 1 }),
			effectiveWatchdog({ intervalMs: 1, pausedBy: "self" }),
			effectiveWatchdog({ intervalMs: 1, pausedBy: "compact" }),
			effectiveWatchdog({ intervalMs: 1, pausedBy: "exempt" }),
		];
		for (const cfg of blocked) expect(isFireDue(cfg, 0, 0, 10_000)).toBe(false);
	});
});

describe("evaluateResponse", () => {
	it("derives suspect then stalled from consecutive delivered-but-silent fires", () => {
		expect(
			evaluateResponse({
				cfg: effectiveWatchdog(),
				consecutiveSilentFires: 1,
				eventAdvanced: false,
				pane: { changed: false, workingTransition: false },
			}),
		).toBe("suspect");
		expect(
			evaluateResponse({
				cfg: effectiveWatchdog(),
				consecutiveSilentFires: 2,
				eventAdvanced: false,
				pane: { changed: false, workingTransition: false },
			}),
		).toBe("stalled");
	});

	it("lets a paneless pi peer become stalled from event silence alone", () => {
		expect(
			evaluateResponse({
				cfg: effectiveWatchdog(),
				consecutiveSilentFires: 2,
				eventAdvanced: false,
			}),
		).toBe("stalled");
	});

	it("clears a prior silent-fire streak when real event activity recovers", () => {
		expect(
			evaluateResponse({
				cfg: effectiveWatchdog(),
				consecutiveSilentFires: 4,
				eventAdvanced: true,
			}),
		).toBe("responsive");
	});

	it("accepts a real pane delta or working transition as recovery", () => {
		const base = {
			cfg: effectiveWatchdog(),
			consecutiveSilentFires: 2,
			eventAdvanced: false,
		};
		expect(evaluateResponse({ ...base, pane: { changed: true, workingTransition: false } })).toBe(
			"responsive",
		);
		expect(evaluateResponse({ ...base, pane: { changed: false, workingTransition: true } })).toBe(
			"responsive",
		);
	});

	it("does not let any watchdog-attributable activity mask a frozen peer", () => {
		expect(
			evaluateResponse({
				cfg: effectiveWatchdog(),
				consecutiveSilentFires: 2,
				eventAdvanced: true,
				eventAdvanceWasWatchdog: true,
				pane: {
					changed: true,
					changeWasWatchdog: true,
					workingTransition: true,
					workingTransitionWasWatchdog: true,
				},
			}),
		).toBe("stalled");
	});

	it("excludes exempt peers from unresponsive derivation", () => {
		expect(
			evaluateResponse({
				cfg: effectiveWatchdog({ pausedBy: "exempt" }),
				consecutiveSilentFires: 99,
				eventAdvanced: false,
			}),
		).toBe("responsive");
	});
});

describe("buildWatchdogTurn", () => {
	it("builds a concise self-teaching turn", () => {
		const body = buildWatchdogTurn("pij-frozen-peer", 2, {
			...effectiveWatchdog(),
			paneAvailable: true,
		});
		expect(body).toMatchInlineSnapshot(
			'"[pij watchdog #2 for pij-frozen-peer] Keep going if working. If done, pause me with `pij watchdog pause pij-frozen-peer`; resume with `pij watchdog resume pij-frozen-peer`."',
		);
		expect(body).toContain("pij watchdog pause");
		expect(body).toContain("pij watchdog resume");
		expect(body.length).toBeLessThanOrEqual(400);
	});

	it("notes event-only detection when pane capture is unavailable", () => {
		const body = buildWatchdogTurn("pij-paneless", 1, {
			...effectiveWatchdog(),
			paneAvailable: false,
		});
		expect(body).toContain("Pane capture unavailable; watching event activity only.");
		expect(body.length).toBeLessThanOrEqual(400);
	});
});

describe("capture policy", () => {
	it("defaults to anomaly-only capture", () => {
		expect(shouldCapture({}, false)).toBe(false);
		expect(shouldCapture({}, true)).toBe(true);
	});

	it("supports always and never modes", () => {
		expect(shouldCapture({ mode: "always" }, false)).toBe(true);
		expect(shouldCapture({ mode: "never" }, true)).toBe(false);
		expect(shouldCapture({ mode: "anomaly" }, true)).toBe(true);
	});

	it("returns an empty slice for an empty pane or zero caps", () => {
		expect(captureSlice("", {})).toBe("");
		expect(captureSlice("text", { maxLines: 0 })).toBe("");
		expect(captureSlice("text", { maxBytes: 0 })).toBe("");
	});

	it("uses the default 40-line and 4096-byte caps", () => {
		const lines = Array.from({ length: 41 }, (_, index) => `line-${index}`);
		expect(captureSlice(lines.join("\n"), {}).split("\n")).toHaveLength(40);
		expect(Buffer.byteLength(captureSlice("x".repeat(4_097), {}), "utf8")).toBe(4_096);
	});

	it("keeps an exact line cap and takes only the tail when over it", () => {
		expect(captureSlice("one\ntwo", { maxLines: 2, maxBytes: 100 })).toBe("one\ntwo");
		expect(captureSlice("one\ntwo\nthree", { maxLines: 2, maxBytes: 100 })).toBe("two\nthree");
	});

	it("keeps an exact byte cap and takes a code-point-safe tail when over it", () => {
		expect(captureSlice("1234", { maxLines: 40, maxBytes: 4 })).toBe("1234");
		expect(captureSlice("12345", { maxLines: 40, maxBytes: 4 })).toBe("2345");
		expect(captureSlice("A🙂B", { maxLines: 40, maxBytes: 5 })).toBe("🙂B");
		expect(captureSlice("🙂🙂", { maxLines: 40, maxBytes: 3 })).toBe("");
	});

	it("enforces hard ceilings even when a policy asks for more", () => {
		const lines = Array.from({ length: 205 }, (_, index) => `line-${index}`);
		const captured = captureSlice(lines.join("\n"), {
			maxLines: 999,
			maxBytes: 999_999,
		});
		expect(captured.split("\n")).toHaveLength(200);
		expect(captured).toContain("line-204");
		expect(Buffer.byteLength(captured, "utf8")).toBeLessThanOrEqual(16_384);

		const bytes = captureSlice("x".repeat(16_385), {
			maxLines: 999,
			maxBytes: 999_999,
		});
		expect(Buffer.byteLength(bytes, "utf8")).toBe(16_384);
	});
});

describe("applyCompactPause", () => {
	it("creates a compact pause and is idempotent", () => {
		const paused = applyCompactPause(undefined, 1_000);
		expect(paused).toEqual({ pausedBy: "compact", pausedAtMs: 1_000 });
		expect(applyCompactPause(paused, 2_000)).toBe(paused);
	});

	it("does not downgrade a self pause or change an exemption", () => {
		const self: WatchdogSidecar = { pausedBy: "self", pausedAtMs: 1 };
		const exempt: WatchdogSidecar = { pausedBy: "exempt", pausedAtMs: 1 };
		expect(applyCompactPause(self, 2)).toBe(self);
		expect(applyCompactPause(exempt, 2)).toBe(exempt);
	});
});

describe("parseWatchdogInterval", () => {
	it("parses human durations to milliseconds", () => {
		expect(parseWatchdogInterval("30s")).toBe(30_000);
		expect(parseWatchdogInterval("20m")).toBe(1_200_000);
		expect(parseWatchdogInterval("1h")).toBe(3_600_000);
		expect(parseWatchdogInterval("90m")).toBe(5_400_000);
	});

	it("accepts a bare integer as milliseconds", () => {
		expect(parseWatchdogInterval("1200000")).toBe(1_200_000);
	});

	it("rejects non-positive, fractional, malformed, and unsafe input", () => {
		for (const bad of [
			"0",
			"0s",
			"-5m",
			"abc",
			"",
			"5x",
			"1.5h",
			"m",
			"10 m",
			"9007199254740991h",
		]) {
			expect(parseWatchdogInterval(bad)).toBeNull();
		}
	});
});

describe("describeWatchdogState", () => {
	// Activation-day finding (pij-civilian-takin, echoed by a mastodon seat): a
	// SUCCESSFUL pause rendered "enabled · self" — the word "paused" never
	// appeared, and the field carrying the pause state was positional and
	// unlabelled. The state must say what it is.
	it("says paused, and by whom, for each pause tier", () => {
		expect(describeWatchdogState({ enabled: true, pausedBy: "self" })).toBe("paused (self)");
		expect(describeWatchdogState({ enabled: true, pausedBy: "compact" })).toBe("paused (compact)");
	});

	it("names a live exemption as its own state", () => {
		expect(describeWatchdogState({ enabled: true, pausedBy: "exempt" })).toBe("exempt");
	});

	it("says watching when it is actually watching", () => {
		expect(describeWatchdogState({ enabled: true })).toBe("watching");
	});

	it("says disabled regardless of tier", () => {
		expect(describeWatchdogState({ enabled: false })).toBe("disabled");
		expect(describeWatchdogState({ enabled: false, pausedBy: "self" })).toBe("disabled");
	});

	it("surfaces the Plan-056 dominating states in priority order", () => {
		// globally-disabled dominates everything; relay dominates the sidecar.
		expect(describeWatchdogState({ enabled: false, globallyDisabled: true })).toBe(
			"globally-disabled",
		);
		expect(
			describeWatchdogState({ enabled: false, globallyDisabled: true, pausedBy: "self" }),
		).toBe("globally-disabled");
		expect(describeWatchdogState({ enabled: false, relay: true })).toBe("relay (never watched)");
	});

	it("never renders a paused, relay, or globally-disabled watchdog as bare 'enabled'", () => {
		for (const state of [
			{ enabled: true, pausedBy: "self" as const },
			{ enabled: true, pausedBy: "compact" as const },
			{ enabled: true, pausedBy: "exempt" as const },
			{ enabled: false, relay: true },
			{ enabled: false, globallyDisabled: true },
		]) {
			expect(describeWatchdogState(state)).not.toBe("enabled");
		}
	});
});
