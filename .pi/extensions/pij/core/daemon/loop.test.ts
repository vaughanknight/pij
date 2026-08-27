import { describe, expect, it } from "vitest";

import { FakeDelivery, FakeRegistry } from "../../adapters/fakes.js";
import { transcriptDir } from "../harness/claude.js";
import type { ProcessSnapshot } from "../platform/types.js";
import type { SessionDescriptor } from "../types.js";
import { reconcileDeaths } from "./death-reconciler.js";
import {
	backfillWindowId,
	type DaemonPorts,
	type DriveState,
	drainTmuxInbox,
	driveSession,
	observeActivity,
	persistDaemonWrite,
	pointerLine,
	WATCHDOG_TIMEOUT_MS,
} from "./loop.js";
import { ComposerHoldTracker } from "./pane-signals.js";
import { SendBuffer } from "./router.js";

// Fixtures lifted from the live prototype (same as readiness/interstitial specs).
const READY = "⏵⏵ auto mode on (shift+tab to cycle) · ← for agents";
// A Claude composer with a human's half-typed line in it — the pre-send guard
// must treat this pane as HELD and never type a pointer (or a body) over it.
const HUMAN_COMPOSER = [
	"────────────────────────────────────────────────────────────────",
	"❯ wait, let me check the migration first",
	"────────────────────────────────────────────────────────────────",
	"⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
].join("\n");
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
	sentText: Array<{
		pane: string;
		text: string;
		opts?: { readonly kind?: "pointer" | "body" };
	}>;
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
		sendText: (p, t, _harness, _pid, sendOpts) => {
			sentText.push({
				pane: p,
				text: t,
				...(sendOpts === undefined ? {} : { opts: sendOpts }),
			});
			return "confirmed";
		},
		sendKey: (p, k) => sentKeys.push({ pane: p, key: k }),
		listTranscripts: () => transcripts,
		// Codex (Plan 022): the deep lister backs onto the SAME fake transcript set;
		// cwd-confirm defaults to the descriptor's cwd (overridable per-test).
		listTranscriptsDeep: () => transcripts,
		readTranscriptCwd: () => CWD,
		home: () => HOME,
		now: () => nowMs,
		isAlive: () => true,
		processSnapshot: () => ({
			ok: true,
			capturedAtMs: 1000,
			processes: [
				{ pid: 100, command: "-zsh" },
				{ pid: 101, ppid: 100, command: "claude --dangerously-skip-permissions" },
				{ pid: 102, ppid: 100, command: "codex" },
			],
		}),
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

function processSnapshot(harness: "claude" | "copilot", sessionId: string): ProcessSnapshot {
	return {
		ok: true,
		capturedAtMs: 1000,
		processes: [
			{ pid: 100, command: "-zsh" },
			{
				pid: 101,
				ppid: 100,
				command: `${harness} --session-id ${sessionId}`,
			},
		],
	};
}

