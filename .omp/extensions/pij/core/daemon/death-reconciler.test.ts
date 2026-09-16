import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FsRegistry } from "../../adapters/fs-registry.js";
import { detectAnomalies } from "../anomalies.js";
import { planRevive } from "../revive.js";
import { createSpawnExpectation } from "../spawn-expectation.js";
import type { SessionDescriptor } from "../types.js";
import { reconcileDeaths } from "./death-reconciler.js";

const descriptor = (over: Partial<SessionDescriptor> = {}): SessionDescriptor => ({
	id: "pij-child",
	folder: "/repo",
	dataDir: "/tmp/pij-child",
	eventsPath: "/tmp/pij-child/events.ndjson",
	pid: 44,
	startedAt: "2026-07-20T00:00:00.000Z",
	harness: "copilot",
	lifecycle: "bound",
	spawnedBy: "pij-parent",
	...over,
});

describe("death reconciler", () => {
	describe("a notice is only generated if someone is alive to read it", () => {
		// The parent is in the descriptor set and NOT alive, so it is buried by the
		// same sweep that buries its child. Before this, each corpse still produced an
		// obituary addressed to another corpse — which the daemon then pushed forever
		// at a pane id from a tmux server that no longer exists (task #34).
		const reboot = () =>
			reconcileDeaths({
				descriptors: [
					descriptor(),
					descriptor({ id: "pij-parent", pid: 45, spawnedBy: undefined }),
				],
				expectations: [],
				nowIso: "2026-07-20T00:00:02.000Z",
				isAlive: () => false,
			});

		it("withholds the obituary when the recipient died in the same sweep", () => {
			const result = reboot();
			expect(result.notices).toEqual([]);
			expect(result.noticesSuppressed).toBe(1);
		});

		it("still records terminal truth on every descriptor it withheld a notice for", () => {
			// Suppression must drop the ANNOUNCEMENT, never the OBSERVATION — otherwise a
			// reboot would silently erase the fact that these seats ever died.
			const result = reboot();
			expect(result.descriptorUpdates).toHaveLength(2);
			for (const update of result.descriptorUpdates) {
				expect(update.terminal).toMatchObject({ evidence: "pid-missing" });
			}
		});

		// CONTROL. Without this the suppression above is indistinguishable from
		// "notices are never generated", and the ordinary child-dies-under-a-live-parent
		// path — the whole point of death notices — would be silently dead.
		it("DELIVERS the obituary when the recipient is alive", () => {
			const result = reconcileDeaths({
				descriptors: [
					descriptor(),
					descriptor({ id: "pij-parent", pid: 45, spawnedBy: undefined }),
				],
				expectations: [],
				nowIso: "2026-07-20T00:00:02.000Z",
				isAlive: (pid) => pid === 45,
			});
			expect(result.notices).toEqual([expect.objectContaining({ to: "pij-parent" })]);
			expect(result.noticesSuppressed).toBe(0);
		});

		// The array order must not decide the outcome: here the RECIPIENT is listed
		// first and dies later in the same pass. Filtering after both loops is what
		// makes this hold.
		it("withholds it even when the recipient is buried after the subject", () => {
			const result = reconcileDeaths({
				descriptors: [
					descriptor({ id: "pij-parent", pid: 45, spawnedBy: undefined }),
					descriptor(),
				],
				expectations: [],
				nowIso: "2026-07-20T00:00:02.000Z",
				isAlive: () => false,
			});
			expect(result.notices).toEqual([]);
			expect(result.noticesSuppressed).toBe(1);
		});
	});

	it("classifies a missing registered process as unrequested-by-pij and emits one live notice", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor()],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
		});
		expect(result.descriptorUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "pid-missing",
		});
		expect(result.notices).toEqual([
			expect.objectContaining({ to: "pij-parent", historical: false }),
		]);
	});

	it("does not treat a live provider-stuck PID as terminal", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor({ failureReason: "quota" })],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
		});
		expect(result.descriptorUpdates).toEqual([]);
		expect(result.notices).toEqual([]);
	});

	it("reconciles a vanished pre-register expectation once and labels later recreation historical", () => {
		const expectation = createSpawnExpectation({
			spawnId: "s-no-show",
			creatorId: "pij-parent",
			requestedHarness: "pi",
			requestedAt: "2026-07-20T00:00:00.000Z",
			paneId: "%9",
		});
		const first = reconcileDeaths({
			descriptors: [],
			expectations: [expectation],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
			paneExists: () => false,
		});
		expect(first.expectationUpdates[0]?.terminal?.disposition).toBe("unrequested-by-pij");
		expect(first.notices[0]).toMatchObject({ historical: false });
		const restarted = reconcileDeaths({
			descriptors: [],
			expectations: first.expectationUpdates,
			nowIso: "2026-07-20T00:00:03.000Z",
			isAlive: () => false,
			paneExists: () => false,
		});
		expect(restarted.notices).toEqual([]);
	});

	it("records a requested terminal observation and says boot reconciliation when requested", () => {
		const result = reconcileDeaths({
			descriptors: [
				descriptor({
					closeIntent: {
						actor: "pij-parent",
						kind: "in-process-close",
						requestedAt: "2026-07-20T00:00:01.000Z",
					},
				}),
			],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
			historical: true,
		});
		expect(result.descriptorUpdates[0]?.terminal?.disposition).toBe("requested");
		expect(result.notices[0]).toMatchObject({ historical: true });
		expect(result.notices[0]?.text).toContain("historical boot reconciliation");
	});

	// REVERSED BY s095 (AC-6), deliberately, and kept here rather than deleted so
	// the change is visible in the diff.
	//
	// This test used to assert the opposite: that a throwing probe was STAMPED as
	// `disposition: "unavailable"`. The name was honest about the intent — do not
	// guess absence — but the behaviour was not, because stamping is a mutation
	// and the record it wrote was then read by every downstream consumer as
	// terminal truth: anomaly sweeps skipped the seat, `releaseIdentity` refused
	// to re-bind it, and `revive` accepted it. A durable record derived from an
	// observation that never happened is the same defect as a latched wrong
	// answer, wearing better manners.
	//
	// `unknown` now mutates nothing at all — no descriptor write, no notice.
	//
	// NOTE the deliberate asymmetry with the EXPECTATION loop below, which still
	// stamps `unavailable` for a malformed persisted timestamp. That is not a
	// probe that failed; the malformed value IS the evidence, it is durable, and
	// re-reading it will produce the same verdict forever.
	it("makes no mutation at all rather than guessing when the probe throws", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor()],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => {
				throw new Error("permission denied");
			},
		});
		expect(result.descriptorUpdates).toEqual([]);
		expect(result.notices).toEqual([]);
	});

	it("expires an unregistered expectation by parsed epoch without inventing pane evidence", () => {
		const result = reconcileDeaths({
			descriptors: [],
			expectations: [
				{
					spawnId: "s-expired",
					creatorId: "pij-parent",
					requestedHarness: "claude",
					requestedAt: "2026-07-20T00:00:00.000Z",
					// Same instant as 00:00Z; lexical comparison incorrectly treats this as later.
					deadlineAt: "2026-07-20T01:00:00.000+01:00",
				},
			],
			nowIso: "2026-07-20T00:00:01.000Z",
			isAlive: () => true,
		});
		expect(result.expectationUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "expectation-expired",
		});
		expect(result.expectationUpdates[0]?.runtimeHarness).toBeUndefined();
	});

	it.each([
		["requestedAt", { requestedAt: "not-a-time", deadlineAt: "2026-07-20T00:00:01.000Z" }],
		["deadlineAt", { requestedAt: "2026-07-20T00:00:00.000Z", deadlineAt: "not-a-time" }],
	] as const)("terminalizes malformed persisted %s as unavailable", (field, times) => {
		const result = reconcileDeaths({
			descriptors: [],
			expectations: [
				{
					spawnId: `s-malformed-${field}`,
					creatorId: "pij-parent",
					requestedHarness: "pi",
					...times,
				},
			],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
		});
		expect(result.expectationUpdates[0]?.terminal).toMatchObject({
			disposition: "unavailable",
			evidence: "observation-unavailable",
			unavailableReason: expect.stringContaining(field),
		});
	});

	it("keeps pane disappearance distinct from deadline expiry", () => {
		const result = reconcileDeaths({
			descriptors: [],
			expectations: [
				createSpawnExpectation({
					spawnId: "s-pane-vanished",
					creatorId: "pij-parent",
					requestedHarness: "pi",
					requestedAt: "2026-07-20T00:00:00.000Z",
					paneId: "%9",
				}),
			],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
			paneExists: () => false,
		});
		expect(result.expectationUpdates[0]?.terminal?.evidence).toBe("pane-missing");
	});

	it("contains a failure-reason capture throw after PID absence without erasing absence", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor()],
			expectations: [],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => false,
			failureReasonFor: () => {
				throw new Error("capture-pane unavailable");
			},
		});
		expect(result.descriptorUpdates[0]?.terminal).toMatchObject({
			disposition: "unrequested-by-pij",
			evidence: "pid-missing",
		});
		expect(result.descriptorUpdates[0]?.failureReason).toBeUndefined();
	});

	it("suppresses an expectation no-show when any descriptor shares its spawn id", () => {
		const result = reconcileDeaths({
			descriptors: [descriptor({ spawnId: "s-bound", pid: 44 })],
			expectations: [
				createSpawnExpectation({
					spawnId: "s-bound",
					creatorId: "pij-parent",
					requestedHarness: "copilot",
					requestedAt: "2026-07-20T00:00:00.000Z",
					paneId: "%9",
				}),
			],
			nowIso: "2026-07-20T00:00:02.000Z",
			isAlive: () => true,
			paneExists: () => false,
		});
		expect(result.expectationUpdates).toEqual([]);
		expect(result.notices).toEqual([]);
	});
});
// ─────────────────────────────────────────────────────────────────────────────
// s095 — `terminal` is a REVISABLE OBSERVATION, not a latch (pij#142 + pij#155).
//
// READ THIS BEFORE ADDING TO THIS BLOCK. Three rules, each of which exists
// because breaking it produced a red that proved the wrong thing.
//
// 1. ONE CRITERION, ONE CLAIM, ONE NAMED OBSERVABLE THAT CHANGES. Not "the
//    sweep did the right thing" — the specific field, by name.
// 2. NEVER ASSERT THE PRECONDITION. `expect(updates).toHaveLength(1)` followed
//    by the real check is a precondition promoted to evidence: `expect` throws,
//    so the red proves only that something was written and says nothing about
//    WHAT. Splitting a test like that into four still leaves four criteria whose
//    evidence is the precondition. The helpers below exist so the FIRST
//    assertion is always the claim: they return a distinct sentinel
//    reading of the seat AS THE SWEEP LEAVES IT, so a sweep that wrote nothing
//    is a VALUE the claim disagrees with rather than a stack unwind.
// 4. ASK "COULD IT HAVE FAILED", NOT "DID IT". A claim about a mechanism that
//    does not exist pre-fix is not FALSE pre-fix, it is VACUOUS — and its
//    natural home is "behavioural", where it then quietly never reds and nobody
//    can tell "did not fail" from "could not fail". Criteria whose observable is
//    BYTE-IDENTICAL in both worlds are labelled MUTATION-ONLY below, with the
//    named mutant that discharges them.
// 3. NEVER COMPARE THE WHOLE OBJECT. A `toEqual` over a descriptor proves it
//    differs, not that `terminal` and `deathNoticeLatchedAt` are the fields that
//    went. An assertion over a set is not evidence about a member — so where a
//    criterion is about one seat, the assertion names that seat.
//
// Everything here is written against the EXISTING `isAlive` input on purpose: a
// test that needs the new snapshot API cannot run against the unfixed tree at
// all (it fails to COMPILE, which is not an assertion failing), so the
// snapshot-API coverage lives in `death-reconciler.snapshot.test.ts` and is
// declared as the NEW-API exception.

