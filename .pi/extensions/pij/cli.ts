#!/usr/bin/env -S npx tsx
// pij-messaging — the `pij` CLI bin. THIN: wires the real fs adapters to the
// pure core/cli.ts, owns Node I/O (argv, stdout/stderr, exit) and the only two
// imperative loops (--follow tail, --wait receipt poll). Pi-free by design —
// remote `compact` rides the channel as a command message the extension runs;
// this process never imports @earendil-works/*.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeAgentAdapter } from "minih";
import { validateInput } from "minih/runner";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { TmuxAdapter } from "./adapters/tmux.js";
import { execFileRunner, pressKey, typeLiteral } from "./adapters/tmux-keys.js";
import {
	type AgentSpawnPaneInfo,
	buildAgentPeerEnv,
	executeAgentReport,
	finalizeAgentSpawn,
	prepareAgentSpawn,
} from "./core/agent-peer.js";
import { ClaudeHeadlessAdapter } from "./core/agents/adapters/claude.js";
import { CodexExecAdapter } from "./core/agents/adapters/codex.js";
import {
	COPILOT_SDK_PACKAGE,
	CopilotSdkMissingError,
	createCopilotAdapter,
} from "./core/agents/adapters/copilot.js";
import { type ParsedAgentCommand, parseAgentArgs } from "./core/agents/cli-args.js";
import {
	type AdapterResolution,
	dispatchAgent,
	exitCodeFor,
	renderAgentError,
	type VerbDeps,
} from "./core/agents/cli-verbs.js";
import { type DiscoverySource, discoverAgents } from "./core/agents/pack.js";
import { agentsDir } from "./core/agents/paths.js";
import { applyBinding, resolveAdoptSessionIdForHarness } from "./core/binding.js";
import type { CliDeps, CliResult, ParsedCommand } from "./core/cli.js";
import { dispatch, PROVIDER_HARNESS_MAP, parseArgs } from "./core/cli.js";
import { parseCloseArgs, planClose } from "./core/close.js";
import { daemonStatus, needsAutoStart, planStop } from "./core/daemon/lifecycle.js";
import { parseLockFile } from "./core/daemon/lock.js";
import { filterByFolder, resolveSelf } from "./core/discovery.js";
import {
	summarizeTranscriptLine,
	transcriptDir,
	transcriptPathFor,
} from "./core/harness/claude.js";
import {
	codexTranscriptRoot,
	listCodexRollouts,
	summarizeCodexEvent,
} from "./core/harness/codex.js";
import {
	type CopilotSessionDir,
	copilotSessionStateScan,
	sessionEventsPath,
	summarizeCopilotEvent,
} from "./core/harness/copilot.js";
import { supportsBranching } from "./core/harness/types.js";
import { parseReceiptBody } from "./core/message.js";
import { normalizeModelQuery } from "./core/models/match.js";
import type { ModelEntry } from "./core/models/registry.js";
import { loadModels } from "./core/models/registry.js";
import { buildExportLines } from "./core/session-join.js";
import {
	aliasAgentSpawnArgs,
	allocatePijId,
	buildControlSpawnCommand,
	buildEffortWarning,
	buildPendingDescriptor,
	buildSpawnCommand,
	buildSpawnWarning,
	livePeerPanes,
	parseAdoptArgs,
	parseCompactSelfArgs,
	parseSpawnArgs,
	planBranch,
	planPlacement,
	type SpawnLayout,
} from "./core/spawn.js";
import type { HarnessKind } from "./core/types.js";
import { runTelegram } from "./telegram/index.js";

const pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij");
const FOLLOW_MS = 200;
const WAIT_TIMEOUT_MS = 15_000;

// The COMPLETE surface. The control-plane verbs (spawn/adopt/compact-self/daemon)
// are intercepted here in the bin and never reach the pure core parser, so the
// core parser's E-ARG strings can't (and shouldn't — it's pi/tmux-free) list
// them. This bin-level usage is the one place that advertises every verb, printed
// on no args / --help and on an unknown top-level command.
const USAGE = `pij — session messaging + tmux control plane

Control plane (spawn colleagues in tmux):
  pij spawn --harness pi|claude|copilot|codex [--model <m>]   spawn a colleague (pi self-registers; claude/copilot/codex daemon-bound)
  pij close <id> [--force]                            tear down a colleague's pane + descriptor (--force closes one you don't own)
  pij adopt "$TMUX_PANE" --harness <h> [--export]    register your own pane so peers can reach you (--export: eval-able PIJ_SESSION_ID — self-resolution sugar, NOT the telemetry fix)
  pij daemon <start|status|stop|kill>                manage the daemon (auto-started by spawn)
  pij compact-self [--pane %N] [--delay-ms N] [instruction…]   compact this pane, queue a follow-up
  pij telegram <init|start|stop>                     bridge pij sessions to a Telegram bot

Agents (run declarative minih agent packs):
  pij agent list [--json]                            merged agent inventory (project · user · built-in)
  pij agent run <slug> [-p k=v…] [--json]            run a named pack (--ephemeral to not record)
  pij agent run --prompt "<text>" [--json]           inline zero-setup run (nothing recorded)
  pij agent show|new|check|eject <slug>              inspect · scaffold · validate · customise a pack

Messaging:
  pij whoami [--json] [--env]                        your stable session id (--env: eval-able export PIJ_SESSION_ID line)
  pij list [--here] [--json]                         known sessions
  pij sessions [--here] [--json]                     telemetry join table: one row per session of the harness↔pij keys (pijId·harness·harnessSessionId·transcriptPath·boundModel)
  pij send <id> "<text>" | --command <name> [--wait] deliver a message / control command
  pij tail <id> [--since N --type T --lines N --follow]   peek a peer's transcript/log
  pij state <id> [--json]                            liveness + working/idle
  pij phonehome [--json]                             confirm a pending binding
  pij path <id> [--events|--state|--dir]             resolve on-disk paths`;

const SPAWN_USAGE = `pij spawn — spawn a colleague in a tmux pane (one uniform surface for every harness)

USAGE
  pij spawn --harness pi|claude|copilot|codex [--model <m>] [--effort <lvl>] [--task "<t>"] [--branch]

FLAGS
  --harness <h>   pi | claude | copilot | codex  (the harness to launch in a new tmux pane)
                    pi      -> self-registers at boot; NO daemon, NO binding step
                    claude  -> daemon-bound via transcript discovery
                    copilot -> daemon-bound via deterministic --session-id
                    codex   -> daemon-bound via transcript discovery (date-nested rollout)
  --model <m>     model id for that harness:
                    pi      -> a pi model/preset (e.g. @preset/glm-1m; pair with the
                               session's configured provider)
                    claude  -> sonnet | opus | haiku | claude-fable-5 | claude-sonnet-5
                    copilot -> gpt-5.5 | claude-sonnet-4.6 | …
                    codex   -> gpt-5.5 | o3 | … (codex -m model id)
                  NOTE: an unknown model is currently passed through to the harness,
                  which may silently fall back to its default — verify with the pane
                  footer / pij tail until spawn-time validation lands.
  --effort <lvl>  thinking/reasoning effort: off|minimal|low|medium|high|xhigh|max
                  (per-model — see the 'thinking' column in \`pij models\`). Translated
                  per harness: claude/copilot \`--effort\`, codex \`-c model_reasoning_effort=\`,
                  pi a \`:<lvl>\` suffix on the model id. Unset ⇒ the colleague's own default.
                  Validated warn-don't-block (an unsupported level warns, never blocks).
  --task "<t>"    first task. pi: rides PIJ_SPAWN_TASK env (finding 01). claude/copilot/
                  codex: queued to the peer's INBOX — the daemon injects it as the first
                  turn after bind (FX001-2; env alone was never read by these harnesses).
  --layout <l>    stack | right | below | window (FX001-3). Unset = stack (the DEFAULT):
                  peers stack in a ~1/3-width column on YOUR right — first spawn opens the
                  column, later spawns append below and the stack evens itself (no cap).
                  right/below split YOUR pane once (main+2 cap applies); window opens a
                  background window in YOUR session, named after the peer (cap-exempt).
  --branch        fork YOUR OWN session into the new pane (branch-from-self), so the
                  colleague inherits your full context. Claude only (pi/copilot/codex reject).
                  Requires: the new harness MATCHES yours and your session is bound.

pi: prints the new pane id immediately; the child self-registers and its pij-id arrives
via its ready-ping (see \`pij list\`). claude/copilot: returns the pre-allocated pij id
immediately; the daemon drives boot -> ready -> bound.`;

