import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { FsWatchdogStore } from "./adapters/watchdog-store.js";
import { type DaemonPorts, INIT_HELD_TIMEOUT_MS } from "./core/daemon/loop.js";
import type { PaneListing } from "./core/daemon/pane-signals.js";
import { renderedComposerLength, USER_TYPING_IDLE_MS } from "./core/daemon/pane-signals.js";
import { COMPACT_GRACE_MS, COMPACT_MAX_MS } from "./core/daemon/router.js";
import {
	FsTickHeartbeatStore,
	lastTickFor,
	TICK_HEARTBEAT_FILE,
} from "./core/daemon/tick-heartbeat.js";
import { receiptBody } from "./core/message.js";
import type { RegistryPort } from "./core/ports.js";
import { DAEMON_TICK_STALE_AFTER_MS, daemonTickStatus } from "./core/receipts.js";
import type { DescriptorWriter } from "./core/registry-write.js";
import { STALE_AFTER_MS } from "./core/state.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon, touchDaemonHeartbeat } from "./daemon.js";

const READY = "⏵⏵ auto mode on (shift+tab to cycle)";
const CLAUDE_COMPOSER_EMPTY = [
	"────────────────────────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────────────────────────",
	"45% pij · pij-reasonable-dove · Opus 4.8",
].join("\n");
const CLAUDE_COMPOSER_TEXT = [
	"────────────────────────────────────────────────────────────────",
	"❯ keep me posted on the researcher findings",
	"────────────────────────────────────────────────────────────────",
	"45% pij · pij-reasonable-dove · Opus 4.8",
].join("\n");
const CLAUDE_RELATIVE_REDRAW = Buffer.from(
	"\x1b[?2026h\x1b[?25l\x1b[H\r\x1b[2C\x1b[45Bkeep me posted on the researcher findings\x1b[49;1H\x1b[46;3H",
);
const PANE_SIGNAL_FIXTURES = join(
	dirname(fileURLToPath(import.meta.url)),
	"core",
	"daemon",
	"__fixtures__",
	"pane-signals",
);

function paneSignalFixture(name: string): string {
	return readFileSync(join(PANE_SIGNAL_FIXTURES, name), "utf8");
}

function copilotComposer(payload: string): string {
	return [
		"────────────────────────────────────────────────────────────────",
		`❯ ${payload}`,
		" GPT-5.6 Sol · 1.1M context",
		" / commands · ? help · → next tab",
		" ◉",
	].join("\n");
}
const NOW_MS = Date.parse("2026-06-28T00:00:00.000Z");
const FRESH_AT = new Date(NOW_MS - 5_000).toISOString();
const STALE_AT = new Date(NOW_MS - STALE_AFTER_MS - 1).toISOString();

