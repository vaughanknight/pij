// Minih Workbench persistence facade.
//
// This file is intentionally Pi-free. Wiring may back this interface with
// session SQL or another session-scoped store later; Phase 1 uses the in-memory
// implementation while preserving the persist-before-side-effect contract that
// Phase 3 write/push paths must honor.

import type { MinihRunRef } from "./store.js";

export type PersistenceResult<T> =
	| { ok: true; value: T }
	| { ok: false; code: "PERSISTENCE_UNAVAILABLE" | "PERSISTENCE_WRITE_FAILED"; message: string };

export type WorkbenchAuditKind = "intent" | "outcome" | "cursor" | "diagnostic";
export type WorkbenchAuditStatus = "accepted" | "rejected" | "unavailable" | "succeeded" | "failed";
export type WorkbenchAuditMetadataValue = string | number | boolean | null;

export interface WorkbenchAuditRecord {
	id: string;
	kind: WorkbenchAuditKind;
	action: string;
	status: WorkbenchAuditStatus;
	createdAt: string;
	run?: MinihRunRef;
	message?: string;
	metadata?: Record<string, WorkbenchAuditMetadataValue>;
}

export interface SeenCursorKey extends MinihRunRef {
	source: "events" | "inside" | "outside" | "report" | "push";
}

export interface SeenCursorValue extends SeenCursorKey {
	cursor: string;
	updatedAt: string;
}

export interface PushOptInValue extends MinihRunRef {
	enabled: boolean;
	updatedAt: string;
}

export interface MinihWorkbenchPersistence {
	getSelectedRun(): PersistenceResult<MinihRunRef | undefined>;
	setSelectedRun(run: MinihRunRef): PersistenceResult<MinihRunRef>;
	clearSelectedRun(): PersistenceResult<undefined>;
	getSeenCursor(key: SeenCursorKey): PersistenceResult<SeenCursorValue | undefined>;
	advanceSeenCursor(value: SeenCursorValue): PersistenceResult<SeenCursorValue>;
	getPushOptIn(run: MinihRunRef): PersistenceResult<PushOptInValue | undefined>;
	setPushOptIn(value: PushOptInValue): PersistenceResult<PushOptInValue>;
	recordAudit(record: WorkbenchAuditRecord): PersistenceResult<WorkbenchAuditRecord>;
	listAudit(): PersistenceResult<WorkbenchAuditRecord[]>;
}

function ok<T>(value: T): PersistenceResult<T> {
	return { ok: true, value };
}

function runKey(run: MinihRunRef): string {
	return `${run.slug}\u0000${run.runId}`;
}

function cursorKey(key: SeenCursorKey): string {
	return `${runKey(key)}\u0000${key.source}`;
}

function cloneRun(run: MinihRunRef): MinihRunRef {
	return { slug: run.slug, runId: run.runId };
}

function cloneCursor(value: SeenCursorValue): SeenCursorValue {
	return {
		slug: value.slug,
		runId: value.runId,
		source: value.source,
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

export class MemoryMinihWorkbenchPersistence implements MinihWorkbenchPersistence {
	private selectedRun: MinihRunRef | undefined;
	private readonly cursors = new Map<string, SeenCursorValue>();
	private readonly pushOptIns = new Map<string, PushOptInValue>();
	private readonly audit: WorkbenchAuditRecord[] = [];

	getSelectedRun(): PersistenceResult<MinihRunRef | undefined> {
		return ok(this.selectedRun ? cloneRun(this.selectedRun) : undefined);
	}

	setSelectedRun(run: MinihRunRef): PersistenceResult<MinihRunRef> {
		this.selectedRun = cloneRun(run);
		return ok(cloneRun(this.selectedRun));
	}

	clearSelectedRun(): PersistenceResult<undefined> {
		this.selectedRun = undefined;
		return ok(undefined);
	}

	getSeenCursor(key: SeenCursorKey): PersistenceResult<SeenCursorValue | undefined> {
		const value = this.cursors.get(cursorKey(key));
		return ok(value ? cloneCursor(value) : undefined);
	}

	advanceSeenCursor(value: SeenCursorValue): PersistenceResult<SeenCursorValue> {
		const cloned = cloneCursor(value);
		this.cursors.set(cursorKey(cloned), cloned);
		return ok(cloneCursor(cloned));
	}

	getPushOptIn(run: MinihRunRef): PersistenceResult<PushOptInValue | undefined> {
		const value = this.pushOptIns.get(runKey(run));
		return ok(value ? clonePushOptIn(value) : undefined);
	}

	setPushOptIn(value: PushOptInValue): PersistenceResult<PushOptInValue> {
		const cloned = clonePushOptIn(value);
		this.pushOptIns.set(runKey(cloned), cloned);
		return ok(clonePushOptIn(cloned));
	}

	recordAudit(record: WorkbenchAuditRecord): PersistenceResult<WorkbenchAuditRecord> {
		const cloned = cloneAudit(record);
		this.audit.push(cloned);
		return ok(cloneAudit(cloned));
	}

	listAudit(): PersistenceResult<WorkbenchAuditRecord[]> {
		return ok(this.audit.map((record) => cloneAudit(record)));
	}
}
