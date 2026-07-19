// pij platform — T003 contract specs for core/platform/assignment (plan 054 Phase 1).
// RED by design: ./assignment.js does not exist yet — these specs pin the pure
// assignment verbs before anything implements them. No spine events here (task/
// state verbs and their events are Phase 2). Doctrine: no throws in core —
// fallible verbs return Result<T> from ../types.js (Pattern P4); the clock is
// injected as nowMs and stamped as ts = new Date(nowMs).toISOString() (Pattern
// P3); verbs return NEW records and never mutate their inputs; the implicit
// general assignment (V-01) is materialized on first task/state write.

import { describe, expect, it } from "vitest";
import { memorablePijIdCandidates } from "../memorable-id.js";
import type { Result } from "../types.js";
import {
	appendStateRef,
	assignmentIdCandidates,
	canonicalAssignmentJson,
	closeAssignment,
	materializeGeneralIfMissing,
	openAssignment,
} from "./assignment.js";
import {
	ASSIGNMENT_CLOSE_REASONS,
	type Assignment,
	generalAssignmentId,
	isAssignment,
} from "./types.js";

const NOW_MS = Date.parse("2026-07-16T12:00:00.000Z");
const NOW_ISO = new Date(NOW_MS).toISOString();
const ACTOR = "pij-witty-otter";
const NODE = "pij-witty-otter";

function unwrap<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

/** Pull the first n ids out of a candidate generator. */
function take(gen: Generator<string>, n: number): string[] {
	const out: string[] = [];
	for (const id of gen) {
		out.push(id);
		if (out.length === n) break;
	}
	return out;
}

/** An already-open assignment record (valid per the frozen types contract).
 *  Carries projectSlug by default so the copy verbs are forced to preserve it. */
function openAsg(over: Partial<Assignment> = {}): Assignment {
	return {
		schema_version: 1,
		id: "asg-brave-heron",
		nodeId: NODE,
		projectSlug: "fix-the-cli",
		task: "wire the spine log",
		states: [3, 8],
		opened: { actor: ACTOR, ts: NOW_ISO },
		...over,
	};
}

