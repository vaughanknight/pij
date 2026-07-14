// Wraps `npm audit --json` over an installed pi-extension's package directory.
// Maps the `vulnerabilities.<name>.severity` map into Verdict findings.
//
// Reference: https://docs.npmjs.com/cli/v11/commands/npm-audit
// npm audit's exit code is non-zero when vulnerabilities are found — we
// capture stdout regardless via execFileSync + try/catch.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { npmInvocation } from "../cli-invocation.js";
import { deriveLevel, deriveScore, type Finding, type Verdict, type Vetter } from "./types.js";

interface AuditAdvisory {
	severity?: "info" | "low" | "moderate" | "high" | "critical";
	via?: Array<{ title?: string; url?: string; source?: number } | string>;
	nodes?: string[];
}

interface AuditReport {
	vulnerabilities?: Record<string, AuditAdvisory>;
}

const SEVERITY_MAP: Record<string, Finding["severity"]> = {
	info: "info",
	low: "info",
	moderate: "warn",
	high: "fail",
	critical: "fail",
};

export function parseAudit(json: AuditReport): Finding[] {
	const findings: Finding[] = [];
	const vulns = json.vulnerabilities ?? {};
	for (const [name, advisory] of Object.entries(vulns)) {
		const sev = SEVERITY_MAP[advisory.severity ?? "low"] ?? "info";
		const titles = (advisory.via ?? [])
			.map((v) => (typeof v === "string" ? v : (v.title ?? v.source?.toString() ?? "unknown")))
			.filter(Boolean)
			.slice(0, 3)
			.join("; ");
		findings.push({
			rule: `npm-audit:${name}`,
			msg: `${name}: ${advisory.severity ?? "low"} (${titles || "no details"})`,
			severity: sev,
		});
	}
	return findings;
}

export async function vet(packagePath: string, _source: string): Promise<Verdict> {
	const start = Date.now();
	const findings: Finding[] = [];
	let scanned = 0;

	if (!existsSync(resolve(packagePath, "package.json"))) {
		return {
			vetter: "npm-audit",
			score: 100,
			level: "ok",
			findings: [
				{
					rule: "npm-audit:no-package-json",
					msg: "no package.json at scan target — skipping npm audit",
					severity: "info",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	scanned = 1;
	let json: AuditReport = {};
	try {
		const invocation = npmInvocation(["audit", "--json"]);
		const out = execFileSync(invocation.file, invocation.args, {
			cwd: packagePath,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		json = JSON.parse(out);
	} catch (err: unknown) {
		// npm exits non-zero when vulns are present; stdout still has the report
		const e = err as { stdout?: Buffer | string };
		const out = e.stdout ? (typeof e.stdout === "string" ? e.stdout : e.stdout.toString()) : "";
		if (out) {
			try {
				json = JSON.parse(out);
			} catch {
				findings.push({
					rule: "npm-audit:parse-error",
					msg: "npm audit output not parseable as JSON",
					severity: "warn",
				});
			}
		} else {
			findings.push({
				rule: "npm-audit:tool-missing",
				msg: "npm audit produced no output (tool failure)",
				severity: "warn",
			});
		}
	}

	findings.push(...parseAudit(json));

	return {
		vetter: "npm-audit",
		score: deriveScore(findings),
		level: deriveLevel(findings),
		findings,
		scannedFiles: scanned,
		durationMs: Date.now() - start,
	};
}

export const npmAuditVetter: Vetter = { name: "npm-audit", vet };
