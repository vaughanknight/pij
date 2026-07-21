// pij platform — shared store contract (plan 054, T008).
//
// The port-level behavioral subset of the T005 adapter specs, run against
// BOTH implementations of ProjectStorePort / AssignmentStorePort /
// SpineLogPort / OpJournalPort: the fs adapters over a mkdtempSync temp
// home, and the in-memory fakes (T009's CLI-test substrate). Anything either impl could
// get wrong at the PORT surface lives here exactly once; fs-ONLY laws
// (bytes on disk, temp hygiene, torn tails, cross-instance durability,
// phantom-peer) stay in project-store.test.ts / assignment-store.test.ts /
// spine-store.test.ts and are NOT duplicated.
//
// Seq allocation lives INSIDE the port (review 001 F1): append/appendOnce
// take a SpineEventDraft, stamp the next seq atomically, and return the
// stamped event — no caller ever mints lastSeq() + 1. The contract pins
// strictly increasing unique seqs, the exclusive-cursor no-lost-event law,
// and appendOnce replay returning the ORIGINALLY stamped event.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
	AllocationStorePort,
	AssignmentStorePort,
	DispatchStorePort,
	FenceStorePort,
	OpJournalPort,
	PlatformWriteLockPort,
	ProjectStorePort,
	SpineLogPort,
} from "../core/platform/ports.js";
import { type BuildSpineEventInput, buildSpineEvent } from "../core/platform/spine.js";
import {
	type Allocation,
	type Assignment,
	type Dispatch,
	type Fence,
	isAllocation,
	isDispatch,
	isFence,
	type Project,
	type SpineEvent,
	type SpineEventDraft,
} from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { FsAllocationStore } from "./allocation-store.js";
import { FsAssignmentStore } from "./assignment-store.js";
import { FsDispatchStore } from "./dispatch-store.js";
import {
	FakeAssignmentStore,
	FakeOpJournal,
	FakePlatformWriteLock,
	FakeProjectStore,
	FakeSpineLog,
} from "./fakes.js";
import { FsFenceStore } from "./fence-store.js";
import { FsOpJournal } from "./op-journal.js";
import { FsPlatformWriteLock } from "./platform-write-lock.js";
import { FsProjectStore } from "./project-store.js";
import { FsSpineLog } from "./spine-store.js";

const TS = "2026-07-16T00:00:00.000Z";
const TS_CLOSE = "2026-07-16T01:00:00.000Z";
const T = Date.parse("2026-07-16T12:00:00.000Z");

function project(slug: string, over: Partial<Project> = {}): Project {
	return {
		schema_version: 1,
		slug,
		description: `project ${slug}`,
		created: { actor: "prime-1", ts: TS },
		...over,
	};
}

function asg(over: Partial<Assignment> & { id: string; nodeId: string }): Assignment {
	return {
		schema_version: 1,
		task: `task for ${over.id}`,
		states: [1],
		opened: { actor: "tester", ts: TS },
		...over,
	};
}

/** Draft under test: buildSpineEvent's canonical seq-less shape — the port
 *  stamps seq itself (review 001 F1). `n` only varies ts between drafts.
 *  buildSpineEvent is fallible on the clock (review 001 F7); the fixed test
 *  clock is always valid, so unwrap here keeps every call site draft-shaped. */
function draft(n: number, over: Partial<BuildSpineEventInput> = {}): SpineEventDraft {
	return expectOk(buildSpineEvent({ nowMs: T + n * 1000, actor: "tester", kind: "note", ...over }));
}

function expectOk<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
	return result.value;
}

interface ContractRig {
	readonly projectStore: ProjectStorePort;
	readonly assignmentStore: AssignmentStorePort;
	readonly allocationStore: AllocationStorePort;
	readonly fenceStore: FenceStorePort;
	readonly dispatchStore: DispatchStorePort;
	readonly spineLog: SpineLogPort;
	readonly opJournal: OpJournalPort;
	readonly platformWriteLock: PlatformWriteLockPort;
	/** A SECOND handle onto the same machine home's write lock (review 003
	 *  M5): fs = another FsPlatformWriteLock over the same pijHome; fake =
	 *  a fork sharing the machine backing. */
	readonly newPlatformWriteLock: () => PlatformWriteLockPort;
	readonly cleanup: () => void;
}

const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

class MemoryAllocationStore implements AllocationStorePort {
	private readonly records = new Map<string, Allocation>();

	write(allocation: Allocation): Result<void> {
		if (!RECORD_ID_PATTERN.test(allocation.id)) return err("E-ARG", "invalid allocation id");
		const clone = structuredClone(allocation);
		if (!isAllocation(clone)) return err("E-ARG", "invalid allocation record");
		this.records.set(clone.id, clone);
		return ok(undefined);
	}

	read(id: string): Allocation | null {
		if (!RECORD_ID_PATTERN.test(id)) return null;
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Allocation[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) =>
				left.ordinal !== right.ordinal
					? left.ordinal - right.ordinal
					: left.id.localeCompare(right.id),
			);
	}
}

class MemoryFenceStore implements FenceStorePort {
	private readonly records = new Map<string, Fence>();

