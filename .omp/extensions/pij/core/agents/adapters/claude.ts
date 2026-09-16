// Claude headless adapter — `IAgentAdapter` over `claude -p … --output-format json`.
//
// One-shot: spawn claude, parse the single terminal JSON object, map to an
// `AgentResult` (T004 spike). `compact`/`terminate` are best-effort no-ops — a
// one-shot subprocess has already exited by the time `run` resolves.

import type { AgentResult, AgentRunOptions, IAgentAdapter } from "minih";
import { type ExecCommand, type ExecResult, nodeExec } from "./subprocess.js";

/** Shape of `claude -p … --output-format json` stdout (fields we consume). */
interface ClaudeJson {
	result?: string;
	session_id?: string;
	is_error?: boolean;
	usage?: { input_tokens?: number; output_tokens?: number };
}

/** Map a claude exec result to a minih `AgentResult` (pure, unit-testable). */
export function parseClaudeResult(res: ExecResult): AgentResult {
	if (res.spawnError) {
		return failed("", `claude could not be spawned: ${res.spawnError}`, res.code ?? 1);
	}
	let parsed: ClaudeJson;
	try {
		parsed = JSON.parse(res.stdout) as ClaudeJson;
	} catch {
		return failed(
			"",
			`claude output was not JSON: ${res.stderr || res.stdout}`.slice(0, 500),
			res.code ?? 1,
		);
	}
	const output = parsed.result ?? "";
	const sessionId = parsed.session_id ?? "";
	const errored = parsed.is_error === true || (res.code ?? 0) !== 0;
	const tokens = parsed.usage
		? {
				used: (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
				total: (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
				limit: 0,
			}
		: null;
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

/** Build the claude argv for a run (pure, unit-testable). */
export function claudeArgs(options: AgentRunOptions): string[] {
	const args = ["-p", options.prompt, "--output-format", "json"];
	if (options.model) args.push("--model", options.model);
	// A pack that declares `permissions` frontmatter signals it needs tools; minih
	// surfaces that as a structural `permissionHandler` on the run options. The
	// headless claude CLI can't consume that handler, so map its PRESENCE to a
	// scoped, read-only-safe toolset — shell (for fs2/CLI queries) + read/search,
	// but NO Write/Edit. Absent handler ⇒ no tools (the phase-1 one-shot default,
	// backward-compatible: existing packs without permissions keep the plain run).
	if (options.permissionHandler) {
		args.push("--allowedTools", "Bash,Read,Grep,Glob,WebFetch,WebSearch");
	}
	return args;
}

export class ClaudeHeadlessAdapter implements IAgentAdapter {
	constructor(private readonly exec: ExecCommand = nodeExec) {}

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const res = await this.exec("claude", claudeArgs(options), {
			...(options.cwd ? { cwd: options.cwd } : {}),
			...(options.timeout ? { timeoutMs: options.timeout * 1000 } : {}),
		});
		return parseClaudeResult(res);
	}

	// One-shot headless mode has no live session to compact/terminate; the
	// subprocess has already exited. Best-effort no-op (documented degradation).
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
