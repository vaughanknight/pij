import type {
	MinihWorkbenchPersistence,
	PersistenceResult,
	PushOptInValue,
	SeenCursorKey,
	SeenCursorValue,
	WorkbenchAuditRecord,
} from "./persistence.js";
import type { MinihRunRef } from "./store.js";

export const MINIH_WORKBENCH_SESSION_CUSTOM_TYPE = "minih-workbench.persistence.v1";

export interface SessionPersistenceEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

interface SessionPersistenceActions {
	getEntries(): readonly SessionPersistenceEntry[];
	appendEntry(customType: string, data?: unknown): void;
}

type PersistenceEvent =
	| { version: 1; op: "selected:set"; run: MinihRunRef }
	| { version: 1; op: "selected:clear" }
	| { version: 1; op: "cursor:advance"; value: SeenCursorValue }
	| { version: 1; op: "push:set"; value: PushOptInValue }
	| { version: 1; op: "audit:record"; record: WorkbenchAuditRecord }
	| { version: 1; op: "reset"; createdAt: string };

interface ProjectedState {
	selectedRun?: MinihRunRef;
	cursors: Map<string, SeenCursorValue>;
	pushOptIns: Map<string, PushOptInValue>;
	audit: WorkbenchAuditRecord[];
}

function ok<T>(value: T): PersistenceResult<T> {
	return { ok: true, value };
}

function error(message: string): PersistenceResult<never> {
	return { ok: false, code: "PERSISTENCE_WRITE_FAILED", message };
}

function messageFromUnknown(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
	const value = record[key];
	return typeof value === "boolean" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" ? value : undefined;
}

function cloneRun(run: MinihRunRef): MinihRunRef {
	return { slug: run.slug, runId: run.runId };
}

function cloneCursor(value: SeenCursorValue): SeenCursorValue {
	return {
		slug: value.slug,
		runId: value.runId,
		source: value.source,
		channel: value.channel,
		cursor: value.cursor,
		updatedAt: value.updatedAt,
	};
}

function clonePushOptIn(value: PushOptInValue): PushOptInValue {
	return {
		slug: value.slug,
		runId: value.runId,
		enabled: value.enabled,
		updatedAt: value.updatedAt,
	};
}

function cloneAudit(record: WorkbenchAuditRecord): WorkbenchAuditRecord {
	return {
		id: record.id,
		kind: record.kind,
		action: record.action,
		status: record.status,
		createdAt: record.createdAt,
		run: record.run ? cloneRun(record.run) : undefined,
		message: record.message,
		metadata: record.metadata ? { ...record.metadata } : undefined,
	};
}

function runKey(run: MinihRunRef): string {
	return `${run.slug}\u0000${run.runId}`;
}

function cursorKey(key: SeenCursorKey): string {
	return `${runKey(key)}\u0000${key.source}\u0000${key.channel ?? ""}`;
}

function parseRun(value: unknown): MinihRunRef | undefined {
	if (!isRecord(value)) return undefined;
	const slug = stringField(value, "slug");
	const runId = stringField(value, "runId");
	return slug && runId ? { slug, runId } : undefined;
}

function parseCursor(value: unknown): SeenCursorValue | undefined {
	if (!isRecord(value)) return undefined;
	const run = parseRun(value);
	const source = stringField(value, "source");
	const cursor = stringField(value, "cursor");
	const updatedAt = stringField(value, "updatedAt");
	if (!run || !source || !cursor || !updatedAt) return undefined;
	if (!["events", "inside", "outside", "report", "push"].includes(source)) return undefined;
	return {
		...run,
		source: source as SeenCursorValue["source"],
		channel: stringField(value, "channel"),
		cursor,
		updatedAt,
	};
}

function parsePushOptIn(value: unknown): PushOptInValue | undefined {
	if (!isRecord(value)) return undefined;
	const run = parseRun(value);
	const enabled = booleanField(value, "enabled");
	const updatedAt = stringField(value, "updatedAt");
	return run && enabled !== undefined && updatedAt ? { ...run, enabled, updatedAt } : undefined;
}

function parseMetadata(value: unknown): WorkbenchAuditRecord["metadata"] {
	if (!isRecord(value)) return undefined;
	const metadata: WorkbenchAuditRecord["metadata"] = {};
	for (const [key, entry] of Object.entries(value)) {
		if (
			typeof entry === "string" ||
			typeof entry === "number" ||
			typeof entry === "boolean" ||
			entry === null
		) {
			metadata[key] = entry;
		}
	}
	return metadata;
}

function parseAudit(value: unknown): WorkbenchAuditRecord | undefined {
	if (!isRecord(value)) return undefined;
	const id = stringField(value, "id");
	const kind = stringField(value, "kind");
	const action = stringField(value, "action");
	const status = stringField(value, "status");
	const createdAt = stringField(value, "createdAt");
	if (!id || !kind || !action || !status || !createdAt) return undefined;
	if (!["intent", "outcome", "cursor", "diagnostic"].includes(kind)) return undefined;
	if (!["accepted", "rejected", "unavailable", "succeeded", "failed"].includes(status)) {
		return undefined;
	}
	return {
		id,
		kind: kind as WorkbenchAuditRecord["kind"],
		action,
		status: status as WorkbenchAuditRecord["status"],
		createdAt,
		run: parseRun(value.run),
		message: stringField(value, "message"),
		metadata: parseMetadata(value.metadata),
	};
}

