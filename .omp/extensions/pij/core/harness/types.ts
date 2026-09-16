// pij-control-plane — harness-type → transport selection (pure, Plan 019).
//
// HarnessKind itself lives in core/types.ts (shared SessionDescriptor vocab);
// this module owns the transport-selection CONTRACT the router depends on.

import type { DeliveryMode, HarnessKind } from "../types.js";

export type { DeliveryMode, HarnessKind } from "../types.js";

/** Legacy TypeScript transport classification, not current native routing.
 *  - `inbox`   — legacy inbox ownership, including explicit pull mode.
 *  - `sendkeys`— historical pane-transport classification. Copilot native routing
 *    bypasses this helper; callers must never use it as a Copilot fallback. */
export type Transport = "inbox" | "sendkeys";

/**
 * Select the legacy TypeScript transport class (Plan 019).
 * Current native Copilot delivery is owned by its user extension and Rust inbox
 * authority; this historical classification does not grant permission to type.
 */
export function selectTransport(harness: HarnessKind, deliveryMode?: DeliveryMode): Transport {
	if (deliveryMode === "pull") return "inbox";
	switch (harness) {
		case "pi":
			return "inbox";
		case "claude":
		case "copilot":
		case "codex":
			return "sendkeys";
	}
}

/**
 * Whether a harness supports **branch-from-self** at spawn — forking the caller's
 * OWN session into the new pane (Plan 020). Claude forks via `--resume <id>
 * --fork-session --session-id <new>` (verified live, v2.1.195). Copilot/pi have
 * no equivalent yet; the seam lives HERE so they flip to `true` later without
 * touching any caller (the bin only asks this predicate, never hard-codes claude).
 */
export function supportsBranching(harness: HarnessKind): boolean {
	return harness === "claude";
}
