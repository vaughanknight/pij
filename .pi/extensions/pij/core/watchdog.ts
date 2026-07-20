// pij-messaging — whole-life peer watchdog decisions (pure).

import type { WatchdogPauseTier, WatchdogSidecar } from "./types.js";

// ─── watchdog configuration ─────────────────────────────────────────────────
export const DEFAULT_WATCHDOG_INTERVAL_MS = 20 * 60 * 1_000;
/** A safety exemption is deliberately temporary: a daemon restart must never
 * turn one incident response into permanent watchdog blindness. */
export const DEFAULT_WATCHDOG_EXEMPT_TTL_MS = 60 * 60 * 1_000;

export interface EffectiveWatchdogConfig {
	readonly enabled: boolean;
	readonly intervalMs: number;
	readonly pausedBy: WatchdogPauseTier | undefined;
}

/** Resolve a migration-safe watchdog configuration. No sidecar means default-on. */
export function effectiveWatchdog(sidecar?: WatchdogSidecar): EffectiveWatchdogConfig {
	const requestedInterval = sidecar?.intervalMs;
	const intervalMs =
		requestedInterval !== undefined && Number.isFinite(requestedInterval) && requestedInterval > 0
			? requestedInterval
			: DEFAULT_WATCHDOG_INTERVAL_MS;
	return {
		enabled: sidecar?.enabled ?? true,
		intervalMs,
		pausedBy: sidecar?.pausedBy,
	};
}

function withoutPause(sidecar: WatchdogSidecar): WatchdogSidecar {
	const resumed = { ...sidecar };
	delete resumed.pausedBy;
	delete resumed.pausedAtMs;
	delete resumed.exemptUntilMs;
	return resumed;
}

/** Create a bounded incident exemption. Callers share this seam so CLI and
 * PIJ_NO_WATCHDOG boot can never disagree about the re-arm deadline. */
