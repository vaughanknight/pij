import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	FakeAssignmentStore,
	FakeDelivery,
	FakeEventLog,
	FakeOpJournal,
	FakePlatformWriteLock,
	FakeProcess,
	FakeProjectStore,
	FakeRegistry,
	FakeSpineLog,
} from "../../adapters/fakes.js";
import type { CliDeps, CliResult } from "../cli.js";
import { dispatch, parseArgs } from "../cli.js";
import type { AllocationStorePort, DispatchStorePort, FenceStorePort } from "../platform/ports.js";
import {
	type Allocation,
	type Dispatch,
	type Fence,
	SPINE_KIND_PRIME_SET,
	SPINE_KIND_ROLE_SET,
} from "../platform/types.js";
import { ok, type Result, type SessionDescriptor } from "../types.js";

const NOW = Date.parse("2026-07-29T00:00:00.000Z");

function descriptor(id: string, over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id,
		folder: "/repo",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: new Date(NOW - 2_000).toISOString(),
		state: "idle",
		lastEventAt: new Date(NOW - 2_000).toISOString(),
		...over,
	};
}

class EmptyAllocationStore implements AllocationStorePort {
	write(): Result<void> {
		return ok(undefined);
	}
	read(): Allocation | null {
		return null;
	}
	list(): Allocation[] {
		return [];
	}
}

class EmptyFenceStore implements FenceStorePort {
	write(): Result<void> {
		return ok(undefined);
	}
	read(): Fence | null {
		return null;
	}
	list(): Fence[] {
		return [];
	}
}

class EmptyDispatchStore implements DispatchStorePort {
	write(): Result<void> {
		return ok(undefined);
	}
	read(): Dispatch | null {
		return null;
	}
	list(): Dispatch[] {
		return [];
	}
}

function deps(descriptors: SessionDescriptor[]): CliDeps & {
	readonly registry: FakeRegistry;
	readonly spineLog: FakeSpineLog;
	readonly platformWriteLock: FakePlatformWriteLock;
} {
	const registry = new FakeRegistry(descriptors);
	const platformWriteLock = new FakePlatformWriteLock();
	return {
		registry,
		treeDescriptors: descriptors,
		eventLogFor: () => new FakeEventLog(),
		delivery: new FakeDelivery(),
		process: new FakeProcess(999, NOW, { PIJ_SESSION_ID: "pij-self" }, [100]),
		cwd: "/repo",
		pijHome: "/home/.pij",
		projectStore: new FakeProjectStore(),
		assignmentStore: new FakeAssignmentStore(),
		allocationStore: new EmptyAllocationStore(),
		fenceStore: new EmptyFenceStore(),
		dispatchStore: new EmptyDispatchStore(),
		spineLog: new FakeSpineLog(),
		opJournal: new FakeOpJournal(),
		platformWriteLock,
	};
}

function run(argv: readonly string[], d: CliDeps): CliResult {
	const parsed = parseArgs(argv);
	if (!parsed.ok) {
		return {
			stdout: "",
			stderr: `${parsed.code}: ${parsed.message}`,
			exitCode: parsed.code === "E-ARG" ? 64 : 2,
		};
	}
	return dispatch(parsed.value, d);
}

