import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import { receiptBody } from "./core/message.js";
import { DAEMON_TICK_STALE_AFTER_MS, daemonTickStatus } from "./core/receipts.js";
import { STALE_AFTER_MS } from "./core/state.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const READY = "⏵⏵ auto mode on (shift+tab to cycle)";
const NOW_MS = Date.parse("2026-06-28T00:00:00.000Z");
const FRESH_AT = new Date(NOW_MS - 5_000).toISOString();
const STALE_AT = new Date(NOW_MS - STALE_AFTER_MS - 1).toISOString();

let home: string;
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-daemon-"));
});
afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: 100,
		startedAt: "2026-06-27T00:00:00.000Z",
		...over,
	};
}

interface FakePortsOptions {
	readonly alive?: boolean;
	readonly nowMs?: number;
	readonly paneText?: string | (() => string);
	readonly sendOutcome?: "confirmed" | "unverified";
	readonly sendErrorForPane?: string;
}

function fakePorts(
	options: FakePortsOptions = {},
): DaemonPorts & { sent: Array<{ pane: string; text: string }>; killed: string[] } {
	const sent: Array<{ pane: string; text: string }> = [];
	const killed: string[] = [];
	const paneText = options.paneText;
	return {
		sent,
		killed,
		capturePane: () => (typeof paneText === "function" ? paneText() : (paneText ?? READY)),
		isPaneDead: () => false,
		sendText: (pane, text) => {
			if (pane === options.sendErrorForPane) throw new Error(`can't find pane: ${pane}`);
			sent.push({ pane, text });
			return options.sendOutcome ?? "confirmed";
		},
		sendKey: () => {},
		killPane: (pane) => killed.push(pane),
		listTranscripts: () => [],
		home: () => home,
		now: () => options.nowMs ?? 1000,
		isAlive: () => options.alive ?? true,
	};
}

function messageBodies(to: string): string[] {
	const inbox = join(home, to, "inbox");
	try {
		return readdirSync(inbox)
			.filter((n) => n.startsWith("msg-") && n.endsWith(".json"))
			.sort()
			.map((n) => {
				const message = JSON.parse(readFileSync(join(inbox, n), "utf8")) as { body: string };
				return message.body;
			});
	} catch {
		return [];
	}
}

function unreadBodies(to: string): string[] {
	const unread = new FsChannel(home).listUnread(to);
	if (!unread.ok) throw new Error(unread.message);
	return unread.value.map((message) => message.body);
}

function messagePath(to: string, messageId: string): string {
	return join(home, to, "inbox", `msg-${messageId}.json`);
}

function markerPath(to: string, messageId: string): string {
	return join(home, to, "inbox", `read-${messageId}.json`);
}

