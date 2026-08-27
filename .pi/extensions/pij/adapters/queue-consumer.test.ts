// pij-messaging — at-least-once SQLite queue consumer contract.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startQueueConsumer } from "./queue-consumer.js";
import { SqliteQueue } from "./sqlite-queue.js";

const SELF = "pij-telegram";

let home: string;
let queue: SqliteQueue;
let now: number;
let disposers: Array<() => void>;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-queue-consumer-"));
	now = 1_000;
	queue = new SqliteQueue(home, { now: () => now });
	disposers = [];
});

afterEach(() => {
	for (const dispose of disposers) dispose();
	queue.close();
	rmSync(home, { recursive: true, force: true });
});

async function waitFor(pred: () => boolean, timeoutMs = 2_000): Promise<void> {
	const start = Date.now();
	while (!pred()) {
		if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition never held");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function deliver(body: string, kind?: "receipt"): string {
	const result = queue.deliver({ from: "pij-sender", to: SELF, body, ...(kind ? { kind } : {}) });
	if (!result.ok) throw new Error(result.message);
	return result.value.messageId;
}

function setDeliveryState(seq: number, state: "failed"): void {
	const db = new DatabaseSync(queue.dbPath);
	try {
		db.prepare(
			"UPDATE deliveries SET state = ?, claim_token = NULL, lease_until = NULL, updated_at = ? WHERE seq = ?",
		).run(state, now, seq);
	} finally {
		db.close();
	}
}

describe("startQueueConsumer", () => {
	it("claims, handles, and acks queued rows exactly once in seq order within one scan", async () => {
		const ids = [deliver("one"), deliver("two"), deliver("three")];
		const handled: Array<{ body: string; attempt: number }> = [];
		const scans: number[] = [];
		disposers.push(
			startQueueConsumer({
				queue,
				self: SELF,
				pollMs: 1_000,
				now: () => now,
				onScan: (atMs) => scans.push(atMs),
				onMessage: async (message) => {
					handled.push({ body: message.body, attempt: message.attempt });
				},
			}),
		);

		await waitFor(() => queue.summary({ to: SELF }).every((row) => row.state === "acked"));

		expect(handled).toEqual([
			{ body: "one", attempt: 1 },
			{ body: "two", attempt: 1 },
			{ body: "three", attempt: 1 },
		]);
		expect(scans).toEqual([now]);
		for (const id of ids) {
			expect(queue.receipts(id).map((receipt) => receipt.state)).toEqual([
				"queued",
				"claimed",
				"acked",
			]);
			expect(queue.receipts(id).at(-1)?.detail).toBe(`reader=${SELF}`);
		}
	});

	it("hands receipt rows to the handler and acks them without special-casing", async () => {
		const id = deliver("delivery receipt", "receipt");
		const kinds: Array<string | undefined> = [];
		disposers.push(
			startQueueConsumer({
				queue,
				self: SELF,
				onMessage: async (message) => {
					kinds.push(message.kind);
				},
			}),
		);

		await waitFor(() => queue.summary({ to: SELF })[0]?.state === "acked");

		expect(kinds).toEqual(["receipt"]);
		expect(queue.receipts(id).map((receipt) => receipt.state)).toEqual([
			"queued",
			"claimed",
			"acked",
		]);
	});

	it("leaves a rejected row claimed, redelivers after lease recovery, and parks at max attempts", async () => {
		const id = deliver("retry me");
		const attempts: number[] = [];
		disposers.push(
			startQueueConsumer({
				queue,
				self: SELF,
				pollMs: 10,
				leaseMs: 100,
				onMessage: async (message) => {
					attempts.push(message.attempt);
					throw new Error("handler rejected");
				},
			}),
		);

		await waitFor(() => queue.summary({ to: SELF })[0]?.state === "claimed");
		expect(attempts).toEqual([1]);
		expect(queue.receipts(id).map((receipt) => receipt.state)).toEqual(["queued", "claimed"]);

		now += 101;
		expect(queue.recoverStaleClaims({ maxAttempts: 2 })).toBe(1);
		await waitFor(() => queue.summary({ to: SELF })[0]?.attempt === 2);
		expect(attempts).toEqual([1, 2]);

		now += 101;
		expect(queue.recoverStaleClaims({ maxAttempts: 2 })).toBe(1);
		expect(queue.summary({ to: SELF })[0]).toMatchObject({ state: "parked", attempt: 2 });
		expect(queue.receipts(id).map((receipt) => receipt.state)).toEqual([
			"queued",
			"claimed",
			"redelivered",
			"claimed",
			"parked",
		]);
		expect(queue.receipts(id).some((receipt) => receipt.state === "released")).toBe(false);
		expect(queue.receipts(id).some((receipt) => receipt.state === "acked")).toBe(false);
	});

	it("drains queued backlog only and never handles acked, failed, or parked rows", async () => {
		const acked = deliver("already-acked");
		queue.claimUnread(SELF, acked, { messageId: acked, reader: SELF });
		deliver("failed");
		setDeliveryState(2, "failed");
		deliver("parked");
		queue.claim(SELF, { leaseMs: 10, token: "pre-park" });
		now += 11;
		queue.recoverStaleClaims({ maxAttempts: 1 });
		deliver("queued-a");
		deliver("queued-b");

		const handled: string[] = [];
		disposers.push(
			startQueueConsumer({
				queue,
				self: SELF,
				onMessage: async (message) => {
					handled.push(message.body);
				},
			}),
		);

		await waitFor(() => handled.length === 2);

		expect(handled).toEqual(["queued-a", "queued-b"]);
		expect(queue.summary({ to: SELF }).map((row) => [row.seq, row.state])).toEqual([
			[1, "acked"],
			[2, "failed"],
			[3, "parked"],
			[4, "acked"],
			[5, "acked"],
		]);
	});

	it("fires one heartbeat per scan and dispose stops future scans and claims", async () => {
		const scans: number[] = [];
		const handled: string[] = [];
		const dispose = startQueueConsumer({
			queue,
			self: SELF,
			pollMs: 10,
			now: () => now,
			onScan: (atMs) => scans.push(atMs),
			onMessage: async (message) => {
				handled.push(message.body);
			},
		});
		disposers.push(dispose);

		await waitFor(() => scans.length >= 3);
		dispose();
		const scansAtDispose = scans.length;
		deliver("after dispose");
		await sleep(50);

		expect(scans).toHaveLength(scansAtDispose);
		expect(scans.every((atMs) => atMs === now)).toBe(true);
		expect(handled).toEqual([]);
		expect(queue.summary({ to: SELF })[0]?.state).toBe("queued");
	});
});
