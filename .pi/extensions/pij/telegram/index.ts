// pij-telegram — bin-verb entry + start/stop lifecycle (Plan Phase 3; AC-08·09).
//
// The `pij telegram <start|init|stop>` surface. `start` runs the bridge as a
// FOREGROUND long-poll (the operator backgrounds it / uses a process manager — it does
// NOT self-daemonize). It: loads the scoped config → takes a single-instance lockfile
// (refuse a live holder, reclaim a dead one) → registers the `pij-telegram` peer
// descriptor (`harness:"pi"` + `lifecycle:"bound"` so the daemon OBSERVES, never drains
// it — AC-08) → builds the inbound bot (`createBot`) → starts the inbox→chat forwarder
// (`startForwarder`) → `bot.start()`. SIGINT/SIGTERM shut down gracefully (stop the bot,
// clear the lock, remove the descriptor); a Telegram 409 logs + clean-exits.
//
// The testable core (`startBridge`) wires everything EXCEPT `bot.start()` and the signal
// handlers, so unit tests exercise the lock/descriptor/forwarder without a real
// long-poll. The pure units it composes — `resolveTarget`/`recencyKey` (match.ts),
// `chunk` (chunk.ts), `loadConfig` (config.ts), `createBot`/`startForwarder` (bridge.ts),
// `/list`+`/tail` (commands.ts), the lockfile (lockfile.ts) — all exist and are tested.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { type FileFlavor, hydrateFiles } from "@grammyjs/files";
import { type Bot, type Context, InputFile } from "grammy";
import { FsChannel, pollPrimaryWatchOpts } from "../adapters/channel.js";
import { FsEventLog } from "../adapters/event-log.js";
import { FsRegistry } from "../adapters/fs-registry.js";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import { createBot, startForwarder, TELEGRAM_PEER_ID } from "./bridge.js";
import { loadConfig, type TelegramConfig } from "./config.js";
import { telegramInit } from "./init.js";
import { acquireLock, isProcessAlive, readLockPid, releaseLock } from "./lockfile.js";

/** Single-instance lockfile name under PIJ_HOME (`~/.pij/pij-telegram.lock`). */
const LOCK_NAME = "pij-telegram.lock";
const GIT_CONTEXT_TIMEOUT_MS = 2000;

export type GitRunner = (cwd: string, args: readonly string[], timeoutMs: number) => string;

/** Resolve stable repo identity from git's common dir so linked worktrees use the
 *  repository name, not the worktree folder name. Any git failure degrades safely. */
export function resolveRepositoryContext(folder: string, git: GitRunner): string | undefined {
	try {
		const commonDir = git(
			folder,
			["rev-parse", "--path-format=absolute", "--git-common-dir"],
			GIT_CONTEXT_TIMEOUT_MS,
		).trim();
		const branch = git(
			folder,
			["symbolic-ref", "--quiet", "--short", "HEAD"],
			GIT_CONTEXT_TIMEOUT_MS,
		).trim();
		if (commonDir === "" || branch === "") return undefined;

		const repoDir = basename(commonDir) === ".git" ? dirname(commonDir) : commonDir;
		const repo = basename(repoDir).replace(/\.git$/, "");
		if (repo === "") return undefined;
		return branch === "main" ? repo : `${repo}/${branch}`;
	} catch {
		return undefined;
	}
}

const TELEGRAM_USAGE = `pij telegram — bridge pij sessions to a Telegram bot

Subcommands:
  pij telegram init    one-time setup: register the bot token + operator allowlist (Phase 4)
  pij telegram start   run the bridge (foreground): relay Telegram ⇄ pij sessions
  pij telegram stop    stop the running bridge (signal it / clear a stale lock)

Send a message TO the operator's Telegram — there is NO "telegram send" subcommand.
It's just a normal channel send to the special peer id "pij-telegram":
  pij send pij-telegram "your message here"
The running bridge forwards it to Telegram; the operator's swipe-replies come back as
injected turns in your session. Keep messages phone-short. (Requires: pij telegram start.)`;

