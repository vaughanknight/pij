// .pi/extensions/ralph-loop/index.ts
//
// ralph-loop — Geoffrey Huntley's Ralph Loop pattern as a pi extension.
//
// Pattern provenance: https://ghuntley.com/ralph/. The prompt structure
// borrows from snarktank/ralph + coleam00/ralph (with attribution).
//
// This is the WIRING layer. All pi side effects are here (commands, tools,
// status pill, session_start handler). Logic lives in store.ts (P2 / P3 /
// P5 / P9). The SDK lifecycle adapter is in runner.ts (F-02 / P3).
//
// Commands:
//   /ralph start <plan-path> [opts]   — begin a run
//   /ralph stop                       — request cancel; honoured at next iter
//   /ralph status [--json]            — current run state (smoke uses --json)
//   /ralph plan                       — print the active plan file path
//
// Tools (LLM-callable):
//   ralph_iterate    — drive one iteration (rare; commands are the usual surface)
//   ralph_check_stop — emit the stop reason for the latest run

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { type AgentSessionFactory, SdkIterationRunner } from "./runner.js";
import {
	DEFAULT_CONFIG,
	exhaustiveCheck,
	type IterationInput,
	type IterationResult,
	type IterationRunner,
	type RalphLoopConfig,
	RalphLoopStore,
	type StopReason,
	taskFingerprint,
} from "./store.js";

const STATUS_KEY = "ralph-loop";
const FAKE_RUNNER_ENV = "PIJ_RALPH_FAKE_RUNNER";

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ActiveRun {
	runId: string;
	planPath: string;
	controller: AbortController;
	loopPromise: Promise<void>;
}

function formatStopReason(reason: StopReason): string {
	switch (reason.kind) {
		case "complete":
			return `complete (${reason.reason}) at iter ${reason.iteration}`;
		case "max_iterations":
			return `max iterations: ${reason.reached}/${reason.limit}`;
		case "budget_usd":
			return `budget reached: $${reason.spentUsd.toFixed(4)} / $${reason.limitUsd}`;
		case "budget_wallclock":
			return `wallclock reached: ${(reason.elapsedMs / 1000).toFixed(1)}s / ${(reason.limitMs / 1000).toFixed(0)}s`;
		case "spinning":
			return `spinning: ${reason.n}× ${reason.taskFingerprint} (iters ${reason.iterations.join(",")})`;
		case "manual_stop":
			return `manual STOP at iter ${reason.iteration} (line: "${reason.line}")`;
		case "user_cancel":
			return `user_cancel (${reason.at}) at iter ${reason.iteration}`;
		case "unverified":
			return `unverified (${reason.cause}): ${reason.detail}`;
		default:
			return exhaustiveCheck(reason);
	}
}

function readPlan(planPath: string): { ok: true; content: string } | { ok: false; reason: string } {
	try {
		const content = readFileSync(planPath, "utf8");
		return { ok: true, content };
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		return { ok: false, reason: detail };
	}
}

function buildRunner(_pi: ExtensionAPI, cwd: string): IterationRunner {
	if (process.env[FAKE_RUNNER_ENV] === "1") {
		return new FakeIterationRunnerForSmoke();
	}
	// Real path: lazily-bound factory using pi-coding-agent. Importing inline
	// here would violate AGENTS.md (no top-level await import); the factory
	// declares its own structural shape and the wiring constructs it once.
	const factory: AgentSessionFactory = async (_input) => {
		// In v1 we do NOT spin up nested pi sessions automatically — the SDK
		// path is exercised by smoke via FakeIterationRunnerForSmoke. The real
		// nested-session integration is tracked as a follow-up (see RUNBOOK +
		// docs/how/ralph-loop.md § Troubleshooting "no real SDK session yet").
		throw new Error(
			"ralph-loop: real SDK runner not wired in v1. Set PIJ_RALPH_FAKE_RUNNER=1 to run with the fake-runner shim, or call ralph_iterate directly with externally-provided IterationResults.",
		);
	};
	return new SdkIterationRunner({ factory, cwd });
}