describe("driveSession state machine", () => {
	it("booting pane → boot (nothing injected)", async () => {
		const w = world({ pane: BOOTING });
		const out = driveSession(desc(), {}, w.ports, new FakeRegistry(), new FakeDelivery());
		expect(out).toEqual({ kind: "boot" });
		expect(w.sentText).toHaveLength(0);
	});

	it("chrome interstitial → dismissed via Escape", async () => {
		const w = world({ pane: CHROME });
		const out = driveSession(desc(), {}, w.ports, new FakeRegistry(), new FakeDelivery());
		expect(out).toMatchObject({ kind: "dismissed" });
		expect(w.sentKeys).toEqual([{ pane: "%1", key: "Escape" }]);
	});

	it("trust interstitial → needs-human, notifies the creator exactly once", async () => {
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

	it("copilot trust interstitial → answered ONCE (1 + Enter); a persisting modal degrades to needs-human, notify exactly once (DL-001)", async () => {
		const w = world({ pane: TRUST });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = {};
		const d = desc({ harness: "copilot" });
		// tick 1 — auto-answer with option 1 (trust once) + Enter, nothing else.
		expect(driveSession(d, drive, w.ports, reg, del)).toEqual({
			kind: "answered",
			label: "folder-trust",
		});
		expect(w.sentKeys).toEqual([
			{ pane: "%1", key: "1" },
			{ pane: "%1", key: "Enter" },
		]);
		// tick 2 — modal persists (version drift): NO key spam, surface to a human.
		expect(driveSession(d, drive, w.ports, reg, del)).toMatchObject({
			kind: "needs-human",
			label: "folder-trust",
		});
		expect(w.sentKeys).toHaveLength(2); // still just the one answer attempt
		// tick 3 — still needs-human, but the creator was notified exactly once.
		driveSession(d, drive, w.ports, reg, del);
		expect(del.outbox.filter((e) => e.message.to === "pij-boss")).toHaveLength(1);
		expect(
			del.outbox.some(
				(e) => e.message.to === "pij-boss" && e.message.body.includes("folder-trust"),
			),
		).toBe(true);
	});

	it("answers the exact Copilot session-in-use modal once, then surfaces it", async () => {
		const pane = `Session in use
This session was last active just now and appears to be in use by another CLI or application.
❯ 1. Resume anyway
  2. Go back (Esc)`;
		const w = world({ pane });
		const drive: DriveState = {};
		const delivery = new FakeDelivery();
		const descriptor = desc({
			harness: "copilot",
			revivePendingAt: "2026-07-25T00:00:00.000Z",
		});
		expect(driveSession(descriptor, drive, w.ports, new FakeRegistry(), delivery)).toEqual({
			kind: "answered",
			label: "session-in-use",
		});
		expect(w.sentKeys).toEqual([
			{ pane: "%1", key: "1" },
			{ pane: "%1", key: "Enter" },
		]);
		expect(driveSession(descriptor, drive, w.ports, new FakeRegistry(), delivery)).toEqual({
			kind: "needs-human",
			label: "session-in-use",
		});
		expect(w.sentKeys).toHaveLength(2);
		expect(delivery.outbox.at(-1)?.message.body).toContain("session-in-use");
	});

	it("never answers a quoted resume modal in ready or busy output", async () => {
		const quoted = `Session in use
This session was last active just now and appears to be in use by another CLI or application.
❯ 1. Resume anyway
  2. Go back (Esc)
ordinary agent output
◎ Working esc interrupt`;
		const w = world({ pane: quoted });
		const outcome = driveSession(
			desc({ harness: "copilot", revivePendingAt: "2026-07-25T00:00:00.000Z" }),
			{},
			w.ports,
			new FakeRegistry(),
			new FakeDelivery(),
		);
		expect(outcome.kind).not.toBe("answered");
		expect(w.sentKeys).toEqual([]);
	});

	it("answers folder trust and session resume independently", async () => {
		const w = world({ pane: TRUST });
		const drive: DriveState = {};
		const descriptor = desc({ harness: "copilot" });
		expect(
			driveSession(descriptor, drive, w.ports, new FakeRegistry(), new FakeDelivery()),
		).toMatchObject({ kind: "answered", label: "folder-trust" });
		w.setPane(`Session in use
This session was last active just now and appears to be in use by another CLI or application.
❯ 1. Resume anyway
  2. Go back (Esc)`);
		expect(
			driveSession(descriptor, drive, w.ports, new FakeRegistry(), new FakeDelivery()),
		).toMatchObject({ kind: "answered", label: "session-in-use" });
		expect(w.sentKeys).toHaveLength(4);
	});

	it("ready + not-yet-injected → injects init once and marks initInjectedAt", async () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry([desc()]);
		const out = driveSession(desc(), {}, w.ports, reg, new FakeDelivery());
		expect(out).toEqual({ kind: "injected-init" });
		expect(w.sentText[0]?.text).toContain("pij phonehome");
		expect(reg.read("pij-w")?.initInjectedAt).toBeTruthy();
	});

	it("branched descriptor → init injects the fork reframe (T016, Finding 08)", async () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry();
		driveSession(desc({ branchedFrom: "claude-src" }), {}, w.ports, reg, new FakeDelivery());
		expect(w.sentText[0]?.text).toMatch(/FORK/);
		expect(w.sentText[0]?.text).toMatch(/do not (continue|spawn)/i);
	});

	it("revived descriptor wires the non-continuation reframe into init", async () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry();
		const outcome = driveSession(
			desc({ revivePendingAt: "2026-07-25T00:00:00.000Z" }),
			{},
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(outcome).toEqual({ kind: "injected-init" });
		expect(w.sentText[0]?.text).toMatch(/REVIVED/);
		expect(w.sentText[0]?.text).toMatch(/Do NOT continue the old work/i);
	});

	it("does NOT re-inject init once initInjectedAt is set (idempotent)", async () => {
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

	it("ready + a NEW transcript appears → bound, creator notified", async () => {
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

	it("a discovered Claude transcript cannot bind when the pane process names a foreign session", () => {
		const w = world({ pane: READY, transcripts: [`${DIR}/claude-new.jsonl`] });
		w.ports.processSnapshot = () => processSnapshot("claude", "foreign-session");
		const reg = new FakeRegistry();
		const out = driveSession(
			desc({ initInjectedAt: "2026-06-27T00:00:05.000Z" }),
			{ before: [], readyAtMs: 1000 },
			w.ports,
			reg,
			new FakeDelivery(),
		);

		expect(out.kind).toBe("waiting");
		expect(reg.read("pij-w")?.lifecycle).not.toBe("bound");
	});

	it("copilot: ready + plannedHarnessSessionId → binds deterministically (no discovery)", async () => {
		// Copilot chose its session id at spawn (`--session-id`), so the daemon binds
		// to the planned id after the first-inference round-trip — no transcript needed.
		const w = world({ pane: COPILOT_READY, transcripts: [] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		const planned = "9a8f8be6-0000-4000-8000-000000000001";
		w.ports.processSnapshot = () => processSnapshot("copilot", planned);
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: planned,
			}),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out).toEqual({ kind: "bound", harnessSessionId: planned });
		expect(reg.read("pij-w")?.harnessSessionId).toBe(planned);
		expect(reg.read("pij-w")?.lifecycle).toBe("bound");
		expect(
			del.outbox.some((e) => e.message.to === "pij-boss" && e.message.body.includes("ready")),
		).toBe(true);
	});

	it("claude --branch: ready + plannedHarnessSessionId → binds deterministically, no discovery (AC-03)", async () => {
		// A branched claude pinned its forked id (`--session-id`), so it binds on the
		// planned id like copilot — even with NO new transcript (empty discovery set).
		// Binding is gated on firstInferenceSeen (FIX-1) — one tick after the busy turn.
		const w = world({ pane: READY, transcripts: [] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		w.ports.processSnapshot = () => processSnapshot("claude", "fork-uuid");
		const out = driveSession(
			desc({
				harness: "claude",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "fork-uuid",
				branchedFrom: "claude-src",
			}),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out).toEqual({ kind: "bound", harnessSessionId: "fork-uuid" });
		expect(reg.read("pij-w")?.harnessSessionId).toBe("fork-uuid");
		expect(reg.read("pij-w")?.lifecycle).toBe("bound");
	});

	it("planned binding refuses a pane whose harness process names another session", () => {
		const expected = "11111111-1111-4111-8111-111111111111";
		const foreign = "22222222-2222-4222-8222-222222222222";
		const w = world({ pane: COPILOT_READY });
		w.ports.processSnapshot = () => processSnapshot("copilot", foreign);
		const reg = new FakeRegistry();
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: expected,
			}),
			{ readyAtMs: 1000, firstInferenceSeen: true },
			w.ports,
			reg,
			new FakeDelivery(),
		);

		expect(out.kind).toBe("waiting");
		expect(reg.read("pij-w")?.lifecycle).not.toBe("bound");
	});

	it("a stale pending snapshot cannot bind over a durable dissolved descriptor", () => {
		const planned = "11111111-1111-4111-8111-111111111111";
		const w = world({ pane: COPILOT_READY });
		w.ports.processSnapshot = () => processSnapshot("copilot", planned);
		const reg = new FakeRegistry([
			desc({ lifecycle: "dissolved", paneId: undefined, plannedHarnessSessionId: planned }),
		]);
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: planned,
			}),
			{ readyAtMs: 1000, firstInferenceSeen: true },
			w.ports,
			reg,
			new FakeDelivery(),
		);

		expect(out.kind).toBe("waiting");
		expect(w.sentText).toEqual([]);
		expect(reg.read("pij-w")).toMatchObject({ lifecycle: "dissolved", paneId: undefined });
	});

	// ─── codex discovery bind (Plan 022, AC-02, Finding 06) ─────────────────────
	const CODEX_ROOT = `${HOME}/.codex/sessions`;
	const CODEX_OLD = `${CODEX_ROOT}/2026/06/27/rollout-2026-06-27T09-00-00-aaaaaaaa-0001-7000-8000-000000000001.jsonl`;
	const CODEX_NEW = `${CODEX_ROOT}/2026/06/28/rollout-2026-06-28T15-33-30-019f0cb7-f65c-76f1-bb38-c96269590118.jsonl`;
	const CODEX_UUID = "019f0cb7-f65c-76f1-bb38-c96269590118";

	it("codex: ready + a NEW rollout appears → bound to the rollout's TRAILING UUID + transcriptPath persisted (AC-02, Finding 06)", async () => {
		const w = world({ pane: READY, transcripts: [CODEX_OLD, CODEX_NEW] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { before: [CODEX_OLD], readyAtMs: 1000 };
		const out = driveSession(
			desc({ harness: "codex", folder: CWD, initInjectedAt: "2026-06-27T00:00:05.000Z" }),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out).toEqual({ kind: "bound", harnessSessionId: CODEX_UUID });
		const bound = reg.read("pij-w");
		// The bind id is the trailing UUID — NOT the claude-style stem (mutation guard).
		expect(bound?.harnessSessionId).toBe(CODEX_UUID);
		expect(bound?.harnessSessionId).not.toContain("rollout-");
		// The absolute path is persisted for tail (the UUID can't rebuild the date path).
		expect(bound?.transcriptPath).toBe(CODEX_NEW);
		expect(bound?.lifecycle).toBe("bound");
		expect(
			del.outbox.some((e) => e.message.to === "pij-boss" && e.message.body.includes("ready")),
		).toBe(true);
	});

	it("codex: a NEW rollout from ANOTHER cwd is ignored via session_meta cwd-confirm (R-2)", async () => {
		const CODEX_OTHER = `${CODEX_ROOT}/2026/06/28/rollout-2026-06-28T15-40-00-cccccccc-0003-7000-8000-000000000003.jsonl`;
		const w = world({ pane: READY, transcripts: [CODEX_OLD, CODEX_OTHER] });
		// The fresh rollout belongs to a DIFFERENT cwd → must not bind to it.
		w.ports.readTranscriptCwd = (p) => (p === CODEX_OTHER ? "/some/other/repo" : CWD);
		const reg = new FakeRegistry();
		const drive: DriveState = { before: [CODEX_OLD], readyAtMs: 1000 };
		const out = driveSession(
			desc({ harness: "codex", folder: CWD, initInjectedAt: "x" }),
			drive,
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(out.kind).toBe("waiting");
		expect(reg.read("pij-w")).toBeNull();
	});

	it("claude bind sets NO transcriptPath (byte-unchanged — only codex persists the path)", async () => {
		const w = world({
			pane: READY,
			transcripts: [`${DIR}/preexisting.jsonl`, `${DIR}/claude-new.jsonl`],
		});
		const reg = new FakeRegistry();
		const drive: DriveState = { before: [`${DIR}/preexisting.jsonl`], readyAtMs: 1000 };
		driveSession(desc({ initInjectedAt: "x" }), drive, w.ports, reg, new FakeDelivery());
		const bound = reg.read("pij-w");
		expect(bound?.harnessSessionId).toBe("claude-new");
		expect(bound?.transcriptPath).toBeUndefined();
	});

	it("NEVER binds the pre-existing transcript (the load-bearing case)", async () => {
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

	it("watchdog: past one window → resend-phonehome; past the second → failed + notify", async () => {
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

	it("review H1: seeds `before` from descriptor.transcriptsAtSpawn (not a live snapshot)", async () => {
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

	it("review M3: a pane busy BEFORE init does not start the watchdog (waits, no resend)", async () => {
		const w = world({ pane: "Searching the codebase (esc to interrupt)" }); // busy
		const reg = new FakeRegistry();
		const drive: DriveState = {};
		w.setNow(999_999); // far past any window — must NOT fail/resend while uninit
		const out = driveSession(desc(), drive, w.ports, reg, new FakeDelivery());
		expect(out.kind).toBe("waiting");
		expect(drive.readyAtMs).toBeUndefined(); // clock never anchored pre-init
		expect(w.sentText).toHaveLength(0);
	});

	it("review M4: concurrent boots (two new transcripts) → ambiguous outcome", async () => {
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

	// s071 D3 — the never-bind wedge. Before this fix the `ambiguous` branch
	// RETURNED, so the watchdog block below it never ran and a permanently
	// ambiguous discovery sat `pending` forever with `failureReason: null`.
	it("s071: a persistently ambiguous discovery re-sends phonehome, then FAILS with bind-timeout", async () => {
		const w = world({ pane: READY, transcripts: [`${DIR}/a.jsonl`, `${DIR}/b.jsonl`] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { before: [], readyAtMs: 1000 };
		const d = desc({ initInjectedAt: "x" });
		reg.write(d);

		// Inside the window: still just reported, but the clock is now running.
		expect(driveSession(d, drive, w.ports, reg, del)).toEqual({ kind: "ambiguous", count: 2 });

		// Past the first window → the recovery nudge fires (it did NOT before).
		w.setNow(1000 + WATCHDOG_TIMEOUT_MS + 1);
		expect(driveSession(d, drive, w.ports, reg, del).kind).toBe("resent-phonehome");
		expect(w.sentText.some((s) => s.text.includes("phonehome"))).toBe(true);

		// Past the second window → terminal, loud, and machine-readable.
		w.setNow(1000 + WATCHDOG_TIMEOUT_MS * 3);
		const out = driveSession(d, drive, w.ports, reg, del);
		expect(out.kind).toBe("failed");
		const persisted = reg.read("pij-w");
		expect(persisted?.lifecycle).toBe("failed");
		expect(persisted?.failureReason).toBe("bind-timeout");
		if (out.kind === "failed") {
			expect(out.reason).toContain("ambiguous");
			expect(out.reason).toContain("2 candidate transcripts");
		}
		expect(del.outbox.some((m) => m.message.body.includes("failed to bind"))).toBe(true);
	});

	// CONTROL: byte-identical timing, ONE candidate transcript instead of two.
	// It binds, so the failure above is caused by the ambiguity — not by the
	// watchdog simply firing on any slow seat.
	it("s071 control — the same clock with ONE new transcript binds instead of failing", async () => {
		const w = world({ pane: READY, transcripts: [`${DIR}/a.jsonl`] });
		const reg = new FakeRegistry();
		const drive: DriveState = { before: [], readyAtMs: 1000 };
		const d = desc({ initInjectedAt: "x" });
		reg.write(d);

		w.setNow(1000 + WATCHDOG_TIMEOUT_MS * 3);
		const out = driveSession(d, drive, w.ports, reg, new FakeDelivery());

		expect(out).toEqual({ kind: "bound", harnessSessionId: "a" });
		expect(reg.read("pij-w")?.failureReason).toBeUndefined();
	});

	// CONTROL for the reason field: a plain (non-ambiguous) bind timeout must
	// ALSO carry bind-timeout, so no fail path leaves failureReason null.
	it("s071: a plain bind timeout also persists failureReason bind-timeout", async () => {
		const w = world({ pane: READY, transcripts: [] });
		const reg = new FakeRegistry();
		const drive: DriveState = { before: [], readyAtMs: 1000 };
		const d = desc({ initInjectedAt: "x" });
		reg.write(d);

		w.setNow(1000 + WATCHDOG_TIMEOUT_MS + 1);
		driveSession(d, drive, w.ports, reg, new FakeDelivery());
		w.setNow(1000 + WATCHDOG_TIMEOUT_MS * 3);
		const out = driveSession(d, drive, w.ports, reg, new FakeDelivery());

		expect(out.kind).toBe("failed");
		expect(reg.read("pij-w")?.failureReason).toBe("bind-timeout");
		if (out.kind === "failed") expect(out.reason).not.toContain("ambiguous");
	});

	it("dead pane → failed immediately, creator notified", async () => {
		const w = world({ pane: READY, dead: true });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const out = driveSession(desc(), {}, w.ports, reg, del);
		expect(out.kind).toBe("failed");
		expect(reg.read("pij-w")?.lifecycle).toBe("failed");
	});

	it.each([
		{ label: "structural parent", parentId: "pij-structural-parent" },
		{ label: "explicit root", parentId: null },
	])("dead bound descriptor preserves $label metadata when persisted as failed", async ({
		parentId,
	}) => {
		const w = world({ pane: "[exited]", dead: true });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const descriptor = desc({
			lifecycle: "bound",
			harnessSessionId: "claude-bound",
			parentId,
			gitCommonDir: "/repo/.git",
			spawnedBy: "pij-close-owner",
		});

		const out = driveSession(descriptor, {}, w.ports, reg, del);
		const failed = reg.read("pij-w");

		expect(out).toEqual({ kind: "failed", reason: "pane exited before binding" });
		expect(failed).toMatchObject({
			lifecycle: "failed",
			parentId,
			gitCommonDir: "/repo/.git",
			spawnedBy: "pij-close-owner",
			failureReason: "dead",
		});
		expect(
			del.outbox.some(
				(event) =>
					event.message.to === "pij-close-owner" &&
					event.message.body.includes("failed to bind: pane exited before binding"),
			),
		).toBe(true);
	});
});

describe("observeActivity (control-plane working|idle|done persistence)", () => {
	const NOW = 1_000_000;
	it("busy footer → working + a fresh lastEventAt", async () => {
		const u = observeActivity(desc({ lifecycle: "bound" }), "busy", NOW);
		expect(u?.state).toBe("working");
		expect(u?.lastEventAt).toBe(new Date(NOW).toISOString());
	});
	it("ready footer → idle, preserving the last-activity ts (so it reads 'done')", async () => {
		const prior = new Date(NOW - 5000).toISOString();
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "working", lastEventAt: prior }),
			"ready",
			NOW,
		);
		expect(u?.state).toBe("idle");
		expect(u?.lastEventAt).toBe(prior);
	});
	it("no change → null (no needless registry write)", async () => {
		const at = new Date(NOW).toISOString();
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "idle", lastEventAt: at }),
			"ready",
			NOW,
		);
		expect(u).toBeNull();
	});
	it("throttles the busy refresh — a recent lastEventAt is not rewritten every tick", async () => {
		const recent = new Date(NOW - 2000).toISOString(); // < ACTIVITY_REFRESH_MS
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "working", lastEventAt: recent }),
			"busy",
			NOW,
		);
		expect(u).toBeNull();
	});
	it("refreshes a stale busy ts past the throttle window (liveness stays active mid-turn)", async () => {
		const old = new Date(NOW - 30_000).toISOString(); // > ACTIVITY_REFRESH_MS
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "working", lastEventAt: old }),
			"busy",
			NOW,
		);
		expect(u?.lastEventAt).toBe(new Date(NOW).toISOString());
	});
	it("non-interactive readiness (booting/interstitial/dead) → null (driveSession owns it)", async () => {
		expect(observeActivity(desc({ lifecycle: "bound" }), "booting", NOW)).toBeNull();
		expect(observeActivity(desc({ lifecycle: "bound" }), "dead", NOW)).toBeNull();
	});
});

