// pij — the tick-heartbeat overlay, scrub, and lifecycle prune (pij#180 Fix A,
// plan 100 Phase 2).
//
// A SECOND spec beside `fs-registry.test.ts`, deliberately. That file drives
// real worker processes to exercise concurrent-write races, which puts it on the
// mutation tool's refusal list — per FILE, even though the marker is earned by
// three tests out of thirty-nine. Everything here runs in-process, so every
// mutant in the plan's table (M2-M5) stays runnable on the fast tool, INCLUDING
// by a reviewer with no write access to this tree. Keep it that way: nothing in
// this file may reach for another process.
//
// Everything below runs against the REAL `FsRegistry`. `FakeRegistry` has no
// overlay at all, so a fake would pass every assertion here in a world where
// production fails them.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliDeps } from "../core/cli.js";
import { dispatch, parseArgs } from "../core/cli.js";
import { FsTickHeartbeatStore, TICK_HEARTBEAT_FILE } from "../core/daemon/tick-heartbeat.js";
import { DAEMON_TICK_STALE_AFTER_MS } from "../core/receipts.js";
import { PijSession } from "../core/session.js";
import type { SessionDescriptor } from "../core/types.js";
import { FakeDelivery, FakeEventLog, FakePiRuntime, FakeProcess, FakeTmux } from "./fakes.js";
import { FsRegistry } from "./fs-registry.js";

const NOW_MS = Date.parse("2026-06-28T12:00:00.000Z");
const ONE_HOUR_MS = 60 * 60 * 1000;
/** Comfortably inside `DAEMON_TICK_STALE_AFTER_MS` (30s). */
const FRESH_TICK = new Date(NOW_MS - 1_000).toISOString();

let home: string;

beforeEach(async () => {
	home = mkdtempSync(join(tmpdir(), "pij-overlay-"));
});

afterEach(async () => {
	rmSync(home, { recursive: true, force: true });
});

function descriptor(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: process.pid,
		startedAt: new Date(NOW_MS - 300_000).toISOString(),
		state: "idle",
		lastEventAt: new Date(NOW_MS - 2_000).toISOString(),
		lifecycle: "bound",
		...over,
	};
}

/** The raw bytes on disk — the ONLY way to see what was actually persisted,
 *  because `read()` would put the overlay straight back. */
