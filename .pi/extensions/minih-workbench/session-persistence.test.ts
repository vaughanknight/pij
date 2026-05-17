import { describe, expect, it } from "vitest";

import {
	MINIH_WORKBENCH_SESSION_CUSTOM_TYPE,
	SessionMinihWorkbenchPersistence,
	type SessionPersistenceEntry,
} from "./session-persistence.js";

function createHarness() {
	const entries: SessionPersistenceEntry[] = [];
	return {
		entries,
		persistence: new SessionMinihWorkbenchPersistence({
			getEntries: () => entries,
			appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
		}),
	};
}

describe("session-backed Minih Workbench persistence", () => {
	it("replays selected run, cursors, push opt-ins, and audit records across reloads", () => {
		const harness = createHarness();
		const run = { slug: "agent", runId: "run" };
		harness.persistence.setSelectedRun(run);
		harness.persistence.advanceSeenCursor({
			...run,
			source: "inside",
			cursor: "m-1",
			updatedAt: "2026-05-17T00:00:00Z",
		});
		harness.persistence.setPushOptIn({
			...run,
			enabled: true,
			updatedAt: "2026-05-17T00:00:01Z",
		});
		harness.persistence.recordAudit({
			id: "a1",
			kind: "intent",
			action: "send",
			status: "accepted",
			createdAt: "2026-05-17T00:00:02Z",
			run,
		});

		const reloaded = new SessionMinihWorkbenchPersistence({
			getEntries: () => harness.entries,
			appendEntry: (customType, data) => harness.entries.push({ type: "custom", customType, data }),
		});

		expect(reloaded.getSelectedRun()).toEqual({ ok: true, value: run });
		expect(reloaded.getSeenCursor({ ...run, source: "inside" })).toMatchObject({
			ok: true,
			value: { cursor: "m-1" },
		});
		expect(reloaded.getPushOptIn(run)).toMatchObject({ ok: true, value: { enabled: true } });
		expect(reloaded.listAudit()).toMatchObject({ ok: true, value: [{ id: "a1" }] });
	});

	it("resets inherited workbench rows for new or forked sessions", () => {
		const harness = createHarness();
		const run = { slug: "agent", runId: "run" };
		harness.persistence.setSelectedRun(run);
		harness.persistence.recordAudit({
			id: "a1",
			kind: "intent",
			action: "send",
			status: "accepted",
			createdAt: "2026-05-17T00:00:00Z",
			run,
		});
		harness.persistence.resetForNewSession("2026-05-17T00:00:01Z");

		expect(harness.persistence.getSelectedRun()).toEqual({ ok: true, value: undefined });
		expect(harness.persistence.listAudit()).toEqual({ ok: true, value: [] });
		expect(
			harness.entries.some((entry) => entry.customType === MINIH_WORKBENCH_SESSION_CUSTOM_TYPE),
		).toBe(true);
	});

	it("fails closed when session append throws", () => {
		const persistence = new SessionMinihWorkbenchPersistence({
			getEntries: () => [],
			appendEntry: () => {
				throw new Error("disk full");
			},
		});

		expect(persistence.setSelectedRun({ slug: "agent", runId: "run" })).toMatchObject({
			ok: false,
			code: "PERSISTENCE_WRITE_FAILED",
		});
	});
});
