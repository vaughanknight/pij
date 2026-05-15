// .pi/extensions/ralph-loop/store.ts
//
// RalphLoopStore — pi-free data layer for the Ralph Loop pattern.
//
// Imports NOTHING from @earendil-works/* (P2). All pi side-effects are
// injected through the constructor (P3). All non-error returns are
// tagged unions (P4). Constants live next to the data they constrain
// (P5). Structural guards at boundaries (P6 / no `as` casts). Relative
// imports use `.js` extensions (P7). Tests target this file (P8).
// `appendEntry` is called BEFORE in-memory mutation (P9). A single
// `session_start` handler covers every reason (P10) — that's the wiring
// layer's job; this file exposes `rehydrate(entries)` as the contract.
//
// Domain: `agentic-loops`. Source-of-truth contracts (StopReason,
// IterationRunner, PlanModel) lifted verbatim from:
//   - docs/plans/008-ralph-loop-extension/workshops/001-stop-condition-catalog.md
//   - docs/plans/008-ralph-loop-extension/workshops/002-sdk-iteration-lifecycle.md
//   - docs/plans/008-ralph-loop-extension/workshops/003-plan-file-format.md

import { createHash } from "node:crypto";

// ─── Entry tags (customType values appended via ctx.appendEntry) ────────────

export const ENTRY_PREFIX = "ralph-loop:";
export const ENTRY_RUN_START = `${ENTRY_PREFIX}run-start`;
export const ENTRY_ITERATION = `${ENTRY_PREFIX}iteration`;
export const ENTRY_RUN_END = `${ENTRY_PREFIX}run-end`;

// ─── Constants (P5: live with the data they constrain) ──────────────────────

export const MAX_ITERATIONS_DEFAULT = 10;
export const MAX_USD_DEFAULT: number | null = null;
export const MAX_WALLCLOCK_MS_DEFAULT = 30 * 60 * 1000; // 30 minutes
export const SPINNING_N_DEFAULT = 3;
export const COMPLETION_SIGIL = "<promise>COMPLETE</promise>";
// Stop marker: a line whose trimmed content (case-insensitive) is exactly STOP.
const STOP_LINE_RE = /^[ \t]*[sS][tT][oO][pP][ \t]*$/;
// Task lines per workshop 003 § Grammar.
const UNDONE_TASK_RE = /^[ \t]*[-*][ \t]+\[[ ]\][ \t]+(.+?)\s*$/;
const DONE_TASK_RE = /^[ \t]*[-*][ \t]+\[[xX]\][ \t]+(.+?)\s*$/;
// "Empty title" rows like `- [ ] ` — explicit task syntax but no title.
const EMPTY_UNDONE_TASK_RE = /^[ \t]*[-*][ \t]+\[[ xX]\][ \t]*$/;
// Heading rows (recorded for forensics; not surfaced beyond § PlanModel internals).
const HEADING_RE = /^[ \t]*#{1,6}[ \t]+(.+?)\s*$/;

// ─── StopReason tagged union (verbatim from workshop 001 § StopReason) ──────
// THIS IS THE HEADLINE CONTRACT. Phase 1 T008 implements against it
// character-for-character; companion review F001 caught earlier drift.
//
// 8 closed kinds. Every consumer MUST exhaustively switch + call
// exhaustiveCheck() at the bottom of the switch.

export type StopReason =
	| { kind: "complete"; reason: "sigil" | "plan_exhausted"; iteration: number }
	| { kind: "max_iterations"; limit: number; reached: number }
	| { kind: "budget_usd"; limitUsd: number; spentUsd: number }
	| { kind: "budget_wallclock"; limitMs: number; elapsedMs: number }
	| {
			kind: "spinning";
			n: number;
			taskFingerprint: string;
			iterations: readonly number[];
	  }
	| { kind: "manual_stop"; line: string; iteration: number }
	| {
			kind: "user_cancel";
			at: "iteration_boundary" | "mid_iteration";
			iteration: number;
	  }
	| {
			kind: "unverified";
			cause: "cost_unavailable" | "sigil_missing" | "session_error";
			detail: string;
	  };

