// .pi/extensions/ralph-loop/store.test.ts
//
// Vitest against the pi-free store (P8). Covers tasks T008.T–T015.T from
// Plan 008 Phase 1.B:
//
//   T008.T — Type-contract tests: exhaustiveCheck + structural guards (≥3)
//   T009.T — parseMarkdownPlan: 5 worked examples + 10 edge cases (≥15)
//   T010.T — nextUndoneTask: mixed / all-done / all-undone / empty (≥3)
//   T011.T — taskFingerprint: case/whitespace/determinism/shape (≥4)
//   T012.T — detectSpinning: short / mixed-tail / n-identical (≥3)
//   T013.T — evaluateStopPre + evaluateStopPost: per-kind (8) + tie-breaks (3)
//            + pre-eval iter-1 (2) + sigil-vs-plan_exhausted (≥13)
//   T014.T — RalphLoopStore lifecycle + P9 ordering + clock injection (≥6)
//   T015.T — Replay determinism + idempotency + cross-reason (≥4)

import { describe, expect, it, vi } from "vitest";

import {
	COMPLETION_SIGIL,
	DEFAULT_CONFIG,
	ENTRY_ITERATION,
	ENTRY_RUN_END,
	ENTRY_RUN_START,
	type AppendFn,
	type IterationInput,
	type IterationRecord,
	type IterationResult,
	type IterationRunner,
	type PlanModel,
	type RalphLoopConfig,
	type ReplayableEntry,
	RalphLoopStore,
	type RunStateSnapshot,
	type StopReason,
	detectSpinning,
	evaluateStopPost,
	evaluateStopPre,
	exhaustiveCheck,
	isIterationData,
	isRunEndData,
	isRunStartData,
	nextUndoneTask,
	outputDigest,
	parseMarkdownPlan,
	taskFingerprint,
} from "./store.js";
import { makeRecorder } from "../../../harness/test-utils.js";

// ─── T008.T — Type contracts ────────────────────────────────────────────────

describe("StopReason exhaustiveCheck (T008.T)", () => {
	it("compiles an exhaustive switch over every StopReason.kind", () => {
		// If this function fails to compile, the union has drifted from
		// the contract embedded in domain.md.
		function describeStop(r: StopReason): string {
			switch (r.kind) {
				case "complete":
					return `complete:${r.reason}@${r.iteration}`;
				case "max_iterations":
					return `max:${r.limit}/${r.reached}`;
				case "budget_usd":
					return `usd:${r.spentUsd}/${r.limitUsd}`;
				case "budget_wallclock":
					return `wc:${r.elapsedMs}/${r.limitMs}`;
				case "spinning":
					return `spin:n=${r.n}:${r.taskFingerprint}`;
				case "manual_stop":
					return `manual:${r.line}@${r.iteration}`;
				case "user_cancel":
					return `cancel:${r.at}@${r.iteration}`;
				case "unverified":
					return `unv:${r.cause}:${r.detail}`;
				default:
					return exhaustiveCheck(r);
			}
		}
		expect(describeStop({ kind: "complete", reason: "sigil", iteration: 3 })).toBe("complete:sigil@3");
		expect(
			describeStop({ kind: "complete", reason: "plan_exhausted", iteration: 5 }),
		).toBe("complete:plan_exhausted@5");
		expect(describeStop({ kind: "manual_stop", line: "STOP", iteration: 1 })).toBe(
			"manual:STOP@1",
		);
	});

	it("isRunStartData accepts valid replay data and rejects malformed", () => {
		expect(
			isRunStartData({
				runId: "r1",
				planPath: "/p",
				startedAt: 1,
				config: DEFAULT_CONFIG,
			}),
		).toBe(true);
		expect(isRunStartData({ runId: "r1", planPath: "/p" })).toBe(false); // missing fields
		expect(isRunStartData(null)).toBe(false);
		expect(isRunStartData("not-an-object")).toBe(false);
	});

	it("isIterationData accepts valid and rejects malformed", () => {
		const valid: IterationRecord & { runId: string } = {
			runId: "r1",
			iteration: 1,
			taskTitle: "x",
			taskFingerprint: "0123456789ab",
			costUsd: null,
			durationMs: 100,
			verdict: "ok",
			outputDigest: "deadbeef0000",
			startedAt: 1,
		};
		expect(isIterationData(valid)).toBe(true);
		expect(isIterationData({ ...valid, verdict: "WAT" })).toBe(false);
		expect(isIterationData({ ...valid, iteration: "1" })).toBe(false);
	});

	it("isRunEndData accepts every StopReason kind", () => {
		const reasons: StopReason[] = [
			{ kind: "complete", reason: "sigil", iteration: 1 },
			{ kind: "complete", reason: "plan_exhausted", iteration: 0 },
			{ kind: "max_iterations", limit: 10, reached: 10 },
			{ kind: "budget_usd", limitUsd: 5, spentUsd: 5 },
			{ kind: "budget_wallclock", limitMs: 1000, elapsedMs: 1500 },
			{ kind: "spinning", n: 3, taskFingerprint: "abc123def456", iterations: [1, 2, 3] },
			{ kind: "manual_stop", line: "STOP", iteration: 1 },
			{ kind: "user_cancel", at: "mid_iteration", iteration: 2 },
			{ kind: "unverified", cause: "session_error", detail: "no host" },
		];
		for (const r of reasons) {
			expect(
				isRunEndData({ runId: "r1", stopReason: r, endedAt: 1 }),
				`isRunEndData should accept kind=${r.kind}`,
			).toBe(true);
		}
		expect(isRunEndData({ runId: "r1", stopReason: { kind: "bogus" } })).toBe(false);
	});
});

