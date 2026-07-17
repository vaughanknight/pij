// pij-messaging — whole-life peer watchdog decisions (pure).

import type { WatchdogPauseTier, WatchdogSidecar } from "./types.js";

// ─── watchdog configuration ─────────────────────────────────────────────────
export const DEFAULT_WATCHDOG_INTERVAL_MS = 20 * 60 * 1_000;

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
	return resumed;
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
