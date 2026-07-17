// pij platform — FsOpJournal adapter specs (review p1-review-001 HIGH-2 — RED first).
//
// Pins the fs half of the journal-FIRST coupled write: record durably journals
// {schema_version: 1, opId, draft} at <pijHome>/spine/ops/<opId>.json BEFORE
// any project state commits; clear is best-effort removal after the coupled
// write; pending lists surviving ops in durable order — and FAILS E-NOREG
// naming the path on any invalid op-shaped .json entry (review 003 H2: a
// damaged safety record is not absence). Everything stays STRICTLY below
// spine/ — top-level pijHome *.json belongs to FsRegistry live-peer
// descriptors (Finding 01, phantom-peer law).

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BuildSpineEventInput, buildSpineEvent } from "../core/platform/spine.js";
import type { SpineEventDraft } from "../core/platform/types.js";
import type { Result } from "../core/types.js";
import { FsRegistry } from "./fs-registry.js";
import { FsOpJournal } from "./op-journal.js";

const T = Date.parse("2026-07-16T12:00:00.000Z");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function draft(n: number, over: Partial<BuildSpineEventInput> = {}): SpineEventDraft {
	// buildSpineEvent is fallible on the clock (review 001 F7); the fixed
	// test clock is always valid, so unwrap keeps call sites draft-shaped.
	const result = buildSpineEvent({ nowMs: T + n * 1000, actor: "tester", kind: "note", ...over });
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

function expectOk<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
	return result.value;
}

function opsDir(home: string): string {
	return join(home, "spine", "ops");
}

/** Hand-plant raw bytes at the exact layout path (corrupt/foreign fixtures). */
function plantRaw(home: string, name: string, contents: string): void {
	mkdirSync(opsDir(home), { recursive: true });
	writeFileSync(join(opsDir(home), name), contents);
}