export function exhaustiveCheck(_: never): never {
	throw new Error("exhaustiveCheck: non-exhaustive switch reached");
}

// ─── Plan model (verbatim from workshop 003 § Data model) ───────────────────

export interface PlanModel {
	readonly path: string;
	readonly raw: string;
	readonly tasks: readonly PlanTask[];
	readonly stopMarker: PlanStopMarker | null;
	readonly warnings: readonly PlanWarning[];
}

export type PlanTask =
	| {
			readonly kind: "undone";
			readonly title: string;
			readonly lineNumber: number;
	  }
	| {
			readonly kind: "done";
			readonly title: string;
			readonly lineNumber: number;
	  };

export interface PlanStopMarker {
	readonly lineNumber: number;
	readonly raw: string;
}

export interface PlanWarning {
	readonly lineNumber: number;
	readonly message: string;
}

// ─── Iteration types (verbatim from workshop 002) ───────────────────────────

export interface RalphLoopConfig {
	readonly maxIterations: number;
	readonly maxUsd: number | null;
	readonly maxWallClockMs: number;
	readonly spinningN: number;
	readonly completionSigil: string;
}

export const DEFAULT_CONFIG: RalphLoopConfig = Object.freeze({
	maxIterations: MAX_ITERATIONS_DEFAULT,
	maxUsd: MAX_USD_DEFAULT,
	maxWallClockMs: MAX_WALLCLOCK_MS_DEFAULT,
	spinningN: SPINNING_N_DEFAULT,
	completionSigil: COMPLETION_SIGIL,
});

export interface IterationInput {
	readonly runId: string;
	readonly planPath: string;
	readonly planSnapshot: string;
	readonly history: readonly IterationRecord[];
	readonly iteration: number;
	readonly signal: AbortSignal;
	readonly config: RalphLoopConfig;
}

export interface IterationResult {
	readonly output: string;
	readonly taskTitle: string;
	readonly taskFingerprint: string;
	readonly costUsd: number | null;
	readonly durationMs: number;
	readonly verdict: "ok" | "agent_error" | "session_error";
	readonly errorDetail?: string;
}

export interface IterationRecord {
	readonly iteration: number;
	readonly taskTitle: string;
	readonly taskFingerprint: string;
	readonly costUsd: number | null;
	readonly durationMs: number;
	readonly verdict: IterationResult["verdict"];
	readonly errorDetail?: string;
	readonly outputDigest: string; // first 12 hex of SHA-1(output) — for forensics without storing raw text
	readonly startedAt: number; // clock value when iteration began
}

export interface RunStartData {
	readonly runId: string;
	readonly planPath: string;
	readonly config: RalphLoopConfig;
	readonly startedAt: number;
}

export interface RunEndData {
	readonly runId: string;
	readonly stopReason: StopReason;
	readonly endedAt: number;
}

export interface IterationRunner {
	runIteration(input: IterationInput): Promise<IterationResult>;
}

// Structural guards (P6 — no `as` casts at the replay boundary).

export function isRunStartData(data: unknown): data is RunStartData {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.runId === "string" &&
		typeof d.planPath === "string" &&
		typeof d.startedAt === "number" &&
		isRalphLoopConfig(d.config)
	);
}

export function isIterationData(data: unknown): data is IterationRecord & {
	readonly runId: string;
} {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.runId === "string" &&
		typeof d.iteration === "number" &&
		typeof d.taskTitle === "string" &&
		typeof d.taskFingerprint === "string" &&
		(d.costUsd === null || typeof d.costUsd === "number") &&
		typeof d.durationMs === "number" &&
		(d.verdict === "ok" || d.verdict === "agent_error" || d.verdict === "session_error") &&
		typeof d.outputDigest === "string" &&
		typeof d.startedAt === "number"
	);
}