let home: string;
beforeEach(async () => {
	home = mkdtempSync(join(tmpdir(), "pij-daemon-"));
});
afterEach(async () => {
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
	readonly isAlive?: (pid: number) => boolean;
	readonly nowMs?: number;
	readonly paneText?: string | (() => string);
	readonly sendOutcome?: "confirmed" | "unverified" | "gone";
	readonly sendErrorForPane?: string;
	readonly paneListings?: () => readonly PaneListing[];
	readonly tapChunks?: Uint8Array[];
	readonly now?: () => number;
}

function fakePorts(options: FakePortsOptions = {}): DaemonPorts & {
	sent: Array<{ pane: string; text: string }>;
	killed: string[];
	attached: string[];
	detached: string[];
	captured: string[];
} {
	const sent: Array<{ pane: string; text: string }> = [];
	const killed: string[] = [];
	const attached: string[] = [];
	const detached: string[] = [];
	/** Every paneId handed to `capturePane`, in order — the instrument for
	 *  pij#229, which is a claim about WHICH panes are read and how often. */
	const captured: string[] = [];
	const paneText = options.paneText;
	return {
		sent,
		killed,
		attached,
		detached,
		captured,
		capturePane: (pane) => {
			captured.push(pane);
			return typeof paneText === "function" ? paneText() : (paneText ?? READY);
		},
		isPaneDead: () => false,
		listPanes: options.paneListings,
		attachPaneTap: options.paneListings ? (pane) => attached.push(pane) : undefined,
		drainPaneTap: options.paneListings
			? () => options.tapChunks?.shift() ?? new Uint8Array()
			: undefined,
		detachPaneTap: options.paneListings ? (pane) => detached.push(pane) : undefined,
		sendText: (pane, text) => {
			if (pane === options.sendErrorForPane) throw new Error(`can't find pane: ${pane}`);
			sent.push({ pane, text });
			return options.sendOutcome ?? "confirmed";
		},
		sendKey: () => {},
		killPane: (pane) => killed.push(pane),
		listTranscripts: () => [],
		home: () => home,
		now: () => options.now?.() ?? options.nowMs ?? 1000,
		isAlive: (pid) => options.isAlive?.(pid) ?? options.alive ?? true,
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
	it("persists lastTickAt so an unticked/wedged daemon becomes mechanically stale", async () => {
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

		await daemon.tick();

		// pij#180 Fix A moved the STAMP, not the claim: it now lives in the
		// heartbeat side file instead of costing an fsync-barriered publish per
		// seat per tick. Phase 3 re-attaches it to `read()` via an overlay, at
		// which point the descriptor-shaped assertion returns; until then this
		// reads the stamp where it actually is. The wedged-daemon claim below is
		// untouched and is the load-bearing half.
		const lastTickAt = lastTickFor(new FsTickHeartbeatStore(home).read(), "pij-c");
		expect(lastTickAt).toBe(new Date(NOW_MS).toISOString());
		// Simulate a wedged daemon: wall time advances but no second tick occurs.
		expect(daemonTickStatus(lastTickAt, NOW_MS + DAEMON_TICK_STALE_AFTER_MS + 1)).toMatchObject({
			daemonTickStale: true,
		});
	});

	it("drives a pending claude session: ready pane → init injected + marker persisted", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-c", harness: "claude", lifecycle: "pending", paneId: "%4" }));
		const ports = fakePorts();
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent.some((s) => s.pane === "%4" && s.text.includes("pij phonehome"))).toBe(true);
		expect(registry.read("pij-c")?.initInjectedAt).toBeTruthy();
	});

	it("retains a BOUND tmux message, marks it after injection outcome, and skips replay", async () => {
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
		await daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] review the diff" });
		expect(markerDuringInjection).toBe(false);
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		expect(unreadBodies("pij-c")).toEqual([]);
		expect(messageBodies("pij-boss")).toContain(
			`[pij receipt ${delivered.value.messageId}] delivered`,
		);
		await daemon.tick();
		expect(ports.sent.filter((sent) => sent.text.includes("review the diff"))).toHaveLength(1);
	});

	it("preserves same-target progress when a later tmux injection fails", async () => {
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

		await daemon.tick();

		expect(firstProgressVisibleOnFailure).toBe(true);
		expect(existsSync(markerPath("pij-c", first.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", second.value.messageId))).toBe(false);
		expect(unreadBodies("pij-c")).toEqual(["second message"]);
		expect(messageBodies("pij-boss")).toContain(receiptBody(first.value.messageId, "delivered"));
		expect(messageBodies("pij-boss")).not.toContain(
			receiptBody(second.value.messageId, "delivered"),
		);

		await daemon.tick();

		expect(attempts.filter((text) => text.includes("first message"))).toHaveLength(1);
		expect(attempts.filter((text) => text.includes("second message"))).toHaveLength(2);
		expect(unreadBodies("pij-c")).toEqual(["second message"]);
	});

	it("emits an unverified receipt when daemon injection cannot confirm delivery", async () => {
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
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		expect(messageBodies("pij-boss")).toContain(
			`[pij receipt ${delivered.value.messageId}] unverified`,
		);
	});

	it("NEVER reports delivered for a claude send whose submission was unconfirmed", async () => {
		// The honesty invariant from plan 127, kept after `injected-unverified` was
		// retired into `unverified` (s179): the wedge is reachable for EVERY harness,
		// not just copilot — claude used to short-circuit to `confirmed` without
		// verifying, so a swallowed Enter stranded the text and still said delivered.
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
			body: "the GO message that must not be lied about",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		const ports = fakePorts({ sendOutcome: "unverified" });
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		// Typed-but-unconfirmed CONSUMES (at-most-once): replaying could duplicate an
		// already-accepted turn.
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		const bodies = messageBodies("pij-boss");
		expect(bodies).toContain(`[pij receipt ${delivered.value.messageId}] unverified`);
		expect(bodies).not.toContain(`[pij receipt ${delivered.value.messageId}] delivered`);
	});

	it("unbinds the seat when its pane is GONE, and leaves the message unconsumed", async () => {
		// A gone pane is a stale BINDING, not a failed send: no retry can succeed, so
		// requeueing spins forever (a reboot left ~200 such messages, one tmux call
		// each, every tick). Unbind instead — and because tmux re-issues pane ids from
		// `%0`, this also stops the message being deliverable into whatever LIVE pane
		// later inherits `%4`.
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-gone",
				harness: "copilot",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const delivered = new FsChannel(home).deliver({
			from: "pij-boss",
			to: "pij-gone",
			body: "are you there",
		});
		if (!delivered.ok) throw new Error(delivered.message);

		await new Daemon(
			home,
			fakePorts({ sendOutcome: "gone" }),
			registry,
			new FsChannel(home),
		).tick();

		expect(registry.read("pij-gone")?.lifecycle).toBe("dissolved");
		// The durable copy survives with NO read marker: nothing was delivered, so
		// nothing may be consumed. A revived seat still receives it.
		expect(existsSync(messagePath("pij-gone", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-gone", delivered.value.messageId))).toBe(false);
	});

	it("isolates one target's send failure so unrelated live inboxes still drain", async () => {
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

		await expect(
			new Daemon(home, ports, registry, new FsChannel(home), (line) => log.push(line)).tick(),
		).resolves.toBeUndefined();

		expect(ports.sent).toContainEqual({ pane: "%live", text: "[pij from pij-boss] new" });
		expect(unreadBodies("pij-a-stale")).toContain("old");
		expect(unreadBodies("pij-z-live")).toHaveLength(0);
		expect(log.join("\n")).toContain("pij-a-stale");
		expect(log.join("\n")).toContain("can't find pane: %dead");
	});

	it("does not drain or repeatedly buffer a bound tmux inbox until the target has a pane", async () => {
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

		await daemon.tick();
		await daemon.tick();
		expect(ports.sent).toHaveLength(0);
		expect(unreadBodies("pij-c")).toEqual(["wait for pane"]);

		const target = registry.read("pij-c");
		if (!target) throw new Error("missing target");
		registry.write({ ...target, paneId: "%4" });
		await daemon.tick();
		await daemon.tick();
		expect(ports.sent.filter((sent) => sent.text.includes("wait for pane"))).toHaveLength(1);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
	});

	it("persists a receipt event before marking its retained envelope and never injects it", async () => {
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

		await daemon.tick();

		expect(eventVisibleBeforeMarker).toBe(true);
		expect(ports.sent).toHaveLength(0);
		expect(existsSync(messagePath("pij-c", delivered.value.messageId))).toBe(true);
		expect(existsSync(markerPath("pij-c", delivered.value.messageId))).toBe(true);
		expect(new FsEventLog(home, "pij-c").read({ type: "receipt" })).toHaveLength(1);
		await daemon.tick();
		expect(new FsEventLog(home, "pij-c").read({ type: "receipt" })).toHaveLength(1);
	});

	it("does not resurrect or notify for a descriptor dissolved during a queued activity drain", async () => {
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

		await new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(registry.read("pij-c")?.lifecycle).toBe("dissolved");
		expect(registry.list()).toEqual([]);
		expect(messageBodies("pij-boss")).toHaveLength(0);
	});

	it("does not notify when an already-idle descriptor is dissolved during activity capture", async () => {
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

		await new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(registry.read("pij-c")?.lifecycle).toBe("dissolved");
		expect(registry.list()).toEqual([]);
		expect(messageBodies("pij-boss")).toHaveLength(0);
	});

	it("delivery ownership: a PI target's inbox is NEVER drained (left for its in-process receiver)", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-p", harness: "pi", lifecycle: "bound", paneId: "%5" }));
		new FsChannel(home).deliver({ from: "pij-boss", to: "pij-p", body: "hi pi" });
		const ports = fakePorts();
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent).toHaveLength(0); // daemon never injects into pi
		expect(
			readdirSync(join(home, "pij-p", "inbox")).filter((n) => n.startsWith("msg-")),
		).toHaveLength(1); // message left for the pi receiver
	});

	it("delivery ownership: an external pull target is never tick-owned, driven, buffered, or drained", async () => {
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
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(ports.sent).toHaveLength(0);
		expect(registry.read("pij-pull")?.lastTickAt).toBeUndefined();
		expect(messageBodies("pij-pull")).toEqual(["stay durable"]);
	});

	it("does not drive a pending external pull descriptor", async () => {
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
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.sent).toHaveLength(0);
		expect(registry.read("pij-pull")?.initInjectedAt).toBeUndefined();
	});

	it.each([
		["pane_%157.txt", "copilot"],
		["pane_%624.txt", "copilot"],
		["pane_%4.txt", "copilot"],
		["claude_idle_%29.txt", "claude"],
	] as const)("routes real idle pane capture %s through delivery without a hold", async (fixtureName, harness) => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-c",
				harness,
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const channel = new FsChannel(home);
		channel.deliver({ from: "pij-boss", to: "pij-c", body: fixtureName });
		const ports = fakePorts({
			paneText: paneSignalFixture(fixtureName),
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});

		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: false });
		expect(ports.sent).toContainEqual({ pane: "%4", text: `[pij from pij-boss] ${fixtureName}` });
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	it("buffers delivery when authoritative composer content changes at equal stripped length", async () => {
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
		const channel = new FsChannel(home);
		let pane = copilotComposer("hello");
		const ports = fakePorts({
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		pane = copilotComposer("world");
		expect(renderedComposerLength(pane)).toBe(5);
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "equal-length edit" });
		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent).toEqual([]);
		expect(unreadBodies("pij-c")).toEqual(["equal-length edit"]);

		pane = paneSignalFixture("pane_%4.txt");
		await daemon.tick();
		expect(ports.sent).toContainEqual({
			pane: "%4",
			text: "[pij from pij-boss] equal-length edit",
		});
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	it("does not treat its own injection as typing that blocks the next delivery", async () => {
		let nowMs = 1_000;
		let pane = paneSignalFixture("pane_%4.txt");
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
		const channel = new FsChannel(home);
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "first" });
		await daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] first" });

		pane = copilotComposer("[pij from pij-boss] first");
		nowMs += 1;
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "second" });
		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: false });
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] second" });
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	it("holds a human edit that arrives before the daemon injection echo", async () => {
		let nowMs = 1_000;
		let pane = paneSignalFixture("pane_%4.txt");
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
		const channel = new FsChannel(home);
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "first" });
		await daemon.tick();
		pane = copilotComposer("human starts typing");
		nowMs += 1;
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "second" });
		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent).toEqual([{ pane: "%4", text: "[pij from pij-boss] first" }]);
		expect(unreadBodies("pij-c")).toContain("second");

		pane = paneSignalFixture("pane_%4.txt");
		await daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] second" });
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	it("holds real relative-redraw Claude input, then flushes FIFO when the composer empties", async () => {
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
		let pane = CLAUDE_COMPOSER_EMPTY;
		const ports = fakePorts({
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
			tapChunks: [new Uint8Array(), CLAUDE_RELATIVE_REDRAW],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		pane = CLAUDE_COMPOSER_TEXT;
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "one" });
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "two" });
		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent.filter((entry) => entry.text.includes("[pij from"))).toEqual([]);
		expect(unreadBodies("pij-c")).toEqual(["one", "two"]);

		pane = CLAUDE_COMPOSER_EMPTY;
		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: false });
		expect(ports.sent.filter((entry) => entry.text.includes("[pij from"))).toEqual([
			{ pane: "%4", text: "[pij from pij-boss] one" },
			{ pane: "%4", text: "[pij from pij-boss] two" },
		]);
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	it("idle-releases at 60 seconds even while rendered composer text remains", async () => {
		let nowMs = 1_000;
		let pane = CLAUDE_COMPOSER_EMPTY;
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
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		pane = CLAUDE_COMPOSER_TEXT;
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "after idle" });
		await daemon.tick();
		expect(ports.sent).toEqual([]);

		nowMs += USER_TYPING_IDLE_MS - 1;
		await daemon.tick();
		expect(ports.sent).toEqual([]);

		nowMs += 1;
		await daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] after idle" });

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "no chaining" });
		await daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] no chaining" });
	});

	it("flushes an unattended orchestrator hold after undefined-layout timeout", async () => {
		let nowMs = 1_000;
		let pane = CLAUDE_COMPOSER_EMPTY;
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-orchestrator",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const channel = new FsChannel(home);
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
			tapChunks: [
				new Uint8Array(),
				new Uint8Array(),
				Buffer.from("\x1b[46;4H"),
				Buffer.from("\x1b[46;5H"),
			],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		pane = CLAUDE_COMPOSER_TEXT;
		channel.deliver({ from: "pij-boss", to: "pij-orchestrator", body: "resume pipeline" });
		await daemon.tick();
		expect(ports.sent).toEqual([]);
		expect(unreadBodies("pij-orchestrator")).toEqual(["resume pipeline"]);

		pane = "unrecognized pane layout with no composer delimiters";
		nowMs += USER_TYPING_IDLE_MS - 1;
		await daemon.tick();
		expect(ports.sent).toEqual([]);

		nowMs += 1;
		await daemon.tick();
		expect(ports.sent).toContainEqual({
			pane: "%4",
			text: "[pij from pij-boss] resume pipeline",
		});
		expect(unreadBodies("pij-orchestrator")).toEqual([]);
	});

	// s069: this is THE step-on. The tick observes an empty composer, the human
	// types, and the pre-send capture — taken milliseconds later — sees the text.
	// The old gate could only ever RELEASE from that capture, so it injected on
	// top of a composer visibly reading `❯ keep me posted…`. It must now hold.

	it("holds when the pre-send capture shows text the last tick did not", async () => {
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
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "racing" });
		const paneSequence = [CLAUDE_COMPOSER_EMPTY, CLAUDE_COMPOSER_EMPTY, CLAUDE_COMPOSER_TEXT];
		const ports = fakePorts({
			paneText: () => paneSequence.shift() ?? CLAUDE_COMPOSER_TEXT,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});

		await new Daemon(home, ports, registry, channel).tick();
		expect(ports.sent).toEqual([]);
		expect(unreadBodies("pij-c")).toEqual(["racing"]);
	});

	// The companion guarantee, so the fix above cannot regress s064's over-hold:
	// text that was ALREADY there when the daemon first looked is a parked draft,
	// not recent typing, and must never block delivery.
	it("delivers over a parked draft that was present from the first observation", async () => {
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
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "racing" });
		let nowMs = NOW_MS;
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => CLAUDE_COMPOSER_TEXT,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, channel);

		// First sight is ambiguous — parked draft, or a human typing through a
		// daemon restart? It is treated as recent typing and bounded by the 60s
		// idle rule, so s064's over-hold cannot come back as a forever-block.
		await daemon.tick();
		expect(ports.sent).toEqual([]);

		nowMs += USER_TYPING_IDLE_MS;
		await daemon.tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] racing" });
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	// The reviewer's P0: `drainInbox` checks the hold, then `drainTmuxInbox` checks
	// AGAIN immediately before `sendText`. A keystroke landing between those two
	// captures is only ever caught by the inner one — which is why its tracker is
	// mandatory rather than defence-in-depth.
	it("holds when the human types between the outer check and the pre-send capture", async () => {
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
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "racing" });
		// THE CAPTURE ORDER IN ONE TICK, and it is load-bearing for this test:
		//   1  the signals pass (`refreshPaneSignals`)
		//   2  the FLUSH GATE      (`daemon.ts` → refreshRenderedComposerHold)
		//   3  the OUTER drain check (`drainInbox` → refreshRenderedComposerHold)
		//   4  the PRE-SEND check  (`drainTmuxInbox`, immediately before `sendText`)
		//
		// s101 (pij#229) removed what used to be capture 3 — the readiness capture
		// in the drive loop — by sharing the tick's already-captured frame. THE
		// THREE GUARD CAPTURES ABOVE ARE DELIBERATELY NOT SHARED: each is a RACE
		// DETECTOR whose whole job is to read the pane as late as possible, so a
		// cached frame would defeat the property this test pins. Sharing the
		// readiness capture is safe for exactly the opposite reason — it wants the
		// tick's frame, and reasoning about a LATER frame than the signal tracker
		// is the defect pij#229 exists to remove.
		const PRE_SEND_CAPTURE = 4;
		let captures = 0;
		const ports = fakePorts({
			paneText: () => {
				captures += 1;
				return captures >= PRE_SEND_CAPTURE ? CLAUDE_COMPOSER_TEXT : CLAUDE_COMPOSER_EMPTY;
			},
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});

		await new Daemon(home, ports, registry, channel).tick();
		expect(ports.sent).toEqual([]);
		expect(unreadBodies("pij-c")).toEqual(["racing"]);
		// Pin the coupling this test has on the capture COUNT. Without it, a change
		// that adds or removes a capture silently shifts which one returns text, and
		// this test starts passing or failing for a reason unrelated to the guard —
		// which is exactly how it behaved when pij#229 removed the readiness capture.
		expect(captures).toBe(PRE_SEND_CAPTURE);
	});

	// driveSession's init/phone-home lines are pane writes too. They used to
	// bypass the content gate entirely; the gate is now welded onto the port, so
	// a human typing in a freshly spawned pane is not overwritten by boot traffic.
	// EMERGENCY BYPASS 2026-07-25 (72b5dd6): content gate disabled in daemon.ts —
	// these two tests assert the hold that the bypass deliberately removes.
	// Re-enable them (it.skip → it) the moment the s069 re-review restores the gate.
	it.skip("holds the init injection when a human is typing in the pending pane", async () => {
		let nowMs = NOW_MS;
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-c", harness: "claude", lifecycle: "pending", paneId: "%4" }));
		const RULE = "─".repeat(64);
		const typing = [RULE, "❯ i am in the middle of a sentence", RULE, READY].join("\n");
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => typing,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, new FsChannel(home));

		await daemon.tick();
		expect(ports.sent).toEqual([]);
		// Not marked injected either — the next tick must retry, not skip.
		expect(registry.read("pij-c")?.initInjectedAt).toBeUndefined();

		// Once the draft goes stale the boot line proceeds as normal.
		nowMs += USER_TYPING_IDLE_MS;
		await daemon.tick();
		expect(ports.sent.some((entry) => entry.text.includes("pij phonehome"))).toBe(true);
		expect(registry.read("pij-c")?.initInjectedAt).toBeTruthy();
	});

	// A held boot line must FAIL LOUDLY, not hang. Returning `waiting` left the
	// seat pending forever with nothing logged — the silent-deadlock class this
	// guard exists to prevent, reintroduced by the guard itself.
	// EMERGENCY BYPASS 2026-07-25 (72b5dd6): see skip note above — same gate.
	it.skip("fails the spawn with a pane-input reason when boot stays blocked", async () => {
		let nowMs = NOW_MS;
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "pending",
				paneId: "%4",
				spawnedBy: "pij-boss",
			}),
		);
		const RULE = "─".repeat(64);
		let typed = "i am in the middle of";
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => [RULE, `❯ ${typed}`, RULE, READY].join("\n"),
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const logged: string[] = [];
		const daemon = new Daemon(home, ports, registry, new FsChannel(home), (line) =>
			logged.push(line),
		);

		// The human keeps typing right through the bounded window.
		for (let elapsed = 0; elapsed <= INIT_HELD_TIMEOUT_MS; elapsed += 4_000) {
			typed += " more";
			await daemon.tick();
			nowMs += 4_000;
		}

		const failed = registry.read("pij-c");
		expect(failed?.lifecycle).toBe("failed");
		expect(failed?.failureReason).toBe("pane-input-blocked");
		expect(ports.sent).toEqual([]);
		// Legible, not a generic timeout — and the spawner is told.
		expect(logged.some((line) => line.includes("init line HELD"))).toBe(true);
		expect(messageBodies("pij-boss").join("\n")).toContain("blocked by active pane input");
	});

	// Reviewer round 3: the caret echo exemption must not be spendable on human
	// input that merely LOOKS like part of what we typed.
	it("holds when a human-only frame's text is a fragment of the pending payload", async () => {
		let nowMs = NOW_MS;
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
		const RULE = "─".repeat(64);
		const alternateMarker = [RULE, "> some draft text", RULE, "45% pij"].join("\n");
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "first" });
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => alternateMarker,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
			// "first" appears in the payload, but it is NOT the next expected echo.
			tapChunks: [new Uint8Array(), Buffer.from("first\x1b[46;4H")],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();
		expect(ports.sent).toHaveLength(1);

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "second" });
		nowMs += 1;
		await daemon.tick();

		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent).toHaveLength(1);
		expect(unreadBodies("pij-c")).toContain("second");
	});

	it("holds on a PARTIAL echo frame rather than certifying it as our own output", async () => {
		let nowMs = NOW_MS;
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
		const RULE = "─".repeat(64);
		const alternateMarker = [RULE, "> some draft text", RULE, "45% pij"].join("\n");
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "first" });
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => alternateMarker,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
			// A prefix of our echo — indistinguishable from echo-plus-a-human-key,
			// so it must be treated as ambiguous and HELD.
			tapChunks: [new Uint8Array(), Buffer.from("[pij from pij-boss] firs\x1b[46;4H")],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();
		expect(ports.sent).toHaveLength(1);

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "second" });
		nowMs += 1;
		await daemon.tick();

		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent).toHaveLength(1);
		expect(unreadBodies("pij-c")).toContain("second");
	});

	// The caret fallback must ACQUIRE on an unknown layout, not merely avoid a
	// false hold. Without this the "degrade to caret tracking" claim is untested.
	it("acquires a hold from real caret input on an alternate-marker pane", async () => {
		let nowMs = NOW_MS;
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
		const RULE = "─".repeat(64);
		const alternateMarker = [RULE, "> some draft text", RULE, "45% pij"].join("\n");
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => alternateMarker,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
			// tick 1 seeds; tick 2 carries a printable key plus a caret advance.
			tapChunks: [new Uint8Array(), Buffer.from("k\x1b[46;4H")],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "racing" });
		nowMs += 1;
		await daemon.tick();

		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent).toEqual([]);
		// (a watchdog nudge may also queue behind the hold — it must not be sent either)
		expect(unreadBodies("pij-c")).toContain("racing");
	});

	// The caret fallback's echo exemption must not absorb human input either: a
	// raw frame carrying our echo PLUS a keystroke is NOT explained by our send.
	it("does not let its own echo excuse human input in the same raw frame", async () => {
		let nowMs = NOW_MS;
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
		const RULE = "─".repeat(64);
		const alternateMarker = [RULE, "> some draft text", RULE, "45% pij"].join("\n");
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "first" });
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => alternateMarker,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
			tapChunks: [
				new Uint8Array(),
				// our echo AND a human keystroke, in ONE frame
				Buffer.from("[pij from pij-boss] firstk\x1b[46;4H"),
			],
		});
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();
		expect(ports.sent).toEqual([{ pane: "%4", text: "[pij from pij-boss] first" }]);

		channel.deliver({ from: "pij-boss", to: "pij-c", body: "second" });
		nowMs += 1;
		await daemon.tick();

		expect(daemon.paneSignal("%4")).toMatchObject({ userTyping: true });
		expect(ports.sent).toEqual([{ pane: "%4", text: "[pij from pij-boss] first" }]);
		expect(unreadBodies("pij-c")).toContain("second");
	});

	// Cross-harness completeness: a composer drawn with a marker we do not know
	// must degrade to unknown-layout (caret tracker) through the REAL daemon path,
	// never to a guessed region. With no typing bytes, delivery proceeds.
	it("degrades to the caret tracker for an alternate composer marker", async () => {
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
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "racing" });
		const RULE = "─".repeat(64);
		const alternateMarker = [RULE, "> some draft text", RULE, "45% pij"].join("\n");
		expect(renderedComposerLength(alternateMarker)).toBeUndefined();
		const ports = fakePorts({
			paneText: () => alternateMarker,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});

		await new Daemon(home, ports, registry, channel).tick();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] racing" });
	});

	it("coalesces repeated watchdog intervals while the composer hold is active", async () => {
		let nowMs = Date.parse("2026-07-21T00:00:00.000Z");
		let pane = CLAUDE_COMPOSER_EMPTY;
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-c",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
				startedAt: new Date(nowMs).toISOString(),
				lastEventAt: new Date(nowMs).toISOString(),
				state: "idle",
				orchestrationRole: "pm",
			}),
		);
		new FsWatchdogStore(home).write("pij-c", { intervalMs: 100 });
		const channel = new FsChannel(home);
		const ports = fakePorts({
			now: () => nowMs,
			paneText: () => pane,
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});
		const daemon = new Daemon(home, ports, registry, channel);

		await daemon.tick();
		pane = CLAUDE_COMPOSER_TEXT;
		nowMs += 100;
		await daemon.tick();
		expect(ports.sent).toEqual([]);

		for (let interval = 0; interval < 10; interval++) {
			nowMs += 100;
			await daemon.tick();
		}
		const pendingWatchdogs = unreadBodies("pij-c").filter((body) =>
			body.includes("[pij watchdog #"),
		);
		expect(pendingWatchdogs).toHaveLength(1);
		expect(pendingWatchdogs[0]).toContain("[pij watchdog #1 for pij-c]");
		expect(ports.sent).toEqual([]);

		pane = CLAUDE_COMPOSER_EMPTY;
		await daemon.tick();
		expect(ports.sent.filter((entry) => entry.text.includes("[pij watchdog #"))).toHaveLength(1);
		expect(unreadBodies("pij-c")).toEqual([]);
	});

	it("delivers immediately while busy when the composer is empty", async () => {
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
		const channel = new FsChannel(home);
		channel.deliver({ from: "pij-boss", to: "pij-c", body: "busy is not a gate" });
		const ports = fakePorts({
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 23 }],
			tapChunks: [new Uint8Array(300).fill(120)],
		});
		const daemon = new Daemon(home, ports, registry, channel);

		await daemon.tick();
		expect(daemon.paneSignal("%4")).toMatchObject({ busy: true, userTyping: false });
		expect(ports.sent).toContainEqual({
			pane: "%4",
			text: "[pij from pij-boss] busy is not a gate",
		});
	});

	it("attaches newly listed panes and detaches pane_dead entries", async () => {
		let dead = false;
		const ports = fakePorts({
			paneListings: () => [{ paneId: "%4", dead, cursorX: 2, cursorY: 23 }],
		});
		const daemon = new Daemon(home, ports, new FsRegistry(home), new FsChannel(home));
		await daemon.tick();
		expect(ports.attached).toEqual(["%4"]);
		dead = true;
		await daemon.tick();
		expect(ports.detached).toEqual(["%4"]);
		expect(daemon.paneSignal("%4")).toBeUndefined();
	});
});

