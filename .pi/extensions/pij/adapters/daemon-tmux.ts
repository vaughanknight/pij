// pij-control-plane — real DaemonPorts adapter (impure seam, Plan 019, T016).
//
// Wires the daemon loop's injected ports to the live machine: tmux capture /
// send-keys (via the shared argv-only `tmux-keys` lib), pane-death probe, the
// Claude transcript directory listing, the clock, and the pid liveness probe.
// Every tmux call is argv-only (no shell) and every read is best-effort (a gone
// pane / missing dir degrades to "" / [] rather than throwing — Pattern P4).

import { execFileSync } from "node:child_process";
import {
	closeSync,
	fstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DaemonPorts } from "../core/daemon/loop.js";
import { composerRegion, type PaneListing } from "../core/daemon/pane-signals.js";

export { composerRegion } from "../core/daemon/pane-signals.js";

import { codexCwdFromMeta, listCodexRollouts } from "../core/harness/codex.js";
import type { SendOutcome } from "../core/ports.js";
import { BUSY_RE, paneWentBusy } from "../core/readiness.js";
import type { HarnessKind } from "../core/types.js";
import { NodeProcess } from "./process.js";
import {
	capturePane,
	execFileRunner,
	pressKey,
	sendFocusIn,
	type TmuxRunner,
	typeLiteral,
} from "./tmux-keys.js";

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
function wakeCopilotInput(paneId: string, runner: TmuxRunner, pid?: number): void {
	sendFocusIn(paneId, runner);
	if (pid !== undefined) wakeRenderLoop(pid);
}

// ─── submit verification (the cause-independent wedge fix) ──────────────────
/** Re-check the composer this many times after Enter; re-press Enter only while
 *  the same typed payload is visibly still pending. The payload itself is NEVER
 *  retyped after the first Enter: an empty composer with inconclusive telemetry is
 *  an ambiguous success, and at-most-once delivery wins over speculative replay. */
const SUBMIT_ATTEMPTS = 3;
/** Poll every 250ms for up to 1.25s after Enter. With three Enter attempts,
 *  one 900ms Copilot type-settle, and two 200ms retry wakes, the post-type
 *  verification ceiling is about 5.05s before returning `unverified`. */
const SUBMIT_VERIFY_POLLS = 5;
const SUBMIT_VERIFY_MS = 250;
/** Settle between a WINCH-wake and the retry Enter. */
const WAKE_SETTLE_MS = 200;
/** Total pre-Enter type attempts, including the first, when the composer remains
 *  empty. Each attempt polls for up to 2s, so a pathological pane can block the
 *  synchronous delivery call for up to 6s before submission verification begins. */
export const TYPE_CONFIRM_ATTEMPTS = 3;
export const TYPE_CONFIRM_POLLS = 8;
export const TYPE_CONFIRM_POLL_MS = 250;

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

function clearTypedText(paneId: string, text: string, runner: TmuxRunner): void {
	pressKey(paneId, "BSpace", Math.max(text.length, 1), runner);
}

export interface DaemonTmuxOptions {
	runner?: TmuxRunner;
	sleep?: (ms: number) => void;
}

export class DaemonTmux implements DaemonPorts {
	private readonly proc = new NodeProcess();
	private readonly runner: TmuxRunner;
	private readonly sleep: (ms: number) => void;
	private readonly tapFiles = new Map<string, { path: string; offset: number }>();

	constructor(options: DaemonTmuxOptions = {}) {
		this.runner = options.runner ?? execFileRunner;
		this.sleep = options.sleep ?? sleepSync;
	}

