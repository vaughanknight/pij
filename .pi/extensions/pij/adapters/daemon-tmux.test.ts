// pij-control-plane — per-harness Enter-settle rule (task #24).
//
// The bug: the daemon waited a single Claude-tuned 350ms before pressing Enter,
// so a Copilot send had its Return swallowed mid-debounce and the message stranded
// in the composer. The fix makes the settle harness-specific. These tests pin the
// rule itself (pure, no live pane); the Dim-0 anchor is "copilot > claude" — flatten
// the table back to one value and these go RED.

import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	composerHasTextTail,
	composerIsEmpty,
	composerPending,
	composerRegion,
	DaemonTmux,
	enterSettleMs,
	freshTranscriptEvent,
	needsInputWake,
	submissionConfirmed,
} from "./daemon-tmux.js";
import type { TmuxRunner } from "./tmux-keys.js";

const SENT = "[pij from pij-5lztp8] (pij delivery diagnostic — please ignore)";
const NON_BMP_SENT = "[pij from pij-x] hi 😀";
const PANE_ID = "%42";
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Real copilot pane shapes (composer boxed between two ──── rules).
const STUCK_PANE = [
	" ~/substrate/harness-engineering",
	" Session: 1729 AIC used",
	"────────────────────────────────────────────",
	"❯ [pij from pij-5lztp8] (pij delivery diagnostic —",
	"  please ignore)",
	"────────────────────────────────────────────",
	" @ files · # issues                  GPT-5.5 · 1.1M context",
].join("\n");

const EMPTY_PANE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 16 AIC used",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" / commands · ? help · tab next tab   GPT-5.5 · 1.1M context",
].join("\n");

const BUSY_PANE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 17 AIC used",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" ◎ Working · 241 B esc interrupt   GPT-5.5 · 1.1M context",
].join("\n");

// The message left the composer, but Copilot completed too quickly (or redraw lag
// hid the transcript change), so neither positive confirmation signal is visible.
const AMBIGUOUS_EMPTY_AFTER_ENTER = [
	" ~/substrate/harness-engineering",
	" Session: 1729 AIC used",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" @ files · # issues                  GPT-5.5 · 1.1M context",
].join("\n");

const BUSY_TRANSCRIPT_CHANGED_EMPTY_PANE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 17 AIC used",
	"Unrelated prior turn is still streaming.",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" ◎ Working · 391 B esc interrupt   GPT-5.5 · 1.1M context",
].join("\n");

const SHORT_TURN_DONE = [
	" ~/pi-hacking/pij [⎇ main*%]   Session: 17 AIC used",
	"[pij from pij-5lztp8] (pij delivery diagnostic — please ignore)",
	"Done.",
	"────────────────────────────────────────────",
	"❯",
	"────────────────────────────────────────────",
	" / commands · ? help · tab next tab   GPT-5.5 · 1.1M context",
].join("\n");