describe("orchestration role control-plane projections", () => {
	it("projects the total union on list, tree, and node show with the key always present", () => {
		const descriptors = [
			descriptor("pij-prime", { prime: true }),
			descriptor("pij-pm", { orchestrationRole: "pm" }),
			descriptor("pij-worker", { orchestrationRole: "worker" }),
			descriptor("pij-unknown"),
		];
		const d = deps(descriptors);

		const list = JSON.parse(run(["list", "--json"], d).stdout) as Array<{
			id: string;
			orchestrationRole: string | null;
		}>;
		expect(Object.fromEntries(list.map((row) => [row.id, row.orchestrationRole]))).toEqual({
			"pij-prime": "prime",
			"pij-pm": "pm",
			"pij-worker": "worker",
			"pij-unknown": null,
		});

		const tree = JSON.parse(run(["tree", "--global", "--json"], d).stdout) as {
			roots: Array<{ id: string; orchestrationRole: string | null }>;
		};
		const treeRoles = Object.fromEntries(
			tree.roots.map((node) => [node.id, node.orchestrationRole]),
		);
		expect(treeRoles["pij-prime"]).toBe("prime");
		expect(treeRoles["pij-unknown"]).toBeNull();

		const pmCard = JSON.parse(run(["node", "show", "pij-pm", "--json"], d).stdout) as {
			orchestrationRole: string | null;
		};
		expect(pmCard.orchestrationRole).toBe("pm");
		const primeCard = JSON.parse(run(["node", "show", "pij-prime", "--json"], d).stdout) as {
			orchestrationRole: string | null;
		};
		expect(primeCard.orchestrationRole).toBe("prime");
		const unknownCard = JSON.parse(run(["node", "show", "pij-unknown", "--json"], d).stdout) as {
			orchestrationRole: string | null;
		};
		expect(unknownCard).toHaveProperty("orchestrationRole");
		expect(unknownCard.orchestrationRole).toBeNull();
	});

	it("re-stamps a prime tree node over the raw spread instead of leaking stored absence", () => {
		const d = deps([descriptor("pij-prime", { prime: true, orchestrationRole: undefined })]);
		const tree = JSON.parse(run(["tree", "--global", "--json"], d).stdout) as {
			roots: Array<{ orchestrationRole: string | null }>;
		};
		expect(tree.roots[0]?.orchestrationRole).toBe("prime");
	});

	it("renders M for PM, keeps workers and undesignated seats blank, and preserves P/O precedence", () => {
		const d = deps([
			descriptor("pij-prime", { prime: true, orchestrationRole: "pm" }),
			descriptor("pij-old", { oldPrime: true, orchestrationRole: "pm" }),
			descriptor("pij-pm", { orchestrationRole: "pm" }),
			descriptor("pij-worker", { orchestrationRole: "worker" }),
			descriptor("pij-unknown"),
		]);
		const lines = run(["list"], d).stdout.split("\n");
		expect(lines.find((line) => line.includes("pij-prime"))).toMatch(/pij-prime\s+P\s/);
		expect(lines.find((line) => line.includes("pij-old"))).toMatch(/pij-old\s+O\s/);
		expect(lines.find((line) => line.includes("pij-pm"))).toMatch(/pij-pm\s+M\s/);
		expect(lines.find((line) => line.includes("pij-worker"))).toMatch(/pij-worker\s+\s/);
		expect(lines.find((line) => line.includes("pij-unknown"))).toMatch(/pij-unknown\s+\s/);
	});

	it("surfaces role-conflict through the anomalies verb", () => {
		const d = deps([
			descriptor("pij-conflict", { prime: true, orchestrationRole: "pm" }),
			descriptor("pij-clean", { orchestrationRole: "pm" }),
		]);
		const anomalies = JSON.parse(run(["anomalies", "--json"], d).stdout) as Array<{
			kind: string;
			nodeId: string;
		}>;
		expect(anomalies.filter((anomaly) => anomaly.kind === "role-conflict")).toEqual([
			expect.objectContaining({ nodeId: "pij-conflict" }),
		]);
	});
});

describe("pij link --role", () => {
	it("adopts and designates through RoleService in one call, appending role-set on change", () => {
		const descriptors = [
			descriptor("pij-parent"),
			descriptor("pij-child", { spawnedBy: "pij-old-owner" }),
		];
		const d = deps(descriptors);
		const result = run(
			["link", "pij-child", "--parent", "pij-parent", "--role", "pm", "--json"],
			d,
		);
		expect(result.exitCode).toBe(0);
		expect(d.registry.read("pij-child")).toMatchObject({
			parentId: "pij-parent",
			orchestrationRole: "pm",
		});
		const events = d.spineLog.read({ peer: "pij-child" });
		expect(events.map((event) => event.kind)).toEqual(["node-linked", "role-set"]);
		expect(events[1]).toMatchObject({
			kind: SPINE_KIND_ROLE_SET,
			next: "pm",
			actor: "pij-self",
		});
		expect(JSON.parse(result.stdout)).toMatchObject({
			id: "pij-child",
			parentId: "pij-parent",
			role: "pm",
			roleChanged: true,
			roleSpineSeq: events[1]?.seq,
		});
		expect(d.platformWriteLock.acquisitions).toBe(1);
	});

	it("rejects a bad --role value before any descriptor or spine write", () => {
		const descriptors = [
			descriptor("pij-parent"),
			descriptor("pij-child", { spawnedBy: "pij-old-owner" }),
		];
		const d = deps(descriptors);
		const before = structuredClone(d.registry.read("pij-child"));
		const result = run(["link", "pij-child", "--parent", "pij-parent", "--role", "manager"], d);
		expect(result.exitCode).toBe(64);
		expect(result.stderr).toContain("pm|worker");
		expect(d.registry.read("pij-child")).toEqual(before);
		expect(d.spineLog.read()).toEqual([]);
	});

	it("keeps RoleService as the only link designation writer", () => {
		const source = readFileSync(new URL("../cli.ts", import.meta.url), "utf8");
		expect(source).toContain("new RoleService(deps.registry).set(cmd.childId, cmd.role)");
		expect(source).not.toMatch(/registry\.write\([^)]*orchestrationRole/);
	});
});