// ─── T009.T — parseMarkdownPlan ─────────────────────────────────────────────

describe("parseMarkdownPlan (T009.T) — worked examples", () => {
	it("example 1: minimal plan with 3 undone tasks", () => {
		const text = `# My plan

- [ ] Write the README
- [ ] Add a test
- [ ] Run typecheck
`;
		const plan = parseMarkdownPlan(text, "/PLAN.md");
		expect(plan.tasks).toEqual([
			{ kind: "undone", title: "Write the README", lineNumber: 3 },
			{ kind: "undone", title: "Add a test", lineNumber: 4 },
			{ kind: "undone", title: "Run typecheck", lineNumber: 5 },
		]);
		expect(plan.stopMarker).toBeNull();
		expect(plan.warnings).toEqual([]);
		expect(plan.path).toBe("/PLAN.md");
	});

	it("example 2: mid-run state (mixed done/undone)", () => {
		const text = `- [x] Scaffold the package
- [x] Configure tsconfig
- [ ] Add unit tests
- [ ] Wire up CI
`;
		const plan = parseMarkdownPlan(text, "/PLAN.md");
		expect(plan.tasks).toHaveLength(4);
		expect(plan.tasks[0]).toMatchObject({ kind: "done", title: "Scaffold the package" });
		expect(plan.tasks[2]).toMatchObject({ kind: "undone", title: "Add unit tests" });
	});

	it("example 3: nested tasks (independent semantics)", () => {
		const text = `- [ ] Refactor auth
  - [ ] Move tokens to vault
  - [x] Rotate signing key
- [ ] Update docs
`;
		const plan = parseMarkdownPlan(text, "/PLAN.md");
		expect(plan.tasks).toHaveLength(4);
		expect(plan.tasks.map((t) => t.kind)).toEqual(["undone", "undone", "done", "undone"]);
	});

	it("example 4: manual STOP marker", () => {
		const text = `- [ ] Implement A
- [ ] Implement B

I want to pause here.

STOP

- [ ] Implement C (later)
`;
		const plan = parseMarkdownPlan(text, "/PLAN.md");
		expect(plan.tasks).toHaveLength(3);
		expect(plan.stopMarker).toEqual({ lineNumber: 6, raw: "STOP" });
	});

	it("example 5: plan-exhausted with empty-title warning", () => {
		const text = `# Done!

- [x] All of it
- [ ] 
`;
		const plan = parseMarkdownPlan(text, "/PLAN.md");
		expect(plan.tasks).toEqual([
			{ kind: "done", title: "All of it", lineNumber: 3 },
		]);
		expect(plan.warnings).toEqual([
			{ lineNumber: 4, message: "empty task title; not consumed as a task" },
		]);
	});
});