// ─── T009: first-inference gate (bad-model detector on deterministic-bind path)

describe("first-inference gate (T009)", () => {
	const BAD_MODEL_PANE =
		'API Error: 400 {"type":"error","error":{"type":"not_found_error","message":"model: gpt-99"}}\n' +
		"[exited]";

	// The deterministic-bind path: copilot with plannedHarnessSessionId
	it("copilot: bad-model pane after init-inject → fail with model-not-supported reason (not bound)", async () => {
		const w = world({ pane: COPILOT_READY });
		w.setPane(BAD_MODEL_PANE); // pane shows model error after init
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		// initInjectedAt set, first inference returned error
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "uuid-999",
			}),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out.kind).toBe("failed");
		// failureReason on the descriptor
		expect(reg.read("pij-w")?.failureReason).toBe("model-not-supported");
	});

	it("copilot: good model → still binds immediately (gate does not regress fast-bind)", async () => {
		const w = world({ pane: COPILOT_READY });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		const planned = "33333333-3333-4333-8333-333333333333";
		w.ports.processSnapshot = () => processSnapshot("copilot", planned);
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: planned,
			}),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out.kind).toBe("bound");
		expect(reg.read("pij-w")?.lifecycle).toBe("bound");
	});

	it("claude: dead pane with API Error → fail with model-not-supported reason", async () => {
		// Plain claude bad model → classifyReadiness "dead" → fail()
		// We just need the failureReason to be machine-stable
		const w = world({ pane: BAD_MODEL_PANE, dead: true });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const out = driveSession(desc({ harness: "claude" }), {}, w.ports, reg, del);
		expect(out.kind).toBe("failed");
		expect(reg.read("pij-w")?.failureReason).toBe("model-not-supported");
	});

	it("firstInferenceSeen is set when pane goes busy after init injection", async () => {
		const BUSY = "↓ 42 tokens  esc to interrupt";
		const w = world({ pane: BUSY });
		const drive: DriveState = { readyAtMs: 1000, before: [] };
		driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "uuid-any",
			}),
			drive,
			w.ports,
			new FakeRegistry(),
			new FakeDelivery(),
		);
		expect(drive.firstInferenceSeen).toBe(true);
	});

	// FIX-1 mutation-proof: gate blocks premature bind on good-model pane
	// Mutation: remove the `if (!drive.firstInferenceSeen) return { kind: "waiting" }` guard
	// → session binds on the first ready tick before the model error has time to surface → RED.
	it("good-model pane before first inference → waiting (gate blocks premature bind)", async () => {
		const w = world({ pane: COPILOT_READY });
		const reg = new FakeRegistry();
		// drive has readyAtMs set (init injected) but firstInferenceSeen NOT yet set
		const drive: DriveState = { readyAtMs: 1000 };
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "uuid-pre-gate",
			}),
			drive,
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(out.kind).toBe("waiting");
		// Must NOT have bound while gate is active
		expect(reg.read("pij-w")?.lifecycle).not.toBe("bound");
	});

	// FIX-3 mutation-proof: boundModel captured from pane footer at bind time
	// Mutation: remove extractBoundModel call → boundModel undefined → RED.
	it("captures boundModel from copilot pane footer at bind time", async () => {
		const PANE_WITH_MODEL = "/ commands · ? help · tab next tab  gpt-4o";
		const w = world({ pane: PANE_WITH_MODEL });
		const reg = new FakeRegistry();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		const planned = "44444444-4444-4444-8444-444444444444";
		w.ports.processSnapshot = () => processSnapshot("copilot", planned);
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: planned,
			}),
			drive,
			w.ports,
			reg,
			new FakeDelivery(),
		);
		expect(out.kind).toBe("bound");
		expect(reg.read("pij-w")?.boundModel).toBe("gpt-4o");
	});
});

