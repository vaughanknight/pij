// pij-control-plane — real DaemonPorts adapter (impure seam, Plan 019, T016).
//
// Wires the daemon loop's injected ports to the live machine: tmux capture /
// send-keys (via the shared argv-only `tmux-keys` lib), pane-death probe, the
// Claude transcript directory listing, the clock, and the pid liveness probe.
// Every tmux call is argv-only (no shell) and every read is best-effort (a gone
// pane / missing dir degrades to "" / [] rather than throwing — Pattern P4).

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DaemonPorts } from "../core/daemon/loop.js";
import { codexCwdFromMeta, listCodexRollouts } from "../core/harness/codex.js";
import { NodeProcess } from "./process.js";
import { capturePane, execFileRunner, pressKey, typeLiteral } from "./tmux-keys.js";

/** Debounce window Claude Code applies to a pasted/burst input before the line
 *  is submittable. Tuned by observation (T020). */
const ENTER_SETTLE_MS = 350;

/** Block the current thread for `ms` without spawning a process. The daemon tick
 *  is synchronous, so a brief settle here is simpler than threading async. */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class DaemonTmux implements DaemonPorts {
	private readonly proc = new NodeProcess();

	capturePane(paneId: string): string {
		try {
			return capturePane(paneId, {}, execFileRunner);
		} catch {
			return ""; // pane unreadable → treat as no signal (booting)
		}
	}

	isPaneDead(paneId: string): boolean {
		try {
			const out = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_dead}"], {
				encoding: "utf8",
			});
			return out.trim() === "1";
		} catch {
			return true; // the pane (or window) is gone entirely
		}
	}

	sendText(paneId: string, text: string): void {
		typeLiteral(paneId, text, execFileRunner);
		// Settle before Enter (T020/R-02): a literal burst trips Claude Code's
		// paste detection, which parks the text in a "pasted text" pill and runs a
		// short idle-debounce. An Enter fired immediately lands mid-debounce and is
		// swallowed, so the submit lags or needs a second key. Wait out the debounce
		// (synchronously — the daemon tick is single-threaded) so Enter submits crisply.
		sleepSync(ENTER_SETTLE_MS);
		pressKey(paneId, "Enter", 1, execFileRunner);
	}

	sendKey(paneId: string, key: "Escape" | "Enter"): void {
		pressKey(paneId, key, 1, execFileRunner);
	}

	listTranscripts(dir: string): string[] {
		try {
			return readdirSync(dir)
				.filter((n) => n.endsWith(".jsonl"))
				.map((n) => join(dir, n));
		} catch {
			return []; // dir not created yet (claude hasn't written a transcript)
		}
	}

	listTranscriptsDeep(dir: string): string[] {
		// Codex's date-nested tree (`<root>/YYYY/MM/DD/rollout-*.jsonl`) — the pure
		// walk recurses; we inject a best-effort (errors → []) per-dir name reader.
		return listCodexRollouts((d) => {
			try {
				return readdirSync(d);
			} catch {
				return [];
			}
		}, dir);
	}

	readTranscriptCwd(path: string): string | null {
		try {
			// `session_meta` is line 1 — slice off the first newline so we parse just it.
			const raw = readFileSync(path, "utf8");
			const nl = raw.indexOf("\n");
			return codexCwdFromMeta(nl === -1 ? raw : raw.slice(0, nl));
		} catch {
			return null; // unreadable (mid-write / gone) → no cwd confirmation this tick
		}
	}

	home(): string {
		return homedir();
	}

	now(): number {
		return Date.now();
	}

	isAlive(pid: number): boolean {
		return this.proc.isAlive(pid);
	}
}