describe("Daemon.tick Phase 3 terminal reconciliation wiring", () => {
	it("labels the first durable death sweep historical, persists it, and restart does not duplicate", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-parent", pid: 101 }));
		registry.write(
			desc({
				id: "pij-dead",
				harness: "pi",
				lifecycle: "bound",
				spawnedBy: "pij-parent",
				lastEventAt: "2026-06-27T23:59:00.000Z",
			}),
		);
		const channel = new FsChannel(home);
		// pid 101 is the parent and it is ALIVE: this test is about the WORDING of a
		// notice that reaches its recipient. A blanket `alive: false` also kills the
		// recipient, and an obituary addressed to a corpse is correctly withheld.
		const ports = fakePorts({ isAlive: (pid) => pid === 101, nowMs: NOW_MS });

		await new Daemon(home, ports, registry, channel).tick();

		const terminal = registry.read("pij-dead");
		expect(terminal).toMatchObject({
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: new Date(NOW_MS).toISOString(),
				evidence: "pid-missing",
			},
			deathNoticeLatchedAt: new Date(NOW_MS).toISOString(),
		});
		const exitNotices = () => messageBodies("pij-parent").filter((b) => b.includes("has exited"));
		expect(exitNotices()).toEqual([expect.stringContaining("historical boot reconciliation")]);
		expect(exitNotices()[0]).toContain(new Date(NOW_MS).toISOString());

		await new Daemon(home, ports, registry, channel).tick();
		expect(exitNotices()).toHaveLength(1);
	});

	it("uses live-observation wording after the daemon's first sweep", async () => {
		const registry = new FsRegistry(home);
		const channel = new FsChannel(home);
		const ports = fakePorts({ isAlive: (pid) => pid === 101, nowMs: NOW_MS });
		const daemon = new Daemon(home, ports, registry, channel);
		await daemon.tick();
		registry.write(desc({ id: "pij-parent", pid: 101 }));
		registry.write(
			desc({
				id: "pij-live-death",
				harness: "pi",
				lifecycle: "bound",
				spawnedBy: "pij-parent",
			}),
		);

		await daemon.tick();

		expect(messageBodies("pij-parent").filter((b) => b.includes("has exited"))).toEqual([
			expect.stringContaining("live observation"),
		]);
	});

	// REVERSED BY s095 (AC-6), deliberately — the daemon-level twin of the unit
	// reversal in `core/daemon/death-reconciler.test.ts`.
	//
	// This used to assert that a THROWING liveness probe was persisted as
	// `disposition: "unavailable"`. Containing the throw is still right, and is
	// still asserted; what changed is that an observation which never happened is
	// no longer WRITTEN DOWN as though it had. A durable `terminal` record is read
	// by anomaly suppression, by `releaseIdentity`'s re-bind refusal and by
	// `revive` as terminal truth — so stamping one from a failed probe manufactured
	// exactly the false-absence this stream exists to remove, and then latched it.
	//
	// `unknown` now mutates nothing: no terminal, no notice, no write.
	it("contains an unavailable PID probe and records NOTHING from it", async () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-unavailable",
				harness: "pi",
				lifecycle: "bound",
			}),
		);
		const ports = fakePorts({
			nowMs: NOW_MS,
			isAlive: () => {
				if (new Error().stack?.includes("death-reconciler")) {
					throw new Error("EPERM probing pid");
				}
				return true;
			},
		});

		expect(() => new Daemon(home, ports, registry, new FsChannel(home)).tick()).not.toThrow();
		expect(registry.read("pij-unavailable")?.terminal).toBeUndefined();
	});
});