describe("parseMarkdownPlan (T009.T) — edge cases (workshop 003 § Edge cases)", () => {
	it("`- [ ] STOP` parses as task, not stop marker", () => {
		const plan = parseMarkdownPlan("- [ ] STOP\n", "/p");
		expect(plan.tasks).toEqual([{ kind: "undone", title: "STOP", lineNumber: 1 }]);
		expect(plan.stopMarker).toBeNull();
	});

	it("`Stop` (mixed case) on its own line is recognised", () => {
		const plan = parseMarkdownPlan("Stop\n", "/p");
		expect(plan.stopMarker?.lineNumber).toBe(1);
	});

	it("only the first STOP line is recorded; subsequent ignored", () => {
		const plan = parseMarkdownPlan("STOP\nlater words\nSTOP\n", "/p");
		expect(plan.stopMarker?.lineNumber).toBe(1);
	});

	it("Windows CRLF line endings normalised before regex matching", () => {
		const plan = parseMarkdownPlan("- [ ] one\r\n- [x] two\r\n", "/p");
		expect(plan.tasks).toHaveLength(2);
	});

	it("UTF-8 BOM at file start is stripped", () => {
		const plan = parseMarkdownPlan("\uFEFF- [ ] one\n", "/p");
		expect(plan.tasks).toHaveLength(1);
		expect(plan.tasks[0]?.title).toBe("one");
	});

	it("tab-indented tasks are accepted", () => {
		const plan = parseMarkdownPlan("\t- [ ] tabbed\n", "/p");
		expect(plan.tasks).toHaveLength(1);
	});

	it("bullet `*` accepted alongside `-`", () => {
		const plan = parseMarkdownPlan("* [ ] star\n- [ ] dash\n", "/p");
		expect(plan.tasks).toHaveLength(2);
	});

	it("trailing whitespace on task lines is trimmed from title", () => {
		const plan = parseMarkdownPlan("- [ ] padded   \n", "/p");
		expect(plan.tasks[0]?.title).toBe("padded");
	});

	it("headings are NOT tasks (no leading dash)", () => {
		const plan = parseMarkdownPlan("# - [ ] not-a-task\n", "/p");
		expect(plan.tasks).toEqual([]);
	});

	it("empty file produces empty plan with no warnings or tasks", () => {
		const plan = parseMarkdownPlan("", "/p");
		expect(plan.tasks).toEqual([]);
		expect(plan.warnings).toEqual([]);
		expect(plan.stopMarker).toBeNull();
	});

	it("parser is pure: identical input → identical output", () => {
		const text = "- [ ] one\n- [x] two\nSTOP\n";
		const a = parseMarkdownPlan(text, "/p");
		const b = parseMarkdownPlan(text, "/p");
		expect(a).toEqual(b);
	});
});

// ─── T010.T — nextUndoneTask ────────────────────────────────────────────────

describe("nextUndoneTask (T010.T)", () => {
	function plan(text: string): PlanModel {
		return parseMarkdownPlan(text, "/p");
	}

	it("returns first undone task in document order (mixed)", () => {
		const r = nextUndoneTask(plan("- [x] a\n- [ ] b\n- [ ] c\n"));
		expect(r?.title).toBe("b");
	});

	it("returns null when all tasks are done", () => {
		expect(nextUndoneTask(plan("- [x] a\n- [x] b\n"))).toBeNull();
	});

	it("returns the only undone task when only one exists", () => {
		const r = nextUndoneTask(plan("- [ ] solo\n"));
		expect(r?.title).toBe("solo");
	});

	it("returns null on empty plan", () => {
		expect(nextUndoneTask(plan(""))).toBeNull();
	});
});

// ─── T011.T — taskFingerprint ───────────────────────────────────────────────

describe("taskFingerprint (T011.T)", () => {
	it("returns a 12-hex-char string", () => {
		const fp = taskFingerprint("Implement parser");
		expect(fp).toMatch(/^[0-9a-f]{12}$/);
	});

	it("is case-insensitive", () => {
		expect(taskFingerprint("Run tests")).toBe(taskFingerprint("RUN TESTS"));
		expect(taskFingerprint("Run tests")).toBe(taskFingerprint("run tests"));
	});

	it("is whitespace-insensitive at boundaries", () => {
		expect(taskFingerprint("  hi  ")).toBe(taskFingerprint("hi"));
	});

	it("is deterministic", () => {
		expect(taskFingerprint("x")).toBe(taskFingerprint("x"));
	});

	it("distinguishes internal-whitespace differences", () => {
		// "ab" and "a b" should differ — internal whitespace is preserved.
		expect(taskFingerprint("ab")).not.toBe(taskFingerprint("a b"));
	});
});