export function applyWatchdogExemption(
	sidecar: WatchdogSidecar | undefined,
	nowMs: number,
	ttlMs = DEFAULT_WATCHDOG_EXEMPT_TTL_MS,
): WatchdogSidecar {
	const duration =
		Number.isSafeInteger(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_WATCHDOG_EXEMPT_TTL_MS;
	const deadline = nowMs + duration;
	const validDeadline =
		Number.isSafeInteger(nowMs) && Number.isSafeInteger(deadline) && deadline > nowMs;
	return {
		...sidecar,
		pausedBy: "exempt",
		pausedAtMs: nowMs,
		exemptUntilMs: validDeadline ? deadline : 0,
	};
}

export interface WatchdogExemptionReconciliation {
	readonly sidecar: WatchdogSidecar | undefined;
	readonly effectivePause: WatchdogPauseTier | undefined;
}

/** Normalize an exemption against an injected clock. Legacy sidecars acquire a
 * one-time deadline; malformed time fails closed so safety-off is never extended. */
export function reconcileWatchdogExemption(
	sidecar: WatchdogSidecar | undefined,
	nowMs: number,
): WatchdogExemptionReconciliation {
	if (!sidecar) return { sidecar: undefined, effectivePause: undefined };
	if (sidecar.pausedBy !== "exempt") {
		if (sidecar.exemptUntilMs === undefined) {
			return { sidecar, effectivePause: sidecar.pausedBy };
		}
		const normalized = { ...sidecar };
		delete normalized.exemptUntilMs;
		return { sidecar: normalized, effectivePause: normalized.pausedBy };
	}

	const deadline = sidecar.exemptUntilMs;
	if (deadline !== undefined) {
		if (Number.isSafeInteger(deadline) && Number.isSafeInteger(nowMs) && nowMs < deadline) {
			return { sidecar, effectivePause: "exempt" };
		}
		const normalized = withoutPause(sidecar);
		return { sidecar: normalized, effectivePause: undefined };
	}

	const pausedAtMs = sidecar.pausedAtMs;
	const legacyDeadline =
		typeof pausedAtMs === "number" && Number.isSafeInteger(pausedAtMs)
			? pausedAtMs + DEFAULT_WATCHDOG_EXEMPT_TTL_MS
			: Number.NaN;
	if (
		Number.isSafeInteger(legacyDeadline) &&
		Number.isSafeInteger(nowMs) &&
		nowMs < legacyDeadline
	) {
		return {
			sidecar: { ...sidecar, exemptUntilMs: legacyDeadline },
			effectivePause: "exempt",
		};
	}
	const normalized = withoutPause(sidecar);
	return { sidecar: normalized, effectivePause: undefined };
}

/** Apply the explicit `pij watchdog resume` transition. Exemptions are stronger. */
export function applyWatchdogResume(sidecar: WatchdogSidecar): WatchdogSidecar {
	if (sidecar.pausedBy === "exempt" || sidecar.pausedBy === undefined) return sidecar;
	return withoutPause(sidecar);
}

/** Compact pauses resume automatically only when a real working transition occurs. */
export function applyWorkingTransition(sidecar: WatchdogSidecar): WatchdogSidecar {
	return sidecar.pausedBy === "compact" ? withoutPause(sidecar) : sidecar;
}

/** Shared pure seam used before either local or remote compact delivery. */
export function applyCompactPause(
	sidecar: WatchdogSidecar | undefined,
	nowMs: number,
): WatchdogSidecar {
	if (sidecar?.pausedBy !== undefined) return sidecar;
	return { ...sidecar, pausedBy: "compact", pausedAtMs: nowMs };
}

// ─── scheduler ──────────────────────────────────────────────────────────────
/**
 * A fire is due one full interval after the newest real activity or delivered
 * fire. Activity re-anchors the schedule; during a freeze each delivered fire
 * becomes the next anchor, so periodic turns continue rather than collapsing.
 */
export function isFireDue(
	cfg: EffectiveWatchdogConfig,
	lastFireAt: number | null,
	lastEventAt: number | null,
	nowMs: number,
): boolean {
	if (!cfg.enabled || cfg.pausedBy !== undefined) return false;
	const anchors = [lastFireAt, lastEventAt].filter(
		(value): value is number => value !== null && Number.isFinite(value),
	);
	if (anchors.length === 0) return false;
	return nowMs - Math.max(...anchors) >= cfg.intervalMs;
}

// ─── response derivation ────────────────────────────────────────────────────
export type WatchdogResponse = "responsive" | "suspect" | "stalled";

/** Pane-derived inputs are absent for paneless peers. Watchdog-only changes are
 * explicit so the observer's own injected turn cannot fabricate recovery. */
export interface WatchdogPaneObservation {
	readonly changed: boolean;
	readonly workingTransition: boolean;
	readonly changeWasWatchdog?: boolean;
	readonly workingTransitionWasWatchdog?: boolean;
}

export interface WatchdogResponseInputs {
	readonly cfg: EffectiveWatchdogConfig;
	readonly consecutiveSilentFires: number;
	readonly eventAdvanced: boolean;
	readonly eventAdvanceWasWatchdog?: boolean;
	readonly pane?: WatchdogPaneObservation;
}

/** Derive response health from delivered fires and independently observed work. */
export function evaluateResponse(inputs: WatchdogResponseInputs): WatchdogResponse {
	if (!inputs.cfg.enabled || inputs.cfg.pausedBy !== undefined) return "responsive";

	const realEventAdvance = inputs.eventAdvanced && !inputs.eventAdvanceWasWatchdog;
	const realPaneChange = inputs.pane?.changed === true && !inputs.pane.changeWasWatchdog;
	const realWorkingTransition =
		inputs.pane?.workingTransition === true && !inputs.pane.workingTransitionWasWatchdog;
	if (realEventAdvance || realPaneChange || realWorkingTransition) return "responsive";
	if (inputs.consecutiveSilentFires >= 2) return "stalled";
	if (inputs.consecutiveSilentFires === 1) return "suspect";
	return "responsive";
}

// ─── self-teaching watchdog turn ────────────────────────────────────────────
export interface WatchdogTurnConfig extends EffectiveWatchdogConfig {
	readonly paneAvailable?: boolean;
}

export function buildWatchdogTurn(id: string, ordinal: number, cfg: WatchdogTurnConfig): string {
	const turn =
		`[pij watchdog #${ordinal} for ${id}] Keep going if working. ` +
		`If done, pause me with \`pij watchdog pause ${id}\`; ` +
		`resume with \`pij watchdog resume ${id}\`.`;
	return cfg.paneAvailable === false
		? `${turn} Pane capture unavailable; watching event activity only.`
		: turn;
}

// ─── bounded pane capture ───────────────────────────────────────────────────
export type CaptureMode = "anomaly" | "always" | "never";

export interface CapturePolicy {
	readonly mode?: CaptureMode;
	readonly maxLines?: number;
	readonly maxBytes?: number;
}

export const DEFAULT_CAPTURE_LINES = 40;
export const DEFAULT_CAPTURE_BYTES = 4_096;
export const MAX_CAPTURE_LINES = 200;
export const MAX_CAPTURE_BYTES = 16_384;

export function shouldCapture(policy: CapturePolicy, anomaly: boolean): boolean {
	switch (policy.mode ?? "anomaly") {
		case "always":
			return true;
		case "never":
			return false;
		case "anomaly":
			return anomaly;
	}
}

function boundedCap(requested: number | undefined, fallback: number, ceiling: number): number {
	if (requested === undefined || Number.isNaN(requested)) return fallback;
	if (requested === Number.POSITIVE_INFINITY) return ceiling;
	return Math.max(0, Math.min(ceiling, Math.floor(requested)));
}

const UTF8_ENCODER = new TextEncoder();

function utf8Length(value: string): number {
	return UTF8_ENCODER.encode(value).byteLength;
}

/** Return a UTF-8-safe suffix whose line and byte limits are both satisfied. */
export function captureSlice(paneText: string, policy: CapturePolicy): string {
	if (paneText.length === 0) return "";
	const maxLines = boundedCap(policy.maxLines, DEFAULT_CAPTURE_LINES, MAX_CAPTURE_LINES);
	const maxBytes = boundedCap(policy.maxBytes, DEFAULT_CAPTURE_BYTES, MAX_CAPTURE_BYTES);
	if (maxLines === 0 || maxBytes === 0) return "";

	const lineTail = paneText.split("\n").slice(-maxLines).join("\n");
	if (utf8Length(lineTail) <= maxBytes) return lineTail;

	const codePoints = Array.from(lineTail);
	let usedBytes = 0;
	let firstIncluded = codePoints.length;
	for (let index = codePoints.length - 1; index >= 0; index -= 1) {
		const width = utf8Length(codePoints[index] ?? "");
		if (usedBytes + width > maxBytes) break;
		usedBytes += width;
		firstIncluded = index;
	}
	return codePoints.slice(firstIncluded).join("");
}

/** Parse a watchdog interval from a human string to milliseconds (Plan 056).
 *  Accepts `<n>s`/`<n>m`/`<n>h` or a bare integer of milliseconds. Returns null
 *  for anything non-positive, fractional, or malformed — the caller reports the
 *  usage error. Makes `pij watchdog interval <id> 20m` ergonomic. */
export function parseWatchdogInterval(text: string): number | null {
	const match = /^(\d+)(ms|s|m|h)?$/.exec(text.trim());
	if (!match) return null;
	const value = Number(match[1]);
	if (!Number.isSafeInteger(value) || value <= 0) return null;
	const unitMs = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 } as const;
	const unit = (match[2] ?? "ms") as keyof typeof unitMs;
	const intervalMs = value * unitMs[unit];
	return Number.isSafeInteger(intervalMs) && intervalMs > 0 ? intervalMs : null;
}

// ─── human-readable state ───────────────────────────────────────────────────

/** What the watchdog is actually DOING, in words a reader can act on.
 *
 * The status line used to render `enabled · self` for a successful pause: the
 * word "paused" never appeared, and the tier sat in an unlabelled positional
 * field. `enabled` describes configuration; a reader asking "did my pause land?"
 * needs behaviour. This says the behaviour — and, in priority order, the two
 * states that dominate the per-session config (Plan 056): a globally-disabled
 * runtime and a relay/bridge that is never watched. */
export function describeWatchdogState(state: {
	enabled: boolean;
	pausedBy?: WatchdogPauseTier | null;
	globallyDisabled?: boolean;
	relay?: boolean;
}): string {
	if (state.globallyDisabled) return "globally-disabled";
	if (state.relay) return "relay (never watched)";
	if (!state.enabled) return "disabled";
	if (state.pausedBy === "exempt") return "exempt";
	if (state.pausedBy) return `paused (${state.pausedBy})`;
	return "watching";
}