	write(fence: Fence): Result<void> {
		if (!RECORD_ID_PATTERN.test(fence.id)) return err("E-ARG", "invalid fence id");
		const clone = structuredClone(fence);
		if (!isFence(clone)) return err("E-ARG", "invalid fence record");
		this.records.set(clone.id, clone);
		return ok(undefined);
	}

	read(id: string): Fence | null {
		if (!RECORD_ID_PATTERN.test(id)) return null;
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Fence[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) => left.id.localeCompare(right.id));
	}
}

class MemoryDispatchStore implements DispatchStorePort {
	private readonly records = new Map<string, Dispatch>();

	write(dispatch: Dispatch): Result<void> {
		if (!RECORD_ID_PATTERN.test(dispatch.id)) return err("E-ARG", "invalid dispatch id");
		const clone = structuredClone(dispatch);
		if (!isDispatch(clone)) return err("E-ARG", "invalid dispatch record");
		this.records.set(clone.id, clone);
		return ok(undefined);
	}

	read(id: string): Dispatch | null {
		if (!RECORD_ID_PATTERN.test(id)) return null;
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Dispatch[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) => left.id.localeCompare(right.id));
	}
}

function runContract(name: string, makeStores: () => ContractRig): void {
	describe(`platform store contract — ${name}`, () => {
		let rig: ContractRig;

		beforeEach(() => {
			rig = makeStores();
		});

		afterEach(() => {
			rig.cleanup();
		});

		describe("ProjectStorePort", () => {
			it("create claims a new slug and read round-trips; a missing slug reads null", () => {
				expect(rig.projectStore.read("alpha")).toBeNull();
				const alpha = project("alpha", { repo: "git@example:alpha.git" });
				expect(rig.projectStore.create(alpha)).toEqual(ok("claimed"));
				expect(rig.projectStore.read("alpha")).toEqual(alpha);
			});

			it("second create for the same slug is 'exists' and preserves the first record", () => {
				const first = project("alpha");
				expect(rig.projectStore.create(first)).toEqual(ok("claimed"));
				expect(rig.projectStore.create(project("alpha", { description: "usurper" }))).toEqual(
					ok("exists"),
				);
				expect(rig.projectStore.read("alpha")).toEqual(first);
			});

			it("update is E-NOREG on a missing slug and replaces an existing record", () => {
				expect(rig.projectStore.update(project("ghost"))).toMatchObject({
					ok: false,
					code: "E-NOREG",
				});
				expect(rig.projectStore.read("ghost")).toBeNull();
				expect(rig.projectStore.create(project("alpha"))).toEqual(ok("claimed"));
				const updated = project("alpha", {
					description: "rewritten",
					planPath: "docs/plans/054-pij-grown-up/plan.md",
				});
				expect(rig.projectStore.update(updated)).toEqual(ok(undefined));
				expect(rig.projectStore.read("alpha")).toEqual(updated);
			});

			it("list returns records sorted by slug", () => {
				const zeta = project("zeta");
				const alpha = project("alpha");
				const mid = project("mid");
				for (const record of [zeta, alpha, mid]) {
					expect(rig.projectStore.create(record)).toEqual(ok("claimed"));
				}
				expect(rig.projectStore.list()).toEqual([alpha, mid, zeta]);
			});

			// kebabSlug("!!!") === "" (core/platform/types.ts), so the empty slug is
			// reachable from real CLI input — E-ARG here, never a phantom "claimed".
			it.each([
				[""],
				[".."],
				["a/b"],
				[".hidden"],
			])("invalid slug %j: create/update E-ARG, read null, list untouched", (slug) => {
				const good = project("alpha");
				expect(rig.projectStore.create(good)).toEqual(ok("claimed"));
				expect(rig.projectStore.create(project(slug))).toMatchObject({
					ok: false,
					code: "E-ARG",
				});
				expect(rig.projectStore.update(project(slug))).toMatchObject({
					ok: false,
					code: "E-ARG",
				});
				expect(rig.projectStore.read(slug)).toBeNull();
				expect(rig.projectStore.list()).toEqual([good]);
			});

			it("records are isolated: mutating the create input or a read/list result never alters the store", () => {
				const input = project("alpha", { repo: "git@example:alpha.git" });
				const pristine = project("alpha", { repo: "git@example:alpha.git" });
				expect(rig.projectStore.create(input)).toEqual(ok("claimed"));
				(input as { description: string }).description = "mutated-after-create";
				(input.created as { actor: string }).actor = "intruder";
				expect(rig.projectStore.read("alpha")).toEqual(pristine);
				const fromRead = rig.projectStore.read("alpha");
				if (fromRead) (fromRead as { description: string }).description = "mutated-read";
				const fromList = rig.projectStore.list();
				const first = fromList[0];
				if (first) (first.created as { actor: string }).actor = "intruder";
				expect(rig.projectStore.read("alpha")).toEqual(pristine);
				expect(rig.projectStore.list()).toEqual([pristine]);
			});
		});

		describe("AssignmentStorePort", () => {
			it("write → read round-trips every field; a missing id reads null", () => {
				expect(rig.assignmentStore.read("asg-ghost")).toBeNull();
				const full = asg({
					id: "asg-full",
					nodeId: "w1",
					projectSlug: "demo-project",
					states: [3, 7],
					closed: { actor: "closer", ts: TS_CLOSE, reason: "done" },
				});
				expect(rig.assignmentStore.write(full)).toEqual(ok(undefined));
				expect(rig.assignmentStore.read("asg-full")).toEqual(full);
			});

			describe("AllocationStorePort", () => {
				const allocation = (id: string, ordinal: number): Allocation => ({
					schema_version: 1,
					id,
					project: "platform",
					ordinal,
					slug: `stream-${ordinal}`,
					worktree: `/repo-worktrees/s${ordinal}`,
					branch: `s${ordinal}/stream-${ordinal}`,
					baseSha: "base",
					state: "created",
					steps: [],
					created: { actor: "prime", ts: TS },
				});

				it("write/read/list round-trip and replace, ordinal-then-id sorted", () => {
					const second = allocation("alloc-s002-second", 2);
					const first = allocation("alloc-s001-first", 1);
					expect(rig.allocationStore.write(second)).toEqual(ok(undefined));
					expect(rig.allocationStore.write(first)).toEqual(ok(undefined));
					const updated: Allocation = {
						...first,
						steps: [{ name: "worktree-created", ok: true, evidence: first.worktree, ts: TS }],
					};
					expect(rig.allocationStore.write(updated)).toEqual(ok(undefined));
					expect(rig.allocationStore.read(first.id)).toEqual(updated);
					expect(rig.allocationStore.list()).toEqual([updated, second]);
				});

				it("invalid ids fail loudly and records are isolated", () => {
					const good = allocation("alloc-good", 1);
					expect(rig.allocationStore.write(good)).toEqual(ok(undefined));
					expect(rig.allocationStore.write(allocation("../bad", 2))).toMatchObject({
						ok: false,
						code: "E-ARG",
					});
					const read = rig.allocationStore.read(good.id);
					if (read) (read as { slug: string }).slug = "mutated";
					expect(rig.allocationStore.read(good.id)).toEqual(good);
				});
			});

			describe("FenceStorePort", () => {
				const fence = (id: string): Fence => ({
					schema_version: 1,
					id,
					allocation: `alloc-${id}`,
					touchSet: ["src/**"],
					shared: [],
					class: "notify-only",
					updated: { actor: "stream", ts: TS },
				});

				it("write/read/list round-trip and replace, id sorted", () => {
					const zeta = fence("fence-zeta");
					const alpha = fence("fence-alpha");
					expect(rig.fenceStore.write(zeta)).toEqual(ok(undefined));
					expect(rig.fenceStore.write(alpha)).toEqual(ok(undefined));
					const updated: Fence = { ...alpha, shared: ["src/shared.ts"] };
					expect(rig.fenceStore.write(updated)).toEqual(ok(undefined));
					expect(rig.fenceStore.read(alpha.id)).toEqual(updated);
					expect(rig.fenceStore.list()).toEqual([updated, zeta]);
				});

				it("invalid ids fail loudly and records are isolated", () => {
					const good = fence("fence-good");
					expect(rig.fenceStore.write(good)).toEqual(ok(undefined));
					expect(rig.fenceStore.write(fence("../bad"))).toMatchObject({
						ok: false,
						code: "E-ARG",
					});
					const read = rig.fenceStore.read(good.id);
					if (read) (read.touchSet as string[]).push("mutated");
					expect(rig.fenceStore.read(good.id)).toEqual(good);
				});
			});

			describe("DispatchStorePort", () => {
				const dispatch = (id: string): Dispatch => ({
					schema_version: 1,
					id,
					packetPath: `/repo/${id}.md`,
					packetSha256: "a".repeat(64),
					from: "pij-parent",
					to: "pij-worker",
					state: "undelivered",
					created: { actor: "pij-parent", ts: TS },
					updated: { actor: "pij-parent", ts: TS },
				});

				it("write/read/list round-trip and replace, id sorted", () => {
					const zeta = dispatch("dispatch-zeta");
					const alpha = dispatch("dispatch-alpha");
					expect(rig.dispatchStore.write(zeta)).toEqual(ok(undefined));
					expect(rig.dispatchStore.write(alpha)).toEqual(ok(undefined));
					const updated: Dispatch = {
						...alpha,
						messageId: "msg-alpha",
						deliveryState: "delivered",
						state: "delivered-unacked",
					};
					expect(rig.dispatchStore.write(updated)).toEqual(ok(undefined));
					expect(rig.dispatchStore.read(alpha.id)).toEqual(updated);
					expect(rig.dispatchStore.list()).toEqual([updated, zeta]);
				});

				it("invalid ids fail loudly and records are isolated", () => {
					const good = dispatch("dispatch-good");
					expect(rig.dispatchStore.write(good)).toEqual(ok(undefined));
					expect(rig.dispatchStore.write(dispatch("../bad"))).toMatchObject({
						ok: false,
						code: "E-ARG",
					});
					const read = rig.dispatchStore.read(good.id);
					if (read) (read as { packetPath: string }).packetPath = "mutated";
					expect(rig.dispatchStore.read(good.id)).toEqual(good);
				});
			});

			it("write is create-or-replace: a second write for the same id replaces the record", () => {
				const v1 = asg({ id: "asg-r", nodeId: "w1", task: "first draft" });
				const v2 = asg({ id: "asg-r", nodeId: "w1", task: "revised", states: [4, 5] });
				expect(rig.assignmentStore.write(v1)).toEqual(ok(undefined));
				expect(rig.assignmentStore.write(v2)).toEqual(ok(undefined));
				expect(rig.assignmentStore.read("asg-r")).toEqual(v2);
				expect(rig.assignmentStore.list()).toEqual([v2]);
			});

			it("list returns records sorted by id", () => {
				const b = asg({ id: "asg-b", nodeId: "w2" });
				const a = asg({ id: "asg-a", nodeId: "w1" });
				const c = asg({ id: "asg-c", nodeId: "w1" });
				for (const record of [b, a, c]) {
					expect(rig.assignmentStore.write(record)).toEqual(ok(undefined));
				}
				expect(rig.assignmentStore.list()).toEqual([a, b, c]);
			});

			it("listByNode matches nodeId exactly — 'w1' never matches 'w10'", () => {
				const a = asg({ id: "asg-a", nodeId: "w1" });
				const b = asg({ id: "asg-b", nodeId: "w10" });
				const c = asg({ id: "asg-c", nodeId: "w1" });
				for (const record of [a, b, c]) {
					expect(rig.assignmentStore.write(record)).toEqual(ok(undefined));
				}
				expect(rig.assignmentStore.listByNode("w1")).toEqual([a, c]);
				expect(rig.assignmentStore.listByNode("w10")).toEqual([b]);
				expect(rig.assignmentStore.listByNode("w3")).toEqual([]);
			});

			it.each([
				[""],
				[".."],
				["a/b"],
				[".hidden"],
			])("invalid id %j: write E-ARG, read null, list untouched", (id) => {
				const good = asg({ id: "asg-good", nodeId: "w1" });
				expect(rig.assignmentStore.write(good)).toEqual(ok(undefined));
				expect(rig.assignmentStore.write(asg({ id, nodeId: "w1" }))).toMatchObject({
					ok: false,
					code: "E-ARG",
				});
				expect(rig.assignmentStore.read(id)).toBeNull();
				expect(rig.assignmentStore.list()).toEqual([good]);
			});

			// appendStateRef stays total (house precondition) — the STORE is the
			// boundary where a type-valid poisoned record must die, identically in
			// both impls (review 001 F5: the fake used to accept what fs lost).
			it.each([
				["NaN", Number.NaN],
				["Infinity", Number.POSITIVE_INFINITY],
			])("a type-valid poisoned record (states: [%s]) is E-ARG at write — nothing lands (review 001 F5)", (_label, bad) => {
				const good = asg({ id: "asg-good", nodeId: "w1" });
				expect(rig.assignmentStore.write(good)).toEqual(ok(undefined));
				const poisoned = asg({ id: "asg-poison", nodeId: "w1", states: [bad] });
				expect(rig.assignmentStore.write(poisoned)).toMatchObject({
					ok: false,
					code: "E-ARG",
				});
				expect(rig.assignmentStore.read("asg-poison")).toBeNull();
				expect(rig.assignmentStore.list()).toEqual([good]);
			});

			it("records are isolated: mutating the write input or a read/list result never alters the store", () => {
				const input = asg({ id: "asg-iso", nodeId: "w1", states: [1, 2] });
				const pristine = asg({ id: "asg-iso", nodeId: "w1", states: [1, 2] });
				expect(rig.assignmentStore.write(input)).toEqual(ok(undefined));
				(input as { task: string }).task = "mutated-after-write";
				(input.states as number[]).push(99);
				expect(rig.assignmentStore.read("asg-iso")).toEqual(pristine);
				const fromRead = rig.assignmentStore.read("asg-iso");
				if (fromRead) (fromRead.states as number[]).push(42);
				const fromList = rig.assignmentStore.list();
				const first = fromList[0];
				if (first) (first as { nodeId: string }).nodeId = "w9";
				expect(rig.assignmentStore.read("asg-iso")).toEqual(pristine);
				expect(rig.assignmentStore.listByNode("w1")).toEqual([pristine]);
			});
		});

		describe("SpineLogPort", () => {
			it("append allocates strictly increasing unique seqs from 1 and returns the stamped event", () => {
				expect(rig.spineLog.lastSeq()).toBe(0);
				const seqs = [1, 2, 3, 4, 5].map((n) => expectOk(rig.spineLog.append(draft(n))).seq);
				expect(seqs).toEqual([1, 2, 3, 4, 5]);
				expect(rig.spineLog.lastSeq()).toBe(5);
				expect(rig.spineLog.read().map((e) => e.seq)).toEqual(seqs);
			});

			it("append/appendOnce stamp seq and round-trip the FULL optional envelope verbatim", () => {
				// Maximal draft: every optional the schema carries (peer, project,
				// repo, the prev/next audit chain, verifiedBy, actorProvenance) must
				// survive stamping — toEqual, never toMatchObject, so an impl that
				// drops or narrows ANY field while stamping fails here.
				const maximal = (n: number, kind: string) =>
					draft(n, {
						kind,
						refs: ["r-1", "r-2"],
						peer: "pij-a",
						project: "alpha",
						repo: "git@example:alpha.git",
						prev: "sha-prev",
						next: "sha-next",
						verifiedBy: "verifier-1",
						actorProvenance: "resolved",
					});
				const stamped = expectOk(rig.spineLog.append(maximal(1, "note")));
				expect(stamped).toEqual({ ...maximal(1, "note"), seq: 1 });
				const once = expectOk(rig.spineLog.appendOnce("maximal-once", maximal(2, "claim")));
				expect(once.outcome).toBe("appended");
				expect(once.event).toEqual({ ...maximal(2, "claim"), seq: 2 });
				expect(rig.spineLog.read()).toEqual([
					{ ...maximal(1, "note"), seq: 1 },
					{ ...maximal(2, "claim"), seq: 2 },
				]);
			});

			it("a draft smuggling its own seq is re-stamped: port allocation always wins", () => {
				// Omit<> only narrows the TYPE: a full SpineEvent is width-assignable
				// to SpineEventDraft, so re-appending an event read back from the log
				// — or a forged high seq — compiles cleanly with no cast. The port
				// must stamp its own next seq, never honor the smuggled one (the
				// review 001 F1 duplicate-seq channel).
				const first = expectOk(rig.spineLog.append(draft(1)));
				const rereadDuplicate: SpineEvent = rig.spineLog.read()[0] ?? first;
				expect(expectOk(rig.spineLog.append(rereadDuplicate)).seq).toBe(2);
				const forgedHigh: SpineEvent = { ...draft(3), seq: 999 };
				expect(expectOk(rig.spineLog.append(forgedHigh)).seq).toBe(3);
				const forgedOnce: SpineEvent = { ...draft(4), seq: 999 };
				const once = expectOk(rig.spineLog.appendOnce("smuggled-once", forgedOnce));
				expect(once.outcome).toBe("appended");
				expect(once.event.seq).toBe(4);
				expect(rig.spineLog.read().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
				expect(rig.spineLog.lastSeq()).toBe(4);
			});

			it("appendOnce dedupes by key: replay returns the ORIGINALLY stamped event; distinct keys land", () => {
				const first = expectOk(rig.spineLog.appendOnce("claim-alpha", draft(1, { kind: "claim" })));
				expect(first.outcome).toBe("appended");
				expect(first.event.seq).toBe(1);
				// Replay of the same key gains the log nothing: the original, exactly once.
				const replay = expectOk(
					rig.spineLog.appendOnce("claim-alpha", draft(2, { kind: "usurper" })),
				);
				expect(replay.outcome).toBe("existing");
				expect(replay.event).toEqual(first.event);
				expect(rig.spineLog.read()).toEqual([first.event]);
				expect(rig.spineLog.lastSeq()).toBe(1);
				const beta = expectOk(rig.spineLog.appendOnce("claim-beta", draft(2)));
				expect(beta.outcome).toBe("appended");
				expect(beta.event.seq).toBe(2);
				expect(rig.spineLog.read().map((e) => e.seq)).toEqual([1, 2]);
			});

			it("an exclusive consumer cursor over append → read → append never loses an event", () => {
				// The review 001 F1 law at the port surface: whatever seq the second
				// append is stamped with, it must land ABOVE an already-read cursor.
				const first = expectOk(rig.spineLog.append(draft(1)));
				const seen = rig.spineLog.read();
				expect(seen).toEqual([first]);
				const cursor = seen[seen.length - 1]?.seq ?? 0;
				const second = expectOk(rig.spineLog.append(draft(2)));
				expect(second.seq).toBeGreaterThan(cursor);
				expect(rig.spineLog.read({ since: cursor })).toEqual([second]);
			});

			it("read since is exclusive (seq > since) and results are seq-ascending", () => {
				// appendOnce between appends pins the ascending merge across both
				// write paths (the fs impl stores them in different files).
				expectOk(rig.spineLog.append(draft(1)));
				expectOk(rig.spineLog.appendOnce("mid", draft(2)));
				expectOk(rig.spineLog.append(draft(3)));
				expect(rig.spineLog.read().map((e) => e.seq)).toEqual([1, 2, 3]);
				expect(rig.spineLog.read({ since: 2 }).map((e) => e.seq)).toEqual([3]);
				expect(rig.spineLog.read({ since: 0 }).map((e) => e.seq)).toEqual([1, 2, 3]);
				expect(rig.spineLog.read({ since: 3 })).toEqual([]);
			});

			it("read peer and project filters are exact — 'pij-a' never matches 'pij-ab'", () => {
				expectOk(rig.spineLog.append(draft(1, { peer: "pij-a", project: "alpha" })));
				expectOk(rig.spineLog.append(draft(2, { peer: "pij-ab", project: "alpha-2" })));
				expectOk(rig.spineLog.append(draft(3)));
				expect(rig.spineLog.read({ peer: "pij-a" }).map((e) => e.seq)).toEqual([1]);
				expect(rig.spineLog.read({ peer: "pij-ab" }).map((e) => e.seq)).toEqual([2]);
				expect(rig.spineLog.read({ project: "alpha" }).map((e) => e.seq)).toEqual([1]);
				expect(rig.spineLog.read({ project: "alpha-2" }).map((e) => e.seq)).toEqual([2]);
				expect(rig.spineLog.read({ peer: "pij-a", project: "alpha", since: 0 })).toHaveLength(1);
			});

			it("append-only at the port level: events read earlier are unchanged by later appends", () => {
				expectOk(rig.spineLog.append(draft(1, { peer: "pij-a" })));
				expectOk(rig.spineLog.append(draft(2)));
				const before = rig.spineLog.read();
				const snapshot = structuredClone(before);
				expectOk(rig.spineLog.append(draft(3)));
				expect(expectOk(rig.spineLog.appendOnce("late", draft(4))).outcome).toBe("appended");
				// The earlier read result is untouched by the later writes…
				expect(before).toEqual(snapshot);
				// …and the grown log still begins with exactly those events.
				const after = rig.spineLog.read();
				expect(after.slice(0, 2)).toEqual(snapshot);
				expect(after.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
			});

			it("hasOnce reports durable keyed-append existence without appending (review 003 H1)", () => {
				expect(rig.spineLog.hasOnce("claim-alpha")).toBe(false);
				expectOk(rig.spineLog.appendOnce("claim-alpha", draft(1, { kind: "claim" })));
				expect(rig.spineLog.hasOnce("claim-alpha")).toBe(true);
				// Key-exact: a sibling key stays absent; plain append never registers.
				expect(rig.spineLog.hasOnce("claim-beta")).toBe(false);
				expectOk(rig.spineLog.append(draft(2)));
				expect(rig.spineLog.hasOnce("claim-beta")).toBe(false);
				// The probe itself appended nothing.
				expect(rig.spineLog.read().map((e) => e.seq)).toEqual([1, 2]);
			});

			it("events are isolated: mutating the draft, the returned event, or a read result never alters the log", () => {
				const input = draft(1, { peer: "pij-a" });
				const stamped = expectOk(rig.spineLog.append(input));
				const pristine = structuredClone(stamped);
				(input as { kind: string }).kind = "mutated-after-append";
				(input.refs as string[]).push("ref-x");
				(stamped as { actor: string }).actor = "intruder";
				(stamped.refs as string[]).push("ref-y");
				expect(rig.spineLog.read()).toEqual([pristine]);
				const out = rig.spineLog.read();
				const first = out[0];
				if (first) (first as { actor: string }).actor = "intruder";
				expect(rig.spineLog.read()).toEqual([pristine]);
			});
		});

		// Production serialization law at the PORT surface (review 003 M5): the
		// fs lock is machine-wide and non-reentrant, so the fake must be too —
		// a downstream test that nests or races acquisitions must fail against
		// EITHER impl, never pass against the fake alone.
		describe("PlatformWriteLockPort (review 003 M5)", () => {
			it("runs the operation exactly once, returns its value ok, and releases for the next acquisition", () => {
				let runs = 0;
				const result = rig.platformWriteLock.withPlatformWriteLock(() => {
					runs += 1;
					return "payload";
				});
				expect(result).toEqual(ok("payload"));
				expect(runs).toBe(1);
				expect(rig.platformWriteLock.withPlatformWriteLock(() => "again")).toEqual(ok("again"));
			});

			it("is NON-reentrant: a nested acquisition fails E-NOREG and the nested operation never runs", () => {
				let nestedRan = false;
				const outer = rig.platformWriteLock.withPlatformWriteLock(() => {
					const nested = rig.platformWriteLock.withPlatformWriteLock(() => {
						nestedRan = true;
						return "nested";
					});
					expect(nested).toMatchObject({ ok: false, code: "E-NOREG" });
					if (!nested.ok) {
						expect(nested.message).toMatch(/platform write lock/i);
						expect(nested.message).toMatch(/never stolen/i);
					}
					return "outer";
				});
				expect(outer).toEqual(ok("outer"));
				expect(nestedRan).toBe(false);
			});

			it("is machine-wide: a SECOND handle over the same home cannot acquire while held, and can after release", () => {
				const second = rig.newPlatformWriteLock();
				let contendedRan = false;
				const outer = rig.platformWriteLock.withPlatformWriteLock(() => {
					const contended = second.withPlatformWriteLock(() => {
						contendedRan = true;
						return "never";
					});
					expect(contended).toMatchObject({ ok: false, code: "E-NOREG" });
					return "held";
				});
				expect(outer).toEqual(ok("held"));
				expect(contendedRan).toBe(false);
				expect(second.withPlatformWriteLock(() => "after")).toEqual(ok("after"));
			});

			it("a throw from the operation PROPAGATES and releases the lock either way", () => {
				expect(() =>
					rig.platformWriteLock.withPlatformWriteLock(() => {
						throw new Error("boom");
					}),
				).toThrow("boom");
				// Released for the same handle AND for a peer handle.
				expect(rig.platformWriteLock.withPlatformWriteLock(() => "recovered")).toEqual(
					ok("recovered"),
				);
				expect(rig.newPlatformWriteLock().withPlatformWriteLock(() => "peer")).toEqual(ok("peer"));
			});
		});

		// Corrupt-entry parity is NOT expressible here: the fake has no way to
		// plant corrupt/foreign entries, so the H2 wedge-on-unreadable law
		// stays fs-only in op-journal.test.ts.
		describe("OpJournalPort", () => {
			it("record journals a draft as an INTENT with order 1, pending round-trips it, clear removes it", () => {
				expect(expectOk(rig.opJournal.pending())).toEqual([]);
				const d = draft(1, { kind: "project-created", project: "alpha" });
				const opId = expectOk(rig.opJournal.record(d));
				expect(opId).not.toBe("");
				expect(expectOk(rig.opJournal.pending())).toEqual([
					{ opId, order: 1, phase: "intent", draft: d },
				]);
				expect(rig.opJournal.clear(opId)).toEqual(ok(undefined));
				expect(expectOk(rig.opJournal.pending())).toEqual([]);
			});

			it("markCommitted durably flips the phase, preserving order and draft (review 002 G2)", () => {
				const d = draft(1, { kind: "project-set", project: "alpha" });
				const opId = expectOk(rig.opJournal.record(d));
				expect(expectOk(rig.opJournal.pending())[0]?.phase).toBe("intent");
				expect(rig.opJournal.markCommitted(opId)).toEqual(ok(undefined));
				expect(expectOk(rig.opJournal.pending())).toEqual([
					{ opId, order: 1, phase: "committed", draft: d },
				]);
			});

			it("markCommitted on an unknown opId is E-NOREG, never a throw", () => {
				expect(rig.opJournal.markCommitted("never-recorded")).toMatchObject({
					ok: false,
					code: "E-NOREG",
				});
			});

			it("record refuses a draft failing isSpineEvent — nothing journaled (audit F2)", () => {
				// Validation symmetry: an entry failing the guard on read-back now
				// WEDGES enumeration (review 003 H2), so an invalid draft accepted
				// at record time would turn the very next write into an outage.
				const invalid = { ...draft(1), kind: 42 } as unknown as SpineEventDraft;
				expect(rig.opJournal.record(invalid)).toMatchObject({ ok: false, code: "E-ARG" });
				expect(expectOk(rig.opJournal.pending())).toEqual([]);
			});

			it("record round-trips the FULL optional envelope verbatim", () => {
				const maximal = draft(1, {
					kind: "claim",
					refs: ["r-1", "r-2"],
					peer: "pij-a",
					project: "alpha",
					repo: "git@example:alpha.git",
					prev: "sha-prev",
					next: "sha-next",
					verifiedBy: "verifier-1",
					actorProvenance: "resolved",
				});
				const opId = expectOk(rig.opJournal.record(maximal));
				expect(expectOk(rig.opJournal.pending())).toEqual([
					{ opId, order: 1, phase: "intent", draft: maximal },
				]);
			});

			it("pending lists surviving ops in DURABLE ORDER, never opId-lexical (review 002 G3); clear is per-op", () => {
				const ids = [draft(1), draft(2), draft(3)].map((d) => expectOk(rig.opJournal.record(d)));
				expect(new Set(ids).size).toBe(3);
				// Record order IS the durable order — whatever the opIds sort like.
				expect(expectOk(rig.opJournal.pending()).map((op) => op.opId)).toEqual(ids);
				expect(expectOk(rig.opJournal.pending()).map((op) => op.order)).toEqual([1, 2, 3]);
				const middle = ids[1];
				if (middle !== undefined) rig.opJournal.clear(middle);
				expect(expectOk(rig.opJournal.pending()).map((op) => op.opId)).toEqual([ids[0], ids[2]]);
			});

			it("clear on an unknown opId is ok — already absent IS the goal state (review 003 M3)", () => {
				const opId = expectOk(rig.opJournal.record(draft(1)));
				expect(rig.opJournal.clear("never-recorded")).toEqual(ok(undefined));
				expect(expectOk(rig.opJournal.pending()).map((op) => op.opId)).toEqual([opId]);
			});

			it("ops are isolated: mutating the recorded draft or a pending result never alters the journal", () => {
				const input = draft(1, { refs: ["r-1"] });
				const pristine = draft(1, { refs: ["r-1"] });
				const opId = expectOk(rig.opJournal.record(input));
				(input as { kind: string }).kind = "mutated-after-record";
				(input.refs as string[]).push("ref-x");
				const expected = [{ opId, order: 1, phase: "intent", draft: pristine }];
				expect(expectOk(rig.opJournal.pending())).toEqual(expected);
				const out = expectOk(rig.opJournal.pending());
				const first = out[0];
				if (first) (first.draft as { kind: string }).kind = "intruder";
				expect(expectOk(rig.opJournal.pending())).toEqual(expected);
			});
		});
	});
}

runContract("fs adapters", () => {
	const home = mkdtempSync(join(tmpdir(), "pij-contract-"));
	return {
		projectStore: new FsProjectStore(home),
		assignmentStore: new FsAssignmentStore(home),
		allocationStore: new FsAllocationStore(home),
		fenceStore: new FsFenceStore(home),
		dispatchStore: new FsDispatchStore(home),
		spineLog: new FsSpineLog(home),
		opJournal: new FsOpJournal(home),
		// Tight budget: the contention pins fail in ~60ms, not 5s.
		platformWriteLock: new FsPlatformWriteLock(home, { lockBudgetMs: 60 }),
		newPlatformWriteLock: () => new FsPlatformWriteLock(home, { lockBudgetMs: 60 }),
		cleanup: () => rmSync(home, { recursive: true, force: true }),
	};
});

runContract("in-memory fakes", () => {
	const platformWriteLock = new FakePlatformWriteLock();
	return {
		projectStore: new FakeProjectStore(),
		assignmentStore: new FakeAssignmentStore(),
		allocationStore: new MemoryAllocationStore(),
		fenceStore: new MemoryFenceStore(),
		dispatchStore: new MemoryDispatchStore(),
		spineLog: new FakeSpineLog(),
		opJournal: new FakeOpJournal(),
		platformWriteLock,
		newPlatformWriteLock: () => platformWriteLock.fork(),
		cleanup: () => {},
	};
});

// ─── fake-only fault-injection hooks (the T009 CLI-failure-path seam) ───────
// Not part of the two-impl contract above: the fs adapters expose no failNext.
// Pinned here so T009 can rely on one-shot injected E-NOREG faults.

describe("fake fault injection (failNext)", () => {
	it("FakeProjectStore.failNext fails exactly one create/update, then recovers", () => {
		const store = new FakeProjectStore();
		store.failNext("create");
		expect(store.create(project("alpha"))).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(store.read("alpha")).toBeNull();
		expect(store.create(project("alpha"))).toEqual(ok("claimed"));
		store.failNext("update");
		expect(store.update(project("alpha", { description: "x" }))).toMatchObject({
			ok: false,
			code: "E-NOREG",
		});
		expect(store.read("alpha")?.description).toBe("project alpha");
		expect(store.update(project("alpha", { description: "x" }))).toEqual(ok(undefined));
	});

	it("FakeAssignmentStore.failNext fails exactly one write, then recovers", () => {
		const store = new FakeAssignmentStore();
		store.failNext("write");
		expect(store.write(asg({ id: "asg-a", nodeId: "w1" }))).toMatchObject({
			ok: false,
			code: "E-NOREG",
		});
		expect(store.read("asg-a")).toBeNull();
		expect(store.write(asg({ id: "asg-a", nodeId: "w1" }))).toEqual(ok(undefined));
	});

	it("FakeOpJournal.failNext fails exactly one record, then recovers", () => {
		const journal = new FakeOpJournal();
		journal.failNext("record");
		expect(journal.record(draft(1))).toMatchObject({ ok: false, code: "E-NOREG" });
		// The failed record journaled nothing — not even a burned opId slot.
		expect(expectOk(journal.pending())).toEqual([]);
		const opId = expectOk(journal.record(draft(1)));
		expect(expectOk(journal.pending()).map((op) => op.opId)).toEqual([opId]);
	});

	it("FakeOpJournal.failNext('markCommitted') fails exactly one flip, then recovers (review 002 G2)", () => {
		const journal = new FakeOpJournal();
		const opId = expectOk(journal.record(draft(1)));
		journal.failNext("markCommitted");
		expect(journal.markCommitted(opId)).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(expectOk(journal.pending())[0]?.phase).toBe("intent"); // the failed flip changed nothing
		expect(journal.markCommitted(opId)).toEqual(ok(undefined));
		expect(expectOk(journal.pending())[0]?.phase).toBe("committed");
	});

	it("FakeOpJournal.failNext('clear') fails exactly one clear HONESTLY, then recovers (audit F2 + review 003 M3)", () => {
		// The crash-window seam: a LOST clear (entry survives) must be
		// drivable end-to-end — and reported as the E-NOREG the M3 gate stops
		// on, never as success over a surviving entry.
		const journal = new FakeOpJournal();
		const opId = expectOk(journal.record(draft(1)));
		journal.failNext("clear");
		expect(journal.clear(opId)).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(expectOk(journal.pending()).map((op) => op.opId)).toEqual([opId]);
		expect(journal.clear(opId)).toEqual(ok(undefined)); // recovers: the next clear lands
		expect(expectOk(journal.pending())).toEqual([]);
	});

	it("FakeAssignmentStore read/list guard a seeded poisoned record exactly like fs guards corrupt bytes (review 001 F5)", () => {
		// Constructor seeding is the fake's "plant bytes on disk" channel — it
		// bypasses write validation, so the READ boundary must apply the same
		// guard fs reads do: poisoned records read null and never surface in
		// list/listByNode (guard AFTER the jsonClone round-trip, which is what
		// turns states:[NaN] into the null the guard rejects).
		const good = asg({ id: "asg-good", nodeId: "w1" });
		const store = new FakeAssignmentStore([
			good,
			asg({ id: "asg-poison", nodeId: "w1", states: [Number.NaN] }),
		]);
		expect(store.read("asg-poison")).toBeNull();
		expect(store.list()).toEqual([good]);
		expect(store.listByNode("w1")).toEqual([good]);
	});

	it("FakeSpineLog.failNext fails exactly one append/appendOnce, then recovers", () => {
		const log = new FakeSpineLog();
		log.failNext("append");
		expect(log.append(draft(1))).toMatchObject({ ok: false, code: "E-NOREG" });
		// The failed append gained the log nothing — not even a burned seq.
		expect(log.lastSeq()).toBe(0);
		expect(expectOk(log.append(draft(1))).seq).toBe(1);
		log.failNext("appendOnce");
		expect(log.appendOnce("claim-x", draft(2))).toMatchObject({ ok: false, code: "E-NOREG" });
		// The injected failure never claimed the key: the retry appends fresh.
		const retried = expectOk(log.appendOnce("claim-x", draft(2)));
		expect(retried.outcome).toBe("appended");
		expect(retried.event.seq).toBe(2);
	});
});