	capturePane(paneId: string): string {
		try {
			return capturePane(paneId, {}, this.runner);
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

	listPanes(): readonly PaneListing[] {
		try {
			const out = this.runner([
				"list-panes",
				"-a",
				"-F",
				"#{pane_id}\t#{pane_dead}\t#{cursor_x}\t#{cursor_y}",
			]);
			return out
				.split("\n")
				.filter((line) => line.length > 0)
				.flatMap((line) => {
					const [paneId, dead, cursorX, cursorY] = line.split("\t");
					if (!paneId) return [];
					const parsedX = Number(cursorX);
					const parsedY = Number(cursorY);
					return [
						{
							paneId,
							dead: dead === "1",
							...(Number.isInteger(parsedX) ? { cursorX: parsedX } : {}),
							...(Number.isInteger(parsedY) ? { cursorY: parsedY } : {}),
						},
					];
				});
		} catch {
			return [];
		}
	}

	attachPaneTap(paneId: string, sinkPath: string): void {
		const existing = this.tapFiles.get(paneId);
		if (existing?.path === sinkPath) return;
		mkdirSync(dirname(sinkPath), { recursive: true });
		writeFileSync(sinkPath, "");
		try {
			this.runner(["pipe-pane", "-O", "-o", "-t", paneId, `cat >> ${shellQuote(sinkPath)}`]);
			this.tapFiles.set(paneId, { path: sinkPath, offset: 0 });
		} catch {
			rmSync(sinkPath, { force: true });
		}
	}

	drainPaneTap(paneId: string): Uint8Array {
		const tap = this.tapFiles.get(paneId);
		if (!tap) return new Uint8Array();
		let fd: number | undefined;
		try {
			fd = openSync(tap.path, "r");
			const size = fstatSync(fd).size;
			const offset = Math.min(tap.offset, size);
			const length = size - offset;
			if (length === 0) {
				tap.offset = size;
				return new Uint8Array();
			}
			const bytes = Buffer.allocUnsafe(length);
			let bytesRead = 0;
			while (bytesRead < length) {
				const count = readSync(fd, bytes, bytesRead, length - bytesRead, offset + bytesRead);
				if (count === 0) break;
				bytesRead += count;
			}
			tap.offset = size;
			return bytes.subarray(0, bytesRead);
		} catch {
			return new Uint8Array();
		} finally {
			if (fd !== undefined) {
				try {
					closeSync(fd);
				} catch {
					// Best-effort tap reads must not stop the daemon.
				}
			}
		}
	}

	detachPaneTap(paneId: string): void {
		const tap = this.tapFiles.get(paneId);
		try {
			this.runner(["pipe-pane", "-t", paneId]);
		} catch {
			// Gone panes already dropped their pipe.
		}
		this.tapFiles.delete(paneId);
		if (tap) rmSync(tap.path, { force: true });
	}

	sendText(paneId: string, text: string, harness?: HarnessKind, pid?: number): SendOutcome {
		try {
			return this.sendTextUnchecked(paneId, text, harness, pid);
		} catch (error) {
			try {
				const detail = error instanceof Error ? error.message : String(error);
				process.stderr.write(
					`⚠️  tmux FAILED: send to pane ${paneId} threw before submission — nothing reliably landed; the message stays queued — ${detail}\n`,
				);
			} catch {
				// logging is diagnostic-only — a write failure must not break delivery.
			}
			// NOT `unverified` (plan 071 D7): this path threw BEFORE typing, so the
			// payload did not land and there is no duplicate-turn risk in retrying.
			// Reporting it as `unverified` made the caller consume the durable copy
			// of a message that was never delivered.
			return "failed";
		}
	}

	/** The actual tmux interaction. The public boundary above converts every pane
	 *  race/disappearance into the port's non-throwing `unverified` outcome so one
	 *  stale descriptor cannot abort the daemon's whole delivery tick. */
	private sendTextUnchecked(
		paneId: string,
		text: string,
		harness?: HarnessKind,
		pid?: number,
	): SendOutcome {
		const wake = needsInputWake(harness);
		// Wake a BACKGROUNDED copilot BEFORE typing (the real wedge fix): with tmux
		// `focus-events on`, a pane you've switched away from is in focus-OUT state and
		// copilot then swallows Enter-as-submit, stranding the message in the composer.
		if (wake) wakeCopilotInput(paneId, this.runner, pid);
		typeLiteral(paneId, text, this.runner);
		if (wake) {
			// Retyping is safe only BEFORE the first Enter: no submission can have happened.
			for (let typedAttempt = 0; typedAttempt < TYPE_CONFIRM_ATTEMPTS; typedAttempt++) {
				let shouldRetype = true;
				for (let poll = 0; poll < TYPE_CONFIRM_POLLS; poll++) {
					this.sleep(TYPE_CONFIRM_POLL_MS);
					const typedPane = this.capturePane(paneId);
					if (composerHasTextTail(typedPane, text) || !composerIsEmpty(typedPane)) {
						shouldRetype = false;
						break;
					}
				}
				if (!shouldRetype || typedAttempt + 1 >= TYPE_CONFIRM_ATTEMPTS) break;
				wakeCopilotInput(paneId, this.runner, pid);
				clearTypedText(paneId, text, this.runner);
				typeLiteral(paneId, text, this.runner);
			}
		}
		// Settle before Enter (T020/R-02): a literal burst can trip the harness's paste
		// detection + a short idle-debounce; an Enter fired mid-debounce is swallowed.
		this.sleep(enterSettleMs(harness));
		const preSubmit = this.capturePane(paneId);
		let lastPane = preSubmit;
		for (let attempt = 0; attempt < SUBMIT_ATTEMPTS; attempt++) {
			// Re-assert focus-IN right before Return. On retries, press Enter against the
			// SAME visible payload; never clear/retype after submission became possible.
			if (attempt > 0) {
				wakeCopilotInput(paneId, this.runner, pid);
				this.sleep(WAKE_SETTLE_MS);
			}
			if (wake) sendFocusIn(paneId, this.runner);
			pressKey(paneId, "Enter", 1, this.runner);
			if (!wake) return "confirmed";
			for (let poll = 0; poll < SUBMIT_VERIFY_POLLS; poll++) {
				this.sleep(SUBMIT_VERIFY_MS);
				lastPane = this.capturePane(paneId);
				if (submissionConfirmed(preSubmit, lastPane, text)) return "confirmed";
			}
			// Empty means the payload left the composer. Even without a visible busy or
			// transcript transition, replaying could duplicate an already-accepted turn.
			if (composerIsEmpty(lastPane)) break;
		}
		try {
			const tail = text.replace(/\s+/g, " ").slice(-48);
			process.stderr.write(
				`⚠️  copilot UNVERIFIED: send to pane ${paneId} (pid ${pid ?? "?"}) lacked positive submission confirmation; payload was typed once — text tail «…${tail}».\n`,
			);
		} catch {
			// logging is diagnostic-only — a write failure must not break delivery.
		}
		return "unverified";
	}

	sendKey(paneId: string, key: "Escape" | "Enter" | "1" | "2"): void {
		pressKey(paneId, key, 1, this.runner);
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

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