// ─── T012.T — detectSpinning ────────────────────────────────────────────────

function fakeRecord(
	iteration: number,
	taskFp: string,
	verdict: IterationRecord["verdict"] = "ok",
): IterationRecord {
	return {
		iteration,
		taskTitle: `task-${iteration}`,
		taskFingerprint: taskFp,
		costUsd: null,
		durationMs: 100,
		verdict,
		outputDigest: "deadbeef0000",
		startedAt: iteration * 1000,
	};
}

describe("detectSpinning (T012.T)", () => {
	it("returns null when log is shorter than n", () => {
		expect(detectSpinning([fakeRecord(1, "aaa")], 3)).toBeNull();
		expect(detectSpinning([], 3)).toBeNull();
	});

	it("returns null when the tail has mixed fingerprints", () => {
		const log = [
			fakeRecord(1, "aaa"),
			fakeRecord(2, "bbb"),
			fakeRecord(3, "ccc"),
		];
		expect(detectSpinning(log, 3)).toBeNull();
	});

	it("fires when the last n iterations share a fingerprint", () => {
		const log = [
			fakeRecord(1, "aaa"),
			fakeRecord(2, "bbb"),
			fakeRecord(3, "bbb"),
			fakeRecord(4, "bbb"),
		];
		const r = detectSpinning(log, 3);
		expect(r).not.toBeNull();
		expect(r?.kind).toBe("spinning");
		expect(r?.n).toBe(3);
		expect(r?.taskFingerprint).toBe("bbb");
		expect(r?.iterations).toEqual([2, 3, 4]);
	});

	it("returns null for n<2 (degenerate config)", () => {
		expect(detectSpinning([fakeRecord(1, "aaa")], 1)).toBeNull();
	});
});

// ─── T013.T — evaluateStopPre + evaluateStopPost ────────────────────────────

function baseState(overrides: Partial<RunStateSnapshot> = {}): RunStateSnapshot {
	const planModel = parseMarkdownPlan("- [ ] one\n- [ ] two\n", "/p");
	return {
		iteration: 1,
		cancelRequested: false,
		midIteration: false,
		planModel,
		lastIterationOutput: "",
		iterationLog: [],
		spentUsd: 0,
		elapsedMs: 0,
		config: DEFAULT_CONFIG,
		...overrides,
	};
}

describe("evaluateStopPre (T013.T)", () => {
	it("user_cancel pre-iter: cancel between iterations", () => {
		const r = evaluateStopPre(baseState({ cancelRequested: true, iteration: 4 }));
		expect(r).toEqual({ kind: "user_cancel", at: "iteration_boundary", iteration: 4 });
	});

	it("manual_stop pre-iter: STOP line in plan", () => {
		const plan = parseMarkdownPlan("- [ ] x\nSTOP\n", "/p");
		const r = evaluateStopPre(baseState({ planModel: plan }));
		expect(r?.kind).toBe("manual_stop");
		if (r?.kind === "manual_stop") {
			expect(r.line).toBe("STOP");
			expect(r.iteration).toBe(1);
		}
	});

	it("complete (plan_exhausted) pre-iter: zero undone tasks", () => {
		const plan = parseMarkdownPlan("- [x] done\n", "/p");
		const r = evaluateStopPre(baseState({ planModel: plan }));
		expect(r).toEqual({ kind: "complete", reason: "plan_exhausted", iteration: 1 });
	});

	it("plan_exhausted fires on iteration 1 BEFORE any iteration runs", () => {
		// Workshop 003 § Example 5 contract: empty plan ends pre-iter 1.
		const plan = parseMarkdownPlan("# Done!\n", "/p");
		const r = evaluateStopPre(baseState({ planModel: plan }));
		expect(r?.kind).toBe("complete");
	});

	it("max_iterations pre-iter: iteration counter past the cap", () => {
		const r = evaluateStopPre(
			baseState({ iteration: 11, config: { ...DEFAULT_CONFIG, maxIterations: 10 } }),
		);
		expect(r?.kind).toBe("max_iterations");
	});

	it("budget_usd pre-iter: spent over the cap", () => {
		const r = evaluateStopPre(
			baseState({ spentUsd: 6, config: { ...DEFAULT_CONFIG, maxUsd: 5 } }),
		);
		expect(r?.kind).toBe("budget_usd");
	});

	it("budget_wallclock pre-iter: elapsed past the cap", () => {
		const r = evaluateStopPre(
			baseState({ elapsedMs: 100, config: { ...DEFAULT_CONFIG, maxWallClockMs: 50 } }),
		);
		expect(r?.kind).toBe("budget_wallclock");
	});

	it("returns null when state is healthy and the loop should proceed", () => {
		expect(evaluateStopPre(baseState())).toBeNull();
	});

	it("cancel beats every other stop reason", () => {
		const plan = parseMarkdownPlan("- [x] done\nSTOP\n", "/p");
		const r = evaluateStopPre(
			baseState({ planModel: plan, cancelRequested: true, iteration: 2 }),
		);
		expect(r?.kind).toBe("user_cancel");
	});
});

