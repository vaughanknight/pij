// pij-messaging — `pij close` pure core tests: arg parse + ownership-guarded plan.

import { describe, expect, it } from "vitest";
import { parseCloseArgs, planClose } from "./close.js";
import type { SessionDescriptor, SessionId } from "./types.js";

/** Minimal descriptor fixture; override only the fields a case cares about. */
function desc(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-worker" as SessionId,
		folder: "/repo",
		dataDir: "/home/.pij/pij-worker",
		eventsPath: "/home/.pij/pij-worker/events.ndjson",
		pid: 4242,
		startedAt: "2026-06-28T00:00:00.000Z",
		paneId: "%7",
		spawnedBy: "pij-boss" as SessionId,
		...over,
	};
}

describe("parseCloseArgs", () => {
	it("parses an id alone (force defaults false)", () => {
		const r = parseCloseArgs(["pij-worker"]);
		expect(r).toEqual({ ok: true, value: { id: "pij-worker", force: false } });
	});

	it("parses id + --force in either order", () => {
		expect(parseCloseArgs(["pij-worker", "--force"])).toEqual({
			ok: true,
			value: { id: "pij-worker", force: true },
		});
		expect(parseCloseArgs(["--force", "pij-worker"])).toEqual({
			ok: true,
			value: { id: "pij-worker", force: true },
		});
	});

	it("accepts -f as a --force alias", () => {
		expect(parseCloseArgs(["pij-worker", "-f"])).toEqual({
			ok: true,
			value: { id: "pij-worker", force: true },
		});
	});

	it("rejects a missing id (E-ARG)", () => {
		const r = parseCloseArgs([]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-ARG");
	});

	it("rejects an unknown flag (E-ARG)", () => {
		const r = parseCloseArgs(["pij-worker", "--yolo"]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-ARG");
	});

	it("rejects a second positional (E-ARG)", () => {
		const r = parseCloseArgs(["pij-worker", "pij-other"]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-ARG");
	});
});

describe("planClose — ownership guard", () => {
	it("allows closing a session you spawned (no warning)", () => {
		const r = planClose(
			desc({ spawnedBy: "pij-boss" as SessionId }),
			"pij-worker",
			"pij-boss",
			false,
		);
		expect(r).toEqual({ ok: true, value: { id: "pij-worker", paneId: "%7" } });
	});

	it("REFUSES a non-owned close without --force (E-OWN)", () => {
		const r = planClose(
			desc({ spawnedBy: "pij-someone-else" as SessionId }),
			"pij-worker",
			"pij-boss",
			false,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.code).toBe("E-OWN");
			expect(r.message).toContain("--force");
			expect(r.message).toContain("pij-someone-else");
		}
	});

	it("allows a non-owned close WITH --force, carrying a warning", () => {
		const r = planClose(
			desc({ spawnedBy: "pij-someone-else" as SessionId }),
			"pij-worker",
			"pij-boss",
			true,
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.paneId).toBe("%7");
			expect(r.value.warning).toContain("forced close");
		}
	});

	it("treats an unknown-owner (no spawnedBy) session as not-owned → E-OWN without force", () => {
		const r = planClose(desc({ spawnedBy: undefined }), "pij-worker", "pij-boss", false);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.code).toBe("E-OWN");
			expect(r.message).toContain("unknown");
		}
	});

	it("refuses to close yourself (E-SELF)", () => {
		const r = planClose(desc({ id: "pij-boss" as SessionId }), "pij-boss", "pij-boss", false);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-SELF");
	});

	it("errors on an absent descriptor (E-NOID)", () => {
		const r = planClose(null, "pij-ghost", "pij-boss", true);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-NOID");
	});

	it("errors when the target has no pane (E-NOID)", () => {
		const r = planClose(desc({ paneId: undefined }), "pij-worker", "pij-boss", true);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-NOID");
	});

	it("allows force-close even when the caller cannot resolve self", () => {
		const r = planClose(desc(), "pij-worker", undefined, true);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.warning).toContain("you are unknown");
	});
});
