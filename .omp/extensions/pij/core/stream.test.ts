import { describe, expect, it } from "vitest";
import type { AllocationStorePort } from "./platform/ports.js";
import type { Allocation, SpineEventDraft } from "./platform/types.js";
import { closeStream, createStream, type StreamCommitPort } from "./stream.js";
import { err, ok, type Result } from "./types.js";

const T = Date.parse("2026-07-20T10:00:00.000Z");

class TestAllocationStore implements AllocationStorePort {
	readonly records = new Map<string, Allocation>();
	readonly writes: Allocation[] = [];
	onWrite: ((allocation: Allocation) => void) | undefined;

	write(allocation: Allocation): Result<void> {
		this.onWrite?.(allocation);
		const copy = structuredClone(allocation);
		this.writes.push(copy);
		this.records.set(allocation.id, copy);
		return ok(undefined);
	}

	read(id: string): Allocation | null {
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Allocation[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) => left.ordinal - right.ordinal);
	}
}

class TestWorktrees {
	readonly calls: string[] = [];
	private created = false;
	createFailure: Result<never> | undefined;
	preserveFailure: Result<never> | undefined;
	removeFailure: Result<never> | undefined;
	onCreate: (() => void) | undefined;
	onRemove: (() => void) | undefined;

	exists(): boolean {
		return this.created;
	}

	resolveBase(): Result<{ readonly baseSha: string; readonly gitCommonDir: string }> {
		this.calls.push("resolveBase");
		return ok({ baseSha: "base-sha", gitCommonDir: "/repo/.git" });
	}

	create(input: {
		readonly path: string;
		readonly branch: string;
		readonly baseRef: string;
	}): Result<{
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}> {
		this.calls.push("create");
		this.onCreate?.();
		if (this.createFailure) return this.createFailure;
		this.created = true;
		return ok({
			path: input.path,
			branch: input.branch,
			baseSha: input.baseRef,
			gitCommonDir: "/repo/.git",
		});
	}

	verify(): Result<{
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}> {
		this.calls.push("verify");
		return ok({
			path: "/repo-worktrees/s061-team-scaffold",
			branch: "s061/team-scaffold",
			baseSha: "base-sha",
			gitCommonDir: "/repo/.git",
		});
	}

	preserveWip(): Result<{ readonly stashed: boolean; readonly evidence: string }> {
		this.calls.push("preserveWip");
		if (this.preserveFailure) return this.preserveFailure;
		return ok({ stashed: true, evidence: "stash@{0}" });
	}

	safeRemove(): Result<{ readonly removed: boolean }> {
		this.calls.push("safeRemove");
		this.onRemove?.();
		if (this.removeFailure) return this.removeFailure;
		this.created = false;
		return ok({ removed: true });
	}
}

class TestCommit implements StreamCommitPort {
	readonly calls: Array<{
		previous: Allocation;
		next: Allocation;
		event: SpineEventDraft;
	}> = [];
	active = false;

	constructor(private readonly store: AllocationStorePort) {}

	commitAllocation(previous: Allocation, next: Allocation, event: SpineEventDraft): Result<void> {
		this.active = true;
		this.calls.push({
			previous: structuredClone(previous),
			next: structuredClone(next),
			event: structuredClone(event),
		});
		const written = this.store.write(next);
		this.active = false;
		return written;
	}
}

function rig() {
	const allocations = new TestAllocationStore();
	const worktrees = new TestWorktrees();
	const commit = new TestCommit(allocations);
	return { allocations, worktrees, commit };
}