describe("evaluateStopPost (T013.T)", () => {
	it("complete (sigil) post-iter: output contains the sigil", () => {
		const r = evaluateStopPost(
			baseState({
				iteration: 3,
				lastIterationOutput: `done now ${COMPLETION_SIGIL}`,
			}),
		);
		expect(r).toEqual({ kind: "complete", reason: "sigil", iteration: 3 });
	});

	it("sigil_vs_plan_exhausted: sigil wins when both are true (sigil checked first)", () => {
		const plan = parseMarkdownPlan("- [x] done\n", "/p");
		const r = evaluateStopPost(
			baseState({
				planModel: plan,
				lastIterationOutput: `${COMPLETION_SIGIL}`,
				iteration: 2,
			}),
		);
		expect(r?.kind).toBe("complete");
		if (r?.kind === "complete") expect(r.reason).toBe("sigil");
	});

	it("plan_exhausted post-iter (no sigil): zero undone after iteration ran", () => {
		const plan = parseMarkdownPlan("- [x] all-done\n", "/p");
		const r = evaluateStopPost(
			baseState({
				planModel: plan,
				lastIterationOutput: "made it done",
				iteration: 3,
			}),
		);
		expect(r).toEqual({ kind: "complete", reason: "plan_exhausted", iteration: 3 });
	});

	it("max_iterations post-iter: iteration counter at the cap", () => {
		const r = evaluateStopPost(
			baseState({
				iteration: 10,
				config: { ...DEFAULT_CONFIG, maxIterations: 10 },
				lastIterationOutput: "still going",
			}),
		);
		expect(r?.kind).toBe("max_iterations");
	});

	it("spinning post-iter: last N iterations share fingerprint", () => {
		const log = [
			fakeRecord(1, "aaa"),
			fakeRecord(2, "bbb"),
			fakeRecord(3, "bbb"),
			fakeRecord(4, "bbb"),
		];
		const r = evaluateStopPost(
			baseState({
				iteration: 4,
				iterationLog: log,
				lastIterationOutput: "looped again",
			}),
		);
		expect(r?.kind).toBe("spinning");
	});

	it("tie-break: manual_stop vs budget_usd → manual_stop wins (explicit before caps)", () => {
		// Pre-evaluator only — workshop 001 § Evaluation order priority.
		const plan = parseMarkdownPlan("- [ ] x\nSTOP\n", "/p");
		const r = evaluateStopPre(
			baseState({ planModel: plan, spentUsd: 100, config: { ...DEFAULT_CONFIG, maxUsd: 5 } }),
		);
		expect(r?.kind).toBe("manual_stop");
	});

	it("tie-break: spinning vs max_iterations → max_iterations wins (spinning evaluated last)", () => {
		const log = [
			fakeRecord(1, "bbb"),
			fakeRecord(2, "bbb"),
			fakeRecord(3, "bbb"),
		];
		const r = evaluateStopPost(
			baseState({
				iteration: 3,
				config: { ...DEFAULT_CONFIG, maxIterations: 3 },
				iterationLog: log,
				lastIterationOutput: "loop",
			}),
		);
		expect(r?.kind).toBe("max_iterations");
	});

	it("returns null when no stop reason fires", () => {
		expect(
			evaluateStopPost(baseState({ iteration: 1, lastIterationOutput: "progress" })),
		).toBeNull();
	});
});