describe("persistDaemonWrite — concurrent-writer preservation (Finding 1 / AC-16)", () => {
	it("preserves an externally-stamped reportedAt the daemon's computed value lacks", async () => {
		// On-disk descriptor already carries a reportedAt (stamped by `pij agent report`
		// after the daemon took its tick-start snapshot). The daemon-computed value —
		// derived from that stale snapshot — has none.
		const reg = new FakeRegistry([desc({ reportedAt: "2026-06-27T12:00:00.000Z" })]);
		const written = persistDaemonWrite(reg, desc({ state: "idle" }));
		expect(written.reportedAt).toBe("2026-06-27T12:00:00.000Z");
		expect(written.state).toBe("idle"); // daemon-owned field still applied
		expect(reg.read("pij-w")?.reportedAt).toBe("2026-06-27T12:00:00.000Z");
	});

	it("does NOT re-add a daemon-owned field the write deliberately dropped (failureReason clear)", async () => {
		const reg = new FakeRegistry([desc({ failureReason: "quota" })]);
		const { failureReason: _dropped, ...recovered } = desc({ failureReason: "quota" });
		const written = persistDaemonWrite(reg, recovered);
		expect(written.failureReason).toBeUndefined(); // recovery clear survives
		expect(reg.read("pij-w")?.failureReason).toBeUndefined();
	});

	it("writes through unchanged for a brand-new descriptor (no prior on disk)", async () => {
		const reg = new FakeRegistry();
		const written = persistDaemonWrite(reg, desc({ state: "working" }));
		expect(written).toEqual(desc({ state: "working" }));
		expect(reg.read("pij-w")?.state).toBe("working");
	});

	it("keeps the daemon-computed reportedAt when both sides have one (idempotent)", async () => {
		const reg = new FakeRegistry([desc({ reportedAt: "2026-06-27T12:00:00.000Z" })]);
		const written = persistDaemonWrite(reg, desc({ reportedAt: "2026-06-27T13:00:00.000Z" }));
		expect(written.reportedAt).toBe("2026-06-27T13:00:00.000Z");
	});

	// s070 #3 — a pij-REQUESTED close still announced itself as "unrequested-by-pij"
	// seconds later. `pij close` does everything right and in the right order:
	// persist closeIntent → kill pane → stamp `terminal: requested` → dissolve. But
	// none of those fields was preserved here, so a daemon tick holding a pre-close
	// snapshot wrote all of it back off disk. The next death sweep then saw a dead
	// PID with no intent and no terminal, and classified the operator's own close as
	// unrequested. A lost update, not a missing check.
	const CLOSED_ON_DISK = {
		closeIntent: {
			actor: "pij-boss",
			kind: "cli-close" as const,
			requestedAt: "2026-06-27T12:00:00.000Z",
		},
		terminal: {
			disposition: "requested" as const,
			observedAt: "2026-06-27T12:00:01.000Z",
			evidence: "pane-missing" as const,
		},
		deathNoticeLatchedAt: "2026-06-27T12:00:01.000Z",
		// NOT dissolved: this is the window that matters. `pij close` stamps intent
		// and terminal truth BEFORE it dissolves, and only once the descriptor is
		// dissolved does the registry start rejecting stale writes over it. Between
		// those two moments the close record is completely unprotected.
		lifecycle: "bound" as const,
	};

	it("preserves close intent and terminal truth against a stale pre-close daemon write", async () => {
		const reg = new FakeRegistry([desc({ ...CLOSED_ON_DISK })]);
		// The daemon's tick-start snapshot: taken BEFORE the close, so it still
		// believes the peer is a live bound session.
		const written = persistDaemonWrite(reg, desc({ lifecycle: "bound", state: "working" }));
		expect(written.closeIntent).toEqual(CLOSED_ON_DISK.closeIntent);
		expect(written.terminal).toEqual(CLOSED_ON_DISK.terminal);
		expect(written.deathNoticeLatchedAt).toBe(CLOSED_ON_DISK.deathNoticeLatchedAt);
		expect(reg.read("pij-w")?.terminal?.disposition).toBe("requested");
	});

	it("still lets the daemon compute lifecycle — it is deliberately NOT preserved", async () => {
		// Guards against "just add lifecycle to the list too". `lifecycle` is
		// daemon-owned (the spawn→bind machine computes pending→ready→bound), so a
		// disk-wins rule there would pin a binding session at its stale value.
		// Dissolution needs no rule here: the registry itself already refuses a
		// stale non-dissolved write over a dissolved tombstone.
		const reg = new FakeRegistry([desc({ lifecycle: "pending" })]);
		const written = persistDaemonWrite(reg, desc({ lifecycle: "bound" }));
		expect(written.lifecycle).toBe("bound");
	});

	it("stops a requested close from being announced as unrequested-by-pij", async () => {
		// The operator-visible symptom, end to end: close → overlapping tick → sweep.
		const reg = new FakeRegistry([desc({ ...CLOSED_ON_DISK })]);
		persistDaemonWrite(reg, desc({ lifecycle: "bound", state: "working" }));
		const sweep = reconcileDeaths({
			descriptors: reg.list(),
			expectations: [],
			nowIso: "2026-06-27T12:00:02.000Z",
			isAlive: () => false, // pane was killed by the close
		});
		expect(sweep.notices).toEqual([]);
	});

	it("CONTROL: an absence with no close intent IS still announced as unrequested-by-pij", async () => {
		// Proves the assertion above is real suppression, not a sweep that was never
		// going to fire. Same shape, minus the close.
		const reg = new FakeRegistry([desc({ lifecycle: "bound", state: "working" })]);
		persistDaemonWrite(reg, desc({ lifecycle: "bound", state: "working" }));
		const sweep = reconcileDeaths({
			descriptors: reg.list(),
			expectations: [],
			nowIso: "2026-06-27T12:00:02.000Z",
			isAlive: () => false,
		});
		expect(sweep.notices).toHaveLength(1);
		expect(sweep.notices[0]?.text).toContain("unrequested-by-pij");
	});

	it("lets the latest persisted prime=false beat a stale daemon prime=true snapshot", async () => {
		const reg = new FakeRegistry([desc({ prime: false })]);
		const written = persistDaemonWrite(reg, desc({ prime: true, state: "working" }));
		expect(written.prime).toBe(false);
		expect(written.state).toBe("working");
	});

	it.each([
		false,
		undefined,
	])("lets the latest persisted prime=true beat a stale daemon prime=%s snapshot", async (stalePrime) => {
		const reg = new FakeRegistry([desc({ prime: true })]);
		const written = persistDaemonWrite(reg, desc({ prime: stalePrime, state: "idle" }));
		expect(written.prime).toBe(true);
		expect(written.state).toBe("idle");
	});

	it("lets the latest persisted oldPrime=false beat a stale daemon oldPrime=true snapshot", async () => {
		const reg = new FakeRegistry([desc({ oldPrime: false })]);
		const written = persistDaemonWrite(reg, desc({ oldPrime: true, state: "working" }));
		expect(written.oldPrime).toBe(false);
		expect(written.state).toBe("working");
	});

	it.each([
		false,
		undefined,
	])("lets the latest persisted oldPrime=true beat a stale daemon oldPrime=%s snapshot", async (staleOldPrime) => {
		const reg = new FakeRegistry([desc({ oldPrime: true })]);
		const written = persistDaemonWrite(reg, desc({ oldPrime: staleOldPrime, state: "idle" }));
		expect(written.oldPrime).toBe(true);
		expect(written.state).toBe("idle");
	});

	it("lets the latest persisted parentId=null beat a stale daemon parent id", async () => {
		const reg = new FakeRegistry([desc({ parentId: null })]);
		const written = persistDaemonWrite(
			reg,
			desc({ parentId: "pij-stale-parent", state: "working" }),
		);
		expect(written.parentId).toBeNull();
		expect(written.state).toBe("working");
	});

	it("lets the latest persisted repository identity beat a stale daemon value", async () => {
		const reg = new FakeRegistry([desc({ gitCommonDir: "/new/.git" })]);
		const written = persistDaemonWrite(reg, desc({ gitCommonDir: "/stale/.git", state: "idle" }));
		expect(written.gitCommonDir).toBe("/new/.git");
		expect(written.state).toBe("idle");
	});
});

