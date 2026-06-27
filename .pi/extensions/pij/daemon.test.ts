import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsChannel } from "./adapters/channel.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const READY = "⏵⏵ auto mode on (shift+tab to cycle)";

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

function fakePorts(): DaemonPorts & { sent: Array<{ pane: string; text: string }> } {
	const sent: Array<{ pane: string; text: string }> = [];
	return {
		sent,
		capturePane: () => READY,
		isPaneDead: () => false,
		sendText: (pane, text) => sent.push({ pane, text }),
		sendKey: () => {},
		listTranscripts: () => [],
		home: () => home,
		now: () => 1000,
		isAlive: () => true,
	};
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
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-c", body: "review the diff" });
		const ports = fakePorts();
		new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] review the diff" });
		// inbox file consumed
		expect(
			readdirSync(join(home, "pij-c", "inbox")).filter((n) => n.startsWith("msg-")),
		).toHaveLength(0);
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
