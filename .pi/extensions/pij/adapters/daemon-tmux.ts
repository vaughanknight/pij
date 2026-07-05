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
import type { SendOutcome } from "../core/ports.js";
import { BUSY_RE, paneWentBusy } from "../core/readiness.js";
import type { HarnessKind } from "../core/types.js";
import { NodeProcess } from "./process.js";
import { capturePane, execFileRunner, pressKey, sendFocusIn, typeLiteral } from "./tmux-keys.js";

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

/** Does this harness need an input-wake before a send-keys? Copilot's composer
 *  IGNORES Enter-as-submit when its pane is BACKGROUNDED: with tmux `focus-events
 *  on`, switching away from the pane sends copilot a focus-OUT (CSI O) and it then
 *  swallows the Return — a peer message types into the composer but strands unsent
 *  (operator-reported "stuck in the input box", reproduced live). The fix is a
 *  focus-IN (CSI I) injection before the keystrokes (see {@link wakeCopilotInput});
 *  a SIGWINCH redraw alone does NOT clear it, because copilot gates submit on FOCUS
 *  state, not render. Claude/codex don't exhibit it. Pure + exported for test. */
export function needsInputWake(harness?: HarnessKind): boolean {
	return harness === "copilot";
}

/** Best-effort SIGWINCH to a pane's app process — forces a redraw at the same size.
 *  A SECONDARY wake (the focus-IN in {@link wakeCopilotInput} is the real fix for the
 *  backgrounded-copilot wedge); kept because a redraw is harmless and can help a
 *  genuinely stale render. Swallow every error: a gone pid (ESRCH) / perms (EPERM)
 *  just means no wake this send, never a throw. */
function wakeRenderLoop(pid: number): void {
	try {
		process.kill(pid, "SIGWINCH");
	} catch {
		// pid gone or unsignalable — best-effort; the send proceeds regardless.
	}
}

/** Wake a backgrounded copilot so its next Enter submits: inject a focus-IN escape
 *  (CSI I — the PROVEN fix: a focus-OUT'd copilot ignores Enter until it sees focus-
 *  IN) and, secondarily, SIGWINCH the app for a redraw. Best-effort, copilot-only. */
function wakeCopilotInput(paneId: string, pid?: number): void {
	sendFocusIn(paneId, execFileRunner);
	if (pid !== undefined) wakeRenderLoop(pid);
}

// ─── submit verification (the cause-independent wedge fix) ──────────────────
/** Re-check the composer this many times after Enter; WINCH+re-Enter each time the
 *  line is still pending. 3 is enough to ride out a parked loop without blocking the
 *  single-threaded daemon tick for long. */
const SUBMIT_RETRIES = 3;
/** Poll every 250ms for up to 1.25s after Enter. With 3 submit attempts and the
 *  900ms copilot enter-settle, worst-case copilot latency is about 6.45s before
 *  returning `unverified` (3 * (900 + 5*250)). */
const SUBMIT_VERIFY_POLLS = 5;
const SUBMIT_VERIFY_MS = 250;
/** Settle between a WINCH-wake and the retry Enter. */
const WAKE_SETTLE_MS = 200;
/** Number of times to recover a total-loss composer by re-typing before Enter. */
const TYPE_CONFIRM_RETRIES = 3;

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

function normalizedTail(sent: string): string {
	return sent.replace(/\s+/g, "").slice(-24);
}

function normalizedComposer(pane: string): string {
	return composerRegion(pane).replace(/[❯\s]/g, "");
}

/** Positive typed-text check: the literal tail is visible in the live composer. */
export function composerHasTextTail(pane: string, sent: string): boolean {
	const tail = normalizedTail(sent);
	if (tail.length < 4) return true;
	return normalizedComposer(pane).includes(tail);
}

/** Total-loss check: the composer has no typed payload after the prompt. */
export function composerIsEmpty(pane: string): boolean {
	return normalizedComposer(pane).length === 0;
}

