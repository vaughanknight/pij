import { describe, expect, it } from "vitest";
import { appendAllocationStep, canonicalAllocationJson } from "./allocation.js";
import { type Allocation, isAllocation } from "./types.js";

const TS = "2026-07-20T10:00:00.000Z";
const TS2 = "2026-07-20T10:01:00.000Z";

const BASE: Allocation = {
	schema_version: 1,
	id: "alloc-s061-team-scaffold",
	project: "team-scaffold",
	ordinal: 61,
	slug: "team-scaffold",
	worktree: "/repo-worktrees/s061-team-scaffold",
	branch: "s061/team-scaffold",
	baseSha: "0123456789abcdef",
	state: "created",
	steps: [
		{
			name: "ordinal-reserved",
			ok: true,
			evidence: "ordinal 61",
			ts: TS,
		},
	],
	created: { actor: "pij-primary-carp", ts: TS },
};

describe("Allocation record — AC-01/AC-08", () => {
	it("round-trips through isAllocation and rejects invalid state/step shapes", () => {
		expect(isAllocation(BASE)).toBe(true);
		expect(isAllocation({ ...BASE, state: "active" })).toBe(false);
		expect(isAllocation({ ...BASE, ordinal: 1.5 })).toBe(false);
		expect(
			isAllocation({
				...BASE,
				steps: [{ name: "bad", ok: "yes", evidence: "none", ts: TS }],
			}),
		).toBe(false);
	});

	it("serializes the contract field order as compact canonical JSON", () => {
		expect(canonicalAllocationJson(BASE)).toBe(
			`{"schema_version":1,"id":"alloc-s061-team-scaffold","project":"team-scaffold",` +
				`"ordinal":61,"slug":"team-scaffold","worktree":"/repo-worktrees/s061-team-scaffold",` +
				`"branch":"s061/team-scaffold","baseSha":"0123456789abcdef","state":"created",` +
				`"steps":[{"name":"ordinal-reserved","ok":true,"evidence":"ordinal 61","ts":"${TS}"}],` +
				`"created":{"actor":"pij-primary-carp","ts":"${TS}"}}`,
		);
	});

	it("canonicalizes the same bytes regardless of disk key order", () => {
		const scrambled = JSON.parse(
			`{"created":{"ts":"${TS}","actor":"pij-primary-carp"},"steps":[{"ts":"${TS}",` +
				`"evidence":"ordinal 61","ok":true,"name":"ordinal-reserved"}],"state":"created",` +
				`"baseSha":"0123456789abcdef","branch":"s061/team-scaffold",` +
				`"worktree":"/repo-worktrees/s061-team-scaffold","slug":"team-scaffold","ordinal":61,` +
				`"project":"team-scaffold","id":"alloc-s061-team-scaffold","schema_version":1}`,
		) as Allocation;
		expect(canonicalAllocationJson(scrambled)).toBe(canonicalAllocationJson(BASE));
	});

	it("appends a journal step immutably in order", () => {
		const next = appendAllocationStep(BASE, {
			name: "worktree-created",
			ok: true,
			evidence: "/repo-worktrees/s061-team-scaffold @ 0123456789abcdef",
			ts: TS2,
		});
		expect(next).not.toBe(BASE);
		expect(BASE.steps).toHaveLength(1);
		expect(next.steps.map((step) => step.name)).toEqual(["ordinal-reserved", "worktree-created"]);
		expect(isAllocation(next)).toBe(true);
	});
});
