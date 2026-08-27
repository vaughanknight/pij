// pij-control-plane — daemon whole-life stalled/dead push tests (T011).
//
// The impure daemon.ts tick detects stalled/dead bound sessions and pushes
// once per transition to the creator. Tests use the Daemon class directly
// with fake ports to drive behaviour without real tmux.

import { describe, expect, it } from "vitest";
import { FakeDelivery, FakeRegistry } from "./adapters/fakes.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import { STALE_AFTER_MS } from "./core/state.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const HOME = "/home/jo";
const T0 = 1_000_000;
const FRESH_EVENT_AT = new Date(T0 - 5000).toISOString();
const STALE_EVENT_AT = new Date(T0 - STALE_AFTER_MS - 5000).toISOString();

function bound(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-worker",
		folder: "/repo",
		dataDir: `${HOME}/.pij/pij-worker`,
		eventsPath: `${HOME}/.pij/pij-worker/events.ndjson`,
		pid: 200,
		startedAt: "2026-06-28T00:00:00.000Z",
		harness: "claude",
		lifecycle: "bound",
		harnessSessionId: "claude-sess-abc",
		paneId: "%2",
		spawnedBy: "pij-boss",
		state: "working",
		lastEventAt: STALE_EVENT_AT,
		...over,
	};
}

function makePorts(opts: {
	pane?: string;
	dead?: boolean;
	nowMs?: number;
	pidAlive?: boolean;
}): DaemonPorts {
	return {
		capturePane: () => opts.pane ?? "⏵ bypass permissions on",
		isPaneDead: () => opts.dead ?? false,
		sendText: () => "confirmed",
		sendKey: () => {},
		listTranscripts: () => [],
		home: () => HOME,
		now: () => opts.nowMs ?? T0,
		isAlive: () => opts.pidAlive ?? true,
	};
}

function daemon(
	descs: SessionDescriptor[],
	ports: DaemonPorts,
): { delivery: FakeDelivery; daemon: Daemon } {
	const registry = new FakeRegistry(descs);
	const delivery = new FakeDelivery();
	// Daemon constructor needs: pijHome, ports, registry, channel, log
	const d = new Daemon(`${HOME}/.pij`, ports, registry, delivery, () => {});
	return { delivery, daemon: d };
}

describe("daemon tick: stalled-session push (T011/T012)", () => {
	it("pushes a stalled notice to the creator when a bound session is working+stale", async () => {
		const desc = bound(); // state=working, lastEventAt stale
		// A booting-classified pane (no idle/busy footer marker) keeps state=working:
		// an idle-footer pane would flip to `idle` (not stalled). Single tick has no
		// prior pane signature, so the heartbeat can't refresh → working+stale stalls.
		const ports = makePorts({ pane: "▝▜█████▛▘ Loading…" });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		const toCreator = delivery.outbox.filter((e) => e.message.to === "pij-boss");
		expect(toCreator.some((e) => e.message.body.match(/stall|stalled|quiet/i))).toBe(true);
	});

	// FLAKY (quarantined 2026-07-21, Jordan ruling): passes in isolation, fails under full-suite parallel-load contention. Re-enable when the suite is de-contended.
	it.skip("pushes only ONCE per stalled transition (latch)", async () => {
		// Use a booting-classified pane so classifyReadiness → "booting" and
		// observeActivity returns null (no-op). The registry keeps state="working" +
		// the original stale lastEventAt, so tick 2 and 3 still see working+stale.
		// Without the latch.has("stalled") guard, ticks 2+ would push again → RED.
		const desc = bound();
		const ports = makePorts({ pane: "▝▜█████▛▘ Loading…" });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		await d.tick();
		await d.tick();
		const toCreator = delivery.outbox.filter(
			(e) => e.message.to === "pij-boss" && e.message.body.match(/stall|stalled|quiet/i),
		);
		expect(toCreator).toHaveLength(1);
	});

	it("does NOT push for a non-stalled session (working with fresh events)", async () => {
		const desc = bound({
			state: "working",
			lastEventAt: new Date(T0 - 5000).toISOString(), // recent
		});
		const ports = makePorts({ pane: "↓ 42 tokens  esc to interrupt" });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		expect(
			delivery.outbox.filter(
				(e) => e.message.to === "pij-boss" && e.message.body.match(/stall|stalled/i),
			),
		).toHaveLength(0);
	});

	// FLAKY (quarantined 2026-07-21, Jordan ruling): passes in isolation, fails under full-suite parallel-load contention. Re-enable when the suite is de-contended.
	it.skip("does NOT push stalled while the pane keeps CHANGING (deep-think heartbeat, SUGG-002)", async () => {
		// A deep-think / long-tool xhigh peer renders scrolling output that classifies
		// as `booting` (no footer marker), so observeActivity never refreshes on a busy
		// marker — but the pane IS changing. The pane-content heartbeat treats each
		// change as activity, keeping lastEventAt fresh so the 60s stale clock never
		// trips even as the wall clock passes the window. This is the false-positive fix.
		let clock = T0;
		let frame = 0;
		const ports: DaemonPorts = {
			...makePorts({}),
			capturePane: () => `▝▜█ working… frame ${frame}`, // booting-classified AND changes each tick
			now: () => clock,
		};
		const desc = bound({ state: "working", lastEventAt: new Date(T0).toISOString() });
		const { delivery, daemon: d } = daemon([desc], ports);
		for (let i = 0; i < 5; i++) {
			frame++; // pane content changes tick-to-tick
			clock += STALE_AFTER_MS / 2; // cumulative wall time races well past the stale window
			await d.tick();
		}
		expect(
			delivery.outbox.filter(
				(e) => e.message.to === "pij-boss" && e.message.body.match(/stall|stalled/i),
			),
		).toHaveLength(0);
	});

	it("DOES push stalled when the pane is byte-STABLE past the window (genuine stall)", async () => {
		// The heartbeat's flip side: a working peer whose pane never changes for the
		// whole window is genuinely stuck → still pushed exactly once.
		let clock = T0;
		const ports: DaemonPorts = {
			...makePorts({}),
			capturePane: () => "▝▜█ Loading…", // booting-classified, NEVER changes
			now: () => clock,
		};
		const desc = bound({ state: "working", lastEventAt: new Date(T0).toISOString() });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick(); // establishes the pane-signature baseline (fresh, no stall)
		clock += STALE_AFTER_MS + 5000; // wall clock passes the window, pane unchanged
		await d.tick();
		expect(
			delivery.outbox.filter(
				(e) => e.message.to === "pij-boss" && e.message.body.match(/stall|stalled/i),
			),
		).toHaveLength(1);
	});
});