/** PIJ_HOME (default ~/.pij) — same resolution the rest of the extension uses. */
function pijHomeOf(): string {
	return process.env.PIJ_HOME ?? join(homedir(), ".pij");
}

/** Where the scoped `.env` lives. Overridable via PIJ_TELEGRAM_ENV; onboarding that
 *  writes this file lands in Phase 4 (`pij telegram init`). */
function envPathOf(pijHome: string): string {
	return process.env.PIJ_TELEGRAM_ENV ?? join(pijHome, "telegram.env");
}

/**
 * Build the `pij-telegram` registry descriptor (T001). `harness:"pi"` +
 * `lifecycle:"bound"` is the whole contract: the daemon's router OBSERVES a bound `pi`
 * peer (never pane-injects or inbox-drains it — AC-08), so the bridge safely drains its
 * own inbox via `startForwarder`. NO daemon/core change is needed — this descriptor IS
 * the routing decision (Plan Finding 01).
 */
export function buildTelegramDescriptor(
	pijHome: string,
	cwd: string,
	pid: number,
	startedAt: string,
): SessionDescriptor {
	const dataDir = join(pijHome, TELEGRAM_PEER_ID);
	return {
		id: TELEGRAM_PEER_ID,
		folder: cwd,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
		pid,
		startedAt,
		harness: "pi",
		lifecycle: "bound",
		// Deliberate-silence class (Plan 056): this bridge forwards its inbox to
		// the operator's phone, so the watchdog must never nudge it. Born exempt.
		relay: true,
	};
}

/** Runtime collaborators, injected so `startBridge` is testable without a long-poll. */
export interface BridgeRuntime {
	readonly pijHome: string;
	readonly cwd: string;
	readonly pid: number;
	readonly startedAt: string;
	/** Liveness probe for the single-instance lock decision. */
	readonly isAlive: (pid: number) => boolean;
	readonly registry: FsRegistry;
	readonly channel: FsChannel;
	/** Read the last `n` events of a session, for `/tail`. */
	readonly readEvents: (id: SessionId, last: number) => readonly PijEvent[];
	readonly git: GitRunner;
	readonly log: (message: string) => void;
}

export type StartResult =
	/** A live bridge already holds the lock — refuse the second instance. */
	| { readonly kind: "refused"; readonly holderPid: number }
	/** Wired and ready; the caller drives `bot.start()` and calls `stop()` on exit. */
	| { readonly kind: "started"; readonly bot: Bot; readonly stop: () => void };

/**
 * Wire the full bridge runtime WITHOUT starting the long-poll (so tests never touch the
 * network): take the single-instance lock, register the descriptor, build the inbound
 * bot, and start the inbox→chat forwarder. Returns the un-started bot plus a `stop()`
 * that disposes the watcher, removes the descriptor, and releases the lock — the exact
 * teardown a SIGINT/SIGTERM (or a 409) must run.
 *
 * @param config the loaded bridge config (token + allowlist + chat id)
 * @param rt     injected runtime collaborators (home, registry, channel, probes, log)
 */