export function isRunEndData(data: unknown): data is RunEndData {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.runId === "string" &&
		typeof d.endedAt === "number" &&
		isStopReason(d.stopReason)
	);
}

function isRalphLoopConfig(data: unknown): data is RalphLoopConfig {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.maxIterations === "number" &&
		(d.maxUsd === null || typeof d.maxUsd === "number") &&
		typeof d.maxWallClockMs === "number" &&
		typeof d.spinningN === "number" &&
		typeof d.completionSigil === "string"
	);
}

function isStopReason(data: unknown): data is StopReason {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	switch (d.kind) {
		case "complete":
			return (
				(d.reason === "sigil" || d.reason === "plan_exhausted") &&
				typeof d.iteration === "number"
			);
		case "max_iterations":
			return typeof d.limit === "number" && typeof d.reached === "number";
		case "budget_usd":
			return typeof d.limitUsd === "number" && typeof d.spentUsd === "number";
		case "budget_wallclock":
			return typeof d.limitMs === "number" && typeof d.elapsedMs === "number";
		case "spinning":
			return (
				typeof d.n === "number" &&
				typeof d.taskFingerprint === "string" &&
				Array.isArray(d.iterations) &&
				d.iterations.every((i) => typeof i === "number")
			);
		case "manual_stop":
			return typeof d.line === "string" && typeof d.iteration === "number";
		case "user_cancel":
			return (
				(d.at === "iteration_boundary" || d.at === "mid_iteration") &&
				typeof d.iteration === "number"
			);
		case "unverified":
			return (
				(d.cause === "cost_unavailable" ||
					d.cause === "sigil_missing" ||
					d.cause === "session_error") &&
				typeof d.detail === "string"
			);
		default:
			return false;
	}
}

// ─── Replay entry shape (P6 structural type at the boundary) ────────────────

export interface ReplayableEntry {
	readonly type: string;
	readonly customType?: string;
	readonly data?: unknown;
}

export type AppendFn = (customType: string, data: unknown) => void;

// ─── Pure parsing (workshop 003 § Grammar) ──────────────────────────────────

/**
 * Parse a markdown plan file (raw text) into a `PlanModel`. Pure function:
 * no I/O, no `Date.now`, no `Math.random`. Handles BOM, CRLF, empty-title
 * warnings, and case-insensitive STOP marker. Per workshop 003 § Grammar.
 */
export function parseMarkdownPlan(text: string, path: string): PlanModel {
	// Strip UTF-8 BOM + normalise CRLF → LF up front.
	const normalised = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	const lines = normalised.split("\n");
	const tasks: PlanTask[] = [];
	const warnings: PlanWarning[] = [];
	let stopMarker: PlanStopMarker | null = null;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i] ?? "";
		const lineNumber = i + 1;

		// Stop marker takes precedence over EVERYTHING for a standalone STOP line.
		if (STOP_LINE_RE.test(raw)) {
			if (stopMarker === null) {
				stopMarker = { lineNumber, raw: raw.trim() };
			}
			// (subsequent STOP lines are silently ignored — workshop 003 § Edge cases)
			continue;
		}

		const undone = UNDONE_TASK_RE.exec(raw);
		if (undone && undone[1]) {
			tasks.push({ kind: "undone", title: undone[1].trim(), lineNumber });
			continue;
		}

		const done = DONE_TASK_RE.exec(raw);
		if (done && done[1]) {
			tasks.push({ kind: "done", title: done[1].trim(), lineNumber });
			continue;
		}

		if (EMPTY_UNDONE_TASK_RE.test(raw)) {
			warnings.push({
				lineNumber,
				message: "empty task title; not consumed as a task",
			});
			continue;
		}

		// Heading lines, prose, code fences, blanks — all ignored per § Grammar.
		if (HEADING_RE.test(raw)) continue;
	}

	return {
		path,
		raw: normalised,
		tasks,
		stopMarker,
		warnings,
	};
}