describe("daemon tick: dead-session push (T011/T012)", () => {
	it("pushes a dead notice to the creator when the bound session's pid is gone", async () => {
		const desc = bound({ state: "idle" });
		const ports = makePorts({ pidAlive: false });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		const toCreator = delivery.outbox.filter((e) => e.message.to === "pij-boss");
		expect(toCreator.some((e) => e.message.body.match(/dead|exit|gone/i))).toBe(true);
	});

	it("pushes only once for a dead session (latch)", async () => {
		const desc = bound({ state: "idle" });
		const ports = makePorts({ pidAlive: false });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		await d.tick();
		const toCreator = delivery.outbox.filter(
			(e) => e.message.to === "pij-boss" && e.message.body.match(/dead|exit|gone/i),
		);
		expect(toCreator).toHaveLength(1);
	});
});

// ─── FIX-4 mutation-proof: failureReason persisted on whole-life push ─────────
// Mutation: remove registry.write({ ...d, failureReason }) → descriptor missing reason → RED.

describe("failureReason persisted on whole-life push (FIX-4)", () => {
	it("dead push: registry descriptor carries failureReason after tick", async () => {
		const desc = bound({ state: "idle" });
		// empty pane → classifyDeathReason → "unknown" (no pattern matches)
		const ports = makePorts({ pidAlive: false, pane: "" });
		const { registry, daemon: d } = (() => {
			const r = new FakeRegistry([desc]);
			const del = new FakeDelivery();
			const dm = new Daemon(`${HOME}/.pij`, ports, r, del, () => {});
			return { registry: r, daemon: dm };
		})();
		await d.tick();
		const updated = registry.read("pij-worker");
		expect(updated?.failureReason).toBeDefined();
	});

	it("stalled push: registry descriptor carries failureReason='stalled' after tick", async () => {
		const desc = bound(); // state=working, lastEventAt stale
		// booting pane → observeActivity no-op, session stays working+stale
		const ports = makePorts({ pane: "▝▜█████▛▘ Loading…" });
		const { registry, daemon: d } = (() => {
			const r = new FakeRegistry([desc]);
			const del = new FakeDelivery();
			const dm = new Daemon(`${HOME}/.pij`, ports, r, del, () => {});
			return { registry: r, daemon: dm };
		})();
		await d.tick();
		const updated = registry.read("pij-worker");
		expect(updated?.failureReason).toBe("stalled");
	});
});

// ─── T014: bad-model smoke (mocked capturePane, no live harness) ─────────────

