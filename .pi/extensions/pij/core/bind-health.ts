// pij-control-plane — pre-bind health, shared by every surface (plan 071 D3).
//
// PURE. The 2026-07-25 never-bind wedge was not a detection failure: the
// `spawn-limbo` anomaly eventually fired with the correct diagnosis. It was a
// SURFACING failure — the verdict existed only as a push, arrived ~16 minutes
// late, and `pij state` / `pij list` / `pij send` never reflected it. An operator
// looking straight at the wedged seat saw `idle · active`, `failureReason: null`,
// and a cheerful `queued` receipt.
//
// So the rule lives here, once, and every read-side surface computes it on the
// spot. Nothing has to be pushed, latched, or waited for.

import type { SessionDescriptor } from "./types.js";

/** How long a seat may sit un-bound before READ surfaces call it degraded.
 *
 *  Deliberately tighter than `DEFAULT_SPAWN_LIMBO_MS` (8 min), which governs the
 *  anomaly PUSH. The two thresholds answer different questions: a push costs a
 *  peer's attention, so it should be slow and near-certain; a read costs nothing
 *  and only ever answers a question someone just asked, so it should be early.
 *  2 minutes is ~3x the daemon's full bind budget (a 20s window, one phonehome
 *  re-send, a second 20s window), so a healthy spawn is never flagged. */
export const BIND_LIMBO_AFTER_MS = 120_000;

/** Where a seat sits on the spawn→bind axis.
 *  - `ok`         — bound, or a legacy descriptor that never used the control plane
 *  - `pre-bind`   — spawned recently and still binding; entirely normal
 *  - `bind-limbo` — still un-bound well past the bind budget; wedged until proven otherwise
 *  - `bind-failed`— the daemon gave up; it will never bind */
export type BindHealth = "ok" | "pre-bind" | "bind-limbo" | "bind-failed";

export function classifyBindHealth(
	descriptor: SessionDescriptor,
	nowMs: number,
	limboMs: number = BIND_LIMBO_AFTER_MS,
): BindHealth {
	if (descriptor.lifecycle === "failed") return "bind-failed";
	if (descriptor.lifecycle !== "pending" && descriptor.lifecycle !== "ready") return "ok";
	const bornMs = Date.parse(descriptor.startedAt);
	// An unparseable birth stamp cannot prove limbo, so it reads as still-binding
	// rather than inventing a wedge.
	if (!Number.isFinite(bornMs)) return "pre-bind";
	return nowMs - bornMs > limboMs ? "bind-limbo" : "pre-bind";
}

/** Does this seat deserve a DEGRADED marker in `pij state` / `pij list`? */
export function isBindDegraded(health: BindHealth): boolean {
	return health === "bind-limbo" || health === "bind-failed";
}

/** One line an operator can act on, or null when there is nothing wrong.
 *  Never hedged: if this returns a string, something IS broken. */
export function bindHealthDetail(
	descriptor: SessionDescriptor,
	health: BindHealth,
	nowMs: number,
): string | null {
	if (health === "bind-failed") {
		return `never bound — the daemon gave up${descriptor.failureReason ? ` (${descriptor.failureReason})` : ""}`;
	}
	if (health !== "bind-limbo") return null;
	const bornMs = Date.parse(descriptor.startedAt);
	const mins = Number.isFinite(bornMs) ? Math.round((nowMs - bornMs) / 60_000) : null;
	return `never bound — spawned${mins === null ? "" : ` ${mins}min ago`} and still '${descriptor.lifecycle}' (wedged boot; the watchdog cannot see pre-bind seats)`;
}

/** Why a send could not be reported as delivered. Machine-stable — the whole
 *  point is that `queued` stops being a single opaque word. */
export type QueuedReason =
	| "busy" // peer mid-turn; the daemon will steer it in after this turn
	| "unbound" // spawned, still binding; delivery starts at bind
	| "tick-pending" // bound, waiting on the daemon's next delivery pass
	| "compacting" // pane is compacting; injecting now would be eaten
	| "pull-inbox"; // explicit pull peer — it collects its own mail

/** What a send to this target can honestly claim.
 *  `blocked` means: this will not be delivered by anyone, on any timescale, until
 *  a human or a re-spawn intervenes. It is never used for a peer that is merely
 *  slow. */
export type SendDisposition = "delivered" | "queued" | "blocked";
