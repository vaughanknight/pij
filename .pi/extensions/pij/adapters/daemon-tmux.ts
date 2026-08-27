// pij-control-plane — real DaemonPorts adapter (impure seam, Plan 019, T016).
//
// Wires the daemon loop's injected ports to the live machine: tmux capture /
// send-keys (via the shared argv-only `tmux-keys` lib), pane-death probe, the
// Claude transcript directory listing, the clock, and the pid liveness probe.
// Every tmux call is argv-only (no shell) and every read is best-effort (a gone
// pane / missing dir degrades to "" / [] rather than throwing — Pattern P4).

import { execFileSync } from "node:child_process";
import {
	appendFileSync,
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
import type { ProcessSnapshot } from "../core/platform/types.js";

export { composerRegion } from "../core/daemon/pane-signals.js";

import { codexCwdFromMeta, listCodexRollouts } from "../core/harness/codex.js";
import type { SendOutcome } from "../core/ports.js";
import { BUSY_RE, paneWentBusy } from "../core/readiness.js";
import type { DeliveredMessage, HarnessKind, SessionDescriptor } from "../core/types.js";
import {
	buildPeerFrame,
	claudeSessionsDir,
	resolveClaudeSocket,
	sendClaudeFrame,
} from "./claude-socket.js";
import { buildCopilotPrompt, sendCopilotRpc } from "./copilot-rpc.js";
import { NodeProcess } from "./process.js";
import { NodeProcessSnapshot } from "./process-snapshot.js";
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
	/** PoC: where Claude Code registers sessions (default ~/.claude/sessions). */
	readonly claudeSessionsDir?: string;
	/** PoC: ms to wait for a `peer_message_status` drop report after writing. */
	readonly socketAckWaitMs?: number;
}

/** Decide what a THROWN tmux send means: a permanently dead target (`gone`) or a
 *  condition worth retrying (`failed`).
 *
 *  `gone` is the strong verdict — the caller unbinds and stops targeting the pane
 *  forever. It is reserved for the one case tmux actually ANSWERS: the server is
 *  up and says there is no such pane. That is permanent (retrying cannot bring a
 *  pane back) and it is dangerous to keep queueing against, because tmux restarts
 *  `%N` at `%0` in every new server, so a message left queued against a dead
 *  `%315` eventually lands in a STRANGER's pane.
 *
 *  EVERYTHING ELSE FALLS THROUGH TO `failed` ON PURPOSE — most importantly a dead
 *  or unreachable server (`error connecting to …`, `no server running on …`),
 *  which is not an answer at all. This mirrors `observePane` in cli.ts, which
 *  holds the same line for liveness: "no such pane" is an answer, "no tmux" is
 *  not, and only an answer may count as evidence. Treating an unreachable server
 *  as `gone` would let one blip — a socket briefly absent, a server restarting
 *  under us — unbind the ENTIRE fleet at once, which is far worse than retrying
 *  into a server that never returns. The recycled-pane-id hazard on the way back
 *  up is owned by the identity check at bind/send time (`#{pane_pid}`, s072
 *  FIX-1), not by this classifier.
 *
 *  Behaviourally this is exactly the rule that shipped; extracting it changes
 *  nothing at runtime. It is pulled out and exported so the rule can be PROVEN
 *  without an ambient tmux server. Asserting it through a live `sendText` meant
 *  the test silently exercised the no-server branch on any machine without a
 *  server running (notably CI) while claiming to test the no-such-pane one. */
export function classifySendFailure(detail: string): "gone" | "failed" {
	return /can't find pane|no such pane|pane not found/i.test(detail) ? "gone" : "failed";
}

export class DaemonTmux implements DaemonPorts {
	private readonly proc = new NodeProcess();
	private readonly snapshots = new NodeProcessSnapshot();
	private readonly runner: TmuxRunner;
	private readonly sleep: (ms: number) => void;
	private readonly tapFiles = new Map<string, { path: string; offset: number }>();
	private readonly claudeSessionsDir: string;
	private readonly socketAckWaitMs: number;

	constructor(options: DaemonTmuxOptions = {}) {
		const base = options.runner ?? execFileRunner;
		// Benchmark hook (reports/pij-comms-review-2026-08-27/benchmarks.md): when
		// PIJ_BENCH_KEYLOG names a file, every keystroke-bearing tmux call
		// (send-keys / paste-buffer) appends one line, so a scenario can count
		// exactly what reached a pty. Off unless the env var is set.
		const keylog = process.env.PIJ_BENCH_KEYLOG;
		this.runner = keylog
			? (args) => {
					if (args[0] === "send-keys" || args[0] === "paste-buffer") {
						try {
							appendFileSync(keylog, `${Date.now()}\t${args.join(" ").slice(0, 120)}\n`);
						} catch {
							// benchmark telemetry only — never affects delivery
						}
					}
					return base(args);
				}
			: base;
		this.sleep = options.sleep ?? sleepSync;
		this.claudeSessionsDir = options.claudeSessionsDir ?? claudeSessionsDir(homedir());
		this.socketAckWaitMs = options.socketAckWaitMs ?? 150;
	}

