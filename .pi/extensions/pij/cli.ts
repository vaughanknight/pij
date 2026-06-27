#!/usr/bin/env -S npx tsx
// pij-messaging — the `pij` CLI bin. THIN: wires the real fs adapters to the
// pure core/cli.ts, owns Node I/O (argv, stdout/stderr, exit) and the only two
// imperative loops (--follow tail, --wait receipt poll). Pi-free by design —
// remote `compact` rides the channel as a command message the extension runs;
// this process never imports @earendil-works/*.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { TmuxAdapter } from "./adapters/tmux.js";
import { applyBinding, resolveAdoptSessionId } from "./core/binding.js";
import type { CliDeps, CliResult, ParsedCommand } from "./core/cli.js";
import { dispatch, parseArgs } from "./core/cli.js";
import {
	summarizeTranscriptLine,
	transcriptDir,
	transcriptPathFor,
} from "./core/harness/claude.js";
import { parseReceiptBody } from "./core/message.js";
import {
	allocatePijId,
	buildControlSpawnCommand,
	buildPendingDescriptor,
	parseAdoptArgs,
	parseSpawnArgs,
} from "./core/spawn.js";

const pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij");
const FOLLOW_MS = 200;
const WAIT_TIMEOUT_MS = 15_000;

function write(res: CliResult): void {
	if (res.stdout) process.stdout.write(`${res.stdout}\n`);
	if (res.stderr) process.stderr.write(`${res.stderr}\n`);
}

function deps(): CliDeps {
	return {
		registry: new FsRegistry(pijHome),
		eventLogFor: (id) => new FsEventLog(pijHome, id),
		delivery: new FsChannel(pijHome),
		process: new NodeProcess(),
		cwd: process.cwd(),
		pijHome,
	};
}

/** --follow: poll the peer's log from the trailer cursor, print only new batches. */
function followTail(cmd: ParsedCommand & { verb: "tail" }, d: CliDeps, fromSeq: number): void {
	let cursor = fromSeq;
	const tick = (): void => {
		// follow:true so dispatch returns the {kind:tail,nextSince} cursor hint;
		// with follow:false res.follow is absent and the cursor never advances (F002).
		const res = dispatch({ ...cmd, since: cursor, follow: true }, d);
		const next = res.follow?.kind === "tail" ? res.follow.nextSince : cursor;
		if (next > cursor) {
			write({ ...res, follow: undefined });
			cursor = next;
		}
		setTimeout(tick, FOLLOW_MS);
	};
	setTimeout(tick, FOLLOW_MS);
}

/** --wait: poll self's receipt events until the delivered receipt for this
 *  messageId lands (F3 — parse receiptBody), or the timeout elapses. */
function waitReceipt(
	d: CliDeps,
	self: string,
	messageId: string,
	timeoutMs = WAIT_TIMEOUT_MS,
): void {
	const started = Date.now();
	const log = d.eventLogFor(self);
	const seen = new Set<string>();
	const tick = (): void => {
		for (const e of log.read({ type: "receipt" })) {
			const body = (e.data as { body?: string } | undefined)?.body;
			const r = body ? parseReceiptBody(body) : null;
			if (!r || r.messageId !== messageId) continue;
			const key = `${r.state}`;
			if (seen.has(key)) continue;
			seen.add(key);
			process.stdout.write(`receipt → ${r.state}\n`);
			if (r.state === "delivered") process.exit(0);
		}
		if (Date.now() - started > timeoutMs) {
			process.stdout.write("receipt → (timeout; check `pij tail` later)\n");
			process.exit(0);
		}
		setTimeout(tick, FOLLOW_MS);
	};
	tick();
}

/** `pij spawn --harness claude` (T018, AC-01): split a pane right running the
 *  harness under a PRE-ALLOCATED pij-id, write the `pending` descriptor, and
 *  return the id IMMEDIATELY (<500ms). The running daemon drives the pane to
 *  ready → bound asynchronously; this never blocks on boot. Impure (tmux + fs),
 *  so it lives in the bin; the parse + builders are pure core. */
