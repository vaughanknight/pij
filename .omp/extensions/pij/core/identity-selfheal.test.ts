// Identity self-heal — meadowlark defects A/B/C (plan 071 D4, T009-T011).
//
// Grounded in the 2026-07-25 incident: `pij-impressed-antlion` was spawned onto
// pane %2563, never bound, and its own recovery advice told it to `adopt` — which
// minted `pij-armed-shrimp`, stole the native identity, and left the operator
// hand-deleting three files under ~/.pij/identities/.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsRegistry } from "../adapters/fs-registry.js";
import { pendingPaneOccupant, resolveRegisteredAmbientSelf } from "./current-session.js";
import type { SessionDescriptor } from "./types.js";

const PANE = "%2563";
const NATIVE = "90d0bafd-d9b2-4ba1-a255-c859aedfe365";

function descriptor(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 40082,
		startedAt: "2026-07-25T11:00:00.000Z",
		harness: "claude",
		...over,
	};
}

describe("pendingPaneOccupant", () => {
	it("finds the pre-bind descriptor sitting on this pane", () => {
		const antlion = descriptor({ id: "pij-impressed-antlion", paneId: PANE, lifecycle: "pending" });
		expect(pendingPaneOccupant([antlion], PANE)?.id).toBe("pij-impressed-antlion");
		expect(pendingPaneOccupant([{ ...antlion, lifecycle: "ready" }], PANE)?.id).toBe(
			"pij-impressed-antlion",
		);
	});

	// CONTROL: a BOUND seat on the same pane is not an occupant to adopt into —
	// it is already resolvable by the ordinary identity path.
	it("control — a bound descriptor on the same pane is not returned", () => {
		const bound = descriptor({ id: "pij-fine", paneId: PANE, lifecycle: "bound" });
		expect(pendingPaneOccupant([bound], PANE)).toBeUndefined();
	});

	it("returns nothing for another pane, a missing pane, or an ambiguous pair", () => {
		const a = descriptor({ id: "pij-a", paneId: PANE, lifecycle: "pending" });
		const b = descriptor({ id: "pij-b", paneId: PANE, lifecycle: "pending" });
		expect(pendingPaneOccupant([a], "%9999")).toBeUndefined();
		expect(pendingPaneOccupant([a], undefined)).toBeUndefined();
		expect(pendingPaneOccupant([a], "  ")).toBeUndefined();
		// Two pre-bind descriptors on one pane is itself a defect — guessing would
		// paper over it.
		expect(pendingPaneOccupant([a, b], PANE)).toBeUndefined();
	});
});

describe("defect A — whoami's remediation for a spawned-but-pending pane", () => {
	const identity = { harness: "claude", harnessSessionId: NATIVE } as const;

	it("says phonehome, NOT adopt, when a pending descriptor owns this pane", () => {
		const antlion = descriptor({ id: "pij-impressed-antlion", paneId: PANE, lifecycle: "pending" });

		const result = resolveRegisteredAmbientSelf(identity, [antlion], undefined, PANE);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain("pij phonehome");
		expect(result.message).toContain("pij-impressed-antlion");
		expect(result.message).toContain("DUPLICATE");
		// The exact instruction that caused the incident must not appear.
		expect(result.message).not.toContain('pij adopt "$TMUX_PANE"');
	});

	// CONTROL: byte-identical call with NO pending descriptor on the pane — the
	// original adopt advice is still correct there, and must survive.
	it("control — with no pending descriptor for this pane it still says adopt", () => {
		const elsewhere = descriptor({ id: "pij-other", paneId: "%1", lifecycle: "pending" });

		const result = resolveRegisteredAmbientSelf(identity, [elsewhere], undefined, PANE);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain('pij adopt "$TMUX_PANE"');
		expect(result.message).not.toContain("pij phonehome");
	});

	it("control — outside tmux it still says inbox register", () => {
		const result = resolveRegisteredAmbientSelf(identity, [], undefined, undefined);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain("pij inbox register");
	});
});

