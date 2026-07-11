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
	writeMerged,
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
});
