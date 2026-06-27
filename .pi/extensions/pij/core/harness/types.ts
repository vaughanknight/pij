// pij-control-plane — harness-type → transport selection (pure, Plan 019).
//
// HarnessKind itself lives in core/types.ts (shared SessionDescriptor vocab);
// this module owns the transport-selection CONTRACT the router depends on.

import type { HarnessKind } from "../types.js";

export type { HarnessKind } from "../types.js";

/** How a message reaches a session.
 *  - `inbox`   — write the peer's ~/.pij inbox; the peer self-injects (pi).
 *  - `sendkeys`— the daemon types into the peer's tmux pane (claude/copilot). */
export type Transport = "inbox" | "sendkeys";

/**
 * Select the message transport for a harness (Plan 019). The one immovable
 * seam — `pi.sendUserMessage` — keeps pi on the in-process `inbox` path; every
 * other harness is driven over tmux `send-keys`.
 */
export function selectTransport(harness: HarnessKind): Transport {
	switch (harness) {
		case "pi":
			return "inbox";
		case "claude":
		case "copilot":
			return "sendkeys";
	}
}