describe("Daemon.tick (bin wiring vs a real tmp ~/.pij)", () => {
	it("persists lastTickAt so an unticked/wedged daemon becomes mechanically stale", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const ports = fakePorts({ nowMs: NOW_MS });
		const daemon = new Daemon(home, ports, registry, new FsChannel(home));

		daemon.tick();

		const lastTickAt = registry.read("pij-c")?.lastTickAt;
		expect(lastTickAt).toBe(new Date(NOW_MS).toISOString());
		// Simulate a wedged daemon: wall time advances but no second tick occurs.
		expect(daemonTickStatus(lastTickAt, NOW_MS + DAEMON_TICK_STALE_AFTER_MS + 1)).toMatchObject({
			daemonTickStale: true,
		});
	});

	it("drives a pending claude session: ready pane → init injected + marker persisted", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-c", harness: "claude", lifecycle: "pending", paneId: "%4" }));
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent.some((s) => s.pane === "%4" && s.text.includes("pij phonehome"))).toBe(true);
		expect(registry.read("pij-c")?.initInjectedAt).toBeTruthy();
	});

	it("retains a BOUND tmux message, marks it after injection outcome, and skips replay", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const delivered = new FsChannel(home).deliver({
			from: "pij-boss",
			to: "pij-c",
			body: "review the diff",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		const ports = fakePorts();
		const baseSendText = ports.sendText;
		let markerDuringInjection: boolean | undefined;
		ports.sendText = (pane, text, harness, pid) => {
			markerDuringInjection = existsSync(markerPath("pij-c", delivered.value.messageId));
			return baseSendText(pane, text, harness, pid);
		};
		const daemon = new Daemon(home, ports, registry, new FsChannel(home));
		daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] review the diff" });
		expect(markerDuringInjection).toBe(false);
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		expect(unreadBodies("pij-c")).toEqual([]);
		expect(messageBodies("pij-boss")).toContain(
			`[pij receipt ${delivered.value.messageId}] delivered`,
		);
		daemon.tick();
		expect(ports.sent.filter((sent) => sent.text.includes("review the diff"))).toHaveLength(1);
	});

	it("preserves same-target progress when a later tmux injection fails", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const channel = new FsChannel(home);
		const first = channel.deliver({ from: "pij-boss", to: "pij-c", body: "first message" });
		const second = channel.deliver({ from: "pij-boss", to: "pij-c", body: "second message" });
		if (!first.ok) throw new Error(first.message);
		if (!second.ok) throw new Error(second.message);
		const ports = fakePorts();
		const baseSendText = ports.sendText;
		const attempts: string[] = [];
		let firstProgressVisibleOnFailure = false;
		ports.sendText = (pane, text, harness, pid) => {
			attempts.push(text);
			if (text.includes("second message")) {
				firstProgressVisibleOnFailure =
					existsSync(markerPath("pij-c", first.value.messageId)) &&
					messageBodies("pij-boss").includes(receiptBody(first.value.messageId, "delivered"));
				throw new Error("injected second-message failure");
			}
			return baseSendText(pane, text, harness, pid);
		};
		const daemon = new Daemon(home, ports, registry, channel);

		daemon.tick();

		expect(firstProgressVisibleOnFailure).toBe(true);
		expect(existsSync(markerPath("pij-c", first.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", second.value.messageId))).toBe(false);
		expect(unreadBodies("pij-c")).toEqual(["second message"]);
		expect(messageBodies("pij-boss")).toContain(receiptBody(first.value.messageId, "delivered"));
		expect(messageBodies("pij-boss")).not.toContain(
			receiptBody(second.value.messageId, "delivered"),
		);

		daemon.tick();

		expect(attempts.filter((text) => text.includes("first message"))).toHaveLength(1);
		expect(attempts.filter((text) => text.includes("second message"))).toHaveLength(2);
		expect(unreadBodies("pij-c")).toEqual(["second message"]);
	});

	it("emits an unverified receipt when daemon injection cannot confirm delivery", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-c",
				harness: "copilot",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const delivered = new FsChannel(home).deliver({
			from: "pij-boss",
			to: "pij-c",
			body: "review the diff",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		const ports = fakePorts({ sendOutcome: "unverified" });
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		expect(messageBodies("pij-boss")).toContain(
			`[pij receipt ${delivered.value.messageId}] unverified`,
		);
	});

	it("isolates one target's send failure so unrelated live inboxes still drain", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-a-stale",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%dead",
				harnessSessionId: "stale-session",
			}),
		);
		registry.write(
			desc({
				id: "pij-z-live",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%live",
				harnessSessionId: "live-session",
			}),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-a-stale", body: "old" });
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-z-live", body: "new" });
		const ports = fakePorts({ sendErrorForPane: "%dead" });
		const log: string[] = [];

		expect(() =>
			new Daemon(home, ports, registry, new FsChannel(home), (line) => log.push(line)).tick(),
		).not.toThrow();

		expect(ports.sent).toContainEqual({ pane: "%live", text: "[pij from pij-boss] new" });
		expect(unreadBodies("pij-a-stale")).toContain("old");
		expect(unreadBodies("pij-z-live")).toHaveLength(0);
		expect(log.join("\n")).toContain("pij-a-stale");
		expect(log.join("\n")).toContain("can't find pane: %dead");
	});

	it("does not drain or repeatedly buffer a bound tmux inbox until the target has a pane", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				harnessSessionId: "sess",
			}),
		);
		const channel = new FsChannel(home);
		const delivered = channel.deliver({ from: "pij-boss", to: "pij-c", body: "wait for pane" });
		if (!delivered.ok) throw new Error(delivered.message);
		const ports = fakePorts();
		const daemon = new Daemon(home, ports, registry, channel);

		daemon.tick();
		daemon.tick();
		expect(ports.sent).toHaveLength(0);
		expect(unreadBodies("pij-c")).toEqual(["wait for pane"]);

		const target = registry.read("pij-c");
		if (!target) throw new Error("missing target");
		registry.write({ ...target, paneId: "%4" });
		daemon.tick();
		daemon.tick();
		expect(ports.sent.filter((sent) => sent.text.includes("wait for pane"))).toHaveLength(1);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
	});

	it("persists a receipt event before marking its retained envelope and never injects it", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const base = new FsChannel(home);
		const delivered = base.deliver({
			from: "pij-boss",
			to: "pij-c",
			body: receiptBody("original-message", "delivered"),
			kind: "receipt",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		let eventVisibleBeforeMarker = false;
		const channel = {
			deliver: (message: Parameters<FsChannel["deliver"]>[0]) => base.deliver(message),
			listUnread: (id: string) => base.listUnread(id),
			claimUnread: (
				id: string,
				messageId: string,
				marker?: Parameters<FsChannel["claimUnread"]>[2],
			) => base.claimUnread(id, messageId, marker),
			markRead: (id: string, messageId: string, marker?: Parameters<FsChannel["markRead"]>[2]) => {
				if (messageId === delivered.value.messageId) {
					eventVisibleBeforeMarker =
						new FsEventLog(home, id).read({ type: "receipt" }).length === 1;
				}
				return base.markRead(id, messageId, marker);
			},
		};
		const ports = fakePorts();
		const daemon = new Daemon(home, ports, registry, channel);

		daemon.tick();

		expect(eventVisibleBeforeMarker).toBe(true);
		expect(ports.sent).toHaveLength(0);
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		expect(new FsEventLog(home, "pij-c").read({ type: "receipt" })).toHaveLength(1);
		daemon.tick();
		expect(new FsEventLog(home, "pij-c").read({ type: "receipt" })).toHaveLength(1);
	});

	it("does not resurrect or notify for a descriptor dissolved during a queued activity drain", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				spawnedBy: "pij-boss",
				state: "working",
				lastEventAt: FRESH_AT,
			}),
		);
		const ports = fakePorts({
			alive: false,
			nowMs: NOW_MS,
			paneText: () => {
				registry.dissolve("pij-c");
				return READY;
			},
		});

		new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(registry.read("pij-c")?.lifecycle).toBe("dissolved");
		expect(registry.list()).toEqual([]);
		expect(messageBodies("pij-boss")).toHaveLength(0);
	});

	it("does not notify when an already-idle descriptor is dissolved during activity capture", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				spawnedBy: "pij-boss",
				state: "idle",
				lastEventAt: FRESH_AT,
			}),
		);
		const ports = fakePorts({
			alive: false,
			nowMs: NOW_MS,
			paneText: () => {
				registry.dissolve("pij-c");
				return READY;
			},
		});

		new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(registry.read("pij-c")?.lifecycle).toBe("dissolved");
		expect(registry.list()).toEqual([]);
		expect(messageBodies("pij-boss")).toHaveLength(0);
	});

	it("delivery ownership: a PI target's inbox is NEVER drained (left for its in-process receiver)", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-p", harness: "pi", lifecycle: "bound", paneId: "%5" }));
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-p", body: "hi pi" });
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent).toHaveLength(0); // daemon never injects into pi
		expect(
			readdirSync(join(home, "pij-p", "inbox")).filter((n) => n.startsWith("msg-")),
		).toHaveLength(1); // message left for the pi receiver
	});

	it("delivery ownership: an external pull target is never tick-owned, driven, buffered, or drained", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-pull",
				harness: "copilot",
				deliveryMode: "pull",
				lifecycle: "bound",
				paneId: "%5",
				harnessSessionId: "df4f1111-2222-4333-8444-555555555555",
			}),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-pull", body: "stay durable" });
		const ports = fakePorts({ nowMs: NOW_MS });
		new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(ports.sent).toHaveLength(0);
		expect(registry.read("pij-pull")?.lastTickAt).toBeUndefined();
		expect(messageBodies("pij-pull")).toEqual(["stay durable"]);
	});

	it("does not drive a pending external pull descriptor", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-pull",
				harness: "claude",
				deliveryMode: "pull",
				lifecycle: "pending",
				paneId: "%5",
			}),
		);
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent).toHaveLength(0);
		expect(registry.read("pij-pull")?.initInjectedAt).toBeUndefined();
	});
});