describe("FsOpJournal", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-opjournal-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("record journals {schema_version, opId, order, phase: intent, draft} at spine/ops/<opId>.json and pending round-trips it", () => {
		const journal = new FsOpJournal(home);
		const d = draft(1, { kind: "project-created", project: "alpha", refs: ["r-1"] });
		const opId = expectOk(journal.record(d));
		expect(opId).toMatch(UUID_RE);
		const path = join(opsDir(home), `${opId}.json`);
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
			schema_version: 1,
			opId,
			order: 1,
			phase: "intent",
			draft: d,
		});
		expect(expectOk(journal.pending())).toEqual([{ opId, order: 1, phase: "intent", draft: d }]);
	});

	it("markCommitted durably flips the phase in place — a FRESH adapter over the same home sees it (review 002 G2)", () => {
		const journal = new FsOpJournal(home);
		const d = draft(1, { kind: "project-set", project: "alpha" });
		const opId = expectOk(journal.record(d));
		expect(expectOk(journal.markCommitted(opId))).toBeUndefined();
		expect(expectOk(new FsOpJournal(home).pending())).toEqual([
			{ opId, order: 1, phase: "committed", draft: d },
		]);
		// Lifecycle only — no new file, same path, order preserved.
		expect(readdirSync(opsDir(home))).toEqual([`${opId}.json`]);
	});

	it("markCommitted is E-NOREG for a missing or corrupt entry, never a throw", () => {
		const journal = new FsOpJournal(home);
		expect(journal.markCommitted("never-recorded")).toMatchObject({
			ok: false,
			code: "E-NOREG",
		});
		plantRaw(home, "corrupt-op.json", "{ not json");
		expect(journal.markCommitted("corrupt-op")).toMatchObject({ ok: false, code: "E-NOREG" });
	});

	it("order is allocated max-over-surviving + 1: coexisting entries strictly increase (review 002 G3)", () => {
		const journal = new FsOpJournal(home);
		const a = expectOk(journal.record(draft(1)));
		const b = expectOk(journal.record(draft(2)));
		const c = expectOk(journal.record(draft(3)));
		expect(expectOk(journal.pending()).map((op) => [op.opId, op.order])).toEqual([
			[a, 1],
			[b, 2],
			[c, 3],
		]);
		// Once the journal drains, ordering context resets with it — order only
		// ever compares COEXISTING entries (the recovery gate empties the
		// journal before any sequential successor records).
		journal.clear(a);
		journal.clear(b);
		journal.clear(c);
		expect(expectOk(journal.pending())).toEqual([]);
		const fresh = expectOk(journal.record(draft(4)));
		expect(expectOk(journal.pending())).toEqual([
			{ opId: fresh, order: 1, phase: "intent", draft: draft(4) },
		]);
	});

	it("pending sorts by DURABLE order with opId tiebreak — never opId-lexical (review 002 G3)", () => {
		// Planted with chosen names so the lexical sort and the durable order
		// DISAGREE: "aaaa…" carries order 2, "bbbb…" order 1.
		const first = draft(1, { kind: "project-set", project: "alpha" });
		const second = draft(2, { kind: "project-created", project: "beta" });
		plantRaw(
			home,
			"bbbb-first.json",
			JSON.stringify({
				schema_version: 1,
				opId: "bbbb-first",
				order: 1,
				phase: "committed",
				draft: first,
			}),
		);
		plantRaw(
			home,
			"aaaa-second.json",
			JSON.stringify({
				schema_version: 1,
				opId: "aaaa-second",
				order: 2,
				phase: "intent",
				draft: second,
			}),
		);
		expect(expectOk(new FsOpJournal(home).pending())).toEqual([
			{ opId: "bbbb-first", order: 1, phase: "committed", draft: first },
			{ opId: "aaaa-second", order: 2, phase: "intent", draft: second },
		]);
	});

	it("clear is ok ONLY with the entry confirmed absent; a missing opId clears ok (review 003 M3)", () => {
		const journal = new FsOpJournal(home);
		const opId = expectOk(journal.record(draft(1)));
		expect(journal.clear(opId)).toEqual({ ok: true, value: undefined });
		expect(existsSync(join(opsDir(home), `${opId}.json`))).toBe(false);
		expect(expectOk(journal.pending())).toEqual([]);
		expect(journal.clear("never-recorded")).toEqual({ ok: true, value: undefined });
	});

	it("a clear that cannot remove the entry is E-NOREG naming the path — never reported as success (review 003 M3)", () => {
		const journal = new FsOpJournal(home);
		// A directory squatting the entry path defeats a non-recursive unlink:
		// the removal fails, and the failure must surface as a Result.
		const path = join(opsDir(home), "wedged-op.json");
		mkdirSync(path, { recursive: true });
		const result = journal.clear("wedged-op");
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) expect(result.message).toContain(path);
		expect(existsSync(path)).toBe(true);
	});

	// ─── review 005 K1 — durable resolution evidence (fsynced tombstone) ────
	// clear's removal durability used to ride the fail-soft dir fsync: power
	// loss could resurrect a cleared entry, and a resurrected op file is
	// byte-identical to a live crash record — recovery then forged an aborted
	// intent past a genuine winner, or false-blocked a moved-on committed op.
	// clear now durably records `<opId>.resolved` BEFORE the unlink (file
	// fsync works on every platform) and leaves it in place; pending() treats
	// op+tombstone as RESOLVED and a lone tombstone as garbage, discarding
	// evidence only after a load-bearing dir fsync proves the absence durable.

	it("clear records a durable resolution tombstone before the unlink and leaves it for the sweep (review 005 K1)", () => {
		const journal = new FsOpJournal(home);
		const opId = expectOk(journal.record(draft(1)));
		expect(journal.clear(opId)).toEqual({ ok: true, value: undefined });
		expect(existsSync(join(opsDir(home), `${opId}.json`))).toBe(false);
		expect(existsSync(join(opsDir(home), `${opId}.resolved`))).toBe(true);
		// The next enumeration sweeps the evidence once absence is proven durable.
		expect(expectOk(journal.pending())).toEqual([]);
		expect(existsSync(join(opsDir(home), `${opId}.resolved`))).toBe(false);
	});

	it("a cleared op resurrected beside its tombstone is RESOLVED — swept, never presented as live (review 005 K1)", () => {
		const journal = new FsOpJournal(home);
		const opId = expectOk(journal.record(draft(1, { kind: "project-set", project: "alpha" })));
		const path = join(opsDir(home), `${opId}.json`);
		const preClearBytes = readFileSync(path, "utf8");
		expect(journal.clear(opId)).toEqual({ ok: true, value: undefined });
		// Power-loss image: the unlink never became durable — the entry is back,
		// byte-identical, while the fsynced tombstone (written first) survives.
		writeFileSync(path, preClearBytes);
		expect(expectOk(journal.pending())).toEqual([]);
		expect(existsSync(path)).toBe(false);
		expect(existsSync(join(opsDir(home), `${opId}.resolved`))).toBe(false);
	});

	it("a resurrected RESOLVED op with damaged bytes sweeps clean — the H2 wedge is for LIVE safety records (review 005 K1)", () => {
		plantRaw(home, "dead-op.json", "{ resurrected and torn");
		plantRaw(home, "dead-op.resolved", JSON.stringify({ schema_version: 1, opId: "dead-op" }));
		expect(expectOk(new FsOpJournal(home).pending())).toEqual([]);
		expect(existsSync(join(opsDir(home), "dead-op.json"))).toBe(false);
	});

	it("a lone tombstone is garbage from a fully durable clear — swept without wedging (review 005 K1)", () => {
		plantRaw(home, "long-gone.resolved", JSON.stringify({ schema_version: 1, opId: "long-gone" }));
		expect(expectOk(new FsOpJournal(home).pending())).toEqual([]);
		expect(existsSync(join(opsDir(home), "long-gone.resolved"))).toBe(false);
	});

	it("clear that cannot record its tombstone is E-NOREG and the op STAYS live — no unlink without evidence (review 005 K1)", () => {
		const journal = new FsOpJournal(home);
		const d = draft(1);
		const opId = expectOk(journal.record(d));
		// A directory squatting the tombstone path defeats the rename publish.
		const resolvedPath = join(opsDir(home), `${opId}.resolved`);
		mkdirSync(resolvedPath);
		const result = journal.clear(opId);
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) expect(result.message).toContain(resolvedPath);
		expect(existsSync(join(opsDir(home), `${opId}.json`))).toBe(true);
		// The squatting DIRECTORY is not resolution evidence: the op is still a
		// live crash record and must keep being presented, never swept.
		expect(expectOk(journal.pending())).toEqual([{ opId, order: 1, phase: "intent", draft: d }]);
	});

	it("pending is empty on a fresh home with no spine/ops directory", () => {
		expect(expectOk(new FsOpJournal(home).pending())).toEqual([]);
	});

	it("ANY invalid op-shaped .json entry fails pending with E-NOREG naming its path — never silently bypassed (review 003 H2)", () => {
		// A damaged safety record is NOT equivalent to absence: the reviewer's
		// probe planted malformed bytes at a UUID-shaped path and `project
		// create` sailed past the recovery gate. Every variant the old
		// "guard-validated skip" tolerated must now fail enumeration loudly.
		const journal = new FsOpJournal(home);
		const valid = draft(1, { kind: "project-created", project: "alpha" });
		const idA = expectOk(journal.record(valid));
		const badFixtures: readonly (readonly [string, string])[] = [
			// Corrupt bytes.
			["corrupt.json", "{ not json"],
			// Foreign record: valid JSON, wrong shape entirely.
			["foreign.json", JSON.stringify({ slug: "alpha", description: "a project" })],
			// opId disagrees with the filename stem (the path is the identity authority).
			[
				"mismatch.json",
				JSON.stringify({
					schema_version: 1,
					opId: "somebody-else",
					order: 9,
					phase: "intent",
					draft: draft(3),
				}),
			],
			// Draft fails the isSpineEvent probe (no actor/kind/refs).
			[
				"baddraft.json",
				JSON.stringify({
					schema_version: 1,
					opId: "baddraft",
					order: 9,
					phase: "intent",
					draft: { schema_version: 1 },
				}),
			],
			// Unversioned: `version` instead of `schema_version` (WS-4 law).
			[
				"legacy.json",
				JSON.stringify({ version: 1, opId: "legacy", order: 9, phase: "intent", draft: draft(4) }),
			],
			// FUTURE schema: a newer writer's safety record must wedge, not vanish.
			[
				"future.json",
				JSON.stringify({
					schema_version: 2,
					opId: "future",
					order: 9,
					phase: "intent",
					draft: draft(4),
				}),
			],
			// No durable order / non-positive order (review 002 G3).
			[
				"unordered.json",
				JSON.stringify({ schema_version: 1, opId: "unordered", phase: "intent", draft: draft(5) }),
			],
			[
				"zeroorder.json",
				JSON.stringify({
					schema_version: 1,
					opId: "zeroorder",
					order: 0,
					phase: "intent",
					draft: draft(5),
				}),
			],
			// Unknown lifecycle phase (review 002 G2).
			[
				"unphased.json",
				JSON.stringify({
					schema_version: 1,
					opId: "unphased",
					order: 9,
					phase: "done",
					draft: draft(6),
				}),
			],
		];
		for (const [name, contents] of badFixtures) {
			plantRaw(home, name, contents);
			const result = journal.pending();
			expect(result.ok, name).toBe(false);
			if (!result.ok) {
				expect(result.code, name).toBe("E-NOREG");
				expect(result.message, name).toContain(join(opsDir(home), name));
			}
			// The entry is left in place for the operator — remove to try the next.
			rmSync(join(opsDir(home), name));
		}
		// With only valid entries the journal enumerates clean again.
		expect(expectOk(journal.pending())).toEqual([
			{ opId: idA, order: 1, phase: "intent", draft: valid },
		]);
	});

	it("non-.json filenames are not journal ops and stay ignored (exclusive-directory law)", () => {
		const journal = new FsOpJournal(home);
		const valid = draft(1, { kind: "project-created", project: "alpha" });
		const idA = expectOk(journal.record(valid));
		plantRaw(home, "notes.txt", "not a journal op");
		expect(expectOk(journal.pending())).toEqual([
			{ opId: idA, order: 1, phase: "intent", draft: valid },
		]);
	});

	it("record refuses E-NOREG while the journal holds an unreadable entry — no order over an unaudited predecessor (review 003 H2)", () => {
		const journal = new FsOpJournal(home);
		plantRaw(home, "corrupt.json", "{ not json");
		const result = journal.record(draft(1));
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) expect(result.message).toContain(join(opsDir(home), "corrupt.json"));
	});

	it("record leaves no temp files and everything lands strictly below spine/ops", () => {
		const journal = new FsOpJournal(home);
		const idA = expectOk(journal.record(draft(1)));
		const idB = expectOk(journal.record(draft(2)));
		journal.clear(idA);
		expect(readdirSync(home)).toEqual(["spine"]);
		expect(readdirSync(join(home, "spine"))).toEqual(["ops"]);
		// idA's resolution tombstone deliberately survives its clear (review
		// 005 K1) — the next pending() sweep owns its removal.
		expect(readdirSync(opsDir(home)).sort()).toEqual([`${idA}.resolved`, `${idB}.json`].sort());
	});

	it("record is E-NOREG (never a throw) when the journal directory cannot be created", () => {
		// A regular FILE at <home>/spine makes mkdir of spine/ops fail (ENOTDIR).
		writeFileSync(join(home, "spine"), "not a directory");
		const journal = new FsOpJournal(home);
		expect(journal.record(draft(1))).toMatchObject({ ok: false, code: "E-NOREG" });
	});

	it("phantom-peer regression: journaled ops never surface in FsRegistry.list()", () => {
		const journal = new FsOpJournal(home);
		expectOk(journal.record(draft(1)));
		expectOk(journal.record(draft(2)));
		expect(new FsRegistry(home).list()).toEqual([]);
	});

	// ─── plan 054 P2 T011 — tombstone growth bound where dir fsync works ────
	// The cycle-6 residual, ruled as a DOCUMENTED residual (ports.ts contract
	// text): on a platform whose directory fsync succeeds (this one), a burst
	// of resolved ops leaves ZERO retained tombstones after one pending()
	// sweep — growth is bounded by construction everywhere the durability
	// proof exists, and retention elsewhere (Windows) is deliberate evidence-
	// keeping, never a leak. K1 semantics untouched.
	it("a burst of clears leaves an EMPTY ops dir after one sweep (growth bound, real fs)", () => {
		const journal = new FsOpJournal(home);
		for (let i = 1; i <= 12; i++) {
			const opId = expectOk(journal.record(draft(i)));
			expectOk(journal.clear(opId));
		}
		// Even DURING the burst growth stays bounded: record()'s own pending()
		// call sweeps opportunistically, so only the newest clear's tombstone
		// can remain (each clear retains its evidence by design — K1)…
		expect(
			readdirSync(opsDir(home)).filter((n) => n.endsWith(".resolved")).length,
		).toBeLessThanOrEqual(1);
		// …and one explicit enumeration sweeps the remainder behind the proof.
		expect(expectOk(journal.pending())).toEqual([]);
		expect(readdirSync(opsDir(home))).toEqual([]);
	});
});
