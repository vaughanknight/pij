// pij platform — fence record pure logic (plan 061 phase 1).

import picomatch from "picomatch";
import { canonicalRecordLevel } from "./project.js";
import type { Fence } from "./types.js";

const FENCE_FIELD_ORDER = [
	"schema_version",
	"id",
	"allocation",
	"touchSet",
	"shared",
	"class",
	"updated",
] as const;

const STAMP_FIELD_ORDER = ["actor", "ts"] as const;

/** Canonical single-line JSON for the complete own fence record. */
export function canonicalFenceJson(fence: Fence): string {
	const canonical = canonicalRecordLevel(
		fence as unknown as Record<string, unknown>,
		FENCE_FIELD_ORDER,
	);
	canonical.updated = canonicalRecordLevel(
		fence.updated as unknown as Record<string, unknown>,
		STAMP_FIELD_ORDER,
	);
	return JSON.stringify(canonical);
}

/** Whether a repo-relative path belongs to a fence's declared touch set. */
export function fenceMatchesPath(fence: Fence, path: string): boolean {
	const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
	return fence.touchSet.some((pattern) =>
		picomatch(pattern.replaceAll("\\", "/"), { dot: true })(normalized),
	);
}

/** All owners of a path, id-sorted. Multiple results are a reported overlap. */
export function fencesForPath(fences: readonly Fence[], path: string): Fence[] {
	return fences
		.filter((fence) => fenceMatchesPath(fence, path))
		.sort((left, right) => left.id.localeCompare(right.id));
}
