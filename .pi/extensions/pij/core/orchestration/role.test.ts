import { describe, expect, it } from "vitest";
import { FakePlatformWriteLock, FakeRegistry, FakeSpineLog } from "../../adapters/fakes.js";
import type { DescriptorWriter } from "../registry-write.js";
import { err, ok, type Result, type SessionDescriptor } from "../types.js";
import {
	DesignationAuditService,
	hasRoleConflict,
	projectOrchestrationRole,
	RoleService,
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
