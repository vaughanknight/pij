// pij-control-plane — deterministic binding + watchdog + creator notice (pure, Plan 019).
//
// The spawn→bind lifecycle is daemon-orchestrated, but every DECISION in it is
// pure and lives here: apply a discovered/confirmed binding, gate init to
// exactly-once, and run the watchdog that re-sends the confirm line once then
// fails the spawn (notifying the creator) — no silent dead spawn (AC-03/04/05).

import { isCopilotSessionId } from "./harness/copilot.js";
import { transcriptLayout } from "./harness/transcript.js";
import {
	type DeathReason,
	type DeliveryMode,
	err,
	type HarnessKind,
	ok,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "./types.js";

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
	/** UUID from validated `COPILOT_AGENT_SESSION_ID` + matching session-state metadata. */
	readonly copilotCurrentSessionId: string | null;
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
 *    - **copilot** → validated current `COPILOT_AGENT_SESSION_ID` ONLY. Global
 *      newest-by-mtime and Claude transcript fallbacks are forbidden.
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
			return {
				harnessSessionId:
					input.copilotCurrentSessionId && isCopilotSessionId(input.copilotCurrentSessionId)
						? input.copilotCurrentSessionId.toLowerCase()
						: null,
			};
		default:
			// claude (+ pi): unchanged — env id, else newest transcript stem.
			return {
				harnessSessionId: resolveAdoptSessionId(input.envSessionId, input.claudeStemsNewestFirst),
			};
	}
}

export interface PhonehomeSessionEnv {
	readonly CLAUDE_CODE_SESSION_ID?: string;
	readonly COPILOT_AGENT_SESSION_ID?: string;
	readonly CODEX_THREAD_ID?: string;
}

/** Current native identity exposed by the session's own harness process. */
export function resolvePhonehomeSessionId(
	harness: HarnessKind,
	env: PhonehomeSessionEnv,
): string | null {
	if (harness === "copilot") {
		const value = env.COPILOT_AGENT_SESSION_ID?.trim();
		return isCopilotSessionId(value) ? value.toLowerCase() : null;
	}
	if (harness === "claude") {
		const value = env.CLAUDE_CODE_SESSION_ID?.trim();
		return value || null;
	}
	if (harness === "codex") {
		const value = env.CODEX_THREAD_ID?.trim();
		return isCopilotSessionId(value) ? value.toLowerCase() : null;
	}
	return null;
}

// ─── restart-stable identity (T029 / AC-15) ────────────────────────────────

export type StableIdentityResolution =
	| { readonly kind: "claim"; readonly id: SessionId }
	| { readonly kind: "reuse"; readonly descriptor: SessionDescriptor };

/** Resolve an exact harness-native identity against durable descriptors.
 *
 * - zero exact matches → claim the deterministic candidate;
 * - one → reuse the original pij identity;
 * - many → fail loudly (never mint a third identity);
 * - candidate occupied by another tuple → collision, also fail loudly.
 *
 * A legacy untagged Pi descriptor at Pi's historical derived id is the one
 * migration exception: upgrade it in place so installing T029 does not rename
 * an existing Pi peer. */
export function resolveStableIdentity(
	descriptors: readonly SessionDescriptor[],
	harness: HarnessKind,
	harnessSessionId: string,
	candidateId: SessionId,
): Result<StableIdentityResolution> {
	const matches = descriptors.filter(
		(d) => d.harness === harness && d.harnessSessionId === harnessSessionId,
	);
	if (matches.length > 1) {
		return err(
			"E-AMBIG",
			`identity ${harness}:${harnessSessionId} maps to multiple pij ids: ${matches
				.map((d) => d.id)
				.join(", ")}`,
		);
	}
	const match = matches[0];
	if (match) return ok({ kind: "reuse", descriptor: match });

	const occupied = descriptors.find((d) => d.id === candidateId);
	if (occupied) {
		const legacyPi =
			harness === "pi" && occupied.harness === undefined && occupied.harnessSessionId === undefined;
		if (legacyPi) return ok({ kind: "reuse", descriptor: occupied });
		return err(
			"E-AMBIG",
			`derived pij id ${candidateId} is already bound to ${occupied.harness ?? "legacy"}:${occupied.harnessSessionId ?? "unknown"}`,
		);
	}
	return ok({ kind: "claim", id: candidateId });
}

export interface ReattachIdentityInput {
	readonly harness: HarnessKind;
	readonly harnessSessionId: string;
	readonly folder: string;
	readonly pid: number;
	readonly paneId?: string;
	readonly transcriptPath?: string;
	readonly deliveryMode?: DeliveryMode;
	readonly gitCommonDir?: string;
}

/** Replace one runtime incarnation's attachment data while preserving the
 * durable pij identity, history paths, creator relation, and prior metadata. */
export function reattachIdentity(
	existing: SessionDescriptor,
	input: ReattachIdentityInput,
): SessionDescriptor {
	const { failureReason: _failureReason, ...durable } = existing;
	return {
		...durable,
		folder: input.folder,
		pid: input.pid,
		state: "idle",
		paneId: input.paneId,
		harness: input.harness,
		harnessSessionId: input.harnessSessionId,
		lifecycle: "bound",
		...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
		...(input.transcriptPath !== undefined ? { transcriptPath: input.transcriptPath } : {}),
		...(input.gitCommonDir !== undefined ? { gitCommonDir: input.gitCommonDir } : {}),
	};
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