describe("Daemon.tick provider-failure peek", () => {
	it("does not push a provider failure while the session is working with fresh activity", async () => {
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

		await new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(messageBodies("pij-boss")).toHaveLength(0);
		expect(registry.read("pij-coder")?.failureReason).toBeUndefined();
	});

	it("does not push a provider failure for transient rate-limit scrollback", async () => {
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

		await new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(messageBodies("pij-boss")).toHaveLength(0);
		expect(registry.read("pij-coder")?.failureReason).toBeUndefined();
	});

	it("pushes Case-3 terminal provider failures only when not working and stale", async () => {
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

		await new Daemon(home, ports, registry, new FsChannel(home)).tick();

		expect(registry.read("pij-coder")?.failureReason).toBe("quota");
		expect(messageBodies("pij-boss").join("\n")).toContain("quota");
	});

	it("clears stale failureReason and provider-failure latch when the session recovers", async () => {
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
		await daemon.tick();
		const failed = registry.read("pij-coder");
		if (!failed) throw new Error("missing failed descriptor");
		expect(failed.failureReason).toBe("quota");
		expect(messageBodies("pij-boss")).toHaveLength(1);

		registry.write({ ...failed, state: "working", lastEventAt: FRESH_AT });
		await daemon.tick();
		const recovered = registry.read("pij-coder");
		if (!recovered) throw new Error("missing recovered descriptor");
		expect(recovered.failureReason).toBeUndefined();
		expect(messageBodies("pij-boss")).toHaveLength(1);

		registry.write({ ...recovered, state: "idle", lastEventAt: STALE_AT });
		await daemon.tick();
		expect(registry.read("pij-coder")?.failureReason).toBe("quota");
		expect(messageBodies("pij-boss")).toHaveLength(2);
	});
});

