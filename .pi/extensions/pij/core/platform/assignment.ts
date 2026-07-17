// pij platform — pure assignment verbs (plan 054 Phase 1, T004).
// Pattern P3: clock is the injected nowMs, stamped ts = new Date(nowMs).toISOString().
// Pattern P4: fallible verbs return Result; total helpers stay total. Verbs return
// NEW records and never mutate inputs; absent optionals stay `undefined` and are
// never spread in as keys (JSON key absence is pinned by the specs).

import { memorablePijIdCandidates } from "../memorable-id.js";
import { err, ok, type Result } from "../types.js";
import { canonicalRecordLevel } from "./project.js";
import { isoTimestamp } from "./time.js";
import { type Assignment, type AssignmentCloseReason, generalAssignmentId } from "./types.js";

/** Deterministic `asg-<adjective>-<animal>` candidates: the core memorable-id
 *  sequence with the `pij-` prefix swapped for `asg-`. */
export function* assignmentIdCandidates(seed: string): Generator<string> {
	for (const id of memorablePijIdCandidates(seed)) {
		yield id.replace(/^pij-/, "asg-");
	}
}

export interface OpenAssignmentInput {
	readonly id: string;
	readonly nodeId: string;
	readonly task: string;
	readonly actor: string;
	readonly nowMs: number;
	readonly projectSlug?: string;
}

/** Open a new assignment. Empty id/nodeId/task ⇒ E-ARG naming the offender;
 *  invalid clock ⇒ E-ARG naming nowMs (review 001 F7). */
export function openAssignment(input: OpenAssignmentInput): Result<Assignment> {
	if (input.id === "") return err("E-ARG", "assignment id must not be empty");
	if (input.nodeId === "") return err("E-ARG", "assignment nodeId must not be empty");
	if (input.task === "") return err("E-ARG", "assignment task must not be empty");
	const ts = isoTimestamp(input.nowMs);
	if (!ts.ok) return ts;
	return ok({
		schema_version: 1,
		id: input.id,
		nodeId: input.nodeId,
		...(input.projectSlug === undefined ? {} : { projectSlug: input.projectSlug }),
		task: input.task,
		states: [],
		opened: { actor: input.actor, ts: ts.value },
	});
}

export interface MaterializeGeneralInput {
	readonly nodeId: string;
	readonly actor: string;
	readonly nowMs: number;
}

/** V-01: pass an existing record through by reference (even closed — reopen is
 *  Phase 2); materialize the node's general assignment only when missing.
 *  Fallible (review 001 F7): it CONSTRUCTS, so the clock is checked — the
 *  pass-through never consults nowMs. */
export function materializeGeneralIfMissing(
	existing: Assignment | undefined,
	input: MaterializeGeneralInput,
): Result<Assignment> {
	if (existing !== undefined) return ok(existing);
	const ts = isoTimestamp(input.nowMs);
	if (!ts.ok) return ts;
	return ok({
		schema_version: 1,
		id: generalAssignmentId(input.nodeId),
		nodeId: input.nodeId,
		task: "general",
		states: [],
		opened: { actor: input.actor, ts: ts.value },
	});
}

export interface CloseAssignmentInput {
	readonly actor: string;
	readonly nowMs: number;
	readonly reason: AssignmentCloseReason;
}

/** Close into a NEW record. Double-close ⇒ E-ARG naming the id; invalid
 *  clock ⇒ E-ARG naming nowMs (review 001 F7). */
export function closeAssignment(
	assignment: Assignment,
	input: CloseAssignmentInput,
): Result<Assignment> {
	if (assignment.closed !== undefined) {
		return err("E-ARG", `assignment ${assignment.id} is already closed`);
	}
	const ts = isoTimestamp(input.nowMs);
	if (!ts.ok) return ts;
	return ok({
		...assignment,
		closed: { actor: input.actor, ts: ts.value, reason: input.reason },
	});
}

/** Append a spine seq ref on a NEW record. Duplicates allowed — the log owns dedupe. */
export function appendStateRef(assignment: Assignment, seq: number): Assignment {
	return { ...assignment, states: [...assignment.states, seq] };
}

/** Known top-level fields in CONTRACT order — `states` DELIBERATELY absent
 *  (see canonicalAssignmentJson). */
const ASSIGNMENT_FIELD_ORDER = [
	"schema_version",
	"id",
	"nodeId",
	"projectSlug",
	"task",
	"opened",
	"closed",
] as const;

const STAMP_FIELD_ORDER = ["actor", "ts"] as const;
const CLOSED_FIELD_ORDER = ["actor", "ts", "reason"] as const;

/** Canonical single-line JSON of the AUTHORED assignment record — the project
 *  canonicalization law (review 001 F3 / 002 G4: known fields in contract
 *  order, unknown own fields sorted, deterministic across parse key order)
 *  with ONE ruled difference (plan 054 P2 T005): `states` is EXCLUDED.
 *
 *  states[] is a log-DERIVED index (its own contract: "Duplicates allowed —
 *  the log owns dedupe"; the spine is truth), and its entries are seq refs
 *  minted ONLY inside SpineLogPort at append time. Including it would make
 *  event prev/next uncomputable before the append AND would diverge the
 *  persisted record from `next` when the coupled write's in-window index
 *  update lands — breaking recovery corroboration on the lost-clear image.
 *  Exclusion is therefore LOAD-BEARING for the assignment corroboration
 *  matrix, not a convenience. */
export function canonicalAssignmentJson(assignment: Assignment): string {
	const { states: _states, ...authored } = assignment;
	const canonical = canonicalRecordLevel(
		authored as unknown as Record<string, unknown>,
		ASSIGNMENT_FIELD_ORDER,
	);
	canonical.opened = canonicalRecordLevel(
		assignment.opened as unknown as Record<string, unknown>,
		STAMP_FIELD_ORDER,
	);
	if (assignment.closed !== undefined) {
		canonical.closed = canonicalRecordLevel(
			assignment.closed as unknown as Record<string, unknown>,
			CLOSED_FIELD_ORDER,
		);
	}
	return JSON.stringify(canonical);
}
