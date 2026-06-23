// pij-messaging — real tmux adapter (argv-only execFileSync).
//
// The ONLY new impure seam in Phase 1 (Pattern P2). All tmux calls use
// argv arrays — never shell strings (AC-09). Mirrors the discipline from
// harness/driver/tmux.ts but cannot import it (different module boundary).
//
// tmux version requirement: 3.0+ for repeated -e KEY=VAL on new-window.

import { type ExecFileSyncOptions, execFileSync } from "node:child_process";

import type { NewWindowOpts, TmuxPort } from "../core/ports.js";
import { err, ok, type Result } from "../core/types.js";

// ─── Internal primitive ─────────────────────────────────────────────────────

const EXEC_OPTS: ExecFileSyncOptions = {
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
};

function tmux(args: string[]): string {
	// AC-09: argv array — never args.join(" "). No shell interpretation.
	const out = execFileSync("tmux", args, EXEC_OPTS);
	return typeof out === "string" ? out : out.toString("utf8");
}

function tmuxSafe(args: string[]): void {
	try {
		tmux(args);
	} catch {
		/* swallow — used for idempotent teardown */
	}
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class TmuxAdapter implements TmuxPort {
	/**
	 * Create a new tmux window, capture the %N pane id via -P -F '#{pane_id}'.
	 *
	 * Argv construction:
	 *   tmux new-window -P -F '#{pane_id}' -n <name> [-c <cwd>]
	 *        [-e KEY=VAL …] <cmd> [args…]
	 *
	 * Env vars ride repeated -e KEY=VAL (tmux 3.0+); no shell interpretation.
	 */
	newWindow(opts: NewWindowOpts): Result<{ paneId: string }> {
		const args = ["new-window", "-P", "-F", "#{pane_id}", "-n", opts.name];

		if (opts.cwd !== undefined) {
			args.push("-c", opts.cwd);
		}

		for (const [k, v] of Object.entries(opts.env)) {
			args.push("-e", `${k}=${v}`);
		}

		// Command and its argv come last
		args.push(opts.cmd, ...opts.args);

		try {
			const raw = tmux(args);
			const paneId = raw.trim();
			if (!/^%\d+$/.test(paneId)) {
				return err("E-ARG", `unexpected pane_id format: ${JSON.stringify(paneId)}`);
			}
			return ok({ paneId });
		} catch (e) {
			return err("E-ARG", `tmux new-window failed: ${(e as Error).message}`);
		}
	}

	/**
	 * Kill a window by pane id. Swallows all errors (idempotent — the window
	 * may already be gone when close() fires).
	 *
	 *   tmux kill-window -t %N
	 */
	killWindow(paneId: string): Result<void> {
		tmuxSafe(["kill-window", "-t", paneId]);
		return ok(undefined);
	}

	/**
	 * Returns the current tmux session name if running inside tmux, else null.
	 *
	 * Detection: $TMUX_PANE is set by tmux when running inside a session.
	 * Session name: tmux display-message -p '#{session_name}'.
	 */
	currentSession(): string | null {
		if (!process.env.TMUX_PANE) return null;
		try {
			const name = tmux(["display-message", "-p", "#{session_name}"]).trim();
			return name || null;
		} catch {
			return null;
		}
	}
}