/**
 * Next undone task in DOCUMENT ORDER. No priority, no nesting awareness.
 * Returns null when no undone task remains. Per workshop 003 § Next-undone-task selection.
 */
export function nextUndoneTask(plan: PlanModel): PlanTask | null {
	for (const t of plan.tasks) {
		if (t.kind === "undone") return t;
	}
	return null;
}

/**
 * 12-hex-char SHA-1 of trimmed lowercase title. Case- and whitespace-insensitive.
 * Per workshop 001 § Spinning detection.
 */
export function taskFingerprint(title: string): string {
	const norm = title.trim().toLowerCase();
	return createHash("sha1").update(norm, "utf8").digest("hex").slice(0, 12);
}

/**
 * Output digest — 12-hex-char SHA-1 of the agent's final-message text. Used so
 * we can forensically compare iteration outputs without persisting raw bodies.
 */
export function outputDigest(output: string): string {
	return createHash("sha1").update(output, "utf8").digest("hex").slice(0, 12);
}

/**
 * Spinning detection — the last N iterations share the same task fingerprint.
 * Per workshop 001 § Spinning detection algorithm. Pure tail-slice check.
 */
export function detectSpinning(
	log: readonly IterationRecord[],
	n: number,
): Extract<StopReason, { kind: "spinning" }> | null {
	if (n < 2) return null;
	if (log.length < n) return null;
	const tail = log.slice(-n);
	const first = tail[0];
	if (!first) return null;
	const fp = first.taskFingerprint;
	if (!tail.every((r) => r.taskFingerprint === fp)) return null;
	return {
		kind: "spinning",
		n,
		taskFingerprint: fp,
		iterations: tail.map((r) => r.iteration),
	};
}

// ─── Evaluator (workshop 001 § Evaluation order, pre/post split) ────────────

export interface RunStateSnapshot {
	readonly iteration: number; // 1-based: index of the iteration we're ABOUT TO run (pre) or that just RAN (post)
	readonly cancelRequested: boolean;
	readonly midIteration: boolean;
	readonly planModel: PlanModel;
	readonly lastIterationOutput: string;
	readonly iterationLog: readonly IterationRecord[];
	readonly spentUsd: number;
	readonly elapsedMs: number;
	readonly config: RalphLoopConfig;
}

/**
 * Pre-iteration evaluator — runs BEFORE spinning up the next agent session.
 * Catches manual_stop, plan_exhausted, cancel-between-iterations, caps that
 * are already exceeded. Returns null when the loop should proceed.
 * Per workshop 001 § Evaluation order. F001 resolution.
 */
export function evaluateStopPre(state: RunStateSnapshot): StopReason | null {
	if (state.cancelRequested) {
		return {
			kind: "user_cancel",
			at: "iteration_boundary",
			iteration: state.iteration,
		};
	}
	if (state.planModel.stopMarker !== null) {
		return {
			kind: "manual_stop",
			line: state.planModel.stopMarker.raw,
			iteration: state.iteration,
		};
	}
	if (nextUndoneTask(state.planModel) === null) {
		return {
			kind: "complete",
			reason: "plan_exhausted",
			iteration: state.iteration,
		};
	}
	if (state.iteration > state.config.maxIterations) {
		return {
			kind: "max_iterations",
			limit: state.config.maxIterations,
			reached: state.iteration - 1,
		};
	}
	if (state.config.maxUsd !== null && state.spentUsd >= state.config.maxUsd) {
		return {
			kind: "budget_usd",
			limitUsd: state.config.maxUsd,
			spentUsd: state.spentUsd,
		};
	}
	if (state.elapsedMs >= state.config.maxWallClockMs) {
		return {
			kind: "budget_wallclock",
			limitMs: state.config.maxWallClockMs,
			elapsedMs: state.elapsedMs,
		};
	}
	return null;
}

