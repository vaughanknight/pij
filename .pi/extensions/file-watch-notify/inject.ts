// inject — the in-session delivery seam (AC-02). Adapts pij's proven path
// (adapters/pi-runtime.ts:41-47): idle → sendUserMessage (starts a turn);
// busy → sendUserMessage(text, { deliverAs: "steer" }) (queued after the
// current turn). No tool call is involved — the notice arrives as a message.
//
// The decision + the port are pi-free and unit-tested with a fake; only
// makePiInjectPort imports pi.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type InjectMode = "immediate" | "steer";

/** Idle ⇒ immediate (start a turn); busy ⇒ steer (after the current turn). */
export function pickInjectMode(isIdle: boolean): InjectMode {
	return isIdle ? "immediate" : "steer";
}

/** What the wiring depends on — faked in tests, pi-backed in production. */
export interface InjectPort {
	isIdle(): boolean;
	send(text: string, mode: InjectMode): void;
}

/**
 * Deliver a batch of notices, choosing the mode once from the current idle
 * state. Returns the mode used (or null if nothing to deliver).
 */
export function deliverNotices(port: InjectPort, notices: string[]): InjectMode | null {
	if (notices.length === 0) return null;
	const mode = pickInjectMode(port.isIdle());
	for (const notice of notices) port.send(notice, mode);
	return mode;
}

/**
 * pi-backed port. `getCtx` returns the *current* ExtensionContext so isIdle()
 * is read fresh at delivery time (the watcher fires long after session_start).
 */
export function makePiInjectPort(
	pi: ExtensionAPI,
	getCtx: () => ExtensionContext | undefined,
): InjectPort {
	return {
		isIdle: () => getCtx()?.isIdle() ?? true,
		send: (text, mode) => {
			if (mode === "steer") pi.sendUserMessage(text, { deliverAs: "steer" });
			else pi.sendUserMessage(text);
		},
	};
}
