import type { AgentRunOptions } from "minih";
import { describe, expect, it } from "vitest";
import { ClaudeHeadlessAdapter, claudeArgs, parseClaudeResult } from "./claude.js";
import type { ExecCommand, ExecResult } from "./subprocess.js";

const CLAUDE_OK = JSON.stringify({
	type: "result",
	subtype: "success",
	is_error: false,
	result: "SPIKE_OK",
	session_id: "sess-123",
	usage: { input_tokens: 100, output_tokens: 20 },
});

function fakeExec(result: ExecResult): {
	exec: ExecCommand;
	calls: Array<{ cmd: string; args: string[] }>;
} {
	const calls: Array<{ cmd: string; args: string[] }> = [];
	const exec: ExecCommand = async (cmd, args) => {
		calls.push({ cmd, args });
		return result;
	};
	return { exec, calls };
}

const opts = (over: Partial<AgentRunOptions> = {}): AgentRunOptions => ({
	prompt: "say hi",
	...over,
});

describe("claude adapter — argv", () => {
	it("uses -p + --output-format json, adds --model when set", () => {
		expect(claudeArgs(opts())).toEqual(["-p", "say hi", "--output-format", "json"]);
		expect(claudeArgs(opts({ model: "sonnet" }))).toEqual([
			"-p",
			"say hi",
			"--output-format",
			"json",
			"--model",
			"sonnet",
		]);
	});

	it("enables a scoped read-only-safe toolset when a permissionHandler is present", () => {
		// A pack with `permissions` frontmatter ⇒ minih passes a permissionHandler ⇒
		// the CLI adapter opts the run into shell + read tools (no Write/Edit).
		const args = claudeArgs(opts({ permissionHandler: async () => ({ kind: "approve-once" }) }));
		expect(args).toContain("--allowedTools");
		expect(args[args.indexOf("--allowedTools") + 1]).toBe("Bash,Read,Grep,Glob,WebFetch,WebSearch");
	});

	it("adds no tool flags without a permissionHandler (phase-1 one-shot default)", () => {
		expect(claudeArgs(opts())).not.toContain("--allowedTools");
	});
});

describe("claude adapter — result parsing", () => {
	it("maps a success envelope to a completed AgentResult", () => {
		const r = parseClaudeResult({ code: 0, stdout: CLAUDE_OK, stderr: "" });
		expect(r.status).toBe("completed");
		expect(r.output).toBe("SPIKE_OK");
		expect(r.sessionId).toBe("sess-123");
		expect(r.tokens).toEqual({ used: 120, total: 120, limit: 0 });
	});

	it("maps is_error:true to a failed result", () => {
		const stdout = JSON.stringify({ is_error: true, result: "boom", session_id: "s" });
		expect(parseClaudeResult({ code: 0, stdout, stderr: "" }).status).toBe("failed");
	});

	it("maps a spawn failure to a failed result", () => {
		const r = parseClaudeResult({ code: null, stdout: "", stderr: "", spawnError: "ENOENT" });
		expect(r.status).toBe("failed");
		expect(r.stderr).toContain("ENOENT");
	});

	it("maps non-JSON stdout to a failed result", () => {
		const r = parseClaudeResult({ code: 1, stdout: "not json", stderr: "traceback" });
		expect(r.status).toBe("failed");
	});
});

describe("claude adapter — run() wiring", () => {
	it("invokes the injected exec with cwd and returns the parsed result", async () => {
		const { exec, calls } = fakeExec({ code: 0, stdout: CLAUDE_OK, stderr: "" });
		const adapter = new ClaudeHeadlessAdapter(exec);
		const r = await adapter.run(opts({ cwd: "/run/dir", model: "opus" }));
		expect(r.output).toBe("SPIKE_OK");
		expect(calls[0]?.cmd).toBe("claude");
		expect(calls[0]?.args).toContain("--model");
	});

	it("compact/terminate are best-effort no-ops (no throw)", async () => {
		const { exec } = fakeExec({ code: 0, stdout: CLAUDE_OK, stderr: "" });
		const adapter = new ClaudeHeadlessAdapter(exec);
		await expect(adapter.compact("s")).resolves.toMatchObject({ status: "completed" });
		await expect(adapter.terminate("s")).resolves.toMatchObject({ status: "completed" });
	});
});