/**
 * Post-iteration evaluator — runs AFTER an iteration completes. Classifies
 * the outcome. Returns null when the loop should continue. Per workshop 001
 * § Evaluation order.
 */
export function evaluateStopPost(state: RunStateSnapshot): StopReason | null {
	if (state.cancelRequested) {
		return {
			kind: "user_cancel",
			at: state.midIteration ? "mid_iteration" : "iteration_boundary",
			iteration: state.iteration,
		};
	}
	if (state.lastIterationOutput.includes(state.config.completionSigil)) {
		return { kind: "complete", reason: "sigil", iteration: state.iteration };
	}
	if (nextUndoneTask(state.planModel) === null) {
		return {
			kind: "complete",
			reason: "plan_exhausted",
			iteration: state.iteration,
		};
	}
	if (state.iteration >= state.config.maxIterations) {
		return {
			kind: "max_iterations",
			limit: state.config.maxIterations,
			reached: state.iteration,
		};
	}
	if (state.config.maxUsd !== null && state.spentUsd >= state.config.maxUsd) {
		return {
			kind: "budget_usd",
			limitUsd: state.config.maxUsd,
			spentUsd: state.spentUsd,
		};
	}
	if (state.elapsedMs >= state.config.maxWallClockMs) {
		return {
			kind: "budget_wallclock",
			limitMs: state.config.maxWallClockMs,
			elapsedMs: state.elapsedMs,
		};
	}
	const spin = detectSpinning(state.iterationLog, state.config.spinningN);
	if (spin) return spin;
	return null;
}

// ─── RalphLoopStore class (workshop 002 § Interface contract) ───────────────

export interface RunHandle {
	readonly runId: string;
	readonly planPath: string;
	readonly config: RalphLoopConfig;
	readonly startedAt: number;
	readonly iterations: readonly IterationRecord[];
	readonly cancelRequested: boolean;
	readonly stopReason: StopReason | null;
}

/**
 * Generate a deterministic-ish runId. Uses provided clock + counter so tests
 * can fully control the value. Default: `ralph-<ts-base36>-<counter-base36>`.
 */
function defaultRunId(clock: () => number, counter: number): string {
	return `ralph-${clock().toString(36)}-${counter.toString(36)}`;
}

interface MutableRun {
	runId: string;
	planPath: string;
	config: RalphLoopConfig;
	startedAt: number;
	iterations: IterationRecord[];
	cancelRequested: boolean;
	stopReason: StopReason | null;
}

export class RalphLoopStore {
	private readonly runs = new Map<string, MutableRun>();
	private runCounter = 0;

	constructor(
		private readonly append: AppendFn,
		private readonly runner: IterationRunner,
		private readonly clock: () => number = Date.now,
	) {}

	/**
	 * Begin a new run. Appends `ralph-loop:run-start` BEFORE any in-memory
	 * mutation (P9). Returns the runId for subsequent calls.
	 */
	startRun(planPath: string, config: RalphLoopConfig = DEFAULT_CONFIG): RunHandle {
		this.runCounter++;
		const startedAt = this.clock();
		const runId = defaultRunId(this.clock, this.runCounter);
		const startData: RunStartData = {
			runId,
			planPath,
			config,
			startedAt,
		};
		// P9: persist FIRST.
		this.append(ENTRY_RUN_START, startData);
		const mutable: MutableRun = {
			runId,
			planPath,
			config,
			startedAt,
			iterations: [],
			cancelRequested: false,
			stopReason: null,
		};
		this.runs.set(runId, mutable);
		return this.snapshot(mutable);
	}