describe("Daemon.tick — `--once` agent-peer auto-close (T008 / AC-16)", () => {
	it("orders once close intent → kill → requested terminal → dissolve exactly", async () => {
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
		const trace: string[] = [];
		let intentSeen = false;
		let terminalSeen = false;
		const write = registry.write.bind(registry);
		// Forwards `writer` — a spy that drops it disarms the write law under test.
		registry.write = (descriptor, writer) => {
			if (descriptor.id === "pij-agent" && descriptor.closeIntent && !intentSeen) {
				trace.push("intent-write");
				intentSeen = true;
			}
			if (descriptor.id === "pij-agent" && descriptor.terminal && !terminalSeen) {
				trace.push("terminal-write");
				terminalSeen = true;
			}
			write(descriptor, writer);
		};
		const dissolve = registry.dissolve.bind(registry);
		registry.dissolve = (id) => {
			trace.push("dissolve");
			dissolve(id);
		};
		const ports = fakePorts();
		ports.killPane = (pane) => {
			trace.push("kill");
			ports.killed.push(pane);
		};
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(trace).toEqual(["intent-write", "kill", "terminal-write", "dissolve"]);
		expect(registry.read("pij-agent")).toMatchObject({
			lifecycle: "dissolved",
			terminal: { disposition: "requested", evidence: "pane-missing" },
		});
	});

	it("does NOT close a once-mode peer that has not reported yet (the load-bearing latch)", async () => {
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
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.killed).not.toContain("%7");
		expect(registry.read("pij-agent")).not.toBeNull();
	});

	it("leaves a RESIDENT peer that reported untouched (agentOnce false)", async () => {
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
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
		expect(ports.killed).not.toContain("%7");
		expect(registry.read("pij-agent")).not.toBeNull();
	});

	it("never touches a non-agent colleague (no agentOnce/reportedAt)", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-plain", harness: "claude", lifecycle: "bound", paneId: "%7" }));
		const ports = fakePorts();
		await new Daemon(home, ports, registry, new FsChannel(home)).tick();
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
	it("preserves a reportedAt stamped concurrently mid-tick, then auto-closes next tick", async () => {
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
		await daemon.tick();
		const afterTick1 = registry.read("pij-agent");
		expect(afterTick1, "descriptor must still exist after tick 1").not.toBeNull();
		expect(afterTick1?.state, "the activity write must have happened (working→idle)").toBe("idle");
		expect(
			afterTick1?.reportedAt,
			"reportedAt stamped mid-tick must survive the daemon's activity write",
		).toBe(FRESH_AT);

		// Tick 2: the index now sees reportedAt → planOnceClose latches → pane killed +
		// descriptor removed.
		await daemon.tick();
		expect(ports.killed).toContain("%7");
		expect(registry.read("pij-agent")?.lifecycle).toBe("dissolved");
	});
});

