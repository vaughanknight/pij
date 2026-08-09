// pij — the watchdog scheduler projection (s101).
//
// THE GAP THIS CLOSES. `WatchdogManager.states` is a private in-memory `Map`
// (`watchdog-manager.ts:249`). Whether a seat is in it is decided by `eligible()`
// at reconcile time and written NOWHERE — so "is this seat actually in the
// scheduler?" is unanswerable from any command, at any price, because the CLI is
// a different process. `activeCount()` exists at :287 and its only callers are
// TESTS, which is the tell: a test can hold the manager object and nothing else
// can.
//
// The cost of that gap, measured: establishing that ONE seat was overdue and not
// firing required a prime to deliberately withhold its status card for 28
// minutes, declared in advance so it would not read as negligence. **The cadence
// we mandate is what suppresses the trigger, so measuring the trigger requires
// breaking the cadence.** A self-concealing defect. This file turns that
// experiment into one command.
//
// WHY A SINGLE FILE, AND NOT THE SIDECAR THAT ALREADY EXISTS. `FsWatchdogStore`
// writes a per-seat sidecar, so stamping this on it looks free. It is not, and
// `watchdog-manager.ts:57` states the intent: the sidecar is deliberately NOT
// written on the reconcile path. Making reconcile write one per seat would be
// ~94 atomic writes per tick at the current owned-seat count, and this repo
// measured an atomic write at 18.1ms (pij#180) — **~1.7s per tick, against the
// 3.27s pij#181 and pij#229 removed on 2026-08-09.** The obvious cheap route
// would spend most of a day's tick win to buy an observability field. One file
// instead: ONE atomic write, and only when the content CHANGES.
//
// Shape decisions inherited from `tick-heartbeat.ts`, which learned them the hard
// way: the payload is WRAPPED and carries NO top-level `id`, because
// `FsRegistry.readFile` admits any JSON in `pijHome` whose `id` is a string and
// this file lives beside the descriptors; and parsing is TOLERANT, because a
// daemon must not die over a telemetry file truncated by a crash.

/** Filename under `pijHome`. Not a descriptor — see the note above. */
export const WATCHDOG_SCHEDULER_FILE = "watchdog-scheduler.json";

/** Bump only for a breaking shape change. An unrecognised version parses to
 *  `undefined`, which readers render as UNKNOWN — the correct degradation. */
export const WATCHDOG_SCHEDULER_VERSION = 1;

/** How old a projection may be before it stops being evidence.
 *
 *  A daemon that has stopped reconciling leaves a file describing a world that
 *  has moved on. Trusting it would report every seat scheduled since as absent —
 *  the exact false negative this module exists to prevent. Generous relative to
 *  the ~600ms tick, because the failure it guards is a daemon that stopped, not
 *  a tick that ran long. */
export const PROJECTION_STALE_AFTER_MS = 5 * 60_000;

export interface ScheduledSession {
	/** When the watchdog next comes due for this seat, when the daemon knows it. */
	readonly nextDueAt?: string;
}

/** The on-disk record. Deliberately has NO top-level `id`. */
export interface WatchdogSchedulerProjection {
	readonly v: typeof WATCHDOG_SCHEDULER_VERSION;
	/** The reconcile pass that produced this file — the freshness axis. */
	readonly reconciledAt: string;
	readonly sessions: Readonly<Record<string, ScheduledSession>>;
}

/** What `pij watchdog status` can honestly say about a seat's scheduling.
 *
 *  THREE OUTCOMES, NOT TWO, AND THAT IS THE WHOLE POINT. `unknown` is the
 *  instrument's limit; `not-scheduled` is a fact about the world. Collapsing them
 *  is the defect class this fleet spent 2026-08-09 filing — `watchers: 1` for a
 *  corpse, a green check for a check that never ran, `running` for a daemon four
 *  commits stale. A sensor built to end that class must not contain it. */
export type SchedulerVerdict =
	| { readonly kind: "scheduled"; readonly nextDueAt?: string }
	| { readonly kind: "not-scheduled" }
	| { readonly kind: "unknown"; readonly reason: string };

/** Tolerant parse. Anything unrecognised yields `undefined` — never an empty
 *  projection, which would claim the whole fleet is unscheduled. */
export function parseSchedulerProjection(raw: unknown): WatchdogSchedulerProjection | undefined {
	let value: unknown = raw;
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw);
		} catch {
			return undefined;
		}
	}
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (record.v !== WATCHDOG_SCHEDULER_VERSION) return undefined;
	if (typeof record.reconciledAt !== "string") return undefined;
	if (typeof record.sessions !== "object" || record.sessions === null) return undefined;
	return {
		v: WATCHDOG_SCHEDULER_VERSION,
		reconciledAt: record.reconciledAt,
		sessions: record.sessions as Readonly<Record<string, ScheduledSession>>,
	};
}

/** Build the projection for one reconcile pass. Rebuilt whole, so a departed
 *  seat simply is not in the next file — pruning by construction, no reaper. */
export function buildSchedulerProjection(
	sessions: Readonly<Record<string, ScheduledSession>>,
	reconciledAtIso: string,
): WatchdogSchedulerProjection {
	return { v: WATCHDOG_SCHEDULER_VERSION, reconciledAt: reconciledAtIso, sessions };
}

/** The verdict for one seat. */
export function readSchedulerVerdict(
	projection: WatchdogSchedulerProjection | undefined,
	id: string,
	nowMs: number,
): SchedulerVerdict {
	if (projection === undefined) {
		return {
			kind: "unknown",
			reason:
				"no scheduler projection — daemon has not reconciled since this shipped, or the file is unreadable",
		};
	}
	const reconciledMs = Date.parse(projection.reconciledAt);
	// NaN-safe: an unparseable stamp cannot prove freshness, so it is not fresh.
	if (!Number.isFinite(reconciledMs) || nowMs - reconciledMs > PROJECTION_STALE_AFTER_MS) {
		return {
			kind: "unknown",
			reason: `scheduler projection is stale (${projection.reconciledAt})`,
		};
	}
	const entry = projection.sessions[id];
	if (entry === undefined) return { kind: "not-scheduled" };
	return entry.nextDueAt === undefined
		? { kind: "scheduled" }
		: { kind: "scheduled", nextDueAt: entry.nextDueAt };
}

/** One line for a human. The three outcomes must READ differently, not merely
 *  differ in the type — a distinction the operator never sees is not a
 *  distinction. */
export function renderSchedulerVerdict(verdict: SchedulerVerdict): string {
	switch (verdict.kind) {
		case "scheduled":
			return verdict.nextDueAt === undefined
				? "scheduler: scheduled (next due unknown)"
				: `scheduler: scheduled, next due ${verdict.nextDueAt}`;
		case "not-scheduled":
			return "scheduler: NOT SCHEDULED (daemon is tracking this seat's watchdog: no)";
		case "unknown":
			return `scheduler: UNKNOWN — ${verdict.reason}`;
	}
}
