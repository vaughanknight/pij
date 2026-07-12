// pij-control-plane — harness-type → transport selection (pure, Plan 019).
//
// HarnessKind itself lives in core/types.ts (shared SessionDescriptor vocab);
// this module owns the transport-selection CONTRACT the router depends on.

import type { DeliveryMode, HarnessKind } from "../types.js";

export type { DeliveryMode, HarnessKind } from "../types.js";

/** How a message reaches a session.
 *  - `inbox`   — write the peer's ~/.pij inbox; the peer self-injects (pi).
 *  - `sendkeys`— the daemon types into the peer's tmux pane (claude/copilot/codex). */
export type Transport = "inbox" | "sendkeys";

/**
 * Select the message transport for a harness (Plan 019). The one immovable
 * seam — `pi.sendUserMessage` — keeps pi on the in-process `inbox` path; every
 * other harness (claude/copilot/codex) is driven over tmux `send-keys`.
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