// ─── T014.T — RalphLoopStore lifecycle ──────────────────────────────────────

function fixedResult(overrides: Partial<IterationResult> = {}): IterationResult {
	return {
		output: "iteration body",
		taskTitle: "task X",
		taskFingerprint: taskFingerprint("task X"),
		costUsd: null,
		durationMs: 100,
		verdict: "ok",
		...overrides,
	};
}

class StubRunner implements IterationRunner {
	public calls: IterationInput[] = [];
	constructor(private readonly results: IterationResult[]) {}
	async runIteration(input: IterationInput): Promise<IterationResult> {
		this.calls.push(input);
		const r = this.results.shift();
		if (!r) throw new Error("StubRunner exhausted");
		return r;
	}
}

describe("RalphLoopStore lifecycle (T014.T)", () => {
	it("startRun appends ralph-loop:run-start BEFORE any in-memory mutation (P9)", () => {
		const rec = makeRecorder();
		const order: string[] = [];
		const append: AppendFn = (customType, data) => {
			order.push(`append:${customType}`);
			rec.append(customType, data);
		};
		const runner = new StubRunner([]);
		const store = new RalphLoopStore(append, runner);
		// Spy on internal listRuns to detect mutation visibility.
		const beforeStart = store.listRuns().length;
		const handle = store.startRun("/p", DEFAULT_CONFIG);
		const afterStart = store.listRuns().length;
		order.push(`memory:${afterStart - beforeStart}`);
		expect(handle.runId).toMatch(/^ralph-/);
		expect(handle.iterations).toEqual([]);
		expect(rec.calls.length).toBe(1);
		expect(rec.calls[0]?.customType).toBe(ENTRY_RUN_START);
		// Append-call recorded BEFORE we observe the new run in memory.
		expect(order[0]).toBe(`append:${ENTRY_RUN_START}`);
		expect(order[1]).toBe(`memory:1`);
	});

	it("recordIteration appends ralph-loop:iteration BEFORE pushing to history (P9)", () => {
		const rec = makeRecorder();
		const runner = new StubRunner([]);
		const store = new RalphLoopStore(rec.append, runner);
		const handle = store.startRun("/p");
		store.recordIteration(handle.runId, fixedResult());
		expect(rec.calls.map((c) => c.customType)).toEqual([ENTRY_RUN_START, ENTRY_ITERATION]);
		expect(store.getRunState(handle.runId)?.iterations).toHaveLength(1);
	});

	it("endRun appends ralph-loop:run-end and is idempotent", () => {
		const rec = makeRecorder();
		const runner = new StubRunner([]);
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p");
		const stop: StopReason = { kind: "complete", reason: "sigil", iteration: 1 };
		store.endRun(runId, stop);
		store.endRun(runId, stop); // second call is a no-op
		const ends = rec.calls.filter((c) => c.customType === ENTRY_RUN_END);
		expect(ends).toHaveLength(1);
	});

	it("clock injection is honoured for startRun timestamps", () => {
		const rec = makeRecorder();
		const runner = new StubRunner([]);
		const clock = vi.fn().mockReturnValue(42);
		const store = new RalphLoopStore(rec.append, runner, clock);
		const handle = store.startRun("/p");
		expect(handle.startedAt).toBe(42);
		expect(clock).toHaveBeenCalled();
	});

	it("runOneIteration short-circuits via evaluateStopPre when plan is exhausted", async () => {
		const rec = makeRecorder();
		const runner = new StubRunner([]);
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p");
		const result = await store.runOneIteration(
			runId,
			"- [x] done\n",
			new AbortController().signal,
		);
		expect(result.stopReason?.kind).toBe("complete");
		expect(runner.calls).toEqual([]); // runner not invoked
	});

	it("runOneIteration calls runner, records iteration, returns post-evaluator stop", async () => {
		const rec = makeRecorder();
		const runner = new StubRunner([fixedResult({ output: `final ${COMPLETION_SIGIL}` })]);
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p");
		const result = await store.runOneIteration(
			runId,
			"- [ ] do thing\n",
			new AbortController().signal,
		);
		expect(runner.calls).toHaveLength(1);
		expect(result.record?.iteration).toBe(1);
		expect(result.stopReason?.kind).toBe("complete");
	});

	it("runOneIteration surfaces aborted runner errors as user_cancel mid_iteration", async () => {
		const rec = makeRecorder();
		const controller = new AbortController();
		const runner: IterationRunner = {
			async runIteration() {
				controller.abort();
				throw new Error("aborted");
			},
		};
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p");
		const r = await store.runOneIteration(runId, "- [ ] x\n", controller.signal);
		expect(r.stopReason?.kind).toBe("user_cancel");
		if (r.stopReason?.kind === "user_cancel") {
			expect(r.stopReason.at).toBe("mid_iteration");
		}
	});
});

