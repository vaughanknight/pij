// GATE (plan 097 Phase 5): the daemon's `watchdog:` wiring is REACHED, not just present.
//
// WHY THIS FILE EXISTS — and it is this stream's own finding turned on itself.
//
// #154 was `inert-subscription` never firing in the daemon because NOTHING EVER
// BUILT ITS INPUT: the detector was correct, the call site was live, and the one
// argument that made the row reachable was absent. Present, correct, never
// executed. Phase 0 fixed that by projecting the watchdog at `daemon.ts`'s
// `new AnomalySweep({...})`.
//
// That fix then had the SAME shape as the bug. **Composition-root edits are
// untested by construction**: a unit test injects its own dependencies — that is
// what makes it a unit test — so the composition root is precisely the code it
// never executes. Verified before writing this file: every test that builds an
// `AnomalySweep` constructs it DIRECTLY with its own deps
// (`acceptance-sweep.test.ts:400`, `core/daemon/anomaly-sweep.test.ts`), and NO
// test anywhere constructs the real `Daemon` and asserts the sweep it builds
// receives a watchdog projection. A sibling could restructure that constructor,
// drop the `watchdog:` key, and every test in the repo would stay green.
//
// So this file constructs the REAL `Daemon` against a real temp `PIJ_HOME`,
// writes a registry + a watchdog sidecar to DISK, ticks, and asserts an
// `inert-subscription` alert lands in the recipient's inbox. Nothing is injected
// but the tmux ports.
//
// WHICH ROW IS ASSERTED, AND WHY (the spec requires this to be stated).
//
// The PAUSED-TRIGGER row, not #154's dead-recipient row. The dead-recipient row
// cannot fire end-to-end on this branch: it is gated on `activityCredibility`,
// which `s095` owns and which does not exist here, so the daemon deliberately
// does not wire it (pinned by `core/daemon/anomaly-sweep.test.ts` "2b"). Reaching
// for it would mean faking reach we do not have — the exact defect this stream
// exists to remove. The paused-trigger row needs no credibility predicate and
// travels the identical seam: registry → per-node sidecar read → `watchdog:`
// projection → `detectAnomalies` → alert → channel. It proves the wiring is
// EXECUTED, which is the whole claim. When `s095` lands, the dead-recipient row
// becomes the strictly stronger assertion to make here.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsChannel } from "./adapters/channel.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { FsWatchdogStore } from "./adapters/watchdog-store.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import type { SessionDescriptor } from "./core/types.js";
import { Daemon } from "./daemon.js";

const NOW_MS = Date.parse("2026-08-08T00:00:00.000Z");

let home: string;
let logs: string[];

beforeEach(async () => {
	home = mkdtempSync(join(tmpdir(), "pij-daemon-wiring-"));
	logs = [];
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
		startedAt: "2026-08-07T00:00:00.000Z",
		...over,
	};
}

/** No tmux is touched: no panes exist, nothing is captured, nothing is typed.
 *  The daemon's OTHER passes are irrelevant here — only the anomaly sweep is
 *  under test, and it reads the filesystem, not panes. */
function fakePorts(): DaemonPorts {
	return {
		capturePane: () => "",
		isPaneDead: () => false,
		sendText: () => "confirmed",
		sendKey: () => {},
		killPane: () => {},
		listTranscripts: () => [],
		home: () => home,
		now: () => NOW_MS,
		isAlive: () => true,
	};
}

function inboxBodies(to: string): string[] {
	try {
		return readdirSync(join(home, to, "inbox"))
			.filter((name) => name.startsWith("msg-") && name.endsWith(".json"))
			.sort()
			.map((name) => {
				const message = JSON.parse(readFileSync(join(home, to, "inbox", name), "utf8")) as {
					body: string;
				};
				return message.body;
			});
	} catch {
		return [];
	}
}

/** The fleet shape: a watched seat that has paused its own watchdog, reporting
 *  to a parent who is the alert's recipient. Written to DISK, because the point
 *  of this file is that the daemon does its own reading. */