describe("Daemon.tick — compact-window queue-not-drop (DL-004)", () => {
	function boundClaude(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
		return desc({
			id: "pij-c",
			harness: "claude",
			lifecycle: "bound",
			paneId: "%4",
			harnessSessionId: "sess",
			lastEventAt: new Date(NOW_MS).toISOString(),
			...over,
		});
	}

	it("holds drain while compactingAt is fresh — message stays durable-unread, NO receipt", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			boundClaude({ compactingAt: new Date(NOW_MS - 1_000).toISOString() }), // inside grace
		);
		const channel = new FsChannel(home);
		const delivered = channel.deliver({ from: "pij-boss", to: "pij-c", body: "queued task" });
		if (!delivered.ok) throw new Error(delivered.message);
		const ports = fakePorts({ nowMs: NOW_MS });

		await new Daemon(home, ports, registry, channel).tick();

		expect(ports.sent.filter((s) => s.text.includes("queued task"))).toHaveLength(0);
		expect(unreadBodies("pij-c")).toEqual(["queued task"]); // the inbox IS the queue
		expect(messageBodies("pij-boss")).not.toContain(
			receiptBody(delivered.value.messageId, "delivered"),
		);
		// Ready pane inside the grace window must NOT insta-clear the mark.
		expect(registry.read("pij-c")?.compactingAt).toBeTruthy();
	});

	it("pane ready past the grace → mark clears and the held message drains with an honest receipt", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			boundClaude({ compactingAt: new Date(NOW_MS - COMPACT_GRACE_MS - 1).toISOString() }),
		);
		const channel = new FsChannel(home);
		const delivered = channel.deliver({ from: "pij-boss", to: "pij-c", body: "queued task" });
		if (!delivered.ok) throw new Error(delivered.message);
		const ports = fakePorts({ nowMs: NOW_MS });

		await new Daemon(home, ports, registry, channel).tick();

		expect(registry.read("pij-c")?.compactingAt).toBeUndefined();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] queued task" });
		expect(unreadBodies("pij-c")).toEqual([]);
		expect(messageBodies("pij-boss")).toContain(
			receiptBody(delivered.value.messageId, "delivered"),
		);
	});

	it("a mark stale past COMPACT_MAX_MS clears even on a busy pane — drain resumes (no wedged queue)", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(
			boundClaude({ compactingAt: new Date(NOW_MS - COMPACT_MAX_MS - 1).toISOString() }),
		);
		const channel = new FsChannel(home);
		const delivered = channel.deliver({ from: "pij-boss", to: "pij-c", body: "queued task" });
		if (!delivered.ok) throw new Error(delivered.message);
		// Pane still shows a live-turn marker (a compact that wedged mid-window).
		const ports = fakePorts({ nowMs: NOW_MS, paneText: "✽ Compacting… (esc to interrupt)" });

		await new Daemon(home, ports, registry, channel).tick();

		expect(registry.read("pij-c")?.compactingAt).toBeUndefined();
		expect(ports.sent).toContainEqual({ pane: "%4", text: "[pij from pij-boss] queued task" });
		expect(messageBodies("pij-boss")).toContain(
			receiptBody(delivered.value.messageId, "delivered"),
		);
	});

	it("remote /compact injection marks the window and holds the REST of the batch behind it", async () => {
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(boundClaude());
		const channel = new FsChannel(home);
		const compact = channel.deliver({
			from: "pij-boss",
			to: "pij-c",
			body: "",
			command: "compact",
		});
		const task = channel.deliver({ from: "pij-boss", to: "pij-c", body: "after compact" });
		if (!compact.ok) throw new Error(compact.message);
		if (!task.ok) throw new Error(task.message);
		const ports = fakePorts({ nowMs: NOW_MS });

		await new Daemon(home, ports, registry, channel).tick();

		// The trigger went through; the follow-up stayed durable-unread behind it.
		expect(ports.sent).toContainEqual({ pane: "%4", text: "/compact" });
		expect(ports.sent.filter((s) => s.text.includes("after compact"))).toHaveLength(0);
		expect(registry.read("pij-c")?.compactingAt).toBe(new Date(NOW_MS).toISOString());
		expect(unreadBodies("pij-c")).toEqual(["after compact"]);
		expect(messageBodies("pij-boss")).toContain(receiptBody(compact.value.messageId, "delivered"));
		expect(messageBodies("pij-boss")).not.toContain(receiptBody(task.value.messageId, "delivered"));

		// Compaction ends: pane ready past the grace → the held message flushes.
		const laterPorts = fakePorts({ nowMs: NOW_MS + COMPACT_GRACE_MS + 1_000 });
		await new Daemon(home, laterPorts, registry, channel).tick();

		expect(registry.read("pij-c")?.compactingAt).toBeUndefined();
		expect(laterPorts.sent).toContainEqual({
			pane: "%4",
			text: "[pij from pij-boss] after compact",
		});
		expect(unreadBodies("pij-c")).toEqual([]);
		expect(messageBodies("pij-boss")).toContain(receiptBody(task.value.messageId, "delivered"));
	});
});