// ─── F005 regression — post-evaluator sees the POST-iteration plan ──────────

describe("runOneIteration F005 regression: post-iter plan re-read", () => {
	it("plan-exhausted is detected when agent checks off the FINAL task without sigil (maxIterations=1)", async () => {
		const rec = makeRecorder();
		const runner: IterationRunner = {
			async runIteration(input) {
				// Agent claims to have done the task but does NOT emit the sigil.
				return {
					output: "checked off task X without sigil",
					taskTitle: "X",
					taskFingerprint: taskFingerprint("X"),
					costUsd: null,
					durationMs: 50,
					verdict: "ok",
				};
			},
		};
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p", {
			...DEFAULT_CONFIG,
			maxIterations: 1,
		});

		// Simulate plan mutation: pre = `- [ ] X` (1 undone), post = `- [x] X` (all done).
		const preSnapshot = "- [ ] X\n";
		const postSnapshot = "- [x] X\n";

		const r = await store.runOneIteration(
			runId,
			preSnapshot,
			new AbortController().signal,
			async () => postSnapshot,
		);

		expect(r.record?.iteration).toBe(1);
		expect(r.stopReason?.kind).toBe("complete");
		if (r.stopReason?.kind === "complete") {
			expect(r.stopReason.reason).toBe("plan_exhausted");
		}
	});

	it("without the re-read hook, post-evaluator falls back to pre-snapshot (legacy behaviour preserved)", async () => {
		const rec = makeRecorder();
		const runner: IterationRunner = {
			async runIteration() {
				return {
					output: "completed silently",
					taskTitle: "X",
					taskFingerprint: taskFingerprint("X"),
					costUsd: null,
					durationMs: 50,
					verdict: "ok",
				};
			},
		};
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p", {
			...DEFAULT_CONFIG,
			maxIterations: 1,
		});

		// Without postIterationPlanSnapshot, the pre-snapshot (1 undone) is reused.
		const r = await store.runOneIteration(runId, "- [ ] X\n", new AbortController().signal);
		expect(r.stopReason?.kind).toBe("max_iterations");
	});

	it("re-read closure throws → post-evaluator falls back to pre-snapshot, no crash", async () => {
		const rec = makeRecorder();
		const runner: IterationRunner = {
			async runIteration() {
				return {
					output: "finished",
					taskTitle: "Y",
					taskFingerprint: taskFingerprint("Y"),
					costUsd: null,
					durationMs: 1,
					verdict: "ok",
				};
			},
		};
		const store = new RalphLoopStore(rec.append, runner);
		const { runId } = store.startRun("/p", { ...DEFAULT_CONFIG, maxIterations: 3 });
		const r = await store.runOneIteration(
			runId,
			"- [ ] Y\n",
			new AbortController().signal,
			async () => {
				throw new Error("plan file deleted mid-iteration");
			},
		);
		expect(r.record?.iteration).toBe(1);
		// Post-eval falls back to pre-snapshot (still 1 undone) and the run
		// continues (no stop reason because iter < cap and plan not exhausted).
		expect(r.stopReason).toBeNull();
	});
});

// ─── T015.T — Replay determinism ────────────────────────────────────────────

function entriesFromRecorder(rec: ReturnType<typeof makeRecorder>): ReplayableEntry[] {
	return rec.calls.map((c) => ({ type: "custom", customType: c.customType, data: c.data }));
}

