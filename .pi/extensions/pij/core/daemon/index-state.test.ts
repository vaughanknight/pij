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
});
