// FX001-1 tests: typed `vetted.overrides` accepts a finding-rule set.
// Direct unit tests of the override parser + per-finding acceptance logic.

import { beforeEach, describe, expect, it } from "vitest";
import { _resetLegacyOverrideWarning, allWarnsAccepted, parseOverrides } from "./overrides.js";
import type { Finding } from "./types.js";

const warnFinding = (rule: string): Finding => ({ rule, msg: "x", severity: "warn" });

describe("parseOverrides (FX001-1)", () => {
	beforeEach(() => {
		_resetLegacyOverrideWarning();
	});

	it("returns null when no override present", () => {
		expect(parseOverrides(undefined)).toBeNull();
	});

	it("passes through typed { rules, reason } objects", () => {
		const out = parseOverrides({
			rules: ["github-trust:no-license"],
			reason: "install-only",
		});
		expect(out).toEqual({ rules: ["github-trust:no-license"], reason: "install-only" });
	});

	it("parses legacy free-text strings as { rules: [], reason: <text> } (fail-safe — accepts nothing)", () => {
		const out = parseOverrides("free text reason");
		expect(out).toEqual({ rules: [], reason: "free text reason" });
	});

	it("filters non-string entries out of rules[]", () => {
		const out = parseOverrides({
			rules: ["valid", 42 as unknown as string, null as unknown as string],
			reason: "x",
		});
		expect(out?.rules).toEqual(["valid"]);
	});
});

describe("allWarnsAccepted (FX001-1)", () => {
	it("returns false when override is null", () => {
		expect(allWarnsAccepted([warnFinding("any")], null)).toBe(false);
	});

	it("returns false when override.rules is empty (legacy free-text fail-safe)", () => {
		expect(allWarnsAccepted([warnFinding("any")], { rules: [], reason: "legacy" })).toBe(false);
	});

	it("returns false when there are no warns to accept", () => {
		expect(allWarnsAccepted([], { rules: ["any"], reason: "x" })).toBe(false);
	});

	it("returns true when EVERY warn's rule is in the accepted set", () => {
		expect(
			allWarnsAccepted([warnFinding("github-trust:no-license")], {
				rules: ["github-trust:no-license"],
				reason: "x",
			}),
		).toBe(true);
	});

	it("F004 regression: returns false when a NEW unrelated warn appears alongside accepted ones", () => {
		// askuserquestion scenario: override accepts no-license, but a fresh
		// npm-audit:high CVE shows up. The override must NOT mask the new warn.
		expect(
			allWarnsAccepted([warnFinding("github-trust:no-license"), warnFinding("npm-audit:high")], {
				rules: ["github-trust:no-license"],
				reason: "no-license accepted",
			}),
		).toBe(false);
	});

	it("ignores info / fail severity when scoping warn acceptance", () => {
		// fail is never auto-downgraded by override; the helper's only job is to
		// check whether warns are all in the accepted set.
		const findings: Finding[] = [
			warnFinding("github-trust:no-license"),
			{ rule: "scorecard:404", msg: "x", severity: "info" },
			{ rule: "npm-audit:critical", msg: "x", severity: "fail" },
		];
		expect(
			allWarnsAccepted(findings, {
				rules: ["github-trust:no-license"],
				reason: "x",
			}),
		).toBe(true);
	});
});