export function startBridge(config: TelegramConfig, rt: BridgeRuntime): StartResult {
	const lockPath = join(rt.pijHome, LOCK_NAME);
	const lock = acquireLock(lockPath, {
		pid: rt.pid,
		startedAt: rt.startedAt,
		isAlive: rt.isAlive,
		log: rt.log,
	});
	if (lock.kind === "refused") return { kind: "refused", holderPid: lock.holderPid };

	rt.registry.write(buildTelegramDescriptor(rt.pijHome, rt.cwd, rt.pid, rt.startedAt));

	// Reply threading: inbound delivery records the operator's Telegram message id per
	// target session; the forwarder takes it (once) so that session's next outbound
	// bubble quotes the message it answers. One shared map is the whole seam.
	const pendingReply = new Map<SessionId, number>();
	// Successful outbound speech is per configured chat and process-local. Keep it
	// separate from createBot's selected `/tail` target so addressing a silent session
	// cannot steal the bare-message fallback.
	const lastSpeaker = new Map<string, SessionId>();

	const bot = createBot(config, {
		listSessions: () => rt.registry.list(),
		isAlive: rt.isAlive,
		now: () => Date.now(),
		deliver: (message) => {
			rt.channel.deliver(message);
		},
		onDelivered: (to, telegramMessageId) => {
			pendingReply.set(to, telegramMessageId);
		},
		getLastSpeaker: (chatId) => lastSpeaker.get(chatId),
		readEvents: rt.readEvents,
		// Inbound media (Phase 5): download via @grammyjs/files into the target session's own
		// attachments dir. The downloader owns the fs (mkdir + write) so createBot stays I/O-free
		// and unit-testable with a fake; `hydrateFiles` (installed below) equips `getFile`.
		downloadMedia: async (ctx, dest) => {
			mkdirSync(dirname(dest), { recursive: true });
			const file = await (ctx as FileFlavor<Context>).getFile();
			await file.download(dest);
		},
		log: rt.log,
	});
	// Equip `ctx.getFile()` with `.download()` (the files plugin is an api transformer).
	bot.api.config.use(hydrateFiles(config.token));

	// Outbound: forward our OWN inbox → operator chat (chunked). Seed `seen` with the
	// inbox's current contents so a (re)start forwards only NEW replies, not history.
	let disposeForwarder: (() => void) | undefined;
	const chatId = config.chatId;
	if (chatId !== undefined) {
		// A defined replyTo threads the bubble under the operator's message; sending
		// must survive that message having been deleted (allow_sending_without_reply).
		const replyOpts = (replyTo?: number) =>
			replyTo === undefined
				? {}
				: { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } };
		disposeForwarder = startForwarder(rt.channel, {
			seen: seenInbox(rt.pijHome),
			log: rt.log,
			takeReplyTo: (from) => {
				const mid = pendingReply.get(from);
				pendingReply.delete(from);
				return mid;
			},
			onSpoke: (from) => {
				lastSpeaker.set(String(chatId), from);
			},
			senderContext: (from) => {
				const sender = rt.registry.read(from);
				return sender === null ? undefined : resolveRepositoryContext(sender.folder, rt.git);
			},
			send: (text, replyTo) => bot.api.sendMessage(chatId, text, replyOpts(replyTo)),
			// Outbound media (Phase 5): upload each attached file by kind via grammY InputFile.
			sendMedia: (kind, path, caption, replyTo) => {
				const input = new InputFile(path);
				const opts = {
					...(caption !== undefined ? { caption } : {}),
					...replyOpts(replyTo),
				};
				switch (kind) {
					case "photo":
						return bot.api.sendPhoto(chatId, input, opts);
					case "animation":
						return bot.api.sendAnimation(chatId, input, opts);
					case "document":
						return bot.api.sendDocument(chatId, input, opts);
				}
			},
		});
	} else {
		rt.log("no TELEGRAM_CHAT_ID — outbound relay disabled (inbound relay still works)");
	}

	const stop = (): void => {
		disposeForwarder?.();
		rt.registry.remove(TELEGRAM_PEER_ID);
		releaseLock(lockPath, rt.pid);
	};
	return { kind: "started", bot, stop };
}

/** Current `msg-*.json` names in the bridge inbox — the boot watermark for the
 *  forwarder so a restart never replays already-delivered replies. */
function seenInbox(pijHome: string): Set<string> {
	try {
		return new Set(
			readdirSync(join(pijHome, TELEGRAM_PEER_ID, "inbox")).filter(
				(n) => n.startsWith("msg-") && n.endsWith(".json"),
			),
		);
	} catch {
		return new Set(); // inbox not created yet
	}
}

