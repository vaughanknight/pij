// pij platform — fs OpJournalPort adapter (review p1-review-001 HIGH-2 +
// review 002 G2/G3 journal lifecycle).
//
// Layout: `<pijHome>/spine/ops/<opId>.json` — STRICTLY below spine/, never at
// the pijHome top level, which belongs exclusively to FsRegistry live-peer
// descriptors (Finding 01, phantom-peer law). Each entry is the write-ahead
// record of one coupled write: {schema_version: 1, opId, order, phase, draft}.
// `record` journals phase "intent" (NOT yet replayable — the state write may
// never land) and allocates the durable causal `order` (G3: random-UUID
// filenames sorted lexically are not an order); `markCommitted` durably flips
// the phase after the state write; `clear` durably records a
// `<opId>.resolved` tombstone BEFORE the unlink (review 005 K1) so a
// power-loss-resurrected entry reads as RESOLVED, never as a live crash
// record; `pending` is a guard-validated read sorted order-ascending with
// opId as tiebreak — but unlike the focus-store precedent, a .json entry that
// fails validation is E-NOREG naming the path, never skipped (review 003 H2):
// these are SAFETY records, and a damaged one must wedge recovery, not vanish.

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { OpJournalPort, PendingOp } from "../core/platform/ports.js";
import { isSpineEvent, type SpineEventDraft } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { fsyncDirBestEffort, writeJsonAtomic } from "./atomic-file.js";

export class FsOpJournal implements OpJournalPort {
	// FsRegistry precedent: home is injected, never self-resolved; the ops
	// directory is created lazily at write time, so reads tolerate an absent
	// home.
	constructor(private readonly pijHome: string) {}

	private opsDir(): string {
		return join(this.pijHome, "spine", "ops");
	}

	private pathFor(opId: string): string {
		return join(this.opsDir(), `${opId}.json`);
	}

	/** Durable resolution evidence (review 005 K1): written by clear BEFORE
	 *  the op unlink, discarded by pending()'s sweep only after a load-bearing
	 *  dir fsync proves the op entry's absence durable. */
	private resolvedPathFor(opId: string): string {
		return join(this.opsDir(), `${opId}.resolved`);
	}

	record(draft: SpineEventDraft): Result<string> {
		// Validation symmetry (audit F2): readOp's probe runs at record time
		// too, so a draft pending() would silently skip on read-back is refused
		// HERE — the coupled write aborts before any state commit instead of
		// stranding committed state with an unreplayable journal entry.
		if (!isSpineEvent({ ...draft, seq: 1 })) {
			return err("E-ARG", "invalid spine event draft — refusing to journal");
		}
		// randomUUID keeps every path below spine/ops/ by construction — no
		// caller-supplied name ever reaches the filesystem.
		const opId = randomUUID();
		const path = this.pathFor(opId);
		// Durable causal order (review 002 G3): max over surviving entries + 1.
		// Coexisting entries were recorded by CONCURRENT writers (the recovery
		// gate empties the journal before a sequential successor records), so
		// max-pending respects causality; equal orders are mutually unordered
		// and pending()'s opId tiebreak makes replay deterministic. An
		// unenumerable journal refuses the record (review 003 H2): no order can
		// be allocated over an unaudited predecessor.
		const surviving = this.pending();
		if (!surviving.ok) return surviving;
		let order = 1;
		for (const op of surviving.value) if (op.order >= order) order = op.order + 1;
		try {
			writeJsonAtomic(path, { schema_version: 1, opId, order, phase: "intent", draft });
			return ok(opId);
		} catch (error) {
			return err("E-NOREG", `cannot journal op ${path}: ${String(error)}`);
		}
	}