/** ONE named field of a seat AS THE SWEEP LEAVES IT — the update when the sweep
 *  wrote one, otherwise the seat unchanged. That is exactly what the registry
 *  ends up holding, and choosing it over "the update row" is load-bearing:
 *  reading the ROW would make a pre-fix red mean "no row was written", which is
 *  a PRECONDITION, not the claim. Reading the SEAT makes the same red mean "the
 *  field is still there", which is the claim. */
function field(
	seat: SessionDescriptor,
	result: ReturnType<typeof reconcileDeaths>,
	name: "terminal" | "deathNoticeLatchedAt",
): unknown {
	const left = result.descriptorUpdates.find((d) => d.id === seat.id) ?? seat;
	return left[name];
}

/** The ids this sweep WROTE, in sorted order. A set-level claim, used only
 *  where the criterion is genuinely about the set. */
function writtenIds(result: ReturnType<typeof reconcileDeaths>): string[] {
	return result.descriptorUpdates.map((d) => d.id).sort();
}

describe("s095 — terminal is a revisable observation, not a latch", () => {
	const TERMINAL_AT = "2026-08-07T23:14:05.850Z";
	/** One of the 15 seats measured latched on 2026-08-08 (dossier §4). All 15
	 *  share `pid-missing` + `unrequested-by-pij`: every one is a latched
	 *  INFERENCE, never a requested teardown. */
	const latched = (over: Partial<SessionDescriptor> = {}): SessionDescriptor =>
		descriptor({
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: TERMINAL_AT,
				evidence: "pid-missing",
			},
			deathNoticeLatchedAt: TERMINAL_AT,
			...over,
		});

	const sweepWithLiveAgent = (seat: SessionDescriptor) =>
		reconcileDeaths({
			descriptors: [seat],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => true,
		});

	// AC-8a — BEHAVIOURAL. Claim: the `terminal` FIELD is gone. Named.
	it("AC-8a removes the terminal field from a seat whose agent is observed alive", () => {
		const seat = latched();
		expect(field(seat, sweepWithLiveAgent(seat), "terminal")).toBeUndefined();
	});

	// AC-8b — BEHAVIOURAL, and a SEPARATE claim from AC-8a. Clearing `terminal`
	// while leaving `deathNoticeLatchedAt` behind would re-suppress the next real
	// death notice for this seat — silently, and only once it mattered.
	it("AC-8b removes the death-notice latch from that same seat", () => {
		const seat = latched();
		expect(field(seat, sweepWithLiveAgent(seat), "deathNoticeLatchedAt")).toBeUndefined();
	});

	// Transition row 5 — PRESERVED PROPERTY (passes pre-fix via the latch). The
	// counterweight to AC-8: a teardown pij ASKED for records an intent, not an
	// inference, so contrary liveness does not contradict it.
	it("row 5 keeps the terminal field on a pij-REQUESTED close while the process runs", () => {
		const seat = latched({
			closeIntent: { actor: "pij-parent", kind: "cli-close", requestedAt: TERMINAL_AT },
			terminal: { disposition: "requested", observedAt: TERMINAL_AT, evidence: "pid-missing" },
		});
		expect(field(seat, sweepWithLiveAgent(seat), "terminal")).toMatchObject({
			disposition: "requested",
		});
	});

	// AC-6a — BEHAVIOURAL, and a deliberate REVERSAL of the pre-095 contract
	// (see the updated test in the block above). Claim: an unavailable
	// observation writes NO terminal field.
	it("AC-6a leaves no terminal field when the liveness observation is unavailable", () => {
		const seat = descriptor();
		const result = reconcileDeaths({
			descriptors: [seat],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => {
				throw new Error("permission denied");
			},
		});
		expect(field(seat, result, "terminal")).toBeUndefined();
	});

	// ── AC-10: the real 15-seat population (dossier §4/§5) ───────────────────
	//
	// Two of the fifteen — `pij-mental-dajeil` and `pij-related-koala` — had a
	// live `claude` process one level below their registry pid AT THE TIME OF
	// MEASUREMENT. The correct outcome is surgical, so it is claimed in two
	// separate criteria: the set that moved, and a NAMED member that did not.
	const LATCHED_POPULATION = [
		{ id: "pij-zoophagous-firefly", pid: 201 },
		{ id: "pij-tense-centipede", pid: 202 },
		{ id: "pij-reasonable-dove", pid: 203 },
		{ id: "pij-grieving-gibbon", pid: 204 },
		{ id: "pij-wee-albatross", pid: 205 },
		{ id: "pij-unwilling-butterfly", pid: 206 },
		{ id: "pij-able-egret", pid: 207 },
		{ id: "pij-mental-dajeil", pid: 208 }, // ALIVE at measurement
		{ id: "pij-cheap-cheetah", pid: 209 },
		{ id: "pij-unknown-guan", pid: 210 },
		{ id: "pij-related-koala", pid: 211 }, // ALIVE at measurement
		{ id: "pij-able-eel", pid: 212 },
		{ id: "pij-visiting-catshark", pid: 213 },
		{ id: "pij-zygomorphic-bonobo", pid: 214 },
		{ id: "pij-90wkbu", pid: 215 },
	] as const;
	const STILL_RUNNING = new Set([208, 211]);
	const sweepPopulation = () =>
		reconcileDeaths({
			descriptors: LATCHED_POPULATION.map((s) => latched({ id: s.id, pid: s.pid })),
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: (pid) => STILL_RUNNING.has(pid),
		});

	// AC-10a — BEHAVIOURAL. Claim: exactly the two live seats are written.
	it("AC-10a writes exactly the two seats of the 15 whose agent is alive", () => {
		expect(writtenIds(sweepPopulation())).toEqual(["pij-mental-dajeil", "pij-related-koala"]);
	});

	// AC-10b — MUTATION-ONLY, and a MEMBER-level claim, because the set assertion
	// above is not evidence about any individual seat. The butterfly is the seat
	// the whole plan is named after: it is genuinely dead and must STAY stamped
	// and unwritten.
	//
	// NO PRE-FIX RED IS AVAILABLE FOR THIS, in principle. Pre-fix the butterfly is
	// unwritten because it is LATCHED; post-fix it is unwritten because transition
	// row 3 says so. The observable is byte-identical in both worlds and only the
	// REASON differs, so a pre-fix red here would have been an artefact of
	// something else in the test. Discharged by the row-3 mutant (see the
	// execution log), under which all 15 seats are rewritten every tick.
	it("AC-10b does not write the still-dead butterfly at all", () => {
		expect(writtenIds(sweepPopulation())).not.toContain("pij-unwilling-butterfly");
	});

	// AC-10c — BEHAVIOURAL. Claim: the seat that came back had its terminal
	// field REMOVED — distinct from AC-10a, which only proves it was written.
	it("AC-10c removes the terminal field from the named seat that came back", () => {
		const dajeil = latched({ id: "pij-mental-dajeil", pid: 208 });
		expect(field(dajeil, sweepPopulation(), "terminal")).toBeUndefined();
	});

	// ── AC-17: the steady state, across two consecutive ticks ────────────────
	/** Tick 1 buries both seats; tick 2 re-probes them. Returns BOTH, because the
	 *  seat tick 2 is asked about is the one TICK 1 LEFT BEHIND — the stamped
	 *  descriptor, not the pristine input.
	 *
	 *  This distinction is not pedantry: the first version of AC-17d fell back to
	 *  the pristine seat, which never had a `terminal` to begin with, so the
	 *  criterion PASSED PRE-FIX by comparing `undefined` against `undefined` and
	 *  proved nothing at all. A vacuous pass looks exactly like a real one. */
	const twoTicks = (isAliveOnTick2: (pid: number) => boolean) => {
		const tick1 = reconcileDeaths({
			descriptors: [
				descriptor({ id: "pij-still-dead", pid: 51 }),
				descriptor({ id: "pij-came-back", pid: 52 }),
			],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => false,
		});
		const buried = (id: string): SessionDescriptor => {
			const found = tick1.descriptorUpdates.find((d) => d.id === id);
			if (!found) throw new Error(`tick 1 did not bury ${id} — fixture is not set up`);
			return found;
		};
		return {
			buried,
			tick2: reconcileDeaths({
				descriptors: tick1.descriptorUpdates,
				expectations: [],
				nowIso: "2026-08-08T00:00:00.600Z",
				isAlive: isAliveOnTick2,
			}),
		};
	};

	// AC-17a / AC-17b — MUTATION-ONLY. Verified at source on origin/main: the
	// pre-fix loop opens with
	//     if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) continue;
	// so a persistently dead seat on tick 2 produces zero writes and zero notices
	// PRE-FIX TOO. That is byte-for-byte the observable these assert post-fix.
	// A PRE-FIX RED CANNOT EXIST FOR THEM — pre-fix the sweep is silent because
	// it is LATCHED, post-fix because transition row 3 says so; the observable is
	// identical and only the reason differs.
	//
	// They are still worth pinning, because THE FIX IS WHAT ENDANGERS THEM:
	// removing the latch sends every already-dead descriptor down the
	// update+notice path on every 600ms tick unless row 3 is exact. Their sole
	// proof is the named mutant in the execution log — row 3's guard
	// `if (descriptor.terminal !== undefined) continue` deleted — under which
	// AC-17a goes red. Two criteria, not one, because "no writes" and "no
	// notices" fail independently.
	it("AC-17a writes nothing on tick 2 when both seats are still dead", () => {
		expect(twoTicks(() => false).tick2.descriptorUpdates).toEqual([]);
	});

	it("AC-17b notifies nobody on tick 2 when both seats are still dead", () => {
		expect(twoTicks(() => false).tick2.notices).toEqual([]);
	});

	// AC-17c — BEHAVIOURAL. Claim: the seat that came back IS written on tick 2.
	// Pre-fix nothing is written, so this genuinely reds — and it reds on the
	// half of the old conflated criterion that a red can actually carry.
	it("AC-17c writes the returned seat on tick 2", () => {
		expect(writtenIds(twoTicks((pid) => pid === 52).tick2)).toContain("pij-came-back");
	});

	// AC-17f — MUTATION-ONLY, and split out of AC-17c on purpose. "Only the
	// returned seat" is two claims, and this is the half no pre-fix red can
	// carry: the still-dead seat is unwritten in BOTH worlds. Same mutant as
	// AC-17a/b discharges it.
	it("AC-17f does not write the still-dead seat on that same tick", () => {
		expect(writtenIds(twoTicks((pid) => pid === 52).tick2)).not.toContain("pij-still-dead");
	});

	// AC-17d — BEHAVIOURAL, separate claim: that write actually cleared the field.
	it("AC-17d removes the terminal field from the returned seat on tick 2", () => {
		const run = twoTicks((pid) => pid === 52);
		expect(field(run.buried("pij-came-back"), run.tick2, "terminal")).toBeUndefined();
	});

	// AC-17e — MUTATION-ONLY. A returning seat is not an event anyone is told
	// about, because the notice contract is "this seat has exited" and it has
	// not. Pre-fix no notice is emitted either — the seat is simply skipped — so
	// the observable is identical and no pre-fix red is available. Discharged by
	// a row-4 mutant that emits a notice on the clear path.
	it("AC-17e notifies nobody about a seat that came back", () => {
		expect(twoTicks((pid) => pid === 52).tick2.notices).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-18 — TESTED BUT UNREACHED (risk R7). Three instances of this shape shipped
// in the same wave: a fully unit-tested pure function that nothing ever called.
// A green unit suite is evidence about a function, never about a system.
//
// SOURCE-SHAPED, like `core/registry-write-law.test.ts`, and carrying the same
// caveat: a TRIPWIRE, NOT A PROOF. It cannot tell you the snapshot is correct,
// only that the production sweep asks for one. A behavioural test cannot see a
// call site that does not exist yet, and that is the whole failure mode.
describe("AC-18 the liveness probe is reachable from the production call site", () => {
	const DAEMON_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "daemon.ts");

	/** The `reconcileDeaths({ ... })` argument object in `daemon.ts`, sliced by
	 *  brace depth so a `processSnapshot:` anywhere ELSE in the file cannot
	 *  satisfy these claims. Returns a SENTINEL rather than asserting when the
	 *  call is absent — a missing call site is a value the claim disagrees with,
	 *  not a precondition that aborts before the claim is reached. */
	function productionSweepCall(): string {
		const source = readFileSync(DAEMON_SRC, "utf8");
		const start = source.indexOf("reconcileDeaths({");
		if (start < 0) return "<no reconcileDeaths call in daemon.ts>";
		let depth = 0;
		for (let i = source.indexOf("{", start); i < source.length; i++) {
			if (source[i] === "{") depth++;
			else if (source[i] === "}") {
				depth--;
				if (depth === 0) return source.slice(start, i + 1);
			}
		}
		return "<unterminated reconcileDeaths call in daemon.ts>";
	}

	// AC-18a — claim: the production sweep is handed a snapshot, exactly once.
	// ONE assertion carrying presence, count, and location together, because
	// splitting them here would leave the first as a precondition for the rest.
	it("AC-18a hands the production death sweep exactly one process capture", () => {
		const captures = productionSweepCall().match(/processSnapshot:/g) ?? [];
		expect(captures).toHaveLength(1);
	});

	// AC-18b — claim: the whole daemon captures the table once. R2, measured:
	// ~500 descriptors per 600ms tick, so a per-descriptor `ps` is ~500 spawns
	// per tick. The input is a VALUE not a callback, so N descriptors CANNOT
	// produce N captures — the type makes the wrong shape unwritable, and this
	// asserts the other half.
	it("AC-18b asks the port for a process capture exactly once in the whole daemon", () => {
		const source = readFileSync(DAEMON_SRC, "utf8");
		expect(source.match(/processSnapshot\?\.\(\)/g) ?? []).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-19 — the SEAMS a cleared `terminal` opens. Three consumers change
// behaviour the instant the field goes, and all three move in the correct
// direction. Each is asserted through the reconciler's REAL output, and each
// helper returns a verdict VALUE — never a bare `ok` boolean gated behind a
// precondition, which is how a red ends up proving "the descriptor was missing"
// instead of "the consumer changed its mind".
describe("AC-19 clearing terminal re-opens its three downstream seams", () => {
	const TERMINAL_AT = "2026-08-07T23:14:05.850Z";
	const latchedButAlive = (over: Partial<SessionDescriptor> = {}): SessionDescriptor => ({
		id: "pij-came-back",
		folder: "/repo",
		dataDir: "/tmp/pij-came-back",
		eventsPath: "/tmp/pij-came-back/events.ndjson",
		pid: 77,
		startedAt: "2026-08-07T00:00:00.000Z",
		harness: "claude",
		harnessSessionId: "11111111-1111-4111-8111-111111111111",
		lifecycle: "bound",
		terminal: {
			disposition: "unrequested-by-pij",
			observedAt: TERMINAL_AT,
			evidence: "pid-missing",
		},
		deathNoticeLatchedAt: TERMINAL_AT,
		...over,
	});

	/** The seat AS THE SWEEP LEAVES IT: the update when there is one, otherwise
	 *  the seat unchanged. That is exactly what the registry would hold, and it
	 *  means every seam claim below is asked of a real descriptor rather than of
	 *  `null` — a `null` makes the consumer refuse for the WRONG reason and the
	 *  criterion passes vacuously. */
	function afterSweep(seat: SessionDescriptor): SessionDescriptor {
		const result = reconcileDeaths({
			descriptors: [seat],
			expectations: [],
			nowIso: "2026-08-08T00:00:00.000Z",
			isAlive: () => true,
		});
		return result.descriptorUpdates[0] ?? seat;
	}

	// AC-19a — anomaly sweeps. Every sweep in `core/anomalies.ts` opens with
	// `if (isTerminallyObserved(node)) continue`, so a latched seat is invisible
	// to the detectors that would have reported it: the correct rule applied to
	// an incorrect input. Claim: the detector fires.
	it("AC-19a re-enables the spawn-limbo detector that a terminal record suppresses", () => {
		const wedged = latchedButAlive({ lifecycle: "ready" });
		const kinds = detectAnomalies({
			descriptors: [afterSweep(wedged)],
			assignments: [],
			events: [],
			nowMs: Date.parse("2026-08-08T00:00:00.000Z"),
		}).map((a) => a.kind);
		expect(kinds).toContain("spawn-limbo");
	});

	// The control for AC-19a — PRESERVED. Without it, AC-19a is indistinguishable
	// from "this detector always fires".
	it("AC-19a control: the detector is silent while the terminal record stands", () => {
		const kinds = detectAnomalies({
			descriptors: [latchedButAlive({ lifecycle: "ready" })],
			assignments: [],
			events: [],
			nowMs: Date.parse("2026-08-08T00:00:00.000Z"),
		}).map((a) => a.kind);
		expect(kinds).not.toContain("spawn-limbo");
	});

	/** `planRevive`'s verdict as ONE comparable value. Returns the refusal CODE
	 *  and reason rather than a boolean so a refusal for an unrelated reason
	 *  cannot be mistaken for the refusal this criterion is about. */
	function reviveVerdict(seat: SessionDescriptor): string {
		const plan = planRevive(
			seat,
			{
				claudePath: "/home/.claude/projects/repo/11111111-1111-4111-8111-111111111111.jsonl",
				codexPaths: [],
				piPaths: [],
				ompPaths: [],
			},
			{ spawnId: "s-revive" },
		);
		return plan.ok ? "accepted" : `refused: ${plan.message}`;
	}

	// AC-19b — revive REFUSES a seat with no terminal observation, and that
	// refusal is the desirable direction: you should not relaunch a seat whose
	// agent is answering right now. Pre-fix the latch made revive cheerfully
	// agree to duplicate a live session.
	it("AC-19b makes revive refuse a seat whose agent came back, for the right reason", () => {
		expect(reviveVerdict(afterSweep(latchedButAlive()))).toContain("no terminal observation");
	});

	it("AC-19b control: revive ACCEPTS the same seat while its terminal record stands", () => {
		expect(reviveVerdict(latchedButAlive())).toBe("accepted");
	});

	/** Did `releaseIdentity` permit the re-bind? A VALUE, so the claim below can
	 *  disagree with it instead of aborting on a missing descriptor. */
	function reBindPermitted(seat: SessionDescriptor): boolean {
		const home = mkdtempSync(join(tmpdir(), "pij-s095-rebind-"));
		try {
			const registry = new FsRegistry(home);
			registry.write(seat, "close");
			return registry.releaseIdentity(seat.id).ok;
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	}

	// AC-19c — `releaseIdentity` refuses a terminal seat ("its pane is gone, so
	// there is no identity to re-bind"). True of a corpse, false of a seat that
	// is running — and while the latch held, the operator's ONLY recovery verb
	// was blocked on exactly the seats that needed it. Exercised through the real
	// adapter over a temp dir, because the refusal lives inline in that method: a
	// core-only test would assert against a copy of the rule rather than the rule.
	it("AC-19c re-permits re-bind on a seat whose agent came back", () => {
		expect(reBindPermitted(afterSweep(latchedButAlive()))).toBe(true);
	});

	it("AC-19c control: re-bind stays refused while the terminal record stands", () => {
		expect(reBindPermitted(latchedButAlive())).toBe(false);
	});
});