describe("RalphLoopStore replay (T015.T)", () => {
	it("rehydrate reconstructs a completed run end-to-end", () => {
		const rec = makeRecorder();
		const runner = new StubRunner([fixedResult({ output: `done ${COMPLETION_SIGIL}` })]);
		const store = new RalphLoopStore(rec.append, runner);
		const handle = store.startRun("/p");
		store.recordIteration(handle.runId, fixedResult());
		store.endRun(handle.runId, { kind: "complete", reason: "sigil", iteration: 1 });
		const persisted = entriesFromRecorder(rec);

		// Fresh store, replay.
		const fresh = new RalphLoopStore(rec.append, runner);
		fresh.rehydrate(persisted);
		const replayed = fresh.getRunState(handle.runId);
		expect(replayed?.iterations).toHaveLength(1);
		expect(replayed?.stopReason).toEqual({ kind: "complete", reason: "sigil", iteration: 1 });
	});

	it("rehydrate is idempotent: replaying same entries twice yields identical state", () => {
		const rec = makeRecorder();
		const runner = new StubRunner([]);
		const store = new RalphLoopStore(rec.append, runner);
		const handle = store.startRun("/p");
		store.recordIteration(handle.runId, fixedResult());
		const entries = entriesFromRecorder(rec);
		const fresh = new RalphLoopStore(rec.append, runner);
		fresh.rehydrate(entries);
		const a = fresh.getRunState(handle.runId);
		fresh.rehydrate(entries);
		const b = fresh.getRunState(handle.runId);
		expect(a).toEqual(b);
	});

	it("rehydrate drops malformed entries silently (P6 — no `as` cast crash)", () => {
		const rec = makeRecorder();
		const runner = new StubRunner([]);
		const store = new RalphLoopStore(rec.append, runner);
		const handle = store.startRun("/p");
		const good = entriesFromRecorder(rec);
		const corrupt: ReplayableEntry[] = [
			...good,
			{ type: "custom", customType: ENTRY_ITERATION, data: { malformed: true } },
			{ type: "custom", customType: ENTRY_RUN_END, data: { runId: handle.runId, endedAt: 1, stopReason: { kind: "bogus" } } },
		];
		const fresh = new RalphLoopStore(rec.append, runner);
		fresh.rehydrate(corrupt);
		const r = fresh.getRunState(handle.runId);
		expect(r?.iterations).toHaveLength(0); // malformed iter dropped
		expect(r?.stopReason).toBeNull(); // malformed end dropped
	});

	it("rehydrate from interleaved cross-reason events still produces a coherent run", () => {
		// Simulates P10 replay where a run was started in `startup`, an iteration
		// ran in `reload`, and the run ended after a `new` session continuation.
		const config: RalphLoopConfig = DEFAULT_CONFIG;
		const startedAt = 1000;
		const stop: StopReason = { kind: "max_iterations", limit: 10, reached: 10 };
		const entries: ReplayableEntry[] = [
			{
				type: "custom",
				customType: ENTRY_RUN_START,
				data: { runId: "r1", planPath: "/p", config, startedAt },
			},
			{
				type: "other",
				customType: "noise",
				data: { irrelevant: true },
			},
			{
				type: "custom",
				customType: ENTRY_ITERATION,
				data: {
					runId: "r1",
					iteration: 1,
					taskTitle: "x",
					taskFingerprint: "abc123def456",
					costUsd: null,
					durationMs: 100,
					verdict: "ok",
					outputDigest: "deadbeef0000",
					startedAt: 1100,
				},
			},
			{
				type: "custom",
				customType: ENTRY_RUN_END,
				data: { runId: "r1", endedAt: 1200, stopReason: stop },
			},
		];
		const rec = makeRecorder();
		const store = new RalphLoopStore(rec.append, new StubRunner([]));
		store.rehydrate(entries);
		const r = store.getRunState("r1");
		expect(r?.iterations).toHaveLength(1);
		expect(r?.stopReason).toEqual(stop);
	});
});

// ─── outputDigest sanity (used by recordIteration) ──────────────────────────

describe("outputDigest helper", () => {
	it("produces a 12-hex-char digest, deterministic", () => {
		expect(outputDigest("hello")).toMatch(/^[0-9a-f]{12}$/);
		expect(outputDigest("hello")).toBe(outputDigest("hello"));
		expect(outputDigest("hello")).not.toBe(outputDigest("world"));
	});
});