function runSpawn(argv: readonly string[]): void {
	const req = parseSpawnArgs(argv);
	if (!req.ok) {
		process.stderr.write(`${req.code}: ${req.message}\n`);
		process.exit(64);
	}
	const tmux = new TmuxAdapter();
	const ownPane = tmux.currentPane();
	if (!ownPane || !tmux.currentSession()) {
		process.stderr.write("E-NOTMUX: pij spawn --harness needs an active tmux session\n");
		process.exit(2);
	}
	const cwd = process.cwd();
	// H1 (dogfood review): snapshot the transcript dir NOW, before the pane (and
	// Claude) exist, so new-path discovery is genuinely deterministic — the
	// daemon's first-tick snapshot would race Claude's early transcript write.
	const dir = transcriptDir(homedir(), cwd);
	let transcriptsAtSpawn: string[] = [];
	try {
		transcriptsAtSpawn = readdirSync(dir)
			.filter((n) => n.endsWith(".jsonl"))
			.map((n) => `${dir}/${n}`);
	} catch {
		/* dir not created yet → empty before-set */
	}
	const token = `s${Date.now()}-${process.pid}`;
	const pijId = allocatePijId(token, process.pid);
	const spawnCmd = buildControlSpawnCommand({
		harness: req.value.harness,
		pijId,
		cwd,
		model: req.value.model,
		task: req.value.task,
	});
	const split = tmux.splitWindow({
		cmd: spawnCmd.cmd,
		args: spawnCmd.args,
		env: spawnCmd.env,
		cwd,
		target: ownPane,
		direction: "h",
		detached: true, // keep focus here; the daemon drives the new pane
	});
	if (!split.ok) {
		process.stderr.write(`${split.code}: ${split.message}\n`);
		process.exit(2);
	}
	const paneId = split.value.paneId;
	// Record the PANE's foreground pid (#{pane_pid}), not this short-lived
	// spawner's pid — otherwise the descriptor probes "dead" the instant the
	// spawn CLI exits and `pij send` refuses a perfectly live claude (liveness
	// is pid-based). The pane pid is the harness process and lives with the pane.
	let panePid = process.pid;
	try {
		const raw = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_pid}"], {
			encoding: "utf8",
		}).trim();
		if (/^\d+$/.test(raw)) panePid = Number(raw);
	} catch {
		/* fall back to the spawner pid */
	}
	const dataDir = join(pijHome, pijId);
	new FsRegistry(pijHome).write(
		buildPendingDescriptor({
			pijId,
			paneId,
			cwd,
			harness: req.value.harness,
			dataDir,
			eventsPath: join(dataDir, "events.ndjson"),
			pid: panePid,
			startedAtIso: new Date().toISOString(),
			transcriptsAtSpawn,
		}),
	);
	if (req.value.json) {
		process.stdout.write(
			`${JSON.stringify({ id: pijId, paneId, harness: req.value.harness, lifecycle: "pending" })}\n`,
		);
	} else {
		process.stdout.write(
			`spawned ${pijId} (${req.value.harness}) in pane ${paneId} — daemon will drive it to ready→bound (track: pij state ${pijId} · pij tail ${pijId})\n`,
		);
	}
	process.exit(0);
}

/** `pij adopt <pane> --harness claude` (T023, AC-14): register an ALREADY-running
 *  tmux agent (e.g. this orchestrator's own pane) as a bound pij peer so other
 *  sessions can `pij send` to it and the daemon dumps the message into its pane.
 *  Adopt has no post-spawn new-file event, so it binds by its OWN rule
 *  (`resolveAdoptSessionId`): the adopting shell's CLAUDE_CODE_SESSION_ID, else
 *  the newest transcript in the cwd, else pending + `pij phonehome`. */
