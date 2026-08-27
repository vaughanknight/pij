// Delivery decoupled from the tick (plan 071 D2, T004).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { DualWriteChannel } from "./adapters/channel-factory.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { SqliteQueue } from "./adapters/sqlite-queue.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const READY = "⏵⏵ auto mode on (shift+tab to cycle)";
const NOW_MS = Date.parse("2026-07-25T12:00:00.000Z");

let home: string;
let sent: Array<{ pane: string; text: string }>;
let logs: string[];
let nowMs: number;

beforeEach(async () => {
	home = mkdtempSync(join(tmpdir(), "pij-daemon-del-"));
	sent = [];
	logs = [];
	nowMs = NOW_MS;
});
afterEach(async () => {
	rmSync(home, { recursive: true, force: true });
});

function ports(): DaemonPorts {
	return {
		capturePane: () => READY,
		isPaneDead: () => false,
		sendText: (pane, text) => {
			sent.push({ pane, text });
			return "confirmed";
		},
		sendKey: () => {},
		killPane: () => {},
		listTranscripts: () => [],
		home: () => home,
		now: () => nowMs,
		isAlive: () => true,
	};
}

function seat(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: 100,
		startedAt: new Date(NOW_MS - 60_000).toISOString(),
		harness: "claude",
		lifecycle: "bound",
		harnessSessionId: "native-1",
		paneId: "%1",
		...over,
	};
}

function daemon(): Daemon {
	return new Daemon(home, ports(), new FsRegistry(home), new FsChannel(home), (line) =>
		logs.push(line),
	);
}

function queueDaemon(backend: "sqlite" | "dual"): {
	daemon: Daemon;
	queue: SqliteQueue;
	registry: FsRegistry;
} {
	const registry = new FsRegistry(home);
	const queue = new SqliteQueue(home, { now: () => nowMs });
	const channel = backend === "sqlite" ? queue : new DualWriteChannel(queue, new FsChannel(home));
	return {
		daemon: new Daemon(home, ports(), registry, channel, (line) => logs.push(line)),
		queue,
		registry,
	};
}

function completeClose(
	registry: FsRegistry,
	id: string,
	paneId = "%108",
	harnessSessionId = "native-1",
): void {
	const observedAt = new Date(nowMs).toISOString();
	registry.write(
		seat({
			id,
			paneId,
			harnessSessionId,
			closeIntent: {
				actor: "pij-boss",
				kind: "cli-close",
				requestedAt: observedAt,
			},
			terminal: {
				disposition: "requested",
				observedAt,
				evidence: "pane-missing",
			},
		}),
	);
	registry.dissolve(id);
}

describe("deliverPass", () => {
	it("injects pending mail WITHOUT a tick — delivery no longer rides tick duration", async () => {
		const registry = new FsRegistry(home);
		registry.write(seat({ id: "pij-worker", spawnedBy: "pij-boss" }));
		registry.write(seat({ id: "pij-boss", paneId: "%9", harnessSessionId: "native-boss" }));
		const d = daemon();
		d.tick(); // one tick to populate the index (a seat must be known to be served)
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "ship it" });
		await d.deliverPass();

		expect(sent.map((s) => s.text).join("\n")).toContain("ship it");
		expect(sent[0]?.pane).toBe("%1");
	});

	it("delivers repeatedly across passes with no tick in between", async () => {
		const registry = new FsRegistry(home);
		registry.write(seat({ id: "pij-worker" }));
		const d = daemon();
		await d.tick();
		sent.length = 0;

		const channel = new FsChannel(home);
		channel.deliver({ from: "pij-boss", to: "pij-worker", body: "first" });
		await d.deliverPass();
		channel.deliver({ from: "pij-boss", to: "pij-worker", body: "second" });
		await d.deliverPass();

		const injected = sent.map((s) => s.text).join("\n");
		expect(injected).toContain("first");
		expect(injected).toContain("second");
	});

	it("is idempotent — a pass with nothing pending injects nothing", async () => {
		new FsRegistry(home).write(seat({ id: "pij-worker" }));
		const d = daemon();
		await d.tick();
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "once" });
		await d.deliverPass();
		const afterFirst = sent.length;

		await d.deliverPass();
		await d.deliverPass();

		expect(sent.length).toBe(afterFirst);
	});

	// CONTROL for each refusal below: the same seat/message DOES deliver when the
	// refusing condition is removed (the test above), so these prove the guard.
	it("refuses an UNBOUND seat — a pending seat has no pane contract yet", async () => {
		new FsRegistry(home).write(seat({ id: "pij-worker", lifecycle: "pending" }));
		const d = daemon();
		await d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "too early" });
		await d.deliverPass();

		expect(sent.map((s) => s.text).join("\n")).not.toContain("too early");
	});

	it("refuses a COMPACTING seat — input injected mid-compaction is eaten by the harness", async () => {
		new FsRegistry(home).write(
			seat({ id: "pij-worker", compactingAt: new Date(NOW_MS - 1_000).toISOString() }),
		);
		const d = daemon();
		await d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "held back" });
		await d.deliverPass();

		expect(sent.map((s) => s.text).join("\n")).not.toContain("held back");
	});

	it("refuses a pi seat — pi owns its own inbox and the daemon must never touch it", async () => {
		new FsRegistry(home).write(seat({ id: "pij-pi-peer", harness: "pi" }));
		const d = daemon();
		await d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-pi-peer", body: "not yours" });
		await d.deliverPass();

		expect(sent).toEqual([]);
	});

	it("survives one seat throwing and still serves the others", async () => {
		const registry = new FsRegistry(home);
		registry.write(
			seat({ id: "pij-broken", paneId: undefined, harnessSessionId: "native-broken" }),
		);
		registry.write(seat({ id: "pij-worker" }));
		const d = daemon();
		await d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "still lands" });
		expect(() => d.deliverPass()).not.toThrow();
		expect(sent.map((s) => s.text).join("\n")).toContain("still lands");
	});

	it("the tick still drains too — the fast pass is an accelerator, not a single point of failure", async () => {
		new FsRegistry(home).write(seat({ id: "pij-worker" }));
		const d = daemon();
		await d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "reconciled" });
		d.tick(); // NO deliverPass at all

		expect(sent.map((s) => s.text).join("\n")).toContain("reconciled");
	});
});

