// pij-orchestration — the TARGET arm of the PA capability boundary (plan 084).
//
// Every allowance here is paired with its NARROWNESS proof. An allowance
// without one is a widening: "the PA can now watch its parent" is worthless as
// a test unless its twin asserts "and is still refused for every other target".

import { describe, expect, it } from "vitest";
import type { SessionDescriptor, SessionId } from "../types.js";
import { paTargetDecision } from "./pa-target.js";

function caller(over: Partial<SessionDescriptor> & { id: SessionId }): SessionDescriptor {
	return {
		role: undefined,
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-08-05T12:00:00.000Z",
		state: "idle",
		orchestrationRole: "pa",
		...over,
	};
}

describe("paTargetDecision — a PA may act on ITSELF or its own parent, and nothing else", () => {
	it("ALLOWS a PA acting on itself", () => {
		const decision = paTargetDecision(caller({ id: "pij-pa", parentId: "pij-boss" }), "pij-pa");
		expect(decision).toEqual({ kind: "allow", relation: "self" });
	});

	it("ALLOWS a PA acting on its explicitly linked parent", () => {
		const decision = paTargetDecision(caller({ id: "pij-pa", parentId: "pij-boss" }), "pij-boss");
		expect(decision).toEqual({ kind: "allow", relation: "parent" });
	});

	it("ALLOWS a PA its parent SPAWNED but never explicitly linked", () => {
		// THE TRAP. `effectiveParent` falls back to `spawnedBy`, so this PA has a
		// real parent and NO raw `parentId`. A predicate keyed on the raw field
		// would refuse this PA permission over its actual parent — rebuilding #95
		// inside #95's own fix. This test is the guard against that mutation.
		const decision = paTargetDecision(caller({ id: "pij-pa", spawnedBy: "pij-boss" }), "pij-boss");
		expect(decision).toEqual({ kind: "allow", relation: "parent" });
	});

	it("REFUSES an arbitrary third-party seat", () => {
		const decision = paTargetDecision(
			caller({ id: "pij-pa", parentId: "pij-boss" }),
			"pij-stranger",
		);
		expect(decision.kind).toBe("refuse");
	});

	it("REFUSES when the PA is an explicit root — a null parent is not a wildcard", () => {
		// Fails CLOSED. `parentId: null` means "deliberately no parent", so there
		// is no seat this PA stands in relation to; permitting anything here would
		// make an unparented PA MORE powerful than a correctly linked one.
		const decision = paTargetDecision(caller({ id: "pij-pa", parentId: null }), "pij-boss");
		expect(decision.kind).toBe("refuse");
	});

	it("REFUSES an unresolvable target — undefined, null, and blank all fail closed", () => {
		const pa = caller({ id: "pij-pa", parentId: "pij-boss" });
		expect(paTargetDecision(pa, undefined).kind).toBe("refuse");
		expect(paTargetDecision(pa, null).kind).toBe("refuse");
		expect(paTargetDecision(pa, "   ").kind).toBe("refuse");
	});

	it("REFUSES the spawner once an explicit parentId has overridden it", () => {
		// The narrowness twin of the spawnedBy allowance: the fallback is a
		// FALLBACK, so re-linking a PA must move its permission with it rather
		// than accumulating both the old spawner and the new parent.
		const relinked = caller({ id: "pij-pa", spawnedBy: "pij-spawner", parentId: "pij-adopter" });
		expect(paTargetDecision(relinked, "pij-adopter")).toEqual({
			kind: "allow",
			relation: "parent",
		});
		expect(paTargetDecision(relinked, "pij-spawner").kind).toBe("refuse");
	});

	it("names the caller, the target, and the parent in every refusal", () => {
		// The refusal is the only place the seat learns the boundary; a bare
		// "refused" leaves it guessing which of the two ids was wrong.
		const decision = paTargetDecision(
			caller({ id: "pij-pa", parentId: "pij-boss" }),
			"pij-stranger",
		);
		expect(decision.kind).toBe("refuse");
		if (decision.kind !== "refuse") return;
		expect(decision.why).toContain("pij-stranger");
		expect(decision.why).toContain("pij-pa");
		expect(decision.why).toContain("pij-boss");
	});

	it("never calls the parent a PRIME — they are different concepts and one is false", () => {
		// REGRESSION PIN, from a real defect. The refusal text used to say "its
		// own prime", and a live transcript proved that false: the parent it named
		// was role `pm` with `prime: false`. `prime` is a separate stored flag;
		// this gate keys on `effectiveParent`, and a PA's parent need not be a
		// prime at all. A boundary that misnames the relationship it enforces
		// teaches a wrong model of the platform to the one reader who most needs
		// the right one — the seat trying to work out what it may do.
		const refusals = [
			paTargetDecision(caller({ id: "pij-pa", parentId: "pij-boss" }), "pij-stranger"),
			paTargetDecision(caller({ id: "pij-pa", parentId: null }), "pij-boss"),
			paTargetDecision(caller({ id: "pij-pa", parentId: "pij-boss" }), undefined),
		];
		for (const decision of refusals) {
			expect(decision.kind).toBe("refuse");
			if (decision.kind !== "refuse") continue;
			expect(decision.why.toLowerCase()).not.toContain("prime");
		}
	});
});