describe("persistDaemonWrite — node-truth ownership (plan 054 P2 T002, Finding 04)", () => {
	it("CLI-stamped currentAssignment/currentTask/semanticState survive a daemon tick write", async () => {
		// The CLI coupled-write denormed these onto the descriptor AFTER the
		// daemon took its tick-start snapshot; the daemon's computed descriptor
		// (derived from that stale snapshot) has none of them. A daemon persist
		// must not clobber them (Finding 04).
		const reg = new FakeRegistry([
			desc({
				currentAssignment: "asg-general-pij-w",
				currentTask: "review the packet",
				semanticState: "waiting",
			}),
		]);
		const written = persistDaemonWrite(reg, desc({ state: "working" }));
		expect(written.currentAssignment).toBe("asg-general-pij-w");
		expect(written.currentTask).toBe("review the packet");
		expect(written.semanticState).toBe("waiting");
		expect(written.state).toBe("working"); // daemon-owned field still applied
	});

	it("latest persisted semanticState beats a stale daemon snapshot value", async () => {
		// Mutable-external semantics: when BOTH sides carry the field, latest
		// disk wins — the daemon's copy is by construction a stale snapshot.
		const reg = new FakeRegistry([desc({ semanticState: "done" })]);
		const written = persistDaemonWrite(reg, desc({ semanticState: "waiting", state: "idle" }));
		expect(written.semanticState).toBe("done");
	});

	it("systemState is daemon-owned: the computed verdict beats any on-disk value", async () => {
		// systemState stays OUT of MUTABLE_EXTERNALLY_OWNED_FIELDS (WS-5:
		// mechanical truth has no meaningful external writer) — a value that
		// somehow landed on disk never overrides the daemon's fresh verdict.
		const reg = new FakeRegistry([desc({ systemState: "idle" })]);
		const written = persistDaemonWrite(reg, desc({ systemState: "working" }));
		expect(written.systemState).toBe("working");
	});

	it("a daemon write lacking systemState does not resurrect a stale on-disk one", async () => {
		// Deliberate-drop parity with the failureReason case: absence in the
		// computed descriptor is authoritative for a daemon-owned field.
		const reg = new FakeRegistry([desc({ systemState: "stalled" })]);
		const { systemState: _dropped, ...computed } = desc({ systemState: "stalled" });
		const written = persistDaemonWrite(reg, computed);
		expect(written.systemState).toBeUndefined();
	});
});

