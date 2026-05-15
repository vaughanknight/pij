// FX001-2: synthetic vetter:audit Verdict for unmanifested installs.
//
// cmdAudit cross-checks `pi list` against `.pi/packages.yaml`. Each unmanifested
// project-scope install becomes one warn-level Finding with
// rule:"audit:unmanifested" in a synthetic Verdict whose `vetter` is "audit".
// The verdict participates in the worst-level aggregate so unexpected
// transitive pi extensions actually gate `pkg audit`'s exit code (closes F002).

import type { Verdict } from "./types.js";

export function buildUnmanifestedVerdict(unmanifestedSources: string[]): Verdict {
	if (unmanifestedSources.length === 0) {
		return {
			vetter: "audit",
			level: "ok",
			score: 100,
			findings: [],
			scannedFiles: 0,
			durationMs: 0,
		};
	}
	const findings = unmanifestedSources.map((source) => ({
		rule: "audit:unmanifested",
		msg: `${source} installed but not in packages.yaml`,
		severity: "warn" as const,
	}));
	return {
		vetter: "audit",
		level: "warn",
		score: Math.max(0, 100 - findings.length * 10),
		findings,
		scannedFiles: 0,
		durationMs: 0,
	};
}