describe("Daemon.tick provider-failure peek", () => {
	it("does not push a provider failure while the session is working with fresh activity", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-coder",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				spawnedBy: "pij-boss",
				state: "working",
				lastEventAt: FRESH_AT,
			}),
		);
		const ports = fakePorts({
			nowMs: NOW_MS,
			paneText: "insufficient credit seen earlier in scrollback",
		});

		new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(messageBodies("pij-boss")).toHaveLength(0);
		expect(registry.read("pij-coder")?.failureReason).toBeUndefined();
	});

	it("does not push a provider failure for transient rate-limit scrollback", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-coder",
				harness: "pi",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				spawnedBy: "pij-boss",
				state: "idle",
				lastEventAt: STALE_AT,
			}),
		);
		const ports = fakePorts({
			nowMs: NOW_MS,
			paneText: "API Error: 429 provider overloaded; retrying",
		});

		new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(messageBodies("pij-boss")).toHaveLength(0);
		expect(registry.read("pij-coder")?.failureReason).toBeUndefined();
	});

	it("pushes Case-3 terminal provider failures only when not working and stale", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-coder",
				harness: "pi",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				spawnedBy: "pij-boss",
				state: "idle",
				lastEventAt: STALE_AT,
			}),
		);
		const ports = fakePorts({
			nowMs: NOW_MS,
			paneText: "billing is disabled; insufficient credit",
		});

		new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(registry.read("pij-coder")?.failureReason).toBe("quota");
		expect(messageBodies("pij-boss").join("\n")).toContain("quota");
	});

	it("clears stale failureReason and provider-failure latch when the session recovers", () => {
		const registry = new FsRegistry(home);
		const channel = new FsChannel(home);
		const daemon = new Daemon(
			home,
			fakePorts({
				nowMs: NOW_MS,
				paneText: "billing is disabled; insufficient credit",
			}),
			registry,
			channel,
		);
		registry.write(
			desc({
				id: "pij-coder",
				harness: "pi",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				spawnedBy: "pij-boss",
				state: "idle",
				lastEventAt: STALE_AT,
			}),
		);
		daemon.tick();
		const failed = registry.read("pij-coder");
		if (!failed) throw new Error("missing failed descriptor");
		expect(failed.failureReason).toBe("quota");
		expect(messageBodies("pij-boss")).toHaveLength(1);

		registry.write({ ...failed, state: "working", lastEventAt: FRESH_AT });
		daemon.tick();
		const recovered = registry.read("pij-coder");
		if (!recovered) throw new Error("missing recovered descriptor");
		expect(recovered.failureReason).toBeUndefined();
		expect(messageBodies("pij-boss")).toHaveLength(1);

		registry.write({ ...recovered, state: "idle", lastEventAt: STALE_AT });
		daemon.tick();
		expect(registry.read("pij-coder")?.failureReason).toBe("quota");
		expect(messageBodies("pij-boss")).toHaveLength(2);
	});
});