	/**
	 * Record one completed iteration. P9-ordered: appendEntry first, then
	 * push to in-memory history. Throws if the runId is unknown OR if the
	 * iteration index doesn't match the next expected slot (defends against
	 * out-of-order recording — wiring callers should rely on this for
	 * invariants).
	 */
	recordIteration(runId: string, result: IterationResult): IterationRecord {
		const run = this.requireRun(runId);
		const iteration = run.iterations.length + 1;
		const record: IterationRecord = {
			iteration,
			taskTitle: result.taskTitle,
			taskFingerprint: result.taskFingerprint,
			costUsd: result.costUsd,
			durationMs: result.durationMs,
			verdict: result.verdict,
			errorDetail: result.errorDetail,
			outputDigest: outputDigest(result.output),
			startedAt: this.clock() - result.durationMs,
		};
		// P9: persist FIRST.
		this.append(ENTRY_ITERATION, { runId, ...record });
		run.iterations.push(record);
		return record;
	}

	/**
	 * End a run with a classified `StopReason`. Idempotent (no-ops if already
	 * ended). P9-ordered.
	 */
	endRun(runId: string, stopReason: StopReason): void {
		const run = this.requireRun(runId);
		if (run.stopReason !== null) return;
		const endData: RunEndData = {
			runId,
			stopReason,
			endedAt: this.clock(),
		};
		this.append(ENTRY_RUN_END, endData);
		run.stopReason = stopReason;
	}

	/** Mark a run as cancel-requested. Evaluators pick this up on the next pass. */
	cancel(runId: string): void {
		const run = this.runs.get(runId);
		if (!run) return;
		run.cancelRequested = true;
	}

	/**
	 * Drive one iteration end-to-end: pre-evaluate (stop early if needed),
	 * delegate to the injected runner, record the result, then post-evaluate.
	 * The returned `stopReason` is non-null when the run should end this turn.
	 */
	async runOneIteration(
		runId: string,
		planSnapshot: string,
		signal: AbortSignal,
		postIterationPlanSnapshot?: () => string | Promise<string>,
	): Promise<{ stopReason: StopReason | null; record: IterationRecord | null }> {
		const run = this.requireRun(runId);
		const planModel = parseMarkdownPlan(planSnapshot, run.planPath);
		const nextIter = run.iterations.length + 1;

		const preState: RunStateSnapshot = {
			iteration: nextIter,
			cancelRequested: run.cancelRequested,
			midIteration: false,
			planModel,
			lastIterationOutput: run.iterations.at(-1)?.outputDigest ?? "",
			iterationLog: run.iterations,
			spentUsd: this.spentUsd(run),
			elapsedMs: this.clock() - run.startedAt,
			config: run.config,
		};
		const preStop = evaluateStopPre(preState);
		if (preStop !== null) return { stopReason: preStop, record: null };

		let result: IterationResult;
		try {
			result = await this.runner.runIteration({
				runId,
				planPath: run.planPath,
				planSnapshot,
				history: run.iterations,
				iteration: nextIter,
				signal,
				config: run.config,
			});
		} catch (e) {
			// Abort surfaces as user_cancel mid-iteration via signal.aborted.
			if (signal.aborted) {
				return {
					stopReason: {
						kind: "user_cancel",
						at: "mid_iteration",
						iteration: nextIter,
					},
					record: null,
				};
			}
			// Any other throw → unverified (session_error) per workshop 002 § Failure modes.
			return {
				stopReason: {
					kind: "unverified",
					cause: "session_error",
					detail: e instanceof Error ? e.message : String(e),
				},
				record: null,
			};
		}

		const record = this.recordIteration(runId, result);

		// F005 fix: post-evaluation must see the plan AS IT IS NOW. The agent may
		// have edited the plan file during the iteration (e.g. checking off the
		// final unchecked task without emitting the sigil). If the caller supplied
		// a post-iteration snapshot fetcher, use it; otherwise fall back to the
		// pre-iteration snapshot (callers without filesystem access — e.g. tests
		// driving via FakeIterationRunner — simulate plan mutation via this hook).
		let postPlanModel = planModel;
		if (postIterationPlanSnapshot) {
			try {
				const freshSnapshot = await postIterationPlanSnapshot();
				postPlanModel = parseMarkdownPlan(freshSnapshot, run.planPath);
			} catch {
				// Re-read failure (e.g. plan deleted) is non-fatal here — the next
				// pre-iter evaluator will pick up ENOENT and end the run cleanly.
			}
		}

		const postState: RunStateSnapshot = {
			iteration: nextIter,
			cancelRequested: run.cancelRequested,
			midIteration: false,
			planModel: postPlanModel,
			lastIterationOutput: result.output,
			iterationLog: run.iterations,
			spentUsd: this.spentUsd(run),
			elapsedMs: this.clock() - run.startedAt,
			config: run.config,
		};
		const postStop = evaluateStopPost(postState);
		return { stopReason: postStop, record };
	}

