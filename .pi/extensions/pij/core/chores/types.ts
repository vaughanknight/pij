export const CHORE_SCOPES = ["seat", "repo", "fleet"] as const;
export type ChoreScope = (typeof CHORE_SCOPES)[number];

export const DEFAULT_CHORE_TIMEOUT_MS = 30_000;
export const CHORE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface Chore {
	readonly scope: ChoreScope;
	readonly name: string;
	readonly probe: string;
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
}

export type ChoreStatus = "changed" | "unchanged" | "not-probeable";

export interface ChoreStateEntry {
	readonly baseline?: string;
	readonly pending?: PendingChoreDelta;
	readonly runsSinceFull: number;
	readonly lastRunAt?: string;
	readonly lastStatus?: ChoreStatus;
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
			readonly status: "changed";
			readonly old: string | null;
			readonly new: string;
	  }
	| {
			readonly status: "unchanged";
			readonly old: string;
			readonly new: string;
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
	readonly reason?: string;
	readonly fullOutput?: string;
}

export interface ChoreRunReport {
	readonly probed: number;
	readonly moved: number;
	readonly chores: readonly ChoreRunItem[];
}

export interface ChoreListItem extends Chore {
	readonly key: string;
	readonly lastRunAt?: string;
	readonly lastStatus?: ChoreStatus;
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

function isPendingDelta(value: unknown): value is PendingChoreDelta {
	return (
		isRecord(value) && (value.old === null || isFingerprint(value.old)) && isFingerprint(value.new)
	);
}

function isChoreStatus(value: unknown): value is ChoreStatus {
	return value === "changed" || value === "unchanged" || value === "not-probeable";
}

function isChoreStateEntry(value: unknown): value is ChoreStateEntry {
	return (
		isRecord(value) &&
		(value.baseline === undefined || isFingerprint(value.baseline)) &&
		(value.pending === undefined || isPendingDelta(value.pending)) &&
		isNonNegativeInteger(value.runsSinceFull) &&
		(value.lastRunAt === undefined || typeof value.lastRunAt === "string") &&
		(value.lastStatus === undefined || isChoreStatus(value.lastStatus))
	);
}

export function parseChoreState(value: unknown): ChoreState | undefined {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) return undefined;
	const entries: Record<string, ChoreStateEntry> = {};
	for (const [key, entry] of Object.entries(value.entries)) {
		if (!isChoreStateEntry(entry)) return undefined;
		entries[key] = entry;
	}
	return {
		version: 1,
		entries,
	};
}