function writeFleet(): void {
	const registry = new FsRegistry(home);
	registry.write(desc({ id: "pij-boss" }));
	registry.write(desc({ id: "pij-watcher-one" }));
	registry.write(
		desc({
			id: "pij-paused-seat",
			parentId: "pij-boss",
			// No `semanticState`: an undeclared quiet seat is the case the row is
			// for. A parked state (waiting/hold/blocked/question) would legitimately
			// suppress it, and would make this test pass for the wrong reason.
		}),
	);
	new FsWatchdogStore(home).write("pij-paused-seat", {
		enabled: true,
		intervalMs: 600_000,
		pausedBy: "self",
		pausedAtMs: NOW_MS - 3_600_000,
		watchers: [{ watcherId: "pij-watcher-one", addedAt: "2026-08-07T00:00:00.000Z" }],
	});
}

describe("the REAL Daemon's composition root wires the watchdog into its AnomalySweep", () => {
	// ── THE CRITERION. One claim, one observable, and it is deliberately NOT a
	// precondition. "the Daemon constructed", "tick() did not throw", "the sweep
	// ran" are all SETUP: each stays true with the `watchdog:` key deleted, so
	// none of them can carry the claim. The observable that CHANGES when the
	// wiring is removed — verified by reverting daemon.ts and by three mutations
	// — is a watchdog-DERIVED row arriving in a recipient's inbox. That is what
	// is asserted below, and nothing weaker.
	it("a real Daemon.tick() delivers a watchdog-derived inert-subscription alert", async () => {
		writeFleet();
		const daemon = new Daemon(
			home,
			fakePorts(),
			new FsRegistry(home),
			new FsChannel(home),
			(line) => logs.push(line),
		);

		await daemon.tick();

		// The alert exists AND names the paused seat and its watcher — the
		// projection is per-node and carries the sidecar's contents, so a wiring
		// that produced an empty or node-less projection cannot satisfy this.
		const alerts = inboxBodies("pij-boss").filter((body) =>
			body.includes("anomaly inert-subscription"),
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toContain("pij-paused-seat");
		expect(alerts[0]).toContain("pij-watcher-one");
		expect(alerts[0]).toContain("PAUSED by self");

		daemon.dispose();
	});

	// Corroboration on a SECOND surface, not a second criterion: the same claim
	// observed through the daemon's own log rather than the channel. Kept because
	// the two surfaces fail independently — a delivery-path regression breaks the
	// inbox assertion while this one holds, and vice versa.
	it("the alert is reported by the daemon's own sweep summary, not just present on disk", async () => {
		writeFleet();
		const daemon = new Daemon(
			home,
			fakePorts(),
			new FsRegistry(home),
			new FsChannel(home),
			(line) => logs.push(line),
		);

		await daemon.tick();

		// The daemon logs pushed alerts. This is the seam's OWN report of itself:
		// if the sweep were constructed without `watchdog:`, it would tick happily
		// and silently — which is the failure mode under test.
		expect(logs.some((line) => line.startsWith("anomaly sweep: pushed "))).toBe(true);

		daemon.dispose();
	});

	it("no watchdog sidecar on disk ⇒ no inert-subscription alert (the row is not free)", async () => {
		// Guards the inverse: this test file must be able to tell the wiring from
		// an unconditional row. Same fleet, same tick, sidecar omitted.
		const registry = new FsRegistry(home);
		registry.write(desc({ id: "pij-boss" }));
		registry.write(desc({ id: "pij-paused-seat", parentId: "pij-boss" }));
		const daemon = new Daemon(home, fakePorts(), registry, new FsChannel(home), (line) =>
			logs.push(line),
		);

		await daemon.tick();

		expect(inboxBodies("pij-boss").filter((b) => b.includes("anomaly inert-subscription"))).toEqual(
			[],
		);

		daemon.dispose();
	});
});