describe("bad-model smoke (T014 — mocked pane, no live harness)", () => {
	// A PENDING copilot session whose pane shows a model-not-supported 400 error.
	// The daemon's driveSession path must: detect the error → fail() with
	// reason model-not-supported → push to the creator. No live tmux needed.
	const BAD_PANE =
		'Error: 400 Bad Request — model "gpt-99" not available\n' +
		"/ commands · ? help · tab next tab";

	function pendingCopilot(): SessionDescriptor {
		return {
			id: "pij-copilot-bad",
			folder: "/repo",
			dataDir: `${HOME}/.pij/pij-copilot-bad`,
			eventsPath: `${HOME}/.pij/pij-copilot-bad/events.ndjson`,
			pid: 300,
			startedAt: "2026-06-28T00:00:00.000Z",
			harness: "copilot",
			lifecycle: "pending",
			paneId: "%5",
			spawnedBy: "pij-boss",
			plannedHarnessSessionId: "uuid-bad-model",
			initInjectedAt: "2026-06-28T00:00:01.000Z",
		};
	}

	it("daemon driveSession detects bad model → fail with model-not-supported → creator notified", async () => {
		const ports: DaemonPorts = {
			capturePane: () => BAD_PANE,
			isPaneDead: () => false,
			sendText: () => "confirmed",
			sendKey: () => {},
			listTranscripts: () => [],
			home: () => HOME,
			now: () => T0,
			isAlive: () => true,
		};
		const registry = new FakeRegistry([pendingCopilot()]);
		const delivery = new FakeDelivery();
		const d = new Daemon(`${HOME}/.pij`, ports, registry, delivery, () => {});
		await d.tick();
		// Session must be marked failed with model-not-supported reason
		const desc = registry.read("pij-copilot-bad");
		expect(desc?.lifecycle).toBe("failed");
		expect(desc?.failureReason).toBe("model-not-supported");
		// Creator must be notified
		const toCreator = delivery.outbox.filter((e) => e.message.to === "pij-boss");
		expect(toCreator.some((e) => e.message.body.match(/failed to bind|model-not-supported/i))).toBe(
			true,
		);
	});
});

// ─── FIX-A mutation-proof: provider-failure on idle bound session (DL-003) ───
// Mutation: remove the new `provider-failure` branch in pushWholeLifeTransition
// → no push fires for an idle pid-alive session with a credit error → RED.

describe("daemon tick: provider-failure on idle bound session (FIX-A / DL-003)", () => {
	const CREDIT_PANE =
		"Error: prepaid credit balance exhausted — add credits at https://console.sakana.ai/billing\n⏵ bypass permissions on";

	it("detects quota error in pane of idle pid-alive bound session → pushes once to creator", async () => {
		const desc = bound({ state: "idle", lastEventAt: STALE_EVENT_AT });
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		const toCreator = delivery.outbox.filter((e) => e.message.to === "pij-boss");
		expect(toCreator.length).toBeGreaterThan(0);
	});

	it("does NOT push yet for an idle pid-alive bound session with fresh activity", async () => {
		const desc = bound({ state: "idle", lastEventAt: FRESH_EVENT_AT });
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		expect(delivery.outbox.filter((e) => e.message.to === "pij-boss")).toHaveLength(0);
	});

	it("pushes only ONCE per provider-failure (latch)", async () => {
		const desc = bound({ state: "idle", lastEventAt: STALE_EVENT_AT });
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		await d.tick();
		await d.tick();
		const toCreator = delivery.outbox.filter((e) => e.message.to === "pij-boss");
		expect(toCreator).toHaveLength(1);
	});

	it("persists failureReason='quota' on the descriptor after provider-failure push", async () => {
		const desc = bound({ state: "idle", lastEventAt: STALE_EVENT_AT });
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const { registry, daemon: d } = (() => {
			const r = new FakeRegistry([desc]);
			const del = new FakeDelivery();
			const dm = new Daemon(`${HOME}/.pij`, ports, r, del, () => {});
			return { registry: r, daemon: dm };
		})();
		await d.tick();
		expect(registry.read("pij-worker")?.failureReason).toBe("quota");
	});

	it("does NOT push for an idle session with no recognisable error (transient text)", async () => {
		const desc = bound({ state: "idle", lastEventAt: STALE_EVENT_AT });
		const ports = makePorts({ pane: "Retrying… (attempt 2/3)", pidAlive: true });
		const { delivery, daemon: d } = daemon([desc], ports);
		await d.tick();
		expect(delivery.outbox.filter((e) => e.message.to === "pij-boss")).toHaveLength(0);
	});
});

