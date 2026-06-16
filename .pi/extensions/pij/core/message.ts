// pij-messaging — message framing + boot self-announce text (pure).
//
// A message carries the sender id inline so the receiver can reply with zero
// lookup (spec AC-5): `[pij from <id>] <body>`.

import type { Role, SessionId } from "./types.js";

const FRAME_RE = /^\[pij from ([^\]]+)\] ([\s\S]*)$/;

/** Frame a body with the sender id for injection into the peer. */
export function frame(from: SessionId, body: string): string {
	return `[pij from ${from}] ${body}`;
}

/** Parse a framed message back into { from, body }, or null if unframed. */
export function parseFrame(text: string): { from: SessionId; body: string } | null {
	const m = FRAME_RE.exec(text);
	if (!m) return null;
	const from = m[1];
	const body = m[2];
	if (from === undefined || body === undefined) return null;
	return { from, body };
}

/** Human/agent-readable role label. */
export function roleLabel(role: Role | undefined): string {
	if (role === "parent") return "PARENT (reviewer)";
	if (role === "worker") return "WORKER";
	return "PEER";
}

/** Boot self-announce injected at session start (spec AC-2): tells the session
 *  its own id + how to use pij, so it can be addressed and can reply. */
export function announceText(self: SessionId, role?: Role): string {
	return [
		`You are pij session ${self} (${roleLabel(role)}).`,
		`Peers reach you via: pij send ${self} "..."`,
		`To message a peer: pij send <id> "..." (your id is stamped automatically).`,
		`Discover peers: pij list --here   ·   Observe one: pij tail <id> / pij state <id>.`,
	].join("\n");
}
