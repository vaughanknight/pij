import { createHash } from "node:crypto";
import {
	CHORE_VALUE_TRUNCATION_SUFFIX,
	type ChoreProbeOutcome,
	type ChoreProbeResult,
	type ChoreStateEntry,
	MAX_CHORE_VALUE_BYTES,
} from "./types.js";

export function fingerprint(output: string): string {
	return createHash("sha256").update(output.trim()).digest("hex").slice(0, 12);
}

export function fingerprintChoreDefinition(probe: string): string {
	return createHash("sha256").update(probe).digest("hex").slice(0, 12);
}

export function boundChoreValue(output: string): string {
	if (Buffer.byteLength(output, "utf8") <= MAX_CHORE_VALUE_BYTES) return output;
	let bytes = 0;
	let prefix = "";
	for (const character of output) {
		const width = Buffer.byteLength(character, "utf8");
		if (bytes + width > MAX_CHORE_VALUE_BYTES) break;
		prefix += character;
		bytes += width;
	}
	return `${prefix}${CHORE_VALUE_TRUNCATION_SUFFIX}`;
}

function unavailableValue(valueFingerprint: string): string {
	return `<value unavailable; fingerprint ${valueFingerprint}>`;
}

function pendingValueDelta(pending: NonNullable<ChoreStateEntry["pending"]>): {
	readonly old: string | null;
	readonly new: string;
	readonly oldFingerprint: string | null;
	readonly newFingerprint: string;
} {
	return {
		old: pending.old === null ? null : (pending.oldValue ?? unavailableValue(pending.old)),
		new: pending.newValue ?? unavailableValue(pending.new),
		oldFingerprint: pending.old,
		newFingerprint: pending.new,
	};
}

export function reduceProbe(
	previous: ChoreStateEntry | undefined,
	probe: ChoreProbeResult,
	now: string,
	instrument?: {
		readonly definitionFingerprint: string;
		readonly contentFingerprint: string | null;
	},
): { readonly state: ChoreStateEntry; readonly outcome: ChoreProbeOutcome } {
	const current = previous ?? { runsSinceFull: 0 };
	if (!probe.ok) {
		return {
			state: current,
			outcome: { status: "not-probeable", reason: probe.reason },
		};
	}

	const nextFingerprint = fingerprint(probe.output);
	const nextValue = boundChoreValue(probe.output);
	if (current.pendingInstrumentChange && instrument !== undefined) {
		return {
			state: {
				...current,
				definitionFingerprint: instrument.definitionFingerprint,
				instrumentFingerprint: instrument.contentFingerprint,
				pendingInstrumentChange: {
					currentValue: nextValue,
					currentFingerprint: nextFingerprint,
				},
				lastRunAt: now,
				lastStatus: "changed",
			},
			outcome: {
				status: "changed-probe",
				reason: "instrument changed; ack resets baseline",
				new: nextValue,
				newFingerprint: nextFingerprint,
				...(current.pending ? { preservedValueDelta: pendingValueDelta(current.pending) } : {}),
			},
		};
	}
	if (
		instrument !== undefined &&
		current.definitionFingerprint !== undefined &&
		current.instrumentFingerprint !== undefined &&
		(current.definitionFingerprint !== instrument.definitionFingerprint ||
			current.instrumentFingerprint !== instrument.contentFingerprint)
	) {
		return {
			state: {
				...current,
				definitionFingerprint: instrument.definitionFingerprint,
				instrumentFingerprint: instrument.contentFingerprint,
				pendingInstrumentChange: {
					currentValue: nextValue,
					currentFingerprint: nextFingerprint,
				},
				lastRunAt: now,
				lastStatus: "changed",
			},
			outcome: {
				status: "changed-probe",
				reason: "instrument changed; ack resets baseline",
				new: nextValue,
				newFingerprint: nextFingerprint,
				...(current.pending ? { preservedValueDelta: pendingValueDelta(current.pending) } : {}),
			},
		};
	}
	const instrumented =
		instrument === undefined
			? current
			: {
					...current,
					definitionFingerprint: instrument.definitionFingerprint,
					instrumentFingerprint: instrument.contentFingerprint,
				};
	if (instrumented.pending) {
		if (instrumented.baseline !== undefined && instrumented.baseline === nextFingerprint) {
			const pending = {
				old: instrumented.baseline,
				new: nextFingerprint,
				oldValue: instrumented.baselineValue ?? nextValue,
				newValue: nextValue,
			};
			return {
				state: {
					...instrumented,
					baselineValue: nextValue,
					pending,
					lastRunAt: now,
					lastStatus: "changed",
				},
				outcome: {
					status: "flapped",
					old: pending.oldValue,
					new: nextValue,
					oldFingerprint: pending.old,
					newFingerprint: nextFingerprint,
				},
			};
		}
		const pending = {
			old: instrumented.pending.old,
			new: nextFingerprint,
			oldValue:
				instrumented.pending.oldValue ??
				(instrumented.pending.old === null ? null : unavailableValue(instrumented.pending.old)),
			newValue: nextValue,
		};
		return {
			state: {
				...instrumented,
				pending,
				lastRunAt: now,
				lastStatus: "changed",
			},
			outcome: {
				status: "changed-value",
				old: pending.oldValue ?? null,
				new: pending.newValue,
				oldFingerprint: pending.old,
				newFingerprint: pending.new,
			},
		};
	}

	if (instrumented.baseline === nextFingerprint) {
		return {
			state: {
				...instrumented,
				baselineValue: nextValue,
				lastRunAt: now,
				lastStatus: "unchanged",
			},
			outcome: {
				status: "unchanged",
				old: nextValue,
				new: nextValue,
				oldFingerprint: nextFingerprint,
				newFingerprint: nextFingerprint,
			},
		};
	}

	const pending = {
		old: instrumented.baseline ?? null,
		new: nextFingerprint,
		oldValue:
			instrumented.baseline === undefined
				? null
				: (instrumented.baselineValue ?? unavailableValue(instrumented.baseline)),
		newValue: nextValue,
	};
	return {
		state: {
			...instrumented,
			pending,
			lastRunAt: now,
			lastStatus: "changed",
		},
		outcome: {
			status: "changed-value",
			old: pending.oldValue ?? null,
			new: pending.newValue,
			oldFingerprint: pending.old,
			newFingerprint: pending.new,
		},
	};
}

export function ackPending(entry: ChoreStateEntry): ChoreStateEntry {
	if (entry.pendingInstrumentChange) {
		const { pending: _pending, pendingInstrumentChange, ...rest } = entry;
		return {
			...rest,
			baseline: pendingInstrumentChange.currentFingerprint,
			baselineValue: pendingInstrumentChange.currentValue,
			lastStatus: "unchanged",
		};
	}
	if (!entry.pending) return entry;
	const { pending: _pending, ...rest } = entry;
	return {
		...rest,
		baseline: entry.pending.new,
		baselineValue: entry.pending.newValue ?? unavailableValue(entry.pending.new),
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