describe("touchDaemonHeartbeat — the tick-loop liveness rider (#40 Defect 2)", () => {
	it("advances the lock mtime past its stale startup value", async () => {
		const lockPath = join(home, "daemon.lock");
		writeFileSync(lockPath, JSON.stringify({ pid: 1, startedAt: "2020-01-01T00:00:00Z" }));
		// Simulate an hours-old startup mtime (the false-stale trigger).
		const stale = new Date("2020-01-01T00:00:00Z");
		touchDaemonHeartbeat(lockPath, stale);
		expect(statSync(lockPath).mtimeMs).toBe(stale.getTime());

		const fresh = new Date("2026-07-23T09:00:00Z");
		touchDaemonHeartbeat(lockPath, fresh);
		expect(statSync(lockPath).mtimeMs).toBe(fresh.getTime());
		expect(statSync(lockPath).mtimeMs).toBeGreaterThan(stale.getTime());
	});

	it("is best-effort: a missing lock (racing teardown) never throws", async () => {
		const gonePath = join(home, "does-not-exist", "daemon.lock");
		expect(() => touchDaemonHeartbeat(gonePath, new Date("2026-07-23T09:00:00Z"))).not.toThrow();
	});
});

// ── pij#180 Fix A (s100) — the tick heartbeat ────────────────────────
// The tick used to stamp `lastTickAt` onto EVERY daemon-owned descriptor, i.e.
// one `FsRegistry.publish()` (~5 fsync-barriered atomic writes) per seat per
// 600ms — 132 writes/tick in production, 52% of tick self-time. These specs pin
// the replacement: ONE heartbeat persist, ZERO registry writes, independent of
// the owned-set size.

/** Counts `write` calls on a REAL FsRegistry — the count is the claim, and the
 *  real registry keeps the on-disk descriptor honest for AC-07. Forwards
 *  `writer`; a double that drops it silently disarms the write law. */
class CountingRegistry extends FsRegistry {
	writes = 0;

	override write(value: SessionDescriptor, writer?: DescriptorWriter): void {
		this.writes += 1;
		super.write(value, writer);
	}
}

/** Counts persists on the REAL store, so the count and the file content are
 *  the same object under test — a pure spy could agree with a store that never
 *  wrote anything. */
class CountingHeartbeat extends FsTickHeartbeatStore {
	writes = 0;

	override write(ids: readonly string[], tickAt: string): void {
		this.writes += 1;
		super.write(ids, tickAt);
	}
}

/** `count` bound claude seats — daemon-owned by `daemonOwnsDelivery` (sendkeys
 *  transport), which is the exact filter the tick loop applies. */
function seedOwned(registry: RegistryPort, count: number): void {
	for (let i = 0; i < count; i += 1) {
		registry.write(
			desc({
				id: `pij-owned-${i}`,
				harness: "claude",
				lifecycle: "bound",
				paneId: `%${100 + i}`,
				harnessSessionId: `sess-${i}`,
			}),
		);
	}
}

/** MEASURED, not assumed. Two other per-descriptor writers run inside `tick()`
 *  and both CONVERGE: `observeActivity` (daemon.ts:586) settles after tick 1,
 *  and `RuntimeAxisTracker.drive` settles once `systemState` reaches its
 *  verdict on tick 2. Instrumenting `FsRegistry.prototype.write` with five
 *  owned seats: tick 1 = 15 writes (5 heartbeat + 5 activity + 5 axis),
 *  tick 2 = 10 (5 heartbeat + 5 axis), tick 3 = 5 — heartbeat ONLY.
 *  So the steady-state tick isolates the heartbeat's contribution exactly,
 *  with no hard-coded baseline to rot: 5 owned → 5, 50 owned → 50. */
async function tickToSteadyState(daemon: Daemon): Promise<void> {
	await daemon.tick();
	await daemon.tick();
}

