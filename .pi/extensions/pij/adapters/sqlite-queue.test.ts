// PoC (poc/comms-sqlite-socket): SQLite WAL as the durable peer-message queue.
// These tests encode the failures of 2026-08-27: a 3 KB multi-line body must
// round-trip byte-exact; a crash between claim and inject must redeliver; a
// duplicate ack must be absorbed; ordering is per recipient by seq.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteQueue } from "./sqlite-queue.js";

const BIG_BODY = [
	"[pij from pij-vocal-kingfisher] HEAD-LINE: VERDICT clean — SHA deadbeef0001 branch feat/x",
	...Array.from({ length: 30 }, (_, i) => `L${String(i + 2).padStart(2, "0")}: ${"k".repeat(95)}`),
	"TAIL-LINE",
].join("\n");

let home: string;
let q: SqliteQueue;
let now = 1_000_000;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-sqlite-queue-"));
	q = new SqliteQueue(home, { now: () => now });
});
afterEach(() => {
	q.close();
	rmSync(home, { recursive: true, force: true });
});

describe("SqliteQueue — DeliveryPort/InboxPort contract", () => {
	it("opens in WAL mode under <pijHome>/queue/pij.sqlite", () => {
		expect(q.journalMode()).toBe("wal");
		expect(q.dbPath).toBe(join(home, "queue", "pij.sqlite"));
	});

	it("round-trips a 3 KB multi-line body byte-exact (the clipped-head failure)", () => {
		expect(BIG_BODY.length).toBeGreaterThan(3000);
		const sent = q.deliver({ from: "pij-a", to: "pij-b", body: BIG_BODY });
		expect(sent.ok).toBe(true);
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value.map((m) => m.body)).toEqual([BIG_BODY]);
	});

	it("lists unread per recipient in seq order and hides other recipients", () => {
		q.deliver({ from: "pij-a", to: "pij-b", body: "one" });
		now += 1;
		q.deliver({ from: "pij-a", to: "pij-c", body: "other" });
		now += 1;
		q.deliver({ from: "pij-x", to: "pij-b", body: "two" });
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value.map((m) => [m.from, m.body])).toEqual([
			["pij-a", "one"],
			["pij-x", "two"],
		]);
	});

	it("claimUnread acks exactly once; a second claim reports already-read", () => {
		const sent = q.deliver({ from: "pij-a", to: "pij-b", body: "hello", command: undefined });
		if (!sent.ok) throw new Error(sent.message);
		const first = q.claimUnread("pij-b", sent.value.messageId, {
			messageId: sent.value.messageId,
			reader: "pij-b",
		});
		expect(first.ok && first.value.kind).toBe("claimed");
		const second = q.claimUnread("pij-b", sent.value.messageId);
		expect(second.ok && second.value.kind).toBe("already-read");
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value).toEqual([]);
	});

	it("markRead is idempotent and leaves a receipt trail", () => {
		const sent = q.deliver({ from: "pij-a", to: "pij-b", body: "x" });
		if (!sent.ok) throw new Error(sent.message);
		expect(q.markRead("pij-b", sent.value.messageId).ok).toBe(true);
		const again = q.markRead("pij-b", sent.value.messageId);
		expect(again.ok && again.value.kind).toBe("already-read");
		expect(q.receipts(sent.value.messageId).map((r) => r.state)).toEqual(["queued", "acked"]);
	});

	it("preserves kind/command/attachments through the row", () => {
		q.deliver({
			from: "pij-a",
			to: "pij-b",
			body: "cap",
			kind: "receipt",
			command: "compact",
			attachments: [{ path: "/tmp/x.png", caption: "c" }],
		});
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value[0]).toMatchObject({
			kind: "receipt",
			command: "compact",
			attachments: [{ path: "/tmp/x.png", caption: "c" }],
		});
	});

	it("is idempotent on an explicit messageId (a retried send is a no-op)", () => {
		const a = q.deliver({ from: "pij-a", to: "pij-b", body: "once" }, { messageId: "m-fixed" });
		const b = q.deliver({ from: "pij-a", to: "pij-b", body: "once" }, { messageId: "m-fixed" });
		expect(a.ok && a.value.messageId).toBe("m-fixed");
		expect(b.ok && b.value.messageId).toBe("m-fixed");
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value.length).toBe(1);
	});
});

