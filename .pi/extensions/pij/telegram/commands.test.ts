// pij-telegram — `/list` formatter tests (TDD, Plan Phase 2 / AC-06 part).
// `formatSessionList` is pure: a session snapshot in, reply text out. It must show
// the NEWEST sessions first (same recency rule as the matcher), cap at 10, and pair
// every id with its folder path.

import { describe, expect, it } from "vitest";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import { formatSessionList, formatTail, parseTailCount } from "./commands.js";

/** Minimal descriptor fixture; override only the fields a case cares about. */
function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: `/repo/${over.id}`,
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 4242,
		startedAt: "2026-06-28T00:00:00.000Z",
		...over,
		id: over.id as SessionId,
	};
}

describe("formatSessionList", () => {
	it("notes when there are no sessions", () => {
		expect(formatSessionList([])).toMatch(/no live pij sessions/i);
	});

	it("lists each session's id and folder path", () => {
		const reply = formatSessionList([
			desc({ id: "pij-osn81b", folder: "/work/alpha" }),
			desc({ id: "pij-abc123", folder: "/work/beta" }),
		]);
		expect(reply).toContain("pij-osn81b");
		expect(reply).toContain("/work/alpha");
		expect(reply).toContain("pij-abc123");
		expect(reply).toContain("/work/beta");
		expect(reply).toMatch(/2 sessions:/);
	});

	it("orders newest-first by lastEventAt (then startedAt)", () => {
		const reply = formatSessionList([
			desc({ id: "pij-old", lastEventAt: "2026-06-29T10:00:00.000Z" }),
			desc({ id: "pij-new", lastEventAt: "2026-06-29T12:00:00.000Z" }),
			desc({ id: "pij-mid", lastEventAt: "2026-06-29T11:00:00.000Z" }),
		]);
		const lines = reply.split("\n").slice(1); // drop the header
		expect(lines[0]).toContain("pij-new");
		expect(lines[1]).toContain("pij-mid");
		expect(lines[2]).toContain("pij-old");
	});

	it("caps the list at the newest 10 and reports the total", () => {
		// 12 sessions, ascending recency → the two oldest must be dropped.
		const sessions = Array.from({ length: 12 }, (_, i) =>
			desc({
				id: `pij-s${String(i).padStart(2, "0")}`,
				lastEventAt: `2026-06-29T${String(i).padStart(2, "0")}:00:00.000Z`,
			}),
		);
		const reply = formatSessionList(sessions);
		const lines = reply.split("\n").slice(1);
		expect(lines).toHaveLength(10);
		expect(reply).toMatch(/10 of 12 sessions/);
		// newest (s11) shown, oldest (s00/s01) dropped
		expect(reply).toContain("pij-s11");
		expect(reply).not.toContain("pij-s00");
		expect(reply).not.toContain("pij-s01");
	});
});

describe("parseTailCount", () => {
	it("defaults to 10 for empty / whitespace / missing input", () => {
		expect(parseTailCount(undefined)).toBe(10);
		expect(parseTailCount("")).toBe(10);
		expect(parseTailCount("   ")).toBe(10);
	});

	it("reads a positive integer", () => {
		expect(parseTailCount("20")).toBe(20);
		expect(parseTailCount("  5 ")).toBe(5);
	});

	it("rejects non-numeric / non-positive input back to the default", () => {
		expect(parseTailCount("abc")).toBe(10);
		expect(parseTailCount("0")).toBe(10);
		expect(parseTailCount("-4")).toBe(10);
		expect(parseTailCount("3.5")).toBe(10);
	});

	it("clamps an oversized request to the ceiling (50)", () => {
		expect(parseTailCount("5000")).toBe(50);
	});
});

describe("formatTail", () => {
	const ev = (over: Partial<PijEvent> & { seq: number }): PijEvent => ({
		timestamp: "2026-06-29T10:00:00.000Z",
		type: "message",
		...over,
	});

	it("notes an empty log", () => {
		expect(formatTail([])).toMatch(/no events/i);
	});

	it("renders one `seq · type — summary` line per event, in order", () => {
		const reply = formatTail([
			ev({ seq: 1, type: "tool_call", data: { name: "ctx_read" } }),
			ev({ seq: 2, type: "message", data: { body: "done" } }),
		]);
		const lines = reply.split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe("1 · tool_call — ctx_read");
		expect(lines[1]).toBe("2 · message — done");
	});

	it("clips a long summary so the reply stays under Telegram's cap", () => {
		const reply = formatTail([ev({ seq: 1, type: "message", data: { body: "z".repeat(500) } })]);
		const line = reply.split("\n")[0] ?? "";
		expect(line.length).toBeLessThan(100);
		expect(line.endsWith("…")).toBe(true);
	});
});