describe("createStream — AC-01", () => {
	it("persists ordinal reservation before git, journals each completed step, then commits", () => {
		const { allocations, worktrees, commit } = rig();
		worktrees.onCreate = () => {
			const reserved = allocations.read("alloc-s001-team-scaffold");
			expect(reserved?.steps.map((step) => step.name)).toEqual(["ordinal-reserved"]);
		};
		const result = createStream(
			{
				project: "platform",
				slug: "team-scaffold",
				actor: "prime",
				nowMs: T,
				repoRoot: "/repo",
				worktreeRoot: "/repo-worktrees",
			},
			{ allocations, worktrees, commit },
		);
		expect(result).toMatchObject({
			ok: true,
			value: {
				id: "alloc-s001-team-scaffold",
				ordinal: 1,
				branch: "s001/team-scaffold",
				worktree: "/repo-worktrees/s001-team-scaffold",
				baseSha: "base-sha",
				state: "created",
			},
		});
		if (!result.ok) throw new Error(result.message);
		expect(result.value.steps.map((step) => step.name)).toEqual([
			"ordinal-reserved",
			"worktree-created",
			"allocation-committed",
		]);
		expect(worktrees.calls).toEqual(["resolveBase", "create"]);
		expect(commit.calls).toHaveLength(1);
		expect(commit.calls[0]?.event).toMatchObject({
			kind: "allocation",
			project: "platform",
			refs: ["project:platform", "allocation:alloc-s001-team-scaffold", "stream:team-scaffold"],
		});
	});

	it("re-run resumes idempotently: completed git is verified then skipped, commit is not duplicated", () => {
		const { allocations, worktrees, commit } = rig();
		const input = {
			project: "platform",
			slug: "team-scaffold",
			actor: "prime",
			nowMs: T,
			repoRoot: "/repo",
			worktreeRoot: "/repo-worktrees",
		};
		const first = createStream(input, { allocations, worktrees, commit });
		if (!first.ok) throw new Error(first.message);
		const second = createStream(input, { allocations, worktrees, commit });
		expect(second).toEqual(first);
		expect(worktrees.calls).toEqual(["resolveBase", "create", "resolveBase", "verify"]);
		expect(commit.calls).toHaveLength(1);
	});

	it("tombstone-aware ordinal allocation never recycles closed/tombstoned ordinals", () => {
		const { allocations, worktrees, commit } = rig();
		for (const [ordinal, state] of [
			[1, "closed"],
			[2, "tombstoned"],
		] as const) {
			allocations.write({
				schema_version: 1,
				id: `alloc-s00${ordinal}-old-${ordinal}`,
				project: "platform",
				ordinal,
				slug: `old-${ordinal}`,
				worktree: `/repo-worktrees/s00${ordinal}-old-${ordinal}`,
				branch: `s00${ordinal}/old-${ordinal}`,
				baseSha: "old",
				state,
				steps: [],
				created: { actor: "prime", ts: new Date(T).toISOString() },
			});
		}
		const result = createStream(
			{
				project: "platform",
				slug: "new",
				actor: "prime",
				nowMs: T,
				repoRoot: "/repo",
				worktreeRoot: "/repo-worktrees",
			},
			{ allocations, worktrees, commit },
		);
		expect(result).toMatchObject({ ok: true, value: { ordinal: 3, id: "alloc-s003-new" } });
	});

	it("a git failure records prior and failed steps, then stops before the coupled commit", () => {
		const { allocations, worktrees, commit } = rig();
		worktrees.createFailure = err("E-NOREG", "injected git failure");
		const result = createStream(
			{
				project: "platform",
				slug: "broken",
				actor: "prime",
				nowMs: T,
				repoRoot: "/repo",
				worktreeRoot: "/repo-worktrees",
			},
			{ allocations, worktrees, commit },
		);
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(
			allocations.read("alloc-s001-broken")?.steps.map((step) => ({
				name: step.name,
				ok: step.ok,
			})),
		).toEqual([
			{ name: "ordinal-reserved", ok: true },
			{ name: "worktree-created", ok: false },
		]);
		expect(commit.calls).toHaveLength(0);
	});

	it("lock scope surrounds only the spine-emitting commit, never git or intermediate steps", () => {
		const { allocations, worktrees, commit } = rig();
		const writes: Array<{ readonly lastStep: string; readonly locked: boolean }> = [];
		allocations.onWrite = (allocation) => {
			writes.push({
				lastStep: allocation.steps[allocation.steps.length - 1]?.name ?? "(none)",
				locked: commit.active,
			});
		};
		worktrees.onCreate = () => expect(commit.active).toBe(false);
		const result = createStream(
			{
				project: "platform",
				slug: "lock-scope",
				actor: "prime",
				nowMs: T,
				repoRoot: "/repo",
				worktreeRoot: "/repo-worktrees",
			},
			{ allocations, worktrees, commit },
		);
		expect(result.ok).toBe(true);
		expect(writes).toEqual([
			{ lastStep: "ordinal-reserved", locked: false },
			{ lastStep: "worktree-created", locked: false },
			{ lastStep: "allocation-committed", locked: true },
		]);
	});
});

describe("closeStream — non-destructive rollback", () => {
	it("preserves WIP before removal, journals both steps, and closes through one commit", () => {
		const { allocations, worktrees, commit } = rig();
		const created = createStream(
			{
				project: "platform",
				slug: "team-scaffold",
				actor: "prime",
				nowMs: T,
				repoRoot: "/repo",
				worktreeRoot: "/repo-worktrees",
			},
			{ allocations, worktrees, commit },
		);
		if (!created.ok) throw new Error(created.message);
		worktrees.onRemove = () => {
			expect(
				allocations.read(created.value.id)?.steps.some((step) => step.name === "wip-preserved"),
			).toBe(true);
		};
		const closed = closeStream(
			{ id: created.value.id, actor: "prime", nowMs: T + 1000, repoRoot: "/repo" },
			{ allocations, worktrees, commit },
		);
		expect(closed).toMatchObject({ ok: true, value: { state: "closed" } });
		if (!closed.ok) throw new Error(closed.message);
		expect(closed.value.steps.slice(-3).map((step) => step.name)).toEqual([
			"wip-preserved",
			"worktree-removed",
			"allocation-closed",
		]);
		expect(worktrees.calls.slice(-2)).toEqual(["preserveWip", "safeRemove"]);
		expect(commit.calls).toHaveLength(2);
	});

	it("a preserve failure keeps the worktree and allocation open", () => {
		const { allocations, worktrees, commit } = rig();
		const created = createStream(
			{
				project: "platform",
				slug: "team-scaffold",
				actor: "prime",
				nowMs: T,
				repoRoot: "/repo",
				worktreeRoot: "/repo-worktrees",
			},
			{ allocations, worktrees, commit },
		);
		if (!created.ok) throw new Error(created.message);
		worktrees.preserveFailure = err("E-NOREG", "stash failed");
		const closed = closeStream(
			{ id: created.value.id, actor: "prime", nowMs: T + 1000, repoRoot: "/repo" },
			{ allocations, worktrees, commit },
		);
		expect(closed).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(worktrees.calls).not.toContain("safeRemove");
		expect(allocations.read(created.value.id)?.state).toBe("created");
		expect(commit.calls).toHaveLength(1);
	});
});
