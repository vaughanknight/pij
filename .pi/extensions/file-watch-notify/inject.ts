// inject — the in-session delivery seam (AC-02). Adapts pij's proven path
// (adapters/pi-runtime.ts:41-47): idle → sendUserMessage (starts a turn);
// busy → sendUserMessage(text, { deliverAs: "steer" }) (queued after the
// current turn). No tool call is involved — the notice arrives as a message.
//
// The decision + the port are pi-free and unit-tested with a fake; only
// makePiInjectPort imports pi.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type InjectMode = "immediate" | "steer";
export type InjectSendResult = { ok: true } | { ok: false; reason: "dropped" };
export type NoticeInput = string | { readonly text: string; readonly dedupKey?: string };

const DEFAULT_MAX_PENDING_STEERED_NOTICES = 200;

export function makeNoticeDedupKey(
	change: { readonly kind: string; readonly identityPath?: string } | undefined,
	fallbackText: string,
): string {
	if (change?.identityPath) return `${change.kind}\0${change.identityPath}`;
	return fallbackText;
}

/** Idle ⇒ immediate (start a turn); busy ⇒ steer (after the current turn). */
export function pickInjectMode(isIdle: boolean): InjectMode {
	return isIdle ? "immediate" : "steer";
}

/** What the wiring depends on — faked in tests, pi-backed in production. */
export interface InjectPort {
	isIdle(): boolean;
	send(text: string, mode: InjectMode): InjectSendResult;
}

/** Tracks file-watch notice identities already queued through Pi's steering list. */
export interface PendingSteerNotices {
	has(key: string): boolean;
	add(key: string): void;
}

/**
 * Pi's steer queue delivers after the current turn and before the next turn.
 * Keep two generations so the current turn_end does not clear notices before
 * they are consumed, while notices queued during a consuming turn survive for
 * their own next turn. The max-size cap is a bounded fallback for lifecycle
 * anomalies: once too many entries accumulate, dedup is re-armed rather than
 * suppressing notices indefinitely.
 */
export class SteeredNoticeTracker implements PendingSteerNotices {
	private awaitingConsumption = new Set<string>();
	private consuming = new Set<string>();
	private readonly maxPendingNotices: number;

	constructor(opts: { maxPendingNotices?: number } = {}) {
		this.maxPendingNotices = opts.maxPendingNotices ?? DEFAULT_MAX_PENDING_STEERED_NOTICES;
	}

	has(key: string): boolean {
		return this.awaitingConsumption.has(key) || this.consuming.has(key);
	}

	add(key: string): void {
		if (this.has(key)) return;
		if (this.pendingCount() >= this.maxPendingNotices) this.clear();
		this.awaitingConsumption.add(key);
	}

	onTurnStart(): void {
		if (this.awaitingConsumption.size === 0) return;
		this.consuming = this.awaitingConsumption;
		this.awaitingConsumption = new Set<string>();
	}

	onTurnEnd(): void {
		this.consuming.clear();
	}

	clear(): void {
		this.awaitingConsumption.clear();
		this.consuming.clear();
	}

	private pendingCount(): number {
		return this.awaitingConsumption.size + this.consuming.size;
	}
}

/**
 * Deliver a wake's notices as a SINGLE message (no per-file spam, AC-05),
 * choosing the mode once from the current idle state. When steering, suppress
 * notice lines already queued in the steering list so rapid file events don't
 * append duplicate `[file-watch] ...` entries while the model is busy. Returns
 * the mode used (or null if nothing to deliver after filtering).
 */
export function deliverNotices(
	port: InjectPort,
	notices: NoticeInput[],
	pendingSteers?: PendingSteerNotices,
): InjectMode | null {
	if (notices.length === 0) return null;
	const mode = pickInjectMode(port.isIdle());
	const prepared = notices.map((notice) =>
		typeof notice === "string"
			? { text: notice, dedupKey: notice }
			: { text: notice.text, dedupKey: notice.dedupKey ?? notice.text },
	);
	const deliverable =
		mode === "steer" && pendingSteers
			? filterPendingSteerNotices(prepared, pendingSteers)
			: prepared;
	if (deliverable.length === 0) return null;
	const sendResult = port.send(deliverable.map((notice) => notice.text).join("\n"), mode);
	if (!sendResult.ok) return null;
	if (mode === "steer" && pendingSteers) {
		for (const notice of deliverable) pendingSteers.add(notice.dedupKey);
	}
	return mode;
}

function filterPendingSteerNotices(
	notices: Array<{ text: string; dedupKey: string }>,
	pendingSteers: PendingSteerNotices,
): Array<{ text: string; dedupKey: string }> {
	const seen = new Set<string>();
	const deliverable: Array<{ text: string; dedupKey: string }> = [];
	for (const notice of notices) {
		if (pendingSteers.has(notice.dedupKey)) continue;
		if (seen.has(notice.dedupKey)) continue;
		seen.add(notice.dedupKey);
		deliverable.push(notice);
	}
	return deliverable;
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
		// No live ctx (or a stale ctx after reload/session replacement) ⇒ treat as
		// busy so the notice is steered, never an unsolicited immediate turn. Watcher
		// callbacks are async and must never crash pi if they outlive their ctx.
		isIdle: () => {
			try {
				return getCtx()?.isIdle() ?? false;
			} catch {
				return false;
			}
		},
		send: (text, mode) => {
			try {
				if (mode === "steer") pi.sendUserMessage(text, { deliverAs: "steer" });
				else pi.sendUserMessage(text);
				return { ok: true };
			} catch {
				// Stale post-reload delivery: drop the obsolete wake rather than bringing
				// down the host process. A fresh watcher will be armed by session_start.
				return { ok: false, reason: "dropped" };
			}
		},
	};
}