function runAdopt(argv: readonly string[]): void {
	const req = parseAdoptArgs(argv);
	if (!req.ok) {
		process.stderr.write(`${req.code}: ${req.message}\n`);
		process.exit(64);
	}
	const pane = req.value.pane;
	// Resolve the pane's cwd + foreground pid from tmux.
	let cwd = process.cwd();
	let panePid = process.pid;
	try {
		const out = execFileSync(
			"tmux",
			["display-message", "-p", "-t", pane, "#{pane_current_path}\t#{pane_pid}"],
			{ encoding: "utf8" },
		).trim();
		const [path, pid] = out.split("\t");
		if (path) cwd = path;
		if (pid && /^\d+$/.test(pid)) panePid = Number(pid);
	} catch {
		process.stderr.write(`E-ARG: cannot resolve pane ${pane} (is it a live tmux pane?)\n`);
		process.exit(2);
	}
	// Newest-first transcript stems in the cwd's project dir (pane-start-time proxy).
	const dir = transcriptDir(homedir(), cwd);
	let stemsNewestFirst: string[] = [];
	try {
		stemsNewestFirst = readdirSync(dir)
			.filter((n) => n.endsWith(".jsonl"))
			.map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
			.sort((a, b) => b.t - a.t)
			.map(({ n }) => n.slice(0, -".jsonl".length));
	} catch {
		/* no transcripts yet */
	}
	const harnessSessionId =
		resolveAdoptSessionId(process.env.CLAUDE_CODE_SESSION_ID, stemsNewestFirst) ?? undefined;
	const pijId = req.value.id ?? allocatePijId(`adopt-${pane}`, panePid);
	const dataDir = join(pijHome, pijId);
	let descriptor = buildPendingDescriptor({
		pijId,
		paneId: pane,
		cwd,
		harness: req.value.harness,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
		pid: panePid,
		startedAtIso: new Date().toISOString(),
	});
	if (harnessSessionId) descriptor = applyBinding(descriptor, harnessSessionId);
	new FsRegistry(pijHome).write(descriptor);
	if (req.value.json) {
		process.stdout.write(
			`${JSON.stringify({ id: pijId, paneId: pane, harness: req.value.harness, harnessSessionId: harnessSessionId ?? null, lifecycle: descriptor.lifecycle })}\n`,
		);
	} else if (harnessSessionId) {
		process.stdout.write(
			`adopted ${pijId} ↔ ${req.value.harness} session ${harnessSessionId} (pane ${pane}, bound) — peers can now: pij send ${pijId} "<text>"\n`,
		);
	} else {
		process.stdout.write(
			`adopted ${pijId} (pane ${pane}, pending) — run \`pij phonehome\` in that pane to confirm the binding\n`,
		);
	}
	process.exit(0);
}

/** `pij tail <pij-id>` for a BOUND claude session (T022, AC-09): claude writes a
 *  JSONL transcript, not pij's events.ndjson, so resolve that file and stream a
 *  summarized view (`[role] text`, tool calls as `⚙ name`). `--follow` polls for
 *  new lines. Returns false when the target is not a bound claude (caller falls
 *  back to the normal event tail). */
function tailTranscript(id: string, follow: boolean, linesArg: number | undefined): boolean {
	const d = new FsRegistry(pijHome).read(id);
	if (!d || d.harness !== "claude" || !d.harnessSessionId) return false;
	const path = transcriptPathFor(homedir(), d.folder, d.harnessSessionId);
	const render = (raw: string): void => {
		const e = summarizeTranscriptLine(raw);
		if (e) process.stdout.write(`[${e.role}] ${e.text.replace(/\n/g, " ").slice(0, 200)}\n`);
	};
	let consumed = 0;
	const flush = (initial: boolean): void => {
		let all: string[];
		try {
			all = readFileSync(path, "utf8").split("\n").filter(Boolean);
		} catch {
			return;
		}
		if (initial && linesArg !== undefined) {
			// show the last N summarizable lines on first paint
			const tailSlice = all.slice(-Math.max(linesArg * 4, linesArg));
			consumed = all.length;
			for (const l of tailSlice) render(l);
			return;
		}
		for (let i = consumed; i < all.length; i++) render(all[i] as string);
		consumed = all.length;
	};
	flush(true);
	if (!follow) {
		process.exit(0);
	}
	setInterval(() => flush(false), FOLLOW_MS);
	return true;
}

function main(): void {
	// `spawn` is impure (tmux split + pending write) — intercept before the pure
	// dispatch path. It writes the registry home itself, so it predates the
	// E-NOREG guard below.
	if (process.argv[2] === "spawn") {
		runSpawn(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "adopt") {
		runAdopt(process.argv.slice(3));
		return;
	}
	// E-NOREG: registry home absent => the extension never booted here.
	if (!existsSync(pijHome)) {
		process.stderr.write("E-NOREG: no pij registry — is the pij extension loaded?\n");
		process.exit(3);
	}
	const parsed = parseArgs(process.argv.slice(2));
	if (!parsed.ok) {
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(64);
	}
	// `pij tail` of a bound claude session streams its JSONL transcript, not the
	// pij event log (T022). Try that first; fall through to the event tail if the
	// target isn't a bound claude.
	if (parsed.value.verb === "tail") {
		if (tailTranscript(parsed.value.id, parsed.value.follow, parsed.value.lines)) {
			return; // tailTranscript owns output (and the follow loop)
		}
	}
	const d = deps();
	const res = dispatch(parsed.value, d);
	write(res);
	if (res.follow?.kind === "tail" && parsed.value.verb === "tail") {
		followTail(parsed.value, d, res.follow.nextSince);
		return; // loops until killed
	}
	if (res.follow?.kind === "wait") {
		waitReceipt(d, res.follow.self, res.follow.messageId, res.follow.timeoutMs);
		return;
	}
	process.exit(res.exitCode);
}

main();
