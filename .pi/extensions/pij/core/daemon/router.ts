// pij-control-plane — message router + pre-bind send buffer (pure, Plan 019).
//
// The daemon owns delivery for tmux harnesses (claude/copilot): consume the
// target inbox and inject via send-keys. For pi it does NOTHING but observe —
// the in-process thin receiver is the sole consumer (AC-08, the immovable seam).
//
// `route()` is the pure decision; `SendBuffer` holds sends to a not-yet-bound
// tmux target and flushes them in arrival order on bind (R-02: spawn returns
// immediately and the caller never blocks, so sends can outrun the binding).

import { selectTransport } from "../harness/types.js";
import { frame } from "../message.js";
import type { PijMessage, SessionDescriptor, SessionId, WatchdogSidecar } from "../types.js";
import { applyCompactPause } from "../watchdog.js";

export interface BufferedMessage {
	readonly messageId: string;
	readonly message: PijMessage;
}

export interface BufferedPaneSignal {
	readonly busy: boolean;
	readonly userTyping: boolean;
}

export type RouteDecision =
	| { readonly kind: "inject"; readonly paneId: string; readonly text: string }
	| { readonly kind: "buffer"; readonly reason: string }
	| { readonly kind: "observe" };

/** The literal keystrokes for a message. A remote command becomes its slash
 *  form (`/compact` triggers compaction in the pane, AC-07) and is injected RAW
 *  so it executes. Free text is framed as `[pij from <sender>] <body>` — the
 *  same envelope the pi in-process receiver uses — so the receiving agent (incl.
 *  an adopted orchestrator) can tell a peer message from real human input and
 *  knows who to reply to. Enter is pressed at the send-keys layer (the daemon).
 *  A `receipt` carries no keystrokes — it is recorded, never injected. */
export function injectionText(message: PijMessage): string {
	return message.command ? `/${message.command}` : frame(message.from, message.body);
}

/** Don't insta-clear the compact mark off the still-idle pane sampled before
 *  `/compact` has visibly started (~3s covers the send-keys → busy edge). */
export const COMPACT_GRACE_MS = 3_000;
/** Staleness bound on the compact hold: compaction normally runs 10–45s, so a
 *  mark older than this is a compact that died mid-window (or a wedged pane) —
 *  drain resumes unconditionally rather than wedging the queue (DL-004). */
export const COMPACT_MAX_MS = 120_000;

/** Is this descriptor inside a live compact window (fresh `compactingAt`)? The
 *  daemon skips inbox drain while true, so a send can't be injected into the
 *  compact window and eaten by the harness's fresh-context reset (DL-004). The
 *  durable inbox IS the queue: nothing is consumed, receipts stay `queued`
 *  until the post-compact injection emits `delivered`. Absent/unparseable/
 *  expired (past {@link COMPACT_MAX_MS}) → false. Pure. */
export function isCompacting(d: SessionDescriptor, nowMs: number): boolean {
	if (d.compactingAt === undefined) return false;
	const ageMs = nowMs - Date.parse(d.compactingAt);
	return Number.isFinite(ageMs) && ageMs <= COMPACT_MAX_MS;
}

/** Persist-before-inject compact seam shared by daemon-owned tmux delivery. */
export function pauseForCompactMessage(
	message: { readonly command?: string },
	sidecar: WatchdogSidecar | undefined,
	nowMs: number,
): WatchdogSidecar | undefined {
	return message.command === "compact" ? applyCompactPause(sidecar, nowMs) : sidecar;
}

/** Decide how to deliver `message` to `target` (AC-07/08, R-02):
 *  - pi target              → `observe` (the thin receiver owns it);
 *  - bound tmux target      → `inject` into its pane;
 *  - unbound tmux target    → `buffer` until it binds. */
export function route(target: SessionDescriptor, message: PijMessage): RouteDecision {
	const transport = selectTransport(target.harness ?? "pi", target.deliveryMode);
	if (transport === "inbox") return { kind: "observe" };
	if (target.lifecycle === "bound" && target.paneId) {
		return { kind: "inject", paneId: target.paneId, text: injectionText(message) };
	}
	return {
		kind: "buffer",
		reason: `${target.id} not yet bound (lifecycle=${target.lifecycle ?? "?"})`,
	};
}

/** A FIFO of sends to tmux targets that were unbound when they arrived. Flushed
 *  in arrival order the instant the target binds (R-02). In-memory only: the
 *  daemon holds one for its lifetime; nothing persists (a restart re-derives
 *  unsent work from the inbox files it has not yet consumed). */
export class SendBuffer {
	private readonly byTarget = new Map<SessionId, BufferedMessage[]>();
	private readonly paneSignals = new Map<string, BufferedPaneSignal>();

	/** Buffer a message for its target. */
	enqueue(messageId: string, message: PijMessage): void {
		const q = this.byTarget.get(message.to) ?? [];
		if (q.some((entry) => entry.messageId === messageId)) return;
		q.push({ messageId, message });
		this.byTarget.set(message.to, q);
	}

	/** Update the pane's read-only signals. Only `userTyping` gates delivery;
	 * `busy` is deliberately exposed for future UI consumers and never holds. */
	setPaneSignal(paneId: string, signal: BufferedPaneSignal): void {
		this.paneSignals.set(paneId, signal);
	}

	paneSignal(paneId: string): Readonly<BufferedPaneSignal> | undefined {
		return this.paneSignals.get(paneId);
	}

	isPaneHeld(paneId: string): boolean {
		return this.paneSignals.get(paneId)?.userTyping ?? false;
	}

	forgetPane(paneId: string): void {
		this.paneSignals.delete(paneId);
	}

	/** How many messages are buffered for a target (0 if none). */
	pending(target: SessionId): number {
		return this.byTarget.get(target)?.length ?? 0;
	}

	/** Remove and return all buffered messages for a target, in arrival order. */
	flush(target: SessionId, paneId?: string): BufferedMessage[] {
		if (paneId && this.isPaneHeld(paneId)) return [];
		const q = this.byTarget.get(target) ?? [];
		this.byTarget.delete(target);
		return q;
	}
}
