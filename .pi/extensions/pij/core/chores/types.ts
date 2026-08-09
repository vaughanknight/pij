export const CHORE_SCOPES = ["seat", "repo", "fleet"] as const;
export type ChoreScope = (typeof CHORE_SCOPES)[number];

export const DEFAULT_CHORE_TIMEOUT_MS = 30_000;
export const MAX_CHORE_VALUE_BYTES = 4_096;
export const CHORE_VALUE_TRUNCATION_SUFFIX = "…[truncated]";
export const CHORE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface Chore {
	readonly scope: ChoreScope;
	readonly name: string;
	readonly probe: string;
	readonly creatorSeatId?: string;
	readonly full?: string;
	readonly fullEvery?: number;
	readonly timeoutMs: number;
}

export interface ChoreRemovalRecord {
	readonly scope: ChoreScope;
	readonly name: string;
	readonly reason: string;
	readonly removedAt: string;
}

export interface ChoreRoster {
	readonly version: 1;
	readonly chores: readonly Chore[];
	readonly removals: readonly ChoreRemovalRecord[];
}

export type ChoreRosterStatus = "ok" | "missing" | "malformed" | "unavailable";

export interface ChoreScopeSource {
	readonly scope: ChoreScope;
	readonly status: ChoreRosterStatus;
	readonly chores: readonly Chore[];
	readonly reason?: string;
}

export interface PendingChoreDelta {
	readonly old: string | null;
	readonly new: string;
	readonly oldValue?: string | null;
	readonly newValue?: string;
}

export interface PendingInstrumentChange {
	readonly currentValue: string;
	readonly currentFingerprint: string;
}

export type ChoreStatus =
	| "changed-value"
	| "changed-probe"
	| "flapped"
	| "unchanged"
	| "not-probeable";
export type StoredChoreStatus = "changed" | "unchanged" | "not-probeable";

export interface ChoreStateEntry {
	readonly baseline?: string;
	readonly baselineValue?: string;
	readonly definitionFingerprint?: string;
	readonly instrumentFingerprint?: string | null;
	readonly pending?: PendingChoreDelta;
	readonly pendingInstrumentChange?: PendingInstrumentChange;
	readonly runsSinceFull: number;
	readonly lastRunAt?: string;
	readonly lastStatus?: StoredChoreStatus;
}

export interface ChoreState {
	readonly version: 1;
	readonly entries: Readonly<Record<string, ChoreStateEntry>>;
}

export type ChoreProbeResult =
	| { readonly ok: true; readonly output: string }
	| { readonly ok: false; readonly reason: string };

export type ChoreProbeOutcome =
	| {
			readonly status: "changed-value";
			readonly old: string | null;
			readonly new: string;
			readonly oldFingerprint: string | null;
			readonly newFingerprint: string;
	  }
	| {
			readonly status: "flapped";
			readonly old: string;
			readonly new: string;
			readonly oldFingerprint: string;
			readonly newFingerprint: string;
	  }
	| {
			readonly status: "unchanged";
			readonly old: string;
			readonly new: string;
			readonly oldFingerprint: string;
			readonly newFingerprint: string;
	  }
	| {
			readonly status: "changed-probe";
			readonly reason: string;
			readonly new: string;
			readonly newFingerprint: string;
			readonly preservedValueDelta?: {
				readonly old: string | null;
				readonly new: string;
				readonly oldFingerprint: string | null;
				readonly newFingerprint: string;
			};
	  }
	| {
			readonly status: "not-probeable";
			readonly reason: string;
	  };

export interface ChoreRunItem {
	readonly scope: ChoreScope;
	readonly name: string;
	readonly status: ChoreStatus;
	readonly old: string | null;
	readonly new: string | null;
	readonly oldFingerprint: string | null;
	readonly newFingerprint: string | null;
	readonly reason?: string;
	readonly preservedValueDelta?: {
		readonly old: string | null;
		readonly new: string;
		readonly oldFingerprint: string | null;
		readonly newFingerprint: string;
	};
	readonly fullConfigured?: boolean;
	readonly fullOutput?: string;
}

export interface ChoreRunReport {
	readonly probed: number;
	readonly moved: number;
	readonly chores: readonly ChoreRunItem[];
}

export interface ChoreScopeSummary {
	readonly seat: string | null;
	readonly repo: string | null;
	readonly fleet: string;
}

export interface ChoreListItem extends Chore {
	readonly key: string;
	readonly lastRunAt?: string;
	readonly lastStatus?: StoredChoreStatus;
	readonly pending?: PendingChoreDelta;
	readonly baseline?: string;
}

export interface ChoreStorePort {
	rosterPath(scope: ChoreScope): string | undefined;
	rosterStatus(scope: ChoreScope): ChoreRosterStatus;
	readRoster(scope: ChoreScope): ChoreRoster | undefined;
	writeRoster(scope: ChoreScope, roster: ChoreRoster): void;
	statePath(): string | undefined;
	stateStatus(): ChoreRosterStatus;
	readState(): ChoreState | undefined;
	writeState(state: ChoreState): void;
}

export interface ChoreProbePort {
	run(command: string, cwd: string, timeoutMs: number): ChoreProbeResult;
	instrumentFingerprint?(command: string, cwd: string): string | null;
}

