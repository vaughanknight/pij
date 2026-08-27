// pij platform — pure journal recovery (review p1-review-001 HIGH-2, redesigned
// by review 002 G2/G3 into a phase-aware, causally-ordered lifecycle).
//
// Recovery half of the journal-FIRST coupled write. A WRITE verb, under the
// machine-wide platform write lock: journals its draft spine event durably as
// an INTENT before touching project state, durably marks it COMMITTED after
// the state write, appends it via appendOnce(opId, draft), and clears the
// entry on success. Any op still journaled belongs to a crashed or failed
// coupled write and is recovered here — at the start of every platform WRITE
// verb, in durable causal order — BEFORE the verb mutates anything:
//
//   committed  → the marker CLAIMS the state write landed, but a marker is
//                not proof (review 003 H1: durable ordering of the state
//                publish vs the flip is not guaranteed on every platform —
//                the marker can outlive a state write that never survived).
//                Corroborate a COUPLED op ONLY by persisted state canonical-
//                equal to `next` (review 004 J1: an existing once-record
//                proves the EVENT survived, never the project publish — they
//                are separate directory entries under best-effort fsync);
//                state mismatch ⇒ block, once-record or not. An UNCOUPLED
//                draft has no state to consult: its once-record alone
//                corroborates (existing event replayed), absent ⇒ block.
//   intent     → adjudicate against persisted state (the record/markCommitted
//                crash windows): state canonical-equal to the draft's `next`
//                means the write landed (crash before the flip) — replay;
//                `prev` (or an absent slug for a create) means the write never
//                landed — DISCARD, the spine must never claim it (G2's
//                phantom); anything else is unadjudicable — block.
//   blocked    → an honest E-NOREG naming the op, immediately: recovery stops
//                IN ORDER and the caller must NOT proceed, so a later state
//                event can never causally overtake its predecessor (G3).
//
// Intent adjudication is SOUND only under the platform write lock: an intent
// entry observed there can never belong to a live writer mid-window, so a
// discard cannot strip a live writer of its crash protection. Pure: no fs, no
// throws (Pattern P4) — every port failure is a Result.

import { err, ok, type Result } from "../types.js";
import { canonicalAllocationJson } from "./allocation.js";
import { appendStateRef, canonicalAssignmentJson } from "./assignment.js";
import { canonicalDispatchJson } from "./dispatch.js";
import { canonicalFenceJson } from "./fence.js";
import type {
	AllocationStorePort,
	AssignmentStorePort,
	DispatchStorePort,
	FenceStorePort,
	OpJournalPort,
	PendingOp,
	ProjectStorePort,
	SpineLogPort,
} from "./ports.js";
import { canonicalProjectJson } from "./project.js";
import {
	SPINE_KIND_ALLOCATION,
	SPINE_KIND_DISPATCH,
	SPINE_KIND_FENCE,
	SPINE_KIND_PROJECT_CREATED,
	SPINE_KIND_PROJECT_SET,
	SPINE_KIND_STATE_CLEARED,
	SPINE_KIND_STATE_SET,
	SPINE_KIND_STATE_VERIFIED,
	SPINE_KIND_TASK_SET,
	type SpineEventDraft,
} from "./types.js";

function isDispatchJournalKind(kind: string): boolean {
	return kind === SPINE_KIND_DISPATCH || kind === "dispatch-retired";
}

// Assignment coupled-write kinds (plan 054 P2 T005). Their state side is the
// assignment RECORD; prev/next carry canonicalAssignmentJson (states[]
// excluded — a log-derived index). The two STATE kinds additionally join the
// record's states[] chain, reconciled on replay.
const ASSIGNMENT_STATE_KINDS: ReadonlySet<string> = new Set([
	SPINE_KIND_STATE_SET,
	SPINE_KIND_STATE_CLEARED,
	SPINE_KIND_STATE_VERIFIED,
]);
const ASSIGNMENT_KINDS: ReadonlySet<string> = new Set([
	SPINE_KIND_TASK_SET,
	...ASSIGNMENT_STATE_KINDS,
]);

