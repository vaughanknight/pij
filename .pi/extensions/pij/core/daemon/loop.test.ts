import { describe, expect, it } from "vitest";

import { FakeDelivery, FakeRegistry } from "../../adapters/fakes.js";
import { transcriptDir } from "../harness/claude.js";
import type { SessionDescriptor } from "../types.js";
import {
	type DaemonPorts,
	type DriveState,
	driveSession,
	observeActivity,
	WATCHDOG_TIMEOUT_MS,
} from "./loop.js";

// Fixtures lifted from the live prototype (same as readiness/interstitial specs).
const READY = "⏵⏵ auto mode on (shift+tab to cycle) · ← for agents";
const COPILOT_READY = "/ commands · ? help · tab next tab                  GPT-5.5";
const BOOTING = "▝▜█████▛▘ Loading…";
const CHROME = "Claude in Chrome extension detected\n Esc to keep browser tools off";
const TRUST = "Do you trust the files in this folder?\n /repo\n Enter to confirm · Esc to exit";

const HOME = "/home/jo";
const CWD = "/home/jo/proj";
const DIR = transcriptDir(HOME, CWD);

function desc(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-w",
		folder: CWD,
		dataDir: `/home/.pij/pij-w`,
		eventsPath: `/home/.pij/pij-w/events.ndjson`,
		pid: 100,
		startedAt: "2026-06-27T00:00:00.000Z",
		harness: "claude",
		lifecycle: "pending",
		paneId: "%1",
		spawnedBy: "pij-boss",
		...over,
	};
}

interface FakeWorld {
	ports: DaemonPorts;
	sentText: Array<{ pane: string; text: string }>;
	sentKeys: Array<{ pane: string; key: string }>;
	setPane(text: string): void;
	setTranscripts(paths: string[]): void;
	setNow(ms: number): void;
}

function world(opts: { pane?: string; transcripts?: string[]; dead?: boolean } = {}): FakeWorld {
	let pane = opts.pane ?? BOOTING;
	let transcripts = opts.transcripts ?? [];
	let nowMs = 1000;
	const dead = opts.dead ?? false;
	const sentText: FakeWorld["sentText"] = [];
	const sentKeys: FakeWorld["sentKeys"] = [];
	const ports: DaemonPorts = {
		capturePane: () => pane,
		isPaneDead: () => dead,
		sendText: (p, t) => sentText.push({ pane: p, text: t }),
		sendKey: (p, k) => sentKeys.push({ pane: p, key: k }),
		listTranscripts: () => transcripts,
		home: () => HOME,
		now: () => nowMs,
		isAlive: () => true,
	};
	return {
		ports,
		sentText,
		sentKeys,
		setPane: (t) => {
			pane = t;
		},
		setTranscripts: (p) => {
			transcripts = p;
		},
		setNow: (ms) => {
			nowMs = ms;
		},
	};
}

