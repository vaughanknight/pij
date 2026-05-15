// FX001-1: typed override scope helpers.
//
// `vetted.overrides` enumerates which Finding.rule slugs are auto-accepted as
// warn→ok by `pkg audit`. New unrelated warns keep their severity and propagate
// to exit code 2 — this is the F004 fix.
//
// Legacy free-text strings parse to { rules: [], reason: <string> } — accepts
// nothing (fail-safe) and prints a one-line deprecation warning per process.

import type { Finding } from "./types.js";

export interface Overrides {
	rules: string[];
	reason: string;
}

let LEGACY_OVERRIDE_WARNED = false;

// Test-only: reset the once-per-process deprecation flag. Don't use in CLI code.
export function _resetLegacyOverrideWarning(): void {
	LEGACY_OVERRIDE_WARNED = false;
}

// Single override reader. All callers (cmdAdd, cmdAudit, cmdBootstrap) MUST go
// through this — no direct `e.vetted?.overrides` field access in CLI code.
export function parseOverrides(raw: Overrides | string | undefined): Overrides | null {
	if (raw === undefined || raw === null) return null;
	if (typeof raw === "string") {
		if (!LEGACY_OVERRIDE_WARNED) {
			console.error(
				"⚠ deprecated: vetted.overrides as a plain string accepts no rules; migrate to { rules: [<rule-slug>], reason: <text> }",
			);
			LEGACY_OVERRIDE_WARNED = true;
		}
		return { rules: [], reason: raw };
	}
	if (typeof raw !== "object") return null;
	const reason = typeof raw.reason === "string" ? raw.reason : "";
	const rules = Array.isArray(raw.rules)
		? raw.rules.filter((r): r is string => typeof r === "string")
		: [];
	return { rules, reason };
}

// A verdict's warn level is downgraded to ok only when EVERY warn finding's
// rule is in the override's accepted set. fail and info severities are ignored
// — fail is never downgraded by override; info doesn't gate.
export function allWarnsAccepted(findings: Finding[], override: Overrides | null): boolean {
	if (!override) return false;
	if (override.rules.length === 0) return false;
	const accepted = new Set(override.rules);
	const warns = findings.filter((f) => f.severity === "warn");
	if (warns.length === 0) return false;
	return warns.every((f) => accepted.has(f.rule));
}