/** The `assignment:<id>` structured ref names the record an assignment op is
 *  coupled to — the adjudication key, exactly as `draft.project` is for
 *  project ops. */
function assignmentRefOf(draft: SpineEventDraft): string | undefined {
	for (const ref of draft.refs) {
		if (ref.startsWith("assignment:")) return ref.slice("assignment:".length);
	}
	return undefined;
}

function structuredRefOf(draft: SpineEventDraft, prefix: string): string | undefined {
	for (const ref of draft.refs) {
		if (ref.startsWith(prefix)) return ref.slice(prefix.length);
	}
	return undefined;
}

export interface RecoverySummary {
	/** Ops whose event reached the spine (freshly or already there). */
	readonly replayed: number;
	/** Abandoned intents dropped WITHOUT touching the spine. */
	readonly discarded: number;
}

/** Resolve every surviving journal op, order-ascending. Ok when the journal
 *  drains; E-NOREG naming the first unresolvable op otherwise — the caller
 *  (a platform WRITE verb) must then fail WITHOUT mutating anything.
 *  Widened for plan 054 P2 (T005, the expected contract-signature change):
 *  assignment coupled ops adjudicate against the ASSIGNMENT store the same
 *  way project ops adjudicate against the project store. */
export function recoverPendingOps(
	journal: OpJournalPort,
	spineLog: SpineLogPort,
	projectStore: ProjectStorePort,
	assignmentStore: AssignmentStorePort,
	allocationStore: AllocationStorePort,
	fenceStore: FenceStorePort,
	dispatchStore: DispatchStorePort,
): Result<RecoverySummary> {
	let replayed = 0;
	let discarded = 0;
	// An unenumerable journal (unreadable/invalid op-shaped entry) fails
	// recovery BEFORE any mutation (review 003 H2): a damaged safety record is
	// not absence, and no verb may write past a predecessor it cannot audit.
	const pending = journal.pending();
	if (!pending.ok) return pending;
	for (const op of pending.value) {
		const outcome = resolveOp(
			op,
			spineLog,
			projectStore,
			assignmentStore,
			allocationStore,
			fenceStore,
			dispatchStore,
		);
		// Blocked: stop IN ORDER — successors must not overtake (G3).
		if (!outcome.ok) return outcome;
		// A resolution only COUNTS once the entry is DURABLY resolved (review
		// 003 M3, hardened by review 005 K1: clear ok requires resolution
		// evidence that survives power loss): reporting success over a
		// surviving live entry lets the successor mutate state and turns the
		// stale op into a delayed machine-wide wedge ("neither prev nor next"
		// one write later). Stop here instead — the resolution itself was
		// idempotent and re-runs safely.
		const cleared = journal.clear(op.opId);
		if (!cleared.ok) {
			return blocked(
				op,
				`was resolved but its journal entry could not be cleared (${cleared.message})`,
			);
		}
		if (outcome.value === "replayed") replayed += 1;
		else discarded += 1;
	}
	return ok({ replayed, discarded });
}