function transcriptRegion(pane: string): string {
	const lines = pane.split("\n");
	const rules: number[] = [];
	for (let i = 0; i < lines.length; i++) if (/─{8,}/.test(lines[i] ?? "")) rules.push(i);
	const lo = rules.at(-2);
	if (lo !== undefined) return lines.slice(0, lo).join("\n");
	return lines.slice(0, -4).join("\n");
}

/** Fallback for short ready→busy→ready turns missed between polls: the composer
 *  cleared and the transcript region changed, so a fresh visible event landed. */
export function freshTranscriptEvent(preSubmit: string, postSubmit: string, sent: string): boolean {
	return (
		!BUSY_RE.test(preSubmit) &&
		!composerHasTextTail(postSubmit, sent) &&
		composerIsEmpty(postSubmit) &&
		transcriptRegion(postSubmit) !== transcriptRegion(preSubmit)
	);
}

export function submissionConfirmed(preSubmit: string, postSubmit: string, sent: string): boolean {
	return paneWentBusy(preSubmit, postSubmit) || freshTranscriptEvent(preSubmit, postSubmit, sent);
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

	sendText(paneId: string, text: string, harness?: HarnessKind, pid?: number): SendOutcome {
		const wake = needsInputWake(harness);
		for (let attempt = 0; attempt < SUBMIT_RETRIES; attempt++) {
			// Wake a BACKGROUNDED copilot BEFORE typing (the real wedge fix): with tmux
			// `focus-events on`, a pane you've switched away from is in focus-OUT state and
			// copilot then swallows Enter-as-submit, stranding the message in the composer.
			// A focus-IN (CSI I) injection flips it back to focused-input mode so the Return
			// below actually submits (proven live). Copilot-only, best-effort.
			if (wake) wakeCopilotInput(paneId, pid);
			typeLiteral(paneId, text, execFileRunner);
			if (wake) {
				for (let typedAttempt = 0; typedAttempt < TYPE_CONFIRM_RETRIES; typedAttempt++) {
					const typedPane = this.capturePane(paneId);
					if (composerHasTextTail(typedPane, text)) break;
					if (!composerIsEmpty(typedPane)) break;
					wakeCopilotInput(paneId, pid);
					typeLiteral(paneId, text, execFileRunner);
				}
			}
			// Settle before Enter (T020/R-02): a literal burst can trip the harness's paste
			// detection + a short idle-debounce; an Enter fired mid-debounce is swallowed, so
			// the submit lags or strands the text. Wait it out (synchronously — the daemon tick
			// is single-threaded). The window is HARNESS-SPECIFIC (Copilot's needs longer).
			sleepSync(enterSettleMs(harness));
			const preSubmit = this.capturePane(paneId);
			// Re-assert focus-IN right before the Return (a focus-OUT can arrive between the
			// type and the Enter), then submit.
			if (wake) sendFocusIn(paneId, execFileRunner);
			pressKey(paneId, "Enter", 1, execFileRunner);
			if (!wake) return "confirmed";
			for (let poll = 0; poll < SUBMIT_VERIFY_POLLS; poll++) {
				sleepSync(SUBMIT_VERIFY_MS);
				if (submissionConfirmed(preSubmit, this.capturePane(paneId), text)) return "confirmed";
			}
			wakeCopilotInput(paneId, pid);
			sleepSync(WAKE_SETTLE_MS);
		}
		try {
			const tail = text.replace(/\s+/g, " ").slice(-48);
			process.stderr.write(
				`⚠️  copilot UNVERIFIED: send to pane ${paneId} (pid ${pid ?? "?"}) never showed a busy transition or fresh transcript event after ${SUBMIT_RETRIES} submit attempts — text tail «…${tail}».\n`,
			);
		} catch {
			// logging is diagnostic-only — a write failure must not break delivery.
		}
		return "unverified";
	}

	sendKey(paneId: string, key: "Escape" | "Enter"): void {
		pressKey(paneId, key, 1, execFileRunner);
	}

	killPane(paneId: string): void {
		// Idempotent: a gone pane/window just errors out — swallow it (Pattern P4).
		try {
			execFileSync("tmux", ["kill-pane", "-t", paneId], { stdio: "ignore" });
		} catch {
			/* already gone → nothing to close */
		}
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