function parseEvent(value: unknown): PersistenceEvent | undefined {
	if (!isRecord(value) || numberField(value, "version") !== 1) return undefined;
	const op = stringField(value, "op");
	if (op === "selected:set") {
		const run = parseRun(value.run);
		return run ? { version: 1, op, run } : undefined;
	}
	if (op === "selected:clear") return { version: 1, op };
	if (op === "cursor:advance") {
		const cursor = parseCursor(value.value);
		return cursor ? { version: 1, op, value: cursor } : undefined;
	}
	if (op === "push:set") {
		const push = parsePushOptIn(value.value);
		return push ? { version: 1, op, value: push } : undefined;
	}
	if (op === "audit:record") {
		const record = parseAudit(value.record);
		return record ? { version: 1, op, record } : undefined;
	}
	if (op === "reset") {
		const createdAt = stringField(value, "createdAt");
		return createdAt ? { version: 1, op, createdAt } : undefined;
	}
	return undefined;
}

function isWorkbenchEntry(entry: SessionPersistenceEntry): boolean {
	return entry.type === "custom" && entry.customType === MINIH_WORKBENCH_SESSION_CUSTOM_TYPE;
}

function emptyProjectedState(): ProjectedState {
	return { cursors: new Map(), pushOptIns: new Map(), audit: [] };
}

export class SessionMinihWorkbenchPersistence implements MinihWorkbenchPersistence {
	constructor(private readonly actions: SessionPersistenceActions) {}

	getSelectedRun(): PersistenceResult<MinihRunRef | undefined> {
		const selected = this.project().selectedRun;
		return ok(selected ? cloneRun(selected) : undefined);
	}

	setSelectedRun(run: MinihRunRef): PersistenceResult<MinihRunRef> {
		const cloned = cloneRun(run);
		const written = this.append({ version: 1, op: "selected:set", run: cloned });
		return written.ok ? ok(cloneRun(cloned)) : written;
	}

	clearSelectedRun(): PersistenceResult<undefined> {
		return this.append({ version: 1, op: "selected:clear" });
	}

	resetForNewSession(createdAt: string): PersistenceResult<undefined> {
		return this.append({ version: 1, op: "reset", createdAt });
	}

	getSeenCursor(key: SeenCursorKey): PersistenceResult<SeenCursorValue | undefined> {
		const value = this.project().cursors.get(cursorKey(key));
		return ok(value ? cloneCursor(value) : undefined);
	}

	advanceSeenCursor(value: SeenCursorValue): PersistenceResult<SeenCursorValue> {
		const cloned = cloneCursor(value);
		const written = this.append({ version: 1, op: "cursor:advance", value: cloned });
		return written.ok ? ok(cloneCursor(cloned)) : written;
	}

	getPushOptIn(run: MinihRunRef): PersistenceResult<PushOptInValue | undefined> {
		const value = this.project().pushOptIns.get(runKey(run));
		return ok(value ? clonePushOptIn(value) : undefined);
	}

	setPushOptIn(value: PushOptInValue): PersistenceResult<PushOptInValue> {
		const cloned = clonePushOptIn(value);
		const written = this.append({ version: 1, op: "push:set", value: cloned });
		return written.ok ? ok(clonePushOptIn(cloned)) : written;
	}

	recordAudit(record: WorkbenchAuditRecord): PersistenceResult<WorkbenchAuditRecord> {
		const cloned = cloneAudit(record);
		const written = this.append({ version: 1, op: "audit:record", record: cloned });
		return written.ok ? ok(cloneAudit(cloned)) : written;
	}

	listAudit(): PersistenceResult<WorkbenchAuditRecord[]> {
		return ok(this.project().audit.map((record) => cloneAudit(record)));
	}

	private append(event: PersistenceEvent): PersistenceResult<undefined> {
		try {
			this.actions.appendEntry(MINIH_WORKBENCH_SESSION_CUSTOM_TYPE, event);
			return ok(undefined);
		} catch (reason) {
			return error(`minih-workbench session persistence failed: ${messageFromUnknown(reason)}`);
		}
	}

	private project(): ProjectedState {
		let state = emptyProjectedState();
		for (const entry of this.actions.getEntries()) {
			if (!isWorkbenchEntry(entry)) continue;
			const event = parseEvent(entry.data);
			if (!event) continue;
			if (event.op === "reset") {
				state = emptyProjectedState();
				continue;
			}
			if (event.op === "selected:set") state.selectedRun = cloneRun(event.run);
			else if (event.op === "selected:clear") state.selectedRun = undefined;
			else if (event.op === "cursor:advance") {
				state.cursors.set(cursorKey(event.value), cloneCursor(event.value));
			} else if (event.op === "push:set") {
				state.pushOptIns.set(runKey(event.value), clonePushOptIn(event.value));
			} else if (event.op === "audit:record") state.audit.push(cloneAudit(event.record));
		}
		return state;
	}
}