export function isChoreScope(value: unknown): value is ChoreScope {
	return typeof value === "string" && (CHORE_SCOPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isChore(value: unknown): value is Chore {
	if (!isRecord(value)) return false;
	if (!isChoreScope(value.scope)) return false;
	if (typeof value.name !== "string" || !CHORE_NAME_RE.test(value.name)) return false;
	if (typeof value.probe !== "string" || value.probe.trim() === "") return false;
	if (
		value.creatorSeatId !== undefined &&
		(typeof value.creatorSeatId !== "string" || value.creatorSeatId.trim() === "")
	) {
		return false;
	}
	if (typeof value.timeoutMs !== "number" || !Number.isFinite(value.timeoutMs)) return false;
	if (value.timeoutMs <= 0) return false;
	if (value.full !== undefined && (typeof value.full !== "string" || value.full.trim() === "")) {
		return false;
	}
	if (value.fullEvery !== undefined && !isPositiveInteger(value.fullEvery)) return false;
	return value.full !== undefined || value.fullEvery === undefined;
}

export function isChoreRemovalRecord(value: unknown): value is ChoreRemovalRecord {
	return (
		isRecord(value) &&
		isChoreScope(value.scope) &&
		typeof value.name === "string" &&
		CHORE_NAME_RE.test(value.name) &&
		typeof value.reason === "string" &&
		value.reason.trim() !== "" &&
		typeof value.removedAt === "string"
	);
}

export function parseChoreRoster(value: unknown): ChoreRoster | undefined {
	if (!isRecord(value) || value.version !== 1) return undefined;
	if (!Array.isArray(value.chores) || !value.chores.every(isChore)) return undefined;
	if (!Array.isArray(value.removals) || !value.removals.every(isChoreRemovalRecord)) {
		return undefined;
	}
	const claimed = new Set<string>();
	for (const chore of value.chores) {
		if (claimed.has(chore.name)) return undefined;
		claimed.add(chore.name);
	}
	return {
		version: 1,
		chores: value.chores,
		removals: value.removals,
	};
}

function isFingerprint(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{12}$/.test(value);
}

function parsePendingDelta(value: unknown): PendingChoreDelta | undefined {
	if (!isRecord(value)) return undefined;
	if (
		(value.old === null || isFingerprint(value.old)) &&
		isFingerprint(value.new) &&
		(value.oldValue === undefined ||
			value.oldValue === null ||
			typeof value.oldValue === "string") &&
		(value.newValue === undefined || typeof value.newValue === "string")
	) {
		return {
			old: value.old,
			new: value.new,
			...(value.oldValue !== undefined ? { oldValue: value.oldValue } : {}),
			...(value.newValue !== undefined ? { newValue: value.newValue } : {}),
		};
	}
	if (
		(value.old === null || typeof value.old === "string") &&
		typeof value.new === "string" &&
		(value.oldFingerprint === null || isFingerprint(value.oldFingerprint)) &&
		isFingerprint(value.newFingerprint)
	) {
		return {
			old: value.oldFingerprint,
			new: value.newFingerprint,
			oldValue: value.old,
			newValue: value.new,
		};
	}
	return undefined;
}

function parsePendingInstrumentChange(value: unknown): PendingInstrumentChange | undefined {
	if (
		!isRecord(value) ||
		typeof value.currentValue !== "string" ||
		!isFingerprint(value.currentFingerprint)
	) {
		return undefined;
	}
	return {
		currentValue: value.currentValue,
		currentFingerprint: value.currentFingerprint,
	};
}

function isStoredChoreStatus(value: unknown): value is StoredChoreStatus {
	return value === "changed" || value === "unchanged" || value === "not-probeable";
}

function parseChoreStateEntry(value: unknown): ChoreStateEntry | undefined {
	if (!isRecord(value)) return undefined;
	if (value.baseline !== undefined && !isFingerprint(value.baseline)) return undefined;
	if (value.baselineValue !== undefined && typeof value.baselineValue !== "string")
		return undefined;
	const instrumentFingerprint = value.instrumentFingerprint;
	if (value.definitionFingerprint !== undefined && !isFingerprint(value.definitionFingerprint)) {
		return undefined;
	}
	if (
		instrumentFingerprint !== undefined &&
		instrumentFingerprint !== null &&
		!isFingerprint(instrumentFingerprint)
	) {
		return undefined;
	}
	const pending = value.pending === undefined ? undefined : parsePendingDelta(value.pending);
	if (value.pending !== undefined && pending === undefined) return undefined;
	const pendingInstrumentChange =
		value.pendingInstrumentChange === undefined
			? undefined
			: parsePendingInstrumentChange(value.pendingInstrumentChange);
	if (value.pendingInstrumentChange !== undefined && pendingInstrumentChange === undefined) {
		return undefined;
	}
	if (!isNonNegativeInteger(value.runsSinceFull)) return undefined;
	if (value.lastRunAt !== undefined && typeof value.lastRunAt !== "string") return undefined;
	const lastStatus = isStoredChoreStatus(value.lastStatus) ? value.lastStatus : undefined;
	return {
		...(value.baseline !== undefined ? { baseline: value.baseline } : {}),
		...(value.baselineValue !== undefined ? { baselineValue: value.baselineValue } : {}),
		...(value.definitionFingerprint !== undefined
			? { definitionFingerprint: value.definitionFingerprint }
			: {}),
		...(instrumentFingerprint !== undefined ? { instrumentFingerprint } : {}),
		...(pending !== undefined ? { pending } : {}),
		...(pendingInstrumentChange !== undefined ? { pendingInstrumentChange } : {}),
		runsSinceFull: value.runsSinceFull,
		...(value.lastRunAt !== undefined ? { lastRunAt: value.lastRunAt } : {}),
		...(lastStatus !== undefined ? { lastStatus } : {}),
	};
}

export function parseChoreState(value: unknown): ChoreState | undefined {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) return undefined;
	const entries: Record<string, ChoreStateEntry> = {};
	for (const [key, entry] of Object.entries(value.entries)) {
		const parsed = parseChoreStateEntry(entry);
		if (!parsed) return undefined;
		entries[key] = parsed;
	}
	return {
		version: 1,
		entries,
	};
}