/** Production runtime collaborators over the real PIJ_HOME. */
function runtimeFor(pijHome: string, log: (message: string) => void): BridgeRuntime {
	return {
		pijHome,
		cwd: process.cwd(),
		pid: process.pid,
		startedAt: new Date().toISOString(),
		isAlive: isProcessAlive,
		registry: new FsRegistry(pijHome),
		// Poll-primary: the telegram bridge's inbox watcher (bridge.ts) drops
		// fs.watch and drains via the 500ms poll — same silent-drop immunity as
		// the pi self-inbox (plan 057 thread-1).
		channel: new FsChannel(pijHome, pollPrimaryWatchOpts()),
		readEvents: (id, last) => new FsEventLog(pijHome, id).read({ last }),
		git: (cwd, args, timeoutMs) =>
			execFileSync("git", ["-C", cwd, ...args], {
				encoding: "utf8",
				timeout: timeoutMs,
				stdio: ["ignore", "pipe", "ignore"],
			}),
		log,
	};
}

// ── daemon auto-start (in-process) ────────────────────────────────────────────
//
// Lets the daemon run the bridge in its OWN process when a scoped `telegram.env` is
// present, so the operator never runs a separate `pij telegram start`. The bridge is
// still a `harness:"pi"` peer the daemon's router OBSERVES (never drains), so co-locating
// it in the daemon process changes nothing about routing — only WHO owns the long-poll.

/** I/O `maybeStartBridge` needs, injected so the start/refuse/fail decision is unit-pinnable
 *  without a real `.env`, registry, or Telegram long-poll. */
export interface DaemonBridgeDeps {
	/** Scoped `.env` to load (absent/invalid → skip, daemon runs unchanged). */
	readonly envPath: string;
	/** Load + validate the bridge config; throws when the env is missing/half-configured. */
	readonly loadConfig: (envPath: string) => TelegramConfig;
	/** Build the production bridge runtime (registry/channel/probes over PIJ_HOME). */
	readonly buildRuntime: () => BridgeRuntime;
	/** Wire the bridge WITHOUT the long-poll (lock + descriptor + forwarder). */
	readonly startBridge: (config: TelegramConfig, rt: BridgeRuntime) => StartResult;
	/** Drive the long-poll (`bot.start()`); rejects on a Telegram error (incl. 409). */
	readonly runBot: (bot: Bot) => Promise<void>;
	readonly log: (message: string) => void;
}

/**
 * Daemon auto-start hook (in-process). If the scoped `telegram.env` loads, wire + start the
 * bridge inside the daemon process and return its teardown; otherwise return a no-op so the
 * daemon runs exactly as before. Two safety invariants make co-locating the bridge safe:
 *   1. A bridge already holding the single-instance lock (e.g. a manual `pij telegram start`)
 *      is left alone — `startBridge` returns `refused` and we no-op (never two long-polls).
 *   2. A long-poll failure (Telegram 409 / fatal) tears down ONLY the bridge and is logged —
 *      it must NEVER crash the daemon, so we deliberately do NOT reuse `handleStartError`
 *      (which calls `process.exit`); the `.catch` runs the bridge `stop()` and nothing more.
 * Returns the bridge teardown so the daemon can fold it into its own stop disposer.
 */
export function maybeStartBridge(deps: DaemonBridgeDeps): () => void {
	let config: TelegramConfig;
	try {
		config = deps.loadConfig(deps.envPath);
	} catch {
		deps.log("telegram: no usable telegram.env — bridge auto-start skipped");
		return () => {};
	}
	const started = deps.startBridge(config, deps.buildRuntime());
	if (started.kind === "refused") {
		deps.log(`telegram: a bridge already runs (pid ${started.holderPid}) — not auto-starting`);
		return () => {};
	}
	const { bot, stop } = started;
	// Fire-and-forget the long-poll. On ANY failure tear down ONLY the bridge; the daemon
	// keeps ticking (no process.exit here — that is the standalone command's job).
	void deps.runBot(bot).catch((e) => {
		stop();
		deps.log(`telegram: bridge stopped — ${(e as Error)?.message ?? String(e)}`);
	});
	return stop;
}

