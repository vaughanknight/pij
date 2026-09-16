import type { AgentRunOptions } from "minih";
import { describe, expect, it, vi } from "vitest";
import { CodexExecAdapter, codexArgs, codexEffort, parseCodexResult } from "./codex.js";
import type { ExecCommand, ExecResult } from "./subprocess.js";

const CODEX_OK = [
	JSON.stringify({ type: "thread.started", thread_id: "thr-1" }),
	JSON.stringify({ type: "turn.started" }),
	JSON.stringify({
		type: "item.completed",
		item: { id: "item_0", type: "agent_message", text: "SPIKE_OK" },
	}),
	JSON.stringify({ type: "turn.completed", usage: { input_tokens: 200, output_tokens: 21 } }),
].join("\n");

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

describe("codex adapter — effort clamp (KF-06)", () => {
	it("clamps minimal → low with a warning", () => {
		const r = codexEffort("minimal");
		expect(r.value).toBe("low");
		expect(r.warning).toMatch(/minimal/);
	});

	it("clamps xhigh → high with a warning", () => {
		const r = codexEffort("xhigh");
		expect(r.value).toBe("high");
		expect(r.warning).toMatch(/xhigh/);
	});

	it("passes low/medium/high through unchanged, no warning", () => {
		for (const e of ["low", "medium", "high"]) {
			const r = codexEffort(e);
			expect(r.value).toBe(e);
			expect(r.warning).toBeUndefined();
		}
	});

	it("undefined effort → no value, no warning", () => {
		expect(codexEffort(undefined)).toEqual({});
	});
});

describe("codex adapter — argv", () => {
	it("builds the exec argv with json/skip-git/sandbox and prompt last", () => {
		const args = codexArgs(opts({ model: "gpt", cwd: "/run" }), "low");
		expect(args.slice(0, 5)).toEqual([
			"exec",
			"--json",
			"--skip-git-repo-check",
			"-s",
			"read-only",
		]);
		expect(args).toContain("-m");
		expect(args).toContain('model_reasoning_effort="low"');
		expect(args).toContain("-C");
		expect(args.at(-1)).toBe("say hi");
	});
});

describe("codex adapter — result parsing", () => {
	it("maps a full JSONL stream to a completed AgentResult", () => {
		const r = parseCodexResult({ code: 0, stdout: CODEX_OK, stderr: "" });
		expect(r.status).toBe("completed");
		expect(r.output).toBe("SPIKE_OK");
		expect(r.sessionId).toBe("thr-1");
		expect(r.tokens).toEqual({ used: 221, total: 221, limit: 0 });
	});

	it("no turn.completed → failed", () => {
		const partial = [
			JSON.stringify({ type: "thread.started", thread_id: "t" }),
			JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "x" } }),
		].join("\n");
		expect(parseCodexResult({ code: 0, stdout: partial, stderr: "" }).status).toBe("failed");
	});

	it("spawn failure → failed", () => {
		const r = parseCodexResult({ code: null, stdout: "", stderr: "", spawnError: "ENOENT" });
		expect(r.status).toBe("failed");
		expect(r.stderr).toContain("ENOENT");
	});

	it("tolerates non-JSON noise lines", () => {
		const noisy = `warming up...\n${CODEX_OK}\n`;
		expect(parseCodexResult({ code: 0, stdout: noisy, stderr: "" }).output).toBe("SPIKE_OK");
	});
});

describe("codex adapter — run() wiring", () => {
	it("surfaces the effort-clamp warning via the injected warn sink", async () => {
		const { exec } = fakeExec({ code: 0, stdout: CODEX_OK, stderr: "" });
		const warn = vi.fn();
		const adapter = new CodexExecAdapter(exec, warn);
		await adapter.run(opts({ reasoningEffort: "xhigh" }));
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toMatch(/xhigh/);
	});

	it("no warning for a supported effort", async () => {
		const { exec, calls } = fakeExec({ code: 0, stdout: CODEX_OK, stderr: "" });
		const warn = vi.fn();
		const adapter = new CodexExecAdapter(exec, warn);
		const r = await adapter.run(opts({ reasoningEffort: "medium", cwd: "/run" }));
		expect(warn).not.toHaveBeenCalled();
		expect(r.output).toBe("SPIKE_OK");
		expect(calls[0]?.args).toContain('model_reasoning_effort="medium"');
	});
});
