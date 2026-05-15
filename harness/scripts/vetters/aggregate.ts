// Composes per-vetter Verdicts into one overall Verdict.
// Aggregate level: highest severity wins (fail > warn > ok).
// Aggregate score: mean of input scores (rounded), or 100 if no inputs.
// All findings concatenated, prefixed by source vetter in rule field
// already (vetters set vetter:meta or R-## etc.).
//
// Short-circuit policy: callers may choose to stop running further
// vetters once a fail is seen. The aggregator itself just composes
// whatever it's given.

import type { Finding, Verdict } from "./types.js";
import { deriveLevel } from "./types.js";

export function aggregate(verdicts: Verdict[]): Verdict {
	if (verdicts.length === 0) {
		return {
			vetter: "aggregate",
			score: 100,
			level: "ok",
			findings: [],
			scannedFiles: 0,
			durationMs: 0,
		};
	}
	const findings: Finding[] = [];
	let scanned = 0;
	let duration = 0;
	let agentRubric: string | undefined;
	for (const v of verdicts) {
		// Tag every finding with its source vetter for traceability
		for (const f of v.findings) {
			findings.push({
				...f,
				rule: f.rule.includes(":") ? f.rule : `${v.vetter}:${f.rule}`,
			});
		}
		scanned += v.scannedFiles;
		duration += v.durationMs;
		if (v.vetter === "agent" && v.agentRubric) agentRubric = v.agentRubric;
	}
	const totalScore = verdicts.reduce((sum, v) => sum + v.score, 0);
	const score = Math.round(totalScore / verdicts.length);
	return {
		vetter: "aggregate",
		score,
		level: deriveLevel(findings),
		findings,
		scannedFiles: scanned,
		durationMs: duration,
		...(agentRubric ? { agentRubric } : {}),
	};
}

export type RunOpts = {
	shortCircuit?: boolean; // stop after first vetter returns level: fail
};

export async function runPipeline(
	vetters: Array<{ name: string; vet: (path: string, src: string) => Promise<Verdict> }>,
	packagePath: string,
	source: string,
	opts: RunOpts = {},
): Promise<Verdict[]> {
	const out: Verdict[] = [];
	for (const v of vetters) {
		const verdict = await v.vet(packagePath, source);
		out.push(verdict);
		if (opts.shortCircuit && verdict.level === "fail") break;
	}
	return out;
}
