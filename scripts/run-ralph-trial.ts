// scripts/run-ralph-trial.ts
//
// Standalone driver for RALPH_TRIAL_1.md. Mirrors what `/ralph start` does
// inside pi, but runs from the CLI so we can see the iterations stream by
// in real time without an interactive pi session.
//
// Usage:
//   npx tsx scripts/run-ralph-trial.ts ./RALPH_TRIAL_1.md
//
// Prints per-iteration records + final StopReason, then exits.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

import {
	type AgentSessionFactory,
	SdkIterationRunner,
} from "../.pi/extensions/ralph-loop/runner.js";
import {
	DEFAULT_CONFIG,
	RalphLoopStore,
	type RalphLoopConfig,
} from "../.pi/extensions/ralph-loop/store.js";

const planPath = resolve(process.argv[2] ?? "./RALPH_TRIAL_1.md");
console.log(`[ralph-trial] plan: ${planPath}`);

// Build the same factory wiring as .pi/extensions/ralph-loop/index.ts buildRunner().
const factory: AgentSessionFactory = async (input) => {
	const { session } = await createAgentSession({
		cwd: process.cwd(),
		sessionManager: SessionManager.inMemory(),
	});

	if (input.signal.aborted) {
		session.dispose();
		throw new Error("ralph-trial: aborted before inner session start");
	}
	input.signal.addEventListener(
		"abort",
		() => {
			void session.abort().catch(() => {
				/* best-effort */
			});
		},
		{ once: true },
	);

	// Stream tool calls / message chunks to our console so we see Ralph
	// working in real time (the real /ralph in pi shows these via pi's UI).
	session.subscribe((event) => {
		if (event.type === "tool_execution_start") {
			process.stdout.write(`\n  [tool] ${event.toolName}`);
		}
		if (event.type === "tool_execution_end") {
			process.stdout.write(event.isError ? " ✗" : " ✓");
		}
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stdout.write(event.assistantMessageEvent.delta);
		}
	});

	return session;
};

const runner = new SdkIterationRunner({ factory, cwd: process.cwd() });

const entries: Array<{ customType: string; data: unknown }> = [];
const store = new RalphLoopStore((customType, data) => {
	entries.push({ customType, data });
	const preview = JSON.stringify(data).slice(0, 200);
	console.log(`\n[entry] ${customType}: ${preview}`);
}, runner);

// Config: max 8 iters defensively; everything else default.
const config: RalphLoopConfig = { ...DEFAULT_CONFIG, maxIterations: 8 };

async function main(): Promise<void> {
	const handle = store.startRun(planPath, config);
	console.log(`\n[ralph-trial] started run ${handle.runId}\n`);
	const controller = new AbortController();
	const signal = controller.signal;

	// Ctrl-C → graceful cancel (same path as /ralph stop)
	process.on("SIGINT", () => {
		console.log("\n[ralph-trial] SIGINT — cancelling...");
		controller.abort();
	});

	function readPlan(): string {
		return readFileSync(planPath, "utf8");
	}

	while (true) {
		const planText = readPlan();
		const { stopReason, record } = await store.runOneIteration(
			handle.runId,
			planText,
			signal,
			() => readFileSync(planPath, "utf8"),
		);
		if (record) {
			console.log(
				`\n\n[iter ${entries.filter((e) => e.customType === "ralph-loop/iteration").length}] verdict=${record.verdict} task="${record.taskTitle}" cost=$${(record.costUsd ?? 0).toFixed(4)} dur=${record.durationMs}ms`,
			);
		}
		if (stopReason !== null) {
			store.endRun(handle.runId, stopReason);
			console.log(`\n[ralph-trial] STOP: ${JSON.stringify(stopReason)}`);
			break;
		}
		if (record === null) {
			store.endRun(handle.runId, {
				kind: "unverified",
				cause: "session_error",
				detail: "runOneIteration returned null stopReason+record",
			});
			break;
		}
	}

	const finalRun = store.getRunState(handle.runId);
	console.log("\n[ralph-trial] final run summary:");
	console.log(
		JSON.stringify(
			{
				runId: finalRun?.runId,
				iterations: finalRun?.iterations.length,
				stopReason: finalRun?.stopReason,
				totalCostUsd:
					finalRun?.iterations.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(4),
			},
			null,
			2,
		),
	);
}

main().catch((e) => {
	console.error("\n[ralph-trial] FATAL:", e);
	process.exit(1);
});
