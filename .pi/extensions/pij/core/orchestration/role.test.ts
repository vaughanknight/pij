import { describe, expect, it } from "vitest";
import { FakePlatformWriteLock, FakeRegistry, FakeSpineLog } from "../../adapters/fakes.js";
import { parseArgs } from "../cli.js";
import type { DescriptorWriter } from "../registry-write.js";
import { err, ok, type Result, type SessionDescriptor } from "../types.js";
import { parseOrchestrationArgs } from "./cli.js";
import {
	cardCanMislead,
	DesignationAuditService,
	hasRoleConflict,
	isStoredOrchestrationRole,
	owesStatusCard,
	paLineageRefusal,
	projectOrchestrationRole,
	RoleService,
	STORED_ORCHESTRATION_ROLES,
	STORED_ROLE_CHOICES,
} from "./role.js";

const NOW = Date.parse("2026-07-29T00:00:00.000Z");

function descriptor(id: string, over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id,
		folder: "/repo",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-07-11T00:00:00.000Z",
		state: "working",
		...over,
	};
}

class CountingRegistry extends FakeRegistry {
	writes = 0;

	override write(value: SessionDescriptor, writer?: DescriptorWriter): void {
		this.writes += 1;
		super.write(value, writer);
	}
}

describe("projectOrchestrationRole (AC-02 — store partial, project total)", () => {
	it.each([
		[
			"prime outranks a conflicting stored PM role",
			{ prime: true, orchestrationRole: "pm" },
			"prime",
		],
		["stored PM passes through", { orchestrationRole: "pm" }, "pm"],
		["stored worker passes through", { orchestrationRole: "worker" }, "worker"],
		["absence projects explicit null", {}, null],
	] as const)("%s", (_name, over, expected) => {
		expect(projectOrchestrationRole(descriptor("pij-a", over))).toBe(expected);
	});
});

describe("hasRoleConflict", () => {
	it.each([
		[{ prime: true, orchestrationRole: "pm" }, true],
		[{ prime: true, orchestrationRole: "worker" }, true],
		[{ prime: true }, false],
		[{ orchestrationRole: "pm" }, false],
		[{}, false],
	] as const)("projects %j as conflict=%s", (over, expected) => {
		expect(hasRoleConflict(descriptor("pij-a", over))).toBe(expected);
	});
});

describe("RoleService", () => {
	it("sets a stored role through the CLI write law and preserves unrelated fields", () => {
		const registry = new CountingRegistry([
			descriptor("pij-a", {
				parentId: "pij-parent",
				prime: false,
				boundModel: "gpt-5.6-sol",
			}),
		]);
		const result = new RoleService(registry).set("pij-a", "pm");
		expect(result).toEqual({
			ok: true,
			value: {
				id: "pij-a",
				previousRole: undefined,
				role: "pm",
				changed: true,
			},
		});
		expect(registry.read("pij-a")).toMatchObject({
			orchestrationRole: "pm",
			parentId: "pij-parent",
			prime: false,
			boundModel: "gpt-5.6-sol",
		});
		expect(registry.writes).toBe(1);
	});

	it("unsets the role, reports the previous word, and omits the next role", () => {
		const registry = new CountingRegistry([descriptor("pij-a", { orchestrationRole: "worker" })]);
		const result = new RoleService(registry).unset("pij-a");
		expect(result).toEqual({
			ok: true,
			value: {
				id: "pij-a",
				previousRole: "worker",
				role: undefined,
				changed: true,
			},
		});
		expect(registry.read("pij-a")?.orchestrationRole).toBeUndefined();
		expect(registry.writes).toBe(1);
	});

	it("does not write an unchanged designation", () => {
		const registry = new CountingRegistry([descriptor("pij-a", { orchestrationRole: "pm" })]);
		expect(new RoleService(registry).set("pij-a", "pm")).toMatchObject({
			ok: true,
			value: { previousRole: "pm", role: "pm", changed: false },
		});
		expect(registry.writes).toBe(0);
	});

	it.each(["set", "unset"] as const)("%s returns E-NOID without writing", (verb) => {
		const registry = new CountingRegistry();
		const service = new RoleService(registry);
		const result = verb === "set" ? service.set("missing", "pm") : service.unset("missing");
		expect(result).toMatchObject({ ok: false, code: "E-NOID" });
		expect(registry.writes).toBe(0);
	});
});

