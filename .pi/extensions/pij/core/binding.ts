// pij-control-plane — deterministic binding + watchdog + creator notice (pure, Plan 019).
//
// The spawn→bind lifecycle is daemon-orchestrated, but every DECISION in it is
// pure and lives here: apply a discovered/confirmed binding, gate init to
// exactly-once, and run the watchdog that re-sends the confirm line once then
// fails the spawn (notifying the creator) — no silent dead spawn (AC-03/04/05).

import { transcriptLayout } from "./harness/transcript.js";
import type { DeathReason, HarnessKind, SessionDescriptor, SessionId } from "./types.js";

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

/** Pre-resolved, newest-first adopt inputs (the impure listing/mtime-sort lives
 *  in the bin) for {@link resolveAdoptSessionIdForHarness}. */
export interface AdoptResolveInput {
	readonly harness: HarnessKind;
	/** The adopting shell's own env session id (claude: `CLAUDE_CODE_SESSION_ID`). */
	readonly envSessionId: string | undefined;
	/** Newest-first transcript STEMS in the cwd (claude's pane-start proxy). */
	readonly claudeStemsNewestFirst: readonly string[];
	/** Newest-first codex rollout ABSOLUTE paths (deep-listed, mtime-sorted). */
	readonly codexRolloutPathsNewestFirst: readonly string[];
	/** The scanned copilot session-state uuid (newest `~/.copilot/session-state/*`
	 *  by mtime), or `null` — from `copilotSessionStateScan`. NEVER a claude stem. */
	readonly copilotSessionId: string | null;
}

/** The resolved adopt binding: the harness session id (`null` ⇒ write `pending`)
 *  and, codex only, its absolute rollout path (a bare uuid can't reconstruct the
 *  date-nested path — Finding 06). */
export interface AdoptResolution {
	readonly harnessSessionId: string | null;
	/** Codex only: absolute rollout `*.jsonl` for `pij tail` (mirror `loop.ts:337`). */
	readonly transcriptPath?: string;
}

/** Harness-aware adopt resolution (findings 02/02b/03). Adopt has no post-spawn
 *  new-file event, so it resolves the harness session id per harness:
 *    - **claude** → env id else newest stem — TODAY's rule, byte-for-byte
 *      (`resolveAdoptSessionId`); the `pi` fallback shares it.
 *    - **codex** → the newest rollout's trailing UUID (`transcriptLayout('codex')
 *      .sessionIdOf`) PLUS its absolute `transcriptPath` (Finding 03).
 *    - **copilot** → the scanned `~/.copilot/session-state` uuid ONLY (Finding
 *      02b) — it NEVER falls through to the claude dir, so a claude transcript in
 *      the cwd can never mis-bind a copilot adopt.
 *  Returns `harnessSessionId: null` when a harness can't resolve — the caller
 *  writes `pending` (no crash, no wrong-harness id — AC-4). */
export function resolveAdoptSessionIdForHarness(input: AdoptResolveInput): AdoptResolution {
	switch (input.harness) {
		case "codex": {
			const path = input.codexRolloutPathsNewestFirst[0];
			if (!path) return { harnessSessionId: null };
			return {
				harnessSessionId: transcriptLayout("codex").sessionIdOf(path),
				transcriptPath: path,
			};
		}
		case "copilot":
			// finding 02b: the scanner is the ONLY source — never the claude stem.
			return { harnessSessionId: input.copilotSessionId };
		default:
			// claude (+ pi): unchanged — env id, else newest transcript stem.
			return {
				harnessSessionId: resolveAdoptSessionId(input.envSessionId, input.claudeStemsNewestFirst),
			};
	}
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

export interface DeadNoticeOptions {
	readonly authoritativeDeath?: boolean;
}

/** Stall notice for a bound session that is working but gone silent (whole-life
 *  push, T012). Includes the `boundModel` when available so the creator can see
 *  which model stalled. Returns `null` if there is no creator to notify. */
export function buildStalledNotice(descriptor: SessionDescriptor): CreatorNotice | null {
	if (!descriptor.spawnedBy) return null;
	const modelNote = descriptor.boundModel ? ` (model: ${descriptor.boundModel})` : "";
	return {
		to: descriptor.spawnedBy,
		text: `⏸ ${descriptor.id}${modelNote} has gone quiet (stalled — no activity past the stale threshold). Pane ${descriptor.paneId ?? "?"} is still alive but silent.`,
	};
}

/** Dead-session notice for a bound session whose process exited (whole-life
 *  push, T012). Includes the machine-stable `reason`. Returns `null` if no creator. */
export function buildDeadNotice(
	descriptor: SessionDescriptor,
	reason: DeathReason,
	options: DeadNoticeOptions = {},
): CreatorNotice | null {
	if (!descriptor.spawnedBy) return null;
	const modelNote = descriptor.boundModel ? ` (model: ${descriptor.boundModel})` : "";
	const authoritativeDeath = options.authoritativeDeath ?? reason === "dead";
	if (authoritativeDeath) {
		return {
			to: descriptor.spawnedBy,
			text: `💀 ${descriptor.id}${modelNote} has exited (reason: ${reason}). The session is dead and will not recover.`,
		};
	}
	return {
		to: descriptor.spawnedBy,
		text: `⚠️ ${descriptor.id}${modelNote} appears stuck on a provider error (reason: ${reason}). Pane ${descriptor.paneId ?? "?"} is still alive; check the session before treating it as dead.`,
	};
}
