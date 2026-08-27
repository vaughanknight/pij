// PoC (poc/comms-sqlite-socket): SQLite WAL as the durable peer-message queue.
// These tests encode the failures of 2026-08-27: a 3 KB multi-line body must
// round-trip byte-exact; a crash between claim and inject must redeliver; a
// duplicate ack must be absorbed; ordering is per recipient by seq.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

	it("persists Telegram sent-part indices idempotently across queue reopen", () => {
		const sent = q.deliver(
			{ from: "pij-a", to: "pij-telegram", body: "chunked" },
			{ messageId: "m-parts" },
		);
		if (!sent.ok) throw new Error(sent.message);
		expect([...q.telegramSentParts(sent.value.messageId)]).toEqual([]);
		q.markTelegramPartSent(sent.value.messageId, 0);
		q.markTelegramPartSent(sent.value.messageId, 2);
		q.markTelegramPartSent(sent.value.messageId, 0);
		expect([...q.telegramSentParts(sent.value.messageId)]).toEqual([0, 2]);

		q.close();
		q = new SqliteQueue(home, { now: () => now });
		expect([...q.telegramSentParts(sent.value.messageId)]).toEqual([0, 2]);
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

describe("SqliteQueue — retired terminal state", () => {
	it("retires matching open rows once and every mutator preserves terminality", () => {
		const injected = q.deliver({ from: "pij-a", to: "pij-x", body: "injected" });
		const queued = q.deliver({ from: "pij-b", to: "pij-x", body: "queued" });
		q.deliver({ from: "pij-a", to: "pij-y", body: "other recipient" });
		if (!injected.ok || !queued.ok) throw new Error("deliver failed");
		const claimed = q.claim("pij-x", { leaseMs: 60_000, token: "claim-x" });
		if (!claimed) throw new Error("claim failed");
		q.settle(claimed.seq, "injected", { leaseMs: 60_000 });

		expect(q.retire({ to: "pij-x" }, "stale")).toEqual({ matched: 2, retired: 2 });
		expect(q.retire({ to: "pij-x" }, "stale")).toEqual({ matched: 0, retired: 0 });
		expect(q.summary({ to: "pij-x" }).map((row) => [row.state, row.leaseUntil])).toEqual([
			["retired", null],
			["retired", null],
		]);
		expect(q.listQueued("pij-x")).toEqual([]);
		const unread = q.listUnread("pij-x");
		expect(unread.ok && unread.value).toEqual([]);
		expect(q.summary({ to: "pij-y" }).map((row) => row.state)).toEqual(["queued"]);
		expect(q.stats("pij-x")).toMatchObject({ retired: 2, queued: 0, injected: 0 });

		const db = new DatabaseSync(q.dbPath, { readOnly: true });
		try {
			expect(
				db
					.prepare(
						"SELECT state, claim_token, lease_until FROM deliveries WHERE to_id = ? ORDER BY seq",
					)
					.all("pij-x"),
			).toEqual([
				{ state: "retired", claim_token: null, lease_until: null },
				{ state: "retired", claim_token: null, lease_until: null },
			]);
		} finally {
			db.close();
		}

		const receiptCounts = [injected.value.messageId, queued.value.messageId].map(
			(id) => q.receipts(id).length,
		);
		const retiredClaim = q.claimUnread("pij-x", injected.value.messageId);
		expect(retiredClaim.ok && retiredClaim.value.kind).toBe("already-read");
		const marked = q.markRead("pij-x", queued.value.messageId);
		expect(marked.ok && marked.value.kind).toBe("already-read");
		q.settle(claimed.seq, "queued", { detail: "must not revive" });
		q.settle(claimed.seq, "injected", { leaseMs: 1, detail: "must not revive" });
		expect(q.claim("pij-x", { leaseMs: 1, token: "must-not-claim" })).toBeUndefined();
		now += 100_000;
		expect(q.recoverStaleClaims()).toBe(0);
		expect(q.resetClaimsOnStart()).toBe(0);
		expect(q.summary({ to: "pij-x" }).map((row) => row.state)).toEqual(["retired", "retired"]);
		expect(
			[injected.value.messageId, queued.value.messageId].map((id) => q.receipts(id).length),
		).toEqual(receiptCounts);
	});

	it("retires parked rows and honours explicit state and message-age filters", () => {
		const parked = q.deliver({ from: "pij-a", to: "pij-x", body: "park me" });
		if (!parked.ok) throw new Error(parked.message);
		const claimed = q.claim("pij-x", { leaseMs: 10, token: "park", maxAttempts: 1 });
		if (!claimed) throw new Error("claim failed");
		now += 100;
		expect(q.recoverStaleClaims({ maxAttempts: 1 })).toBe(1);
		q.deliver({ from: "pij-a", to: "pij-x", body: "leave queued" });

		expect(q.retire({ to: "pij-x", state: ["parked"] }, "parked-cleanup")).toEqual({
			matched: 1,
			retired: 1,
		});
		expect(q.summary({ to: "pij-x" }).map((row) => row.state)).toEqual(["retired", "queued"]);

		q.deliver({ from: "pij-a", to: "pij-age", body: "old" });
		now += 1_000;
		q.deliver({ from: "pij-a", to: "pij-age", body: "young" });
		expect(q.retire({ to: "pij-age", olderThanMs: 500 }, "aged")).toEqual({
			matched: 1,
			retired: 1,
		});
		expect(q.summary({ to: "pij-age" }).map((row) => row.state)).toEqual(["retired", "queued"]);
	});

	it("unretires only recipient-closed rows and records revive evidence", () => {
		const closedOne = q.deliver({ from: "pij-close", to: "pij-x", body: "one" });
		const closedTwo = q.deliver({ from: "pij-close", to: "pij-x", body: "two" });
		const operator = q.deliver({ from: "pij-operator", to: "pij-x", body: "stay retired" });
		if (!closedOne.ok || !closedTwo.ok || !operator.ok) throw new Error("deliver failed");
		const parked = q.claim("pij-x", { leaseMs: 10, token: "before-close", maxAttempts: 1 });
		if (!parked) throw new Error("claim failed");
		now += 100;
		q.recoverStaleClaims({ maxAttempts: 1 });
		expect(q.retire({ to: "pij-x", from: "pij-close" }, "recipient-closed").retired).toBe(2);
		expect(q.retire({ to: "pij-x", from: "pij-operator" }, "stale").retired).toBe(1);

		expect(
			q.unretire(
				{ to: "pij-x", reason: "recipient-closed" },
				{ detail: "revived by pij-boss → pane %9" },
			),
		).toEqual({ requeued: 2 });
		expect(q.summary({ to: "pij-x" }).map((row) => row.state)).toEqual([
			"queued",
			"queued",
			"retired",
		]);
		expect(
			q
				.summary({ to: "pij-x" })
				.slice(0, 2)
				.map((row) => row.attempt),
		).toEqual([0, 0]);
		for (const id of [closedOne.value.messageId, closedTwo.value.messageId]) {
			expect(q.receipts(id).at(-1)).toMatchObject({
				state: "requeued",
				detail: "revived by pij-boss → pane %9",
			});
		}
		expect(q.receipts(operator.value.messageId).at(-1)).toMatchObject({
			state: "retired",
			detail: "stale",
		});
	});
});

describe("SqliteQueue — summary (pij queue view, day-2 item 2)", () => {
	it("reports each message's live state and receipt trail, filtered by recipient", () => {
		const s1 = q.deliver({ from: "pij-a", to: "pij-b", body: "one" });
		q.deliver({ from: "pij-a", to: "pij-c", body: "other recipient" });
		const s3 = q.deliver({ from: "pij-a", to: "pij-b", body: "two" });
		if (!s1.ok || !s3.ok) throw new Error("deliver failed");
		// advance one through the machine
		const c = q.claim("pij-b", { leaseMs: 90_000, token: "t" });
		if (!c) throw new Error("no claim");
		q.settle(c.seq, "injected", { leaseMs: 90_000 });
		q.claimUnread("pij-b", s3.value.messageId); // ack the other
		const rows = q.summary({ to: "pij-b" });
		expect(rows.map((r) => [r.seq, r.state, r.attempt])).toEqual([
			[1, "injected", 1],
			[3, "acked", 0],
		]);
		expect(rows[0]?.trail.map((t) => t.state)).toEqual(["queued", "claimed", "injected"]);
		expect(rows[1]?.trail.map((t) => t.state)).toEqual(["queued", "acked"]);
		expect(rows.every((r) => r.to === "pij-b")).toBe(true);
		expect(rows[0]?.bytes).toBe(3);
	});

	it("honours sinceSeq and limit", () => {
		for (let i = 0; i < 5; i++) q.deliver({ from: "pij-a", to: "pij-b", body: `m${i}` });
		expect(q.summary({ to: "pij-b", sinceSeq: 3 }).map((r) => r.seq)).toEqual([4, 5]);
		expect(q.summary({ to: "pij-b", limit: 2 }).map((r) => r.seq)).toEqual([4, 5]);
	});

	it("labels a command message and shows an active lease countdown input", () => {
		q.deliver({ from: "pij-a", to: "pij-b", body: "", command: "compact" });
		const c = q.claim("pij-b", { leaseMs: 60_000, token: "t" });
		if (c) q.settle(c.seq, "injected", { leaseMs: 60_000 });
		const row = q.summary({ to: "pij-b" })[0];
		expect(row?.kind).toBe("cmd:compact");
		expect(row?.leaseUntil).toBe(now + 60_000);
	});
});

describe("SqliteQueue — fs→sqlite migration (day-2 item 6)", () => {
	it("importUnread inserts fs messages idempotently on their id", () => {
		const fsMsgs = [
			{ messageId: "1787000000000-000001-42", from: "pij-a", to: "pij-b", body: "one" },
			{ messageId: "1787000000001-000002-42", from: "pij-a", to: "pij-b", body: "two" },
		];
		const first = q.importUnread(fsMsgs);
		expect(first).toEqual({ imported: 2, skipped: 0 });
		const again = q.importUnread(fsMsgs);
		expect(again).toEqual({ imported: 0, skipped: 2 });
		const unread = q.listUnread("pij-b");
		expect(unread.ok && unread.value.map((m) => [m.messageId, m.body])).toEqual([
			["1787000000000-000001-42", "one"],
			["1787000000001-000002-42", "two"],
		]);
	});
});
