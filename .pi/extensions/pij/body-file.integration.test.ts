// pij — the LITERAL body channel, proven through the real bin (plan 093, pij#128).
//
// `--body-file` is unwrapped in `cli.ts` BEFORE `parseArgs` ever runs, so the
// pure core specs cannot see it: the one channel the fleet uses for relayed or
// untrusted text had no test at all. These are deliberately real-process tests
// (`spawnSync` on the wrapper) for that reason.
//
// What is asserted, and what is NOT: pij cannot stop the CALLER's shell from
// expanding a double-quoted body — expansion completes before pij's process
// exists (dossier F-06). Nothing here claims otherwise. What is provable, and
// what these tests hold, is that the safe path is actually safe: the file's
// bytes arrive unchanged, and they are never lexed as argv.

import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "./core/cli.js";
import type { DeliveredMessage, SessionDescriptor } from "./core/types.js";

const nodeRequire = createRequire(import.meta.url);
const TSX_CLI = nodeRequire.resolve("tsx/cli");
const CLI = join(import.meta.dirname, "cli.ts");

/** Everything a quoted body would mangle, plus everything the argv lexer would
 *  steal. The first line begins `--wait` on purpose: `--wait` takes an optional
 *  value on `send`, so a body re-appended as an argv token gets swallowed by it
 *  and vanishes entirely (KF-8). Trailing spaces AND trailing newlines are the
 *  `trimEnd()` case (KF-7). */
const HOSTILE_BODY = [
	"--wait 500 this line must arrive as TEXT, not as a flag value",
	// The `${HOME}` below is hostile ON PURPOSE: it is a SHELL expansion of the
	// kind a caller relays, not a JS template placeholder. Rewriting it to
	// satisfy the lint would delete the thing under test.
	// biome-ignore lint/suspicious/noTemplateCurlyInString: shell-expansion fixture, not a JS template
	"backticks: `echo pwned` and substitution: $(echo pwned) and ${HOME}",
	`quotes: 'single' "double" and a semicolon ; here`,
	"--json is also not a flag when it lives in the body",
	"trailing spaces follow this arrow →   ",
	"",
	"",
].join("\n");

interface CliRun {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

describe("pij send --body-file (the literal body channel)", () => {
	let pijHome: string;
	let folder: string;
	let agentHome: string;

	beforeEach(() => {
		pijHome = mkdtempSync(join(tmpdir(), "pij-bodyfile-home-"));
		folder = realpathSync(mkdtempSync(join(tmpdir(), "pij-bodyfile-cwd-")));
		agentHome = realpathSync(mkdtempSync(join(tmpdir(), "pij-bodyfile-agent-home-")));
	});

	afterEach(() => {
		rmSync(pijHome, { recursive: true, force: true });
		rmSync(folder, { recursive: true, force: true });
		rmSync(agentHome, { recursive: true, force: true });
	});

	function writeDescriptor(id: string): SessionDescriptor {
		const dataDir = join(pijHome, id);
		const descriptor: SessionDescriptor = {
			id,
			folder,
			dataDir,
			eventsPath: join(dataDir, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-08-08T00:00:00.000Z",
			state: "idle",
		};
		mkdirSync(join(dataDir, "inbox"), { recursive: true });
		writeFileSync(join(pijHome, `${id}.json`), JSON.stringify(descriptor));
		return descriptor;
	}

	function runPij(
		args: readonly string[],
		envOverrides: Record<string, string> = {},
		stdin?: string,
	): CliRun {
		const result = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
			cwd: folder,
			env: {
				...process.env,
				HOME: agentHome,
				USERPROFILE: agentHome,
				PIJ_HOME: pijHome,
				PIJ_SESSION_ID: "",
				TMUX: "",
				TMUX_PANE: "",
				CLAUDE_CODE_SESSION_ID: "",
				COPILOT_AGENT_SESSION_ID: "",
				CODEX_THREAD_ID: "",
				...envOverrides,
			},
			encoding: "utf8",
			timeout: 20_000,
			...(stdin !== undefined ? { input: stdin } : {}),
		});
		if (result.error) throw result.error;
		return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
	}

	function deliveredTo(receiver: SessionDescriptor): DeliveredMessage {
		const inboxDir = join(receiver.dataDir, "inbox");
		const names = readdirSync(inboxDir).filter(
			(name) => name.startsWith("msg-") && name.endsWith(".json"),
		);
		expect(names).toHaveLength(1);
		return JSON.parse(readFileSync(join(inboxDir, names[0] as string), "utf8")) as DeliveredMessage;
	}

	/** How many messages actually landed. The refusal cases below assert on THIS
	 *  rather than on the exit code: a process that delivered and then complained
	 *  passes an exit-code check and fails this one. */
	function inboxCount(receiver: SessionDescriptor): number {
		return readdirSync(join(receiver.dataDir, "inbox")).filter(
			(name) => name.startsWith("msg-") && name.endsWith(".json"),
		).length;
	}

	it("AC-08/09: a hostile body from a file arrives byte-for-byte and is never lexed as argv", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const receiver = writeDescriptor("pij-bodyfile-b");
		const bodyPath = join(folder, "body.txt");
		writeFileSync(bodyPath, HOSTILE_BODY);

		const result = runPij(["send", receiver.id, "--body-file", bodyPath, "--json"], {
			PIJ_SESSION_ID: sender.id,
		});

		expect(result).toMatchObject({ code: 0, stderr: "" });
		// Byte-for-byte. `trimEnd()` makes this RED on the trailing spaces and
		// the two trailing newlines; argv re-lexing makes it RED on line 1.
		expect(deliveredTo(receiver).body).toBe(HOSTILE_BODY);
	});

