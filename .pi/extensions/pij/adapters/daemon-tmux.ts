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
import type { HarnessKind } from "../core/types.js";
import { NodeProcess } from "./process.js";
import { capturePane, execFileRunner, pressKey, typeLiteral } from "./tmux-keys.js";

/** Debounce window a harness applies to a pasted/burst input before the line is
 *  submittable — the settle the daemon waits out BEFORE pressing Enter so the
 *  keystroke lands AFTER the paste-pill resolves (an Enter fired mid-debounce is
 *  swallowed and the text strands in the composer). The value is HARNESS-SPECIFIC:
 *  Claude's pill resolves fast (350ms, tuned at T020), but Copilot CLI's composer
 *  needs materially longer or the Return is eaten and the message sits unsent in
 *  the input box (operator-reported, repeatedly). `pi` never reaches here (the
 *  daemon never injects into pi — it self-drains); listed only for totality. */
const ENTER_SETTLE_BY_HARNESS: Record<HarnessKind, number> = {
	claude: 350,
	copilot: 900,
	codex: 350,
	pi: 350,
};

/** The Enter-settle (ms) for a harness — pure + exported so the per-harness rule
 *  is unit-testable without driving a live pane. An unknown/absent harness falls
 *  back to the Claude default (the long-standing behaviour). */
export function enterSettleMs(harness?: HarnessKind): number {
	return harness ? (ENTER_SETTLE_BY_HARNESS[harness] ?? 350) : 350;
}

/** Does this harness need a render-loop WINCH wake before a send-keys? Copilot's
 *  TUI parks its input/render loop when its pane is backgrounded — keystrokes
 *  (text AND Enter) then strand until a SIGWINCH-class event forces a redraw, so
 *  a peer message can silently never land (operator-reported wedge). Claude/codex
 *  don't exhibit it. Pure + exported so the per-harness rule is unit-testable. */
export function needsRenderWake(harness?: HarnessKind): boolean {
	return harness === "copilot";
}

/** Best-effort SIGWINCH to a pane's app process to wake a parked render/input loop
 *  (the copilot wedge). `process.kill(pid, "SIGWINCH")` re-renders at the same size
 *  — verified safe (copilot stays up, next keystrokes land). Swallow every error:
 *  a gone pid (ESRCH) / perms (EPERM) just means no wake this send, never a throw. */
function wakeRenderLoop(pid: number): void {
	try {
		process.kill(pid, "SIGWINCH");
	} catch {
		// pid gone or unsignalable — best-effort; the send proceeds regardless.
	}
}

// ─── submit verification (the cause-independent wedge fix) ──────────────────
/** Re-check the composer this many times after Enter; WINCH+re-Enter each time the
 *  line is still pending. 3 is enough to ride out a parked loop without blocking the
 *  single-threaded daemon tick for long. */
const SUBMIT_RETRIES = 3;
/** Wait after an Enter before reading the pane back — long enough for copilot to
 *  clear the composer on a real submit, short enough to retry quickly when it didn't. */
const SUBMIT_VERIFY_MS = 450;
/** Settle between a WINCH-wake and the retry Enter. */
const WAKE_SETTLE_MS = 200;

/** The composer box's contents from a captured pane. Copilot boxes its input between
 *  two horizontal-rule lines (`────`); the `❯` prompt + any typed text live inside.
 *  Returns the region between the LAST two rules (the live composer), or the bottom
 *  few lines if the box can't be located. Pure + exported for test. */
export function composerRegion(pane: string): string {
	const lines = pane.split("\n");
	const rules: number[] = [];
	for (let i = 0; i < lines.length; i++) if (/─{8,}/.test(lines[i] ?? "")) rules.push(i);
	const lo = rules.at(-2);
	const hi = rules.at(-1);
	if (lo !== undefined && hi !== undefined) return lines.slice(lo + 1, hi).join("\n");
	return lines.slice(-4).join("\n");
}

/** Did the text we just sent FAIL to submit — i.e. is its tail still sitting in the
 *  composer box (the wedge)? Compares a whitespace-stripped tail of `sent` against the
 *  composer region (prompt char + whitespace stripped). An empty composer (a real
 *  submit moved the line into the transcript) → false. A too-short `sent` → false (can't
 *  match reliably; assume submitted rather than risk a spurious double-Enter). Pure +
 *  exported for test. NOTE: a very long send copilot collapses into a "[Pasted text]"
 *  pill is not matched (the literal isn't shown) — a known gap, logged not silent. */
export function composerPending(pane: string, sent: string): boolean {
	const tail = sent.replace(/\s+/g, "").slice(-24);
	if (tail.length < 4) return false;
	const region = composerRegion(pane).replace(/[❯\s]/g, "");
	return region.includes(tail);
}

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

	sendText(paneId: string, text: string, harness?: HarnessKind, pid?: number): void {
		// Wake a parked copilot render loop BEFORE typing (the backgrounded-pane wedge):
		// a SIGWINCH to the pane's app process forces a redraw so the keystrokes below
		// are actually consumed instead of stranding in a frozen composer. Best-effort,
		// copilot-only, no-op when we have no pid.
		if (pid !== undefined && needsRenderWake(harness)) wakeRenderLoop(pid);
		typeLiteral(paneId, text, execFileRunner);
		// Settle before Enter (T020/R-02): a literal burst trips the harness's paste
		// detection, which parks the text in a "pasted text" pill and runs a short
		// idle-debounce. An Enter fired immediately lands mid-debounce and is swallowed,
		// so the submit lags or strands the text in the composer. Wait out the debounce
		// (synchronously — the daemon tick is single-threaded) so Enter submits crisply.
		// The window is HARNESS-SPECIFIC: Copilot's composer needs longer than Claude's.
		sleepSync(enterSettleMs(harness));
		pressKey(paneId, "Enter", 1, execFileRunner);
		// Verify-and-retry (copilot, cause-independent): the preemptive WINCH + settle
		// handle the *known* wedge/debounce, but the wedge has been seen even foreground,
		// so don't trust the single Enter — read the pane back and confirm the line left
		// the composer. While its tail is still pending, WINCH-wake + re-press Enter. This
		// checks "did it actually submit?" regardless of WHY it stuck. Copilot-only (claude/
		// codex submit reliably); re-Enter fires ONLY when text is still detected, so a
		// real submit never gets a spurious second Enter (no double-send).
		if (needsRenderWake(harness)) {
			for (let attempt = 0; attempt < SUBMIT_RETRIES; attempt++) {
				sleepSync(SUBMIT_VERIFY_MS);
				if (!composerPending(this.capturePane(paneId), text)) return; // submitted — done
				if (pid !== undefined) wakeRenderLoop(pid);
				sleepSync(WAKE_SETTLE_MS);
				pressKey(paneId, "Enter", 1, execFileRunner);
			}
		}
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