function resolveOp(
	op: PendingOp,
	spineLog: SpineLogPort,
	projectStore: ProjectStorePort,
	assignmentStore: AssignmentStorePort,
	allocationStore: AllocationStorePort,
	fenceStore: FenceStorePort,
	dispatchStore: DispatchStorePort,
): Result<"replayed" | "discarded"> {
	if (op.phase === "committed") {
		return resolveCommitted(
			op,
			spineLog,
			projectStore,
			assignmentStore,
			allocationStore,
			fenceStore,
			dispatchStore,
		);
	}
	// Intent: the crash hit between record and markCommitted — adjudicate
	// whether the state write landed inside that window.
	const { kind, project: slug, prev, next } = op.draft;
	if (ASSIGNMENT_KINDS.has(kind)) {
		return resolveAssignmentIntent(op, spineLog, assignmentStore);
	}
	if (kind === SPINE_KIND_ALLOCATION) {
		const id = structuredRefOf(op.draft, "allocation:");
		return resolveRecordIntent(
			op,
			spineLog,
			allocationStore,
			id,
			canonicalAllocationJson,
			"allocation",
		);
	}
	if (kind === SPINE_KIND_FENCE) {
		const id = structuredRefOf(op.draft, "fence:");
		return resolveRecordIntent(op, spineLog, fenceStore, id, canonicalFenceJson, "fence");
	}
	if (isDispatchJournalKind(kind)) {
		const id = structuredRefOf(op.draft, "dispatch:");
		return resolveRecordIntent(op, spineLog, dispatchStore, id, canonicalDispatchJson, "dispatch");
	}
	if (
		(kind !== SPINE_KIND_PROJECT_CREATED && kind !== SPINE_KIND_PROJECT_SET) ||
		slug === undefined ||
		next === undefined
	) {
		return blocked(op, "carries an unadjudicable intent (not a project coupled-write draft)");
	}
	const current = projectStore.read(slug);
	const currentCanonical = current === null ? null : canonicalProjectJson(current);
	// State landed (crash after the write, before the committed flip): replay.
	if (currentCanonical === next) return replay(op, spineLog);
	if (kind === SPINE_KIND_PROJECT_CREATED) {
		// The slug never materialized — or another writer's record occupies it,
		// so this create lost the first-writer race. Either way it appended no
		// state and can never land now: an abandoned intent, discarded so the
		// spine never claims it (G2's phantom).
		return ok("discarded");
	}
	if (currentCanonical === null) {
		return blocked(op, `names project '${slug}' which is missing from the store`);
	}
	// The set never landed: state still reads as the draft's before-image.
	if (currentCanonical === prev) return ok("discarded");
	// Neither side of the intent matches the store: the persisted state has
	// diverged from the audit chain (e.g. a doubly-lost clear straddling later
	// writes, or out-of-band edits). Fail loudly — writing past this would
	// forge history.
	return blocked(op, `disagrees with persisted state of project '${slug}' (neither prev nor next)`);
}

function resolveRecordIntent<T>(
	op: PendingOp,
	spineLog: SpineLogPort,
	store: { read(id: string): T | null },
	id: string | undefined,
	canonical: (record: T) => string,
	label: string,
): Result<"replayed" | "discarded"> {
	const { prev, next } = op.draft;
	if (id === undefined || next === undefined) {
		return blocked(op, `carries an unadjudicable ${label} intent (missing structured ref/next)`);
	}
	const current = store.read(id);
	const currentCanonical = current === null ? null : canonical(current);
	if (currentCanonical === next) return replay(op, spineLog);
	if (currentCanonical === null) {
		if (prev === undefined) return ok("discarded");
		return blocked(op, `names ${label} '${id}' which is missing from the store`);
	}
	if (currentCanonical === prev) return ok("discarded");
	return blocked(op, `disagrees with persisted state of ${label} '${id}' (neither prev nor next)`);
}

/** Assignment-intent adjudication (plan 054 P2 T005) — the G2 window logic,
 *  keyed on the `assignment:<id>` ref and canonicalAssignmentJson. A
 *  creation-shaped draft (no prev) whose record never materialized is an
 *  abandoned intent — discarded so the spine never claims it; a draft that
 *  claims a prior record (prev present) whose record is MISSING is store
 *  divergence — blocked. */