	/** Read a snapshot of a run by id. Undefined for unknown ids. */
	getRunState(runId: string): RunHandle | undefined {
		const run = this.runs.get(runId);
		return run ? this.snapshot(run) : undefined;
	}

	/** All runs (most-recent first). */
	listRuns(): readonly RunHandle[] {
		return Array.from(this.runs.values())
			.sort((a, b) => b.startedAt - a.startedAt)
			.map((r) => this.snapshot(r));
	}

	/**
	 * Replay-only constructor for P10: rebuild every run from a stream of
	 * ReplayableEntry rows. Idempotent — calling rehydrate twice with the
	 * same input produces the same state. Malformed entries are dropped
	 * silently per P6 (no `as` casts).
	 */
	rehydrate(entries: Iterable<ReplayableEntry>): void {
		this.runs.clear();
		this.runCounter = 0;
		for (const entry of entries) {
			if (entry.type !== "custom") continue;
			switch (entry.customType) {
				case ENTRY_RUN_START: {
					if (!isRunStartData(entry.data)) break;
					const d = entry.data;
					this.runs.set(d.runId, {
						runId: d.runId,
						planPath: d.planPath,
						config: d.config,
						startedAt: d.startedAt,
						iterations: [],
						cancelRequested: false,
						stopReason: null,
					});
					this.runCounter++;
					break;
				}
				case ENTRY_ITERATION: {
					if (!isIterationData(entry.data)) break;
					const d = entry.data;
					const run = this.runs.get(d.runId);
					if (!run) break;
					run.iterations.push({
						iteration: d.iteration,
						taskTitle: d.taskTitle,
						taskFingerprint: d.taskFingerprint,
						costUsd: d.costUsd,
						durationMs: d.durationMs,
						verdict: d.verdict,
						errorDetail: d.errorDetail,
						outputDigest: d.outputDigest,
						startedAt: d.startedAt,
					});
					break;
				}
				case ENTRY_RUN_END: {
					if (!isRunEndData(entry.data)) break;
					const run = this.runs.get(entry.data.runId);
					if (!run) break;
					run.stopReason = entry.data.stopReason;
					break;
				}
				default:
					// Unknown customType under our prefix — silently ignore.
					break;
			}
		}
	}

	// ─── internals ──────────────────────────────────────────────────────────

	private requireRun(runId: string): MutableRun {
		const r = this.runs.get(runId);
		if (!r) throw new Error(`RalphLoopStore: unknown runId ${runId}`);
		return r;
	}

	private spentUsd(run: MutableRun): number {
		let total = 0;
		for (const r of run.iterations) {
			if (r.costUsd !== null) total += r.costUsd;
		}
		return total;
	}

	private snapshot(run: MutableRun): RunHandle {
		return Object.freeze({
			runId: run.runId,
			planPath: run.planPath,
			config: run.config,
			startedAt: run.startedAt,
			iterations: run.iterations.slice(),
			cancelRequested: run.cancelRequested,
			stopReason: run.stopReason,
		});
	}
}
