import { describe, expect, it } from "vitest";

import {
	deriveSelfId,
	excludeSelf,
	filterByFolder,
	isSubagentChild,
	resolveSelf,
} from "./discovery.js";
import type { SessionDescriptor } from "./types.js";

function desc(id: string, folder: string): SessionDescriptor {
	return {
		id,
		folder,
		dataDir: `/home/u/.pij/${id}`,
		eventsPath: `/home/u/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-06-16T00:00:00.000Z",
	};
}

const a = desc("a", "/work/proj");
const b = desc("b", "/work/proj");
const c = desc("c", "/work/other");

describe("filterByFolder", () => {
	it("keeps only descriptors in the folder", () => {
		expect(filterByFolder([a, b, c], "/work/proj").map((d) => d.id)).toEqual(["a", "b"]);
	});
});

describe("excludeSelf", () => {
	it("drops the self id", () => {
		expect(excludeSelf([a, b], "a").map((d) => d.id)).toEqual(["b"]);
	});
});

describe("resolveSelf", () => {
	it("env id wins", () => {
		const r = resolveSelf("a", [a, b]);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toBe("a");
	});
	it("falls back to the lone local descriptor", () => {
		const r = resolveSelf(undefined, [b]);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toBe("b");
	});
	it("E-AMBIG when env unset + multiple local", () => {
		const r = resolveSelf("", [a, b]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-AMBIG");
	});
	it("E-AMBIG when env unset + no local", () => {
		const r = resolveSelf(undefined, []);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-AMBIG");
	});
});

describe("deriveSelfId", () => {
	it("derives a stable pij id from a pi session id", () => {
		const id = deriveSelfId("sess-ABC123", 4242);
		expect(id).toMatch(/^pij-[a-z0-9]+$/);
		// deterministic across /reload: same input => same id
		expect(deriveSelfId("sess-ABC123", 4242)).toBe(id);
		// independent of pid (a /new in the same process keeps the pid but not the id)
		expect(deriveSelfId("sess-ABC123", 9999)).toBe(id);
	});

	it("gives different ids for different session ids (/new => new peer)", () => {
		expect(deriveSelfId("sess-OLD", 4242)).not.toBe(deriveSelfId("sess-NEW", 4242));
	});

	it("falls back to pij-<pid> when no session id is available", () => {
		expect(deriveSelfId(undefined, 4242)).toBe("pij-4242");
		expect(deriveSelfId("", 4242)).toBe("pij-4242");
		expect(deriveSelfId("   ", 4242)).toBe("pij-4242");
	});
});

describe("isSubagentChild", () => {
	it("false for a top-level session (neither env set)", () => {
		expect(isSubagentChild({})).toBe(false);
	});
	it("true when PI_SUBAGENT_CHILD=1", () => {
		expect(isSubagentChild({ PI_SUBAGENT_CHILD: "1" })).toBe(true);
	});
	it("true when PI_SUBAGENT_DEPTH>0", () => {
		expect(isSubagentChild({ PI_SUBAGENT_DEPTH: "1" })).toBe(true);
		expect(isSubagentChild({ PI_SUBAGENT_DEPTH: "3" })).toBe(true);
	});
	it("false at depth 0 / non-numeric", () => {
		expect(isSubagentChild({ PI_SUBAGENT_DEPTH: "0" })).toBe(false);
		expect(isSubagentChild({ PI_SUBAGENT_DEPTH: "nope" })).toBe(false);
	});
});