describe("defect C — releaseIdentity", () => {
	let home: string;
	let registry: FsRegistry;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-ident-"));
		registry = new FsRegistry(home);
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("frees a native-identity claim so ANOTHER id can take it — without teardown", () => {
		// The shrimp: a duplicate that stole the antlion's native identity.
		registry.write(
			descriptor({
				id: "pij-armed-shrimp",
				paneId: PANE,
				lifecycle: "bound",
				harnessSessionId: NATIVE,
			}),
		);
		// While the claim stands, the rightful owner cannot bind — this is the
		// self-inflicted E-AMBIG from the report.
		expect(() =>
			registry.write(
				descriptor({
					id: "pij-impressed-antlion",
					paneId: PANE,
					lifecycle: "bound",
					harnessSessionId: NATIVE,
				}),
			),
		).toThrow(/already mapped to pij-armed-shrimp/);

		const released = registry.releaseIdentity("pij-armed-shrimp");
		expect(released.ok).toBe(true);
		if (!released.ok) return;
		expect(released.value.released).toBe(true);

		// Now the rightful owner binds, with no file touched by hand.
		expect(() =>
			registry.write(
				descriptor({
					id: "pij-impressed-antlion",
					paneId: PANE,
					lifecycle: "bound",
					harnessSessionId: NATIVE,
				}),
			),
		).not.toThrow();
		expect(registry.read("pij-impressed-antlion")?.harnessSessionId).toBe(NATIVE);
	});

	it("is NOT teardown — the released descriptor survives, scrubbed back to pending", () => {
		registry.write(
			descriptor({
				id: "pij-armed-shrimp",
				paneId: PANE,
				lifecycle: "bound",
				harnessSessionId: NATIVE,
			}),
		);

		registry.releaseIdentity("pij-armed-shrimp");

		const after = registry.read("pij-armed-shrimp");
		expect(after).not.toBeNull();
		expect(after?.paneId).toBe(PANE); // pane still owned — no suicide
		expect(after?.lifecycle).toBe("pending");
		expect(after?.harnessSessionId).toBeUndefined();
	});

	it("reports honestly when there was no claim to release", () => {
		registry.write(descriptor({ id: "pij-unclaimed", paneId: PANE, lifecycle: "pending" }));
		const released = registry.releaseIdentity("pij-unclaimed");
		expect(released.ok).toBe(true);
		if (!released.ok) return;
		expect(released.value.released).toBe(false);
		expect(released.value.removedPaths).toEqual([]);
	});

	it("never unlinks an identity record belonging to a DIFFERENT id", () => {
		registry.write(
			descriptor({
				id: "pij-rightful",
				paneId: "%1",
				lifecycle: "bound",
				harnessSessionId: NATIVE,
			}),
		);
		// An impostor descriptor naming the same native id, whose claim it does not own.
		registry.write(descriptor({ id: "pij-impostor", paneId: PANE, lifecycle: "pending" }));

		registry.releaseIdentity("pij-impostor");

		expect(registry.resolveIdentity("claude", NATIVE)).toMatchObject({
			ok: true,
			value: "pij-rightful",
		});
	});
});

