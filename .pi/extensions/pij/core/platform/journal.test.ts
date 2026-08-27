// pij platform — recoverPendingOps pure-logic specs (review 002 G2/G3 — RED
// first; supersedes the review-001 replayPendingOps best-effort semantics).
//
// Pins the recovery half of the journal-FIRST coupled write lifecycle:
// COMMITTED ops replay unconditionally via appendOnce(opId, draft) and clear;
// INTENT ops are adjudicated against persisted state — landed (state matches
// the draft's `next`) replays, abandoned (state matches `prev`, or a create
// whose slug never materialized) is DISCARDED without ever touching the
// spine; anything unadjudicable or unreplayable BLOCKS recovery with an
// honest E-NOREG, in durable order, so no successor op or verb can causally
// overtake a predecessor (the reviewer's B→C-before-A→B trace). Total in the
// P4 sense: never throws.
//
// The fakes live IN THIS FILE: the core/platform boundary sensor
// (boundary.test.ts) forbids any adapters/ import here, so the adapter fakes
// cannot be used. These minimal port implementations mirror their semantics:
// deterministic "op-N" ids, order-ascending pending, one-shot appendOnce
// fault injection.

import { describe, expect, it } from "vitest";
import { err, ok, type Result } from "../types.js";
import { canonicalAllocationJson } from "./allocation.js";
import { canonicalAssignmentJson } from "./assignment.js";
import { canonicalDispatchJson } from "./dispatch.js";
import { canonicalFenceJson } from "./fence.js";
import { recoverPendingOps } from "./journal.js";
import type {
	AllocationStorePort,
	AssignmentStorePort,
	DispatchStorePort,
	FenceStorePort,
	OpJournalPort,
	PendingOp,
	PendingOpPhase,
	ProjectStorePort,
	SpineAppendOnceOutcome,
	SpineLogPort,
} from "./ports.js";
import { canonicalProjectJson } from "./project.js";
import type { SpineEventQuery } from "./spine.js";
import { type BuildSpineEventInput, buildSpineEvent, filterSpineEvents } from "./spine.js";
import type {
	Allocation,
	Assignment,
	Dispatch,
	Fence,
	Project,
	SpineEvent,
	SpineEventDraft,
} from "./types.js";

const T = Date.parse("2026-07-16T12:00:00.000Z");