/** Package version for `pij --version` (best-effort; "unknown" if unreadable). */
function pijVersion(): string {
	try {
		const here = fileURLToPath(import.meta.url);
		const pkg = JSON.parse(readFileSync(join(here, "../../../../package.json"), "utf8"));
		return typeof pkg.version === "string" ? pkg.version : "unknown";
	} catch {
		return "unknown";
	}
}

/** Block the current thread for `ms` without spawning a process (no async). Used
 *  by compact-self to settle between keystrokes and to wait out compaction. */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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
		models: loadModels(),
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

// ─── daemon lifecycle (auto-start on demand + `pij daemon` verb) ──────────────

/** tmux window name pij gives a daemon window it creates. The convention is the
 *  robust ownership signal (survives a missing/stale lock): a window named this
 *  IS a pij-managed daemon window — safe to find and to tear down. */
const DAEMON_WINDOW_NAME = "pij-daemon";
const daemonLockPath = join(pijHome, "daemon.lock");

function readDaemonStatus() {
	let raw: string | null = null;
	try {
		raw = readFileSync(daemonLockPath, "utf8");
	} catch {
		/* no lock → absent */
	}
	return daemonStatus(parseLockFile(raw), (pid) => new NodeProcess().isAlive(pid));
}

/** Window ids (`@N`) of every tmux window named `pij-daemon`, across all sessions
 *  (`list-windows -a`). The lock-independent convention signal — used both to
 *  avoid double-starting and to tear the daemon's window down on stop. */
function daemonWindows(): string[] {
	try {
		const raw = execFileSync("tmux", ["list-windows", "-a", "-F", "#{window_id} #{window_name}"], {
			encoding: "utf8",
		});
		return raw
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
			.map((l) => {
				const sp = l.indexOf(" ");
				return { id: l.slice(0, sp), name: l.slice(sp + 1) };
			})
			.filter((w) => w.name === DAEMON_WINDOW_NAME && /^@\d+$/.test(w.id))
			.map((w) => w.id);
	} catch {
		return [];
	}
}

/** Ensure a daemon is running for a control-plane command. No-op when the lock
 *  shows a LIVE daemon, or when a `pij-daemon` window already exists (one is
 *  booting — the convention guard against a double-start race before the lock is
 *  written). Otherwise create a tmux window that runs the daemon and return a
 *  note so the calling agent KNOWS one was auto-started. Returns null if a daemon
 *  was already up (nothing to report). */
function ensureDaemonRunning(): string | null {
	if (!needsAutoStart(readDaemonStatus())) return null; // lock says a live daemon
	const tmux = new TmuxAdapter();
	if (!tmux.currentSession()) {
		return "⚠️ no pij daemon running and not inside tmux — start one with `pij daemon start`";
	}
	if (daemonWindows().length > 0) return null; // a pij-daemon window already exists (booting)
	const daemonPath = fileURLToPath(new URL("./daemon.ts", import.meta.url));
	const res = tmux.newWindow({
		name: DAEMON_WINDOW_NAME,
		cwd: process.cwd(),
		env: { PIJ_DAEMON_OWNED: "1" },
		cmd: "npx",
		args: ["tsx", daemonPath],
		detached: true, // background — never steal the operator's focus
	});
	if (!res.ok) return `⚠️ could not auto-start pij daemon: ${res.message}`;
	return `⚙ no pij daemon was running — started one in tmux window '${DAEMON_WINDOW_NAME}' (pane ${res.value.paneId}); it will drive control-plane sessions to bound.`;
}

/** `pij daemon [start|status|stop|kill]` — lifecycle for the machine-wide daemon.
 *  start: auto-start if absent. status: report lock + convention windows.
 *  stop/kill: SIGTERM the daemon AND kill any `pij-daemon` window pij owns. */
function runDaemonVerb(argv: readonly string[]): void {
	const sub = argv[0] ?? "start";
	if (sub === "start") {
		const note = ensureDaemonRunning();
		if (note) process.stdout.write(`${note}\n`);
		else {
			const st = readDaemonStatus();
			process.stdout.write(
				`pij daemon already running (pid ${st.kind === "running" ? st.pid : "?"})\n`,
			);
		}
		process.exit(0);
	}
	if (sub === "status") {
		const st = readDaemonStatus();
		const wins = daemonWindows();
		const winNote = wins.length ? `; pij-daemon window(s): ${wins.join(", ")}` : "";
		if (st.kind === "running") {
			process.stdout.write(
				`running (pid ${st.pid}${st.window ? `, window ${st.window}` : ""})${winNote}\n`,
			);
		} else if (st.kind === "stale") {
			process.stdout.write(`stale lock (dead pid ${st.pid})${winNote}\n`);
		} else {
			process.stdout.write(`not running${wins.length ? ` (orphan${winNote})` : ""}\n`);
		}
		process.exit(0);
	}
	if (sub === "stop" || sub === "kill") {
		const plan = planStop(readDaemonStatus());
		const did: string[] = [];
		if (plan.kind === "kill") {
			try {
				process.kill(plan.pid, "SIGTERM");
				did.push(`signalled daemon pid ${plan.pid}`);
			} catch {
				did.push(`daemon pid ${plan.pid} already gone`);
			}
		} else if (plan.kind === "cleanup") {
			did.push(`cleared stale lock (dead pid ${plan.pid})`);
		}
		// Convention teardown: kill EVERY pij-daemon window (the one in the lock +
		// any orphan a crashed start left behind). We own these by naming.
		for (const w of daemonWindows()) {
			try {
				// stderr piped (not inherited) so an already-auto-closed window's
				// "can't find window" never leaks to the caller — teardown is idempotent.
				execFileSync("tmux", ["kill-window", "-t", w], { stdio: ["ignore", "pipe", "pipe"] });
				did.push(`killed tmux window ${w}`);
			} catch {
				/* already gone */
			}
		}
		try {
			rmSync(daemonLockPath, { force: true });
		} catch {
			/* already gone */
		}
		process.stdout.write(
			did.length ? `pij daemon stopped — ${did.join("; ")}\n` : "no pij daemon running\n",
		);
		process.exit(0);
	}
	process.stderr.write(`E-ARG: unknown 'pij daemon' subcommand '${sub}' (use start|status|stop)\n`);
	process.exit(64);
}

/** `pij spawn --harness claude|copilot` (T018, AC-01): split a pane right running
 *  the harness under a PRE-ALLOCATED pij-id, write the `pending` descriptor, and
 *  return the id IMMEDIATELY (<500ms). The running daemon (auto-started here if
 *  absent) drives the pane to ready → bound asynchronously; this never blocks on
 *  boot. Impure (tmux + fs), so it lives in the bin; the parse + builders are pure. */
