// pij-control-plane — the daemon tick heartbeat (pij#180 Fix A, plan 100).
//
// `lastTickAt` is liveness telemetry, and it is DISPOSABLE: if it is lost in a
// crash it is rebuilt on a subsequent daemon tick IF ONE RUNS, and until then it
// is simply ABSENT — which readers degrade to `unverified` (`core/receipts.ts`
// returns `daemonTickStale: true` for a missing stamp). THE SAFETY COMES FROM
// THAT DEGRADATION, NOT FROM REGENERATION. It was nevertheless the most expensive
// field in the system — the tick stamped it onto every daemon-owned descriptor,
// and each of those is an `FsRegistry.publish()` costing ~5 fsync-barriered
// atomic writes. Measured: 132 writes/tick, 52.5% of tick self-time.
//
// So it moves OUT of the descriptors and into one side file, rebuilt whole on
// every tick. 132 writes become 1.
//
// TWO SHAPE DECISIONS, both load-bearing:
//
//  1. The map is WRAPPED in `{v, tickAt, sessions}` and MUST NOT carry a
//     top-level `id`. `FsRegistry.readFile` admits a JSON file as a session
//     descriptor exactly when `typeof parsed?.id === "string"`
//     (`adapters/fs-registry.ts:1132`), and this file lives beside the
//     descriptors in `pijHome`. A bare `Record<id, iso>` would be fine today
//     and would become a phantom session the moment anything grew an `id` key.
//     The wrapper makes the file structurally invisible to `list()`.
//
//  2. Parsing is TOLERANT — missing file, corrupt JSON, wrong version, or a
//     non-object all yield an empty map rather than throwing. This file is read
//     on the daemon's hot path; a daemon must not die because a telemetry file
//     was truncated by a crash mid-write. An empty map degrades to "no tick
//     stamp known", which readers already handle as stale.
//
// Pruning is BY CONSTRUCTION: `buildHeartbeat` is built from the CURRENT owned
// set each tick, so a departed session's id simply is not in the next file.
// There is no incremental mutation to get wrong, and no reaper to schedule.
//
// AND ALMOST ALL THE PRUNING THERE IS (plan 100 Phase 2, fix rounds 3 and 5).
//
// Phase 2 added a second, INCREMENTAL prune — a `forget(id)` the registry called
// on every lifecycle transition — so that a reincarnated id could not inherit a
// stamp it never earned. It went through three review rounds and produced a P1
// in each: a lost update, then a stale-snapshot suppression, then that same
// stale-snapshot suppression returning THROUGH the wall-clock assumption written
// to justify the fix for it. A mechanism that regenerates its own defect is not
// unfinished; it is wrong. It was deleted.
//
// What replaced it for the TERMINAL cases is a reader gate: `FsRegistry.list()`
// already skipped `dissolved` before overlaying, `read()` did not gate at all,
// and it now gates and scrubs at both exits. A descriptor and the decision about
// it are read together in one process — no clock, no shared state, no
// cross-process ordering.
//
// The gate cannot cover the cases where the seat is genuinely ALIVE under a NEW
// incarnation of an OLD id. `core/revive.ts:667` strips `lastTickAt` from the
// descriptor it builds, so before this plan a reincarnated seat correctly read
// `unverified`; a map keyed by id handed it straight back, and with a stopped
// daemon there is no next tick to end it. So `forget(id)` is BACK, on exactly two
// transitions in `FsRegistry`: terminal -> live (`revive()`), and any write in
// `publish()` that does not land on the SAME LIVE INCARNATION the stamp was taken
// of. The second covers three routes with one predicate — nothing hot at all (a
// clean shutdown removes the descriptor and boot restores it from the durable
// identity snapshot without going near `revive()`), a hot record that is a CORPSE
// (a public `unarchive()` can leave a `failed` record hot, and adopting it writes
// a live descriptor through `write()`, not `revive()`), and a hot record whose
// ATTACHMENT changed (`pij adopt --id` re-binding a LEGACY descriptor — which is
// non-terminal, so the first two miss it — to a brand-new native session). It is
// a plain read-modify-write
// with a stated, sanctioned residual; see the note on `forget()` below before
// touching it.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Filename under `pijHome`. Not a descriptor — see shape decision 1 above. */
export const TICK_HEARTBEAT_FILE = "tick-heartbeat.json";

/** Bump only for a breaking shape change: an unrecognised version parses to an
 *  empty map, which is the correct degradation for telemetry. */
export const TICK_HEARTBEAT_VERSION = 1;

/** id → ISO-8601 stamp of the last tick that owned this session. */
export type TickStamps = Readonly<Record<string, string>>;

/** The on-disk record. Deliberately has NO top-level `id`. */
export interface TickHeartbeat {
	readonly v: typeof TICK_HEARTBEAT_VERSION;
	/** The tick that produced this file — one stamp shared by every entry. */
	readonly tickAt: string;
	readonly sessions: TickStamps;
}