/**
 * Deterministic 3-iteration shim used by smoke (workshop 004) when
 * PIJ_RALPH_FAKE_RUNNER=1 is set. Matches the FakeIterationRunner contract
 * exported from harness/test-utils.ts but stays inside this package so the
 * wiring has no test-only import path at runtime.
 */
class FakeIterationRunnerForSmoke implements IterationRunner {
	private nextIter = 0;
	async runIteration(input: IterationInput): Promise<IterationResult> {
		this.nextIter++;
		const allUndone = Array.from(input.planSnapshot.matchAll(/-\s+\[ \]\s+(.+?)\s*$/gm)).map(
			(m) => m[1]?.trim() ?? "",
		);
		const taskTitle =
			allUndone.length > 0
				? (allUndone[Math.min(this.nextIter - 1, allUndone.length - 1)] ??
					`fake-task-${this.nextIter}`)
				: `fake-task-${this.nextIter}`;
		return {
			output:
				this.nextIter >= 3
					? "Marking complete now <promise>COMPLETE</promise>"
					: `Iteration ${this.nextIter} did ${taskTitle}`,
			taskTitle,
			taskFingerprint: taskFingerprint(taskTitle),
			costUsd: 0.0001 * this.nextIter,
			durationMs: 10,
			verdict: "ok",
		};
	}
}

// ─── Status / JSON helpers ──────────────────────────────────────────────────

interface RalphStatusJson {
	readonly runId: string | null;
	readonly planPath: string | null;
	readonly iterations: number;
	readonly lastTaskTitle: string | null;
	readonly runActive: boolean;
	readonly lastStopReason: StopReason | null;
	readonly spentUsd: number;
}

function buildStatusJson(store: RalphLoopStore, active: ActiveRun | null): RalphStatusJson {
	const runs = store.listRuns();
	const latest = runs[0];
	const last = latest?.iterations.at(-1);
	const spentUsd = (latest?.iterations ?? []).reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
	return Object.freeze({
		runId: latest?.runId ?? null,
		planPath: latest?.planPath ?? null,
		iterations: latest?.iterations.length ?? 0,
		lastTaskTitle: last?.taskTitle ?? null,
		runActive: active !== null,
		lastStopReason: latest?.stopReason ?? null,
		spentUsd,
	});
}