/**
 * Production wiring of `maybeStartBridge` over the real PIJ_HOME — the single call the daemon
 * makes. Returns a no-op teardown when no `telegram.env` is configured (the common case for a
 * daemon with no bridge), else the live bridge teardown.
 */
export function autoStartBridgeForDaemon(
	pijHome: string,
	log: (message: string) => void,
): () => void {
	return maybeStartBridge({
		envPath: envPathOf(pijHome),
		loadConfig,
		buildRuntime: () => runtimeFor(pijHome, log),
		startBridge,
		runBot: (bot) =>
			bot.start({ onStart: (info) => log(`telegram: bridge up as @${info.username}`) }),
		log,
	});
}

/** A Telegram 409 (Conflict) — another getUpdates consumer is live — surfaces as a
 *  GrammyError carrying `error_code: 409`. Match the code (or a literal 409 in the
 *  message) so a duplicate bridge exits cleanly instead of crash-looping. */
function is409(e: unknown): boolean {
	const code = (e as { error_code?: number } | null)?.error_code;
	return code === 409 || /\b409\b/.test((e as Error | null)?.message ?? "");
}

/** Outcome of the `bot.start()` error decision (AC-09). Returned (not just enacted) so the
 *  branch is unit-pinnable without a real long-poll. */
export type StartErrorOutcome =
	/** A Telegram 409 (duplicate getUpdates consumer raced us) — expected; clean-exit(0). */
	| { readonly kind: "clean-exit" }
	/** A real failure — cleaned up, then surfaced (non-zero exit). */
	| { readonly kind: "fatal"; readonly message: string };

/** I/O the start error handler needs, injected so the 409 branch is testable. */
export interface StartErrorDeps {
	/** Bridge teardown (release lock + remove descriptor) — ALWAYS runs first. */
	readonly stop: () => void;
	readonly log: (message: string) => void;
	/** Surface a fatal error (→ stderr in production). */
	readonly fail: (message: string) => void;
	readonly exit: (code: number) => void;
}

/**
 * Route a `bot.start()` failure (AC-09). ALWAYS tears the bridge down first, THEN decides:
 * a Telegram 409 (another getUpdates consumer raced us) is expected → log + exit 0 so a
 * duplicate bridge stops cleanly instead of crash-looping; any other error is real →
 * surface it + exit 1 (never swallowed by the 409 path). The outcome is returned as well
 * as enacted so the decision can be pinned in a unit test (the injected `exit` is a no-op,
 * so the explicit `return` after a clean-exit is what keeps it out of the fatal branch).
 */
export function handleStartError(e: unknown, deps: StartErrorDeps): StartErrorOutcome {
	deps.stop();
	if (is409(e)) {
		deps.log("Telegram 409 Conflict — another getUpdates consumer is live; exiting cleanly.");
		deps.exit(0);
		return { kind: "clean-exit" };
	}
	const message = (e as Error | null)?.message ?? String(e);
	deps.fail(`pij telegram start — fatal: ${message}\n`);
	deps.exit(1);
	return { kind: "fatal", message };
}

/** `pij telegram start` — foreground long-poll. Async; `runTelegram` fire-and-forgets
 *  it (the pending `bot.start()` keeps the process alive). */