function draft(n: number, over: Partial<BuildSpineEventInput> = {}): SpineEventDraft {
	// buildSpineEvent is fallible on the clock (review 001 F7); the fixed
	// test clock is always valid, so unwrap keeps call sites draft-shaped.
	const result = buildSpineEvent({ nowMs: T + n * 1000, actor: "tester", kind: "note", ...over });
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

interface TestJournalEntry {
	order: number;
	phase: PendingOpPhase;
	draft: SpineEventDraft;
}

class TestOpJournal implements OpJournalPort {
	readonly ops = new Map<string, TestJournalEntry>();
	readonly cleared: string[] = [];
	/** When set, pending() fails with it (H2's unenumerable-journal image). */
	pendingFailure: Result<never> | null = null;
	private counter = 0;
	private clearFailures = 0;

	/** Queue one injected clear failure (M3's failed-removal image). */
	failClearNext(): void {
		this.clearFailures += 1;
	}

	record(draft: SpineEventDraft): Result<string> {
		this.counter += 1;
		const opId = `op-${this.counter}`;
		let order = 1;
		for (const entry of this.ops.values()) if (entry.order >= order) order = entry.order + 1;
		this.ops.set(opId, { order, phase: "intent", draft });
		return ok(opId);
	}

	markCommitted(opId: string): Result<void> {
		const entry = this.ops.get(opId);
		if (!entry) return err("E-NOREG", `no journaled op '${opId}' to mark committed`);
		entry.phase = "committed";
		return ok(undefined);
	}

	clear(opId: string): Result<void> {
		if (this.clearFailures > 0) {
			this.clearFailures -= 1;
			return err("E-NOREG", `injected clear failure for ${opId}`);
		}
		this.cleared.push(opId);
		this.ops.delete(opId);
		return ok(undefined);
	}

	pending(): Result<readonly PendingOp[]> {
		if (this.pendingFailure) return this.pendingFailure;
		return ok(
			[...this.ops.entries()]
				.map(([opId, entry]) => ({
					opId,
					order: entry.order,
					phase: entry.phase,
					draft: entry.draft,
				}))
				.sort((left, right) =>
					left.order !== right.order
						? left.order - right.order
						: left.opId < right.opId
							? -1
							: left.opId > right.opId
								? 1
								: 0,
				),
		);
	}

	/** Seed a fully-shaped entry directly (crash-state fixtures). */
	seed(opId: string, order: number, phase: PendingOpPhase, draft: SpineEventDraft): void {
		this.ops.set(opId, { order, phase, draft });
	}
}

class TestSpineLog implements SpineLogPort {
	readonly events: SpineEvent[] = [];
	/** Every key appendOnce was called with, in call order. */
	readonly onceKeys: string[] = [];
	private readonly onceEvents = new Map<string, SpineEvent>();
	private failures = 0;

	/** Queue one injected appendOnce failure per call (adapter-fake mirror). */
	failNext(): void {
		this.failures += 1;
	}

	append(draft: SpineEventDraft): Result<SpineEvent> {
		const stamped: SpineEvent = { ...draft, seq: this.lastSeq() + 1 };
		this.events.push(stamped);
		return ok(stamped);
	}

	appendOnce(key: string, draft: SpineEventDraft): Result<SpineAppendOnceOutcome> {
		this.onceKeys.push(key);
		if (this.failures > 0) {
			this.failures -= 1;
			return err("E-NOREG", "injected appendOnce failure");
		}
		const prior = this.onceEvents.get(key);
		if (prior !== undefined) return ok({ outcome: "existing", event: prior });
		const stamped: SpineEvent = { ...draft, seq: this.lastSeq() + 1 };
		this.onceEvents.set(key, stamped);
		this.events.push(stamped);
		return ok({ outcome: "appended", event: stamped });
	}

	hasOnce(key: string): boolean {
		return this.onceEvents.has(key);
	}

	lastSeq(): number {
		let max = 0;
		for (const e of this.events) if (e.seq > max) max = e.seq;
		return max;
	}

	read(query?: SpineEventQuery): SpineEvent[] {
		return filterSpineEvents(this.events, query);
	}
}

class TestProjectStore implements ProjectStorePort {
	readonly projects = new Map<string, Project>();

	constructor(initial: readonly Project[] = []) {
		for (const project of initial) this.projects.set(project.slug, project);
	}

	create(project: Project): Result<"claimed" | "exists"> {
		if (this.projects.has(project.slug)) return ok("exists");
		this.projects.set(project.slug, project);
		return ok("claimed");
	}

	update(project: Project): Result<void> {
		if (!this.projects.has(project.slug)) return err("E-NOREG", `no project '${project.slug}'`);
		this.projects.set(project.slug, project);
		return ok(undefined);
	}

	read(slug: string): Project | null {
		return this.projects.get(slug) ?? null;
	}

	list(): Project[] {
		return [...this.projects.values()];
	}
}

class TestAssignmentStore implements AssignmentStorePort {
	readonly records = new Map<string, Assignment>();

	constructor(initial: readonly Assignment[] = []) {
		for (const assignment of initial) this.records.set(assignment.id, assignment);
	}

	write(assignment: Assignment): Result<void> {
		this.records.set(assignment.id, assignment);
		return ok(undefined);
	}

	read(id: string): Assignment | null {
		return this.records.get(id) ?? null;
	}

	list(): Assignment[] {
		return [...this.records.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}

	listByNode(nodeId: string): Assignment[] {
		return this.list().filter((a) => a.nodeId === nodeId);
	}
}

class TestAllocationStore implements AllocationStorePort {
	readonly records = new Map<string, Allocation>();

	constructor(initial: readonly Allocation[] = []) {
		for (const allocation of initial) this.records.set(allocation.id, allocation);
	}

	write(allocation: Allocation): Result<void> {
		this.records.set(allocation.id, allocation);
		return ok(undefined);
	}

	read(id: string): Allocation | null {
		return this.records.get(id) ?? null;
	}

	list(): Allocation[] {
		return [...this.records.values()].sort((left, right) => left.ordinal - right.ordinal);
	}
}

class TestFenceStore implements FenceStorePort {
	readonly records = new Map<string, Fence>();

	constructor(initial: readonly Fence[] = []) {
		for (const fence of initial) this.records.set(fence.id, fence);
	}

	write(fence: Fence): Result<void> {
		this.records.set(fence.id, fence);
		return ok(undefined);
	}

	read(id: string): Fence | null {
		return this.records.get(id) ?? null;
	}

	list(): Fence[] {
		return [...this.records.values()].sort((left, right) => left.id.localeCompare(right.id));
	}
}

class TestDispatchStore implements DispatchStorePort {
	readonly records = new Map<string, Dispatch>();

	constructor(initial: readonly Dispatch[] = []) {
		for (const dispatch of initial) this.records.set(dispatch.id, dispatch);
	}

	write(dispatch: Dispatch): Result<void> {
		this.records.set(dispatch.id, dispatch);
		return ok(undefined);
	}

	read(id: string): Dispatch | null {
		return this.records.get(id) ?? null;
	}

	list(): Dispatch[] {
		return [...this.records.values()].sort((left, right) => left.id.localeCompare(right.id));
	}
}

/** Legacy 3-port call shape: pre-P2 pins don't consult the assignment store,
 *  so an empty one keeps them byte-meaning-identical after the T005 widening. */
function recover(
	journal: OpJournalPort,
	log: SpineLogPort,
	store: ProjectStorePort,
	assignments: AssignmentStorePort = new TestAssignmentStore(),
	allocations: AllocationStorePort = new TestAllocationStore(),
	fences: FenceStorePort = new TestFenceStore(),
	dispatches: DispatchStorePort = new TestDispatchStore(),
): ReturnType<typeof recoverPendingOps> {
	return recoverPendingOps(journal, log, store, assignments, allocations, fences, dispatches);
}

function expectOk<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
	return result.value;
}

// ─── fixtures: a project in two canonical states ────────────────────────────
const alphaV1: Project = {
	schema_version: 1,
	slug: "alpha",
	description: "alpha",
	created: { actor: "tester", ts: new Date(T).toISOString() },
};
const alphaV2: Project = { ...alphaV1, planPath: "docs/plan.md" };
const betaV1: Project = {
	schema_version: 1,
	slug: "beta",
	description: "beta",
	created: { actor: "tester", ts: new Date(T).toISOString() },
};

function setDraft(n: number, prev: Project, next: Project): SpineEventDraft {
	return draft(n, {
		kind: "project-set",
		project: prev.slug,
		refs: [`project:${prev.slug}`],
		prev: canonicalProjectJson(prev),
		next: canonicalProjectJson(next),
	});
}

function createDraft(n: number, next: Project): SpineEventDraft {
	return draft(n, {
		kind: "project-created",
		project: next.slug,
		refs: [`project:${next.slug}`],
		next: canonicalProjectJson(next),
	});
}

describe("recoverPendingOps", () => {
	it("an empty journal recovers nothing and touches nothing", () => {
		const journal = new TestOpJournal();
		const log = new TestSpineLog();
		const store = new TestProjectStore();
		expect(expectOk(recover(journal, log, store))).toEqual({
			replayed: 0,
			discarded: 0,
		});
		expect(log.events).toEqual([]);
		expect(log.onceKeys).toEqual([]);
		expect(journal.cleared).toEqual([]);
	});

	describe("committed markers are corroborated, never trusted alone (review 003 H1)", () => {
		it("replays via appendOnce KEYED BY opId and clears each on success (state matches next)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1, betaV1]);
			const first = expectOk(journal.record(createDraft(1, alphaV1)));
			expectOk(journal.markCommitted(first));
			const second = expectOk(journal.record(createDraft(2, betaV1)));
			expectOk(journal.markCommitted(second));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 2,
				discarded: 0,
			});
			expect(log.onceKeys).toEqual([first, second]);
			expect(log.read().map((e) => ({ seq: e.seq, project: e.project }))).toEqual([
				{ seq: 1, project: "alpha" },
				{ seq: 2, project: "beta" },
			]);
			expect(expectOk(journal.pending())).toEqual([]);
			expect(journal.cleared).toEqual([first, second]);
		});

		it("clears on outcome 'existing': a crash between append and clear never double-appends", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]);
			const d = createDraft(1, alphaV1);
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			// The crashed writer already got its append in — only clear was lost.
			expect(expectOk(log.appendOnce(opId, d)).outcome).toBe("appended");
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1);
			expect(expectOk(journal.pending())).toEqual([]);
		});

		it("a committed set whose persisted state is still PREV and whose event never landed BLOCKS — the reviewer's marker-over-state forge probe", () => {
			// The marker outlived a state write that never survived (e.g. a
			// swallowed dir-fsync on power loss). The old rationale — "a later
			// write moved state on" — is impossible here: the write lock plus the
			// recovery gate forbid any later platform write while this op pends.
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]); // still the before-image
			const opId = expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			expectOk(journal.markCommitted(opId));
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) {
				expect(result.message).toContain(opId);
				expect(result.message).toMatch(/committed/i);
				expect(result.message).toMatch(/state write/i);
			}
			// The spine was NEVER touched: no forged project-set, entry survives.
			expect(log.events).toEqual([]);
			expect(expectOk(journal.pending())).toHaveLength(1);
			expect(journal.cleared).toEqual([]);
		});

		it("a committed create whose slug is MISSING and whose event never landed BLOCKS", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore(); // the record vanished with the crash
			const opId = expectOk(journal.record(createDraft(1, alphaV1)));
			expectOk(journal.markCommitted(opId));
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain(opId);
			expect(log.events).toEqual([]);
			expect(expectOk(journal.pending())).toHaveLength(1);
		});

		it("a committed marker whose event ALREADY landed replays to the existing event and clears — the clear-was-lost case", () => {
			// The one legitimate way a committed marker coexists with a durably
			// appended event: the whole coupled write landed, only the CLEAR was
			// lost. Persisted state STILL equals the draft's next (the lock plus
			// the recovery gate forbid later writes while the op pends), so the
			// state check corroborates it — the once-record is never needed to
			// override anything (review 004 J1).
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV2]); // the set DID land
			const d = setDraft(1, alphaV1, alphaV2);
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			expect(expectOk(log.appendOnce(opId, d)).outcome).toBe("appended");
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1); // the existing event, no duplicate
			expect(journal.cleared).toEqual([opId]);
		});

		it("a committed set at PREV whose once-record EXISTS still BLOCKS — the once-file proves the event survived, not the project publish (review 004 J1)", () => {
			// The reviewer's crash image: journal, committed flip AND appendOnce
			// all reached disk, but the earlier project publish — a separate
			// directory entry under best-effort fsync — did not. State says A;
			// the log claims A→B. Replay-and-clear here permanently blesses the
			// split brain and destroys the only recovery record.
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]); // still the before-image
			const d = setDraft(1, alphaV1, alphaV2);
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			expect(expectOk(log.appendOnce(opId, d)).outcome).toBe("appended");
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) {
				expect(result.message).toContain(opId);
				expect(result.message).toMatch(/committed/i);
				expect(result.message).toMatch(/state/i);
			}
			// Retained, never cleared: the entry is the operator's evidence.
			expect(expectOk(journal.pending())).toHaveLength(1);
			expect(journal.cleared).toEqual([]);
		});

		it("a committed create whose slug is ABSENT but whose once-record exists BLOCKS (review 004 J1)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore(); // the record never survived
			const d = createDraft(1, alphaV1);
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			expect(expectOk(log.appendOnce(opId, d)).outcome).toBe("appended");
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain(opId);
			expect(expectOk(journal.pending())).toHaveLength(1);
			expect(journal.cleared).toEqual([]);
		});

		it("a committed NON-coupled draft is corroborated by the once-record alone: absent blocks, existing replays", () => {
			// Production never journals uncoupled drafts, but a committed marker
			// with no state to consult must still never be trusted bare.
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore();
			const d = draft(1, { kind: "note" });
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			expect(recover(journal, log, store)).toMatchObject({
				ok: false,
				code: "E-NOREG",
			});
			expect(log.events).toEqual([]);
			// Once the event is provably in the log, the same entry resolves.
			expect(expectOk(log.appendOnce(opId, d)).outcome).toBe("appended");
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1);
		});
	});

	describe("intent ops are adjudicated against persisted state (review 002 G2)", () => {
		it("ABANDONED set intent (state still matches prev) is DISCARDED — the reviewer's phantom-replay probe", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]); // the update never landed
			const opId = expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 0,
				discarded: 1,
			});
			// The spine was NEVER touched — no phantom project-set at seq 1.
			expect(log.onceKeys).toEqual([]);
			expect(log.events).toEqual([]);
			expect(expectOk(journal.pending())).toEqual([]);
			expect(journal.cleared).toEqual([opId]);
		});

		it("LANDED set intent (state matches next — crash before the committed flip) is replayed", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV2]); // the update DID land
			expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1);
			expect(log.events[0]).toMatchObject({ kind: "project-set", project: "alpha" });
		});

		it("a NO-OP set intent (prev === next === persisted) is replayed — audited no-op intent, per the ratified ruling", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]);
			expectOk(journal.record(setDraft(1, alphaV1, alphaV1)));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1);
		});

		it("ABANDONED create intent (slug never materialized) is DISCARDED", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore(); // empty: the create never landed
			expectOk(journal.record(createDraft(1, alphaV1)));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 0,
				discarded: 1,
			});
			expect(log.events).toEqual([]);
		});

		it("LANDED create intent (persisted record matches next exactly) is replayed", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]);
			expectOk(journal.record(createDraft(1, alphaV1)));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1);
			expect(log.events[0]).toMatchObject({ kind: "project-created", project: "alpha" });
		});

		it("create intent whose slug is occupied by a DIFFERENT record (lost race) is DISCARDED — that create can no longer land", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const other: Project = { ...alphaV1, description: "someone else's alpha" };
			const store = new TestProjectStore([other]);
			expectOk(journal.record(createDraft(1, alphaV1)));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 0,
				discarded: 1,
			});
			expect(log.events).toEqual([]);
		});
	});

	describe("recovery BLOCKS honestly instead of writing past a problem (review 002 G3)", () => {
		it("a committed op whose replay fails blocks with E-NOREG naming the op; successors are NOT processed", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV2]);
			const first = expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			expectOk(journal.markCommitted(first));
			const second = expectOk(journal.record(createDraft(2, alphaV1)));
			expectOk(journal.markCommitted(second));
			log.failNext();
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) {
				expect(result.message).toContain(first);
				expect(result.message).toMatch(/recovery/i);
			}
			// Order law: the successor did NOT overtake — only op-1 was attempted.
			expect(log.onceKeys).toEqual([first]);
			expect(log.events).toEqual([]);
			expect(expectOk(journal.pending())).toHaveLength(2);
			expect(journal.cleared).toEqual([]);
		});

		it("a set intent whose persisted state matches NEITHER prev nor next blocks (store diverged from the audit chain)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const elsewhere: Project = { ...alphaV1, primeId: "pij-someone" };
			const store = new TestProjectStore([elsewhere]);
			const opId = expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain(opId);
			expect(log.onceKeys).toEqual([]);
			expect(expectOk(journal.pending())).toHaveLength(1);
		});

		it("a set intent for a MISSING project blocks (projects cannot vanish — corrupt store)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore();
			expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			expect(recover(journal, log, store)).toMatchObject({
				ok: false,
				code: "E-NOREG",
			});
			expect(log.events).toEqual([]);
		});

		it("an intent that is not a project coupled-write draft blocks (unadjudicable)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore();
			expectOk(journal.record(draft(1, { kind: "note" })));
			expect(recover(journal, log, store)).toMatchObject({
				ok: false,
				code: "E-NOREG",
			});
			expect(log.events).toEqual([]);
		});

		it("a DISCARDED intent whose clear fails blocks recovery — success is never reported over a surviving entry (review 003 M3)", () => {
			// The reviewer's trace: abandoned intent → failed recovery clear →
			// successor proceeds and mutates → the stale intent becomes "neither
			// prev nor next" — a delayed machine-wide wedge. Recovery must stop
			// AT the failed clear instead.
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]); // the set never landed
			const opId = expectOk(journal.record(setDraft(1, alphaV1, alphaV2)));
			journal.failClearNext();
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) {
				expect(result.message).toContain(opId);
				expect(result.message).toMatch(/clear/i);
			}
			// Nothing was written and the entry survives for the retry.
			expect(log.onceKeys).toEqual([]);
			expect(log.events).toEqual([]);
			expect(expectOk(journal.pending())).toHaveLength(1);
			// The next pass (clear healed) resolves it and the journal drains.
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 0,
				discarded: 1,
			});
			expect(expectOk(journal.pending())).toEqual([]);
		});

		it("a REPLAYED op whose clear fails blocks recovery in order — the successor op is never attempted (review 003 M3)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1, betaV1]);
			const first = expectOk(journal.record(createDraft(1, alphaV1)));
			expectOk(journal.markCommitted(first));
			const second = expectOk(journal.record(createDraft(2, betaV1)));
			expectOk(journal.markCommitted(second));
			journal.failClearNext();
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain(first);
			// The replay itself landed (idempotent under the opId key), but the
			// successor did NOT overtake the wedged predecessor.
			expect(log.onceKeys).toEqual([first]);
			expect(expectOk(journal.pending())).toHaveLength(2);
			// Healed retry: the landed event is not duplicated, both drain.
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 2,
				discarded: 0,
			});
			expect(log.events).toHaveLength(2);
			expect(expectOk(journal.pending())).toEqual([]);
		});

		it("an unenumerable journal fails recovery BEFORE any mutation, propagating the path-naming error (review 003 H2)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1]);
			journal.pendingFailure = err(
				"E-NOREG",
				"unreadable or invalid journal op /pij/spine/ops/damaged.json — resolve or remove it before any further platform write",
			);
			const result = recover(journal, log, store);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain("damaged.json");
			expect(log.onceKeys).toEqual([]);
			expect(log.events).toEqual([]);
			expect(journal.cleared).toEqual([]);
		});

		it("never throws even when the blocked path is hit repeatedly", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore();
			expectOk(journal.record(draft(1, { kind: "note" })));
			expect(() => {
				recover(journal, log, store);
				recover(journal, log, store);
			}).not.toThrow();
			expect(expectOk(journal.pending())).toHaveLength(1);
		});
	});

	describe("durable causal order governs replay (review 002 G3)", () => {
		it("replays by persisted ORDER, not opId-lexical — op-10 never overtakes op-2's predecessor", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV2, betaV1]);
			// Seed out of lexical order: "op-10" (order 2) vs "op-9" (order 1).
			// Lexically "op-10" < "op-9", so an opId sort would invert causality.
			journal.seed("op-9", 1, "committed", setDraft(1, alphaV1, alphaV2));
			journal.seed("op-10", 2, "committed", createDraft(2, betaV1));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 2,
				discarded: 0,
			});
			expect(log.onceKeys).toEqual(["op-9", "op-10"]);
			expect(log.read().map((e) => e.kind)).toEqual(["project-set", "project-created"]);
		});

		it("equal orders (concurrent writers) tiebreak deterministically by opId", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const store = new TestProjectStore([alphaV1, betaV1]);
			journal.seed("op-b", 1, "committed", createDraft(1, alphaV1));
			journal.seed("op-a", 1, "committed", createDraft(2, betaV1));
			expect(expectOk(recover(journal, log, store))).toEqual({
				replayed: 2,
				discarded: 0,
			});
			expect(log.onceKeys).toEqual(["op-a", "op-b"]);
		});
	});
});

