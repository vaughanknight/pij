import { describe, expect, it } from "vitest";

import { buildEvent } from "../core/events.js";
import type { DeliveredMessage, SessionDescriptor } from "../core/types.js";
import {
	FakeDelivery,
	FakeEventLog,
	FakeInbox,
	FakePiRuntime,
	FakeProcess,
	FakeRegistry,
} from "./fakes.js";

function desc(id: string): SessionDescriptor {
	return {
		id,
		folder: "/work/proj",
		dataDir: `/home/u/.pij/${id}`,
		eventsPath: `/home/u/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-06-16T00:00:00.000Z",
	};
}

function delivered(messageId: string, body: string, kind?: "receipt"): DeliveredMessage {
	return {
		messageId,
		from: "alice",
		to: "bob",
		body,
		...(kind === undefined ? {} : { kind }),
	};
}

describe("FakeRegistry", () => {
	it("upserts, reads, lists, removes", () => {
		const r = new FakeRegistry([desc("a")]);
		expect(r.read("a")?.id).toBe("a");
		r.write(desc("b"));
		expect(
			r
				.list()
				.map((d) => d.id)
				.sort(),
		).toEqual(["a", "b"]);
		r.remove("a");
		expect(r.read("a")).toBeNull();
	});
});

describe("FakeEventLog", () => {
	it("appends, reports lastSeq/count, and filters on read", () => {
		const log = new FakeEventLog();
		expect(log.lastSeq()).toBe(0);
		log.append(buildEvent(1, "tool_call", 0));
		log.append(buildEvent(2, "message", 0));
		expect(log.count()).toBe(2);
		expect(log.lastSeq()).toBe(2);
		expect(log.read({ type: "message" }).map((e) => e.seq)).toEqual([2]);
	});
});

describe("FakeDelivery", () => {
	it("delivers to known ids and records the outbox", () => {
		const d = new FakeDelivery(new Set(["w3"]));
		const r = d.deliver({ from: "p1", to: "w3", body: "hi" });
		expect(r.ok).toBe(true);
		expect(d.outbox).toHaveLength(1);
	});
	it("rejects unknown ids with E-NOID", () => {
		const d = new FakeDelivery(new Set(["w3"]));
		const r = d.deliver({ from: "p1", to: "ghost", body: "hi" });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-NOID");
	});
	it("accepts all when no known set given", () => {
		const d = new FakeDelivery();
		expect(d.deliver({ from: "p1", to: "anyone", body: "hi" }).ok).toBe(true);
	});
});

describe("FakeInbox", () => {
	it("lists unread envelopes in message-id order and keeps receipts classifiable", () => {
		const inbox = new FakeInbox([
			delivered("003", "three"),
			delivered("001", "receipt", "receipt"),
			delivered("002", "two"),
		]);

		expect(inbox.listUnread("bob")).toEqual({
			ok: true,
			value: [
				delivered("001", "receipt", "receipt"),
				delivered("002", "two"),
				delivered("003", "three"),
			],
		});
	});

	it("gives exclusive first-writer ownership and idempotent marks", async () => {
		const inbox = new FakeInbox([delivered("001", "one")]);

		const [first, second] = await Promise.all([
			Promise.resolve().then(() => inbox.claimUnread("bob", "001")),
			Promise.resolve().then(() => inbox.claimUnread("bob", "001")),
		]);

		expect(
			[first, second].filter((result) => result.ok && result.value.kind === "claimed"),
		).toHaveLength(1);
		expect(
			[first, second].filter((result) => result.ok && result.value.kind === "already-read"),
		).toHaveLength(1);
		expect(inbox.markRead("bob", "001")).toEqual({
			ok: true,
			value: { kind: "already-read", messageId: "001" },
		});
	});

	it("marks an unread envelope without returning it", () => {
		const inbox = new FakeInbox([delivered("001", "one")]);

		expect(inbox.markRead("bob", "001")).toEqual({
			ok: true,
			value: { kind: "marked", marker: { messageId: "001" } },
		});
		expect(inbox.listUnread("bob")).toEqual({ ok: true, value: [] });
	});
});

describe("FakePiRuntime", () => {
	it("records injects + compaction and toggles idle", () => {
		const pi = new FakePiRuntime(true);
		expect(pi.isIdle()).toBe(true);
		pi.setIdle(false);
		pi.inject("hello", "steer");
		pi.compact();
		expect(pi.isIdle()).toBe(false);
		expect(pi.injects).toEqual([{ text: "hello", mode: "steer" }]);
		expect(pi.compactCount).toBe(1);
	});
});

describe("FakeProcess", () => {
	it("probes liveness, advances the clock, reads env", () => {
		const p = new FakeProcess(1000, 0, { PIJ_SESSION_ID: "a" }, [1000, 2000]);
		expect(p.pid()).toBe(1000);
		expect(p.isAlive(2000)).toBe(true);
		p.kill(2000);
		expect(p.isAlive(2000)).toBe(false);
		p.advance(5000);
		expect(p.now()).toBe(5000);
		expect(p.env("PIJ_SESSION_ID")).toBe("a");
		expect(p.env("MISSING")).toBeUndefined();
	});
});
