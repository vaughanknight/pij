// Delivery decoupled from the tick (plan 071 D2, T004).

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
let logs: string[];

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-daemon-del-"));
	sent = [];
	logs = [];
});
afterEach(() => {
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
		now: () => NOW_MS,
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

describe("deliverPass", () => {
	it("injects pending mail WITHOUT a tick — delivery no longer rides tick duration", () => {
		const registry = new FsRegistry(home);
		registry.write(seat({ id: "pij-worker", spawnedBy: "pij-boss" }));
		registry.write(seat({ id: "pij-boss", paneId: "%9", harnessSessionId: "native-boss" }));
		const d = daemon();
		d.tick(); // one tick to populate the index (a seat must be known to be served)
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "ship it" });
		d.deliverPass();

		expect(sent.map((s) => s.text).join("\n")).toContain("ship it");
		expect(sent[0]?.pane).toBe("%1");
	});

	it("delivers repeatedly across passes with no tick in between", () => {
		const registry = new FsRegistry(home);
		registry.write(seat({ id: "pij-worker" }));
		const d = daemon();
		d.tick();
		sent.length = 0;

		const channel = new FsChannel(home);
		channel.deliver({ from: "pij-boss", to: "pij-worker", body: "first" });
		d.deliverPass();
		channel.deliver({ from: "pij-boss", to: "pij-worker", body: "second" });
		d.deliverPass();

		const injected = sent.map((s) => s.text).join("\n");
		expect(injected).toContain("first");
		expect(injected).toContain("second");
	});

	it("is idempotent — a pass with nothing pending injects nothing", () => {
		new FsRegistry(home).write(seat({ id: "pij-worker" }));
		const d = daemon();
		d.tick();
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "once" });
		d.deliverPass();
		const afterFirst = sent.length;

		d.deliverPass();
		d.deliverPass();

		expect(sent.length).toBe(afterFirst);
	});

	// CONTROL for each refusal below: the same seat/message DOES deliver when the
	// refusing condition is removed (the test above), so these prove the guard.
	it("refuses an UNBOUND seat — a pending seat has no pane contract yet", () => {
		new FsRegistry(home).write(seat({ id: "pij-worker", lifecycle: "pending" }));
		const d = daemon();
		d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "too early" });
		d.deliverPass();

		expect(sent.map((s) => s.text).join("\n")).not.toContain("too early");
	});

	it("refuses a COMPACTING seat — input injected mid-compaction is eaten by the harness", () => {
		new FsRegistry(home).write(
			seat({ id: "pij-worker", compactingAt: new Date(NOW_MS - 1_000).toISOString() }),
		);
		const d = daemon();
		d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "held back" });
		d.deliverPass();

		expect(sent.map((s) => s.text).join("\n")).not.toContain("held back");
	});

	it("refuses a pi seat — pi owns its own inbox and the daemon must never touch it", () => {
		new FsRegistry(home).write(seat({ id: "pij-pi-peer", harness: "pi" }));
		const d = daemon();
		d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-pi-peer", body: "not yours" });
		d.deliverPass();

		expect(sent).toEqual([]);
	});

	it("survives one seat throwing and still serves the others", () => {
		const registry = new FsRegistry(home);
		registry.write(
			seat({ id: "pij-broken", paneId: undefined, harnessSessionId: "native-broken" }),
		);
		registry.write(seat({ id: "pij-worker" }));
		const d = daemon();
		d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "still lands" });
		expect(() => d.deliverPass()).not.toThrow();
		expect(sent.map((s) => s.text).join("\n")).toContain("still lands");
	});

	it("the tick still drains too — the fast pass is an accelerator, not a single point of failure", () => {
		new FsRegistry(home).write(seat({ id: "pij-worker" }));
		const d = daemon();
		d.tick();
		sent.length = 0;

		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-worker", body: "reconciled" });
		d.tick(); // NO deliverPass at all

		expect(sent.map((s) => s.text).join("\n")).toContain("reconciled");
	});
});