describe("drainTmuxInbox — post-outcome contract", () => {
	it.each([
		"confirmed",
		"unverified",
	] as const)("returns the %s injection outcome only after sendText completes", async (outcome) => {
		const w = world({ pane: READY });
		let sendCompleted = false;
		w.ports.sendText = () => {
			sendCompleted = true;
			return outcome;
		};

		const consumed = await drainTmuxInbox(
			desc({ lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "review" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);

		expect(sendCompleted).toBe(true);
		expect(consumed).toEqual([{ messageId: "m1", from: "pij-boss", outcome }]);
	});

	it("does not consume a pi-owned message", async () => {
		const consumed = await drainTmuxInbox(
			desc({ harness: "pi", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "leave for pi" }],
			world({ pane: READY }).ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);

		expect(consumed).toEqual([]);
	});
});

describe("backfillWindowId — legacy live nodes gain addressability once (plan 054 P2 T006)", () => {
	it("resolves and persists the window id for a pane-bearing node without one", async () => {
		const reg = new FakeRegistry([desc({ paneId: "%7" })]);
		const written = backfillWindowId(desc({ paneId: "%7" }), reg, (paneId) =>
			paneId === "%7" ? "@2" : null,
		);
		expect(written?.windowId).toBe("@2");
		expect(reg.read("pij-w")?.windowId).toBe("@2");
	});

	it("is a no-op when the node already has a windowId (once-only latch)", async () => {
		const reg = new FakeRegistry([desc({ paneId: "%7", windowId: "@2" })]);
		let calls = 0;
		const out = backfillWindowId(desc({ paneId: "%7", windowId: "@2" }), reg, () => {
			calls += 1;
			return "@9";
		});
		expect(out).toBeNull();
		expect(calls).toBe(0);
		expect(reg.read("pij-w")?.windowId).toBe("@2");
	});

	it("is a no-op without a pane, on resolver failure, and on a malformed id", async () => {
		const reg = new FakeRegistry([desc({})]);
		const { paneId: _p, ...noPane } = desc({});
		expect(backfillWindowId(noPane, reg, () => "@1")).toBeNull();
		expect(backfillWindowId(desc({ paneId: "%7" }), reg, () => null)).toBeNull();
		expect(backfillWindowId(desc({ paneId: "%7" }), reg, () => "window-3")).toBeNull();
		expect(reg.read("pij-w")?.windowId).toBeUndefined();
	});

	it("a CLI-stamped windowId on disk survives a daemon write lacking it (merge law)", async () => {
		const reg = new FakeRegistry([desc({ windowId: "@5" })]);
		const written = persistDaemonWrite(reg, desc({ state: "working" }));
		expect(written.windowId).toBe("@5");
	});
});

describe("drainTmuxInbox — socket-first for claude seats (poc/comms-sqlite-socket)", () => {
	it("delivers over the socket, never types, and consumes with via=socket", async () => {
		const w = world({ pane: READY });
		let typed = 0;
		const socketed: string[] = [];
		w.ports.sendText = () => {
			typed += 1;
			return "confirmed";
		};
		w.ports.sendSocket = (_target, message) => {
			socketed.push(message.body);
			return "confirmed";
		};
		const body = `HEAD sha 0001\n${"k".repeat(3000)}\nTAIL`;
		const consumed = await drainTmuxInbox(
			desc({ harness: "claude", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);
		expect(typed).toBe(0);
		expect(socketed).toEqual([body]);
		expect(consumed).toEqual([
			{ messageId: "m1", from: "pij-boss", outcome: "confirmed", via: "socket" },
		]);
	});

	it("falls back to the pane when the seat has no socket", async () => {
		const w = world({ pane: READY });
		let typed = 0;
		w.ports.sendText = () => {
			typed += 1;
			return "confirmed";
		};
		w.ports.sendSocket = () => "no-socket";
		const consumed = await drainTmuxInbox(
			desc({ harness: "claude", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "short" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);
		expect(typed).toBe(1);
		expect(consumed).toEqual([{ messageId: "m1", from: "pij-boss", outcome: "confirmed" }]);
	});

	it("leaves the message unread (buffered, not consumed) when the socket send fails", async () => {
		const w = world({ pane: READY });
		w.ports.sendText = () => {
			throw new Error("must not type after a failed socket send");
		};
		w.ports.sendSocket = () => "failed";
		const buffer = new SendBuffer();
		const consumed = await drainTmuxInbox(
			desc({ harness: "claude", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "retry me" }],
			w.ports,
			buffer,
			undefined,
			new ComposerHoldTracker(),
		);
		expect(consumed).toEqual([]);
	});

	it("still TYPES a remote command (/compact) even on a socket-capable claude seat", async () => {
		const w = world({ pane: READY });
		let typedText = "";
		w.ports.sendText = (_pane, text) => {
			typedText = text;
			return "confirmed";
		};
		w.ports.sendSocket = () => {
			throw new Error("commands must not go over the socket");
		};
		await drainTmuxInbox(
			desc({ harness: "claude", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "", command: "compact" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);
		expect(typedText).toBe("/compact");
	});

	it("types into a LEGACY copilot seat (no rpcPort)", async () => {
		const w = world({ pane: READY });
		let typed = 0;
		w.ports.sendText = () => {
			typed += 1;
			return "confirmed";
		};
		w.ports.sendSocket = () => {
			throw new Error("a legacy copilot seat has no endpoint");
		};
		await drainTmuxInbox(
			desc({ harness: "copilot", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "hi" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);
		expect(typed).toBe(1);
	});
});

describe("drainTmuxInbox — copilot --ui-server seats use the RPC port", () => {
	it("delivers via sendSocket when the descriptor carries rpcPort", async () => {
		const w = world({ pane: READY });
		let typed = 0;
		const seen: number[] = [];
		w.ports.sendText = () => {
			typed += 1;
			return "confirmed";
		};
		w.ports.sendSocket = (target) => {
			seen.push(target.rpcPort ?? -1);
			return "confirmed";
		};
		const consumed = await drainTmuxInbox(
			desc({ harness: "copilot", lifecycle: "bound", rpcPort: 47391 }),
			[{ messageId: "m1", from: "pij-boss", body: "over rpc" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);
		expect(typed).toBe(0);
		expect(seen).toEqual([47391]);
		expect(consumed[0]?.via).toBe("socket");
	});
});

describe("drainTmuxInbox — pointer path for seats with no endpoint (poc/comms-sqlite-socket)", () => {
	it("pointerLine is one short ASCII line with no newline", async () => {
		for (const n of [1, 3]) {
			const line = pointerLine("pij-vocal-kingfisher", n);
			expect(line).not.toContain("\n");
			expect(Buffer.byteLength(line)).toBeLessThan(200);
			expect(line.startsWith("[pij from pij-vocal-kingfisher] ")).toBe(true);
			expect(line).toContain("pij inbox");
		}
	});

	it("types the pointer, never the body, and reports via=pointer", async () => {
		const w = world({ pane: READY });
		const typed: Array<{
			text: string;
			opts?: { readonly kind?: "pointer" | "body" };
		}> = [];
		w.ports.sendText = (_pane, text, _harness, _pid, sendOpts) => {
			typed.push({ text, ...(sendOpts === undefined ? {} : { opts: sendOpts }) });
			return "confirmed";
		};
		w.ports.sendSocket = () => "no-socket";
		const body = `SECRET-HEAD\n${"k".repeat(3000)}\nSECRET-TAIL`;
		const consumed = await drainTmuxInbox(
			desc({ harness: "copilot", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
			{ pointer: true },
		);
		expect(typed).toEqual([{ text: pointerLine("pij-boss", 1), opts: { kind: "pointer" } }]);
		expect(consumed).toEqual([
			{ messageId: "m1", from: "pij-boss", outcome: "confirmed", via: "pointer" },
		]);
	});

	it("still types a raw /compact command even in pointer mode", async () => {
		const w = world({ pane: READY });
		let typedText = "";
		let typedOpts: { readonly kind?: "pointer" | "body" } | undefined;
		w.ports.sendText = (_pane, text, _harness, _pid, sendOpts) => {
			typedText = text;
			typedOpts = sendOpts;
			return "confirmed";
		};
		await drainTmuxInbox(
			desc({ harness: "codex", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "", command: "compact" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
			{ pointer: true },
		);
		expect(typedText).toBe("/compact");
		expect(typedOpts).toBeUndefined();
	});

	it("respects the composer-idle guard: NEVER types a pointer over live human input (Amendment 4 proof)", async () => {
		// The pointer path is the only path that still types into a pane; it must
		// keep the pre-existing composer-idle / non-empty-composer guard
		// (refreshRenderedComposerHold, loop.ts) BEFORE send-keys.
		const w = world({ pane: HUMAN_COMPOSER });
		const buffer = new SendBuffer();
		const consumed = await drainTmuxInbox(
			desc({ harness: "copilot", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "please read this" }],
			w.ports,
			buffer,
			undefined,
			new ComposerHoldTracker(),
			{ pointer: true },
		);
		// nothing typed, message left durable-unread (buffered) for a later tick
		expect(w.sentText).toEqual([]);
		expect(consumed).toEqual([]);
		expect(buffer.pending("pij-w")).toBe(1); // durably buffered for retry, not lost
	});

	it("leaves the row for retry when the pointer cannot be typed (held/failed)", async () => {
		const w = world({ pane: READY });
		w.ports.sendText = () => "failed";
		const consumed = await drainTmuxInbox(
			desc({ harness: "codex", lifecycle: "bound" }),
			[{ messageId: "m1", from: "pij-boss", body: "x" }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
			{ pointer: true },
		);
		expect(consumed).toEqual([]);
	});
});

describe("routing invariant — body on socket/RPC, pointer only where a pty can clip (plan 392 Phase 4)", () => {
	it("claude with an inbox socket receives the byte-exact body with zero pane keystrokes", async () => {
		const w = world({ pane: READY });
		const socketBodies: string[] = [];
		w.ports.sendSocket = (_target, message) => {
			socketBodies.push(message.body);
			return "confirmed";
		};
		const body = `HEAD\n${"k".repeat(3_000)}\nTAIL`;

		const consumed = await drainTmuxInbox(
			desc({ harness: "claude", lifecycle: "bound" }),
			[{ messageId: "m-claude", from: "pij-boss", body }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);

		expect(socketBodies).toEqual([body]);
		expect(w.sentText).toEqual([]);
		expect(consumed).toEqual([
			{ messageId: "m-claude", from: "pij-boss", outcome: "confirmed", via: "socket" },
		]);
	});

	it("copilot with rpcPort receives the byte-exact body with zero pane keystrokes", async () => {
		const w = world({ pane: COPILOT_READY });
		const socketBodies: string[] = [];
		w.ports.sendSocket = (target, message) => {
			expect(target.rpcPort).toBe(47_391);
			socketBodies.push(message.body);
			return "confirmed";
		};
		const body = "copilot rpc body";

		const consumed = await drainTmuxInbox(
			desc({ harness: "copilot", lifecycle: "bound", rpcPort: 47_391 }),
			[{ messageId: "m-copilot", from: "pij-boss", body }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
		);

		expect(socketBodies).toEqual([body]);
		expect(w.sentText).toEqual([]);
		expect(consumed).toEqual([
			{ messageId: "m-copilot", from: "pij-boss", outcome: "confirmed", via: "socket" },
		]);
	});

	it("codex without an endpoint receives one pointer line and never the body", async () => {
		const w = world({ pane: READY });
		w.ports.sendSocket = () => {
			throw new Error("codex has no socket endpoint in this phase");
		};
		const body = "codex body must stay out of the pty";

		const consumed = await drainTmuxInbox(
			desc({ harness: "codex", lifecycle: "bound" }),
			[{ messageId: "m-codex", from: "pij-boss", body }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
			{ pointer: true },
		);

		expect(w.sentText).toEqual([
			{ pane: "%1", text: pointerLine("pij-boss", 1), opts: { kind: "pointer" } },
		]);
		expect(w.sentText[0]?.text).not.toContain(body);
		expect(consumed).toEqual([
			{ messageId: "m-codex", from: "pij-boss", outcome: "confirmed", via: "pointer" },
		]);
	});

	it("socketless claude consults the composer-idle guard before typing its pointer", async () => {
		const w = world({ pane: READY });
		w.ports.sendSocket = () => "no-socket";
		const capturePane = w.ports.capturePane;
		let composerGuardReads = 0;
		w.ports.capturePane = (paneId) => {
			composerGuardReads += 1;
			return capturePane(paneId);
		};
		const body = "socketless body must stay durable";

		const consumed = await drainTmuxInbox(
			desc({ harness: "claude", lifecycle: "bound" }),
			[{ messageId: "m-socketless", from: "pij-boss", body }],
			w.ports,
			new SendBuffer(),
			undefined,
			new ComposerHoldTracker(),
			{ pointer: true },
		);

		expect(composerGuardReads).toBeGreaterThan(0);
		expect(w.sentText).toEqual([
			{ pane: "%1", text: pointerLine("pij-boss", 1), opts: { kind: "pointer" } },
		]);
		expect(w.sentText[0]?.text).not.toContain(body);
		expect(consumed).toEqual([
			{ messageId: "m-socketless", from: "pij-boss", outcome: "confirmed", via: "pointer" },
		]);
	});
});
