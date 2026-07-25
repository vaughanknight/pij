// pij-control-plane — effective context-window evidence parsed from harness footers.

import type { SessionDescriptor } from "../types.js";

export interface ContextWindowObservation {
	readonly label: string;
	readonly tokens: number;
	readonly source: "pane-footer";
}

export interface ContextWindowReaderPort {
	read(descriptor: SessionDescriptor): ContextWindowObservation | null;
}

function normalizeLabel(raw: string): { readonly label: string; readonly tokens: number } | null {
	const match = /^(\d+(?:\.\d+)?)\s*([kKmM])$/.exec(raw.trim());
	if (!match?.[1] || !match[2]) return null;
	const value = Number(match[1]);
	if (!Number.isFinite(value) || value <= 0) return null;
	const tokens = Math.round(value * (match[2].toUpperCase() === "M" ? 1_000_000 : 1_000));
	const label = expectedContextWindowLabel(tokens);
	return label === null ? null : { label, tokens };
}

/** Footer label for a catalog capacity. Matches the one-decimal million display
 * used by Pi, OMP, and Copilot CLI (1,050,000 → 1.1M). */
export function expectedContextWindowLabel(tokens: number): string | null {
	if (!Number.isFinite(tokens) || tokens <= 0) return null;
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
	return String(Math.round(tokens));
}

/** Extract the effective tier shown by a harness's own pane footer. Prefer an
 * explicit `<size> context` marker, then the denominator in `<used>/<size>`.
 * No model-table fallback: absence is an honest validation failure. */
export function contextWindowFromPane(pane: string): ContextWindowObservation | null {
	const explicit = /(\d+(?:\.\d+)?\s*[kKmM])\s+(?:token\s+)?context\b/i.exec(pane);
	const usage = /\/\s*(\d+(?:\.\d+)?\s*[kKmM])(?:\s+tokens?)?\b/i.exec(pane);
	const observation = normalizeLabel(explicit?.[1] ?? usage?.[1] ?? "");
	return observation === null ? null : { ...observation, source: "pane-footer" };
}