/** The daemon's write seam (P3 — injected, never reached for). */
export interface TickHeartbeatPort {
	/** Persist `tickAt` for exactly these ids, replacing the previous file. */
	write(ids: readonly string[], tickAt: string): void;
	/** The stamps last persisted, or an empty map if absent/corrupt. */
	read(): TickStamps;
}

/** The REGISTRY's seam (plan 100 Phase 2; `forget` restored in fix round 5).
 *
 *  Deliberately a SECOND, narrower interface rather than reusing
 *  `TickHeartbeatPort`: the daemon writes the whole map every tick and the
 *  registry only ever reads it, or drops exactly one id from it. Handing the
 *  registry the wider port would hand it a `write` it must never call, and the
 *  type would stop saying so. */
export interface TickStampPort {
	/** The stamps last persisted, or an empty map if absent/corrupt. */
	read(): TickStamps;
	/** Drop ONE id — called from `FsRegistry.revive()` and `FsRegistry.publish()`.
	 *
	 *  A read-modify-write, and that is a RULED decision rather than an oversight.
	 *  See the note above `forget()` on the store for what it costs and why the
	 *  cost is the right one. */
	forget(id: string): void;
}

/** Build the whole file from the CURRENT owned set — this is the prune. */
export function buildHeartbeat(ids: readonly string[], tickAt: string): TickHeartbeat {
	const sessions: Record<string, string> = {};
	for (const id of ids) sessions[id] = tickAt;
	return { v: TICK_HEARTBEAT_VERSION, tickAt, sessions };
}

/** Tolerant parse of the WHOLE record — every failure mode returns null. Never
 *  throws. Field-level tolerance too: one non-string value must not discard the
 *  file.
 *
 *  The record form exists for `forget()`, which has to REWRITE the file and so
 *  must preserve the `tickAt` the daemon put there. Readers want
 *  {@link parseHeartbeat}. */
export function parseHeartbeatRecord(text: string | null | undefined): TickHeartbeat | null {
	if (typeof text !== "string" || text.length === 0) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed as Partial<TickHeartbeat>;
	if (record.v !== TICK_HEARTBEAT_VERSION) return null;
	if (typeof record.tickAt !== "string") return null;
	const sessions: unknown = record.sessions;
	if (typeof sessions !== "object" || sessions === null || Array.isArray(sessions)) return null;
	const out: Record<string, string> = {};
	for (const [id, stamp] of Object.entries(sessions)) {
		if (typeof stamp === "string") out[id] = stamp;
	}
	return { v: TICK_HEARTBEAT_VERSION, tickAt: record.tickAt, sessions: out };
}

/** Tolerant parse — every failure mode returns an empty map. Never throws. */
export function parseHeartbeat(text: string | null | undefined): TickStamps {
	return parseHeartbeatRecord(text)?.sessions ?? {};
}

/** Drop one id from a stamp map. Returns the SAME object when the id is absent,
 *  which is what lets `forget()` skip the write entirely. */
export function pruneStamp(stamps: TickStamps, id: string): TickStamps {
	if (stamps[id] === undefined) return stamps;
	const out: Record<string, string> = { ...stamps };
	delete out[id];
	return out;
}

/** The stamp for one session, or undefined when this tick did not own it. */
export function lastTickFor(stamps: TickStamps, id: string): string | undefined {
	return stamps[id];
}

/** The default concrete port.
 *
 *  NO fsync — deliberately, and it is the entire point of the change. The
 *  registry's `writeTextAtomic` pays an fsync(file) + fsync(dir) barrier per
 *  publish because a descriptor must survive a crash; a tick stamp must not.
 *
 *  WHY IT MUST NOT, STATED WITHOUT A REPAIR GUARANTEE. A lost stamp is rebuilt on
 *  a subsequent daemon tick IF ONE RUNS. Until then the stamp is ABSENT, and an
 *  absent stamp is not a wrong answer: `daemonTickStatus` returns
 *  `daemonTickStale: true` for a missing value (`core/receipts.ts`), so every
 *  reader degrades to `unverified`. The decision is sound because losing this
 *  value costs a CONSERVATIVE reading, not because the value comes back.
 *
 *  AN EARLIER VERSION OF THIS COMMENT SAID "because the next tick regenerates it
 *  600ms later", AND REVIEW FALSIFIED IT — the same unconditional guarantee
 *  deleted from `adapters/fs-registry.ts` in fix round 9, which survived here one
 *  round longer. `runDaemon()` only registers a `setInterval`; a stopped or
 *  crashed daemon has no next tick, and a delayed callback is not bounded to
 *  600ms. It is recorded rather than silently removed because the FSYNC DECISION
 *  IT JUSTIFIED IS STILL CORRECT, and a false rationale attached to a true
 *  conclusion is the hardest kind to see: checking the conclusion confirms
 *  nothing about the rationale, and the conclusion is what a reader checks.
 *
 *  `rename` still gives readers atomic all-or-nothing content, so a torn read is
 *  impossible; only a power-loss-order guarantee is given up, and there is
 *  nothing here to lose.
 *
 *  Lives beside the pure store rather than under `adapters/` because plan 100
 *  Phase 1 grants no adapter file; it imports `node:fs` only, never
 *  `@earendil-works/*`, so the pi-free rule for `core/` holds. */