function resolveAssignmentIntent(
	op: PendingOp,
	spineLog: SpineLogPort,
	assignmentStore: AssignmentStorePort,
): Result<"replayed" | "discarded"> {
	const { prev, next } = op.draft;
	const id = assignmentRefOf(op.draft);
	if (id === undefined || next === undefined) {
		return blocked(op, "carries an unadjudicable intent (assignment op without an assignment ref)");
	}
	const current = assignmentStore.read(id);
	const currentCanonical = current === null ? null : canonicalAssignmentJson(current);
	// Record landed (crash after the write, before the committed flip): replay.
	if (currentCanonical === next) return replayAssignment(op, spineLog, assignmentStore);
	if (currentCanonical === null) {
		if (prev === undefined) return ok("discarded"); // creation never landed (G2's phantom)
		return blocked(op, `names assignment '${id}' which is missing from the store`);
	}
	if (currentCanonical === prev) return ok("discarded");
	return blocked(
		op,
		`disagrees with persisted state of assignment '${id}' (neither prev nor next)`,
	);
}

/** Replay an assignment op and — for the STATE kinds — reconcile the record's
 *  log-derived states[] index with the stamped seq (idempotent: replay-to-
 *  existing carries the ORIGINAL seq, so no cut can duplicate or lose a chain
 *  entry). A reconcile failure blocks IN ORDER like any other unresolvable
 *  op: the append itself was keyed and re-runs safely next pass. */
function replayAssignment(
	op: PendingOp,
	spineLog: SpineLogPort,
	assignmentStore: AssignmentStorePort,
): Result<"replayed"> {
	const appended = spineLog.appendOnce(op.opId, op.draft);
	if (!appended.ok) {
		return blocked(op, `cannot be replayed to the spine (${appended.message})`);
	}
	if (!ASSIGNMENT_STATE_KINDS.has(op.draft.kind)) return ok("replayed");
	const id = assignmentRefOf(op.draft);
	if (id === undefined) return ok("replayed"); // unreachable: adjudication required the ref
	const current = assignmentStore.read(id);
	if (current === null) {
		return blocked(
			op,
			`was replayed but assignment '${id}' vanished before its states index could be reconciled`,
		);
	}
	const seq = appended.value.event.seq;
	if (current.states.includes(seq)) return ok("replayed");
	const written = assignmentStore.write(appendStateRef(current, seq));
	if (!written.ok) {
		return blocked(
			op,
			`was replayed but assignment '${id}' could not take its states index ref (${written.message})`,
		);
	}
	return ok("replayed");
}

/** A committed marker claims its state write landed — corroborate before
 *  replaying (review 003 H1). The marker alone is NOT proof: `markCommitted`
 *  and the state publish are separate durability domains, so a crash can
 *  leave the flip on disk while the state write it describes never survived.
 *  For a COUPLED op the ONLY corroboration is persisted state canonically
 *  equal to the draft's `next` (review 004 J1): an existing once-record
 *  proves the EVENT survived, not the project publish — spine link and
 *  project rename are separate directory entries under best-effort fsync,
 *  so the once-file can outlive a lost publish, and replay-and-clear there
 *  would bless an event over state that never landed while destroying the
 *  only recovery record. (State equal to `next` covers the lost-clear case
 *  too: the lock plus this gate forbid later writes while the op pends, so
 *  a fully-landed write still reads as `next` — appendOnce then resolves to
 *  the EXISTING event.) An UNCOUPLED draft carries no state to consult; its
 *  once-record alone corroborates. Otherwise block: appending would forge
 *  an audit event for state that never existed. */