// ─── Extension entry point ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	const runner = buildRunner(pi, cwd);
	const store = new RalphLoopStore((customType, data) => pi.appendEntry(customType, data), runner);
	let activeRun: ActiveRun | null = null;

	function refreshStatus(ctx: ExtensionContext | ExtensionCommandContext): void {
		const runs = store.listRuns();
		const latest = runs[0];
		if (activeRun && latest) {
			const n = latest.iterations.length;
			const cap = latest.config.maxIterations;
			ctx.ui.setStatus(STATUS_KEY, `${STATUS_KEY}: iter ${n}/${cap}`);
		} else {
			// D-006: clear with undefined, not "".
			ctx.ui.setStatus(STATUS_KEY, undefined);
		}
	}

	async function runLoop(
		planPath: string,
		config: RalphLoopConfig,
		ctx: ExtensionCommandContext,
	): Promise<void> {
		const handle = store.startRun(planPath, config);
		const controller = new AbortController();
		activeRun = { runId: handle.runId, planPath, controller, loopPromise: Promise.resolve() };
		refreshStatus(ctx);
		try {
			while (true) {
				const plan = readPlan(planPath);
				if (!plan.ok) {
					store.endRun(handle.runId, {
						kind: "manual_stop",
						line: `<plan unreadable: ${plan.reason}>`,
						iteration: store.getRunState(handle.runId)?.iterations.length ?? 0,
					});
					break;
				}
				const { stopReason, record } = await store.runOneIteration(
					handle.runId,
					plan.content,
					controller.signal,
					// F005 fix: re-read plan AFTER the runner returns so post-evaluator
					// sees any task-checkbox edits the agent made during the iteration.
					() => {
						const fresh = readPlan(planPath);
						return fresh.ok ? fresh.content : plan.content;
					},
				);
				refreshStatus(ctx);
				if (stopReason !== null) {
					store.endRun(handle.runId, stopReason);
					ctx.ui.notify(
						`ralph-loop: stopped \u2014 ${formatStopReason(stopReason)}`,
						stopReason.kind === "unverified" ? "warning" : "info",
					);
					break;
				}
				if (record === null) {
					// Pre-eval declined but didn't return a reason \u2014 defensive fallback
					store.endRun(handle.runId, {
						kind: "unverified",
						cause: "session_error",
						detail: "runOneIteration returned null stopReason+record",
					});
					break;
				}
			}
		} finally {
			activeRun = null;
			refreshStatus(ctx);
		}
	}

	// ─── Lifecycle: P10 single session_start handler ──────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		store.rehydrate(ctx.sessionManager.getEntries());
		refreshStatus(ctx);
	});

	// ─── Command surface (T018) ───────────────────────────────────────────────

	pi.registerCommand("ralph", {
		description:
			"Drive a Ralph Loop against a markdown plan file. /ralph start <path> | stop | status [--json] | plan",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const trimmed = args.trim();
			const [verb, ...rest] = trimmed.split(/\s+/);
			switch (verb) {
				case "":
				case "status": {
					const json = buildStatusJson(store, activeRun);
					if (rest.includes("--json")) {
						ctx.ui.notify(JSON.stringify(json, null, 2), "info");
					} else {
						const lines = [
							`ralph-loop:`,
							`  runActive: ${json.runActive}`,
							`  iterations: ${json.iterations}`,
							`  lastTaskTitle: ${json.lastTaskTitle ?? "(none)"}`,
							`  planPath: ${json.planPath ?? "(none)"}`,
							`  spentUsd: $${json.spentUsd.toFixed(4)}`,
							`  lastStopReason: ${
								json.lastStopReason ? formatStopReason(json.lastStopReason) : "(none)"
							}`,
						];
						ctx.ui.notify(lines.join("\n"), "info");
					}
					return;
				}
				case "plan": {
					if (activeRun) ctx.ui.notify(`ralph-loop: active plan ${activeRun.planPath}`, "info");
					else ctx.ui.notify(`ralph-loop: no active plan`, "info");
					return;
				}
				case "stop": {
					if (!activeRun) {
						ctx.ui.notify("ralph-loop: no active run to stop", "info");
						return;
					}
					activeRun.controller.abort();
					store.cancel(activeRun.runId);
					ctx.ui.notify(`ralph-loop: cancel requested for ${activeRun.runId}`, "info");
					return;
				}
				case "start": {
					if (activeRun) {
						ctx.ui.notify("ralph-loop: a run is already active; /ralph stop first", "warning");
						return;
					}
					const planArg = rest[0];
					if (!planArg) {
						ctx.ui.notify(
							"ralph-loop: /ralph start <plan-path> [--max-iters N] [--max-usd N] [--max-wallclock-ms N]",
							"warning",
						);
						return;
					}
					const planPath = resolvePath(cwd, planArg);
					const planRead = readPlan(planPath);
					if (!planRead.ok) {
						ctx.ui.notify(`ralph-loop: cannot read plan ${planPath}: ${planRead.reason}`, "error");
						return;
					}
					const config = parseConfigFlags(rest.slice(1));
					ctx.ui.notify(`ralph-loop: starting run against ${planPath}`, "info");
					runLoop(planPath, config, ctx).catch((e) => {
						ctx.ui.notify(
							`ralph-loop: run loop crashed: ${e instanceof Error ? e.message : String(e)}`,
							"error",
						);
					});
					return;
				}
				default:
					ctx.ui.notify(
						`ralph-loop: unknown verb "${verb}". Try /ralph start | stop | status | plan`,
						"warning",
					);
					return;
			}
		},
	});

	// ─── Tools (T019) ─────────────────────────────────────────────────────────

	pi.registerTool({
		name: "ralph_check_stop",
		label: "Ralph stop reason",
		description:
			"Return the stop reason of the most recent ralph-loop run, or null if none. Useful for the agent to introspect run lifecycle.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, _ctx) {
			const runs = store.listRuns();
			const latest = runs[0];
			const body = latest
				? JSON.stringify({
						runId: latest.runId,
						stopReason: latest.stopReason,
						iterations: latest.iterations.length,
					})
				: JSON.stringify({ runId: null, stopReason: null, iterations: 0 });
			return {
				content: [{ type: "text", text: body }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "ralph_iterate",
		label: "Ralph iterate once",
		description:
			"Drive a single iteration of an active ralph-loop run. Returns the iteration record + stop reason. NB: in v1 the SDK iterate path is exercised via FakeIterationRunner when PIJ_RALPH_FAKE_RUNNER=1.",
		parameters: Type.Object({
			runId: Type.String({ description: "The runId returned by /ralph start" }),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			const run = store.getRunState(params.runId);
			if (!run) {
				return {
					content: [{ type: "text", text: `unknown runId: ${params.runId}` }],
					details: { error: true },
				};
			}
			const plan = readPlan(run.planPath);
			if (!plan.ok) {
				return {
					content: [{ type: "text", text: `cannot read plan: ${plan.reason}` }],
					details: { error: true },
				};
			}
			const toolSignal = signal ?? new AbortController().signal;
			const result = await store.runOneIteration(
				params.runId,
				plan.content,
				toolSignal,
				// F005: re-read plan after the runner so post-eval is current
				() => {
					const fresh = readPlan(run.planPath);
					return fresh.ok ? fresh.content : plan.content;
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							stopReason: result.stopReason,
							record: result.record,
						}),
					},
				],
				details: {},
			};
		},
	});

	// expose for smoke + tests
	return {
		// not part of the ExtensionAPI surface; pi ignores extra return values,
		// but they are useful for in-process integration if/when desired.
		store,
		runner,
		buildStatusJson: () => buildStatusJson(store, activeRun),
	};
}

