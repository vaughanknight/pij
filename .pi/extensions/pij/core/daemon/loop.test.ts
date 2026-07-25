import { describe, expect, it } from "vitest";

import { FakeDelivery, FakeRegistry } from "../../adapters/fakes.js";
import { transcriptDir } from "../harness/claude.js";
import type { SessionDescriptor } from "../types.js";
import { reconcileDeaths } from "./death-reconciler.js";
import {
	backfillWindowId,
	type DaemonPorts,
	type DriveState,
	drainTmuxInbox,
	driveSession,
	observeActivity,
	WATCHDOG_TIMEOUT_MS,
	writeMerged,
} from "./loop.js";
import { ComposerHoldTracker } from "./pane-signals.js";
import { SendBuffer } from "./router.js";

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
		sendText: (p, t) => {
			sentText.push({ pane: p, text: t });
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

	it("copilot trust interstitial → answered ONCE (1 + Enter); a persisting modal degrades to needs-human, notify exactly once (DL-001)", () => {
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

	it("ready + not-yet-injected → injects init once and marks initInjectedAt", () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry([desc()]);
		const out = driveSession(desc(), {}, w.ports, reg, new FakeDelivery());
		expect(out).toEqual({ kind: "injected-init" });
		expect(w.sentText[0]?.text).toContain("pij phonehome");
		expect(reg.read("pij-w")?.initInjectedAt).toBeTruthy();
	});

	it("branched descriptor → init injects the fork reframe (T016, Finding 08)", () => {
		const w = world({ pane: READY });
		const reg = new FakeRegistry();
		driveSession(desc({ branchedFrom: "claude-src" }), {}, w.ports, reg, new FakeDelivery());
		expect(w.sentText[0]?.text).toMatch(/FORK/);
		expect(w.sentText[0]?.text).toMatch(/do not (continue|spawn)/i);
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
		// to the planned id after the first-inference round-trip — no transcript needed.
		const w = world({ pane: COPILOT_READY, transcripts: [] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
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

	it("claude --branch: ready + plannedHarnessSessionId → binds deterministically, no discovery (AC-03)", () => {
		// A branched claude pinned its forked id (`--session-id`), so it binds on the
		// planned id like copilot — even with NO new transcript (empty discovery set).
		// Binding is gated on firstInferenceSeen (FIX-1) — one tick after the busy turn.
		const w = world({ pane: READY, transcripts: [] });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
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

	// ─── codex discovery bind (Plan 022, AC-02, Finding 06) ─────────────────────
	const CODEX_ROOT = `${HOME}/.codex/sessions`;
	const CODEX_OLD = `${CODEX_ROOT}/2026/06/27/rollout-2026-06-27T09-00-00-aaaaaaaa-0001-7000-8000-000000000001.jsonl`;
	const CODEX_NEW = `${CODEX_ROOT}/2026/06/28/rollout-2026-06-28T15-33-30-019f0cb7-f65c-76f1-bb38-c96269590118.jsonl`;
	const CODEX_UUID = "019f0cb7-f65c-76f1-bb38-c96269590118";

	it("codex: ready + a NEW rollout appears → bound to the rollout's TRAILING UUID + transcriptPath persisted (AC-02, Finding 06)", () => {
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

	it("codex: a NEW rollout from ANOTHER cwd is ignored via session_meta cwd-confirm (R-2)", () => {
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

	it("claude bind sets NO transcriptPath (byte-unchanged — only codex persists the path)", () => {
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

	it.each([
		{ label: "structural parent", parentId: "pij-structural-parent" },
		{ label: "explicit root", parentId: null },
	])("dead bound descriptor preserves $label metadata when persisted as failed", ({ parentId }) => {
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
	it("busy footer → working + a fresh lastEventAt", () => {
		const u = observeActivity(desc({ lifecycle: "bound" }), "busy", NOW);
		expect(u?.state).toBe("working");
		expect(u?.lastEventAt).toBe(new Date(NOW).toISOString());
	});
	it("ready footer → idle, preserving the last-activity ts (so it reads 'done')", () => {
		const prior = new Date(NOW - 5000).toISOString();
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "working", lastEventAt: prior }),
			"ready",
			NOW,
		);
		expect(u?.state).toBe("idle");
		expect(u?.lastEventAt).toBe(prior);
	});
	it("no change → null (no needless registry write)", () => {
		const at = new Date(NOW).toISOString();
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "idle", lastEventAt: at }),
			"ready",
			NOW,
		);
		expect(u).toBeNull();
	});
	it("throttles the busy refresh — a recent lastEventAt is not rewritten every tick", () => {
		const recent = new Date(NOW - 2000).toISOString(); // < ACTIVITY_REFRESH_MS
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "working", lastEventAt: recent }),
			"busy",
			NOW,
		);
		expect(u).toBeNull();
	});
	it("refreshes a stale busy ts past the throttle window (liveness stays active mid-turn)", () => {
		const old = new Date(NOW - 30_000).toISOString(); // > ACTIVITY_REFRESH_MS
		const u = observeActivity(
			desc({ lifecycle: "bound", state: "working", lastEventAt: old }),
			"busy",
			NOW,
		);
		expect(u?.lastEventAt).toBe(new Date(NOW).toISOString());
	});
	it("non-interactive readiness (booting/interstitial/dead) → null (driveSession owns it)", () => {
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
	it("copilot: bad-model pane after init-inject → fail with model-not-supported reason (not bound)", () => {
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

	it("copilot: good model → still binds immediately (gate does not regress fast-bind)", () => {
		const w = world({ pane: COPILOT_READY });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "uuid-good",
			}),
			drive,
			w.ports,
			reg,
			del,
		);
		expect(out.kind).toBe("bound");
		expect(reg.read("pij-w")?.lifecycle).toBe("bound");
	});

	it("claude: dead pane with API Error → fail with model-not-supported reason", () => {
		// Plain claude bad model → classifyReadiness "dead" → fail()
		// We just need the failureReason to be machine-stable
		const w = world({ pane: BAD_MODEL_PANE, dead: true });
		const reg = new FakeRegistry();
		const del = new FakeDelivery();
		const out = driveSession(desc({ harness: "claude" }), {}, w.ports, reg, del);
		expect(out.kind).toBe("failed");
		expect(reg.read("pij-w")?.failureReason).toBe("model-not-supported");
	});

	it("firstInferenceSeen is set when pane goes busy after init injection", () => {
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
	it("good-model pane before first inference → waiting (gate blocks premature bind)", () => {
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
	it("captures boundModel from copilot pane footer at bind time", () => {
		const PANE_WITH_MODEL = "/ commands · ? help · tab next tab  gpt-4o";
		const w = world({ pane: PANE_WITH_MODEL });
		const reg = new FakeRegistry();
		const drive: DriveState = { readyAtMs: 1000, firstInferenceSeen: true };
		const out = driveSession(
			desc({
				harness: "copilot",
				initInjectedAt: "2026-06-27T00:00:05.000Z",
				plannedHarnessSessionId: "uuid-model-capture",
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

describe("writeMerged — concurrent-writer preservation (Finding 1 / AC-16)", () => {
	it("preserves an externally-stamped reportedAt the daemon's computed value lacks", () => {
		// On-disk descriptor already carries a reportedAt (stamped by `pij agent report`
		// after the daemon took its tick-start snapshot). The daemon-computed value —
		// derived from that stale snapshot — has none.
		const reg = new FakeRegistry([desc({ reportedAt: "2026-06-27T12:00:00.000Z" })]);
		const written = writeMerged(reg, desc({ state: "idle" }));
		expect(written.reportedAt).toBe("2026-06-27T12:00:00.000Z");
		expect(written.state).toBe("idle"); // daemon-owned field still applied
		expect(reg.read("pij-w")?.reportedAt).toBe("2026-06-27T12:00:00.000Z");
	});

	it("does NOT re-add a daemon-owned field the write deliberately dropped (failureReason clear)", () => {
		const reg = new FakeRegistry([desc({ failureReason: "quota" })]);
		const { failureReason: _dropped, ...recovered } = desc({ failureReason: "quota" });
		const written = writeMerged(reg, recovered);
		expect(written.failureReason).toBeUndefined(); // recovery clear survives
		expect(reg.read("pij-w")?.failureReason).toBeUndefined();
	});

	it("writes through unchanged for a brand-new descriptor (no prior on disk)", () => {
		const reg = new FakeRegistry();
		const written = writeMerged(reg, desc({ state: "working" }));
		expect(written).toEqual(desc({ state: "working" }));
		expect(reg.read("pij-w")?.state).toBe("working");
	});

	it("keeps the daemon-computed reportedAt when both sides have one (idempotent)", () => {
		const reg = new FakeRegistry([desc({ reportedAt: "2026-06-27T12:00:00.000Z" })]);
		const written = writeMerged(reg, desc({ reportedAt: "2026-06-27T13:00:00.000Z" }));
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

	it("preserves close intent and terminal truth against a stale pre-close daemon write", () => {
		const reg = new FakeRegistry([desc({ ...CLOSED_ON_DISK })]);
		// The daemon's tick-start snapshot: taken BEFORE the close, so it still
		// believes the peer is a live bound session.
		const written = writeMerged(reg, desc({ lifecycle: "bound", state: "working" }));
		expect(written.closeIntent).toEqual(CLOSED_ON_DISK.closeIntent);
		expect(written.terminal).toEqual(CLOSED_ON_DISK.terminal);
		expect(written.deathNoticeLatchedAt).toBe(CLOSED_ON_DISK.deathNoticeLatchedAt);
		expect(reg.read("pij-w")?.terminal?.disposition).toBe("requested");
	});

	it("still lets the daemon compute lifecycle — it is deliberately NOT preserved", () => {
		// Guards against "just add lifecycle to the list too". `lifecycle` is
		// daemon-owned (the spawn→bind machine computes pending→ready→bound), so a
		// disk-wins rule there would pin a binding session at its stale value.
		// Dissolution needs no rule here: the registry itself already refuses a
		// stale non-dissolved write over a dissolved tombstone.
		const reg = new FakeRegistry([desc({ lifecycle: "pending" })]);
		const written = writeMerged(reg, desc({ lifecycle: "bound" }));
		expect(written.lifecycle).toBe("bound");
	});

	it("stops a requested close from being announced as unrequested-by-pij", () => {
		// The operator-visible symptom, end to end: close → overlapping tick → sweep.
		const reg = new FakeRegistry([desc({ ...CLOSED_ON_DISK })]);
		writeMerged(reg, desc({ lifecycle: "bound", state: "working" }));
		const sweep = reconcileDeaths({
			descriptors: reg.list(),
			expectations: [],
			nowIso: "2026-06-27T12:00:02.000Z",
			isAlive: () => false, // pane was killed by the close
		});
		expect(sweep.notices).toEqual([]);
	});

	it("CONTROL: an absence with no close intent IS still announced as unrequested-by-pij", () => {
		// Proves the assertion above is real suppression, not a sweep that was never
		// going to fire. Same shape, minus the close.
		const reg = new FakeRegistry([desc({ lifecycle: "bound", state: "working" })]);
		writeMerged(reg, desc({ lifecycle: "bound", state: "working" }));
		const sweep = reconcileDeaths({
			descriptors: reg.list(),
			expectations: [],
			nowIso: "2026-06-27T12:00:02.000Z",
			isAlive: () => false,
		});
		expect(sweep.notices).toHaveLength(1);
		expect(sweep.notices[0]?.text).toContain("unrequested-by-pij");
	});

	it("lets the latest persisted prime=false beat a stale daemon prime=true snapshot", () => {
		const reg = new FakeRegistry([desc({ prime: false })]);
		const written = writeMerged(reg, desc({ prime: true, state: "working" }));
		expect(written.prime).toBe(false);
		expect(written.state).toBe("working");
	});

	it.each([
		false,
		undefined,
	])("lets the latest persisted prime=true beat a stale daemon prime=%s snapshot", (stalePrime) => {
		const reg = new FakeRegistry([desc({ prime: true })]);
		const written = writeMerged(reg, desc({ prime: stalePrime, state: "idle" }));
		expect(written.prime).toBe(true);
		expect(written.state).toBe("idle");
	});

	it("lets the latest persisted oldPrime=false beat a stale daemon oldPrime=true snapshot", () => {
		const reg = new FakeRegistry([desc({ oldPrime: false })]);
		const written = writeMerged(reg, desc({ oldPrime: true, state: "working" }));
		expect(written.oldPrime).toBe(false);
		expect(written.state).toBe("working");
	});

	it.each([
		false,
		undefined,
	])("lets the latest persisted oldPrime=true beat a stale daemon oldPrime=%s snapshot", (staleOldPrime) => {
		const reg = new FakeRegistry([desc({ oldPrime: true })]);
		const written = writeMerged(reg, desc({ oldPrime: staleOldPrime, state: "idle" }));
		expect(written.oldPrime).toBe(true);
		expect(written.state).toBe("idle");
	});

	it("lets the latest persisted parentId=null beat a stale daemon parent id", () => {
		const reg = new FakeRegistry([desc({ parentId: null })]);
		const written = writeMerged(reg, desc({ parentId: "pij-stale-parent", state: "working" }));
		expect(written.parentId).toBeNull();
		expect(written.state).toBe("working");
	});

	it("lets the latest persisted repository identity beat a stale daemon value", () => {
		const reg = new FakeRegistry([desc({ gitCommonDir: "/new/.git" })]);
		const written = writeMerged(reg, desc({ gitCommonDir: "/stale/.git", state: "idle" }));
		expect(written.gitCommonDir).toBe("/new/.git");
		expect(written.state).toBe("idle");
	});
});

describe("writeMerged — node-truth ownership (plan 054 P2 T002, Finding 04)", () => {
	it("CLI-stamped currentAssignment/currentTask/semanticState survive a daemon tick write", () => {
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
		const written = writeMerged(reg, desc({ state: "working" }));
		expect(written.currentAssignment).toBe("asg-general-pij-w");
		expect(written.currentTask).toBe("review the packet");
		expect(written.semanticState).toBe("waiting");
		expect(written.state).toBe("working"); // daemon-owned field still applied
	});

	it("latest persisted semanticState beats a stale daemon snapshot value", () => {
		// Mutable-external semantics: when BOTH sides carry the field, latest
		// disk wins — the daemon's copy is by construction a stale snapshot.
		const reg = new FakeRegistry([desc({ semanticState: "done" })]);
		const written = writeMerged(reg, desc({ semanticState: "waiting", state: "idle" }));
		expect(written.semanticState).toBe("done");
	});

	it("systemState is daemon-owned: the computed verdict beats any on-disk value", () => {
		// systemState stays OUT of MUTABLE_EXTERNALLY_OWNED_FIELDS (WS-5:
		// mechanical truth has no meaningful external writer) — a value that
		// somehow landed on disk never overrides the daemon's fresh verdict.
		const reg = new FakeRegistry([desc({ systemState: "idle" })]);
		const written = writeMerged(reg, desc({ systemState: "working" }));
		expect(written.systemState).toBe("working");
	});

	it("a daemon write lacking systemState does not resurrect a stale on-disk one", () => {
		// Deliberate-drop parity with the failureReason case: absence in the
		// computed descriptor is authoritative for a daemon-owned field.
		const reg = new FakeRegistry([desc({ systemState: "stalled" })]);
		const { systemState: _dropped, ...computed } = desc({ systemState: "stalled" });
		const written = writeMerged(reg, computed);
		expect(written.systemState).toBeUndefined();
	});
});

describe("drainTmuxInbox — post-outcome contract", () => {
	it.each([
		"confirmed",
		"unverified",
	] as const)("returns the %s injection outcome only after sendText completes", (outcome) => {
		const w = world({ pane: READY });
		let sendCompleted = false;
		w.ports.sendText = () => {
			sendCompleted = true;
			return outcome;
		};

		const consumed = drainTmuxInbox(
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

	it("does not consume a pi-owned message", () => {
		const consumed = drainTmuxInbox(
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
	it("resolves and persists the window id for a pane-bearing node without one", () => {
		const reg = new FakeRegistry([desc({ paneId: "%7" })]);
		const written = backfillWindowId(desc({ paneId: "%7" }), reg, (paneId) =>
			paneId === "%7" ? "@2" : null,
		);
		expect(written?.windowId).toBe("@2");
		expect(reg.read("pij-w")?.windowId).toBe("@2");
	});

	it("is a no-op when the node already has a windowId (once-only latch)", () => {
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

	it("is a no-op without a pane, on resolver failure, and on a malformed id", () => {
		const reg = new FakeRegistry([desc({})]);
		const { paneId: _p, ...noPane } = desc({});
		expect(backfillWindowId(noPane, reg, () => "@1")).toBeNull();
		expect(backfillWindowId(desc({ paneId: "%7" }), reg, () => null)).toBeNull();
		expect(backfillWindowId(desc({ paneId: "%7" }), reg, () => "window-3")).toBeNull();
		expect(reg.read("pij-w")?.windowId).toBeUndefined();
	});

	it("a CLI-stamped windowId on disk survives a daemon write lacking it (merge law)", () => {
		const reg = new FakeRegistry([desc({ windowId: "@5" })]);
		const written = writeMerged(reg, desc({ state: "working" }));
		expect(written.windowId).toBe("@5");
	});
});