	markCommitted(opId: string): Result<void> {
		// The durable phase flip AFTER the state write (review 002 G2): from
		// here the op is replayable unconditionally. Preserves the recorded
		// order — the flip is a lifecycle transition, not a new position.
		const op = this.readOp(opId);
		if (op === null) {
			return err("E-NOREG", `no journaled op '${opId}' to mark committed`);
		}
		const path = this.pathFor(opId);
		try {
			writeJsonAtomic(path, {
				schema_version: 1,
				opId,
				order: op.order,
				phase: "committed",
				draft: op.draft,
			});
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot mark op committed ${path}: ${String(error)}`);
		}
	}

	clear(opId: string): Result<void> {
		// Confirmed-absent semantics (review 003 M3): a clear reported ok while
		// the entry survives lets recovery count an op resolved and a successor
		// mutate state — turning the stale entry into an unadjudicable wedge
		// one write later. Failure surfaces as a Result the caller must stop on.
		const path = this.pathFor(opId);
		// An already-absent entry clears ok; any leftover tombstone belongs to
		// the sweep, which alone may discard evidence (after durability proof).
		if (!existsSync(path)) return ok(undefined);
		// Durable resolution evidence FIRST (review 005 K1): removal durability
		// rides on directory fsync, which is fail-soft here and unsupported on
		// some platforms, and a power-loss-resurrected entry is byte-identical
		// to a live crash record — recovery then forged an aborted intent past
		// a genuine winner, or false-blocked a moved-on committed op. The
		// tombstone's CONTENT fsync (writeJsonAtomic) is durable on every
		// platform, so it always outlives an unlink that never landed.
		const resolved = this.resolvedPathFor(opId);
		try {
			writeJsonAtomic(resolved, { schema_version: 1, opId });
		} catch (error) {
			return err("E-NOREG", `cannot record resolution tombstone ${resolved}: ${String(error)}`);
		}
		try {
			rmSync(path, { force: true });
		} catch (error) {
			return err("E-NOREG", `cannot clear journal op ${path}: ${String(error)}`);
		}
		if (existsSync(path)) {
			return err("E-NOREG", `journal op ${path} survived its clear — refusing to report success`);
		}
		// The tombstone deliberately survives this clear: the unlink above is
		// only page-cache state until a dir fsync lands, and the tombstone is
		// exactly what makes a resurrected entry harmless. pending()'s sweep
		// removes it once a LOAD-BEARING dir fsync proves the absence durable.
		return ok(undefined);
	}

	pending(): Result<readonly PendingOp[]> {
		let names: string[];
		try {
			names = readdirSync(this.opsDir());
		} catch (error) {
			// An absent directory means no coupled write ever journaled: truly
			// empty. Anything else is an unenumerable safety ledger — an error,
			// never absence (review 003 H2).
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
			return err("E-NOREG", `cannot enumerate journal ${this.opsDir()}: ${String(error)}`);
		}
		// Resolution tombstones (review 005 K1): an op file coexisting with its
		// `<opId>.resolved` is a RESOLVED op resurrected by power loss (its
		// unlink never became durable) — NOT a live crash record; presenting it
		// would forge an aborted intent past a genuine winner or false-block a
		// legitimately moved-on committed op. A lone tombstone is garbage from
		// a fully durable clear. Only a regular FILE is evidence — a squatting
		// directory at the tombstone path must not get a live op swept.
		const tombstones = new Set<string>();
		for (const name of names) {
			if (!name.endsWith(".resolved")) continue;
			try {
				if (statSync(join(this.opsDir(), name)).isFile()) {
					tombstones.add(name.slice(0, -".resolved".length));
				}
			} catch {
				// Vanished or unstattable: not usable evidence this pass.
			}
		}
		const out: PendingOp[] = [];
		// Tombstone stems whose op entry is confirmed absent — only these may
		// have their evidence discarded, and only after the fsync proof below.
		const sweepable: string[] = [];
		for (const name of names) {
			// Exclusive-directory law: non-op FILENAMES are not journal ops. An
			// op-shaped .json that fails validation is different — a damaged or
			// newer-schema safety record is NOT equivalent to absence, and
			// recovery must wedge on it rather than write past an unaudited
			// predecessor (review 003 H2).
			if (!name.endsWith(".json")) continue;
			const stem = name.slice(0, -".json".length);
			if (tombstones.has(stem)) {
				// Resolved — swept without H2 validation: the wedge protects LIVE
				// safety records, and this one already served its purpose (its
				// resurrected bytes may even have come back torn).
				try {
					rmSync(this.pathFor(stem), { force: true });
					sweepable.push(stem);
				} catch {
					// Couldn't remove the resurrected copy: keep the pair for a
					// later pass — still never presented as live.
				}
				continue;
			}
			const op = this.readOp(stem);
			if (op === null) {
				return err(
					"E-NOREG",
					`unreadable or invalid journal op ${join(this.opsDir(), name)} — resolve or remove it before any further platform write`,
				);
			}
			out.push(op);
		}
		for (const stem of tombstones) {
			if (!names.includes(`${stem}.json`)) sweepable.push(stem);
		}
		// Discard resolution evidence ONLY behind a load-bearing dir fsync
		// (review 005 K1): until the op entry's absence is durable, removing
		// the tombstone could resurrect its op as live after power loss. Where
		// directory fsync is unsupported (Windows), tombstones are simply
		// retained — small files in an exclusive directory, swept by a later
		// pass on a platform pass that can prove durability.
		// T011 ruling (cycle-6 residual): retention there is DELIBERATE and
		// unbounded — any age/count cap discards evidence without durability
		// proof and reopens K1. Contract text + manual remedy: ports.ts
		// `pending`. On fsync-capable platforms this pass empties the
		// sweepable set every time (growth-bound pinned in the test file).
		if (sweepable.length > 0 && fsyncDirBestEffort(this.opsDir())) {
			for (const stem of sweepable) {
				try {
					rmSync(this.resolvedPathFor(stem), { force: true });
				} catch {
					// Leftover evidence is harmless — next pass retries.
				}
			}
			fsyncDirBestEffort(this.opsDir());
		}
		out.sort((left, right) =>
			left.order !== right.order
				? left.order - right.order
				: left.opId < right.opId
					? -1
					: left.opId > right.opId
						? 1
						: 0,
		);
		return ok(out);
	}

	/** Guard-validated single-entry read: null on missing/corrupt/foreign.
	 *  The filename stem is the identity authority — a record whose internal
	 *  opId disagrees is foreign, not this op. The draft is validated by
	 *  stamping a probe seq and running the full isSpineEvent guard (a draft
	 *  is exactly a SpineEvent minus seq); order must be a positive integer
	 *  and phase a known lifecycle value (review 002 G2/G3). */
	private readOp(opId: string): PendingOp | null {
		try {
			const parsed: unknown = JSON.parse(readFileSync(this.pathFor(opId), "utf8"));
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
			const entry = parsed as Record<string, unknown>;
			if (entry.schema_version !== 1) return null;
			if (entry.opId !== opId) return null;
			const order = entry.order;
			if (typeof order !== "number" || !Number.isSafeInteger(order) || order < 1) return null;
			const phase = entry.phase;
			if (phase !== "intent" && phase !== "committed") return null;
			const draft = entry.draft;
			if (typeof draft !== "object" || draft === null || Array.isArray(draft)) return null;
			if (!isSpineEvent({ ...draft, seq: 1 })) return null;
			return { opId, order, phase, draft: draft as SpineEventDraft };
		} catch {
			return null;
		}
	}
}
