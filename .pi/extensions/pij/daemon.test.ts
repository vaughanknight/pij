import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsChannel } from "./adapters/channel.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
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

describe("Daemon.tick (bin wiring vs a real tmp ~/.pij)", () => {
	it("drives a pending claude session: ready pane → init injected + marker persisted", () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-c", harness: "claude", lifecycle: "pending", paneId: "%4" }));
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent.some((s) => s.pane === "%4" && s.text.includes("pij phonehome"))).toBe(true);
		expect(registry.read("pij-c")?.initInjectedAt).toBeTruthy();
	});

	it("drains a BOUND claude target's inbox: injects the body + removes the file", () => {
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
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] review the diff" });
		// inbox file consumed
		expect(
			readdirSync(join(home, "pij-c", "inbox")).filter((n) => n.startsWith("msg-")),
		).toHaveLength(0);
		expect(messageBodies("pij-boss")).toContain(
			`[pij receipt ${delivered.value.messageId}] delivered`,
		);
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
		expect(messageBodies("pij-boss")).toContain(
			`[pij receipt ${delivered.value.messageId}] unverified`,
		);
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
		expect(registry.read("pij-agent")).toBeNull();
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
		expect(registry.read("pij-agent")).toBeNull();
	});
});
