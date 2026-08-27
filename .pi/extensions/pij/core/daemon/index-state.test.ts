import { describe, expect, it } from "vitest";

import type { SessionDescriptor } from "../types.js";
import { IndexState } from "./index-state.js";

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-06-27T00:00:00.000Z",
		...over,
	};
}

const SNAPSHOT: SessionDescriptor[] = [
	desc({ id: "pi-a", harness: "pi" }),
	desc({
		id: "claude-b",
		harness: "claude",
		harnessSessionId: "sess-b",
		paneId: "%2",
		lifecycle: "bound",
		initInjectedAt: "2026-06-27T00:00:05.000Z",
	}),
	desc({ id: "claude-c", harness: "claude", paneId: "%3", lifecycle: "pending" }),
];

describe("IndexState", () => {
	it("indexes by id, harness session, and pane", () => {
		const ix = IndexState.from(SNAPSHOT);
		expect(ix.get("claude-b")?.harnessSessionId).toBe("sess-b");
		expect(ix.resolveHarnessSession("sess-b")).toBe("claude-b");
		expect(ix.resolvePane("%2")).toBe("claude-b");
		expect(ix.resolvePane("%3")).toBe("claude-c");
		expect(ix.all()).toHaveLength(3);
	});

	it("indexes exact harness-native tuples without cross-harness collisions", () => {
		const ix = IndexState.from([
			desc({ id: "claude-x", harness: "claude", harnessSessionId: "shared" }),
			desc({ id: "copilot-x", harness: "copilot", harnessSessionId: "shared" }),
		]);
		expect(ix.resolveHarnessIdentity("claude", "shared")).toEqual({
			ok: true,
			value: "claude-x",
		});
		expect(ix.resolveHarnessIdentity("copilot", "shared")).toEqual({
			ok: true,
			value: "copilot-x",
		});
	});

	it("fails loudly when one exact tuple maps to multiple pij ids", () => {
		const ix = IndexState.from([
			desc({ id: "claude-a", harness: "claude", harnessSessionId: "duplicate" }),
			desc({ id: "claude-b", harness: "claude", harnessSessionId: "duplicate" }),
		]);
		expect(ix.resolveHarnessIdentity("claude", "duplicate")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("lists only pending sessions for the daemon to drive", () => {
		const ix = IndexState.from(SNAPSHOT);
		expect(ix.pending().map((d) => d.id)).toEqual(["claude-c"]);
	});

	it("needsInit reflects the persisted marker (AC-02/12): injected=false, fresh=true", () => {
		const ix = IndexState.from(SNAPSHOT);
		expect(ix.needsInit("claude-b")).toBe(false); // initInjectedAt set
		expect(ix.needsInit("claude-c")).toBe(true); // no marker yet
		expect(ix.needsInit("ghost")).toBe(false); // unknown → nothing to inject
	});

	it("rebuild replaces the whole index from a new snapshot (restart with no lost bindings)", () => {
		const ix = IndexState.from(SNAPSHOT);
		// Simulate a restart reading the same files plus a newly-bound c.
		ix.rebuild([
			SNAPSHOT[0] as SessionDescriptor,
			SNAPSHOT[1] as SessionDescriptor,
			desc({
				id: "claude-c",
				harness: "claude",
				harnessSessionId: "sess-c",
				paneId: "%3",
				lifecycle: "bound",
				initInjectedAt: "2026-06-27T00:01:00.000Z",
			}),
		]);
		expect(ix.resolveHarnessSession("sess-c")).toBe("claude-c");
		expect(ix.pending()).toHaveLength(0); // c is now bound
		expect(ix.needsInit("claude-c")).toBe(false); // marker survived the restart → no re-inject
	});

	it("stale pane mapping is dropped on rebuild (a closed pane no longer resolves)", () => {
		const ix = IndexState.from(SNAPSHOT);
		ix.rebuild([desc({ id: "pi-a", harness: "pi" })]);
		expect(ix.resolvePane("%2")).toBeUndefined();
		expect(ix.resolveHarnessSession("sess-b")).toBeUndefined();
	});

	it("resolves bound and pending panes but never dissolved or failed panes", () => {
		const ix = IndexState.from([
			desc({ id: "bound", paneId: "%1", lifecycle: "bound" }),
			desc({ id: "dissolved", paneId: "%2", lifecycle: "dissolved" }),
			desc({ id: "failed", paneId: "%3", lifecycle: "failed" }),
			desc({ id: "pending", paneId: "%4", lifecycle: "pending" }),
		]);

		expect(ix.resolvePane("%1")).toBe("bound");
		expect(ix.resolvePane("%2")).toBeUndefined();
		expect(ix.resolvePane("%3")).toBeUndefined();
		expect(ix.resolvePane("%4")).toBe("pending");
		expect(ix.get("dissolved")?.lifecycle).toBe("dissolved");
		expect(ix.get("failed")?.lifecycle).toBe("failed");
	});

	it("a terminal descriptor cannot overwrite the fresh seat that reused its pane", () => {
		const ix = IndexState.from([
			desc({ id: "fresh-bound", paneId: "%1", lifecycle: "bound" }),
			desc({ id: "closed-old", paneId: "%1", lifecycle: "dissolved" }),
		]);

		expect(ix.resolvePane("%1")).toBe("fresh-bound");
		expect(ix.get("closed-old")?.lifecycle).toBe("dissolved");
	});
});
