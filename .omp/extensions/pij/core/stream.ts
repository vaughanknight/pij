// pij orchestration — resumable stream create/close transaction (plan 061).

import { basename, dirname, join } from "node:path";
import { appendAllocationStep, canonicalAllocationJson } from "./platform/allocation.js";
import type { AllocationStorePort } from "./platform/ports.js";
import { buildSpineEvent } from "./platform/spine.js";
import { isoTimestamp } from "./platform/time.js";
import {
	type ActorProvenance,
	type Allocation,
	type AllocationStep,
	isValidProjectSlug,
	SPINE_KIND_ALLOCATION,
	type SpineEventDraft,
} from "./platform/types.js";
import { err, ok, type Result } from "./types.js";

export interface StreamWorktreePort {
	exists(path: string): boolean;
	resolveBase(
		repoRoot: string,
		baseRef: string,
	): Result<{ readonly baseSha: string; readonly gitCommonDir: string }>;
	create(input: {
		readonly repoRoot: string;
		readonly path: string;
		readonly branch: string;
		readonly baseRef: string;
	}): Result<{
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}>;
	verify(
		input: {
			readonly path: string;
			readonly branch: string;
			readonly baseSha: string;
			readonly gitCommonDir: string;
		},
		options?: { readonly allowAdvancedHead?: boolean },
	): Result<{
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}>;
	preserveWip(input: {
		readonly path: string;
		readonly message: string;
	}): Result<{ readonly stashed: boolean; readonly evidence: string }>;
	safeRemove(input: {
		readonly repoRoot: string;
		readonly path: string;
	}): Result<{ readonly removed: boolean }>;
}

export interface StreamCommitPort {
	commitAllocation(previous: Allocation, next: Allocation, event: SpineEventDraft): Result<void>;
}

export interface StreamDeps {
	readonly allocations: AllocationStorePort;
	readonly worktrees: StreamWorktreePort;
	readonly commit: StreamCommitPort;
}

export interface CreateStreamInput {
	readonly project: string;
	readonly slug: string;
	readonly actor: string;
	readonly actorProvenance?: ActorProvenance;
	readonly nowMs: number;
	readonly repoRoot: string;
	readonly worktreeRoot?: string;
	readonly baseRef?: string;
	readonly ordinal?: number;
}

export interface CloseStreamInput {
	readonly id: string;
	readonly actor: string;
	readonly actorProvenance?: ActorProvenance;
	readonly nowMs: number;
	readonly repoRoot: string;
}

function streamOrdinal(ordinal: number): string {
	return String(ordinal).padStart(3, "0");
}

function successfulStep(allocation: Allocation, name: string): boolean {
	return allocation.steps.some((step) => step.name === name && step.ok);
}

function persistedStep(
	store: AllocationStorePort,
	allocation: Allocation,
	step: AllocationStep,
): Result<Allocation> {
	const next = appendAllocationStep(allocation, step);
	const written = store.write(next);
	return written.ok ? ok(next) : written;
}

function failedStep(
	store: AllocationStorePort,
	allocation: Allocation,
	name: string,
	message: string,
	ts: string,
): Result<never> {
	const recorded = persistedStep(store, allocation, {
		name,
		ok: false,
		evidence: message,
		ts,
	});
	return recorded.ok
		? err("E-NOREG", message)
		: err(recorded.code, `${message} (failed step could not be journaled: ${recorded.message})`);
}

function matchingAllocation(
	allocations: readonly Allocation[],
	project: string,
	slug: string,
): Result<Allocation | undefined> {
	const matches = allocations.filter(
		(allocation) => allocation.project === project && allocation.slug === slug,
	);
	if (matches.length > 1) {
		return err("E-AMBIG", `multiple allocations exist for project '${project}' stream '${slug}'`);
	}
	return ok(matches[0]);
}