	/** PoC (poc/comms-sqlite-socket): Claude inbox-socket delivery. See
	 *  adapters/claude-socket.ts. `no-socket` lets the loop fall back to typing. */
	async sendSocket(
		target: SessionDescriptor,
		message: DeliveredMessage,
	): Promise<SendOutcome | "no-socket"> {
		if (target.harness === "copilot") {
			if (target.rpcPort === undefined || !target.harnessSessionId) return "no-socket";
			const r = await sendCopilotRpc({
				port: target.rpcPort,
				sessionId: target.harnessSessionId,
				prompt: buildCopilotPrompt(message.from, message.body),
				mode: "enqueue",
			});
			if (r.outcome === "confirmed") return "confirmed";
			this.warn(
				`⚠️  copilot RPC FAILED: ${target.id} via 127.0.0.1:${target.rpcPort} — ${r.detail ?? "unknown"}; message stays queued`,
			);
			return "failed";
		}
		if (target.harness !== "claude") return "no-socket";
		const resolved = resolveClaudeSocket({
			pid: target.pid,
			paneId: target.paneId,
			sessionsDir: this.claudeSessionsDir,
		});
		if (!resolved) return "no-socket";
		const line = buildPeerFrame({
			from: message.from,
			body: message.body,
			msgId: message.messageId,
		});
		const result = await sendClaudeFrame(resolved.socketPath, line, {
			ackWaitMs: this.socketAckWaitMs,
		});
		if (result.outcome === "confirmed") return "confirmed";
		this.warn(
			`⚠️  claude SOCKET FAILED: ${target.id} via ${resolved.socketPath} — ${result.detail ?? "unknown"}; message stays queued`,
		);
		return "failed";
	}

	private warn(line: string): void {
		try {
			process.stderr.write(`${line}\n`);
		} catch {
			// diagnostic only
		}
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
			const detail = error instanceof Error ? error.message : String(error);
			const gone = classifySendFailure(detail) === "gone";
			try {
				process.stderr.write(
					gone
						? `⚠️  tmux GONE: pane ${paneId} does not exist — the binding is stale, not the send; message left unconsumed in the mailbox and this pane will no longer be targeted — ${detail}\n`
						: `⚠️  tmux FAILED: send to pane ${paneId} threw before submission — nothing reliably landed; the message stays queued — ${detail}\n`,
				);
			} catch {
				// logging is diagnostic-only — a write failure must not break delivery.
			}
			// NOT `unverified` (plan 071 D7): this path threw BEFORE typing, so the
			// payload did not land and there is no duplicate-turn risk in retrying.
			// Reporting it as `unverified` made the caller consume the durable copy
			// of a message that was never delivered.
			return gone ? "gone" : "failed";
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
		// Submission verification runs for EVERY harness (#40 Defect 5): claude/codex
		// used to fire one Enter and blindly return `confirmed`, so a swallowed Enter
		// (busy composer / render race) stranded the text yet still reported delivered.
		// The oracle (`submissionConfirmed` = pane went busy OR the transcript region
		// changed) and the retry Enter are harness-agnostic; only copilot's focus-IN
		// re-assertion is harness-specific and stays gated behind `wake`.
		for (let attempt = 0; attempt < SUBMIT_ATTEMPTS; attempt++) {
			// Small backoff before every retry Enter (all harnesses). On retries, press
			// Enter against the SAME visible payload; never clear/retype after the first
			// Enter (a submission may already have happened → at-most-once wins).
			if (attempt > 0) {
				// Re-assert focus-IN before the retry only for copilot (the focus-wedge).
				if (wake) wakeCopilotInput(paneId, this.runner, pid);
				this.sleep(WAKE_SETTLE_MS);
			}
			if (wake) sendFocusIn(paneId, this.runner);
			pressKey(paneId, "Enter", 1, this.runner);
			for (let poll = 0; poll < SUBMIT_VERIFY_POLLS; poll++) {
				this.sleep(SUBMIT_VERIFY_MS);
				lastPane = this.capturePane(paneId);
				if (submissionConfirmed(preSubmit, lastPane, text)) return "confirmed";
			}
			// Stop re-pressing once OUR payload is no longer visibly pending: either the
			// composer emptied (submitted) OR its tail is gone / replaced by claude's dim
			// `[2m` ghost-suggestion placeholder. That placeholder is NOT real composer
			// content — we match on the actual payload tail, never the hint — so a
			// submitted message whose composer now shows a dim suggestion is correctly
			// read as "payload gone", not "still pending". Replaying an already-gone
			// payload risks a duplicate turn, and a bare Enter on an empty claude composer
			// is a harmless no-op, so there is nothing to gain from another press. (For a
			// too-short payload the tail can't be matched, so `composerIsEmpty` still
			// carries the break.)
			if (!composerHasTextTail(lastPane, text) || composerIsEmpty(lastPane)) break;
		}
		// The text WAS typed into the composer but no submission was confirmed after the
		// bounded retries — the swallowed-Enter wedge. `unverified` means exactly this
		// (see `SendOutcome`): typed, unconfirmed, consumed at-most-once. NEVER
		// `confirmed`/`delivered`; the "nothing landed" cases are `failed`/`gone`. Log
		// loudly — the harness is named because this path is no longer copilot-only.
		try {
			const tail = text.replace(/\s+/g, " ").slice(-48);
			process.stderr.write(
				`⚠️  ${harness ?? "harness"} UNVERIFIED: send to pane ${paneId} (pid ${pid ?? "?"}) typed the payload but never confirmed submission across ${SUBMIT_ATTEMPTS} Enter attempts — text tail «…${tail}».\n`,
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

	/** ONE whole-table process capture per death sweep (plan 095). Delegated to a
	 *  dedicated module rather than to `NodeProcess`, which `liveness-cost.test.ts`
	 *  keeps subprocess-free because the `pij list` read path leans on it. */
	processSnapshot(): ProcessSnapshot {
		return this.snapshots.capture();
	}
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
