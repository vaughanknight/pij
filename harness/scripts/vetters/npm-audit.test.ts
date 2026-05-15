import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAudit } from "./npm-audit.js";

const FIX = resolve(import.meta.dirname, "__fixtures__");
const clean = JSON.parse(readFileSync(resolve(FIX, "npm-audit-clean.json"), "utf8"));
const mixed = JSON.parse(readFileSync(resolve(FIX, "npm-audit-mixed.json"), "utf8"));

describe("parseAudit", () => {
	it("clean report → zero findings", () => {
		const findings = parseAudit(clean);
		expect(findings).toEqual([]);
	});

	it("mixed report maps severities correctly", () => {
		const findings = parseAudit(mixed);
		expect(findings).toHaveLength(3);
		const bySev = Object.fromEntries(findings.map((f) => [f.rule, f.severity]));
		expect(bySev["npm-audit:axios"]).toBe("warn"); // moderate → warn
		expect(bySev["npm-audit:lodash"]).toBe("fail"); // high → fail
		expect(bySev["npm-audit:left-pad"]).toBe("fail"); // critical → fail
	});

	it("missing vulnerabilities field → empty findings", () => {
		expect(parseAudit({})).toEqual([]);
	});

	it("uses 'low' default when severity missing", () => {
		const findings = parseAudit({ vulnerabilities: { foo: { via: ["x"] } } });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("info");
	});
});
