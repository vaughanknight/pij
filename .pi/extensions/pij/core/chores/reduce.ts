import { createHash } from "node:crypto";
import type { ChoreProbeOutcome, ChoreProbeResult, ChoreStateEntry } from "./types.js";

export function fingerprint(output: string): string {
	return createHash("sha256").update(output.trim()).digest("hex").slice(0, 12);
}

export function reduceProbe(
	previous: ChoreStateEntry | undefined,
	probe: ChoreProbeResult,
	now: string,
): { readonly state: ChoreStateEntry; readonly outcome: ChoreProbeOutcome } {
	const current = previous ?? { runsSinceFull: 0 };
	if (!probe.ok) {
		return {
			state: current,
			outcome: { status: "not-probeable", reason: probe.reason },
		};
	}

	const next = fingerprint(probe.output);
	if (current.pending) {
		const pending = { old: current.pending.old, new: next };
		return {
			state: {
				...current,
				pending,
				lastRunAt: now,
				lastStatus: "changed",
			},
			outcome: { status: "changed", old: pending.old, new: pending.new },
		};
	}

	if (current.baseline === next) {
		return {
			state: {
				...current,
				lastRunAt: now,
				lastStatus: "unchanged",
			},
			outcome: { status: "unchanged", old: next, new: next },
		};
	}

	const pending = { old: current.baseline ?? null, new: next };
	return {
		state: {
			...current,
			pending,
			lastRunAt: now,
			lastStatus: "changed",
		},
		outcome: { status: "changed", old: pending.old, new: pending.new },
	};
}

export function ackPending(entry: ChoreStateEntry): ChoreStateEntry {
	if (!entry.pending) return entry;
	const { pending: _pending, ...rest } = entry;
	return {
		...rest,
		baseline: entry.pending.new,
		lastStatus: "unchanged",
	};
}

export function advanceFullCounter(
	entry: ChoreStateEntry,
	fullEvery: number | undefined,
): { readonly state: ChoreStateEntry; readonly due: boolean } {
	if (fullEvery === undefined) return { state: entry, due: false };
	const next = entry.runsSinceFull + 1;
	if (next >= fullEvery) {
		return { state: { ...entry, runsSinceFull: 0 }, due: true };
	}
	return { state: { ...entry, runsSinceFull: next }, due: false };
}