describe("Daemon.tick heartbeat (pij#180 Fix A)", () => {
	it("AC-02: performs zero registry writes for the tick heartbeat", async () => {
		const registry = new CountingRegistry(home);
		seedOwned(registry, 5);
		const daemon = new Daemon(home, fakePorts({ nowMs: NOW_MS }), registry, new FsChannel(home));
		await tickToSteadyState(daemon);
		registry.writes = 0; // warm-up is setup, not the claim

		await daemon.tick();

		expect(registry.writes).toBe(0);
	});

	it("AC-01: performs exactly one heartbeat persist per tick", async () => {
		const registry = new FsRegistry(home);
		seedOwned(registry, 5);
		const heartbeat = new CountingHeartbeat(home);
		const daemon = new Daemon(
			home,
			fakePorts({ nowMs: NOW_MS }),
			registry,
			new FsChannel(home),
			undefined,
			undefined,
			undefined,
			undefined,
			heartbeat,
		);

		await daemon.tick();

		expect(heartbeat.writes).toBe(1);
	});

	it("AC-03: still exactly one persist with 50 owned descriptors", async () => {
		// The claim is INDEPENDENCE from the owned-set size — the old loop scaled
		// 1:1 with it, which is the entire defect.
		const registry = new FsRegistry(home);
		seedOwned(registry, 50);
		const heartbeat = new CountingHeartbeat(home);
		const daemon = new Daemon(
			home,
			fakePorts({ nowMs: NOW_MS }),
			registry,
			new FsChannel(home),
			undefined,
			undefined,
			undefined,
			undefined,
			heartbeat,
		);

		await daemon.tick();

		expect(heartbeat.writes).toBe(1);
	});

	it("AC-03b: the one persist carries every owned id, and only owned ids", async () => {
		// A single write that dropped seats would satisfy AC-01/AC-03 while
		// silently losing the telemetry — the count alone is not enough.
		const registry = new FsRegistry(home);
		seedOwned(registry, 5);
		registry.write(desc({ id: "pij-pull", harness: "claude", deliveryMode: "pull" }));
		registry.write(desc({ id: "pij-pi", harness: "pi" }));
		const heartbeat = new CountingHeartbeat(home);
		const daemon = new Daemon(
			home,
			fakePorts({ nowMs: NOW_MS }),
			registry,
			new FsChannel(home),
			undefined,
			undefined,
			undefined,
			undefined,
			heartbeat,
		);

		await daemon.tick();

		expect(Object.keys(heartbeat.read()).sort()).toEqual([
			"pij-owned-0",
			"pij-owned-1",
			"pij-owned-2",
			"pij-owned-3",
			"pij-owned-4",
		]);
		expect(heartbeat.read()["pij-owned-0"]).toBe(new Date(NOW_MS).toISOString());
	});

	it("AC-07: the RAW on-disk descriptor no longer accrues lastTickAt", async () => {
		const registry = new FsRegistry(home);
		seedOwned(registry, 5);
		const daemon = new Daemon(home, fakePorts({ nowMs: NOW_MS }), registry, new FsChannel(home));

		await daemon.tick();

		// Read the file directly — going through the registry would, from Phase 3
		// on, be answered by the overlay and could never observe this.
		const raw: unknown = JSON.parse(readFileSync(join(home, "pij-owned-0.json"), "utf8"));
		expect((raw as SessionDescriptor).lastTickAt).toBeUndefined();
	});

	it("AC-07b: the heartbeat file is invisible to registry.list()", async () => {
		// It lives beside the descriptors; `readFile` admits a record only when
		// `typeof parsed?.id === "string"`, and the wrapper has no top-level id.
		const registry = new FsRegistry(home);
		seedOwned(registry, 5);
		const daemon = new Daemon(home, fakePorts({ nowMs: NOW_MS }), registry, new FsChannel(home));

		await daemon.tick();

		expect(existsSync(join(home, TICK_HEARTBEAT_FILE))).toBe(true);
		expect(
			registry
				.list()
				.map((d) => d.id)
				.sort(),
		).toEqual(["pij-owned-0", "pij-owned-1", "pij-owned-2", "pij-owned-3", "pij-owned-4"]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// s101 / pij#229 — ONE RENDERED FRAME PER PANE PER TICK, for the consumers that
// want the tick's frame; a fresh read for the guards that want the latest one.
//
// `refreshPaneSignals` already captured every live pane once per tick and said
// why: the caret tracker and the content gate must reason about the SAME frame.
// The drive loop's activity axis — which decides `working`/`idle`, refreshes
// `lastEventAt`, and feeds the stall watchdog — was a third consumer taking its
// OWN later capture of the same pane in the same tick. Nothing detected the
// disagreement.
//
// THE DISTINCTION THAT MAKES THIS SAFE, and it is not "fewer forks is better":
// the flush gate, the outer drain check and the pre-send check are RACE
// DETECTORS. Their correctness depends on reading as LATE as possible, so they
// are deliberately left un-shared — see the capture-order note in the typing
// test above, which pins that.
describe("pij#229: the tick's pane frame is captured once and shared", () => {
	it("does not re-capture a pane the signals pass already captured this tick", async () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-live",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%4",
				harnessSessionId: "sess",
			}),
		);
		const ports = fakePorts({
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});

		await new Daemon(home, ports, new FsRegistry(home), new FsChannel(home)).tick();

		// EXACTLY two reads of %4: the signals pass, and the flush gate (a race
		// detector, deliberately unshared). The activity axis's third read is gone —
		// it now reads the signals pass's frame, so both reason about one frame.
		expect(ports.captured).toEqual(["%4", "%4"]);
	});

	it("NEVER captures a pane tmux did not list — the gone-pane skip", async () => {
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-gone",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%404",
				harnessSessionId: "sess",
			}),
		);
		// tmux lists a DIFFERENT pane, so %404 is proven absent in this same tick.
		const ports = fakePorts({
			paneListings: () => [{ paneId: "%4", dead: false, cursorX: 2, cursorY: 45 }],
		});

		await new Daemon(home, ports, new FsRegistry(home), new FsChannel(home)).tick();

		// EXACTLY ONE read of %404, and the count is the finding.
		//
		// The activity axis asked about %404 and got "" WITHOUT a subprocess —
		// `capturePane` on a gone pane returns "" anyway, so that is the same answer
		// at no cost. Measured live: 84 of 117 owned panes per tick are gone, and a
		// capture of a gone pane costs MORE than a live one (9.05ms vs 6.70ms).
		//
		// THE REMAINING ONE IS THE FLUSH GATE, and it is NOT a bug here — it is a
		// race detector, deliberately unshared. It is, however, the next thing worth
		// removing: a guard against "is a human typing in this pane" is meaningless
		// for a pane tmux has just reported does not exist. That is a change to a
		// DELIVERY guard rather than an observation path, so it is named here and
		// left alone rather than folded into pij#229.
		expect(ports.captured.filter((pane) => pane === "%404")).toEqual(["%404"]);
	});

	it("falls back to a direct capture when there is NO live-pane list", async () => {
		// `listPanes`/the tap ports are optional. With the signals pass absent,
		// NOTHING IS KNOWN about which panes exist — and "no list" must never be
		// read as "the pane is absent", or an instrument's limit becomes the world's
		// property and every pane on the machine reads as gone in one tick.
		const registry = new FsRegistry(home);
		registry.write(
			desc({
				id: "pij-nolist",
				harness: "claude",
				lifecycle: "bound",
				paneId: "%7",
				harnessSessionId: "sess",
			}),
		);
		const ports = fakePorts(); // no paneListings → no signals pass

		await new Daemon(home, ports, new FsRegistry(home), new FsChannel(home)).tick();

		expect(ports.captured).toContain("%7");
	});
});
