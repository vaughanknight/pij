// pij-messaging — message framing + boot self-announce text (pure).
//
// A message carries the sender id inline so the receiver can reply with zero
// lookup (spec AC-5): `[pij from <id>] <body>`.

import type { ReceiptState, Role, SessionId } from "./types.js";

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

/** Body of an extension-issued delivery receipt, framed for the sender's
 *  event log (spec AC-13): `[pij receipt <messageId>] queued|delivered`. */
export function receiptBody(messageId: string, state: ReceiptState): string {
	return `[pij receipt ${messageId}] ${state}`;
}

const RECEIPT_RE = /^\[pij receipt ([^\]]+)\] (queued|delivered)$/;

/** Parse a receipt body back into { messageId, state }, or null if not a
 *  receipt (used by `pij send --wait` to correlate the delivered receipt and
 *  by `pij tail` to summarise receipt events). */
export function parseReceiptBody(body: string): { messageId: string; state: ReceiptState } | null {
	const m = RECEIPT_RE.exec(body);
	if (!m) return null;
	const messageId = m[1];
	const state = m[2];
	if (messageId === undefined || state === undefined) return null;
	return { messageId, state: state as ReceiptState };
}

/** Boot self-announce injected at session start (spec AC-2): tells the session
 *  its own id + how to use pij, so it can be addressed and can reply.
 *
 *  Deliberately NON-imperative: it states capabilities, it does not hand the
 *  model a startup to-do list. A directive briefing made fresh boots run every
 *  `pij` command and snoop their own inbox (difficulty D-040). It also tells the
 *  model NOT to treat inbox files as live instructions — real peer messages are
 *  injected as `[pij from <id>] …`; the JSON files in the inbox dir are an
 *  internal transport log, not a task queue. */
export function announceText(self: SessionId, role?: Role): string {
	return [
		`You are pij session ${self} (${roleLabel(role)}). This is context only — no action is required.`,
		`Peers can reach you; their messages arrive inline as "[pij from <id>] …". Only those injected messages are live instructions.`,
		`Do NOT read, list, or act on files under your pij data/inbox directory — they are an internal transport log, not tasks, and replaying them re-runs old requests.`,
		`When you DO want to use pij: "pij send <id> "..."" to message a peer (your id is stamped automatically); "pij list --here" to see peers; "pij tail <id>" / "pij state <id>" to observe one.`,
	].join("\n");
}