describe("Daemon.tick — `--once` agent-peer auto-close (T008 / AC-16)", () => {
	it("closes a once-mode peer that has reported: kills the pane + removes the descriptor", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-agent",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%7",
				agentPack: "flowspace-search",
				agentOnce: true,
				reportedAt: FRESH_AT,
			}),
		);
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.killed).toContain("%7");
		expect(registry.read("pij-agent")?.lifecycle).toBe("dissolved");
	});

	it("does NOT close a once-mode peer that has not reported yet (the load-bearing latch)", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-agent",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%7",
				agentPack: "flowspace-search",
				agentOnce: true,
				// no reportedAt → planOnceClose false
			}),
		);
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.killed).not.toContain("%7");
		expect(registry.read("pij-agent")).not.toBeNull();
	});

	it("leaves a RESIDENT peer that reported untouched (agentOnce false)", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-agent",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%7",
				agentPack: "flowspace-search",
				agentOnce: false,
				reportedAt: FRESH_AT,
			}),
		);
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.killed).not.toContain("%7");
		expect(registry.read("pij-agent")).not.toBeNull();
	});

	it("never touches a non-agent colleague (no agentOnce/reportedAt)", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-plain", harness: "claude", lifecycle: "bound", paneId: "%7" }));
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.killed).toEqual([]);
		expect(registry.read("pij-plain")).not.toBeNull();
	});

	// Concurrent-writer regression (rev-0004 Finding 1): `pij agent report` runs in
	// the peer's OWN pane (a separate process) and stamps `reportedAt` on the peer's
	// descriptor. The daemon rebuilds its index at tick start, then — mid-tick —
	// derives an activity write (working→idle at report time) from that STALE snapshot
	// and persists it. Before the fix, that write clobbered the freshly-stamped
	// `reportedAt`, so `planOnceClose` never latched and the pane stayed open forever.
	// We simulate the concurrent stamp via a `capturePane` side effect (capturePane
	// is called AFTER the index rebuild, exactly where the real report lands).
	it("preserves a reportedAt stamped concurrently mid-tick, then auto-closes next tick", () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-agent",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%7",
				agentPack: "flowspace-search",
				agentOnce: true,
				// Working at tick start; the pane below reads READY (idle), so the daemon's
				// activity write flips working→idle — the near-guaranteed clobber path.
				state: "working",
				lastEventAt: FRESH_AT,
			}),
		);
		// Simulate `executeAgentReport` stamping reportedAt between the index rebuild
		// and the daemon's activity write. Idempotent so repeat capturePane calls
		// within a tick don't re-stamp. Returns an idle pane to force the activity write.
		const ports = fakePorts({
			paneText: () => {
				const d = registry.read("pij-agent");
				if (d && !d.reportedAt) registry.write({ ...d, reportedAt: FRESH_AT });
				return READY;
			},
		});
		const daemon = new Daemon(home, ports, registry, new FsChannel(home));

		// Tick 1: the activity write fires with the concurrent stamp already on disk.
		daemon.tick();
		const afterTick1 = registry.read("pij-agent");
		expect(afterTick1, "descriptor must still exist after tick 1").not.toBeNull();
		expect(afterTick1?.state, "the activity write must have happened (working→idle)").toBe("idle");
		expect(
			afterTick1?.reportedAt,
			"reportedAt stamped mid-tick must survive the daemon's activity write",
		).toBe(FRESH_AT);

		// Tick 2: the index now sees reportedAt → planOnceClose latches → pane killed +
		// descriptor removed.
		daemon.tick();
		expect(ports.killed).toContain("%7");
		expect(registry.read("pij-agent")?.lifecycle).toBe("dissolved");
	});
});
