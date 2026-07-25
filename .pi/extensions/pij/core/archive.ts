// pij-control-plane — two-tier registry policy (plan 071 D1, T001).
//
// PURE. Decides whether a registry record belongs in the HOT tier (`~/.pij/*.json`,
// which the daemon tick scans in full every 600ms) or is ARCHIVABLE (moved under
// `~/.pij/archive/`, reachable only by keyed lookup).
//
// Why this exists: on 2026-07-25 ~2,000 dead descriptors made each daemon tick
// ~19s — the tick calls `registry.list()` six times, and every call is a readdir
// plus a JSON.parse of EVERY descriptor that has ever existed. Delivery waits for
// a tick, so tick cost is delivery latency. The invariant this module encodes is
// `tick cost = O(live)`: the hot tier holds live seats plus recently-terminal ones,
// and nothing else.
//
// The bias is deliberately conservative — archiving is a MOVE, and a wrongly
// archived live seat is a fleet outage while a wrongly retained dead one is only
// slow. So every "can't prove it" branch answers `hot`.

import type { SessionDescriptor } from "./types.js";

/** A terminal record stays hot this long after its last observed activity, so
 *  post-mortem tooling (`pij state`, `pij tail`, a human reading the wreckage)
 *  finds it exactly where it always was. Jordan-approved: 48h. */
export const ARCHIVE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Which tier a record belongs in. `hot` = scanned by the tick; `archivable` =
 *  eligible for the daemon's end-of-tick move to `~/.pij/archive/`. */
export type RegistryTier = "hot" | "archivable";

/** Lifecycles with no future: the session will never run, send, or bind again.
 *  `bound`/`pending`/`ready` are live-or-becoming-live and NEVER archivable, no
 *  matter how stale — a stale bound seat is a stall to report, not a corpse to
 *  bury (that distinction is the whole point of D3). */
export function isTerminalRecord(descriptor: SessionDescriptor): boolean {
	return descriptor.lifecycle === "dissolved" || descriptor.lifecycle === "failed";
}

/** The timestamp a record's age is measured from, newest-wins. `lastEventAt` is
 *  the real activity axis; `lastTickAt` covers control-plane peers that write no
 *  pij events; `startedAt` is the floor (always present) so a descriptor that
 *  died before it ever did anything still ages out.
 *
 *  Returns null when NOTHING parses — an unparseable record cannot be proven old,
 *  so the caller keeps it hot rather than moving a file it does not understand. */
export function archiveAgeAnchorMs(descriptor: SessionDescriptor): number | null {
	let newest: number | null = null;
	for (const stamp of [descriptor.lastEventAt, descriptor.lastTickAt, descriptor.startedAt]) {
		if (typeof stamp !== "string") continue;
		const parsed = Date.parse(stamp);
		if (!Number.isFinite(parsed)) continue;
		if (newest === null || parsed > newest) newest = parsed;
	}
	return newest;
}

/** Hot vs archivable for one record at `nowMs`.
 *
 *  A record is archivable ONLY when it is terminal AND its newest provable
 *  activity is older than {@link ARCHIVE_AFTER_MS}. Everything else — live
 *  lifecycles, legacy descriptors with no lifecycle at all, unparseable
 *  timestamps, and clock skew that puts the anchor in the future — stays hot. */
/** How long a stamped `revivePendingAt` protects a record from the janitor.
 *  Covers a cold harness boot with a large transcript; the marker stops mattering
 *  the moment the revived seat publishes a live descriptor, so this is a ceiling. */
export const REVIVE_GRACE_MS = 10 * 60_000;

export function classifyRegistryRecord(descriptor: SessionDescriptor, nowMs: number): RegistryTier {
	if (!isTerminalRecord(descriptor)) return "hot";
	// A revive in flight (review round 1 §2.1). `pij revive` relaunches a DISSOLVED
	// seat, and for pi/omp s066 deliberately writes no descriptor during the boot —
	// so the record stays `dissolved` for the whole window and the 60s janitor would
	// `renameSync` the session dir out from under the booting process. Age alone
	// cannot see this: a revivable seat is >=48h old BY DEFINITION.
	const revivingMs = descriptor.revivePendingAt
		? Date.parse(descriptor.revivePendingAt)
		: Number.NaN;
	if (Number.isFinite(revivingMs)) {
		const sinceMs = nowMs - revivingMs;
		if (sinceMs >= 0 && sinceMs < REVIVE_GRACE_MS) return "hot";
	}
	const anchorMs = archiveAgeAnchorMs(descriptor);
	if (anchorMs === null) return "hot";
	const ageMs = nowMs - anchorMs;
	if (!Number.isFinite(ageMs) || ageMs < ARCHIVE_AFTER_MS) return "hot";
	return "archivable";
}

/** One append-only line in `~/.pij/archive/index.jsonl`, written by the daemon at
 *  the moment of the move and read by `pij list --archived`. Deliberately a
 *  denormalised summary: the point of the index is that listing archived seats
 *  never has to open ~2,000 descriptor files. */
export interface ArchiveIndexEntry {
	readonly id: string;
	/** ISO-8601 — when the daemon moved it. */
	readonly archivedAt: string;
	readonly lifecycle?: SessionDescriptor["lifecycle"];
	readonly failureReason?: SessionDescriptor["failureReason"];
	readonly harness?: SessionDescriptor["harness"];
	readonly folder?: string;
	/** ISO-8601 of the anchor the archival decision was made on. */
	readonly lastActivityAt?: string;
}

/** Build the index line for a record being archived at `nowMs`. */
export function buildArchiveIndexEntry(
	descriptor: SessionDescriptor,
	nowMs: number,
): ArchiveIndexEntry {
	const anchorMs = archiveAgeAnchorMs(descriptor);
	return {
		id: descriptor.id,
		archivedAt: new Date(nowMs).toISOString(),
		...(descriptor.lifecycle ? { lifecycle: descriptor.lifecycle } : {}),
		...(descriptor.failureReason ? { failureReason: descriptor.failureReason } : {}),
		...(descriptor.harness ? { harness: descriptor.harness } : {}),
		...(descriptor.folder ? { folder: descriptor.folder } : {}),
		...(anchorMs === null ? {} : { lastActivityAt: new Date(anchorMs).toISOString() }),
	};
}

/** Parse one `index.jsonl` line. Returns null for blank/corrupt lines so a torn
 *  tail (the daemon crashing mid-append) degrades to "one missing row" instead of
 *  failing the whole listing. */
export function parseArchiveIndexLine(line: string): ArchiveIndexEntry | null {
	const trimmed = line.trim();
	if (trimmed === "") return null;
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (typeof parsed !== "object" || parsed === null) return null;
		const entry = parsed as Record<string, unknown>;
		if (typeof entry.id !== "string" || typeof entry.archivedAt !== "string") return null;
		return entry as unknown as ArchiveIndexEntry;
	} catch {
		return null;
	}
}
