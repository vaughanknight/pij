// PoC (poc/comms-sqlite-socket): `pij inbox` over the SQLite queue. `runInbox`
// in cli.ts calls consumeInbox({ inbox: openChannel(pijHome) … }) — this drives
// that exact pure path with the SqliteQueue adapter, so the CLI verb switches
// backends by construction.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteQueue } from "../adapters/sqlite-queue.js";
import { consumeInbox } from "./inbox.js";

let home: string;
let q: SqliteQueue;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-inbox-sqlite-"));
	q = new SqliteQueue(home);
});
afterEach(() => {
	q.close();
	rmSync(home, { recursive: true, force: true });
});

describe("pij inbox over SqliteQueue", () => {
	it("returns unread bodies in order, acks them, and emits delivered receipts to each sender", () => {
		const big = `HEAD\n${"z".repeat(3000)}\nTAIL`;
		q.deliver({ from: "pij-a", to: "pij-me", body: big });
		q.deliver({ from: "pij-b", to: "pij-me", body: "second" });
		q.deliver({ from: "pij-a", to: "pij-other", body: "not mine" });
		const first = consumeInbox({ inbox: q, self: "pij-me", readAt: "2026-08-27T00:00:00Z" });
		if (!first.ok) throw new Error(first.message);
		expect(first.value.messages.map((m) => [m.from, m.body])).toEqual([
			["pij-a", big],
			["pij-b", "second"],
		]);
		expect(first.value.actions.map((a) => a.kind)).toEqual([
			"send-delivered-receipt",
			"send-delivered-receipt",
		]);
		expect(q.stats("pij-me")).toMatchObject({ acked: 2, queued: 0 });
		// second read: nothing new, nothing re-delivered
		const again = consumeInbox({ inbox: q, self: "pij-me", readAt: "2026-08-27T00:00:01Z" });
		expect(again.ok && again.value.messages).toEqual([]);
	});

	it("a message the daemon has claimed/injected (pointer path) is still readable by the recipient", () => {
		q.deliver({ from: "pij-a", to: "pij-me", body: "pointer body" });
		const c = q.claim("pij-me", { leaseMs: 60_000, token: "t" });
		if (!c) throw new Error("no claim");
		q.settle(c.seq, "injected", { leaseMs: 60_000 });
		const read = consumeInbox({ inbox: q, self: "pij-me", readAt: "2026-08-27T00:00:00Z" });
		expect(read.ok && read.value.messages.map((m) => m.body)).toEqual(["pointer body"]);
		expect(q.stats("pij-me")).toMatchObject({ acked: 1, injected: 0 });
	});
});

describe("pij send --wait over SqliteQueue (day-2 item 2)", () => {
	it("the delivered-receipt the recipient's inbox emits is readable by the sender's wait loop", () => {
		// deliver A→B, B reads (which queues a delivered receipt back to A), A sees it.
		const sent = q.deliver({ from: "pij-a", to: "pij-b", body: "hi" });
		if (!sent.ok) throw new Error(sent.message);
		const read = consumeInbox({ inbox: q, self: "pij-b", readAt: "2026-08-27T00:00:00Z" });
		if (!read.ok) throw new Error(read.message);
		// consumeInbox returns a send-delivered-receipt action; executing it delivers
		// a kind:"receipt" message to the sender — the exact envelope waitReceipts reads.
		const receiptAction = read.value.actions.find((a) => a.kind === "send-delivered-receipt");
		expect(receiptAction).toBeDefined();
		if (receiptAction?.kind === "send-delivered-receipt") {
			q.deliver({
				from: "pij-b",
				to: receiptAction.to,
				body: `receipt:${receiptAction.messageId}:delivered`,
				kind: "receipt",
			});
		}
		const senderInbox = q.listUnread("pij-a");
		expect(senderInbox.ok && senderInbox.value[0]?.kind).toBe("receipt");
		expect(senderInbox.ok && senderInbox.value[0]?.body).toContain("delivered");
	});
});