export class FsTickHeartbeatStore implements TickHeartbeatPort, TickStampPort {
	constructor(private readonly pijHome: string) {}

	private path(): string {
		return join(this.pijHome, TICK_HEARTBEAT_FILE);
	}

	private persist(heartbeat: TickHeartbeat): void {
		const path = this.path();
		// Collision-safe staging, matching `adapters/atomic-file.ts:106`: two
		// writers sharing one fixed `.tmp` name can move or unlink each other's
		// staging file, and this method is built to SWALLOW that failure, which is
		// exactly what would make it invisible.
		//
		// The multi-writer case that first motivated this — CLI and seat processes
		// pruning the map — was deleted in fix round 3, and the honest statement now
		// is narrower: the daemon lock refuses a second instance but RECLAIMS a
		// stale one (`daemon.ts:1170`), so a handover can overlap a dead-but-not-yet
		// exited predecessor. A process-unique staging name costs one UUID and the
		// fixed name buys nothing back.
		const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
		try {
			mkdirSync(this.pijHome, { recursive: true });
			writeFileSync(tmp, JSON.stringify(heartbeat), "utf8");
			renameSync(tmp, path);
		} catch {
			// Telemetry is best-effort: a daemon must never die persisting it.
			try {
				rmSync(tmp, { force: true });
			} catch {
				// the staging file is not ours to insist on
			}
		}
	}

	private readText(): string | null {
		try {
			return readFileSync(this.path(), "utf8");
		} catch {
			return null;
		}
	}

	write(ids: readonly string[], tickAt: string): void {
		this.persist(buildHeartbeat(ids, tickAt));
	}

	read(): TickStamps {
		return parseHeartbeat(this.readText());
	}

	/** Drop ONE id from the map. Called from `FsRegistry.revive()` (terminal ->
	 *  live) and `FsRegistry.publish()` (any write that does not land on the same
	 *  live incarnation) and nowhere else — see the notes at those two call sites
	 *  for why those two transitions are the whole of it.
	 *
	 *  A READ-MODIFY-WRITE, RULED AND DELIBERATE. Rounds 1-3 of this phase tried to
	 *  avoid the RMW with a per-id tombstone marker protocol, and it produced a P1
	 *  in every review round — the last one being the defect it was written to fix,
	 *  returning through the assumption written to justify the fix. The protocol was
	 *  deleted. This is not it coming back: there is NO marker, NO directory, NO
	 *  clock, NO sweep, NO horizon and NO retry. One file, read and written.
	 *
	 *  THE RESIDUAL IS SANCTIONED AND IS STATED HERE SO IT IS NOT REDISCOVERED AS A
	 *  DEFECT. It has TWO independent sources, and naming only the first would be
	 *  the more dangerous omission — a reader who checks the concurrency argument
	 *  and finds it sound would conclude the field is otherwise reliable:
	 *
	 *    1. CONCURRENCY. Two concurrent drops of DIFFERENT ids can each read this
	 *       map and each write back their own removal; the later write restores the
	 *       other id's stamp.
	 *    2. BEST-EFFORT I/O. Every write in this file may simply fail — that is the
	 *       deliberate policy stated at the top, because neither a daemon nor a seat
	 *       may die over telemetry. A drop that does not persist at all leaves the
	 *       same stale stamp, with no second writer involved.
	 *
	 *  Both cost exactly AC-13' as restated: a stale stamp bounded by the next
	 *  heartbeat write, and in its absence by the staleness grace.
	 *
	 *  **If you are here because you found either one: they are known, they are
	 *  accepted, and the last three attempts to close the first cost more than it
	 *  does. Do not rebuild the marker protocol.** Drops are rare and one-per-seat;
	 *  the tick that rebuilds the whole map is the steady-state prune, and this only
	 *  has to cover the window before it — including the stopped-daemon case, where
	 *  there is no next write and this removal is the ONLY thing standing between a
	 *  reincarnated seat and a stamp it never earned.
	 *
	 *  Skips the write entirely when the id is not in the map, so a drop on a quiet
	 *  home — including every first-ever spawn, which `publish()` routes here —
	 *  costs one read and nothing else. */
	forget(id: string): void {
		const record = parseHeartbeatRecord(this.readText());
		if (!record) return;
		const sessions = pruneStamp(record.sessions, id);
		if (sessions === record.sessions) return;
		this.persist({ ...record, sessions });
	}
}