	it("AC-09: --wait BEFORE --body-file cannot swallow the file's contents", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const receiver = writeDescriptor("pij-bodyfile-b");
		const bodyPath = join(folder, "body.txt");
		writeFileSync(bodyPath, HOSTILE_BODY);

		// `pij send <id> --wait --body-file <path>`: `--wait` is valued on send,
		// so the body used to be consumed as its milliseconds value — the send
		// then failed E-ARG, or worse, delivered nothing while looking fine.
		const result = runPij(["send", receiver.id, "--wait", "1", "--body-file", bodyPath], {
			PIJ_SESSION_ID: sender.id,
		});

		expect(result.code).toBe(0);
		expect(deliveredTo(receiver).body).toBe(HOSTILE_BODY);
	});

	it("AC-10: --body-file - reads stdin, so a heredoc is a single literal command", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const receiver = writeDescriptor("pij-bodyfile-b");

		const result = runPij(
			["send", receiver.id, "--body-file", "-", "--json"],
			{ PIJ_SESSION_ID: sender.id },
			HOSTILE_BODY,
		);

		expect(result).toMatchObject({ code: 0, stderr: "" });
		expect(deliveredTo(receiver).body).toBe(HOSTILE_BODY);
	});

	it("AC-08: --body-file combined with --command is an explicit error", { timeout: 30_000 }, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const receiver = writeDescriptor("pij-bodyfile-b");
		const bodyPath = join(folder, "body.txt");
		writeFileSync(bodyPath, "some text\n");

		const result = runPij(["send", receiver.id, "--command", "compact", "--body-file", bodyPath], {
			PIJ_SESSION_ID: sender.id,
		});

		expect(result.code).toBe(64);
		expect(result.stderr).toContain("--body-file");
		expect(result.stderr).toContain("--command");
	});

	it("AC-11: `pij send --help` shows the safety guidance it documents", { timeout: 30_000 }, () => {
		writeDescriptor("pij-bodyfile-a");

		const result = runPij(["send", "--help"]);

		expect(result.code).toBe(0);
		// The USAGE line itself (already shown today) …
		expect(result.stdout).toContain("pij send <id>");
		// … and the indented continuation lines under it, which the verb filter
		// silently dropped — including the ONLY shell-safety note pij prints.
		expect(result.stdout).toContain("--body-file");
		expect(result.stdout).toContain("substitute in YOUR shell");
		expect(result.stdout).toContain("UNSAFE");
		// `--file` is documented distinctly from `--body-file` (they are one
		// letter apart with opposite semantics — the #132 misuse).
		expect(result.stdout).toContain("--file <path>");
		// The heredoc form a caller can copy.
		expect(result.stdout).toContain("<<'PIJ'");
		// Still only the send block.
		expect(result.stdout).not.toContain("pij spawn");
	});

	// ── F1 (cross-model review): the guard must reach the body-file route ──────
	//
	// The bytes are attached to the PARSED command, after `parseArgs` and before
	// `dispatch`, so the empty-payload guard SHOULD cover them for free. "Should
	// inherit it" is exactly the kind of claim that turns out to be false, so it
	// is asserted through the real bin rather than reasoned about.
	it("F1: a whitespace-only --body-file is refused, and nothing lands in the inbox", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const receiver = writeDescriptor("pij-bodyfile-b");
		const bodyPath = join(folder, "blank.txt");
		// What `cat` of an "empty" notes file actually yields.
		writeFileSync(bodyPath, "  \n\n");

		const result = runPij(["send", receiver.id, "--body-file", bodyPath], {
			PIJ_SESSION_ID: sender.id,
		});

		expect(inboxCount(receiver)).toBe(0);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("E-EMPTY");
	});

	it("F1 preserved: a padded but non-empty --body-file keeps every pad byte", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const receiver = writeDescriptor("pij-bodyfile-b");
		const bodyPath = join(folder, "padded.txt");
		const padded = "   hello   \n\n";
		writeFileSync(bodyPath, padded);

		const result = runPij(["send", receiver.id, "--body-file", bodyPath], {
			PIJ_SESSION_ID: sender.id,
		});

		expect(result.code).toBe(0);
		// The emptiness test trims; the body does not. If a `.trim()` ever leaks
		// into the delivered value, this is the test that says so.
		expect(deliveredTo(receiver).body).toBe(padded);
	});

	// ── F2 (cross-model review): broadcast through the literal channel ─────────
	//
	// Everything above is single-target. Broadcast takes a different argv shape
	// (`--to a --to b`, no target-id positional) and a different dispatch branch,
	// and `cli.ts` keeps its own copy of which send flags are valued in order to
	// place the body placeholder correctly. A drift in that mirror makes either
	// target id look like a competing positional, or makes the literal body
	// lexable again — the exact class of bug this plan removed.
	it("F2: a two-target broadcast --body-file delivers the hostile body byte-for-byte to BOTH", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const first = writeDescriptor("pij-bodyfile-b");
		const second = writeDescriptor("pij-bodyfile-c");
		const bodyPath = join(folder, "body.txt");
		writeFileSync(bodyPath, HOSTILE_BODY);

		const result = runPij(
			["send", "--to", first.id, "--to", second.id, "--body-file", bodyPath, "--json"],
			{ PIJ_SESSION_ID: sender.id },
		);

		expect(result.code).toBe(0);
		expect(deliveredTo(first).body).toBe(HOSTILE_BODY);
		expect(deliveredTo(second).body).toBe(HOSTILE_BODY);
	});

	it("F2: a whitespace-only broadcast --body-file is refused for EVERY target", {
		timeout: 30_000,
	}, () => {
		const sender = writeDescriptor("pij-bodyfile-a");
		const first = writeDescriptor("pij-bodyfile-b");
		const second = writeDescriptor("pij-bodyfile-c");
		const bodyPath = join(folder, "blank.txt");
		writeFileSync(bodyPath, "\n");

		const result = runPij(["send", "--to", first.id, "--to", second.id, "--body-file", bodyPath], {
			PIJ_SESSION_ID: sender.id,
		});

		expect(inboxCount(first)).toBe(0);
		expect(inboxCount(second)).toBe(0);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("E-EMPTY");
	});
});