function resolveCommitted(
	op: PendingOp,
	spineLog: SpineLogPort,
	projectStore: ProjectStorePort,
	assignmentStore: AssignmentStorePort,
	allocationStore: AllocationStorePort,
	fenceStore: FenceStorePort,
	dispatchStore: DispatchStorePort,
): Result<"replayed"> {
	const { kind, project: slug, next } = op.draft;
	if (kind === SPINE_KIND_ALLOCATION) {
		return resolveCommittedRecord(
			op,
			spineLog,
			allocationStore,
			structuredRefOf(op.draft, "allocation:"),
			canonicalAllocationJson,
			"allocation",
		);
	}
	if (kind === SPINE_KIND_FENCE) {
		return resolveCommittedRecord(
			op,
			spineLog,
			fenceStore,
			structuredRefOf(op.draft, "fence:"),
			canonicalFenceJson,
			"fence",
		);
	}
	if (isDispatchJournalKind(kind)) {
		return resolveCommittedRecord(
			op,
			spineLog,
			dispatchStore,
			structuredRefOf(op.draft, "dispatch:"),
			canonicalDispatchJson,
			"dispatch",
		);
	}
	// Assignment kinds are COUPLED (plan 054 P2 T005): before this branch they
	// fell to the uncoupled once-record path — the J1 forge for assignment
	// ops, blessing an event whose record publish never survived.
	if (ASSIGNMENT_KINDS.has(kind)) {
		const id = assignmentRefOf(op.draft);
		if (id === undefined || next === undefined) {
			return blocked(
				op,
				"was marked committed but carries no adjudicable assignment identity — refusing to forge history",
			);
		}
		const current = assignmentStore.read(id);
		if (current !== null && canonicalAssignmentJson(current) === next) {
			return replayAssignment(op, spineLog, assignmentStore);
		}
		return blocked(
			op,
			spineLog.hasOnce(op.opId)
				? `was marked committed and its event reached the spine, but persisted assignment '${id}' does not match its next — the state write did not survive; refusing to bless an event over state that never landed`
				: `was marked committed but persisted assignment '${id}' does not match its next and its event never reached the spine — the state write did not survive; refusing to forge history`,
		);
	}
	const coupled =
		(kind === SPINE_KIND_PROJECT_CREATED || kind === SPINE_KIND_PROJECT_SET) &&
		slug !== undefined &&
		next !== undefined;
	if (coupled) {
		const current = projectStore.read(slug);
		if (current !== null && canonicalProjectJson(current) === next) return replay(op, spineLog);
		return blocked(
			op,
			spineLog.hasOnce(op.opId)
				? "was marked committed and its event reached the spine, but persisted state does not match its next — the state write did not survive; refusing to bless an event over state that never landed"
				: "was marked committed but persisted state does not match its next and its event never reached the spine — the state write did not survive; refusing to forge history",
		);
	}
	if (spineLog.hasOnce(op.opId)) return replay(op, spineLog);
	return blocked(
		op,
		"was marked committed but carries no adjudicable state and its event never reached the spine — the state write cannot be corroborated; refusing to forge history",
	);
}

function resolveCommittedRecord<T>(
	op: PendingOp,
	spineLog: SpineLogPort,
	store: { read(id: string): T | null },
	id: string | undefined,
	canonical: (record: T) => string,
	label: string,
): Result<"replayed"> {
	const next = op.draft.next;
	if (id === undefined || next === undefined) {
		return blocked(
			op,
			`was marked committed but carries no adjudicable ${label} identity — refusing to forge history`,
		);
	}
	const current = store.read(id);
	if (current !== null && canonical(current) === next) return replay(op, spineLog);
	return blocked(
		op,
		spineLog.hasOnce(op.opId)
			? `was marked committed and its event reached the spine, but persisted ${label} '${id}' does not match its next — the state write did not survive; refusing to bless an event over state that never landed`
			: `was marked committed but persisted ${label} '${id}' does not match its next and its event never reached the spine — the state write did not survive; refusing to forge history`,
	);
}

function replay(op: PendingOp, spineLog: SpineLogPort): Result<"replayed"> {
	// appendOnce keyed by opId: idempotent no matter how many passes see the
	// same op — "existing" (a crash landed between append and clear) counts
	// as replayed and clears like a fresh append.
	const appended = spineLog.appendOnce(op.opId, op.draft);
	if (!appended.ok) {
		return blocked(op, `cannot be replayed to the spine (${appended.message})`);
	}
	return ok("replayed");
}

function blocked(op: PendingOp, reason: string): Result<never> {
	const scope = op.draft.project === undefined ? "" : ` project:${op.draft.project}`;
	return err(
		"E-NOREG",
		`recovery blocked: journaled op ${op.opId} (${op.draft.kind}${scope}) ${reason} — resolve it before any further platform write`,
	);
}