function runSpawn(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${SPAWN_USAGE}\n`);
		return;
	}
	const req = parseSpawnArgs(argv);
	if (!req.ok) {
		process.stderr.write(`${req.code}: ${req.message}\n`);
		process.exit(64);
	}
	// T006 / #3: warn (never block) on an unknown model OR an effort the chosen model
	// doesn't support, so the caller knows before the pane opens. Both continue.
	const known = loadModels();
	const spawnWarn = buildSpawnWarning(req.value.model, known);
	if (spawnWarn) process.stderr.write(`${spawnWarn}\n`);
	const effortWarn = buildEffortWarning(req.value.effort, req.value.model, known);
	if (effortWarn) process.stderr.write(`${effortWarn}\n`);
	const tmux = new TmuxAdapter();
	const ownPane = tmux.currentPane();
	if (!ownPane || !tmux.currentSession()) {
		process.stderr.write("E-NOTMUX: pij spawn --harness needs an active tmux session\n");
		process.exit(2);
	}
	// ── pi path (Plan 021 — one uniform spawn surface) ────────────────────────────
	// A pi child derives its OWN pij-id at boot and self-registers (core/session.ts
	// §H1), and its in-process receiver handles delivery (selectTransport: pi→inbox).
	// So unlike claude/copilot it needs NO daemon, NO pre-allocated id, NO pending
	// descriptor, NO transcript snapshot, and NO binding. We reuse the IDENTICAL
	// registry-based split layout so the fleet sits in one window just like the
	// daemon-bound harnesses — only the command builder + the (absent) bind differ.
	if (req.value.harness === "pi") {
		if (req.value.branch && !supportsBranching(req.value.harness)) {
			// pi cannot fork-from-self (supportsBranching → claude only); reject clearly.
			// Same predicate planBranch gates on, so the two never drift.
			process.stderr.write("E-BRANCH: --branch is not supported for pi (claude only)\n");
			process.exit(64);
		}
		const cwdPi = process.cwd();
		const regPi = new FsRegistry(pijHome);
		// announce-to: resolve the CALLING session (PIJ_SESSION_ID → lone-local →
		// $TMUX_PANE, same as --branch) so the child ready-pings us back. Unresolved
		// caller → "" → the child fresh-boots and announces to all peers.
		const selfPi = resolveSelf(
			process.env.PIJ_SESSION_ID,
			filterByFolder(regPi.list(), cwdPi),
			process.env.TMUX_PANE,
		);
		const announceTo = selfPi.ok ? selfPi.value : "";
		const spawnCmdPi = buildSpawnCommand({
			spawnId: `s${Date.now()}-${process.pid}`,
			announceTo,
			cwd: cwdPi,
			role: "worker",
			model: req.value.model,
			effort: req.value.effort,
			task: req.value.task,
		});
		// Same side-stack layout as the daemon-bound harnesses (shared helper → one
		// behaviour across the whole mixed fleet): first peer → right ~1/3 column,
		// later peers append to the stack (uncapped, evens itself).
		const peerPanesPi = livePeerPanes(regPi.list(), tmux.currentWindowPanes(), ownPane);
		const planPi = planPlacement(req.value.layout, ownPane, peerPanesPi);
		if (!planPi.ok) {
			process.stderr.write(`${planPi.code}: ${planPi.message}\n`);
			process.exit(2);
		}
		const splitPi =
			"window" in planPi
				? tmux.newWindow({
						cmd: spawnCmdPi.cmd,
						args: spawnCmdPi.args,
						env: spawnCmdPi.env,
						cwd: cwdPi,
						name: "pi-peer",
						detached: true,
					})
				: tmux.splitWindow({
						cmd: spawnCmdPi.cmd,
						args: spawnCmdPi.args,
						env: spawnCmdPi.env,
						cwd: cwdPi,
						target: planPi.target,
						direction: planPi.direction,
						percent: planPi.percent,
						evenOut: planPi.evenOut,
						columnPercent: planPi.columnPercent,
						detached: true, // keep focus here; the child boots on its own
					});
		if (!splitPi.ok) {
			process.stderr.write(`${splitPi.code}: ${splitPi.message}\n`);
			process.exit(2);
		}
		const panePi = splitPi.value.paneId;
		if (req.value.json) {
			process.stdout.write(
				`${JSON.stringify({
					harness: "pi",
					paneId: panePi,
					note: "pi self-registers; its id is assigned by the child at boot — watch for its ready-ping or `pij list`",
				})}\n`,
			);
		} else {
			process.stdout.write(
				`spawned pi worker in pane ${panePi} — it self-registers at boot (no daemon); its pij-id arrives via the ready-ping (see \`pij list\`)\n`,
			);
		}
		return;
	}
	// A control-plane spawn is inert without a daemon to drive it → ready → bound.
	// Auto-start one if none is running, and tell the caller we did (so the agent
	// knows a new tmux window appeared and that binding is now in motion).
	const daemonNote = ensureDaemonRunning();
	if (daemonNote) process.stdout.write(`${daemonNote}\n`);
	const cwd = process.cwd();
	const isCopilot = req.value.harness === "copilot";
	const isCodex = req.value.harness === "codex";
	// Branch-from-self (Plan 020): `--branch` forks the CALLER's own session into the
	// new pane. Resolve who's calling (PIJ_SESSION_ID → lone-local → $TMUX_PANE),
	// then gate purely via planBranch (same-harness + supports-branching + bound).
	// A forked claude pins its id (`--session-id`), so it binds on the planned id —
	// no transcript snapshot. branch-from-ANOTHER-peer is out of scope (we only ever
	// pass our own resolved descriptor as `self`), but the seam doesn't preclude it.
	// Resolve the CALLING session once (PIJ_SESSION_ID → lone-local → $TMUX_PANE):
	// its pij-id becomes the child's PIJ_PARENT_ID (who spawned it), and — for
	// --branch — the source descriptor to fork. Unresolved caller → no parent.
	const reg0 = new FsRegistry(pijHome);
	const locals0 = filterByFolder(reg0.list(), cwd);
	const callerRes = resolveSelf(process.env.PIJ_SESSION_ID, locals0, process.env.TMUX_PANE);
	const parentId = callerRes.ok ? callerRes.value : undefined;
	let branchFrom: string | undefined;
	let forkSessionId: string | undefined;
	if (req.value.branch) {
		const self = callerRes.ok ? (reg0.read(callerRes.value) ?? null) : null;
		const plan = planBranch(req.value.harness, self, supportsBranching, randomUUID());
		if (!plan.ok) {
			process.stderr.write(`${plan.code}: ${plan.message}\n`);
			process.exit(64);
		}
		branchFrom = plan.value.from;
		forkSessionId = plan.value.newSessionId;
	}
	// Copilot lets us CHOOSE the session UUID (`--session-id`), so binding is
	// deterministic at spawn — no transcript-discovery snapshot needed. A branched
	// claude is the same: it pins its forked id. A NON-branch claude's id is
	// auto-generated, so snapshot the transcript dir NOW (before the pane and Claude
	// exist) so new-path discovery is genuinely deterministic (the daemon's
	// first-tick snapshot would race Claude's early transcript write — H1).
	const copilotSessionId = isCopilot ? randomUUID() : undefined;
	const skipSnapshot = isCopilot || forkSessionId !== undefined;
	let transcriptsAtSpawn: string[] = [];
	if (!skipSnapshot) {
		if (isCodex) {
			// Codex's rollouts live in the GLOBAL date-nested tree ~/.codex/sessions/**
			// (Plan 022) — snapshot it recursively BEFORE the pane exists so new-path
			// discovery is deterministic (the same H1 race-avoidance as claude, with
			// codex's layout). The daemon binds the one rollout absent from this set.
			transcriptsAtSpawn = listCodexRollouts((d) => {
				try {
					return readdirSync(d);
				} catch {
					return [];
				}
			}, codexTranscriptRoot(homedir()));
		} else {
			const dir = transcriptDir(homedir(), cwd);
			try {
				transcriptsAtSpawn = readdirSync(dir)
					.filter((n) => n.endsWith(".jsonl"))
					.map((n) => `${dir}/${n}`);
			} catch {
				/* dir not created yet → empty before-set */
			}
		}
	}
	const token = `s${Date.now()}-${process.pid}`;
	const pijId = allocatePijId(token, process.pid);
	const spawnCmd = buildControlSpawnCommand({
		harness: req.value.harness,
		pijId,
		cwd,
		model: req.value.model,
		effort: req.value.effort,
		task: req.value.task,
		parentId,
		copilotSessionId,
		branchFrom,
		forkSessionId,
	});
	// Layout (parity with pi's pij_spawn): the FIRST peer splits the orchestrator
	// pane right (a ~1/3 column); every later peer appends to the stack (vertical,
	// evened out — uncapped). The shared helper derives the live peer panes
	// (registry ∩ this window) — harness-agnostic, one stack for the mixed fleet.
	const peerPanes = livePeerPanes(
		new FsRegistry(pijHome).list(),
		tmux.currentWindowPanes(),
		ownPane,
	);
	const plan = planPlacement(req.value.layout, ownPane, peerPanes);
	if (!plan.ok) {
		process.stderr.write(`${plan.code}: ${plan.message}\n`);
		process.exit(2);
	}
	// FX001-3 / SUGG-001: --layout window opens a background window in the CALLER's
	// session (named after the peer, so it's findable) instead of splitting.
	const split =
		"window" in plan
			? tmux.newWindow({
					cmd: spawnCmd.cmd,
					args: spawnCmd.args,
					env: spawnCmd.env,
					cwd,
					name: pijId,
					detached: true,
				})
			: tmux.splitWindow({
					cmd: spawnCmd.cmd,
					args: spawnCmd.args,
					env: spawnCmd.env,
					cwd,
					target: plan.target,
					direction: plan.direction,
					percent: plan.percent,
					evenOut: plan.evenOut,
					columnPercent: plan.columnPercent,
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
			// Record who spawned this worker so `pij close` is ownership-aware (a pi
			// child self-registers spawnedBy; claude/copilot get it written here).
			spawnedBy: parentId,
			transcriptsAtSpawn: skipSnapshot ? undefined : transcriptsAtSpawn,
			plannedHarnessSessionId: copilotSessionId ?? forkSessionId,
			branchedFrom: branchFrom,
		}),
	);
	// FX001-2 / DL-002: a daemon-bound peer never reads PIJ_SPAWN_TASK (only pi
	// children do), so --task rode env into a void. Queue it in the peer's INBOX
	// instead — the daemon injects it as the first turn after bind, exactly like
	// an agent packet pointer (daemon.ts drainInbox). Env stays for the pi path.
	if (req.value.task !== undefined) {
		new FsChannel(pijHome).deliver({
			from: parentId && parentId.trim() !== "" ? parentId : pijId,
			to: pijId,
			body: req.value.task,
		});
	}
	if (req.value.json) {
		process.stdout.write(
			`${JSON.stringify({ id: pijId, paneId, harness: req.value.harness, lifecycle: "pending", ...(branchFrom ? { branchedFrom: branchFrom } : {}) })}\n`,
		);
	} else {
		const branchNote = branchFrom ? ` — branched from ${branchFrom}` : "";
		process.stdout.write(
			`spawned ${pijId} (${req.value.harness})${branchNote} in pane ${paneId} — daemon will drive it to ready→bound (track: pij state ${pijId} · pij tail ${pijId})\n`,
		);
	}
	process.exit(0);
}