function rawOnDisk(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** The daemon's side of the tick axis — the only thing that writes the map. */
function heartbeat(): FsTickHeartbeatStore {
	return new FsTickHeartbeatStore(home);
}

/** Real `FsRegistry`, real store. */
function newRegistry(): FsRegistry {
	return new FsRegistry(home, heartbeat());
}

/** Real `FsRegistry`, real receipt logic, real `dispatch`. Only the delivery
 *  channel, clock, and event log are faked — none of them can see or synthesise
 *  a tick stamp, so the overlay stays the thing under test. */
function cliDeps(self: string): CliDeps & { readonly delivery: FakeDelivery } {
	const delivery = new FakeDelivery();
	return {
		registry: newRegistry(),
		delivery,
		process: new FakeProcess(process.pid, NOW_MS, { PIJ_SESSION_ID: self }, [process.pid]),
		cwd: "/repo",
		pijHome: home,
		eventLogFor: () => new FakeEventLog([]),
	};
}

/** The REAL `pij send` receipt surface, end to end: `parseArgs` → `dispatch` →
 *  `preflightSendTargets` (which calls the real `registry.read`) → the real
 *  `daemonTickStatus`. Nothing about the tick axis is stubbed. */
function sendReceipt(self: string, to: string): Record<string, unknown> {
	const parsed = parseArgs(["send", to, "hello", "--json"]);
	if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
	const result = dispatch(parsed.value, cliDeps(self));
	if (result.exitCode !== 0) throw new Error(`send failed: ${result.stdout}${result.stderr}`);
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("FsRegistry tick-heartbeat overlay (pij#180 Fix A, plan 100 Phase 2)", () => {
	// ─── AC-04 · the reader surface survives the removal ──────────────────────
	it("AC-04: read() attaches lastTickAt from the heartbeat map", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
	});

	it("AC-04b: a descriptor with no map entry reads undefined, not a fabricated stamp", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-other"], FRESH_TICK);

		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
	});

	it("AC-04c: list() attaches the stamp too, and reads the map once for the whole listing", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		registry.write(descriptor({ id: "pij-b", harness: "copilot" }));
		heartbeat().write(["pij-a", "pij-b"], FRESH_TICK);

		let mapReads = 0;
		const counting = new FsRegistry(home, {
			read: () => {
				mapReads += 1;
				return heartbeat().read();
			},
			forget: () => {},
		});
		const listed = counting.list();

		expect(listed.map((d) => d.lastTickAt)).toEqual([FRESH_TICK, FRESH_TICK]);
		expect(mapReads).toBe(1);
	});

	it("AC-04d: an ARCHIVED record gets no overlay — a fresh stamp on a corpse is a lie", async () => {
		const registry = newRegistry();
		registry.write(
			descriptor({
				id: "pij-dead",
				harness: "claude",
				lifecycle: "dissolved",
				lastEventAt: new Date(NOW_MS - 60 * ONE_HOUR_MS).toISOString(),
			}),
		);
		expect(registry.archive("pij-dead", NOW_MS)).toBe("archived");
		// Seeded AFTER the archive, so the map genuinely holds a stamp for this id:
		// the archive fall-through in `read()` is the only thing that can refuse it.
		heartbeat().write(["pij-dead"], FRESH_TICK);

		expect(registry.read("pij-dead")?.lastTickAt).toBeUndefined();
	});

	// ─── AC-05 · the ONLY criterion that observes the overlay from OUTSIDE ────
	//
	// The overlay's stated virtue is that every reader keeps working unaware —
	// and an unaware reader cannot notice the overlay stopped applying. This
	// exercises the real `pij send` receipt path, which is where `daemonTickStale`
	// becomes a user-visible `unverified` (`cli.ts` CliBatonNoticeSink) rather
	// than a `queued`. Through a stub it would prove nothing.
	it("AC-05: the send receipt for a freshly-ticked claude target is queued and NOT stale", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-sender", harness: "claude" }));
		registry.write(descriptor({ id: "pij-target", harness: "claude" }));
		heartbeat().write(["pij-sender", "pij-target"], FRESH_TICK);

		expect(sendReceipt("pij-sender", "pij-target")).toMatchObject({
			receipt: "queued",
			reason: "tick-pending",
			daemonLastTickAt: FRESH_TICK,
			daemonTickStale: false,
		});
	});

	it("AC-05b: a copilot target is covered by the same receipt path", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-sender", harness: "claude" }));
		registry.write(descriptor({ id: "pij-target", harness: "copilot" }));
		heartbeat().write(["pij-target"], FRESH_TICK);

		expect(sendReceipt("pij-sender", "pij-target")).toMatchObject({
			daemonTickStale: false,
		});
	});

	// ─── AC-09 · the overlay must not MASK a stopped daemon ──────────────────
	//
	// No pre-fix form of this exists: before the overlay there is nothing to mask
	// with, so the claim is vacuous rather than false. Mutant M4 is its only proof.
	it("AC-09: an overlay stamp older than the staleness threshold still reads stale", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-sender", harness: "claude" }));
		registry.write(descriptor({ id: "pij-target", harness: "claude" }));
		const stopped = new Date(NOW_MS - DAEMON_TICK_STALE_AFTER_MS - 60_000).toISOString();
		heartbeat().write(["pij-target"], stopped);

		expect(sendReceipt("pij-sender", "pij-target")).toMatchObject({
			daemonLastTickAt: stopped,
			daemonTickStale: true,
		});
	});

	// ─── AC-06 · the heartbeat file is not a session ─────────────────────────
	it("AC-06: the heartbeat file in pijHome is invisible to list()", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		const before = registry.list().length;
		heartbeat().write(["pij-a"], FRESH_TICK);

		expect(registry.list().length).toBe(before);
	});

	it("AC-06b: the heartbeat record carries no top-level id, which is WHY list() ignores it", async () => {
		heartbeat().write(["pij-a"], FRESH_TICK);
		const record = rawOnDisk(join(home, TICK_HEARTBEAT_FILE));

		expect(Object.hasOwn(record, "id")).toBe(false);
	});

	// ─── AC-08 · the ruled behaviour change ──────────────────────────────────
	//
	// `sweepArchivable` reads through `readFile`, which carries NO overlay. That
	// divergence is the ruling: archive ageing anchors on the real activity axis,
	// so a control-plane peer's 600ms tick can no longer hold a 60-hour-dead
	// record in the hot tier forever.
	it("AC-08: a dissolved record 60h quiet but freshly ticked is ARCHIVABLE", async () => {
		const registry = newRegistry();
		registry.write(
			descriptor({
				id: "pij-old",
				harness: "claude",
				lifecycle: "dissolved",
				startedAt: new Date(NOW_MS - 61 * ONE_HOUR_MS).toISOString(),
				lastEventAt: new Date(NOW_MS - 60 * ONE_HOUR_MS).toISOString(),
			}),
		);
		heartbeat().write(["pij-old"], new Date(NOW_MS - ONE_HOUR_MS).toISOString());

		expect(registry.sweepArchivable(NOW_MS)).toMatchObject({ archived: 1 });
	});

	// ─── AC-12 · THE SCRUB · the write-back defect ───────────────────────────
	//
	// `publish()` takes `existing` from `read()`, and real callers spread a read
	// result straight into a write. Without the scrub the overlaid stamp is
	// persisted back — in CLI processes, on every send — and this stops being a
	// performance fix and becomes a performance RELOCATION.
	it("AC-12: a read-modify-write never persists the overlaid stamp", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		const latest = registry.read("pij-a");
		if (!latest) throw new Error("fixture: descriptor disappeared");
		registry.write({ ...latest, lastEventAt: new Date(NOW_MS).toISOString() });

		// Precondition: the write really happened (a no-op write would pass the
		// load-bearing assertion for the wrong reason).
		expect(rawOnDisk(join(home, "pij-a.json")).lastEventAt).toBe(new Date(NOW_MS).toISOString());
		// LOAD-BEARING:
		expect(rawOnDisk(join(home, "pij-a.json")).lastTickAt).toBeUndefined();
	});

	it("AC-12b: the REAL stampSenderActivity path on a pij send persists no stamp", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-sender", harness: "claude" }));
		registry.write(descriptor({ id: "pij-target", harness: "claude" }));
		heartbeat().write(["pij-sender", "pij-target"], FRESH_TICK);

		sendReceipt("pij-sender", "pij-target");

		// Precondition: `stampSenderActivity` did its read-modify-write.
		expect(rawOnDisk(join(home, "pij-sender.json")).lastEventAt).toBe(
			new Date(NOW_MS).toISOString(),
		);
		// LOAD-BEARING: the CLI process on the send hot path persisted no stamp.
		expect(rawOnDisk(join(home, "pij-sender.json")).lastTickAt).toBeUndefined();
	});

	it("AC-12c: the durable IDENTITY snapshot is scrubbed too, not just the descriptor", async () => {
		const registry = newRegistry();
		registry.write(
			descriptor({ id: "pij-a", harness: "claude", harnessSessionId: "claude-native-a" }),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);

		const latest = registry.read("pij-a");
		if (!latest) throw new Error("fixture: descriptor disappeared");
		registry.write({ ...latest, lastEventAt: new Date(NOW_MS).toISOString() });

		const snapshot = registry.resolveIdentitySnapshot("claude", "claude-native-a");
		if (!snapshot.ok || !snapshot.value) throw new Error("fixture: no durable snapshot");
		// LOAD-BEARING: the snapshot is a SECOND durable copy of the descriptor and
		// hydrates a removed seat, so an unscrubbed stamp here would resurrect the
		// field on the next `write({ ...snapshot })`.
		expect(snapshot.value.lastTickAt).toBeUndefined();
	});

	// ─── AC-13' · the lifecycle gate, and the residual it leaves ─────────────
	//
	// > **AC-13'** — the overlay never shows a DISSOLVED seat as live; a
	// > reincarnation stamp is bounded by **the next heartbeat write**, and in its
	// > absence by the 30s staleness grace.
	//
	// The second clause was CORRECTED in fix round 4. It previously read "bounded
	// to ONE tick", which was factually wrong and is already in a commit message:
	// the bound is the next successful heartbeat WRITE, and if the daemon stops
	// there is no next write, so a stale stamp stands for the whole
	// `DAEMON_TICK_STALE_AFTER_MS` grace. See `AC-13' RESIDUAL` below, which now
	// measures that rather than the comfortable version.
	//
	// READ THE LABELS. The first criterion is PRESERVED-PROPERTY: it passes on
	// `848982d5` too, because the marker protocol also kept a dissolved seat from
	// reading live. It is not evidence of this change; it is evidence the change
	// did not lose the property. The P1c criteria ARE evidence — the deleted
	// protocol actively broke those, and they fail on `848982d5`.

	it("AC-13' (PRESERVED-PROPERTY): a DISSOLVED seat is never shown as live", async () => {
		// PASSES ON `848982d5` TOO, and that is the point of the label: the deleted
		// marker protocol also kept a dissolved seat from reading live. This is
		// evidence the deletion did not LOSE the property, not evidence of the
		// change. The criterion below is what shows the mechanism moved.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		registry.dissolve("pij-a");

		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
	});

	it("AC-13': the GATE refuses it, not a prune — the map still holds the stamp", async () => {
		// The mechanism substitution, made observable. On `848982d5` this fails at
		// the FIRST assertion, because `dissolve()` pruned the map there; the second
		// assertion held at both. So the property is preserved and the mechanism is
		// not — which is exactly the shape of this change.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		registry.dissolve("pij-a");

		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK);
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
	});

	it("AC-13' (PRESERVED-PROPERTY): list() refuses the same seat, which is the parity claim", async () => {
		// The gate was written by mirroring `list()`. If the two ever diverge, a
		// keyed read and a listing disagree about the same seat.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		registry.write(descriptor({ id: "pij-b", harness: "claude" }));
		heartbeat().write(["pij-a", "pij-b"], FRESH_TICK);

		registry.dissolve("pij-a");

		expect(registry.list().map((entry) => entry.id)).toEqual(["pij-b"]);
	});

	it("AC-13' PARITY: a FAILED seat still gets the overlay — the gate must not tighten", async () => {
		// `list()` does not exclude `failed`, and the pre-change tick stamped failed
		// seats (`publish()`'s tombstone guard blocked `dissolved` only). Gating on
		// anything beyond `dissolved` would be a silent behaviour change riding
		// along with a fix, and nothing else in the suite would notice.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
		expect(registry.list().map((entry) => entry.id)).toEqual(["pij-a"]);
	});

	// ─── P1e · a LEGACY terminal descriptor carries its own stamp ────────────
	//
	// The gate skips the OVERLAY, which is not the same as removing a stamp. Every
	// descriptor written before this plan has `lastTickAt` in its own JSON — 588 of
	// them on the machine this was found on — so a pre-migration dissolved record
	// was handed back live and AC-13' was false exactly on the migration data this
	// change deliberately supports.
	//
	// THE FIXTURES ARE RAW JSON ON PURPOSE. Writing them through `registry.write()`
	// would run `scrubTick` first, the stamp would never reach disk, and the
	// criterion would pass while proving nothing — the same trap as a removal
	// criterion that never observes the replacement.

	it("P1e: a raw LEGACY dissolved descriptor's own persisted stamp is stripped", async () => {
		writeFileSync(
			join(home, "pij-legacy-dead.json"),
			JSON.stringify(
				descriptor({
					id: "pij-legacy-dead",
					harness: "claude",
					lifecycle: "dissolved",
					lastTickAt: FRESH_TICK,
				}),
			),
		);
		const registry = newRegistry();

		// Precondition: the stamp really is on disk, so the strip is the only thing
		// that can be removing it.
		expect(rawOnDisk(join(home, "pij-legacy-dead.json")).lastTickAt).toBe(FRESH_TICK);
		expect(registry.read("pij-legacy-dead")?.lastTickAt).toBeUndefined();
	});

	it("P1e: and the ARCHIVE fall-through strips it too", async () => {
		// `read()` returns an archived record directly, so it needs its own strip:
		// the hot-branch gate never runs for it.
		mkdirSync(join(home, "archive"), { recursive: true });
		writeFileSync(
			join(home, "archive", "pij-legacy-archived.json"),
			JSON.stringify(
				descriptor({
					id: "pij-legacy-archived",
					harness: "claude",
					lifecycle: "dissolved",
					lastTickAt: FRESH_TICK,
				}),
			),
		);
		const registry = newRegistry();

		expect(rawOnDisk(join(home, "archive", "pij-legacy-archived.json")).lastTickAt).toBe(
			FRESH_TICK,
		);
		expect(registry.read("pij-legacy-archived")?.lastTickAt).toBeUndefined();
	});

	it("P1e: the LIVE legacy descriptor is NOT stripped — compatibility is deliberate", async () => {
		// The boundary of the fix, and the reason it is a lifecycle strip rather
		// than a blanket one. A live pre-migration seat keeps its own stamp until
		// something rewrites it; that is the migration story the spec asserts at the
		// bottom of this file, and tightening here would break it silently.
		writeFileSync(
			join(home, "pij-legacy-live.json"),
			JSON.stringify(
				descriptor({ id: "pij-legacy-live", harness: "claude", lastTickAt: FRESH_TICK }),
			),
		);
		const registry = newRegistry();

		expect(registry.read("pij-legacy-live")?.lastTickAt).toBe(FRESH_TICK);
	});

	// ─── P1c · the evidence of THIS change ───────────────────────────────────
	//
	// The deleted protocol wrote its marker AFTER publishing the replacement
	// descriptor (`revive()` and `unarchive()` both did). So a tick could stamp
	// `tickAt`, list and genuinely OBSERVE the fresh incarnation, and still be
	// ruled to describe the departed one — because the marker's `forgetAt` was
	// later than `tickAt`. An absent `lastTickAt` makes `daemonTickStatus()` stale
	// and the delivery receipt `unverified`, so this was user-visible.
	//
	// Both fail on `848982d5` and pass here.

	it("P1c: revive() no longer suppresses the tick that OBSERVED the new incarnation", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		registry.dissolve("pij-a");
		const revived = registry.revive(
			descriptor({ id: "pij-a", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		// The daemon stamped `tickAt` before `revive()` published, listed the fresh
		// descriptor after it, and its write lands now.
		heartbeat().write(["pij-a"], FRESH_TICK);

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
	});

	it("P1c: the ARCHIVED → revived path is no longer suppressed either", async () => {
		// TWO of the deleted markers were in play here, not one — `unarchive()`'s
		// and then `revive()`'s. That is deliberate and it is the honest framing:
		// `unarchive()`'s marker CANNOT be isolated through the public surface,
		// because an unarchived record re-enters the hot tier still `dissolved`, so
		// the lifecycle gate refuses it whatever the map says. The only route from
		// archived back to live runs through `revive()`, so the only observable
		// claim is about the composite path.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "dissolved" }));
		if (registry.archive("pij-a", NOW_MS) !== "archived") throw new Error("fixture: not archived");

		if (!registry.unarchive("pij-a")) throw new Error("fixture: unarchive returned null");
		const revived = registry.revive(
			descriptor({ id: "pij-a", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		// The tick lands AFTER the revive, so it genuinely observed the NEW
		// incarnation. Ordering matters since fix round 5: a tick written BEFORE the
		// revive is now correctly dropped by it, so seeding earlier would test the
		// drop rather than the suppression this criterion is about.
		heartbeat().write(["pij-a"], FRESH_TICK);

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
	});

	// ─── P1f · the reincarnation drop ────────────────────────────────────────
	//
	// These two INVERTED in fix round 5. They previously characterised the defect
	// — a revived seat inheriting the previous incarnation's stamp, and a real
	// receipt calling that daemon healthy — and carried an instruction that a fix
	// must flip them rather than relax them. This is that flip, and it is the
	// proof: both now assert the ABSENCE the defect used to assert the presence of.
	//
	// The map is keyed by id and an id outlives an incarnation, so four strip-lists
	// (`revive.ts:667`, `cli.ts:2658`, `session.ts:167`, `current-session.ts:189`)
	// could not reach it. `FsRegistry.revive()` — the single funnel from terminal
	// back to live — now drops the id.

	it("P1f: a revived seat inherits NO stamp, even with a stopped daemon", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);
		registry.dissolve("pij-a");
		const revived = registry.revive(
			descriptor({ id: "pij-a", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		// NO heartbeat write after the revive: this is the stopped-daemon case, so
		// nothing but the drop itself can be removing the stamp.
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
		// And it is gone from the MAP, not merely hidden by a reader.
		expect(heartbeat().read()["pij-a"]).toBeUndefined();
	});

	it("P1f: and the REAL receipt now reports the daemon it actually has", async () => {
		// The user-visible half, through the real send path — where the reviewer
		// measured the defect as `daemonTickStale: false` for a never-ticked seat.
		//
		// ASSERTED ON THE FLAG, NOT ON `unverified`, and the distinction was checked
		// rather than assumed: this dispatch path always reports `receipt: "queued"`
		// (see AC-05, which asserts exactly that for a HEALTHY tick). The
		// `unverified` state is minted downstream at `cli.ts:3400` —
		// `tick.daemonTickStale ? "unverified" : "queued"` — from this flag. That
		// file is not exercised here, so asserting `unverified` would be asserting a
		// value this path cannot produce.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-sender", harness: "claude" }));
		registry.write(descriptor({ id: "pij-target", harness: "claude" }));
		heartbeat().write(["pij-target"], FRESH_TICK);
		registry.dissolve("pij-target");
		const revived = registry.revive(
			descriptor({ id: "pij-target", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		expect(sendReceipt("pij-sender", "pij-target")).toMatchObject({
			daemonLastTickAt: null,
			daemonTickStale: true,
		});
	});

	it("P1f: the drop takes ONE id — every other seat keeps its stamp", async () => {
		// A whole-map wipe would pass both criteria above and break the fleet. The
		// drop is a read-modify-write, so "removes too much" is a live failure mode
		// rather than a hypothetical one.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		registry.write(descriptor({ id: "pij-b", harness: "claude" }));
		heartbeat().write(["pij-a", "pij-b"], FRESH_TICK);
		registry.dissolve("pij-a");
		const revived = registry.revive(
			descriptor({ id: "pij-a", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		expect(heartbeat().read()).toEqual({ "pij-b": FRESH_TICK });
		expect(registry.read("pij-b")?.lastTickAt).toBe(FRESH_TICK);
	});

	it("AC-13' BOUND (CONDITIONAL): a later heartbeat write re-stamps the live seat", async () => {
		// A CONDITIONAL, and the label is the point. It proves the whole-map rebuild
		// restores a legitimate stamp WHEN a rebuild happens. With the drop in place
		// the revived seat no longer depends on it for correctness — this now pins
		// that the drop does not permanently blind a seat.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);
		registry.dissolve("pij-a");
		const revived = registry.revive(
			descriptor({ id: "pij-a", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		const nextTick = new Date(NOW_MS - 500).toISOString();
		heartbeat().write(["pij-a"], nextTick);

		expect(registry.read("pij-a")?.lastTickAt).toBe(nextTick);
	});

	it("AC-13' BOUND (CONDITIONAL): and an UNOWNED seat is simply omitted by that write", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);
		registry.dissolve("pij-a");
		const revived = registry.revive(
			descriptor({ id: "pij-a", harness: "claude", pid: process.pid, lifecycle: "bound" }),
		);
		if (!revived.ok) throw new Error(`fixture: revive failed (${revived.message})`);

		heartbeat().write([], new Date(NOW_MS - 500).toISOString());

		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
	});

	// ─── P1g · absent → live: the transition `revive()` never sees ───────────
	it("P1g: a seat REHYDRATED from the durable identity snapshot inherits NO stamp", async () => {
		// THE REGRESSION FOR FIX ROUND 6, and it is deliberately built out of the
		// PRODUCTION wiring rather than a bare `writeExact()` call.
		//
		// `writeExact` is reachable from five places; only one of them is this
		// transition, and a unit test on the method would have passed while the boot
		// route stayed broken — the same shape as a fixture built by the code under
		// test. So the fixture here is the real chain: `allocateIdentity` (what
		// `index.ts` calls at session_start) hands back the identity SNAPSHOT once
		// `read()` is null, and `PijSession.boot()` takes its else branch because
		// there is no hot descriptor to have been dissolved.
		const before = newRegistry();
		before.write(
			descriptor({ id: "pij-a", harness: "pi", harnessSessionId: "pi-sid-1", lifecycle: "bound" }),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);
		// A CLEAN SHUTDOWN: the descriptor goes, the durable identity record stays.
		before.remove("pij-a");
		expect(before.read("pij-a")).toBeNull();
		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK); // the map outlived it

		// A NEW process: fresh registry instance, exactly as `index.ts` constructs.
		const registry = newRegistry();
		const allocated = registry.allocateIdentity("pi", "pi-sid-1", "seed", "pij-a");
		if (!allocated.ok) throw new Error(`fixture: allocateIdentity failed (${allocated.message})`);
		expect(allocated.value.id).toBe("pij-a");
		const durableDescriptor = allocated.value.descriptor;
		if (!durableDescriptor) throw new Error("fixture: no identity snapshot was restored");

		const session = new PijSession({
			registry,
			eventLog: new FakeEventLog([]),
			delivery: new FakeDelivery(),
			pi: new FakePiRuntime(true),
			process: new FakeProcess(process.pid, NOW_MS, {}),
			tmux: new FakeTmux(),
		});
		session.boot({
			id: "pij-a",
			folder: "/repo",
			dataDir: join(home, "pij-a"),
			eventsPath: join(home, "pij-a", "events.ndjson"),
			harness: "pi",
			harnessSessionId: "pi-sid-1",
			durableDescriptor,
			resetRuntimeState: true,
		});

		// The seat is genuinely LIVE — so this cannot be the lifecycle gate hiding
		// the stamp, which is the only other thing in this file that could.
		const rehydrated = registry.read("pij-a");
		expect(rehydrated?.lifecycle).not.toBe("dissolved");
		// No heartbeat write after the boot: the stopped-daemon case again, so
		// nothing but the drop itself can account for the absence.
		expect(rehydrated?.lastTickAt).toBeUndefined();
		expect(heartbeat().read()["pij-a"]).toBeUndefined();
	});

	it("P1g: and the rehydrated seat is re-stamped by the very next tick", async () => {
		// The companion CONDITIONAL. Proves the drop above did not blind the seat,
		// and proves the previous criterion's `undefined` was a missing stamp rather
		// than a descriptor the overlay can no longer reach.
		const registry = newRegistry();
		registry.write(
			descriptor({ id: "pij-a", harness: "pi", harnessSessionId: "pi-sid-1", lifecycle: "bound" }),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);
		registry.remove("pij-a");
		registry.writeExact(
			descriptor({ id: "pij-a", harness: "pi", harnessSessionId: "pi-sid-1", lifecycle: "bound" }),
		);
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();

		const nextTick = new Date(NOW_MS - 500).toISOString();
		heartbeat().write(["pij-a"], nextTick);

		expect(registry.read("pij-a")?.lastTickAt).toBe(nextTick);
	});

	it("P1g: an ARCHIVED record is not a present incarnation — archive → live drops too", async () => {
		// THE HOT-ONLY HALF of the precondition, and the reason it is sampled before
		// `unarchive()`. `read()` falls through to the archive, so a presence test
		// built on it would see the corpse and skip the drop; sampling AFTER
		// `unarchive()` would see the hot record that call just created and do the
		// same. Both are silent, and both leave the stamp on a NEW incarnation.
		//
		// `failed` rather than `dissolved` deliberately: `isTerminalRecord` admits
		// both to the archive, and only `dissolved` is refused by the tombstone
		// guard — so `failed` is the archived lifecycle that really can reach a live
		// write through `publish()`.
		mkdirSync(join(home, "archive"), { recursive: true });
		writeFileSync(
			join(home, "archive", "pij-a.json"),
			JSON.stringify(
				descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed", state: "idle" }),
			),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);
		const registry = newRegistry();
		expect(registry.read("pij-a")).not.toBeNull(); // present via the ARCHIVE only

		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));

		expect(registry.read("pij-a")?.lifecycle).toBe("bound");
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
		expect(heartbeat().read()["pij-a"]).toBeUndefined();
	});

	it("P1g: a write over a PRESENT hot descriptor keeps its stamp", async () => {
		// THE NEGATIVE, and it is the one that stops this fix becoming the defect it
		// replaces. The node-truth denorm update in `core/cli.ts` is a `writeExact`
		// on a healthy live seat; a drop keyed on the METHOD would fire there and
		// make every state report read stale. Keyed on the TRANSITION it cannot,
		// because that path has a hot descriptor — this pins it.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		const latest = registry.read("pij-a");
		if (!latest) throw new Error("fixture: descriptor disappeared");
		registry.writeExact({ ...latest, state: "working" });

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK);
	});

	it("P1g: a FIRST-EVER spawn takes the same branch harmlessly", async () => {
		// The branch fires on every first write of an id, by design — the predicate
		// is the transition, not a list of lifecycles. This pins that it is a no-op
		// for a brand-new seat and, more importantly, that it does not disturb the
		// stamps of the seats already in the map.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		registry.write(descriptor({ id: "pij-new", harness: "claude" }));

		expect(heartbeat().read()).toEqual({ "pij-a": FRESH_TICK });
		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
	});

	// ─── P1h · a hot CORPSE is not a present incarnation ─────────────────────
	//
	// Round 6's predicate asked "was a hot descriptor present?" and round 7's asks
	// "was a LIVE incarnation present?". The gap between those two questions is a
	// composition nobody wrote on purpose, and it is reachable entirely through the
	// PUBLIC surface:
	//
	//   `runRevive()` calls `registry.unarchive(id)` BEFORE it validates its plan,
	//   so a plan that fails to validate leaves an archived `failed` record sitting
	//   in the HOT tier. `list()` deliberately includes `failed`, so the daemon
	//   stamps it. `runAdopt()` treats only `dissolved` as a revive, so it
	//   reattaches that record as `bound` through `write()` — not `revive()`. Round
	//   6 then saw a hot descriptor and skipped the drop.
	//
	// THE METHOD LESSON, because it is more reusable than the defect: round 6
	// argued completeness from a DESTINATION SEARCH — every hot-descriptor write
	// goes through `publish`/`revive`/`unarchive`, therefore all are covered. That
	// is true, and it answers the wrong question. Enumerating WRITERS does not
	// enumerate the STATES A WRITER CAN OBSERVE, and the miss was `unarchive()`
	// changing the precondition of a later `publish()`.

	it("P1h: a hot FAILED record left by a public unarchive is not a live incarnation", async () => {
		// THE REGRESSION FOR FIX ROUND 7, driven through the PUBLIC surface in the
		// reviewer's order — `unarchive()` then a bound `write()`, with the daemon
		// tick in between where it really lands. Not a bare unit on the predicate:
		// the whole defect was that a unit-true predicate met a state the unit never
		// considered.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed" }));
		expect(registry.archive("pij-a", NOW_MS + ONE_HOUR_MS * 72)).toBe("archived");

		// The public revive pre-validation action: hot again, still a corpse.
		expect(registry.unarchive("pij-a")).not.toBeNull();
		expect(registry.read("pij-a")?.lifecycle).toBe("failed");

		// The daemon stamps it, because `list()` includes `failed` on purpose.
		heartbeat().write(["pij-a"], FRESH_TICK);
		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);

		// The adoption: a NEW incarnation, written as `bound` through `write()`,
		// never through `revive()`.
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));

		const adopted = registry.read("pij-a");
		expect(adopted?.lifecycle).toBe("bound");
		// No heartbeat write after the adoption — the stopped-daemon case, so only
		// the drop itself can account for the absence.
		expect(adopted?.lastTickAt).toBeUndefined();
		expect(heartbeat().read()["pij-a"]).toBeUndefined();
	});

	it("P1h: a tick written AFTER the new binding is NOT suppressed", async () => {
		// THE CONDITIONAL the reviewer named explicitly, and the direction this
		// predicate could break. The drop must remove a stamp the daemon took of the
		// PREVIOUS incarnation and must not blind the seat afterwards — otherwise
		// the criterion above would pass against a `read()` that had simply stopped
		// overlaying this id.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed" }));
		registry.archive("pij-a", NOW_MS + ONE_HOUR_MS * 72);
		registry.unarchive("pij-a");
		heartbeat().write(["pij-a"], FRESH_TICK);
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();

		const afterBinding = new Date(NOW_MS - 500).toISOString();
		heartbeat().write(["pij-a"], afterBinding);

		expect(registry.read("pij-a")?.lastTickAt).toBe(afterBinding);
	});

	it("P1h: an archived LEGACY record with NO lifecycle still drops — hot-only is load-bearing", async () => {
		// WHY THIS EXISTS: adding the terminal test above made mutant M31
		// (`readHot()` → `read()`) SURVIVE. The terminal test subsumes the hot-only
		// test for an archived `failed` record — both answer "not a live
		// incarnation" — so the archive criterion above stopped being able to see
		// which of the two was doing the work.
		//
		// It is NOT an equivalent mutant, and the distinguishing input is real
		// rather than synthetic: a PRE-LIFECYCLE descriptor has no `lifecycle` field
		// at all, so `isTerminalRecord` answers false for it. Archived, it is a
		// corpse that the terminal test cannot recognise — and `read()` falls
		// through to the archive, so sampling with `read()` would call it a present
		// live incarnation and skip the drop. Only the HOT-ONLY sample is right.
		//
		// The same 588 pre-migration descriptors that made P1e real are the
		// population this covers.
		mkdirSync(join(home, "archive"), { recursive: true });
		writeFileSync(
			join(home, "archive", "pij-a.json"),
			JSON.stringify({ ...descriptor({ id: "pij-a", harness: "claude" }), lifecycle: undefined }),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);
		const registry = newRegistry();
		expect(registry.read("pij-a")?.lifecycle).toBeUndefined(); // present, not terminal

		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));

		expect(registry.read("pij-a")?.lifecycle).toBe("bound");
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
		expect(heartbeat().read()["pij-a"]).toBeUndefined();
	});

	it("P1h ROW 4: live → FAILED keeps its stamp — the parity is not tightened here", async () => {
		// The fourth row of the predicate's table, ASSERTED rather than believed.
		// `AC-13' PARITY` above pins that `read()` does not gate `failed`; this pins
		// that the DROP does not quietly achieve the same tightening from the write
		// side. A live seat that fails keeps the stamp the daemon took of it,
		// because the failing write is the same incarnation, not a new one.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed" }));

		expect(registry.read("pij-a")?.lifecycle).toBe("failed");
		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK);
	});

	it("P1h ROW 2 sub-case: terminal → terminal ALSO drops — a PRICED over-drop", async () => {
		// STATED, NOT HIDDEN. The predicate reads only the PRIOR record's lifecycle,
		// so a write to a corpse that stays a corpse drops a stamp it was arguably
		// entitled to keep.
		//
		// RULED, NOT ASSUMED — by the PM on 2026-08-08, round 7 of this phase, and
		// the ruling survived round 8 with one of its three reasons REMOVED. The
		// over-drop WAS considered and kept, on the two reasons that stand:
		//
		//   · THE FAILURE DIRECTIONS ARE ASYMMETRIC. An over-drop costs one
		//     `unverified` read. An under-drop is a false-fresh lie about a seat the
		//     daemon never ticked, and with a stopped daemon it stands for the whole
		//     staleness grace. Protecting a corpse's stamp buys nothing against that.
		//   · A QUALIFYING CLAUSE WOULD BE AN ENUMERATION AGAIN. `terminal ->
		//     terminal` is a CASE, and this predicate deliberately reads a
		//     TRANSITION rather than a list of cases — which is how round 6's
		//     predicate acquired the hole round 7 closed.
		//
		// THE THIRD REASON WAS FALSIFIED IN ROUND 8 AND IS DELETED RATHER THAN
		// SOFTENED. It claimed the writes that reach this row are all the daemon's
		// own latched transition writes, so the daemon is running by construction and
		// the next 600ms tick repairs it. NOT TRUE IN GENERAL: `executeAgentReport()`
		// admits `failed` and stamps `reportedAt` through `registry.write()` from the
		// PEER's process (`core/agent-peer.ts`), which is a production failed ->
		// failed write with no next-tick repair when the daemon is stopped.
		//
		// So: THE OVER-DROP IS PRICED, NOT REPAIRED. A justification that names a
		// mechanism which does not always apply is worse than one that names none —
		// it invites the reader to check the mechanism and conclude the case is
		// handled. The price is that a failed seat can read `unverified` until a
		// daemon runs again, which is conservative: `bind-failed` sends are refused
		// anyway, so nothing depends on that stamp being fresh.
		//
		// THE REVERSAL PATH IS DOCUMENTED because a decision that cannot be undone
		// deliberately gets undone badly: the other behaviour is one added
		// `&& !isTerminalRecord(descriptor)` on the predicate in `publish()`, and
		// THIS criterion is the one that would change with it. Anyone taking that
		// path is revisiting a ruling, not filling in a blank.
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed" }));
		heartbeat().write(["pij-a"], FRESH_TICK);
		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);

		registry.write(
			descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed", state: "working" }),
		);

		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();

		// A later tick re-stamps — but ONLY IF A DAEMON IS RUNNING. This is a
		// CONDITIONAL proving the drop did not blind the record; it is deliberately
		// NOT labelled a repair, because the round-8 falsification showed a
		// production failed -> failed write that can happen with no daemon at all.
		const nextTick = new Date(NOW_MS - 500).toISOString();
		heartbeat().write(["pij-a"], nextTick);
		expect(registry.read("pij-a")?.lastTickAt).toBe(nextTick);
	});

	// ─── P1i · the ATTACHMENT changed, so the incarnation did ────────────────
	//
	// Round 7 equated NON-TERMINAL with PRESENT. `isTerminalRecord` answers false
	// for a LIFECYCLE-ABSENT record — correctly and deliberately, because an
	// ordinary legacy state update is not a new incarnation and classifying every
	// legacy descriptor as terminal would false-positive on all of them.
	//
	// But a hot legacy record can be RE-ATTACHED. `pij adopt --id` permits an old
	// descriptor whose native id is absent, then writes a new `harnessSessionId`
	// with `lifecycle: "bound"` through `registry.write()`. Prior is neither null
	// nor terminal, so rounds 6 and 7 both keep the stamp, and it becomes a receipt
	// for a binding that did not exist when the tick was taken.
	//
	// `harnessSessionId` is the identity that moves: `applyBinding` defines the
	// binding as `pij-id ↔ harnessSessionId ↔ pane ↔ cwd`. Two earlier identity
	// candidates failed and are recorded so they are not retried — `revivePendingAt`
	// exists on the revive path only, and `pid` is the pane shell's and is identical
	// across a relaunch.
	//
	// REACH: `claimDescriptorIdentity` refuses to move an id between two KNOWN
	// native sessions, so the only attachment change that reaches `publish()` is
	// `undefined → defined`. There is a boundary criterion for that refusal.

	it("P1i: re-adopting a hot LEGACY descriptor to a new native session drops the stamp", async () => {
		// THE REGRESSION FOR FIX ROUND 8. A legacy external descriptor — no
		// `lifecycle`, no `harnessSessionId` — is hot, the daemon stamps it (it has
		// no lifecycle filter), and `pij adopt --id` re-attaches it.
		const registry = newRegistry();
		registry.write(
			descriptor({
				id: "pij-a",
				harness: "claude",
				harnessSessionId: undefined,
				lifecycle: undefined,
			}),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);
		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);

		// The adopt write: a NEW native session, bound, through `write()`.
		registry.write(
			descriptor({
				id: "pij-a",
				harness: "claude",
				harnessSessionId: "claude-new-session",
				lifecycle: "bound",
			}),
		);

		const adopted = registry.read("pij-a");
		expect(adopted?.harnessSessionId).toBe("claude-new-session");
		// No heartbeat write after the adoption — the stopped-daemon case, so only
		// the drop itself can account for the absence.
		expect(adopted?.lastTickAt).toBeUndefined();
		expect(heartbeat().read()["pij-a"]).toBeUndefined();
	});

	it("P1i KEEP: a legacy → legacy state update keeps its stamp — the warned-about false positive", async () => {
		// THE NEGATIVE THE REVIEWER NAMED EXPLICITLY, and the reason the fix is a
		// session-id comparison rather than "treat lifecycle-absent as terminal".
		// `undefined === undefined`, so an ordinary update to a legacy descriptor is
		// the SAME attachment and keeps its stamp. Getting this wrong would have
		// false-positived on every legacy write — the 588-descriptor population.
		const registry = newRegistry();
		registry.write(
			descriptor({
				id: "pij-a",
				harness: "claude",
				harnessSessionId: undefined,
				lifecycle: undefined,
			}),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);

		const latest = registry.read("pij-a");
		if (!latest) throw new Error("fixture: descriptor disappeared");
		registry.write({ ...latest, state: "working" });

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK);
	});

	it("P1i KEEP: an UNCHANGED harnessSessionId keeps its stamp across a bound write", async () => {
		// The steady-state case, and the one that covers the `core/cli.ts` node-truth
		// denorm update: it re-reads `latest` one line above its `writeExact`, so the
		// session id is carried unchanged and the seat must not read stale on every
		// `pij report state`.
		const registry = newRegistry();
		registry.write(
			descriptor({ id: "pij-a", harness: "claude", harnessSessionId: "claude-sid-1" }),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);

		const latest = registry.read("pij-a");
		if (!latest) throw new Error("fixture: descriptor disappeared");
		registry.writeExact({ ...latest, state: "working" });

		expect(registry.read("pij-a")?.lastTickAt).toBe(FRESH_TICK);
		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK);
	});

	it("P1i BOUNDARY: a sid → DIFFERENT sid re-attach is refused upstream, so the drop never sees it", async () => {
		// NOT A DROP CRITERION — a boundary one, and it is here because I wrote the
		// drop criterion first and it FAILED. `claimDescriptorIdentity` refuses to
		// move an id between two known native sessions (`E-AMBIG`, "already owned
		// by"), and the compatibility branch admits only `harnessSessionId ===
		// undefined || === harnessSessionId`.
		//
		// So the ONLY reachable attachment change through `publish()` is
		// `undefined → defined`: the legacy adopt (the P1 above) and the daemon's
		// spawn-bind (the disclosed over-drop below). This pins that, so a later
		// reader does not conclude the conjunct has an untested branch — and so that
		// if the guard is ever relaxed, this criterion fails and says where to look.
		const registry = newRegistry();
		registry.write(
			descriptor({ id: "pij-a", harness: "claude", harnessSessionId: "claude-sid-1" }),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);

		expect(() =>
			registry.write(
				descriptor({ id: "pij-a", harness: "claude", harnessSessionId: "claude-sid-2" }),
			),
		).toThrow(/already owned by claude:claude-sid-1/);

		// The refusal is total: neither the descriptor nor the map moved.
		expect(registry.read("pij-a")?.harnessSessionId).toBe("claude-sid-1");
		expect(heartbeat().read()["pij-a"]).toBe(FRESH_TICK);
	});

	it("P1i DISCLOSED OVER-DROP (CONDITIONAL): a later heartbeat write re-stamps the spawn-bound seat", async () => {
		// NOT IN THE PACKET'S FOUR CASES — I found it checking them. The daemon's
		// spawn-bind (`core/daemon/loop.ts`) calls `applyBinding` on a LIVE `pending`
		// seat, setting `harnessSessionId` for the first time on what is the SAME
		// incarnation. The conjunct drops there.
		//
		// PRICED, NOT REPAIRED. A later heartbeat write ends the inheritance; with no
		// daemon running there is no such write, and the seat reads `unverified`
		// until one runs.
		//
		// A CONDITIONAL, AND THE LABEL IS THE POINT — the same labelling as
		// `AC-13' BOUND (CONDITIONAL)` above. What follows the drop proves the seat is
		// not permanently blinded WHEN a heartbeat write happens. It is NOT evidence
		// that one will.
		//
		// AN EARLIER VERSION OF THIS CRITERION WAS NAMED "…and self-heals" AND SAID
		// A TICK WAS ≤600ms AWAY BY CONSTRUCTION, BECAUSE THE DAEMON PERFORMS THE
		// WRITE. Review falsified it: `Daemon.tick()` writes the heartbeat at its
		// BEGINNING, before it drives and binds, so the bind removes the entry the
		// same tick just wrote — and the next tick is a `setInterval` callback, not a
		// guarantee. The write being inside the daemon says nothing about whether
		// another tick runs.
		const registry = newRegistry();
		registry.write(
			descriptor({
				id: "pij-a",
				harness: "claude",
				harnessSessionId: undefined,
				lifecycle: "pending",
			}),
		);
		heartbeat().write(["pij-a"], FRESH_TICK);

		registry.write(
			descriptor({
				id: "pij-a",
				harness: "claude",
				harnessSessionId: "claude-discovered",
				lifecycle: "bound",
			}),
		);
		expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();

		const nextTick = new Date(NOW_MS - 500).toISOString();
		heartbeat().write(["pij-a"], nextTick);
		expect(registry.read("pij-a")?.lastTickAt).toBe(nextTick);
	});

	// ─── AC-11 · the write law is unaffected ─────────────────────────────────
	it("AC-11: an unrelated uncontested field still merges under the write law", async () => {
		const registry = newRegistry();
		registry.write(descriptor({ id: "pij-a", harness: "claude", role: "coder" }));
		heartbeat().write(["pij-a"], FRESH_TICK);

		const latest = registry.read("pij-a");
		if (!latest) throw new Error("fixture: descriptor disappeared");
		registry.write({ ...latest, state: "working" });

		expect(registry.read("pij-a")).toMatchObject({ role: "coder", state: "working" });
	});

	// ─── a legacy descriptor that still carries its own stamp ────────────────
	it("a pre-migration descriptor's own lastTickAt is honoured until it is rewritten", async () => {
		// Written raw, because `write()` would scrub it — which is exactly the
		// migration story: legacy stamps are read, then dropped on first rewrite.
		writeFileSync(
			join(home, "pij-legacy.json"),
			JSON.stringify(descriptor({ id: "pij-legacy", harness: "claude", lastTickAt: FRESH_TICK })),
		);
		const registry = newRegistry();

		expect(registry.read("pij-legacy")?.lastTickAt).toBe(FRESH_TICK);
	});
});
