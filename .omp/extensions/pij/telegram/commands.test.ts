// pij-telegram — `/list` selector + formatter tests (TDD, Plan 027 Phase 1 / AC-1…5).
// `selectActiveRecent` is pure: a session snapshot + liveness probe + clock in, the
// newest ACTIVE sessions out (capped). It reuses the canonical `liveness` verdict
// (core/state.ts) — dead/stale sessions must NEVER appear. `formatSessionList` only
// renders an already-selected list.

import { describe, expect, it } from "vitest";
import { STALE_AFTER_MS } from "../core/state.js";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import { formatSessionList, formatTail, parseTailCount, selectActiveRecent } from "./commands.js";

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

const NOW = Date.parse("2026-06-29T12:00:00.000Z");
const alwaysAlive = () => true;

describe("selectActiveRecent", () => {
	it("keeps an active session (pid alive, idle, recent)", () => {
		const active = desc({ id: "pij-active", lastEventAt: "2026-06-29T11:59:00.000Z" });
		const result = selectActiveRecent([active], alwaysAlive, NOW);
		expect(result.map((s) => s.id)).toEqual(["pij-active"]);
	});

	it("drops a dead session (pid gone)", () => {
		const dead = desc({ id: "pij-dead", lastEventAt: "2026-06-29T11:59:00.000Z" });
		const isAlive = (pid: number) => pid !== dead.pid;
		const result = selectActiveRecent([dead], isAlive, NOW);
		expect(result).toEqual([]);
	});

	it("drops a stale session (working, silent past STALE_AFTER_MS, pid alive)", () => {
		const stale = desc({
			id: "pij-stale",
			state: "working",
			lastEventAt: new Date(NOW - STALE_AFTER_MS - 1000).toISOString(),
		});
		const result = selectActiveRecent([stale], alwaysAlive, NOW);
		expect(result).toEqual([]);
	});

	it("mixes active/dead/stale — only the active one survives", () => {
		const active = desc({ id: "pij-active", pid: 1111, lastEventAt: "2026-06-29T11:59:00.000Z" });
		const dead = desc({ id: "pij-dead", pid: 2222, lastEventAt: "2026-06-29T11:59:00.000Z" });
		const stale = desc({
			id: "pij-stale",
			pid: 3333,
			state: "working",
			lastEventAt: new Date(NOW - STALE_AFTER_MS - 1000).toISOString(),
		});
		const isAlive = (pid: number) => pid !== dead.pid;
		const result = selectActiveRecent([active, dead, stale], isAlive, NOW);
		expect(result.map((s) => s.id)).toEqual(["pij-active"]);
	});

	it("orders newest-first by lastEventAt (then startedAt)", () => {
		const result = selectActiveRecent(
			[
				desc({ id: "pij-old", lastEventAt: "2026-06-29T10:00:00.000Z" }),
				desc({ id: "pij-new", lastEventAt: "2026-06-29T11:00:00.000Z" }),
				desc({ id: "pij-mid", lastEventAt: "2026-06-29T10:30:00.000Z" }),
			],
			alwaysAlive,
			NOW,
		);
		expect(result.map((s) => s.id)).toEqual(["pij-new", "pij-mid", "pij-old"]);
	});

	it("caps at the newest 10 (default max)", () => {
		// 12 active sessions, ascending recency → the two oldest must be dropped.
		const sessions = Array.from({ length: 12 }, (_, i) =>
			desc({
				id: `pij-s${String(i).padStart(2, "0")}`,
				lastEventAt: `2026-06-29T${String(i).padStart(2, "0")}:00:00.000Z`,
			}),
		);
		const result = selectActiveRecent(sessions, alwaysAlive, NOW);
		expect(result).toHaveLength(10);
		expect(result.map((s) => s.id)).not.toContain("pij-s00");
		expect(result.map((s) => s.id)).not.toContain("pij-s01");
		expect(result[0]?.id).toBe("pij-s11");
	});
});

describe("formatSessionList", () => {
	it("notes when there are no active sessions", () => {
		expect(formatSessionList([])).toMatch(/no active pij sessions/i);
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
		expect(reply).toMatch(/2 active sessions:/);
	});

	it("singular header for exactly one session", () => {
		const reply = formatSessionList([desc({ id: "pij-osn81b" })]);
		expect(reply).toMatch(/1 active session:/);
	});

	it("reports the pre-cap active total when more were active than shown", () => {
		const shown = Array.from({ length: 10 }, (_, i) => desc({ id: `pij-s${i}` }));
		const reply = formatSessionList(shown, 12);
		const lines = reply.split("\n").slice(1);
		expect(lines).toHaveLength(10);
		expect(reply).toMatch(/10 of 12 active/);
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