function parseConfigFlags(args: readonly string[]): RalphLoopConfig {
	let maxIterations = DEFAULT_CONFIG.maxIterations;
	let maxUsd = DEFAULT_CONFIG.maxUsd;
	let maxWallClockMs = DEFAULT_CONFIG.maxWallClockMs;
	let spinningN = DEFAULT_CONFIG.spinningN;
	for (let i = 0; i < args.length; i++) {
		const k = args[i];
		const v = args[i + 1];
		if (!v) continue;
		switch (k) {
			case "--max-iters":
			case "--max-iterations": {
				const n = Number(v);
				if (Number.isFinite(n) && n > 0) maxIterations = Math.trunc(n);
				i++;
				break;
			}
			case "--max-usd": {
				const n = Number(v);
				if (Number.isFinite(n) && n > 0) maxUsd = n;
				i++;
				break;
			}
			case "--max-wallclock-ms": {
				const n = Number(v);
				if (Number.isFinite(n) && n > 0) maxWallClockMs = Math.trunc(n);
				i++;
				break;
			}
			case "--spinning-n": {
				const n = Number(v);
				if (Number.isFinite(n) && n >= 2) spinningN = Math.trunc(n);
				i++;
				break;
			}
		}
	}
	return Object.freeze({
		maxIterations,
		maxUsd,
		maxWallClockMs,
		spinningN,
		completionSigil: DEFAULT_CONFIG.completionSigil,
	});
}