describe("enterSettleMs — per-harness Enter settle", () => {
	it("gives copilot a LONGER settle than claude (the whole point of task #24)", () => {
		// If both collapse to the same value, the swallowed-Enter bug returns.
		expect(enterSettleMs("copilot")).toBeGreaterThan(enterSettleMs("claude"));
	});

	describe("DaemonTmux pane signal plumbing", () => {
		it("lists every server pane with dead and cursor metadata", () => {
			const calls: string[][] = [];
			const adapter = new DaemonTmux({
				runner: (args) => {
					calls.push(args);
					return "%1\t0\t2\t23\n%2\t1\t0\t0\n";
				},
			});
			expect(adapter.listPanes()).toEqual([
				{ paneId: "%1", dead: false, cursorX: 2, cursorY: 23 },
				{ paneId: "%2", dead: true, cursorX: 0, cursorY: 0 },
			]);
			expect(calls).toContainEqual([
				"list-panes",
				"-a",
				"-F",
				"#{pane_id}\t#{pane_dead}\t#{cursor_x}\t#{cursor_y}",
			]);
		});

		it("attaches one pipe, reads only each new byte delta, and detaches cleanly", () => {
			const calls: string[][] = [];
			const dir = mkdtempSync(join(tmpdir(), "pij-pane-tap-"));
			tempDirs.push(dir);
			const sink = join(dir, "pane.raw");
			const initialSize = 1024 * 1024;
			const adapter = new DaemonTmux({
				runner: (args) => {
					calls.push(args);
					return "";
				},
			});

			adapter.attachPaneTap(PANE_ID, sink);
			writeFileSync(sink, Buffer.alloc(initialSize, "a"));
			expect(adapter.drainPaneTap(PANE_ID)).toHaveLength(initialSize);

			const allocationSpy = vi.spyOn(Buffer, "allocUnsafe");
			appendFileSync(sink, "two");
			expect(Buffer.from(adapter.drainPaneTap(PANE_ID)).toString()).toBe("two");
			expect(allocationSpy).toHaveBeenCalledTimes(1);
			expect(allocationSpy).toHaveBeenCalledWith(3);
			allocationSpy.mockRestore();
			adapter.detachPaneTap(PANE_ID);

			expect(calls[0]?.slice(0, 5)).toEqual(["pipe-pane", "-O", "-o", "-t", PANE_ID]);
			expect(calls.at(-1)).toEqual(["pipe-pane", "-t", PANE_ID]);
		});
	});

	it("copilot waits long enough for its composer (>= 900ms)", () => {
		expect(enterSettleMs("copilot")).toBeGreaterThanOrEqual(900);
	});

	it("claude keeps its long-standing 350ms", () => {
		expect(enterSettleMs("claude")).toBe(350);
	});

	it("codex uses the claude-class default", () => {
		expect(enterSettleMs("codex")).toBe(350);
	});

	it("an absent/unknown harness falls back to the claude default (350)", () => {
		expect(enterSettleMs(undefined)).toBe(350);
	});
});

describe("needsInputWake — per-harness focus-IN input-wake before send (the wedge fix)", () => {
	it("copilot needs an input wake (backgrounded/focus-OUT → it swallows Enter)", () => {
		// If this flips false, the daemon stops focus-IN-waking copilot → the wedge returns.
		expect(needsInputWake("copilot")).toBe(true);
	});

	it("claude + codex do NOT (they don't exhibit the wedge)", () => {
		expect(needsInputWake("claude")).toBe(false);
		expect(needsInputWake("codex")).toBe(false);
	});

	it("an absent harness does not wake", () => {
		expect(needsInputWake(undefined)).toBe(false);
	});
});