// ── Review round 1 §1.1 / §2.3 — releaseIdentity is a RECOVERY verb and must not
// create damage of its own.
describe("releaseIdentity refuses to resurrect a tombstone", () => {
	let home: string;
	let registry: FsRegistry;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-release-"));
		registry = new FsRegistry(home);
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	function seated(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
		return descriptor({ id: "pij-zombie", paneId: PANE, harnessSessionId: NATIVE, ...over });
	}

	// The reproduced defect: release on a dissolved seat wrote `lifecycle: pending`
	// through `writeAtomic`, bypassing the tombstone guard, while LEAVING `terminal`
	// in place. Nothing can then resolve the row — reconcileDeaths skips
	// `terminal !== undefined`, the watchdog's eligible() excludes `pending` — and it
	// is back in list(). An unreconcilable zombie, made by a recovery verb.
	it("refuses on a DISSOLVED record instead of resurrecting it as pending", () => {
		registry.write(seated({ lifecycle: "bound" }));
		registry.dissolve("pij-zombie");

		const released = registry.releaseIdentity("pij-zombie");

		expect(released.ok).toBe(false);
		if (released.ok) return;
		expect(released.message).toContain("dissolved");
		expect(registry.read("pij-zombie")?.lifecycle).toBe("dissolved");
		expect(registry.list().map((d) => d.id)).not.toContain("pij-zombie");
	});

	it("refuses on a record carrying terminal evidence", () => {
		registry.write(
			seated({
				lifecycle: "bound",
				terminal: {
					disposition: "requested",
					observedAt: "2026-07-25T11:00:00.000Z",
					evidence: "pane-missing",
				},
			}),
		);

		const released = registry.releaseIdentity("pij-zombie");

		expect(released.ok).toBe(false);
		if (released.ok) return;
		expect(released.message).toContain("terminal");
		expect(registry.read("pij-zombie")?.terminal).toBeDefined();
	});

	it("refuses on a record that is mid-close", () => {
		registry.write(
			seated({
				lifecycle: "bound",
				closeIntent: {
					actor: "pij-boss",
					kind: "once-close",
					requestedAt: "2026-07-25T11:00:00.000Z",
				},
			}),
		);

		expect(registry.releaseIdentity("pij-zombie").ok).toBe(false);
	});

	// CONTROL: a LIVE bound seat — the case the verb actually exists for — still
	// releases. Without this the refusals above could be a verb that never works.
	it("control — a live bound seat still releases normally", () => {
		registry.write(seated({ lifecycle: "bound" }));

		const released = registry.releaseIdentity("pij-zombie");

		expect(released.ok).toBe(true);
		if (!released.ok) return;
		expect(released.value.released).toBe(true);
		expect(registry.read("pij-zombie")?.harnessSessionId).toBeUndefined();
	});

	// §1.1 — the RMW window itself. Two `rmSync` unlinks sit between the read and
	// the write, which is the widest window in the registry. The refusal above stops
	// the terminal cases, but a LIVE seat still goes through that window, so the
	// write must go through the law rather than `writeAtomic`.
	it("does not replay its pre-read snapshot over a field stamped mid-window", () => {
		registry.write(seated({ lifecycle: "bound" }));

		// Simulate a concurrent CLI verb landing between releaseIdentity's read and
		// its write — precisely what the two unlinks make possible.
		const realRead = registry.read.bind(registry);
		let stamped = false;
		registry.read = (id: string) => {
			const record = realRead(id);
			if (!stamped && record) {
				stamped = true;
				new FsRegistry(home).write({ ...record, currentAssignment: "asg-live" }, "cli");
			}
			return record;
		};

		const released = registry.releaseIdentity("pij-zombie");
		expect(released.ok).toBe(true);

		// Written through the law, the concurrent stamp survives. Through
		// `writeAtomic` it is silently replayed away.
		expect(new FsRegistry(home).read("pij-zombie")?.currentAssignment).toBe("asg-live");
	});

	// §2.3 — the CLI gate uses read() (both tiers) while this used readHot(), so an
	// archived id unlinked both identity records, left the archived descriptor still
	// claiming its harnessSessionId, and reported success.
	it("sees an ARCHIVED record rather than reporting a dishonest success", () => {
		registry.write(seated({ lifecycle: "failed" }));
		registry.archive("pij-zombie", Date.now());

		const released = registry.releaseIdentity("pij-zombie");

		// Either it releases honestly, or it refuses — what it must NOT do is claim
		// success while leaving the descriptor still claiming the identity.
		if (released.ok && released.value.released) {
			expect(registry.read("pij-zombie")?.harnessSessionId).toBeUndefined();
		} else {
			expect(registry.read("pij-zombie")?.harnessSessionId).toBe(NATIVE);
		}
	});
});
