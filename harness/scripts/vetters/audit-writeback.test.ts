// FX001-3 tests: cmdAudit refresh write-back gated on RAW verdict.level === "ok".
//
// Verifies:
// - raw=ok mutates date/score/agentRubric in place
// - warn/fail does NOT mutate (override entries age out)
// - comments and key order around `vetted:` survive the round-trip
// - missing agentRubric in the verdict is not written

import { describe, expect, it } from "vitest";
import { parseDocument, type YAMLMap, type YAMLSeq } from "yaml";
import { refreshVettedBlock } from "./audit-writeback.js";
import type { Verdict } from "./types.js";

const FIXTURE = `# pij third-party pi-extension manifest — source of truth.
# Edit here, then \`npm run pkg sync\`.
#
# Each entry vetted: { date, score, overrides?, agentRubric? }

packages:
  - source: npm:example-extension
    enabled: true
    note: example
    vetted:
      # warn-level finding accepted — see research-dossier.md
      date: 2026-01-01T00:00:00Z
      score: 98
      overrides:
        rules:
          - github-trust:no-license
        reason: install-only use
  - source: git:github.com/foo/bar
    enabled: true
    vetted:
      date: 2026-02-15T00:00:00Z
      score: 100
`;

const okVerdict: Verdict = {
	vetter: "aggregate",
	level: "ok",
	score: 100,
	findings: [],
	scannedFiles: 0,
	durationMs: 100,
};

const warnVerdict: Verdict = {
	vetter: "aggregate",
	level: "warn",
	score: 90,
	findings: [{ rule: "x", msg: "y", severity: "warn" }],
	scannedFiles: 0,
	durationMs: 100,
};

describe("refreshVettedBlock (FX001-3)", () => {
	it("mutates date/score in place when verdict.level === 'ok'", () => {
		const doc = parseDocument(FIXTURE);
		const seq = doc.get("packages") as YAMLSeq;
		const vetted = (seq.get(1) as YAMLMap).get("vetted") as YAMLMap;
		expect(refreshVettedBlock(vetted, okVerdict)).toBe(true);
		const refreshed = (seq.get(1) as YAMLMap).get("vetted") as YAMLMap;
		const date = refreshed.get("date") as string;
		const score = refreshed.get("score") as number;
		// date moved past the fixture's old 2026-02-15
		expect(Date.parse(date)).toBeGreaterThan(Date.parse("2026-02-15T00:00:00Z"));
		expect(score).toBe(100);
	});

	it("refuses to mutate when verdict.level !== 'ok' (override entries age out)", () => {
		const doc = parseDocument(FIXTURE);
		const seq = doc.get("packages") as YAMLSeq;
		const vetted = (seq.get(0) as YAMLMap).get("vetted") as YAMLMap;
		const before = vetted.get("date") as string;
		expect(refreshVettedBlock(vetted, warnVerdict)).toBe(false);
		const after = (seq.get(0) as YAMLMap).get("vetted") as YAMLMap;
		expect(after.get("date")).toBe(before);
	});

	it("F004-via-write-back regression: even though askuserquestion's effective is ok via override, the RAW verdict is warn and the date must NOT advance", () => {
		// askuserquestion scenario: warn level downgraded to ok by override. We
		// pass the RAW verdict (warn) — refresh must refuse.
		const doc = parseDocument(FIXTURE);
		const seq = doc.get("packages") as YAMLSeq;
		const vetted = (seq.get(0) as YAMLMap).get("vetted") as YAMLMap;
		const before = vetted.get("date") as string;
		// Even with agentRubric in the verdict (would be present if agent ran),
		// the gate is verdict.level !== "ok" → no mutation.
		const warnWithRubric: Verdict = { ...warnVerdict, agentRubric: "abc123" };
		expect(refreshVettedBlock(vetted, warnWithRubric)).toBe(false);
		const after = (seq.get(0) as YAMLMap).get("vetted") as YAMLMap;
		expect(after.get("date")).toBe(before);
		expect(after.get("agentRubric")).toBeUndefined();
	});

	it("writes agentRubric only when present in the verdict (and level is ok)", () => {
		const doc = parseDocument(FIXTURE);
		const seq = doc.get("packages") as YAMLSeq;
		const vetted = (seq.get(1) as YAMLMap).get("vetted") as YAMLMap;
		// without rubric: existing field (none) stays absent
		refreshVettedBlock(vetted, okVerdict);
		expect((seq.get(1) as YAMLMap).get("vetted").get("agentRubric")).toBeUndefined();
		// with rubric: it's written
		refreshVettedBlock(vetted, { ...okVerdict, agentRubric: "sha-abc" });
		expect((seq.get(1) as YAMLMap).get("vetted").get("agentRubric")).toBe("sha-abc");
	});
});

describe("YAML round-trip comment preservation (FX001-3 assumption)", () => {
	it("preserves the header comment block + the inline 'warn-level finding' comment after refresh", () => {
		const doc = parseDocument(FIXTURE);
		const seq = doc.get("packages") as YAMLSeq;
		const vetted = (seq.get(1) as YAMLMap).get("vetted") as YAMLMap;
		refreshVettedBlock(vetted, okVerdict);
		const out = doc.toString();
		expect(out).toContain("# pij third-party pi-extension manifest — source of truth.");
		expect(out).toContain("# Edit here, then `npm run pkg sync`.");
		expect(out).toContain("# Each entry vetted: { date, score, overrides?, agentRubric? }");
		expect(out).toContain("# warn-level finding accepted — see research-dossier.md");
	});

	it("preserves the typed override rules:/reason: structure unchanged across a non-mutation round-trip", () => {
		const doc = parseDocument(FIXTURE);
		const seq = doc.get("packages") as YAMLSeq;
		const vetted = (seq.get(0) as YAMLMap).get("vetted") as YAMLMap;
		// warn-level verdict → no mutation; the round-trip should be lossless.
		refreshVettedBlock(vetted, warnVerdict);
		const out = doc.toString();
		expect(out).toContain("github-trust:no-license");
		expect(out).toContain("install-only use");
		expect(out).toContain("rules:");
	});
});