/** `pij compact-self [--pane %N] [--delay-ms N] [instruction…]` — type `/compact`
 *  + Enter into the CURRENT tmux pane (default `$TMUX_PANE`) so a session compacts
 *  ITSELF. With an `instruction`, after firing `/compact` it waits `--delay-ms`
 *  (default ~1.5s, so compaction has begun) then types the instruction + Enter —
 *  the harness QUEUES input entered during compaction, so the follow-up runs as the
 *  first turn of the fresh context. Works for any harness (pi/claude/copilot all
 *  run `/compact` + queue typed input). No daemon/registry: just send-keys. */
function runCompactSelf(argv: readonly string[]): void {
	const req = parseCompactSelfArgs(argv, process.env.TMUX_PANE);
	const pane = req.pane;
	if (!pane || !/^%\d+$/.test(pane)) {
		process.stderr.write(
			"E-NOTMUX: compact-self needs a tmux pane (set $TMUX_PANE, or pass --pane %N)\n",
		);
		process.exit(2);
	}
	typeLiteral(pane, "/compact", execFileRunner);
	// Settle so the paste/slash-menu detection resolves before Enter (same lesson
	// as the daemon's send-keys — fire Enter too soon and it's swallowed).
	sleepSync(300);
	pressKey(pane, "Enter", 1, execFileRunner);
	if (req.instruction) {
		// Let compaction BEGIN, then type the follow-up. The harness queues input
		// entered mid-compaction and runs it once the fresh context is ready.
		sleepSync(req.delayMs);
		typeLiteral(pane, req.instruction, execFileRunner);
		sleepSync(300);
		pressKey(pane, "Enter", 1, execFileRunner);
		process.stdout.write(
			`compact-self → fired /compact into ${pane}, queued follow-up (after ${req.delayMs}ms): ${req.instruction}\n`,
		);
	} else {
		process.stdout.write(`compact-self → fired /compact into ${pane}\n`);
	}
	process.exit(0);
}

/** Best-effort mtime (ms) of a path — `-1` if unreadable, so it sorts last. */
function statMtime(path: string): number {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return -1;
	}
}

/** Best-effort listing of `~/.copilot/session-state/*` child dirs with mtimes for
 *  the copilot adopt scanner (finding 02b). Returns `[]` if the root is unreadable
 *  (copilot never ran here). Impure — passed into the pure `copilotSessionStateScan`. */
function listCopilotStateDirs(root: string): CopilotSessionDir[] {
	try {
		return readdirSync(root).map((name) => ({ name, mtimeMs: statMtime(join(root, name)) }));
	} catch {
		return [];
	}
}

/** `pij adopt <pane> --harness <h> [--export]` (T023, AC-14; harness-aware per
 *  Plan 031): register an ALREADY-running tmux agent (e.g. this orchestrator's
 *  own pane) as a bound pij peer so other sessions can `pij send` to it and the
 *  daemon dumps the message into its pane. Adopt has no post-spawn new-file event,
 *  so it binds by its OWN harness-aware rule (`resolveAdoptSessionIdForHarness`):
 *    - claude → the adopting shell's CLAUDE_CODE_SESSION_ID, else the newest
 *      transcript stem in the cwd (unchanged);
 *    - codex → the newest rollout's trailing UUID + its absolute transcriptPath;
 *    - copilot → the newest `~/.copilot/session-state/*` uuid (NEW scan; never the
 *      claude dir — finding 02b);
 *  else pending + `pij phonehome`. `--export` prints ONLY the eval-able
 *  `export PIJ_SESSION_ID=…` block (ergonomic self-resolution sugar — NOT the
 *  telemetry fix; finding 04). */