// ── F2: the mirror, pinned ───────────────────────────────────────────────────
//
// `cli.ts` cannot import core's flag tables (they are module-private) and must
// know send's flag VALENCE to place the body placeholder, so it keeps a copy:
// `json` boolean, everything else valued. That copy is correct today and has no
// way of noticing if core changes.
//
// HOW THIS PINS IT — and why the obvious version pinned nothing. The first
// attempt passed a lone SENTINEL after each flag and asserted the parsed body
// was NOT the sentinel. That assertion cannot fail. A parse ERROR produces no
// body either, so "the flag consumed the sentinel" and "the whole argv was
// rejected" are the same observation. `send --to SENTINEL` is invalid today
// (broadcast needs two targets) and would be just as invalid if `to` flipped to
// boolean ("--to needs a session id") — the test held in both worlds. It was
// caught by mutation, not by reading: adding "to" to core's BOOLEAN_FLAGS left
// it green.
//
// So every case below parses SUCCESSFULLY today, and asserts WHICH SLOT the
// sentinel landed in. Flipping a flag's valence moves the sentinel to a
// different slot, and an assertion that names its slot has no way to survive
// that. Never assert "not the sentinel"; assert where the sentinel went.
//
// Residual gap, stated rather than hidden: this pins the valence of the flags
// send has TODAY. A brand-new valued send flag would still need the mirror
// updated by hand, and no test can see it without core exporting its tables.
describe("F2: cli.ts's send flag-valence mirror agrees with core", () => {
	const SENTINEL = "pij-valence-sentinel";

	/** Parse and demand a successful `send`. Throwing here is the whole point:
	 *  a rejected argv must never be mistaken for a consumed sentinel. */
	const parseSend = (argv: readonly string[]) => {
		const parsed = parseArgs(argv);
		if (!parsed.ok) {
			throw new Error(`expected a successful parse, got ${parsed.code}: ${parsed.message}`);
		}
		if (parsed.value.verb !== "send") {
			throw new Error(`expected verb "send", got "${parsed.value.verb}"`);
		}
		return parsed.value;
	};

	it("--json is BOOLEAN: it consumes nothing, so the sentinel becomes the body", () => {
		const cmd = parseSend(["send", "tgt", "--json", SENTINEL]);
		expect(cmd.json).toBe(true);
		expect(cmd.text).toBe(SENTINEL);
	});

	it("--to is VALUED: both targets land in `targets`, the sentinel stays the body", () => {
		const cmd = parseSend(["send", "--to", "pij-valence-a", "--to", "pij-valence-b", SENTINEL]);
		expect(cmd.targets).toEqual(["pij-valence-a", "pij-valence-b"]);
		expect(cmd.broadcast).toBe(true);
		expect(cmd.text).toBe(SENTINEL);
	});

	it("--command is VALUED: the name lands in `command`", () => {
		const cmd = parseSend(["send", "tgt", "--command", "compact"]);
		expect(cmd.command).toBe("compact");
		expect(cmd.text).toBeUndefined();
	});

	it("--file and --caption are VALUED: the path and the sentinel land in their own slots", () => {
		const path = "/tmp/pij-valence-fixture.txt";
		const cmd = parseSend(["send", "tgt", "--file", path, "--caption", SENTINEL]);
		expect(cmd.file).toBe(path);
		expect(cmd.caption).toBe(SENTINEL);
		// If `--file` were boolean the path would slide into `--caption`'s slot.
		expect(cmd.caption).not.toBe(cmd.file);
		expect(cmd.text).toBeUndefined();
	});

	it("--wait is VALUED: the milliseconds land in `waitMs`, not in the body", () => {
		const cmd = parseSend(["send", "tgt", SENTINEL, "--wait", "500"]);
		expect(cmd.wait).toBe(true);
		expect(cmd.waitMs).toBe(500);
		expect(cmd.text).toBe(SENTINEL);
	});
});
