// FX001-2 tests: unmanifested project-scope installs become a synthetic
// vetter:audit warn Verdict that participates in cmdAudit's worst-level
// aggregate (closes F002).

import { describe, expect, it } from "vitest";
import { buildUnmanifestedVerdict } from "./audit-unmanifested.js";

describe("buildUnmanifestedVerdict (FX001-2)", () => {
	it("returns ok-level Verdict with no findings when input is empty", () => {
		const v = buildUnmanifestedVerdict([]);
		expect(v.vetter).toBe("audit");
		expect(v.level).toBe("ok");
		expect(v.findings).toEqual([]);
		expect(v.score).toBe(100);
	});

	it("emits one warn finding per unmanifested source with rule 'audit:unmanifested'", () => {
		const v = buildUnmanifestedVerdict(["npm:ghost-extension", "git:somewhere/transitive"]);
		expect(v.vetter).toBe("audit");
		expect(v.level).toBe("warn");
		expect(v.findings).toHaveLength(2);
		expect(v.findings[0]).toMatchObject({
			rule: "audit:unmanifested",
			severity: "warn",
		});
		expect(v.findings[0].msg).toContain("npm:ghost-extension");
		expect(v.findings[1].msg).toContain("git:somewhere/transitive");
	});

	it("F002 regression: a single unmanifested install gates the aggregate to warn", () => {
		// Before FX001-2, cmdAudit printed unmanifested installs but exited 0.
		// Now: any unmanifested install yields level=warn, which the cmdAudit
		// worst-level reduce propagates to exit code 2.
		const v = buildUnmanifestedVerdict(["npm:surprise"]);
		expect(v.level).toBe("warn");
	});

	it("score subtracts 10 per finding, floored at 0", () => {
		expect(buildUnmanifestedVerdict([]).score).toBe(100);
		expect(buildUnmanifestedVerdict(["a"]).score).toBe(90);
		expect(buildUnmanifestedVerdict(["a", "b", "c"]).score).toBe(70);
		// 11 unmanifested → score would be -10 without floor; assert 0.
		const many = Array.from({ length: 11 }, (_, i) => `pkg-${i}`);
		expect(buildUnmanifestedVerdict(many).score).toBe(0);
	});

	it("synthetic Verdict has scannedFiles=0 and durationMs=0 (it's a cross-check, not a scan)", () => {
		const v = buildUnmanifestedVerdict(["x"]);
		expect(v.scannedFiles).toBe(0);
		expect(v.durationMs).toBe(0);
	});
});
