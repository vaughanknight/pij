// pij platform — allocation record pure logic (plan 061 phase 1).

import { canonicalRecordLevel } from "./project.js";
import type { Allocation, AllocationStep } from "./types.js";

const ALLOCATION_FIELD_ORDER = [
	"schema_version",
	"id",
	"project",
	"ordinal",
	"slug",
	"worktree",
	"branch",
	"baseSha",
	"state",
	"steps",
	"created",
] as const;

const STEP_FIELD_ORDER = ["name", "ok", "evidence", "ts"] as const;
const STAMP_FIELD_ORDER = ["actor", "ts"] as const;

/** Canonical single-line JSON for the complete own allocation record. */
export function canonicalAllocationJson(allocation: Allocation): string {
	const canonical = canonicalRecordLevel(
		allocation as unknown as Record<string, unknown>,
		ALLOCATION_FIELD_ORDER,
	);
	canonical.steps = allocation.steps.map((step) =>
		canonicalRecordLevel(step as unknown as Record<string, unknown>, STEP_FIELD_ORDER),
	);
	canonical.created = canonicalRecordLevel(
		allocation.created as unknown as Record<string, unknown>,
		STAMP_FIELD_ORDER,
	);
	return JSON.stringify(canonical);
}

/** Immutable transaction-journal append. */
export function appendAllocationStep(allocation: Allocation, step: AllocationStep): Allocation {
	return { ...allocation, steps: [...allocation.steps, step] };
}