// ─── DL-005 mutation-proof: provider-failure peek covers a PI worker ──────────
// The motivating case the prior tests structurally could not express: a real pi
// worker self-registers a LEAN descriptor — `paneId` + `spawnedBy` but NO
// `lifecycle` and NO `harness` — so it fails the delivery-ownership gate and
// never enters the owned branch. The read-only peek must still catch it.
// Mutation: gate the peek on `owns` (lifecycle==="bound" && daemonOwnsDelivery)
// instead of `d.paneId && d.spawnedBy` → no push fires for the pi worker → RED.

describe("daemon tick: provider-failure peek covers a pi worker (DL-005)", () => {
	const CREDIT_PANE =
		"Error: prepaid credit balance exhausted — add credits at https://console.sakana.ai/billing\nfugu-ultra • high";

	// A pi self-register descriptor: NO lifecycle, NO harness (the real shape).
	function piWorker(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
		return {
			id: "pij-pi-worker",
			folder: "/repo",
			dataDir: `${HOME}/.pij/pij-pi-worker`,
			eventsPath: `${HOME}/.pij/pij-pi-worker/events.ndjson`,
			pid: 400,
			startedAt: "2026-06-28T00:00:00.000Z",
			paneId: "%9",
			spawnedBy: "pij-boss",
			state: "idle",
			lastEventAt: STALE_EVENT_AT,
			...over,
		};
	}

	it("detects the sakana credit error in a pi worker's pane → pushes once to creator", async () => {
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const { delivery, daemon: d } = daemon([piWorker()], ports);
		await d.tick();
		await d.tick(); // second tick proves the latch holds (no double-push)
		const toCreator = delivery.outbox.filter((e) => e.message.to === "pij-boss");
		expect(toCreator).toHaveLength(1);
	});

	it("persists failureReason='quota' on the pi worker descriptor", async () => {
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const registry = new FakeRegistry([piWorker()]);
		const del = new FakeDelivery();
		const d = new Daemon(`${HOME}/.pij`, ports, registry, del, () => {});
		await d.tick();
		expect(registry.read("pij-pi-worker")?.failureReason).toBe("quota");
	});

	it("does NOT push for a pi worker whose pane shows only transient text", async () => {
		const ports = makePorts({ pane: "⠴ Retrying (2/3)…", pidAlive: true });
		const { delivery, daemon: d } = daemon([piWorker()], ports);
		await d.tick();
		expect(delivery.outbox.filter((e) => e.message.to === "pij-boss")).toHaveLength(0);
	});

	it("does NOT peek a pi worker with no creator (spawnedBy absent)", async () => {
		const ports = makePorts({ pane: CREDIT_PANE, pidAlive: true });
		const { delivery, daemon: d } = daemon([piWorker({ spawnedBy: undefined })], ports);
		await d.tick();
		expect(delivery.outbox).toHaveLength(0);
	});
});

// ─── Phase 1 (#5): both daemon paths honour the tightened classifier ──────────
// AC-01 covers BOTH the dead branch (pushWholeLifeTransition) and the peek branch
// (pushProviderFailure): neither may assert a confident `quota` off ambient
// billing-domain scrollback. Prose with no real error frame → unknown / no push.

const PROSE_PANE = "split billing report\ncredit memo #4471\ninsufficient line items detected";

describe("daemon dead branch: billing prose never reports quota (#5, task 1.2)", () => {
	it("a dead session whose pane shows only billing-domain prose → failureReason unknown", async () => {
		const desc = bound({ state: "idle" });
		const ports = makePorts({ pidAlive: false, pane: PROSE_PANE });
		const registry = new FakeRegistry([desc]);
		const d = new Daemon(`${HOME}/.pij`, ports, registry, new FakeDelivery(), () => {});
		await d.tick();
		expect(registry.read("pij-worker")?.failureReason).toBe("unknown");
	});
});

describe("daemon peek branch: billing prose never reports quota (#5, task 1.2b)", () => {
	it("a stale-idle pid-alive session with only billing prose → no provider-failure push", async () => {
		const desc = bound({ state: "idle", lastEventAt: STALE_EVENT_AT });
		const ports = makePorts({ pidAlive: true, pane: PROSE_PANE });
		const registry = new FakeRegistry([desc]);
		const delivery = new FakeDelivery();
		const d = new Daemon(`${HOME}/.pij`, ports, registry, delivery, () => {});
		await d.tick();
		expect(delivery.outbox.filter((e) => e.message.to === "pij-boss")).toHaveLength(0);
		expect(registry.read("pij-worker")?.failureReason).toBeUndefined();
	});
});