// ─── plan 054 P2 T005 — assignment-op adjudication (port-first widening) ─────
// task-set / state-set / state-verified are COUPLED ops whose state side is
// the assignment RECORD. prev/next carry canonicalAssignmentJson — which
// EXCLUDES `states` (a log-derived index appended inside the pend window, so
// including it would diverge the record from `next` mid-op). Intents
// adjudicate exactly like project intents; committed markers corroborate
// ONLY by store canonical === next (J1: a once-record proves the EVENT
// survived, never the record publish). Replay of the two STATE kinds also
// RECONCILES the index: the stamped seq must end up in states[].

describe("recoverPendingOps — assignment ops (plan 054 P2 T005)", () => {
	const asgOpened = { actor: "tester", ts: new Date(T).toISOString() };
	const asgA: Assignment = {
		schema_version: 1,
		id: "asg-brave-otter",
		nodeId: "pij-node",
		task: "review the packet",
		states: [],
		opened: asgOpened,
	};

	function taskSetDraft(n: number, record: Assignment): SpineEventDraft {
		return draft(n, {
			kind: "task-set",
			peer: record.nodeId,
			refs: [`node:${record.nodeId}`, `assignment:${record.id}`],
			next: canonicalAssignmentJson(record),
		});
	}

	describe("recoverPendingOps — allocation/fence ops (plan 061 T007, AC-11)", () => {
		const allocationV1: Allocation = {
			schema_version: 1,
			id: "alloc-s061-team-scaffold",
			project: "platform",
			ordinal: 61,
			slug: "team-scaffold",
			worktree: "/repo-worktrees/s061-team-scaffold",
			branch: "s061/team-scaffold",
			baseSha: "base",
			state: "created",
			steps: [
				{ name: "worktree-created", ok: true, evidence: "ready", ts: new Date(T).toISOString() },
			],
			created: { actor: "prime", ts: new Date(T).toISOString() },
		};
		const allocationV2: Allocation = {
			...allocationV1,
			steps: [
				...allocationV1.steps,
				{
					name: "allocation-committed",
					ok: true,
					evidence: "attributed",
					ts: new Date(T + 1000).toISOString(),
				},
			],
		};
		const fenceV1: Fence = {
			schema_version: 1,
			id: "fence-alloc-s061-team-scaffold",
			allocation: allocationV1.id,
			touchSet: [".pi/extensions/pij/core/**"],
			shared: [".pi/extensions/pij/core/cli.ts"],
			class: "notify-only",
			updated: { actor: "stream", ts: new Date(T).toISOString() },
		};

		function allocationDraft(prev: Allocation, next: Allocation): SpineEventDraft {
			return draft(1, {
				kind: "allocation",
				project: next.project,
				refs: [`project:${next.project}`, `allocation:${next.id}`, `stream:${next.slug}`],
				prev: canonicalAllocationJson(prev),
				next: canonicalAllocationJson(next),
			});
		}

		function fenceDraft(next: Fence): SpineEventDraft {
			return draft(2, {
				kind: "fence",
				refs: [`allocation:${next.allocation}`, `fence:${next.id}`],
				next: canonicalFenceJson(next),
			});
		}

		it("allocation intent at prev discards; the same intent at next replays", () => {
			const beforeJournal = new TestOpJournal();
			beforeJournal.seed("op-before", 1, "intent", allocationDraft(allocationV1, allocationV2));
			const beforeLog = new TestSpineLog();
			expect(
				expectOk(
					recover(
						beforeJournal,
						beforeLog,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore([allocationV1]),
					),
				),
			).toEqual({ replayed: 0, discarded: 1 });
			expect(beforeLog.events).toEqual([]);

			const afterJournal = new TestOpJournal();
			afterJournal.seed("op-after", 1, "intent", allocationDraft(allocationV1, allocationV2));
			const afterLog = new TestSpineLog();
			expect(
				expectOk(
					recover(
						afterJournal,
						afterLog,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore([allocationV2]),
					),
				),
			).toEqual({ replayed: 1, discarded: 0 });
			expect(afterLog.events).toHaveLength(1);
			expect(afterLog.events[0]?.kind).toBe("allocation");
		});

		it("fence create intent missing from the store discards; landed record replays", () => {
			const missingJournal = new TestOpJournal();
			missingJournal.seed("op-missing", 1, "intent", fenceDraft(fenceV1));
			expect(
				expectOk(
					recover(
						missingJournal,
						new TestSpineLog(),
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore(),
						new TestFenceStore(),
					),
				),
			).toEqual({ replayed: 0, discarded: 1 });

			const landedJournal = new TestOpJournal();
			landedJournal.seed("op-landed", 1, "intent", fenceDraft(fenceV1));
			const landedLog = new TestSpineLog();
			expect(
				expectOk(
					recover(
						landedJournal,
						landedLog,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore(),
						new TestFenceStore([fenceV1]),
					),
				),
			).toEqual({ replayed: 1, discarded: 0 });
			expect(landedLog.events[0]?.kind).toBe("fence");
		});

		it("crash after allocation record+marker but before append heals exactly once on the next write", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const d = allocationDraft(allocationV1, allocationV2);
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			log.failNext();
			const allocations = new TestAllocationStore([allocationV2]);
			const first = recover(
				journal,
				log,
				new TestProjectStore(),
				new TestAssignmentStore(),
				allocations,
			);
			expect(first).toMatchObject({ ok: false, code: "E-NOREG" });
			expect(expectOk(journal.pending())).toHaveLength(1);

			expect(
				expectOk(
					recover(journal, log, new TestProjectStore(), new TestAssignmentStore(), allocations),
				),
			).toEqual({ replayed: 1, discarded: 0 });
			expect(log.events).toHaveLength(1);
			expect(log.onceKeys).toEqual([opId, opId]);
			expect(
				expectOk(
					recover(journal, log, new TestProjectStore(), new TestAssignmentStore(), allocations),
				),
			).toEqual({ replayed: 0, discarded: 0 });
			expect(log.events).toHaveLength(1);
		});

		it("committed allocation whose state write did not survive blocks, even if its event exists", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const d = allocationDraft(allocationV1, allocationV2);
			expectOk(log.appendOnce("op-forged", d));
			journal.seed("op-forged", 1, "committed", d);
			const result = recover(
				journal,
				log,
				new TestProjectStore(),
				new TestAssignmentStore(),
				new TestAllocationStore([allocationV1]),
			);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			expect(journal.cleared).toEqual([]);
		});
	});

	describe("recoverPendingOps — dispatch ops (plan 061 P2 T004, AC-11)", () => {
		const dispatchUndelivered: Dispatch = {
			schema_version: 1,
			id: "dispatch-42",
			packetPath: "/repo/packet.md",
			packetSha256: "a".repeat(64),
			from: "pij-parent",
			to: "pij-worker",
			state: "undelivered",
			created: { actor: "pij-parent", ts: new Date(T).toISOString() },
			updated: { actor: "pij-parent", ts: new Date(T).toISOString() },
		};
		const dispatchDelivered: Dispatch = {
			...dispatchUndelivered,
			messageId: "msg-42",
			deliveryState: "delivered",
			state: "delivered-unacked",
			updated: { actor: "pij-parent", ts: new Date(T + 1000).toISOString() },
		};

		function dispatchDraft(prev: Dispatch, next: Dispatch, kind = "dispatch"): SpineEventDraft {
			return draft(1, {
				kind,
				peer: next.to,
				refs: [`dispatch:${next.id}`, `message:${next.messageId ?? "none"}`],
				prev: canonicalDispatchJson(prev),
				next: canonicalDispatchJson(next),
			});
		}

		it("recovers a dispatch-retired note with dispatch record adjudication", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const transition = dispatchDraft(dispatchUndelivered, dispatchDelivered, "dispatch-retired");
			journal.seed("op-transition", 1, "intent", transition);

			expect(
				expectOk(
					recover(
						journal,
						log,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore(),
						new TestFenceStore(),
						new TestDispatchStore([dispatchDelivered]),
					),
				),
			).toEqual({ replayed: 1, discarded: 0 });
			expect(log.events[0]?.kind).toBe("dispatch-retired");
		});

		it("dispatch intent at prev discards; the same intent at next replays", () => {
			const beforeJournal = new TestOpJournal();
			beforeJournal.seed(
				"op-before",
				1,
				"intent",
				dispatchDraft(dispatchUndelivered, dispatchDelivered),
			);
			const beforeLog = new TestSpineLog();
			expect(
				expectOk(
					recover(
						beforeJournal,
						beforeLog,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore(),
						new TestFenceStore(),
						new TestDispatchStore([dispatchUndelivered]),
					),
				),
			).toEqual({ replayed: 0, discarded: 1 });
			expect(beforeLog.events).toEqual([]);

			const afterJournal = new TestOpJournal();
			afterJournal.seed(
				"op-after",
				1,
				"intent",
				dispatchDraft(dispatchUndelivered, dispatchDelivered),
			);
			const afterLog = new TestSpineLog();
			expect(
				expectOk(
					recover(
						afterJournal,
						afterLog,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore(),
						new TestFenceStore(),
						new TestDispatchStore([dispatchDelivered]),
					),
				),
			).toEqual({ replayed: 1, discarded: 0 });
			expect(afterLog.events[0]?.kind).toBe("dispatch");
		});

		it("crash after dispatch record+marker but before append heals exactly once", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const d = dispatchDraft(dispatchUndelivered, dispatchDelivered);
			const opId = expectOk(journal.record(d));
			expectOk(journal.markCommitted(opId));
			log.failNext();
			const dispatches = new TestDispatchStore([dispatchDelivered]);
			expect(
				recover(
					journal,
					log,
					new TestProjectStore(),
					new TestAssignmentStore(),
					new TestAllocationStore(),
					new TestFenceStore(),
					dispatches,
				),
			).toMatchObject({ ok: false, code: "E-NOREG" });
			expect(
				expectOk(
					recover(
						journal,
						log,
						new TestProjectStore(),
						new TestAssignmentStore(),
						new TestAllocationStore(),
						new TestFenceStore(),
						dispatches,
					),
				),
			).toEqual({ replayed: 1, discarded: 0 });
			expect(log.events).toHaveLength(1);
			expect(log.onceKeys).toEqual([opId, opId]);
		});

		it("committed dispatch whose record write did not survive blocks even when its event exists", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const d = dispatchDraft(dispatchUndelivered, dispatchDelivered);
			expectOk(log.appendOnce("op-forged", d));
			journal.seed("op-forged", 1, "committed", d);
			const result = recover(
				journal,
				log,
				new TestProjectStore(),
				new TestAssignmentStore(),
				new TestAllocationStore(),
				new TestFenceStore(),
				new TestDispatchStore([dispatchUndelivered]),
			);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			expect(journal.cleared).toEqual([]);
		});
	});

	function stateSetDraft(n: number, record: Assignment, state: string): SpineEventDraft {
		return draft(n, {
			kind: "state-set",
			peer: record.nodeId,
			refs: [`node:${record.nodeId}`, `assignment:${record.id}`, `state:${state}`],
			prev: canonicalAssignmentJson(record),
			next: canonicalAssignmentJson(record),
		});
	}

	function stateClearedDraft(n: number, record: Assignment): SpineEventDraft {
		return draft(n, {
			kind: "state-cleared",
			peer: record.nodeId,
			refs: [`node:${record.nodeId}`, `assignment:${record.id}`, "transition:clear"],
			prev: canonicalAssignmentJson(record),
			next: canonicalAssignmentJson(record),
		});
	}

	describe("intent adjudication (G2 extended)", () => {
		it("task-set intent whose record landed replays the event", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const asg = new TestAssignmentStore([asgA]);
			journal.seed("op-1", 1, "intent", taskSetDraft(1, asgA));
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events).toHaveLength(1);
			expect(log.events[0]?.kind).toBe("task-set");
			expect(journal.cleared).toEqual(["op-1"]);
		});

		it("task-set intent whose record never landed is DISCARDED — no phantom event", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			journal.seed("op-1", 1, "intent", taskSetDraft(1, asgA));
			expect(expectOk(recover(journal, log, new TestProjectStore()))).toEqual({
				replayed: 0,
				discarded: 1,
			});
			expect(log.events).toHaveLength(0);
		});

		it("state-set intent (prev===next) with the record present replays", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const asg = new TestAssignmentStore([asgA]);
			journal.seed("op-1", 1, "intent", stateSetDraft(1, asgA, "blocked"));
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events[0]?.kind).toBe("state-set");
		});

		it("state-set intent on an EXISTING record that is missing from the store blocks", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			journal.seed("op-1", 1, "intent", stateSetDraft(1, asgA, "blocked"));
			const result = recover(journal, log, new TestProjectStore());
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain(asgA.id);
			expect(log.events).toHaveLength(0);
		});

		it("an assignment-kind intent without an assignment: ref is unadjudicable — blocks", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			journal.seed(
				"op-1",
				1,
				"intent",
				draft(1, { kind: "task-set", refs: ["node:pij-node"], next: "{}" }),
			);
			const result = recover(journal, log, new TestProjectStore());
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		});

		it("a diverged record (neither prev nor next) blocks — never write past it", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const diverged: Assignment = { ...asgA, task: "something else entirely" };
			const asg = new TestAssignmentStore([diverged]);
			journal.seed("op-1", 1, "intent", stateSetDraft(1, asgA, "blocked"));
			const result = recover(journal, log, new TestProjectStore(), asg);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) expect(result.message).toContain("neither prev nor next");
		});
	});

	describe("committed corroboration (J1 matrix extended to assignments)", () => {
		it("committed task-set with store canonical === next replays and clears", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const asg = new TestAssignmentStore([asgA]);
			journal.seed("op-1", 1, "committed", taskSetDraft(1, asgA));
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.onceKeys).toEqual(["op-1"]);
			expect(journal.cleared).toEqual(["op-1"]);
		});

		it("committed task-set whose record publish was LOST blocks even with a once-record (the J1 forge)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			// The event reached the spine (once-record exists) but the record
			// publish never survived — pre-widening code treated this op as
			// UNCOUPLED and replayed via hasOnce: the forge this pin kills.
			const d = taskSetDraft(1, asgA);
			expectOk(log.appendOnce("op-1", d));
			journal.seed("op-1", 1, "committed", d);
			const result = recover(journal, log, new TestProjectStore());
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			if (!result.ok) {
				expect(result.message).toContain("state write did not survive");
			}
			expect(journal.cleared).toEqual([]);
		});

		it("committed task-set with a mismatched record and no once-record blocks (refusing to forge)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const diverged: Assignment = { ...asgA, task: "someone else won" };
			const asg = new TestAssignmentStore([diverged]);
			journal.seed("op-1", 1, "committed", taskSetDraft(1, asgA));
			const result = recover(journal, log, new TestProjectStore(), asg);
			expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
			expect(log.events).toHaveLength(0);
		});
	});

	describe("states[] index reconciliation on replay (the seq-circularity closure)", () => {
		it("replaying a committed state-set puts the stamped seq into states[]", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const asg = new TestAssignmentStore([asgA]);
			// Crash window: appendOnce never ran (no once-record) — replay
			// appends fresh and must reconcile the index with the NEW seq.
			journal.seed("op-1", 1, "committed", stateSetDraft(1, asgA, "blocked"));
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			const seq = log.events[0]?.seq;
			expect(seq).toBeDefined();
			expect(asg.read(asgA.id)?.states).toEqual([seq]);
		});

		it("replaying a committed state-cleared event also reconciles its stamped seq", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const asg = new TestAssignmentStore([asgA]);
			journal.seed("op-clear", 1, "committed", stateClearedDraft(1, asgA));
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(log.events[0]?.kind).toBe("state-cleared");
			expect(asg.read(asgA.id)?.states).toEqual([log.events[0]?.seq]);
		});

		it("replay-to-EXISTING reconciles with the ORIGINAL seq, idempotently", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const d = stateSetDraft(1, asgA, "blocked");
			const appended = expectOk(log.appendOnce("op-1", d));
			// Crash window: event landed AND the verb already wrote the ref —
			// replay resolves to the existing event and must NOT duplicate it.
			const withRef: Assignment = { ...asgA, states: [appended.event.seq] };
			const asg = new TestAssignmentStore([withRef]);
			journal.seed("op-1", 1, "committed", d);
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(asg.read(asgA.id)?.states).toEqual([appended.event.seq]);
		});

		it("task-set replay does NOT touch states[] (only STATE kinds join the chain)", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			const asg = new TestAssignmentStore([asgA]);
			journal.seed("op-1", 1, "committed", taskSetDraft(1, asgA));
			expectOk(recover(journal, log, new TestProjectStore(), asg));
			expect(asg.read(asgA.id)?.states).toEqual([]);
		});
	});

	describe("canonical states-exclusion law (load-bearing for corroboration)", () => {
		it("a record whose states[] gained refs in the pend window still corroborates", () => {
			const journal = new TestOpJournal();
			const log = new TestSpineLog();
			// The lost-clear image: the coupled write fully landed (event +
			// in-window index ref), only the clear was lost. The on-disk record
			// differs from the draft-time record ONLY in states[] — canonical
			// exclusion is exactly what keeps state === next true here.
			const d = stateSetDraft(1, asgA, "blocked");
			const appended = expectOk(log.appendOnce("op-1", d));
			const withRef: Assignment = { ...asgA, states: [appended.event.seq] };
			const asg = new TestAssignmentStore([withRef]);
			journal.seed("op-1", 1, "committed", d);
			expect(expectOk(recover(journal, log, new TestProjectStore(), asg))).toEqual({
				replayed: 1,
				discarded: 0,
			});
			expect(journal.cleared).toEqual(["op-1"]);
		});
	});
});