describe("composerPending — submit verification (the cause-independent retry gate)", () => {
	it("detects a STILL-PENDING line stranded in the composer (the wedge) → retry", () => {
		// If this flips false, the daemon stops retrying a wedged send → message lost.
		expect(composerPending(STUCK_PANE, SENT)).toBe(true);
	});

	describe("positive send confirmation helpers", () => {
		it("detects typed text vs total-loss empty composer before Enter", () => {
			expect(composerHasTextTail(STUCK_PANE, SENT)).toBe(true);
			expect(composerIsEmpty(EMPTY_PANE)).toBe(true);
			expect(composerHasTextTail(EMPTY_PANE, SENT)).toBe(false);
		});

		it("confirms a busy transition after submit, but not an already-busy pane", () => {
			expect(submissionConfirmed(STUCK_PANE, BUSY_PANE, SENT)).toBe(true);
			expect(submissionConfirmed(BUSY_PANE, BUSY_PANE, SENT)).toBe(false);
		});

		it("confirms a short ready→busy→ready turn by fresh transcript fallback", () => {
			expect(freshTranscriptEvent(STUCK_PANE, SHORT_TURN_DONE, SENT)).toBe(true);
			expect(submissionConfirmed(STUCK_PANE, SHORT_TURN_DONE, SENT)).toBe(true);
		});

		it("does not confirm changed transcript fallback when the pre-submit pane was already busy", () => {
			expect(freshTranscriptEvent(BUSY_PANE, BUSY_TRANSCRIPT_CHANGED_EMPTY_PANE, SENT)).toBe(false);
			expect(submissionConfirmed(BUSY_PANE, BUSY_TRANSCRIPT_CHANGED_EMPTY_PANE, SENT)).toBe(false);
			expect(freshTranscriptEvent(STUCK_PANE, SHORT_TURN_DONE, SENT)).toBe(true);
		});
	});

	function repeatedCapture(pane: string, count: number): string[] {
		return Array.from({ length: count }, () => pane);
	}

	function scriptedTmux(captures: string[]): { calls: string[][]; runner: TmuxRunner } {
		const calls: string[][] = [];
		let captureIndex = 0;
		return {
			calls,
			runner: (args) => {
				calls.push(args);
				if (args[0] !== "capture-pane") return "";
				const captured = captures[captureIndex] ?? captures.at(-1) ?? "";
				captureIndex++;
				return captured;
			},
		};
	}

	function typeArgv(): string[] {
		return ["send-keys", "-t", PANE_ID, "-l", SENT];
	}

	function clearArgv(text = SENT): string[] {
		return ["send-keys", "-t", PANE_ID, "-N", String(text.length), "BSpace"];
	}

	function enterArgv(): string[] {
		return ["send-keys", "-t", PANE_ID, "Enter"];
	}

	function indexesOf(calls: string[][], expected: string[]): number[] {
		const encoded = JSON.stringify(expected);
		return calls.flatMap((call, index) => (JSON.stringify(call) === encoded ? [index] : []));
	}

	describe("DaemonTmux.sendText — pre-Enter recovery and at-most-once submission", () => {
		it("returns unverified instead of throwing when the target pane disappeared", () => {
			const adapter = new DaemonTmux({
				runner: () => {
					throw new Error("can't find pane: %42");
				},
				sleep: () => undefined,
			});

			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("unverified");
		});

		it("(a) waits through redraw lag and types the payload exactly once", () => {
			const tmux = scriptedTmux([EMPTY_PANE, EMPTY_PANE, STUCK_PANE, STUCK_PANE, BUSY_PANE]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "copilot")).toBe("confirmed");
			expect(indexesOf(tmux.calls, typeArgv())).toHaveLength(1);
		});

		it("never retypes after Enter when an accepted send has ambiguous confirmation", () => {
			const tmux = scriptedTmux([
				STUCK_PANE,
				STUCK_PANE,
				...repeatedCapture(AMBIGUOUS_EMPTY_AFTER_ENTER, 100),
			]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(submissionConfirmed(STUCK_PANE, AMBIGUOUS_EMPTY_AFTER_ENTER, SENT)).toBe(false);
			// The payload WAS typed but its submission was never positively confirmed →
			// the honest `injected-unverified`, never `delivered`.
			expect(adapter.sendText(PANE_ID, SENT, "copilot")).toBe("injected-unverified");
			expect(indexesOf(tmux.calls, typeArgv())).toHaveLength(1);
		});

		it("(b) clears immediately before re-typing after a full empty poll window", () => {
			const tmux = scriptedTmux([
				...repeatedCapture(EMPTY_PANE, 8),
				STUCK_PANE,
				STUCK_PANE,
				BUSY_PANE,
			]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			adapter.sendText(PANE_ID, SENT, "copilot");
			const typed = indexesOf(tmux.calls, typeArgv());
			expect(typed).toHaveLength(2);
			expect(tmux.calls[typed[1] - 1]).toEqual(clearArgv());
		});

		it("(b) clears a framed non-BMP payload by its UTF-16 unit count", () => {
			const typedPane = STUCK_PANE.replace(SENT, NON_BMP_SENT);
			const tmux = scriptedTmux([
				...repeatedCapture(EMPTY_PANE, 8),
				typedPane,
				typedPane,
				BUSY_PANE,
			]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			adapter.sendText(PANE_ID, NON_BMP_SENT, "copilot");
			const typed = indexesOf(tmux.calls, ["send-keys", "-t", PANE_ID, "-l", NON_BMP_SENT]);
			expect(typed).toHaveLength(2);
			expect(tmux.calls[typed[1] - 1]).toEqual(clearArgv(NON_BMP_SENT));
		});

		it("(d) caps pre-Enter typing at exactly three total attempts", () => {
			const tmux = scriptedTmux(repeatedCapture(EMPTY_PANE, 90));
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "copilot")).toBe("injected-unverified");
			const typed = indexesOf(tmux.calls, typeArgv());
			expect(typed).toHaveLength(3);
			for (const index of typed.slice(1)) expect(tmux.calls[index - 1]).toEqual(clearArgv());
		});

		it("(c) retries Enter against visibly pending text without retyping it", () => {
			const tmux = scriptedTmux(repeatedCapture(STUCK_PANE, 21));
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "copilot")).toBe("injected-unverified");
			expect(indexesOf(tmux.calls, typeArgv())).toHaveLength(1);
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(3);
			expect(indexesOf(tmux.calls, clearArgv())).toHaveLength(0);
		});
	});

	// ─── claude/codex submission verification (#40 Defect 5) ────────────────────
	// The regression: claude/codex used to fire ONE Enter and blindly return
	// `confirmed`, so a swallowed Enter (busy composer / render race) stranded the
	// text yet the sender still saw `delivered`. These pin the harness-agnostic
	// verify+retry now running for claude — including that claude's dim `[2m`
	// ghost-suggestion placeholder is NOT mistaken for pending composer content.
	describe("DaemonTmux.sendText — claude submission verification", () => {
		// Claude renders the composer between the final two rules; busy shows a live
		// gerund spinner + `esc to interrupt` / token counter (matched by BUSY_RE).
		const CLAUDE_PENDING_PANE = [
			" ~/GitHub/pij  main",
			" Previous claude output line",
			"────────────────────────────────────────────",
			"❯ [pij from pij-5lztp8] (pij delivery diagnostic —",
			"  please ignore)",
			"────────────────────────────────────────────",
			"  ? for shortcuts",
		].join("\n");
		const CLAUDE_BUSY_PANE = [
			" ~/GitHub/pij  main",
			" Previous claude output line",
			"────────────────────────────────────────────",
			"❯",
			"────────────────────────────────────────────",
			" ✽ Percolating… (esc to interrupt · 3s · ↓ 41 tokens)",
		].join("\n");
		// Composer emptied AND the transcript region changed (a fast ready→busy→ready
		// turn missed between polls) — the fresh-transcript confirmation fallback.
		const CLAUDE_TURN_DONE_PANE = [
			" ~/GitHub/pij  main",
			" ⏺ Done — replied to pij-5lztp8",
			"────────────────────────────────────────────",
			"❯",
			"────────────────────────────────────────────",
			"  ? for shortcuts",
		].join("\n");
		// Truly empty composer, no busy, transcript unchanged — the ambiguous case.
		const CLAUDE_EMPTY_PANE = [
			" ~/GitHub/pij  main",
			" Previous claude output line",
			"────────────────────────────────────────────",
			"❯",
			"────────────────────────────────────────────",
			"  ? for shortcuts",
		].join("\n");
		// Empty composer showing claude's dim autosuggest placeholder. tmux strips the
		// `[2m` SGR so the hint renders as plain text — but it is NOT our payload, so
		// the payload-tail match must read it as "payload gone", never "still pending".
		const CLAUDE_GHOST_PANE = [
			" ~/GitHub/pij  main",
			" Previous claude output line",
			"────────────────────────────────────────────",
			'❯ Try "explain the composer verification path"',
			"────────────────────────────────────────────",
			"  ? for shortcuts",
		].join("\n");

		it("distinguishes the real payload tail from claude's ghost placeholder", () => {
			expect(composerHasTextTail(CLAUDE_PENDING_PANE, SENT)).toBe(true);
			expect(composerHasTextTail(CLAUDE_GHOST_PANE, SENT)).toBe(false);
			expect(needsInputWake("claude")).toBe(false); // no copilot focus-wedge path
		});

		it("submitted first try — pane goes busy after one Enter → confirmed", () => {
			const tmux = scriptedTmux([CLAUDE_PENDING_PANE, CLAUDE_BUSY_PANE]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("confirmed");
			expect(indexesOf(tmux.calls, typeArgv())).toHaveLength(1);
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(1);
			expect(indexesOf(tmux.calls, clearArgv())).toHaveLength(0);
		});

		it("confirmed by the fresh-transcript fallback when busy was missed", () => {
			const tmux = scriptedTmux([CLAUDE_PENDING_PANE, CLAUDE_TURN_DONE_PANE]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("confirmed");
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(1);
		});

		it("submitted after retry — first Enter swallowed, second confirms", () => {
			// preSubmit + one full 5-poll window still pending, then busy on attempt 2.
			const tmux = scriptedTmux([
				CLAUDE_PENDING_PANE,
				...repeatedCapture(CLAUDE_PENDING_PANE, 5),
				CLAUDE_BUSY_PANE,
			]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("confirmed");
			expect(indexesOf(tmux.calls, typeArgv())).toHaveLength(1); // never retyped
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(2); // one retry Enter
			expect(indexesOf(tmux.calls, clearArgv())).toHaveLength(0);
		});

		it("exhausted — payload stays stranded → injected-unverified, 3 Enters, never delivered", () => {
			const tmux = scriptedTmux(repeatedCapture(CLAUDE_PENDING_PANE, 30));
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("injected-unverified");
			expect(indexesOf(tmux.calls, typeArgv())).toHaveLength(1);
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(3);
			expect(indexesOf(tmux.calls, clearArgv())).toHaveLength(0);
		});

		it("ghost placeholder is read as payload-gone — stops after one Enter (no hammering)", () => {
			const tmux = scriptedTmux([CLAUDE_PENDING_PANE, ...repeatedCapture(CLAUDE_GHOST_PANE, 30)]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			// No positive confirmation, but the payload left the composer (only the dim
			// hint remains) → honest injected-unverified with a SINGLE Enter, not three.
			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("injected-unverified");
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(1);
		});

		it("empty composer, no busy — ambiguous submit → injected-unverified, at-most-once", () => {
			const tmux = scriptedTmux([CLAUDE_PENDING_PANE, ...repeatedCapture(CLAUDE_EMPTY_PANE, 30)]);
			const adapter = new DaemonTmux({ runner: tmux.runner, sleep: () => undefined });

			expect(adapter.sendText(PANE_ID, SENT, "claude")).toBe("injected-unverified");
			expect(indexesOf(tmux.calls, enterArgv())).toHaveLength(1); // no speculative replay
		});
	});

	it("an EMPTY composer (a real submit) is NOT pending → no spurious re-Enter", () => {
		// The submitted line moved into the transcript; composer is bare `❯`.
		expect(composerPending(EMPTY_PANE, SENT)).toBe(false);
	});

	it("does not false-match the transcript above the composer", () => {
		// The sent text appearing in scrollback (not the composer box) must NOT read pending.
		const submittedToTranscript = [
			"❯ [pij from pij-5lztp8] (pij delivery diagnostic — please ignore)   18:31",
			" ● working on it",
			"────────────────────────────────────────────",
			"❯",
			"────────────────────────────────────────────",
			" ◉ Working esc cancel    GPT-5.5",
		].join("\n");
		expect(composerPending(submittedToTranscript, SENT)).toBe(false);
	});

	it("a too-short send is treated as submitted (avoids unreliable matching)", () => {
		expect(composerPending(STUCK_PANE, "ok")).toBe(false);
	});

	it("composerRegion extracts the box between the last two rules", () => {
		expect(composerRegion(STUCK_PANE)).toContain("pij delivery diagnostic");
		expect(composerRegion(EMPTY_PANE).replace(/[❯\s]/g, "")).toBe("");
	});
});