describe("designation spine vocabulary", () => {
	it("pins both emitted kind constants", () => {
		expect(SPINE_KIND_ROLE_SET).toBe("role-set");
		expect(SPINE_KIND_PRIME_SET).toBe("prime-set");
	});
});

describe("a pa is never left without a prime (both doors)", () => {
	it("refuses stamping pa on an unadopted seat, and writes nothing", () => {
		const d = deps([descriptor("pij-prime", { prime: true }), descriptor("pij-aide")]);
		const res = run(["link", "pij-aide", "--root", "--role", "pa", "--actor", "test"], d);
		expect(res.exitCode).not.toBe(0);
		expect(res.stderr).toContain("--parent <prime> --role pa");
		expect(d.registry.read("pij-aide")?.orchestrationRole).toBeUndefined();
	});

	it("refuses ROOTING an existing pa — the door a role-write guard cannot see", () => {
		const d = deps([
			descriptor("pij-prime", { prime: true }),
			descriptor("pij-aide", { orchestrationRole: "pa", parentId: "pij-prime" }),
		]);
		const res = run(["link", "pij-aide", "--root", "--actor", "test"], d);
		expect(res.exitCode).not.toBe(0);
		expect(
			d.registry.read("pij-aide")?.parentId,
			"the refused link must leave the prime attached",
		).toBe("pij-prime");
	});

	it("permits linking a pa to its prime in one command", () => {
		const d = deps([descriptor("pij-prime", { prime: true }), descriptor("pij-aide")]);
		const res = run(
			["link", "pij-aide", "--parent", "pij-prime", "--role", "pa", "--actor", "test"],
			d,
		);
		expect(res.exitCode).toBe(0);
		expect(d.registry.read("pij-aide")).toMatchObject({
			orchestrationRole: "pa",
			parentId: "pij-prime",
		});
	});
});

/** The row published the VERDICT (`unadopted`) while withholding the EVIDENCE
 *  (`parent`), so a consumer counting `row.parent == null` scored every seat
 *  alive as parentless — a missing key read as a null value (D-041). Three
 *  governments drew false lineage conclusions from exactly that. */
describe("list rows carry lineage, in the same shape node show uses", () => {
	it("projects parent on every row, present even when genuinely null", () => {
		const d = deps([
			descriptor("pij-prime", { prime: true }),
			descriptor("pij-linked", { parentId: "pij-prime" }),
			descriptor("pij-spawned", { spawnedBy: "pij-prime" }),
			descriptor("pij-loose"),
		]);
		const res = run(["list", "--json"], d);
		expect(res.exitCode).toBe(0);
		const rows = JSON.parse(res.stdout) as { id: string; parent: string | null }[];
		for (const row of rows) {
			expect(Object.hasOwn(row, "parent"), `${row.id} row has no parent key`).toBe(true);
		}
		const byId = new Map(rows.map((r) => [r.id, r.parent]));
		expect(byId.get("pij-linked")).toBe("pij-prime");
		// spawnedBy is lineage too — a raw parentId here would report null and
		// disagree with `node show`, which is the defect one layer along.
		expect(byId.get("pij-spawned")).toBe("pij-prime");
		expect(byId.get("pij-loose")).toBeNull();
	});

	it("agrees with node show for the same seat, key for key", () => {
		const d = deps([
			descriptor("pij-prime", { prime: true }),
			descriptor("pij-spawned", { spawnedBy: "pij-prime" }),
		]);
		const listed = JSON.parse(run(["list", "--json"], d).stdout) as {
			id: string;
			parent: unknown;
		}[];
		const shown = JSON.parse(run(["node", "show", "pij-spawned", "--json"], d).stdout) as {
			parent: unknown;
		};
		const row = listed.find((r) => r.id === "pij-spawned");
		expect(row?.parent).toBe(shown.parent);
	});
});