describe("DesignationAuditService", () => {
	it("recovers and appends under the platform write lock with role words in prev/next", () => {
		const spineLog = new FakeSpineLog();
		const lock = new FakePlatformWriteLock();
		let recovered = 0;
		const service = new DesignationAuditService({
			spineLog,
			platformWriteLock: lock,
			recover: () => {
				recovered += 1;
				return ok(undefined);
			},
			now: () => NOW,
			actor: "pij-prime",
		});

		expect(
			service.append({
				kind: "role-set",
				id: "pij-worker",
				prev: "worker",
				next: "pm",
			}),
		).toMatchObject({ ok: true, value: 1 });
		expect(recovered).toBe(1);
		expect(lock.acquisitions).toBe(1);
		expect(spineLog.read()).toEqual([
			expect.objectContaining({
				kind: "role-set",
				actor: "pij-prime",
				peer: "pij-worker",
				refs: ["node:pij-worker"],
				prev: "worker",
				next: "pm",
			}),
		]);
	});

	it("omits next for an unset and refuses to append past a failed recovery", () => {
		const spineLog = new FakeSpineLog();
		const service = new DesignationAuditService({
			spineLog,
			platformWriteLock: new FakePlatformWriteLock(),
			recover: () => err("E-NOREG", "pending platform write"),
			now: () => NOW,
			actor: "pij-prime",
		});
		const result: Result<number> = service.append({
			kind: "role-set",
			id: "pij-worker",
			prev: "pm",
		});
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(spineLog.read()).toEqual([]);
	});
});

describe("owesStatusCard vs cardCanMislead — two questions, not one", () => {
	// Jordan's ruling 2026-07-30: primes do not carry status cards. The predicates
	// are deliberately ASYMMETRIC because the consumer of a rendered card cannot
	// tell who was obliged to write it — a rotten card misinforms identically.
	// SPEC, not a pin: this asserts the CURRENT ruling and names it, because the
	// previous version of this test asserted `prime -> false` and was not wrong
	// about the code — it was WRONG ABOUT THE WORLD, pinning a rule the human had
	// overturned, so updating it looked like breaking something.
	it("PM and PRIME owe a card (government/rulings/2026-07-31-primes-owe-status-cards.md)", () => {
		expect(owesStatusCard(descriptor("pij-pm", { orchestrationRole: "pm" }))).toBe(true);
		// Reversed 2026-07-31; the 2026-07-30 position was `false`.
		expect(owesStatusCard(descriptor("pij-prime", { prime: true }))).toBe(true);
		expect(owesStatusCard(descriptor("pij-worker", { orchestrationRole: "worker" }))).toBe(false);
		// A PA assists a prime; it does not report, so it owes nothing.
		expect(owesStatusCard(descriptor("pij-pa", { orchestrationRole: "pa" }))).toBe(false);
		expect(owesStatusCard(descriptor("pij-plain"))).toBe(false);
	});

	it("ANY rendered seat holding a card can mislead with it — prime included", () => {
		const card = { statusAt: "2026-07-29T00:00:00.000Z" };
		expect(cardCanMislead(descriptor("pij-prime", { prime: true, ...card }))).toBe(true);
		expect(cardCanMislead(descriptor("pij-pm", { orchestrationRole: "pm", ...card }))).toBe(true);
	});

	it("no card means nothing renders, so nothing can mislead", () => {
		expect(cardCanMislead(descriptor("pij-prime", { prime: true }))).toBe(false);
		expect(cardCanMislead(descriptor("pij-pm", { orchestrationRole: "pm" }))).toBe(false);
	});

	it("a worker's card renders nowhere, so it never misleads even when held", () => {
		const held = { orchestrationRole: "worker" as const, statusAt: "2026-07-29T00:00:00.000Z" };
		expect(cardCanMislead(descriptor("pij-worker", held))).toBe(false);
	});

	it("the predicates genuinely disagree — a PA holding a card owes nothing yet is not chased", () => {
		// If this ever passes with both sides equal, the split has been collapsed
		// back into one role test and the ruling has been silently re-broken.
		//
		// THE EXAMPLE MOVED, THE SPLIT DID NOT. This case used to be a PRIME —
		// owes nothing, can mislead — and Jordan's 2026-07-31 reversal made a
		// prime agree on both sides, which reads like the split dissolving. It
		// did not: `pa` is the live disagreeing case now, and there are three of
		// them carrying a statusAt. A demonstration that depends on one role's
		// current ruling is a demonstration with an expiry date.
		const paWithCard = descriptor("pij-aide", {
			orchestrationRole: "pa",
			statusAt: "2026-07-29T00:00:00.000Z",
		});
		expect(owesStatusCard(paWithCard)).toBe(false);
		expect(cardCanMislead(paWithCard)).toBe(false);
		// And the prime now agrees on BOTH sides — recorded so the next reader
		// does not mistake agreement here for the split having been removed.
		const primeWithCard = descriptor("pij-prime", {
			prime: true,
			statusAt: "2026-07-29T00:00:00.000Z",
		});
		expect(owesStatusCard(primeWithCard)).toBe(true);
		expect(cardCanMislead(primeWithCard)).toBe(true);
	});
});

/** The vocabulary is only real where an ARGUMENT is admitted.
 *
 * `StoredOrchestrationRole` gained `pa` and every compiled invariant agreed —
 * while `pij link --role pa` and `pij orchestration role set pa` both returned
 * E-ARG, because a guard written as `role !== "pm" && role !== "worker"`
 * compares a `string` and so widening the union changes NOTHING it checks. The
 * type test passed on a vocabulary no parser would accept.
 *
 * So these iterate the vocabulary rather than naming members: a role added to
 * `STORED_ORCHESTRATION_ROLES` and not admitted by a parser fails here, and the
 * failure names the parser.
 */
