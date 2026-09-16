// Durable pending delivery across a daemon restart (plan 071 D7).
//
// Evidence this exists: two "47 ack" messages were accepted with a `queued`
// receipt on 2026-07-25, lost across a daemon restart, and hand-pasted by the
// operator. `SendBuffer` is memory-only — which its own comment claimed was safe
// because unconsumed inbox files survive — but the drain marked BUFFERED
// messages read, so the durable copy was deleted while the only remaining copy
// lived in a FIFO that dies with the process.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const READY = "⏵⏵ auto mode on (shift+tab to cycle)";
const NOW_MS = Date.parse("2026-07-25T12:00:00.000Z");

let home: string;
let sent: Array<{ pane: string; text: string }>;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-durable-"));
	sent = [];
	failNextSends = 0;
});
afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

/** When set, the next N sends report `failed` (the adapter's pre-submission
 *  throw) instead of landing. This is the REACHABLE loss path: a bound seat whose
 *  send throws before submission. */
let failNextSends = 0;

function ports(): DaemonPorts {
	return {
		capturePane: () => READY,
		isPaneDead: () => false,
		sendText: (pane, text) => {
			if (failNextSends > 0) {
				failNextSends -= 1;
				return "failed"; // threw before submission — nothing landed
			}
			sent.push({ pane, text });
			return "confirmed";
		},
		sendKey: () => {},
		killPane: () => {},
		listTranscripts: () => [],
		home: () => home,
		now: () => NOW_MS,
		isAlive: () => true,
	};
}

/** A fresh Daemon over the SAME pijHome — i.e. a restart. All in-memory state
 *  (SendBuffer included) is gone; only the filesystem carries over. */
function bootDaemon(): Daemon {
	return new Daemon(home, ports(), new FsRegistry(home), new FsChannel(home), () => {});
}

function seat(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: 100,
		startedAt: new Date(NOW_MS - 60_000).toISOString(),
		harness: "claude",
		paneId: "%1",
		...over,
	};
}

function injected(): string[] {
	return sent.map((s) => s.text);
}

describe("a send that never landed keeps its durable copy", () => {
	// THE reachable loss path. `DaemonTmux.sendText` collapsed two very different
	// failures into `unverified`: "payload was typed, submission unconfirmed"
	// (replay would duplicate a turn, so consuming is right) and "threw BEFORE
	// submission, nothing typed" (consuming destroys the only copy). The caller
	// consumed both. Plan 071 D7 splits the second out as `failed`.
	it("a bound seat whose send FAILS keeps the message unread, and a restart delivers it", () => {
		new FsRegistry(home).write(
			seat({ id: "pij-worker", lifecycle: "bound", harnessSessionId: "native-1" }),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "47 ack" });

		failNextSends = 1;
		const first = bootDaemon();
		first.tick();
		expect(injected().join("\n")).not.toContain("47 ack"); // the send threw

		// The durable copy MUST still be there — this is the whole fix.
		const unread = new FsChannel(home).listUnread("pij-worker");
		expect(unread.ok).toBe(true);
		if (!unread.ok) return;
		expect(unread.value.map((m) => m.body)).toContain("47 ack");

		first.dispose();

		// Restart: a fresh daemon, empty SendBuffer, working tmux.
		bootDaemon().tick();
		expect(injected().filter((t) => t.includes("47 ack"))).toHaveLength(1);
	});

	// CONTROL: an `unverified` send (payload WAS typed) still consumes, because
	// replaying it could duplicate an already-accepted turn. If this ever starts
	// retrying, the fix has over-corrected loss into duplication.
	it("control — an UNVERIFIED send still consumes (replay would duplicate a turn)", () => {
		new FsRegistry(home).write(
			seat({ id: "pij-worker", lifecycle: "bound", harnessSessionId: "native-1" }),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "typed once" });

		const daemon = new Daemon(
			home,
			{
				...ports(),
				sendText: (pane: string, text: string) => {
					sent.push({ pane, text });
					return "unverified" as const;
				},
			},
			new FsRegistry(home),
			new FsChannel(home),
			() => {},
		);
		daemon.tick();

		const unread = new FsChannel(home).listUnread("pij-worker");
		expect(unread.ok).toBe(true);
		if (!unread.ok) return;
		expect(unread.value.map((m) => m.body)).not.toContain("typed once");
	});

	it("a failed send is retried on the very next pass, not only after a restart", () => {
		new FsRegistry(home).write(
			seat({ id: "pij-worker", lifecycle: "bound", harnessSessionId: "native-1" }),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "retry me" });

		failNextSends = 1;
		const daemon = bootDaemon();
		daemon.tick();
		expect(injected().filter((t) => t.includes("retry me"))).toHaveLength(0);

		daemon.tick();
		expect(injected().filter((t) => t.includes("retry me"))).toHaveLength(1);

		// …and exactly once thereafter.
		daemon.tick();
		daemon.deliverPass();
		expect(injected().filter((t) => t.includes("retry me"))).toHaveLength(1);
	});
});