describe("closed-recipient queue retirement", () => {
	it.each([
		"sqlite",
		"dual",
	] as const)("retires queued, injected, and parked rows after a complete deliberate close (%s)", async (backend) => {
		const { daemon: d, queue, registry } = queueDaemon(backend);
		try {
			const queued = queue.deliver({ from: "pij-a", to: "pij-closed", body: "queued" });
			const injected = queue.deliver({
				from: "pij-a",
				to: "pij-closed",
				body: "injected",
			});
			const parked = queue.deliver({ from: "pij-a", to: "pij-closed", body: "parked" });
			queue.deliver({ from: "pij-a", to: "pij-other", body: "untouched" });
			if (!queued.ok || !injected.ok || !parked.ok) throw new Error("deliver failed");
			const injectedSeq = queue.seqOf(injected.value.messageId);
			if (injectedSeq === undefined) throw new Error("missing injected seq");
			queue.settle(injectedSeq, "injected", { leaseMs: 60_000 });
			const parkedClaim = queue.claim("pij-closed", {
				leaseMs: 10,
				token: "park",
				maxAttempts: 1,
			});
			if (!parkedClaim) throw new Error("park claim failed");
			nowMs += 100;
			queue.recoverStaleClaims({ maxAttempts: 1 });
			completeClose(registry, "pij-closed");

			await d.tick();

			expect(queue.summary({ to: "pij-closed" }).map((row) => row.state)).toEqual([
				"retired",
				"retired",
				"retired",
			]);
			for (const id of [queued.value.messageId, injected.value.messageId, parked.value.messageId]) {
				expect(queue.receipts(id).at(-1)).toMatchObject({
					state: "retired",
					detail: "recipient-closed",
				});
			}
			expect(queue.summary({ to: "pij-other" }).map((row) => row.state)).toEqual(["queued"]);
			expect(
				logs.filter((line) =>
					line.includes("retire pij-closed: 3 open deliveries retired (recipient closed)"),
				),
			).toHaveLength(1);
		} finally {
			queue.close();
		}
	});

	it("leaves accidental dissolves, incomplete closes, live seats, and fs mail untouched", async () => {
		const { daemon: d, queue, registry } = queueDaemon("sqlite");
		try {
			registry.write(seat({ id: "pij-pane-gone" }));
			registry.dissolve("pij-pane-gone");
			registry.write(
				seat({
					id: "pij-closing",
					harness: "pi",
					harnessSessionId: "native-closing",
					closeIntent: {
						actor: "pij-boss",
						kind: "cli-close",
						requestedAt: new Date(nowMs).toISOString(),
					},
				}),
			);
			registry.write(seat({ id: "pij-live", harness: "pi", harnessSessionId: "native-live" }));
			registry.write(
				seat({
					id: "pij-requested-no-intent",
					harnessSessionId: "native-requested-no-intent",
					terminal: {
						disposition: "requested",
						observedAt: new Date(nowMs).toISOString(),
						evidence: "pane-missing",
					},
				}),
			);
			registry.dissolve("pij-requested-no-intent");
			registry.write(
				seat({
					id: "pij-close-unrequested",
					harnessSessionId: "native-close-unrequested",
					closeIntent: {
						actor: "pij-boss",
						kind: "cli-close",
						requestedAt: new Date(nowMs).toISOString(),
					},
					terminal: {
						disposition: "unrequested-by-pij",
						observedAt: new Date(nowMs).toISOString(),
						evidence: "pane-missing",
					},
				}),
			);
			registry.dissolve("pij-close-unrequested");
			completeClose(registry, "pij-revive-pending", "%109", "native-revive-pending");
			const revivePending = registry.read("pij-revive-pending");
			if (!revivePending) throw new Error("missing revive-pending descriptor");
			registry.writeExact({
				...revivePending,
				revivePendingAt: new Date(nowMs).toISOString(),
			});
			for (const to of [
				"pij-pane-gone",
				"pij-closing",
				"pij-live",
				"pij-requested-no-intent",
				"pij-close-unrequested",
				"pij-revive-pending",
			]) {
				queue.deliver({ from: "pij-a", to, body: to });
			}

			await d.tick();

			for (const to of [
				"pij-pane-gone",
				"pij-closing",
				"pij-live",
				"pij-requested-no-intent",
				"pij-close-unrequested",
				"pij-revive-pending",
			]) {
				expect(
					queue.summary({ to }).map((row) => row.state),
					`${to} must remain queued`,
				).toEqual(["queued"]);
			}
			expect(logs.some((line) => line.startsWith("retire "))).toBe(false);
		} finally {
			queue.close();
		}

		const fsDaemon = daemon();
		await expect(fsDaemon.tick()).resolves.toBeUndefined();
	});

	it("replays the recycled-pane incident without sending closed-seat mail", async () => {
		const { daemon: d, queue, registry } = queueDaemon("sqlite");
		try {
			registry.write(seat({ id: "pij-closed", paneId: "%108" }));
			await d.tick();
			queue.deliver({ from: "pij-a", to: "pij-closed", body: "first secret" });
			queue.deliver({ from: "pij-a", to: "pij-closed", body: "second secret" });
			completeClose(registry, "pij-closed", "%108");
			registry.write(
				seat({
					id: "pij-unrelated",
					paneId: "%108",
					harnessSessionId: "native-unrelated",
				}),
			);
			sent.length = 0;

			await d.tick();
			expect(sent).toEqual([]);
			expect(queue.summary({ to: "pij-closed" }).map((row) => row.state)).toEqual([
				"retired",
				"retired",
			]);
			for (let i = 0; i < 3; i++) {
				nowMs += 120_000;
				await d.tick();
			}
			expect(sent).toEqual([]);
			expect(
				queue
					.summary({ to: "pij-closed" })
					.every((row) => row.trail.at(-1)?.detail === "recipient-closed"),
			).toBe(true);
		} finally {
			queue.close();
		}
	});

	it("the independent drain guard never injects for a descriptor dissolved after indexing", async () => {
		const { daemon: d, queue, registry } = queueDaemon("sqlite");
		try {
			registry.write(seat({ id: "pij-closed", paneId: "%108" }));
			await d.tick();
			queue.deliver({ from: "pij-a", to: "pij-closed", body: "do not leak" });
			completeClose(registry, "pij-closed", "%108");
			registry.write(
				seat({
					id: "pij-unrelated",
					paneId: "%108",
					harnessSessionId: "native-unrelated",
				}),
			);
			sent.length = 0;
			logs.length = 0;

			await d.deliverPass();
			await d.deliverPass();

			expect(sent).toEqual([]);
			expect(queue.summary({ to: "pij-closed" }).map((row) => row.state)).toEqual(["queued"]);
			expect(
				logs.filter((line) => line.includes("skip dissolved recipient pij-closed")),
			).toHaveLength(1);
		} finally {
			queue.close();
		}
	});

	it("requeues close-retired mail on revive and delivers each message exactly once", async () => {
		const { daemon: d, queue, registry } = queueDaemon("sqlite");
		try {
			registry.write(seat({ id: "pij-revived", paneId: "%108" }));
			queue.deliver({ from: "pij-a", to: "pij-revived", body: "one" });
			queue.deliver({ from: "pij-a", to: "pij-revived", body: "two" });
			completeClose(registry, "pij-revived", "%108");
			await d.tick();
			expect(queue.summary({ to: "pij-revived" }).map((row) => row.state)).toEqual([
				"retired",
				"retired",
			]);

			const revived = registry.revive(
				seat({
					id: "pij-revived",
					paneId: "%109",
					pid: 101,
				}),
			);
			expect(revived.ok).toBe(true);
			expect(
				queue.unretire(
					{ to: "pij-revived", reason: "recipient-closed" },
					{ detail: "revived by pij-boss → pane %109" },
				),
			).toEqual({ requeued: 2 });
			expect(queue.summary({ to: "pij-revived" }).map((row) => row.state)).toEqual([
				"queued",
				"queued",
			]);
			sent.length = 0;

			await d.tick();
			expect(sent).toHaveLength(2);
			const afterDelivery = sent.length;
			await d.tick();
			expect(sent).toHaveLength(afterDelivery);
			expect(
				queue
					.summary({ to: "pij-revived" })
					.every((row) => row.trail.some((receipt) => receipt.state === "requeued")),
			).toBe(true);
		} finally {
			queue.close();
		}
	});
});
