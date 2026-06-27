// pij-control-plane — deterministic binding + watchdog + creator notice (pure, Plan 019).
//
// The spawn→bind lifecycle is daemon-orchestrated, but every DECISION in it is
// pure and lives here: apply a discovered/confirmed binding, gate init to
// exactly-once, and run the watchdog that re-sends the confirm line once then
// fails the spawn (notifying the creator) — no silent dead spawn (AC-03/04/05).

import type { SessionDescriptor, SessionId } from "./types.js";

/** Apply a discovered/confirmed harness session id to a (pending) descriptor,
 *  producing the BOUND descriptor — the binding `pij-id ↔ harnessSessionId ↔
 *  pane ↔ cwd` the daemon persists and tails (AC-03). */
export function applyBinding(
	descriptor: SessionDescriptor,
	harnessSessionId: string,
): SessionDescriptor {
	return { ...descriptor, harnessSessionId, lifecycle: "bound" };
}

/** Init-exactly-once gate (AC-02/12): inject only when not already injected.
 *  The persisted `initInjectedAt` makes this survive a daemon restart. */
export function shouldInjectInit(descriptor: SessionDescriptor): boolean {
	return !descriptor.initInjectedAt;
}

/** Record the one-time init injection (sets the idempotency marker). The
 *  watchdog's phonehome re-send must NOT call this — it leaves the marker
 *  untouched so init stays exactly-once (AC-04). */
export function markInitInjected(descriptor: SessionDescriptor, atIso: string): SessionDescriptor {
	return { ...descriptor, initInjectedAt: atIso };
}

/** Mark a spawn that never bound as failed (watchdog terminal state, AC-04). */
export function markFailed(descriptor: SessionDescriptor): SessionDescriptor {
	return { ...descriptor, lifecycle: "failed" };
}

/** Adopt's binding rule (AC-14): `pij adopt <pane>` has NO post-spawn new-file
 *  event, so it cannot use new-path discovery. It resolves the harness session id
 *  by, in order:
 *    1. the adopting shell's own `CLAUDE_CODE_SESSION_ID` (self-adopt — the
 *       adopt CLI runs inside the agent, so its env names the live session);
 *    2. the most-recently-active transcript in the cwd (a pane-start-time proxy:
 *       the newest `*.jsonl` by mtime).
 *  Returns `null` when neither resolves — the caller then writes a `pending`
 *  descriptor and asks the adopted agent to run `pij phonehome` to confirm. */
export function resolveAdoptSessionId(
	claudeCodeSessionId: string | undefined,
	transcriptStemsNewestFirst: readonly string[],
): string | null {
	if (claudeCodeSessionId && claudeCodeSessionId.trim() !== "") return claudeCodeSessionId;
	return transcriptStemsNewestFirst[0] ?? null;
}

// ─── watchdog ────────────────────────────────────────────────────────────────

export type WatchdogDecision =
	| { readonly kind: "bound" } // already bound — stand down
	| { readonly kind: "wait" } // within the window — keep watching
	| { readonly kind: "resend-phonehome" } // timed out once — re-send the confirm line
	| { readonly kind: "fail"; readonly reason: string }; // timed out again after the re-send

export interface WatchdogInput {
	/** Has discovery or phone-home bound the session yet? */
	readonly bound: boolean;
	/** Monotonic ms when the pane became ready (the watchdog anchor). */
	readonly readyAtMs: number;
	/** Monotonic ms when the watchdog re-sent phonehome (undefined ⇒ not yet). */
	readonly resentAtMs?: number;
	/** Now (monotonic ms). */
	readonly nowMs: number;
	/** Per-stage timeout window. */
	readonly timeoutMs: number;
}

/** Decide the watchdog's next action. Before any re-send, it waits out one
 *  timeout window then asks to re-send ONLY the confirmatory phonehome line
 *  (never the init body — so `initInjectedAt`/init-once hold, AC-04). After the
 *  re-send it waits a second window, then fails. */
export function evaluateWatchdog(i: WatchdogInput): WatchdogDecision {
	if (i.bound) return { kind: "bound" };
	if (i.resentAtMs === undefined) {
		if (i.nowMs - i.readyAtMs < i.timeoutMs) return { kind: "wait" };
		return { kind: "resend-phonehome" };
	}
	if (i.nowMs - i.resentAtMs < i.timeoutMs) return { kind: "wait" };
	return {
		kind: "fail",
		reason: `no binding ${i.nowMs - i.readyAtMs}ms after ready (phonehome re-sent, still silent)`,
	};
}

// ─── creator notice ──────────────────────────────────────────────────────────

/** An async notice the daemon delivers to the session that spawned this one —
 *  the creator never blocked on the spawn, so it learns the outcome here. */
export interface CreatorNotice {
	readonly to: SessionId;
	readonly text: string;
}

/** Verification notice on a successful bind (AC-05) — `null` if there is no
 *  creator to notify (e.g. an operator-spawned session). */
export function buildBoundNotice(descriptor: SessionDescriptor): CreatorNotice | null {
	if (!descriptor.spawnedBy) return null;
	return {
		to: descriptor.spawnedBy,
		text: `✅ ${descriptor.id} is ready (bound to ${descriptor.harness ?? "?"} session ${descriptor.harnessSessionId ?? "?"}).`,
	};
}

/** Failure notice when the watchdog gives up (AC-04) — `null` if no creator. */
export function buildFailedNotice(
	descriptor: SessionDescriptor,
	reason: string,
): CreatorNotice | null {
	if (!descriptor.spawnedBy) return null;
	return {
		to: descriptor.spawnedBy,
		text: `⚠️ ${descriptor.id} failed to bind: ${reason}`,
	};
}
