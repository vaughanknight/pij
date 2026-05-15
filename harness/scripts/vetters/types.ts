// Contract every vetter implements. See docs/plans/009-extension-vetting/
// for the rationale and severity rules.

export type Severity = "info" | "warn" | "fail";
export type Level = "ok" | "warn" | "fail";

export interface Finding {
	rule: string; // stable rule id, e.g. "npm-audit:CVE-2024-1234" or "R-04"
	msg: string;
	severity: Severity;
	file?: string;
	line?: number;
	col?: number;
	snippet?: string;
	context?: "fenced-code" | "defensive-doc" | "carve-out";
}

export interface Verdict {
	vetter: string; // module name: "npm-audit" | "lockfile-lint" | "scorecard" | "github-trust" | "agent"
	score: number; // 0–100; advisory, level is the gate
	level: Level;
	findings: Finding[];
	scannedFiles: number;
	durationMs: number;
	agentRubric?: string; // sha256 hex of agent briefing (agent vetter only)
}

export interface Vetter {
	name: string;
	vet(packagePath: string, source: string): Promise<Verdict>;
}

// Derive level from findings. Used by individual vetters that don't
// track level explicitly during a scan.
export function deriveLevel(findings: Finding[]): Level {
	if (findings.some((f) => f.severity === "fail")) return "fail";
	if (findings.some((f) => f.severity === "warn")) return "warn";
	return "ok";
}

// Derive score from findings. Floor at 0.
export function deriveScore(findings: Finding[]): number {
	let score = 100;
	for (const f of findings) {
		if (f.severity === "fail") score -= 30;
		else if (f.severity === "warn") score -= 10;
	}
	return Math.max(0, score);
}
