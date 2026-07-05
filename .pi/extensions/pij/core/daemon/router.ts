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
import type { PijMessage, SessionDescriptor, SessionId } from "../types.js";

export interface BufferedMessage {
	readonly messageId: string;
	readonly message: PijMessage;
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

/** Decide how to deliver `message` to `target` (AC-07/08, R-02):
 *  - pi target              → `observe` (the thin receiver owns it);
 *  - bound tmux target      → `inject` into its pane;
 *  - unbound tmux target    → `buffer` until it binds. */
export function route(target: SessionDescriptor, message: PijMessage): RouteDecision {
	const transport = selectTransport(target.harness ?? "pi");
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

	/** Buffer a message for its target. */
	enqueue(messageId: string, message: PijMessage): void {
		const q = this.byTarget.get(message.to) ?? [];
		q.push({ messageId, message });
		this.byTarget.set(message.to, q);
	}

	/** How many messages are buffered for a target (0 if none). */
	pending(target: SessionId): number {
		return this.byTarget.get(target)?.length ?? 0;
	}

	/** Remove and return all buffered messages for a target, in arrival order. */
	flush(target: SessionId): BufferedMessage[] {
		const q = this.byTarget.get(target) ?? [];
		this.byTarget.delete(target);
		return q;
	}
}