export function createStream(input: CreateStreamInput, deps: StreamDeps): Result<Allocation> {
	if (input.project.trim() === "") return err("E-ARG", "stream project must be non-empty");
	if (!isValidProjectSlug(input.slug)) {
		return err("E-ARG", `invalid stream slug '${input.slug}' (use lowercase kebab case)`);
	}
	if (input.actor.trim() === "") return err("E-ARG", "stream actor must be non-empty");
	if (input.ordinal !== undefined && (!Number.isSafeInteger(input.ordinal) || input.ordinal < 1)) {
		return err("E-ARG", "stream ordinal must be a positive integer");
	}
	const ts = isoTimestamp(input.nowMs);
	if (!ts.ok) return ts;
	const all = deps.allocations.list();
	const matching = matchingAllocation(all, input.project, input.slug);
	if (!matching.ok) return matching;
	let allocation = matching.value;
	if (allocation !== undefined) {
		if (input.ordinal !== undefined && input.ordinal !== allocation.ordinal) {
			return err(
				"E-AMBIG",
				`stream '${input.slug}' is already allocation ${allocation.id} at ordinal ${allocation.ordinal}`,
			);
		}
		if (allocation.state !== "created") {
			return err(
				"E-ARG",
				`stream '${input.slug}' allocation ${allocation.id} is ${allocation.state} and cannot be re-created`,
			);
		}
	} else {
		const used = new Set(all.map((record) => record.ordinal));
		const ordinal =
			input.ordinal ?? all.reduce((max, record) => Math.max(max, record.ordinal), 0) + 1;
		if (used.has(ordinal)) {
			return err("E-ARG", `stream ordinal ${ordinal} is already reserved and is never recycled`);
		}
		const base = deps.worktrees.resolveBase(input.repoRoot, input.baseRef ?? "HEAD");
		if (!base.ok) return base;
		const ord = streamOrdinal(ordinal);
		const root =
			input.worktreeRoot ?? join(dirname(input.repoRoot), `${basename(input.repoRoot)}-worktrees`);
		allocation = {
			schema_version: 1,
			id: `alloc-s${ord}-${input.slug}`,
			project: input.project,
			ordinal,
			slug: input.slug,
			worktree: join(root, `s${ord}-${input.slug}`),
			branch: `s${ord}/${input.slug}`,
			baseSha: base.value.baseSha,
			state: "created",
			steps: [
				{
					name: "ordinal-reserved",
					ok: true,
					evidence: `ordinal ${ordinal} reserved for ${input.project}/${input.slug}`,
					ts: ts.value,
				},
			],
			created: { actor: input.actor, ts: ts.value },
		};
		const reserved = deps.allocations.write(allocation);
		if (!reserved.ok) return reserved;
	}

	if (successfulStep(allocation, "worktree-created")) {
		const base = deps.worktrees.resolveBase(input.repoRoot, allocation.baseSha);
		if (!base.ok) return base;
		const verified = deps.worktrees.verify(
			{
				path: allocation.worktree,
				branch: allocation.branch,
				baseSha: allocation.baseSha,
				gitCommonDir: base.value.gitCommonDir,
			},
			{ allowAdvancedHead: true },
		);
		if (!verified.ok) return verified;
	} else {
		let created:
			| Result<{
					readonly path: string;
					readonly branch: string;
					readonly baseSha: string;
					readonly gitCommonDir: string;
			  }>
			| undefined;
		if (deps.worktrees.exists(allocation.worktree)) {
			const base = deps.worktrees.resolveBase(input.repoRoot, allocation.baseSha);
			if (!base.ok) return base;
			created = deps.worktrees.verify(
				{
					path: allocation.worktree,
					branch: allocation.branch,
					baseSha: allocation.baseSha,
					gitCommonDir: base.value.gitCommonDir,
				},
				{ allowAdvancedHead: true },
			);
		} else {
			created = deps.worktrees.create({
				repoRoot: input.repoRoot,
				path: allocation.worktree,
				branch: allocation.branch,
				baseRef: allocation.baseSha,
			});
		}
		if (!created.ok) {
			return failedStep(
				deps.allocations,
				allocation,
				"worktree-created",
				created.message,
				ts.value,
			);
		}
		const journaled = persistedStep(deps.allocations, allocation, {
			name: "worktree-created",
			ok: true,
			evidence: `${created.value.path} ${created.value.branch} @ ${created.value.baseSha}`,
			ts: ts.value,
		});
		if (!journaled.ok) return journaled;
		allocation = journaled.value;
	}

	if (successfulStep(allocation, "allocation-committed")) return ok(allocation);
	const next = appendAllocationStep(allocation, {
		name: "allocation-committed",
		ok: true,
		evidence: `allocation ${allocation.id} attributed to ${input.actor}`,
		ts: ts.value,
	});
	const event = buildSpineEvent({
		nowMs: input.nowMs,
		actor: input.actor,
		kind: SPINE_KIND_ALLOCATION,
		refs: [
			`project:${allocation.project}`,
			`allocation:${allocation.id}`,
			`stream:${allocation.slug}`,
		],
		project: allocation.project,
		prev: canonicalAllocationJson(allocation),
		next: canonicalAllocationJson(next),
		actorProvenance: input.actorProvenance,
	});
	if (!event.ok) return event;
	const committed = deps.commit.commitAllocation(allocation, next, event.value);
	return committed.ok ? ok(next) : committed;
}