async function telegramStart(_argv: readonly string[]): Promise<void> {
	const log = (message: string): void => {
		process.stdout.write(`[pij-telegram] ${message}\n`);
	};
	const pijHome = pijHomeOf();

	let config: TelegramConfig;
	try {
		config = loadConfig(envPathOf(pijHome));
	} catch (e) {
		process.stderr.write(
			`pij telegram start — config error: ${(e as Error).message}\n` +
				`  set up ${envPathOf(pijHome)} (TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_IDS, TELEGRAM_CHAT_ID)\n` +
				"  or point PIJ_TELEGRAM_ENV at your .env (guided onboarding lands in Phase 4).\n",
		);
		process.exitCode = 64;
		return;
	}

	const started = startBridge(config, runtimeFor(pijHome, log));
	if (started.kind === "refused") {
		process.stderr.write(
			`pij telegram start — a bridge is already running (pid ${started.holderPid}); ` +
				"run 'pij telegram stop' first.\n",
		);
		process.exitCode = 1;
		return;
	}
	const { bot, stop } = started;

	// Graceful shutdown: stop the bot, then release the lock + remove the descriptor.
	let shuttingDown = false;
	const shutdown = async (signal: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		log(`${signal} — shutting down`);
		try {
			await bot.stop();
		} catch {
			// not fully started yet / already stopping — fall through to teardown
		}
		stop();
		process.exit(0);
	};
	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));

	try {
		await bot.start({
			onStart: (info) =>
				log(`up as @${info.username} — relaying to chat ${config.chatId ?? "(unset)"}`),
		});
	} catch (e) {
		handleStartError(e, {
			stop,
			log,
			fail: (message) => process.stderr.write(message),
			exit: (code) => process.exit(code),
		});
	}
}

export type StopResult =
	| { readonly kind: "signalled"; readonly pid: number }
	| { readonly kind: "cleared-stale"; readonly pid: number }
	| { readonly kind: "not-running" };

/** I/O `stopBridge` needs, injected so the decision is testable without real signals. */
export interface StopDeps {
	readonly isAlive: (pid: number) => boolean;
	readonly kill: (pid: number, signal: NodeJS.Signals) => void;
	readonly log: (message: string) => void;
}

/**
 * Stop a running bridge from its lockfile (T005): read the holder pid — alive → signal
 * it (SIGTERM, which the running instance turns into a graceful shutdown); dead → clear
 * the stale lock; no lock → nothing to do. Pure decision over injected probes/signals.
 *
 * @param lockPath the bridge lockfile path
 * @param deps     injected liveness probe + signal sender + logger
 */
export function stopBridge(lockPath: string, deps: StopDeps): StopResult {
	const pid = readLockPid(lockPath);
	if (pid === null) {
		deps.log("pij telegram stop — no bridge running (no lockfile).");
		return { kind: "not-running" };
	}
	if (deps.isAlive(pid)) {
		deps.kill(pid, "SIGTERM");
		deps.log(`pij telegram stop — signalled the bridge (pid ${pid}) to shut down.`);
		return { kind: "signalled", pid };
	}
	rmSync(lockPath, { force: true });
	deps.log(`pij telegram stop — cleared a stale lock (dead pid ${pid}).`);
	return { kind: "cleared-stale", pid };
}

function telegramStop(_argv: readonly string[]): void {
	const lockPath = join(pijHomeOf(), LOCK_NAME);
	stopBridge(lockPath, {
		isAlive: isProcessAlive,
		kill: (pid, signal) => process.kill(pid, signal),
		log: (message) => process.stdout.write(`${message}\n`),
	});
}

/**
 * Dispatch `pij telegram <sub> [...]`. No subcommand prints usage (exit 0); an unknown
 * subcommand prints usage to stderr and sets a non-zero exit code. `start` is async and
 * fire-and-forgotten — its pending long-poll keeps the process alive.
 */
export function runTelegram(argv: readonly string[]): void {
	const [sub, ...rest] = argv;
	switch (sub) {
		case "init":
			void telegramInit(envPathOf(pijHomeOf()));
			return;
		case "start":
			void telegramStart(rest);
			return;
		case "stop":
			telegramStop(rest);
			return;
		case undefined:
		case "--help":
		case "-h":
			process.stdout.write(`${TELEGRAM_USAGE}\n`);
			return;
		default:
			process.stderr.write(`E-ARG: unknown telegram subcommand '${sub}'\n${TELEGRAM_USAGE}\n`);
			process.exitCode = 64;
	}
}