describe("stored role vocabulary is admitted by every parser", () => {
	it("has a guard that agrees with the array, in both directions", () => {
		for (const role of STORED_ORCHESTRATION_ROLES) {
			expect(isStoredOrchestrationRole(role)).toBe(true);
		}
		for (const notARole of ["prime", "", "PM", "assistant", "pa ", undefined, null, 7]) {
			expect(isStoredOrchestrationRole(notARole)).toBe(false);
		}
	});

	it("names every member in the choices string used by usage and error text", () => {
		for (const role of STORED_ORCHESTRATION_ROLES) {
			expect(STORED_ROLE_CHOICES.split("|")).toContain(role);
		}
	});

	it("accepts every member at pij link --role", () => {
		expect(STORED_ORCHESTRATION_ROLES.length).toBeGreaterThan(0);
		for (const role of STORED_ORCHESTRATION_ROLES) {
			const parsed = parseArgs(["link", "child-seat", "--parent", "parent-seat", "--role", role]);
			expect(parsed.ok, `pij link --role ${role} was refused`).toBe(true);
			if (parsed.ok) {
				expect(parsed.value.verb).toBe("link");
				expect((parsed.value as { role?: string }).role).toBe(role);
			}
		}
	});

	it("accepts every member at pij orchestration role set", () => {
		for (const role of STORED_ORCHESTRATION_ROLES) {
			const parsed = parseOrchestrationArgs(["role", "set", "some-seat", role]);
			expect(parsed.ok, `pij orchestration role set ${role} was refused`).toBe(true);
			if (parsed.ok && parsed.command.primitive === "role") {
				expect(parsed.command.role).toBe(role);
			}
		}
	});

	it("still refuses a non-member at both parsers, quoting the full vocabulary", () => {
		const link = parseArgs(["link", "child-seat", "--parent", "p", "--role", "regent"]);
		expect(link.ok).toBe(false);
		if (!link.ok) expect(link.message).toContain(STORED_ROLE_CHOICES);
		const orch = parseOrchestrationArgs(["role", "set", "some-seat", "regent"]);
		expect(orch.ok).toBe(false);
		if (!orch.ok) expect(orch.message).toContain(STORED_ROLE_CHOICES);
	});
});

/** A pa is defined relative to a prime, so a pa with no parent has no referent.
 *
 * Three routes reach the identical floating card and each has its own door:
 * stamp `pa` on an unadopted seat, `--root` a seat that already IS a `pa`, or
 * do both at once. A guard on the role write alone would close the first and
 * leave the second wide open, which is the "gate you can tick" shape.
 */
describe("paLineageRefusal — a pa is never left without a prime", () => {
	it("permits every non-pa role without a parent, and pa WITH one", () => {
		expect(paLineageRefusal("pm", null, "pij-a")).toBeNull();
		expect(paLineageRefusal("worker", null, "pij-a")).toBeNull();
		expect(paLineageRefusal(undefined, null, "pij-a")).toBeNull();
		expect(paLineageRefusal("pa", "pij-prime", "pij-a")).toBeNull();
	});

	it("refuses a parentless pa and names the remedy with the seat id", () => {
		const refusal = paLineageRefusal("pa", null, "pij-a");
		expect(refusal).not.toBeNull();
		expect(refusal).toContain("pij link pij-a --parent <prime> --role pa");
	});

	it("refuses at the role-write seam: pa onto an unadopted seat", () => {
		const registry = new CountingRegistry([descriptor("pij-a", {})]);
		const result = new RoleService(registry).set("pij-a", "pa");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("E-ARG");
		expect(registry.writes, "a refusal must mutate nothing").toBe(0);
		expect(registry.read("pij-a")?.orchestrationRole).toBeUndefined();
	});

	it("permits pa onto an adopted seat, by parentId or by spawnedBy", () => {
		for (const over of [{ parentId: "pij-prime" }, { spawnedBy: "pij-prime" }]) {
			const registry = new CountingRegistry([descriptor("pij-a", over)]);
			const result = new RoleService(registry).set("pij-a", "pa");
			expect(result.ok, `pa refused for ${JSON.stringify(over)}`).toBe(true);
			expect(registry.read("pij-a")?.orchestrationRole).toBe("pa");
		}
	});

	it("still lets a pa be unset or re-roled while parentless, so a seat is never stuck", () => {
		const registry = new CountingRegistry([
			descriptor("pij-a", { orchestrationRole: "pa", parentId: undefined }),
		]);
		expect(new RoleService(registry).unset("pij-a").ok).toBe(true);
		const reroll = new CountingRegistry([descriptor("pij-b", { orchestrationRole: "pa" })]);
		expect(new RoleService(reroll).set("pij-b", "worker").ok).toBe(true);
	});
});