export function closeStream(input: CloseStreamInput, deps: StreamDeps): Result<Allocation> {
	if (input.id.trim() === "") return err("E-ARG", "stream allocation id must be non-empty");
	if (input.actor.trim() === "") return err("E-ARG", "stream actor must be non-empty");
	const ts = isoTimestamp(input.nowMs);
	if (!ts.ok) return ts;
	let allocation = deps.allocations.read(input.id);
	if (allocation === null) return err("E-NOREG", `no allocation '${input.id}'`);
	if (allocation.state === "closed" && successfulStep(allocation, "allocation-closed")) {
		return ok(allocation);
	}
	if (allocation.state !== "created") {
		return err("E-ARG", `allocation '${input.id}' is ${allocation.state} and cannot be closed`);
	}

	if (!successfulStep(allocation, "wip-preserved")) {
		const preserved = deps.worktrees.preserveWip({
			path: allocation.worktree,
			message: `pij stream close ${allocation.id}`,
		});
		if (!preserved.ok) {
			return failedStep(deps.allocations, allocation, "wip-preserved", preserved.message, ts.value);
		}
		const journaled = persistedStep(deps.allocations, allocation, {
			name: "wip-preserved",
			ok: true,
			evidence: preserved.value.evidence,
			ts: ts.value,
		});
		if (!journaled.ok) return journaled;
		allocation = journaled.value;
	}

	if (!successfulStep(allocation, "worktree-removed")) {
		const removed = deps.worktrees.safeRemove({
			repoRoot: input.repoRoot,
			path: allocation.worktree,
		});
		if (!removed.ok) {
			return failedStep(
				deps.allocations,
				allocation,
				"worktree-removed",
				removed.message,
				ts.value,
			);
		}
		const journaled = persistedStep(deps.allocations, allocation, {
			name: "worktree-removed",
			ok: true,
			evidence: removed.value.removed
				? `removed clean worktree ${allocation.worktree}`
				: `worktree already absent ${allocation.worktree}`,
			ts: ts.value,
		});
		if (!journaled.ok) return journaled;
		allocation = journaled.value;
	}

	const next: Allocation = {
		...appendAllocationStep(allocation, {
			name: "allocation-closed",
			ok: true,
			evidence: `allocation ${allocation.id} closed; ordinal ${allocation.ordinal} remains reserved`,
			ts: ts.value,
		}),
		state: "closed",
	};
	const event = buildSpineEvent({
		nowMs: input.nowMs,
		actor: input.actor,
		kind: SPINE_KIND_ALLOCATION,
		refs: [
			`project:${allocation.project}`,
			`allocation:${allocation.id}`,
			`stream:${allocation.slug}`,
			"state:closed",
		],
		project: allocation.project,
		prev: canonicalAllocationJson(allocation),
		next: canonicalAllocationJson(next),
		actorProvenance: input.actorProvenance,
	});
	if (!event.ok) return event;
	const committed = deps.commit.commitAllocation(allocation, next, event.value);
	return committed.ok ? ok(next) : committed;
}