function runAdopt(argv: readonly string[]): void {
	// `--export` is not a parseAdoptArgs flag (that parser lives in core/spawn.ts);
	// strip it here so the rest parses cleanly, then emit the eval block instead of
	// the human confirmation line.
	const wantExport = argv.includes("--export");
	const req = parseAdoptArgs(argv.filter((a) => a !== "--export"));
	if (!req.ok) {
		process.stderr.write(`${req.code}: ${req.message}\n`);
		process.exit(64);
	}
	const pane = req.value.pane;
	const harness = req.value.harness;
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
	// Harness-aware newest-first listings (the impure readdir/mtime-sort lives here;
	// the decision is the pure resolver). Only the relevant harness's listing runs.
	let claudeStemsNewestFirst: string[] = [];
	let codexRolloutPathsNewestFirst: string[] = [];
	let copilotSessionId: string | null = null;
	if (harness === "codex") {
		// Codex's rollouts live in the GLOBAL date-nested tree ~/.codex/sessions/**;
		// deep-list then mtime-sort newest-first (the pane-start-time proxy).
		const paths = listCodexRollouts((d) => {
			try {
				return readdirSync(d);
			} catch {
				return [];
			}
		}, codexTranscriptRoot(homedir()));
		codexRolloutPathsNewestFirst = paths
			.map((p) => ({ p, t: statMtime(p) }))
			.sort((a, b) => b.t - a.t)
			.map(({ p }) => p);
	} else if (harness === "copilot") {
		// finding 02b: NEW scan of ~/.copilot/session-state/* (dir-name = uuid),
		// newest by mtime. NEVER the claude dir.
		copilotSessionId = copilotSessionStateScan(listCopilotStateDirs, homedir());
	} else {
		// claude (+ pi): unchanged — newest transcript stems in the cwd's project dir.
		const dir = transcriptDir(homedir(), cwd);
		try {
			claudeStemsNewestFirst = readdirSync(dir)
				.filter((n) => n.endsWith(".jsonl"))
				.map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
				.sort((a, b) => b.t - a.t)
				.map(({ n }) => n.slice(0, -".jsonl".length));
		} catch {
			/* no transcripts yet */
		}
	}
	const resolution = resolveAdoptSessionIdForHarness({
		harness,
		envSessionId: process.env.CLAUDE_CODE_SESSION_ID,
		claudeStemsNewestFirst,
		codexRolloutPathsNewestFirst,
		copilotSessionId,
	});
	const harnessSessionId = resolution.harnessSessionId ?? undefined;
	const pijId = req.value.id ?? allocatePijId(`adopt-${pane}`, panePid);
	const dataDir = join(pijHome, pijId);
	let descriptor = buildPendingDescriptor({
		pijId,
		paneId: pane,
		cwd,
		harness,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
		pid: panePid,
		startedAtIso: new Date().toISOString(),
	});
	if (harnessSessionId) {
		descriptor = applyBinding(descriptor, harnessSessionId);
		// codex needs the ABSOLUTE rollout path persisted (a bare uuid can't
		// reconstruct the date-nested path) — mirror loop.ts:337.
		if (resolution.transcriptPath) {
			descriptor = { ...descriptor, transcriptPath: resolution.transcriptPath };
		}
	}
	new FsRegistry(pijHome).write(descriptor);
	if (wantExport) {
		// AC-5: the eval-able block is the ONLY stdout, safe to `eval`.
		process.stdout.write(`${buildExportLines(descriptor)}\n`);
	} else if (req.value.json) {
		process.stdout.write(
			`${JSON.stringify({ id: pijId, paneId: pane, harness, harnessSessionId: harnessSessionId ?? null, transcriptPath: descriptor.transcriptPath ?? null, lifecycle: descriptor.lifecycle })}\n`,
		);
	} else if (harnessSessionId) {
		process.stdout.write(
			`adopted ${pijId} ↔ ${harness} session ${harnessSessionId} (pane ${pane}, bound) — peers can now: pij send ${pijId} "<text>"\n`,
		);
	} else {
		process.stdout.write(
			`adopted ${pijId} (pane ${pane}, pending) — run \`pij phonehome\` in that pane to confirm the binding\n`,
		);
	}
	process.exit(0);
}

/** `pij close <id> [--force]` — tear down a colleague's tmux pane and drop its
 *  descriptor with just the pij-id (the first-class replacement for hand-rolled
 *  `tmux kill-pane` + `rm ~/.pij/<id>.json`). Ownership-guarded by `planClose`:
 *  you may close a worker you spawned; closing one you don't own is refused
 *  (E-OWN) unless `--force`. Impure (tmux killPane + registry.remove), so it
 *  lives in the bin; the decision is the pure core. */
function runClose(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(
			"pij close — tear down a colleague's pane + descriptor by pij-id\n\n" +
				"USAGE\n  pij close <id> [--force]\n\n" +
				"FLAGS\n  --force   close a session you did NOT spawn (default: refuse with E-OWN)\n",
		);
		return;
	}
	const parsed = parseCloseArgs(argv);
	if (!parsed.ok) {
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(64);
	}
	const reg = new FsRegistry(pijHome);
	const descriptor = reg.read(parsed.value.id);
	// Resolve who's asking (PIJ_SESSION_ID → lone-local → $TMUX_PANE) for the
	// ownership check. Unresolved self is fine — a non-owner without --force is
	// refused either way, and --force always proceeds.
	const selfRes = resolveSelf(
		process.env.PIJ_SESSION_ID,
		filterByFolder(reg.list(), process.cwd()),
		process.env.TMUX_PANE,
	);
	const self = selfRes.ok ? selfRes.value : undefined;
	const plan = planClose(descriptor, parsed.value.id, self, parsed.value.force);
	if (!plan.ok) {
		process.stderr.write(`${plan.code}: ${plan.message}\n`);
		// E-NOID / E-SELF / E-OWN are all precondition refusals → exit 2.
		process.exit(2);
	}
	if (plan.value.warning) process.stderr.write(`${plan.value.warning}\n`);
	const tmux = new TmuxAdapter();
	const killed = tmux.killPane(plan.value.paneId); // idempotent: swallows "already gone"
	if (!killed.ok) {
		process.stderr.write(`${killed.code}: ${killed.message}\n`);
		process.exit(2);
	}
	reg.remove(plan.value.id);
	process.stdout.write(
		`closed ${plan.value.id} — killed pane ${plan.value.paneId}, removed descriptor\n`,
	);
	process.exit(0);
}

/** `pij tail <pij-id>` for a BOUND control-plane session (T022, AC-09): a coding
 *  harness writes its OWN per-session JSONL transcript, not pij's events.ndjson —
 *  claude under ~/.claude/projects/…/<sid>.jsonl, copilot under
 *  ~/.copilot/session-state/<sid>/events.jsonl, codex under the persisted
 *  ~/.codex/sessions/…/rollout-…<uuid>.jsonl (Plan 022, Finding 06). Resolve that
 *  file (by harness) and stream a summarized view (`[role] text`, tool calls as
 *  `⚙ name`); `--follow` polls for new lines. Returns false when the target is not
 *  a bound claude/copilot/codex (caller falls back to the normal event tail). */