describe("assignmentIdCandidates", () => {
	it("yields ids shaped asg-<adjective>-<animal>", () => {
		for (const id of take(assignmentIdCandidates("seat-1"), 5)) {
			expect(id).toMatch(/^asg-[a-z]+(-[a-z]+)+$/);
		}
	});

	it("is deterministic: same seed yields the same first candidates", () => {
		expect(take(assignmentIdCandidates("seat-1"), 5)).toEqual(
			take(assignmentIdCandidates("seat-1"), 5),
		);
	});

	it("yields distinct ids on successive yields", () => {
		const ids = take(assignmentIdCandidates("seat-1"), 10);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("is a thin wrapper over core memorable-id candidates (pij- swapped for asg-)", () => {
		const expected = take(memorablePijIdCandidates("seat-1"), 3).map((id) =>
			id.replace(/^pij-/, "asg-"),
		);
		expect(take(assignmentIdCandidates("seat-1"), 3)).toEqual(expected);
	});
});

describe("openAssignment", () => {
	const base = { id: "asg-brave-heron", nodeId: NODE, task: "wire the spine log" };

	it("rejects an empty task with E-ARG naming task", () => {
		const r = openAssignment({ ...base, task: "", actor: ACTOR, nowMs: NOW_MS });
		expect(r).toMatchObject({ ok: false, code: "E-ARG" });
		if (!r.ok) expect(r.message).toContain("task");
	});

	it("rejects an empty id or nodeId with E-ARG", () => {
		expect(openAssignment({ ...base, id: "", actor: ACTOR, nowMs: NOW_MS })).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(openAssignment({ ...base, nodeId: "", actor: ACTOR, nowMs: NOW_MS })).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
	});

	it("opens with schema stamp, empty states, opened stamp, and no closed", () => {
		const a = unwrap(openAssignment({ ...base, actor: ACTOR, nowMs: NOW_MS }));
		expect(a).toMatchObject({
			schema_version: 1,
			id: "asg-brave-heron",
			nodeId: NODE,
			task: "wire the spine log",
			states: [],
			opened: { actor: ACTOR, ts: NOW_ISO },
		});
		expect(a.closed).toBeUndefined();
		expect(a.projectSlug).toBeUndefined();
		// Absent optionals never leak into the serialized record (undefined, not null).
		const json = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
		expect("closed" in json).toBe(false);
		expect("projectSlug" in json).toBe(false);
		expect(isAssignment(a)).toBe(true);
	});

	it("carries projectSlug only when given", () => {
		const a = unwrap(
			openAssignment({ ...base, actor: ACTOR, nowMs: NOW_MS, projectSlug: "fix-the-cli" }),
		);
		expect(a.projectSlug).toBe("fix-the-cli");
		expect(isAssignment(a)).toBe(true);
	});
});

describe("materializeGeneralIfMissing", () => {
	it("returns an existing assignment unchanged (same reference)", () => {
		const existing = openAsg();
		const kept = unwrap(
			materializeGeneralIfMissing(existing, { nodeId: NODE, actor: ACTOR, nowMs: NOW_MS }),
		);
		expect(kept).toBe(existing);
	});

	it("returns even a closed existing assignment as-is (reopen is Phase 2)", () => {
		const existing = openAsg({ closed: { actor: ACTOR, ts: NOW_ISO, reason: "done" } });
		const kept = unwrap(
			materializeGeneralIfMissing(existing, { nodeId: NODE, actor: ACTOR, nowMs: NOW_MS }),
		);
		expect(kept).toBe(existing);
	});

	it("materializes the general record when missing (V-01)", () => {
		const a = unwrap(
			materializeGeneralIfMissing(undefined, { nodeId: NODE, actor: ACTOR, nowMs: NOW_MS }),
		);
		expect(a).toMatchObject({
			schema_version: 1,
			id: generalAssignmentId(NODE),
			nodeId: NODE,
			task: "general",
			states: [],
			opened: { actor: ACTOR, ts: NOW_ISO },
		});
		expect(a.id).toBe("asg-general-pij-witty-otter");
		expect(a.projectSlug).toBeUndefined();
		expect(a.closed).toBeUndefined();
		expect(isAssignment(a)).toBe(true);
	});
});

describe("closeAssignment", () => {
	it("closes an open assignment into a NEW record, input untouched", () => {
		const a = openAsg();
		const before = structuredClone(a);
		const closed = unwrap(
			closeAssignment(a, { actor: "pij-calm-crane", nowMs: NOW_MS, reason: "done" }),
		);
		expect(closed).not.toBe(a);
		expect(closed.closed).toEqual({ actor: "pij-calm-crane", ts: NOW_ISO, reason: "done" });
		// Everything else preserved verbatim — projectSlug included (project linkage).
		expect(closed.projectSlug).toBe("fix-the-cli");
		expect(closed).toMatchObject({
			schema_version: 1,
			id: before.id,
			nodeId: before.nodeId,
			task: before.task,
			states: [3, 8],
			opened: before.opened,
		});
		expect(a).toEqual(before);
		expect(a.closed).toBeUndefined();
		expect(isAssignment(closed)).toBe(true);
	});

	it.each([...ASSIGNMENT_CLOSE_REASONS])("accepts close reason %s", (reason) => {
		const r = closeAssignment(openAsg(), { actor: ACTOR, nowMs: NOW_MS, reason });
		expect(r).toMatchObject({ ok: true });
		expect(unwrap(r).closed).toEqual({ actor: ACTOR, ts: NOW_ISO, reason });
	});

	it("rejects double-close with E-ARG naming the id, record unmodified", () => {
		const already = openAsg({ closed: { actor: ACTOR, ts: NOW_ISO, reason: "done" } });
		const before = structuredClone(already);
		const r = closeAssignment(already, { actor: ACTOR, nowMs: NOW_MS, reason: "cancelled" });
		expect(r).toMatchObject({ ok: false, code: "E-ARG" });
		if (!r.ok) {
			expect(r.message).toContain("asg-brave-heron");
			expect(r.message.toLowerCase()).toContain("closed");
		}
		expect(already).toEqual(before);
		expect(already.closed?.reason).toBe("done");
	});
});

describe("appendStateRef", () => {
	it("appends the seq in order on a NEW record, input untouched", () => {
		const a = openAsg({ states: [3, 8] });
		const before = structuredClone(a);
		const next = appendStateRef(a, 11);
		expect(next).not.toBe(a);
		expect(next.states).toEqual([3, 8, 11]);
		expect(next.projectSlug).toBe("fix-the-cli");
		expect(next).toMatchObject({
			schema_version: 1,
			id: before.id,
			nodeId: before.nodeId,
			task: before.task,
			opened: before.opened,
		});
		expect(a).toEqual(before);
		expect(a.states).toEqual([3, 8]);
		expect(isAssignment(next)).toBe(true);
	});

	it("preserves a closed stamp verbatim when appending to a closed record", () => {
		const a = openAsg({ states: [3], closed: { actor: ACTOR, ts: NOW_ISO, reason: "done" } });
		const next = appendStateRef(a, 9);
		expect(next.states).toEqual([3, 9]);
		expect(next.closed).toEqual({ actor: ACTOR, ts: NOW_ISO, reason: "done" });
		expect(next.projectSlug).toBe("fix-the-cli");
		expect(isAssignment(next)).toBe(true);
	});

	it("allows duplicate seqs (the log owns dedupe)", () => {
		const a = openAsg({ states: [5] });
		const twice = appendStateRef(appendStateRef(a, 5), 5);
		expect(twice.states).toEqual([5, 5, 5]);
	});
});

// ─── review 001 F7 — invalid clocks are E-ARG through the assignment verbs ─

describe("assignment verbs reject invalid clocks (review 001 F7)", () => {
	const BAD_CLOCKS: readonly (readonly [string, number])[] = [
		["NaN", Number.NaN],
		["one past TimeClip", 8.64e15 + 1],
	];

	it.each(BAD_CLOCKS)("openAssignment with nowMs %s is E-ARG naming nowMs", (_label, bad) => {
		const result = openAssignment({
			id: "asg-x",
			nodeId: NODE,
			task: "t",
			actor: ACTOR,
			nowMs: bad,
		});
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("nowMs");
	});

	it.each(BAD_CLOCKS)("closeAssignment with nowMs %s is E-ARG naming nowMs", (_label, bad) => {
		const result = closeAssignment(openAsg(), { actor: ACTOR, nowMs: bad, reason: "done" });
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("nowMs");
	});

	describe("materializeGeneralIfMissing is now fallible (it constructs)", () => {
		it("passes an existing record through as ok(existing) — same reference, clock untouched", () => {
			const existing = openAsg();
			const result = materializeGeneralIfMissing(existing, {
				nodeId: NODE,
				actor: ACTOR,
				nowMs: Number.NaN, // never consulted for the pass-through
			});
			expect(result).toMatchObject({ ok: true });
			if (result.ok) expect(result.value).toBe(existing);
		});

		it("materializes the general assignment under a valid clock", () => {
			const result = materializeGeneralIfMissing(undefined, {
				nodeId: NODE,
				actor: ACTOR,
				nowMs: NOW_MS,
			});
			expect(result).toMatchObject({ ok: true });
			if (result.ok) {
				expect(result.value.id).toBe(generalAssignmentId(NODE));
				expect(result.value.opened.ts).toBe(NOW_ISO);
				expect(isAssignment(result.value)).toBe(true);
			}
		});

		it.each(BAD_CLOCKS)("is E-ARG naming nowMs when constructing under %s", (_label, bad) => {
			const result = materializeGeneralIfMissing(undefined, {
				nodeId: NODE,
				actor: ACTOR,
				nowMs: bad,
			});
			expect(result).toMatchObject({ ok: false, code: "E-ARG" });
			if (!result.ok) expect(result.message).toContain("nowMs");
		});
	});
});

// ─── plan 054 P2 T005 — canonicalAssignmentJson (states-exclusion law) ──────
// Impl-accompanying pins (the RED for the mechanism is the journal.test.ts
// adjudication block): the canonical form is the assignment corroboration
// key, so its shape is contract, not implementation detail.
describe("canonicalAssignmentJson", () => {
	const base: Assignment = {
		schema_version: 1,
		id: "asg-brave-otter",
		nodeId: "pij-node",
		task: "review",
		states: [],
		opened: { actor: "tester", ts: "2026-07-17T00:00:00.000Z" },
	};

	it("EXCLUDES states[] — the log-derived index never perturbs the corroboration key", () => {
		expect(canonicalAssignmentJson(base)).toBe(
			canonicalAssignmentJson({ ...base, states: [7, 9] }),
		);
		expect(canonicalAssignmentJson(base)).not.toContain("states");
	});

	it("is deterministic across parse key order (F3 law)", () => {
		const shuffled = JSON.parse(
			'{"opened":{"ts":"2026-07-17T00:00:00.000Z","actor":"tester"},"task":"review","states":[],"nodeId":"pij-node","id":"asg-brave-otter","schema_version":1}',
		) as Assignment;
		expect(canonicalAssignmentJson(shuffled)).toBe(canonicalAssignmentJson(base));
	});

	it("differs when any AUTHORED field differs (task, closed, projectSlug)", () => {
		expect(canonicalAssignmentJson({ ...base, task: "other" })).not.toBe(
			canonicalAssignmentJson(base),
		);
		expect(canonicalAssignmentJson({ ...base, projectSlug: "alpha" })).not.toBe(
			canonicalAssignmentJson(base),
		);
		expect(
			canonicalAssignmentJson({
				...base,
				closed: { actor: "tester", ts: "2026-07-17T01:00:00.000Z", reason: "done" },
			}),
		).not.toBe(canonicalAssignmentJson(base));
	});

	it("preserves unknown additive fields in stable sorted order (G4 law)", () => {
		const withExtra = { ...base, zebra: 1, alpha: 2 } as unknown as Assignment;
		const canonical = canonicalAssignmentJson(withExtra);
		expect(canonical).toContain('"alpha":2');
		expect(canonical).toContain('"zebra":1');
		expect(canonical.indexOf('"alpha"')).toBeLessThan(canonical.indexOf('"zebra"'));
	});
});
