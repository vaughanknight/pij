// FX001-3: cmdAudit refresh write-back.
//
// When an entry's RAW verdict.level is "ok" (NOT `effective === "ok"` via
// override), `pkg audit` persists the refreshed date/score/agentRubric back
// to `.pi/packages.yaml`. Override entries must age out so the user re-confirms
// acceptance — keying off `effective` would re-create F004 through a different
// door.
//
// Mutation is in-place via YAMLMap.set() so adjacent comments are preserved
// (same pattern as cmdBootstrap's --unsafe staleness write at packages.ts).

import type { YAMLMap } from "yaml";
import type { Verdict } from "./types.js";

// Refresh a single entry's `vetted:` YAMLMap node in place. Returns true when
// the node was mutated. Caller is responsible for writing the parent Document.
//
// Only the date/score/agentRubric fields are touched. `overrides` is left
// alone — overrides are user-authored data, not refreshable metadata.
export function refreshVettedBlock(vetted: YAMLMap, verdict: Verdict): boolean {
	if (verdict.level !== "ok") return false;
	vetted.set("date", new Date().toISOString());
	vetted.set("score", verdict.score);
	if (verdict.agentRubric) {
		vetted.set("agentRubric", verdict.agentRubric);
	}
	return true;
}