describe("SqliteQueue — claim / lease / redelivery", () => {
	it("claim hands out the oldest queued message with a lease; a second claim gets the next", () => {
		q.deliver({ from: "pij-a", to: "pij-b", body: "first" });
		q.deliver({ from: "pij-a", to: "pij-b", body: "second" });
		const c1 = q.claim("pij-b", { leaseMs: 90_000, token: "t1" });
		const c2 = q.claim("pij-b", { leaseMs: 90_000, token: "t2" });
		expect(c1?.body).toBe("first");
		expect(c2?.body).toBe("second");
		expect(q.claim("pij-b", { leaseMs: 90_000, token: "t3" })).toBeUndefined();
	});

	it("a crash between claim and inject is redelivered after the lease (or on restart)", () => {
		const sent = q.deliver({ from: "pij-a", to: "pij-b", body: "survive me" });
		if (!sent.ok) throw new Error(sent.message);
		const claimed = q.claim("pij-b", { leaseMs: 1_000, token: "t1" });
		expect(claimed?.messageId).toBe(sent.value.messageId);
		expect(claimed?.attempt).toBe(1);
		// "crash": drop the handle without settling; a new daemon opens the same file.
		q.close();
		const q2 = new SqliteQueue(home, { now: () => now });
		expect(q2.resetClaimsOnStart()).toBe(1);
		const again = q2.claim("pij-b", { leaseMs: 1_000, token: "t2" });
		expect(again?.messageId).toBe(sent.value.messageId);
		expect(again?.attempt).toBe(2);
		// lease expiry path too: leave it claimed, advance time, sweep.
		now += 5_000;
		expect(q2.recoverStaleClaims()).toBe(1);
		const third = q2.claim("pij-b", { leaseMs: 1_000, token: "t3" });
		expect(third?.attempt).toBe(3);
		expect(q2.receipts(sent.value.messageId).map((r) => r.state)).toEqual([
			"queued",
			"claimed",
			"redelivered",
			"claimed",
			"redelivered",
			"claimed",
		]);
		q2.close();
		q = new SqliteQueue(home, { now: () => now }); // for afterEach
	});

	it("settle(injected) keeps the row unacked until the recipient claims it; settle(queued) releases", () => {
		const sent = q.deliver({ from: "pij-a", to: "pij-b", body: "ptr" });
		if (!sent.ok) throw new Error(sent.message);
		const c = q.claim("pij-b", { leaseMs: 1_000, token: "t1" });
		if (!c) throw new Error("no claim");
		q.settle(c.seq, "injected", { leaseMs: 60_000 });
		// still visible to the recipient's pull
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value.length).toBe(1);
		// not claimable by the daemon again while injected
		expect(q.claim("pij-b", { leaseMs: 1_000, token: "t2" })).toBeUndefined();
		// release
		q.settle(c.seq, "queued", { detail: "held" });
		expect(q.claim("pij-b", { leaseMs: 1_000, token: "t3" })?.seq).toBe(c.seq);
	});

	it("parks a message after maxAttempts", () => {
		q.deliver({ from: "pij-a", to: "pij-b", body: "poison" });
		for (let i = 0; i < 3; i++) {
			const c = q.claim("pij-b", { leaseMs: 10, token: `t${i}`, maxAttempts: 3 });
			expect(c).toBeDefined();
			now += 100;
			q.recoverStaleClaims({ maxAttempts: 3 });
		}
		expect(q.claim("pij-b", { leaseMs: 10, token: "tx", maxAttempts: 3 })).toBeUndefined();
		expect(q.stats("pij-b")).toMatchObject({ parked: 1, queued: 0 });
	});
});

describe("SqliteQueue — daemon view", () => {
	it("listQueued returns only queued rows with seq; injected rows wait for their lease", () => {
		q.deliver({ from: "pij-a", to: "pij-b", body: "one" });
		q.deliver({ from: "pij-a", to: "pij-b", body: "two" });
		const queued = q.listQueued("pij-b");
		expect(queued.map((m) => [m.seq, m.body])).toEqual([
			[1, "one"],
			[2, "two"],
		]);
		expect(q.seqOf(queued[0]?.messageId ?? "")).toBe(1);
		q.settle(1, "injected", { leaseMs: 1_000 });
		expect(q.listQueued("pij-b").map((m) => m.seq)).toEqual([2]);
		// the recipient still sees both
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value.length).toBe(2);
		// lease expiry re-queues seq 1 (attempt unchanged: settle does not count)
		now += 5_000;
		expect(q.recoverStaleClaims()).toBe(1);
		expect(q.listQueued("pij-b").map((m) => m.seq)).toEqual([1, 2]);
	});
});
