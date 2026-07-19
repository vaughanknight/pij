import { describe, expect, it } from "vitest";

import type { PijMessage, SessionDescriptor } from "../types.js";
import { COMPACT_MAX_MS, injectionText, isCompacting, route, SendBuffer } from "./router.js";

function target(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-06-27T00:00:00.000Z",
		...over,
	};
}

const msg = (to: string, body: string, command?: string): PijMessage => ({
	from: "pij-me",
	to,
	body,
	command,
});

describe("injectionText", () => {
	it("renders a remote command as its raw slash form (executes; not framed)", () => {
		expect(injectionText(msg("x", "", "compact"))).toBe("/compact");
	});
	it("frames free text with the sender (parity with the pi receiver)", () => {
		expect(injectionText(msg("x", "hello there"))).toBe("[pij from pij-me] hello there");
	});
});

describe("route (delivery ownership, AC-07/08)", () => {
	it("pi target → observe (the thin in-process receiver owns it; daemon never injects)", () => {
		const d = target({ id: "pi-peer", harness: "pi", lifecycle: "bound", paneId: "%1" });
		expect(route(d, msg("pi-peer", "hi")).kind).toBe("observe");
	});

	it("legacy descriptor (no harness) defaults to pi → observe", () => {
		const d = target({ id: "legacy" });
		expect(route(d, msg("legacy", "hi")).kind).toBe("observe");
	});

	it("bound external pull target → observe, never inject", () => {
		const d = target({
			id: "pull-peer",
			harness: "copilot",
			deliveryMode: "pull",
			lifecycle: "bound",
			paneId: "%7",
		});
		expect(route(d, msg("pull-peer", "go"))).toEqual({ kind: "observe" });
	});

	it("unbound external pull target → observe, never buffer", () => {
		const d = target({
			id: "pull-peer",
			harness: "claude",
			deliveryMode: "pull",
			lifecycle: "pending",
		});
		expect(route(d, msg("pull-peer", "go"))).toEqual({ kind: "observe" });
	});

	it("bound claude target → inject into its pane", () => {
		const d = target({ id: "claude-w", harness: "claude", lifecycle: "bound", paneId: "%7" });
		expect(route(d, msg("claude-w", "go"))).toEqual({
			kind: "inject",
			paneId: "%7",
			text: "[pij from pij-me] go",
		});
	});

	it("a /compact command to a bound claude target injects '/compact' (AC-07)", () => {
		const d = target({ id: "claude-w", harness: "claude", lifecycle: "bound", paneId: "%7" });
		expect(route(d, msg("claude-w", "", "compact"))).toMatchObject({
			kind: "inject",
			text: "/compact",
		});
	});

	it("unbound claude target → buffer (R-02: send outran the binding)", () => {
		const d = target({ id: "claude-w", harness: "claude", lifecycle: "pending" });
		expect(route(d, msg("claude-w", "go")).kind).toBe("buffer");
	});

	it("bound claude target with no pane id → buffer (cannot inject without a pane)", () => {
		const d = target({ id: "claude-w", harness: "claude", lifecycle: "bound" });
		expect(route(d, msg("claude-w", "go")).kind).toBe("buffer");
	});
});

describe("SendBuffer (flush-on-bind, in arrival order)", () => {
	it("buffers per target and flushes FIFO, clearing the queue", () => {
		const b = new SendBuffer();
		b.enqueue("m1", msg("w", "one"));
		b.enqueue("m2", msg("w", "two"));
		b.enqueue("m3", msg("other", "z"));
		expect(b.pending("w")).toBe(2);
		const flushed = b.flush("w");
		expect(flushed.map((m) => m.message.body)).toEqual(["one", "two"]);
		expect(flushed.map((m) => m.messageId)).toEqual(["m1", "m2"]);
		expect(b.pending("w")).toBe(0); // cleared
		expect(b.pending("other")).toBe(1); // untouched
	});

	it("flushing an unknown target is empty, not an error", () => {
		expect(new SendBuffer().flush("ghost")).toEqual([]);
	});
});

describe("isCompacting (compact-window drain hold, DL-004)", () => {
	const NOW = Date.parse("2026-07-18T00:00:00.000Z");

	it("fresh mark → compacting (drain holds)", () => {
		const d = target({ id: "w", compactingAt: new Date(NOW - 1_000).toISOString() });
		expect(isCompacting(d, NOW)).toBe(true);
	});

	it("no mark → not compacting", () => {
		expect(isCompacting(target({ id: "w" }), NOW)).toBe(false);
	});

	it("expired past COMPACT_MAX_MS → not compacting (a dead compact never wedges the queue)", () => {
		const atBound = target({
			id: "w",
			compactingAt: new Date(NOW - COMPACT_MAX_MS).toISOString(),
		});
		expect(isCompacting(atBound, NOW)).toBe(true); // inclusive bound still holds
		const past = target({
			id: "w",
			compactingAt: new Date(NOW - COMPACT_MAX_MS - 1).toISOString(),
		});
		expect(isCompacting(past, NOW)).toBe(false);
	});

	it("malformed timestamp → not compacting (fail open to delivery)", () => {
		expect(isCompacting(target({ id: "w", compactingAt: "not-a-date" }), NOW)).toBe(false);
	});
});