describe("driveSession state machine", () => {
	it("booting pane → boot (nothing injected)", () => {
		const w = world({ pane: BOOTING });
		const out = driveSession(desc(), {}, w.ports, new FakeRegistry(), new FakeDelivery());
		expect(out).toEqual({ kind: "boot" });
		expect(w.sentText).toHaveLength(0);
	});

	it("chrome interstitial → dismissed via Escape", () => {
		const w = world({ pane: CHROME });
		const out = driveSession(desc(), {}, w.ports, new FakeRegistry(), new FakeDelivery());
		expect(out).toMatchObject({ kind: "dismissed" });
		expect(w.sentKeys).toEqual([{ pane: "%1", key: "Escape" }]);
	});

	it("trust interstitial → needs-human, notifies the creator exactly once", () => {
		const w = world({ pane: TRUST });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = {};
		const d = desc({ paneId: "%1" });
		expect(driveSession(d, drive, w.ports, reg, del)).toMatchObject({ kind: "needs-human" });
		// second tick — still needs-human, but no second notification
		driveSession(d, drive, w.ports, reg, del);
		expect(del.outbox.filter((e) => e.message.to === "pij-boss")).toHaveLength(1);
		expect(w.sentKeys).toHaveLength(0); // never auto-answered
	});

	it("ready + not-yet-injected → injects init once and marks initInjectedAt", () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry([desc()]);
		const out = driveSession(desc(), {}, w.ports, reg, new FakeDelivery());
		expect(out).toEqual({ kind: "injected-init" });
		expect(w.sentText[0]?.text).toContain("pij phonehome");
		expect(reg.read("pij-w")?.initInjectedAt).toBeTruthy();
	});

	it("does NOT re-inject init once initInjectedAt is set (idempotent)", () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry();
		const out = driveSession(
			desc({ initInjectedAt: "2026-06-27T00:00:05.000Z" }),
			{},
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(out.kind).not.toBe("injected-init");
		expect(w.sentText.filter((s) => s.text.includes("You are now a pij peer"))).toHaveLength(0);
	});

	it("ready + a NEW transcript appears → bound, creator notified", () => {
		const w = world({ pane: READY, transcripts: [`${DIR}/preexisting.jsonl`] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		// init already injected; before-set captured on the first tick
		const drive: DriveState = { before: [`${DIR}/preexisting.jsonl`], readyAtMs: 1000 };
		w.setTranscripts([`${DIR}/preexisting.jsonl`, `${DIR}/claude-new.jsonl`]);
		const out = driveSession(
			desc({ initInjectedAt: "2026-06-27T00:00:05.000Z" }),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out).toEqual({ kind: "bound", harnessSessionId: "claude-new" });
		expect(reg.read("pij-w")?.harnessSessionId).toBe("claude-new");
		expect(reg.read("pij-w")?.lifecycle).toBe("bound");
		expect(
			del.outbox.some((e) => e.message.to === "pij-boss" && e.message.body.includes("ready")),
		).toBe(true);
	});

	it("copilot: ready + plannedHarnessSessionId → binds deterministically (no discovery)", () => {
		// Copilot chose its session id at spawn (`--session-id`), so the daemon binds
		// to the planned id the instant the pane is interactive — no transcript needed.
		const w = world({ pane: COPILOT_READY, transcripts: [] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000 };
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "9a8f8be6-uuid",
			}),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out).toEqual({ kind: "bound", harnessSessionId: "9a8f8be6-uuid" });
		expect(reg.read("pij-w")?.harnessSessionId).toBe("9a8f8be6-uuid");
		expect(reg.read("pij-w")?.lifecycle).toBe("bound");
		expect(
			del.outbox.some((e) => e.message.to === "pij-boss" && e.message.body.includes("ready")),
		).toBe(true);
	});

	it("NEVER binds the pre-existing transcript (the load-bearing case)", () => {
		const w = world({ pane: READY, transcripts: [`${DIR}/preexisting.jsonl`] });
		const reg = new FakeRegistry();
		const drive: DriveState = { before: [`${DIR}/preexisting.jsonl`], readyAtMs: 1000 };
		// no new file appears; within the watchdog window → waiting, not bound
		const out = driveSession(
			desc({ initInjectedAt: "x" }),
			drive,
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(out.kind).toBe("waiting");
		expect(reg.read("pij-w")).toBeNull();
	});

	it("watchdog: past one window → resend-phonehome; past the second → failed + notify", () => {
		const w = world({ pane: READY, transcripts: [] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { before: [], readyAtMs: 1000 };
		w.setNow(1000 + WATCHDOG_TIMEOUT_MS);
		expect(driveSession(desc({ initInjectedAt: "x" }), drive, w.ports, reg, del).kind).toBe(
			"resent-phonehome",
		);
		expect(w.sentText.at(-1)?.text).toBe("pij phonehome");
		// second window after the re-send → fail
		w.setNow((drive.resentAtMs ?? 0) + WATCHDOG_TIMEOUT_MS);
		expect(driveSession(desc({ initInjectedAt: "x" }), drive, w.ports, reg, del).kind).toBe(
			"failed",
		);
		expect(reg.read("pij-w")?.lifecycle).toBe("failed");
		expect(
			del.outbox.some(
				(e) => e.message.to === "pij-boss" && e.message.body.includes("failed to bind"),
			),
		).toBe(true);
	});

	it("review H1: seeds `before` from descriptor.transcriptsAtSpawn (not a live snapshot)", () => {
		// The dir ALREADY contains claude's transcript (boot beat the first tick),
		// but it was NOT present at spawn → it must still be discovered as new.
		const w = world({ pane: READY, transcripts: [`${DIR}/claude-new.jsonl`] });
		const reg = new FakeRegistry();
		const drive: DriveState = {}; // fresh — before must come from the descriptor
		const out = driveSession(
			desc({ initInjectedAt: "x", transcriptsAtSpawn: [] }), // empty at spawn
			drive,
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(out).toEqual({ kind: "bound", harnessSessionId: "claude-new" });
	});

	it("review M3: a pane busy BEFORE init does not start the watchdog (waits, no resend)", () => {
		const w = world({ pane: "Searching the codebase (esc to interrupt)" }); // busy
		const reg = new FakeRegistry();
		const drive: DriveState = {};
		w.setNow(999_999); // far past any window — must NOT fail/resend while uninit
		const out = driveSession(desc(), drive, w.ports, reg, new FakeDelivery());
		expect(out.kind).toBe("waiting");
		expect(drive.readyAtMs).toBeUndefined(); // clock never anchored pre-init
		expect(w.sentText).toHaveLength(0);
	});

	it("review M4: concurrent boots (two new transcripts) → ambiguous outcome", () => {
		const w = world({
			pane: READY,
			transcripts: [`${DIR}/a.jsonl`, `${DIR}/b.jsonl`],
		});
		const drive: DriveState = { before: [], readyAtMs: 1000 };
		const out = driveSession(
			desc({ initInjectedAt: "x" }),
			drive,
			w.ports,
			new FakeRegistry(),
			new FakeDelivery(),
		);
		expect(out).toEqual({ kind: "ambiguous", count: 2 });
	});

	it("dead pane → failed immediately, creator notified", () => {
		const w = world({ pane: READY, dead: true });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const out = driveSession(desc(), {}, w.ports, reg, del);
		expect(out.kind).toBe("failed");
		expect(reg.read("pij-w")?.lifecycle).toBe("failed");
	});
});

describe("observeActivity (control-plane working|idle|done persistence)", () => {
	const NOW = 1_000_000;
	it("busy footer → working + a fresh lastEventAt", () => {
		const u = observeActivity(desc({ lifecycle: "bound" }), "busy", NOW);
		expect(u?.state).toBe("working");
		expect(u?.lastEventAt).toBe(new Date(NOW).toISOString());
	});
	it("ready footer → idle, preserving the last-activity ts (so it reads 'done')", () => {
		const prior = new Date(NOW - 5000).toISOString();
		const u = observeActivity(desc({ lifecycle: "bound", state: "working", lastEventAt: prior }), "ready", NOW);
		expect(u?.state).toBe("idle");
		expect(u?.lastEventAt).toBe(prior);
	});
	it("no change → null (no needless registry write)", () => {
		const at = new Date(NOW).toISOString();
		const u = observeActivity(desc({ lifecycle: "bound", state: "idle", lastEventAt: at }), "ready", NOW);
		expect(u).toBeNull();
	});
	it("throttles the busy refresh — a recent lastEventAt is not rewritten every tick", () => {
		const recent = new Date(NOW - 2000).toISOString(); // < ACTIVITY_REFRESH_MS
		const u = observeActivity(desc({ lifecycle: "bound", state: "working", lastEventAt: recent }), "busy", NOW);
		expect(u).toBeNull();
	});
	it("refreshes a stale busy ts past the throttle window (liveness stays active mid-turn)", () => {
		const old = new Date(NOW - 30_000).toISOString(); // > ACTIVITY_REFRESH_MS
		const u = observeActivity(desc({ lifecycle: "bound", state: "working", lastEventAt: old }), "busy", NOW);
		expect(u?.lastEventAt).toBe(new Date(NOW).toISOString());
	});
	it("non-interactive readiness (booting/interstitial/dead) → null (driveSession owns it)", () => {
		expect(observeActivity(desc({ lifecycle: "bound" }), "booting", NOW)).toBeNull();
		expect(observeActivity(desc({ lifecycle: "bound" }), "dead", NOW)).toBeNull();
	});
});
