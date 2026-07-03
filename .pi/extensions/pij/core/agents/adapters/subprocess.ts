// Injectable subprocess seam for the headless CLI adapters (claude/codex).
//
// The adapters take an `ExecCommand` in their constructor so unit tests can fake
// the subprocess (no real CLI, no tokens) while production uses `nodeExec`.
// stdin is closed (`ignore`) — codex otherwise prints "Reading additional input
// from stdin…" and waits (T004 spike finding).

import { spawn } from "node:child_process";

export interface ExecResult {
	/** Process exit code, or null if killed by signal. */
	code: number | null;
	stdout: string;
	stderr: string;
	/** Set when the process could not be spawned at all (e.g. ENOENT on PATH). */
	spawnError?: string;
}

export type ExecCommand = (
	cmd: string,
	args: string[],
	opts: { cwd?: string; timeoutMs?: number },
) => Promise<ExecResult>;

/** Real subprocess runner: spawn, buffer stdout/stderr, resolve on exit. Never
 *  rejects — a spawn failure resolves with `spawnError` set so adapters map it
 *  to a failed `AgentResult` rather than throwing. */
export const nodeExec: ExecCommand = (cmd, args, opts) =>
	new Promise<ExecResult>((resolve) => {
		const child = spawn(cmd, args, {
			cwd: opts.cwd,
			stdio: ["ignore", "pipe", "pipe"],
			...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("error", (err) => {
			resolve({ code: null, stdout, stderr, spawnError: err.message });
		});
		child.on("close", (code) => {
			resolve({ code, stdout, stderr });
		});
	});