describe("a message queued for an unbound seat survives a daemon restart", () => {
	it("delivers EXACTLY ONCE after the daemon is killed and restarted", () => {
		const registry = new FsRegistry(home);
		// Unbound: this is the branch that used to buffer-and-consume.
		registry.write(seat({ id: "pij-worker", lifecycle: "pending" }));
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "47 ack" });

		// Daemon #1 sees it while the seat is still unbound, then dies.
		const first = bootDaemon();
		first.tick();
		expect(injected().join("\n")).not.toContain("47 ack"); // correctly not injected yet
		first.dispose();

		// Restart. The SendBuffer is gone; only the inbox file can carry the message.
		registry.write(seat({ id: "pij-worker", lifecycle: "bound", harnessSessionId: "native-1" }));
		const second = bootDaemon();
		second.tick();

		const delivered = injected().filter((text) => text.includes("47 ack"));
		expect(delivered).toHaveLength(1);

		// And it stays exactly one — no redelivery on subsequent passes.
		second.tick();
		second.deliverPass();
		expect(injected().filter((text) => text.includes("47 ack"))).toHaveLength(1);
	});

	// CONTROL: the message must be genuinely UNREAD while buffered. If this ever
	// passes with the message marked read, the durability above is accidental.
	it("control — a buffered message is still listed as unread on disk", () => {
		new FsRegistry(home).write(seat({ id: "pij-worker", lifecycle: "pending" }));
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "47 ack" });

		bootDaemon().tick();

		const unread = new FsChannel(home).listUnread("pij-worker");
		expect(unread.ok).toBe(true);
		if (!unread.ok) return;
		expect(unread.value.map((m) => m.body)).toContain("47 ack");
	});

	// CONTROL for exactly-once: an ALREADY-injected message must not come back
	// after a restart, or the fix would have traded loss for duplication.
	it("control — a delivered message is NOT redelivered after a restart", () => {
		new FsRegistry(home).write(
			seat({ id: "pij-worker", lifecycle: "bound", harnessSessionId: "native-1" }),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "already landed" });

		const first = bootDaemon();
		first.tick();
		expect(injected().filter((t) => t.includes("already landed"))).toHaveLength(1);
		first.dispose();

		bootDaemon().tick();
		expect(injected().filter((t) => t.includes("already landed"))).toHaveLength(1);
	});

	it("preserves arrival order across the restart", () => {
		const registry = new FsRegistry(home);
		registry.write(seat({ id: "pij-worker", lifecycle: "pending" }));
		const channel = new FsChannel(home);
		channel.deliver({ from: "pij-boss", to: "pij-worker", body: "first message" });
		channel.deliver({ from: "pij-boss", to: "pij-worker", body: "second message" });

		bootDaemon().tick();
		registry.write(seat({ id: "pij-worker", lifecycle: "bound", harnessSessionId: "native-1" }));
		bootDaemon().tick();

		const order = injected().join("\n");
		expect(order).toContain("first message");
		expect(order).toContain("second message");
		expect(order.indexOf("first message")).toBeLessThan(order.indexOf("second message"));
	});
});
