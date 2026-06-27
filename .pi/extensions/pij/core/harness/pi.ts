// pij-control-plane — the pi delivery-ownership seam (pure, Plan 019).
//
// The ONE immovable seam: a pi session keeps its in-process inbox receiver
// (`pi.sendUserMessage`). The daemon NEVER injects into pi — for a pi target it
// only OBSERVES the inbox (for the TUI); the thin in-process receiver
// (`index.ts`) is the SOLE consumer of pi inboxes (finding 01/06, AC-08).

import type { HarnessKind } from "../types.js";
import { selectTransport } from "./types.js";

/** True when the DAEMON owns delivery for this harness — i.e. it consumes the
 *  target inbox and injects via send-keys (claude/copilot). False for pi, whose
 *  thin in-process receiver owns delivery; the daemon must leave pi inboxes
 *  untouched or it would double-process the message. */
export function daemonOwnsDelivery(harness: HarnessKind): boolean {
	return selectTransport(harness) === "sendkeys";
}
