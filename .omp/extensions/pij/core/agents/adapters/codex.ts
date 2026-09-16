// Codex headless adapter — `IAgentAdapter` over `codex exec --json`.
//
// One-shot: spawn codex, parse the JSONL event stream (thread.started →
// session id; last agent_message item → output; turn.completed → usage), map to
// an `AgentResult` (T004 spike). Effort maps via `codexEffort`, which clamps
// minih's `xhigh` and codex's absent `minimal` into codex's supported range and
// warns (never blocks). `compact`/`terminate` are best-effort no-ops.

import type { AgentResult, AgentRunOptions, IAgentAdapter } from "minih";
import { type ExecCommand, type ExecResult, nodeExec } from "./subprocess.js";

/** Map a requested effort to codex's `model_reasoning_effort` range.
 *
 * codex supports `minimal|low|medium|high`; minih's enum is `low|medium|high|
 * xhigh`. So `minimal` (a codex level minih can't express) is clamped to `low`,
 * and `xhigh` (a minih level codex lacks) is clamped to `high`. Both are lossy
 * → warn; everything else passes through. Never blocks (KF-06). */
export function codexEffort(effort: string | undefined): { value?: string; warning?: string } {
	if (effort === undefined) return {};
	if (effort === "minimal") {
		return {
			value: "low",
			warning: "codex: clamped effort 'minimal' → 'low' (codex has no minih-visible minimal)",
		};
	}
	if (effort === "xhigh") {
		return { value: "high", warning: "codex: clamped effort 'xhigh' → 'high' (codex ceiling)" };
	}
	return { value: effort };
}

/** Build the codex argv for a run (pure, unit-testable). Effort is resolved by
 *  the caller so the warning can be surfaced once. */
export function codexArgs(options: AgentRunOptions, effortValue: string | undefined): string[] {
	const args = ["exec", "--json", "--skip-git-repo-check", "-s", "read-only"];
	if (options.model) args.push("-m", options.model);
	if (effortValue) args.push("-c", `model_reasoning_effort="${effortValue}"`);
	if (options.cwd) args.push("-C", options.cwd);
	args.push(options.prompt);
	return args;
}

/** Map a codex exec result (JSONL) to a minih `AgentResult` (pure). */
export function parseCodexResult(res: ExecResult): AgentResult {
	if (res.spawnError) {
		return failed("", `codex could not be spawned: ${res.spawnError}`, res.code ?? 1);
	}
	let sessionId = "";
	let output = "";
	let sawTurnCompleted = false;
	let tokens: AgentResult["tokens"] = null;

	for (const line of res.stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let evt: Record<string, unknown>;
		try {
			evt = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			continue; // tolerate non-JSON noise lines
		}
		const type = evt.type;
		if (type === "thread.started" && typeof evt.thread_id === "string") {
			sessionId = evt.thread_id;
		} else if (type === "item.completed") {
			const item = evt.item as { type?: string; text?: string } | undefined;
			if (item?.type === "agent_message" && typeof item.text === "string") {
				output = item.text; // last agent_message wins
			}
		} else if (type === "turn.completed") {
			sawTurnCompleted = true;
			const usage = evt.usage as { input_tokens?: number; output_tokens?: number } | undefined;
			if (usage) {
				const used = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
				tokens = { used, total: used, limit: 0 };
			}
		}
	}

	const errored = !sawTurnCompleted || (res.code ?? 0) !== 0;
	return {
		output,
		sessionId,
		status: errored ? "failed" : "completed",
		exitCode: res.code ?? (errored ? 1 : 0),
		...(res.stderr ? { stderr: res.stderr } : {}),
		tokens,
	};
}

function failed(output: string, stderr: string, exitCode: number): AgentResult {
	return { output, sessionId: "", status: "failed", exitCode, stderr, tokens: null };
}

export class CodexExecAdapter implements IAgentAdapter {
	constructor(
		private readonly exec: ExecCommand = nodeExec,
		private readonly warn: (message: string) => void = defaultWarn,
	) {}

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const effort = codexEffort(options.reasoningEffort);
		if (effort.warning) this.warn(effort.warning);
		const res = await this.exec("codex", codexArgs(options, effort.value), {
			...(options.cwd ? { cwd: options.cwd } : {}),
			...(options.timeout ? { timeoutMs: options.timeout * 1000 } : {}),
		});
		return parseCodexResult(res);
	}

	async compact(sessionId: string): Promise<AgentResult> {
		return noop(sessionId);
	}
	async terminate(sessionId: string): Promise<AgentResult> {
		return noop(sessionId);
	}
}

function noop(sessionId: string): AgentResult {
	return { output: "", sessionId, status: "completed", exitCode: 0, tokens: null };
}

function defaultWarn(message: string): void {
	process.stderr.write(`${message}\n`);
}