function tailTranscript(id: string, follow: boolean, linesArg: number | undefined): boolean {
	const d = new FsRegistry(pijHome).read(id);
	if (!d?.harnessSessionId) return false;
	let path: string;
	let summarize: (raw: string) => { role: "user" | "assistant"; text: string } | null;
	if (d.harness === "claude") {
		path = transcriptPathFor(homedir(), d.folder, d.harnessSessionId);
		summarize = summarizeTranscriptLine;
	} else if (d.harness === "copilot") {
		path = sessionEventsPath(homedir(), d.harnessSessionId);
		summarize = summarizeCopilotEvent;
	} else if (d.harness === "codex") {
		// Codex's date-nested rollout path can't be rebuilt from the bare UUID, so
		// tail reads the absolute path the daemon persisted at bind (Finding 06).
		if (!d.transcriptPath) return false;
		path = d.transcriptPath;
		summarize = summarizeCodexEvent;
	} else {
		return false;
	}
	const render = (raw: string): void => {
		const e = summarize(raw);
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

// ─── `pij agent` verb family (plan 029 Phase 2) ──────────────────────────────

const AGENT_USAGE = `pij agent — run declarative minih agent packs (discover · run · author)

USAGE
  pij agent list [--json]                         merged inventory: ./agents · ~/.pij/agents · built-ins
  pij agent run <slug> [-p k=v…] [flags]          run a named pack (records under runs/ by default)
  pij agent run <slug> --ephemeral                run a named pack without recording (temp-copy path)
  pij agent run --prompt "<text>"                 inline zero-setup run (nothing left on disk)
  pij agent run --prompt -                         read the inline prompt from stdin
  pij agent show <slug>                           pack defaults, schemas, files (+ eject hint)
  pij agent new <slug>                            scaffold ./agents/<slug> (minih init when on PATH)
  pij agent check <slug>                          validate frontmatter + schemas (exit 1 on failure)
  pij agent eject <slug>                          copy a built-in into ./agents to customise + record

  pij agent spawn <slug> [-p k=v…] [--once] [--layout stack|right|below|window]   run a pack as a daemon-bound pij peer (packet auto-delivered; default = side stack)
  pij agent spawn --prompt "<text>" [--once]      spawn an inline pack peer
  pij spawn --agent <slug> [-p k=v…] [--once]     alias for \`pij agent spawn\`
  pij agent report --json '<payload>'             (inside a peer pane) push a schema-valid report to the spawner

  pij agents …                                    alias for \`pij agent list\`

RUN FLAGS (override pack frontmatter — warn, never block)
  -p key=value        input param (repeatable; JSON-coerced: 20→number, true→bool)
  --model <m>         override the pack's model              --effort <lvl>   override reasoning effort
  --harness <h>       claude | codex | copilot              --permissions <p> minih preset
  --timeout <s>       wall-clock budget in seconds          --cwd <dir>       run cwd
  --output-schema <f> attach an output schema (inline)      --json            machine envelope on stdout
  --quiet             silence the stderr progress stream

EXIT CODES  0 success · 1 user/agent error (bad input, run failed) · 2 system error (harness CLI missing)`;

const FAKE_ENVELOPE = JSON.stringify({
	summary: "Fake agent run (PIJ_AGENT_FAKE=1) — no real harness was invoked.",
	retrospective: {
		workedWell: "The deterministic fake-adapter seam kept the run hermetic and free.",
		confusing: "Nothing — this is a scripted stand-in for a real harness (test seam only).",
		magicWand: "A first-class record/replay fixture harness upstream in minih.",
	},
});

/** Is `cmd` resolvable on PATH? Used to fail fast with E-HARNESSBIN before any LLM session. */
function onPath(cmd: string): boolean {
	try {
		execFileSync("which", [cmd], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/** Model id → harness via the pi models registry provider + PROVIDER_HARNESS_MAP. */
function harnessForModel(
	models: readonly ModelEntry[],
	model: string | undefined,
): string | undefined {
	if (!model) return undefined;
	const norm = normalizeModelQuery(model);
	const entry = models.find((e) => normalizeModelQuery(e.id) === norm);
	return entry ? PROVIDER_HARNESS_MAP[entry.provider] : undefined;
}

/** Build a harness adapter, or a structured harness error. `PIJ_AGENT_FAKE=1` is a
 *  test seam: a deterministic FakeAgentAdapter so scripted runs (scratch/, CI) need
 *  no real CLI + burn no tokens. Copilot's SDK-missing case maps to E-HARNESSBIN. */
async function makeAgentAdapter(harness: string): Promise<AdapterResolution> {
	if (process.env.PIJ_AGENT_FAKE === "1") {
		return { ok: true, adapter: new FakeAgentAdapter({ output: FAKE_ENVELOPE }) };
	}
	switch (harness) {
		case "claude":
			if (!onPath("claude")) return { ok: false, error: { code: "E-HARNESSBIN", bin: "claude" } };
			return { ok: true, adapter: new ClaudeHeadlessAdapter() };
		case "codex":
			if (!onPath("codex")) return { ok: false, error: { code: "E-HARNESSBIN", bin: "codex" } };
			return { ok: true, adapter: new CodexExecAdapter() };
		case "copilot":
			try {
				return { ok: true, adapter: await createCopilotAdapter() };
			} catch (err) {
				if (err instanceof CopilotSdkMissingError) {
					return {
						ok: false,
						error: { code: "E-HARNESSBIN", bin: COPILOT_SDK_PACKAGE, message: err.message },
					};
				}
				throw err;
			}
		default:
			return { ok: false, error: { code: "E-NOADAPTER", harness } };
	}
}

/** Delegate `new` to minih's own scaffolder when the binary is on PATH (byte-compat). */
function runMinihInit(slug: string, cwd: string): { ok: boolean; stderr: string } {
	try {
		execFileSync("minih", ["init", slug], { cwd, stdio: "pipe" });
		return { ok: true, stderr: "" };
	} catch (err) {
		return { ok: false, stderr: (err as Error).message };
	}
}

function agentDeps(quiet: boolean): VerbDeps {
	const models = loadModels();
	const runCwd = process.cwd();
	// The adapter subprocess runs in minih's run dir (isolated), so agents can't see
	// the project by cwd. Export the repo root so packs (e.g. flowspace-search) can
	// reach it — they read $PIJ_AGENT_CWD to locate this repo's fs2 graph.
	process.env.PIJ_AGENT_CWD = runCwd;
	return {
		pijHome,
		cwd: runCwd,
		builtinDir: fileURLToPath(new URL("./builtin-agents", import.meta.url)),
		defaultHarness: "claude",
		harnessForModel: (m) => harnessForModel(models, m),
		modelWarning: (m) => buildSpawnWarning(m, models),
		effortWarning: (e, m) => buildEffortWarning(e, m, models),
		makeAdapter: makeAgentAdapter,
		progress: (line) => {
			if (!quiet) process.stderr.write(`${line}\n`);
		},
		readStdin: () => readFileSync(0, "utf8"),
		hasMinihBinary: () => onPath("minih"),
		runMinihInit,
	};
}

/** The 3-tier agent discovery sources (project → user → built-in), in precedence
 *  order — the same set the pure verbs use, resolved at the bin for spawn/report. */
function agentDiscoverySources(cwd: string): DiscoverySource[] {
	const builtinDir = fileURLToPath(new URL("./builtin-agents", import.meta.url));
	return [
		{ dir: join(cwd, "agents"), source: "project" },
		{ dir: agentsDir(pijHome), source: "user" },
		{ dir: builtinDir, source: "builtin" },
	];
}

interface AgentPaneOutcome {
	ok: boolean;
	pane?: AgentSpawnPaneInfo;
	message?: string;
	exitCode?: number;
}

/** Open the tmux pane for a daemon-bound agent peer (mirrors runSpawn's control
 *  split): snapshot transcripts (claude/codex) or mint a copilot session-id for a
 *  deterministic bind, build the spawn command with the peer env (PIJ_AGENT_CWD),
 *  split per the shared layout, and capture the pane's foreground pid. Returns the
 *  {@link AgentSpawnPaneInfo} the descriptor write needs. */
function spawnAgentPane(
	plan: {
		id: string;
		harness: HarnessKind;
		model?: string;
		effort?: string;
		spawnedBy?: string;
		layout?: SpawnLayout;
	},
	cwd: string,
): AgentPaneOutcome {
	const tmux = new TmuxAdapter();
	const ownPane = tmux.currentPane();
	if (!ownPane || !tmux.currentSession()) {
		return {
			ok: false,
			message: "E-NOTMUX: pij agent spawn needs an active tmux session",
			exitCode: 2,
		};
	}
	const isCopilot = plan.harness === "copilot";
	const isCodex = plan.harness === "codex";
	const copilotSessionId = isCopilot ? randomUUID() : undefined;
	const skipSnapshot = isCopilot;
	let transcriptsAtSpawn: string[] = [];
	if (!skipSnapshot) {
		if (isCodex) {
			transcriptsAtSpawn = listCodexRollouts((d) => {
				try {
					return readdirSync(d);
				} catch {
					return [];
				}
			}, codexTranscriptRoot(homedir()));
		} else {
			const dir = transcriptDir(homedir(), cwd);
			try {
				transcriptsAtSpawn = readdirSync(dir)
					.filter((n) => n.endsWith(".jsonl"))
					.map((n) => `${dir}/${n}`);
			} catch {
				/* dir not created yet → empty before-set */
			}
		}
	}
	const base = buildControlSpawnCommand({
		harness: plan.harness,
		pijId: plan.id,
		cwd,
		...(plan.model ? { model: plan.model } : {}),
		...(plan.effort ? { effort: plan.effort } : {}),
		...(plan.spawnedBy ? { parentId: plan.spawnedBy } : {}),
		...(copilotSessionId ? { copilotSessionId } : {}),
	});
	const env = buildAgentPeerEnv(base.env, { agentCwd: cwd });
	const peerPanes = livePeerPanes(
		new FsRegistry(pijHome).list(),
		tmux.currentWindowPanes(),
		ownPane,
	);
	const splitPlan = planPlacement(plan.layout, ownPane, peerPanes);
	if (!splitPlan.ok)
		return { ok: false, message: `${splitPlan.code}: ${splitPlan.message}`, exitCode: 2 };
	const split =
		"window" in splitPlan
			? tmux.newWindow({ cmd: base.cmd, args: base.args, env, cwd, name: plan.id, detached: true })
			: tmux.splitWindow({
					cmd: base.cmd,
					args: base.args,
					env,
					cwd,
					target: splitPlan.target,
					direction: splitPlan.direction,
					percent: splitPlan.percent,
					evenOut: splitPlan.evenOut,
					columnPercent: splitPlan.columnPercent,
					detached: true,
				});
	if (!split.ok) return { ok: false, message: `${split.code}: ${split.message}`, exitCode: 2 };
	const paneId = split.value.paneId;
	let panePid = process.pid;
	try {
		const raw = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_pid}"], {
			encoding: "utf8",
		}).trim();
		if (/^\d+$/.test(raw)) panePid = Number(raw);
	} catch {
		/* fall back to the spawner pid */
	}
	const dataDir = join(pijHome, plan.id);
	return {
		ok: true,
		pane: {
			paneId,
			panePid,
			dataDir,
			eventsPath: join(dataDir, "events.ndjson"),
			startedAtIso: new Date().toISOString(),
			...(skipSnapshot ? {} : { transcriptsAtSpawn }),
			...(copilotSessionId ? { plannedHarnessSessionId: copilotSessionId } : {}),
		},
	};
}

/** `pij agent spawn <slug|--prompt> [-p k=v] [--once]` — run a pack as a
 *  daemon-bound pij peer (AC-14). Validates `-p` input BEFORE any pane opens,
 *  splits a control pane, records the peer (with agent + lifecycle fields), and
 *  delivers the packet pointer to its inbox for the daemon to inject after bind. */
function runAgentSpawn(cmd: ParsedAgentCommand): void {
	const cwd = process.cwd();
	// Export PIJ_AGENT_CWD for this process too (parity with agentDeps); the child
	// gets it via the spawn env.
	process.env.PIJ_AGENT_CWD = cwd;
	const models = loadModels();
	const token = `s${Date.now()}-${process.pid}`;
	const id = allocatePijId(token, process.pid);

	// Resolve the caller so the peer is ownership-stamped + can report back.
	// Pane-first across the FULL registry (FX001-1 / DL-003): the folder filter
	// starved the pane match on cross-repo spawns (cd other-repo && pij agent spawn),
	// silently losing spawnedBy — the report then died E-NOREPORTTARGET and a
	// --once peer never auto-closed.
	const reg = new FsRegistry(pijHome);
	const ownPaneEnv = process.env.TMUX_PANE;
	const byPane = ownPaneEnv ? reg.list().filter((d) => d.paneId === ownPaneEnv) : [];
	const callerRes =
		!process.env.PIJ_SESSION_ID && byPane.length === 1 && byPane[0]
			? { ok: true as const, value: byPane[0].id }
			: resolveSelf(process.env.PIJ_SESSION_ID, filterByFolder(reg.list(), cwd), ownPaneEnv);
	const spawnedBy = callerRes.ok ? callerRes.value : undefined;
	// Fail-fast advisory (FX001-1): without a resolved caller there is NO report
	// target — `pij agent report` will die E-NOREPORTTARGET and a --once peer can
	// never auto-close. Warn loudly, never block (register with `pij adopt` first).
	if (!spawnedBy) {
		process.stderr.write(
			"⚠️  caller unresolved — spawnedBy will NOT be stamped: the peer's report has no target " +
				"(E-NOREPORTTARGET) and --once auto-close cannot fire. Register this pane first: " +
				'pij adopt "$TMUX_PANE" --harness <h>, or set PIJ_SESSION_ID.\n',
		);
	}

	// Prepare = resolve pack + AJV-validate input + derive harness/lifecycle/advisory
	// + render packet. A bad input fails HERE — before any daemon start or tmux call.
	const prep = prepareAgentSpawn(
		{ cmd, id, ...(spawnedBy ? { spawnedBy } : {}) },
		{
			pijHome,
			cwd,
			discover: () => discoverAgents(agentDiscoverySources(cwd)),
			validateInput,
			harnessForModel: (m) => harnessForModel(models, m),
			defaultHarness: "claude",
		},
	);
	if (!prep.ok) {
		process.stderr.write(`${renderAgentError(prep.error)}\n`);
		process.exit(exitCodeFor(prep.error.code));
	}
	const plan = prep.plan;

	// Warn-never-block on model/effort (same policy as run), then the one-shot
	// permissions advisory (KF-09) — printed exactly once on stderr.
	const mw = buildSpawnWarning(plan.model, models);
	if (mw) process.stderr.write(`${mw}\n`);
	const ew = buildEffortWarning(plan.effort, plan.model, models);
	if (ew) process.stderr.write(`${ew}\n`);
	if (plan.advisory) process.stderr.write(`${plan.advisory}\n`);

	// A daemon must be up to drive the peer pending→bound (and inject the packet).
	const daemonNote = ensureDaemonRunning();
	if (daemonNote) process.stdout.write(`${daemonNote}\n`);

	const paneRes = spawnAgentPane(
		{
			id,
			harness: plan.harness,
			...(plan.model ? { model: plan.model } : {}),
			...(plan.effort ? { effort: plan.effort } : {}),
			...(spawnedBy ? { spawnedBy } : {}),
			...(cmd.layout ? { layout: cmd.layout } : {}),
		},
		cwd,
	);
	if (!paneRes.ok || !paneRes.pane) {
		process.stderr.write(`${paneRes.message ?? "E-SPAWN: could not open pane"}\n`);
		process.exit(paneRes.exitCode ?? 2);
	}

	const { packetPath } = finalizeAgentSpawn(plan, paneRes.pane, {
		pijHome,
		registry: reg,
		channel: new FsChannel(pijHome),
		cwd,
	});

	if (cmd.json) {
		process.stdout.write(
			`${JSON.stringify({
				id,
				paneId: paneRes.pane.paneId,
				harness: plan.harness,
				agentPack: plan.slug,
				lifecycle: plan.lifecycle,
				packet: packetPath,
			})}\n`,
		);
	} else {
		process.stdout.write(
			`spawned agent '${plan.slug}' as ${id} (${plan.harness}, ${plan.lifecycle}) in pane ${paneRes.pane.paneId} — ` +
				`the daemon will inject its packet after bind (track: pij state ${id} · pij tail ${id})\n`,
		);
	}
	process.exit(0);
}

/** `pij agent report --json '<payload>'` — a spawned peer's synchronous done
 *  signal (AC-15): resolve self from PIJ_SESSION_ID, validate the payload against
 *  the pack's output schema, and on success push it to the spawner + stamp
 *  reportedAt. An invalid report exits 1 with the AJV lines and delivers nothing. */
function runAgentReport(cmd: ParsedAgentCommand): void {
	const reg = new FsRegistry(pijHome);
	const selfRes = resolveSelf(
		process.env.PIJ_SESSION_ID,
		filterByFolder(reg.list(), process.cwd()),
		process.env.TMUX_PANE,
	);
	if (!selfRes.ok) {
		process.stderr.write(
			`${selfRes.code}: ${selfRes.message}\n` +
				"pij agent report must run inside the spawned pack's own pane (PIJ_SESSION_ID is set there).\n",
		);
		process.exit(1);
	}
	let payload: unknown;
	try {
		payload = JSON.parse(cmd.reportJson as string);
	} catch (e) {
		process.stderr.write(`E-ARG: report --json is not valid JSON: ${(e as Error).message}\n`);
		process.exit(1);
	}
	const res = executeAgentReport(selfRes.value, payload, {
		pijHome,
		registry: reg,
		channel: new FsChannel(pijHome),
		now: () => Date.now(),
	});
	if (!res.ok) {
		process.stderr.write(`${res.error.code}: ${res.error.message}\n`);
		if (res.error.code === "E-BADREPORT") {
			for (const line of res.error.errors) process.stderr.write(`  ${line}\n`);
		}
		process.exit(1);
	}
	process.stdout.write(`reported to ${res.to}\n`);
	process.exit(0);
}

/** Intercept + drive `pij agent <subverb>`. Async (a run awaits minih); resolves by
 *  exiting the process with the verb's exit code. Reachable with a daemon-less home. */
async function runAgentVerb(args: string[]): Promise<void> {
	if (args.length === 0) {
		process.stdout.write(`${AGENT_USAGE}\n`);
		process.exit(0);
	}
	const parsed = parseAgentArgs(args);
	if (!parsed.ok) {
		process.stderr.write(
			`${renderAgentError({ code: "E-ARG", message: parsed.message })}\n\n${AGENT_USAGE}\n`,
		);
		process.exit(exitCodeFor("E-ARG"));
	}
	// Peer-mode subverbs are impure (tmux split / registry / channel) — the bin owns
	// them (they never reach the pure dispatchAgent).
	if (parsed.cmd.subverb === "spawn") {
		runAgentSpawn(parsed.cmd);
		return;
	}
	if (parsed.cmd.subverb === "report") {
		runAgentReport(parsed.cmd);
		return;
	}
	try {
		const res = await dispatchAgent(parsed.cmd, agentDeps(parsed.cmd.quiet));
		if (res.stdout) process.stdout.write(`${res.stdout}\n`);
		if (res.stderr) process.stderr.write(`${res.stderr}\n`);
		process.exit(res.exitCode);
	} catch (err) {
		process.stderr.write(`E-RUNFAILED: ${(err as Error).message}\n`);
		process.exit(1);
	}
}

function main(): void {
	// Full-surface usage on no args / --help (the core parser only knows the
	// messaging verbs; the control-plane verbs live here in the bin).
	const top = process.argv[2];
	if (top === undefined || top === "--help" || top === "-h" || top === "help") {
		process.stdout.write(`${USAGE}\n`);
		process.exit(0);
	}
	if (top === "--version" || top === "-v" || top === "version") {
		process.stdout.write(`pij ${pijVersion()}\n`);
		process.exit(0);
	}
	// `spawn` is impure (tmux split + pending write) — intercept before the pure
	// dispatch path. It writes the registry home itself, so it predates the
	// E-NOREG guard below.
	if (process.argv[2] === "spawn") {
		// `pij spawn --agent <slug> …` is an alias for `pij agent spawn <slug> …`
		// (one uniform spawn surface). Detect + forward verbatim; else a colleague spawn.
		const spawnArgs = process.argv.slice(3);
		const aliased = aliasAgentSpawnArgs(spawnArgs);
		if (aliased) {
			void runAgentVerb(aliased);
			return;
		}
		runSpawn(spawnArgs);
		return;
	}
	if (process.argv[2] === "adopt") {
		runAdopt(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "close") {
		runClose(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "compact-self") {
		runCompactSelf(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "daemon") {
		runDaemonVerb(process.argv.slice(3));
		return;
	}
	// `telegram` is a self-contained bridge surface (its own .env + bot process);
	// it never reads the pij registry home, so it predates the E-NOREG guard too.
	if (process.argv[2] === "telegram") {
		runTelegram(process.argv.slice(3));
		return;
	}
	// `agent` (+ `agents` alias → `agent list`) drives the declarative-agent surface.
	// It reads ./agents + ~/.pij/agents + built-ins — no daemon, no registry home —
	// so it predates the E-NOREG guard. Async: it exits the process itself.
	if (top === "agent" || top === "agents") {
		const rest = top === "agents" ? ["list", ...process.argv.slice(3)] : process.argv.slice(3);
		void runAgentVerb(rest);
		return;
	}
	// E-NOREG: registry home absent => the extension never booted here.
	if (!existsSync(pijHome)) {
		process.stderr.write("E-NOREG: no pij registry — is the pij extension loaded?\n");
		process.exit(3);
	}
	const parsed = parseArgs(process.argv.slice(2));
	if (!parsed.ok) {
		// A top-level unknown verb gets the COMPLETE surface (core only lists the
		// messaging verbs); per-verb arity/flag errors keep core's precise message.
		if (parsed.message.startsWith("unknown command")) {
			process.stderr.write(`E-ARG: unknown command '${top}'\n${USAGE}\n`);
			process.exit(64);
		}
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(64);
	}
	// `pij tail` of a bound claude/copilot session streams ITS JSONL transcript,
	// not the pij event log (T022). Try that first; fall through to the event tail
	// if the target isn't a bound control-plane harness.
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
