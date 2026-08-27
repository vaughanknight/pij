// pij-telegram — start/stop lifecycle tests (Plan Phase 3; AC-08·09).
//
// `startBridge` wires the lock + descriptor + forwarder WITHOUT `bot.start()`, so these
// run with NO real long-poll and NO daemon: a tmp PIJ_HOME, an injected liveness probe,
// and the real fs adapters. They assert the AC-08 descriptor contract (`harness:"pi"` +
// `lifecycle:"bound"` → the daemon skips it), single-instance refuse/reclaim, clean
// teardown, and the `stop` decision (AC-09).

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Bot, InputFile, type Update } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bridge tests drive a real FsChannel poller. The shared-workstation tail now
// exceeds 20s under full-suite load; retain a bounded 60s contract timeout
// until fake timers remove the filesystem scheduling dependency (DL-002).
vi.setConfig({ testTimeout: 60_000 });

import { FsChannel } from "../adapters/channel.js";
import { FsRegistry } from "../adapters/fs-registry.js";
import { SqliteQueue } from "../adapters/sqlite-queue.js";
import type { PijEvent, SessionId } from "../core/types.js";
import { TELEGRAM_PEER_ID } from "./bridge.js";
import type { TelegramConfig } from "./config.js";
import {
	type BridgeRuntime,
	buildTelegramDescriptor,
	type DaemonBridgeDeps,
	handleStartError,
	maybeStartBridge,
	runtimeFor,
	type StartErrorDeps,
	startBridge,
	stopBridge,
} from "./index.js";
import { readLockPid } from "./lockfile.js";

let home: string;
const LOCK = "pij-telegram.lock";
// No chatId → the outbound forwarder is disabled, so no fs watcher lingers between
// tests (the lock + descriptor lifecycle is what these assert).
const config: TelegramConfig = { token: "test-token", allowedUserIds: [777] };
let updateSeq = 1000;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-tg-index-"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function runtime(over: Partial<BridgeRuntime> = {}): BridgeRuntime {
	return {
		pijHome: home,
		cwd: "/work/here",
		pid: 4242,
		startedAt: "2026-06-29T12:00:00.000Z",
		isAlive: () => false,
		registry: new FsRegistry(home),
		channel: new FsChannel(home, { pollMs: 50 }),
		readEvents: (_id: SessionId, _n: number): readonly PijEvent[] => [],
		git: () => {
			throw new Error("not a git worktree");
		},
		log: () => {},
		...over,
	};
}

function session(id: SessionId, folder = `/work/${id}`) {
	return {
		id,
		folder,
		dataDir: join(home, id),
		eventsPath: join(home, id, "events.ndjson"),
		pid: 5150,
		startedAt: "2026-07-12T00:00:00.000Z",
	};
}

function initOfflineBot(bot: Bot): void {
	bot.botInfo = {
		id: 1,
		is_bot: true,
		first_name: "pij",
		username: "pijbot",
		can_join_groups: true,
		can_read_all_group_messages: false,
		supports_inline_queries: false,
	} as unknown as Bot["botInfo"];
}

function textUpdate(chatId: number, text: string): Update {
	updateSeq += 1;
	return {
		update_id: updateSeq,
		message: {
			message_id: updateSeq,
			date: 0,
			chat: { id: chatId, type: "private", first_name: "Op" },
			from: { id: 777, is_bot: false, first_name: "Op" },
			text,
		},
	} as Update;
}

async function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = Date.now();
	while (!pred()) {
		if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition never held");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

async function settleWhile(pred: () => boolean, timeoutMs = 200): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		expect(pred()).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	expect(pred()).toBe(true);
}

describe("buildTelegramDescriptor (T001 / AC-08)", () => {
	it("stamps harness:pi + lifecycle:bound and the fixed id/paths", () => {
		const d = buildTelegramDescriptor("/home/.pij", "/work/here", 4242, "2026-06-29T12:00:00.000Z");
		expect(d.id).toBe("pij-telegram");
		expect(d.harness).toBe("pi"); // ← router observes (skips) this peer
		expect(d.lifecycle).toBe("bound"); // ← already bound; daemon never drives it
		expect(d.relay).toBe(true); // ← Plan 056: born exempt; the watchdog never nudges a relay
		expect(d.pid).toBe(4242);
		expect(d.folder).toBe("/work/here");
		expect(d.dataDir).toBe("/home/.pij/pij-telegram");
		expect(d.eventsPath).toBe("/home/.pij/pij-telegram/events.ndjson");
	});
});

describe("runtimeFor queue backend", () => {
	it("opens the sqlite queue by default", () => {
		const previous = process.env.PIJ_QUEUE_BACKEND;
		delete process.env.PIJ_QUEUE_BACKEND;
		try {
			const rt = runtimeFor(home, () => {});
			expect(rt.channel).toBeInstanceOf(SqliteQueue);
			if (rt.channel instanceof SqliteQueue) rt.channel.close();
		} finally {
			if (previous === undefined) delete process.env.PIJ_QUEUE_BACKEND;
			else process.env.PIJ_QUEUE_BACKEND = previous;
		}
	});

	it("honours PIJ_QUEUE_BACKEND=fs as the legacy opt-out", () => {
		const previous = process.env.PIJ_QUEUE_BACKEND;
		process.env.PIJ_QUEUE_BACKEND = "fs";
		try {
			expect(runtimeFor(home, () => {}).channel).toBeInstanceOf(FsChannel);
		} finally {
			if (previous === undefined) delete process.env.PIJ_QUEUE_BACKEND;
			else process.env.PIJ_QUEUE_BACKEND = previous;
		}
	});
});

describe("startBridge (lock + descriptor lifecycle)", () => {
	it("registers the descriptor + lock, then stop() clears both", () => {
		const res = startBridge(config, runtime());
		expect(res.kind).toBe("started");

		const reg = new FsRegistry(home);
		const d = reg.read(TELEGRAM_PEER_ID);
		expect(d?.harness).toBe("pi");
		expect(d?.lifecycle).toBe("bound");
		expect(d?.pid).toBe(4242);
		expect(existsSync(join(home, LOCK))).toBe(true);

		if (res.kind === "started") res.stop();
		expect(reg.read(TELEGRAM_PEER_ID)).toBeNull(); // descriptor removed
		expect(existsSync(join(home, LOCK))).toBe(false); // lock released
	});

	it("refuses a second start while a live instance holds the lock (AC-09)", () => {
		const first = startBridge(config, runtime({ pid: 100, isAlive: () => true }));
		expect(first.kind).toBe("started");

		const second = startBridge(config, runtime({ pid: 200, isAlive: (p) => p === 100 }));
		expect(second).toEqual({ kind: "refused", holderPid: 100 });
	});

	it("reclaims a stale lock whose holder is dead, then starts (AC-09)", () => {
		writeFileSync(join(home, LOCK), JSON.stringify({ pid: 999999, startedAt: "old" }));
		const res = startBridge(config, runtime({ pid: 4242, isAlive: (p) => p !== 999999 }));
		expect(res.kind).toBe("started");
		expect(readLockPid(join(home, LOCK))).toBe(4242); // reclaimed + rewritten to us
		if (res.kind === "started") res.stop();
	});
});

describe("stopBridge (T005 / AC-09)", () => {
	it("signals a live bridge with SIGTERM and leaves the lock (it self-clears)", () => {
		const lock = join(home, LOCK);
		writeFileSync(lock, JSON.stringify({ pid: 4242, startedAt: "x" }));
		const killed: Array<[number, string]> = [];
		const res = stopBridge(lock, {
			isAlive: () => true,
			kill: (p, s) => killed.push([p, s]),
			log: () => {},
		});
		expect(res).toEqual({ kind: "signalled", pid: 4242 });
		expect(killed).toEqual([[4242, "SIGTERM"]]);
		expect(existsSync(lock)).toBe(true); // the running instance clears its own lock
	});

	it("clears a stale lock when the holder is dead (no signal sent)", () => {
		const lock = join(home, LOCK);
		writeFileSync(lock, JSON.stringify({ pid: 4242, startedAt: "x" }));
		const res = stopBridge(lock, {
			isAlive: () => false,
			kill: () => {
				throw new Error("must not signal a dead pid");
			},
			log: () => {},
		});
		expect(res).toEqual({ kind: "cleared-stale", pid: 4242 });
		expect(existsSync(lock)).toBe(false);
	});

	it("reports not-running when there is no lockfile", () => {
		const res = stopBridge(join(home, "absent.lock"), {
			isAlive: () => true,
			kill: () => {},
			log: () => {},
		});
		expect(res).toEqual({ kind: "not-running" });
	});
});

describe("startBridge forwarder wiring (AC-05 end-to-end)", () => {
	it("keeps the fs opt-out forwarding a long inbox reply, chunked, via the bot api", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		const channel = new FsChannel(home, { pollMs: 25 });
		const res = startBridge(withChat, runtime({ channel }));
		expect(res.kind).toBe("started");
		if (res.kind !== "started") return;

		// Capture the bot's outbound api calls offline (no network), like the P2 tests.
		const sent: Array<{ method: string; text: string }> = [];
		res.bot.api.config.use((_prev, method, payload) => {
			sent.push({ method, text: String((payload as { text?: string }).text ?? "") });
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});

		const body = "y".repeat(9000);
		channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body });

		const start = Date.now();
		while (sent.filter((s) => s.method === "sendMessage").length < 3) {
			if (Date.now() - start > 2000) throw new Error("forward timed out");
			await new Promise((r) => setTimeout(r, 10));
		}
		res.stop();

		const parts = sent.filter((s) => s.method === "sendMessage").map((s) => s.text);
		// strip the `[sender-id] ` tag then the `(i/n) ` chunk prefix to reassemble.
		const reassembled = parts
			.map((p) => p.replace(/^\[[^\]]+\] /, "").replace(/^\(\d+\/\d+\) /, ""))
			.join("");
		expect(reassembled).toBe(body);
	});

	it("forwards and acks a sqlite-default queued reply via the bot api", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		const channel = new SqliteQueue(home);
		const res = startBridge(withChat, runtime({ channel }));
		expect(res.kind).toBe("started");
		if (res.kind !== "started") {
			channel.close();
			return;
		}

		const sent: string[] = [];
		res.bot.api.config.use((_prev, method, payload) => {
			if (method === "sendMessage") sent.push(String((payload as { text?: string }).text ?? ""));
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		channel.deliver({
			from: "pij-osn81b",
			to: TELEGRAM_PEER_ID,
			body: "sqlite through startBridge",
		});

		await waitFor(() => channel.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");
		res.stop();

		expect(sent).toEqual(["[pij-osn81b] sqlite through startBridge"]);
		channel.close();
	});

	// FLAKY (quarantined 2026-07-21, Jordan ruling): passes in isolation, fails under full-suite parallel-load contention. Re-enable when the suite is de-contended.
	it.skip("derives stable main/non-main repository prefixes from sender folders with bounded fake git", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		const channel = new FsChannel(home, { pollMs: 25 });
		const mainFolder = "/repos/pij-worktrees/main";
		const branchFolder = "/repos/pij-worktrees/feature";
		const git = vi.fn((cwd: string, args: readonly string[], _timeoutMs: number) => {
			if (args.includes("--git-common-dir")) return "/repos/pij/.git\n";
			if (args[0] === "symbolic-ref") {
				return cwd === mainFolder ? "main\n" : "feature/repo-context\n";
			}
			throw new Error(`unexpected git args: ${args.join(" ")}`);
		});
		const rt = runtime({ channel, git });
		rt.registry.write(session("pij-agent-a", mainFolder));
		rt.registry.write(session("pij-agent-b", branchFolder));
		const res = startBridge(withChat, rt);
		expect(res.kind).toBe("started");
		if (res.kind !== "started") return;

		const texts: string[] = [];
		res.bot.api.config.use((_prev, method, payload) => {
			if (method === "sendMessage") texts.push(String((payload as { text?: string }).text ?? ""));
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		channel.deliver({ from: "pij-agent-a", to: TELEGRAM_PEER_ID, body: "main bubble" });
		channel.deliver({ from: "pij-agent-b", to: TELEGRAM_PEER_ID, body: "branch bubble" });
		await waitFor(() => texts.length === 2);
		res.stop();

		expect(texts).toEqual([
			"[pij-agent-a] [pij] main bubble",
			"[pij-agent-b] [pij/feature/repo-context] branch bubble",
		]);
		expect(git).toHaveBeenCalledTimes(4);
		for (const [cwd, _args, timeoutMs] of git.mock.calls) {
			expect([mainFolder, branchFolder]).toContain(cwd);
			expect(timeoutMs).toBe(2000);
		}
	});

	it("degrades to the sender tag for missing descriptors and non-git folders", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		const channel = new FsChannel(home, { pollMs: 25 });
		const git = vi.fn(() => {
			throw new Error("not a git worktree");
		});
		const rt = runtime({ channel, git });
		rt.registry.write(session("pij-agent-a", "/tmp/not-git"));
		const res = startBridge(withChat, rt);
		expect(res.kind).toBe("started");
		if (res.kind !== "started") return;

		const texts: string[] = [];
		res.bot.api.config.use((_prev, method, payload) => {
			if (method === "sendMessage") texts.push(String((payload as { text?: string }).text ?? ""));
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		channel.deliver({ from: "pij-agent-a", to: TELEGRAM_PEER_ID, body: "non-git" });
		channel.deliver({ from: "pij-missing", to: TELEGRAM_PEER_ID, body: "missing descriptor" });
		await waitFor(() => texts.length === 2);
		res.stop();

		expect(texts).toEqual(["[pij-agent-a] non-git", "[pij-missing] missing descriptor"]);
		expect(git).toHaveBeenCalledTimes(1);
	});

	it("shares successful outbound speech with numeric inbound chat ids and isolates other chats", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		const channel = new FsChannel(home, { pollMs: 25 });
		const rt = runtime({ channel, isAlive: () => true });
		rt.registry.write(session("pij-agent-a"));
		rt.registry.write(session("pij-agent-b"));
		const res = startBridge(withChat, rt);
		expect(res.kind).toBe("started");
		if (res.kind !== "started") return;
		initOfflineBot(res.bot);

		const sentTexts: string[] = [];
		res.bot.api.config.use((_prev, method, payload) => {
			if (method === "sendMessage") {
				sentTexts.push(String((payload as { text?: string }).text ?? ""));
			}
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		const receivedA: string[] = [];
		const receivedB: string[] = [];
		const disposeA = channel.watch("pij-agent-a", (message) => {
			receivedA.push(message.body);
		});
		const disposeB = channel.watch("pij-agent-b", (message) => {
			receivedB.push(message.body);
		});

		channel.deliver({
			from: "pij-agent-a",
			to: TELEGRAM_PEER_ID,
			body: "I spoke successfully",
		});
		await waitFor(() => sentTexts.some((text) => text.includes("[pij-agent-a]")));

		await res.bot.handleUpdate(textUpdate(555000, "bare follows A"));
		await waitFor(() => receivedA.length === 1);
		expect(receivedA[0]).toContain("bare follows A");
		expect(receivedB).toEqual([]);

		channel.deliver({
			from: "pij-agent-b",
			to: TELEGRAM_PEER_ID,
			body: "B spoke successfully",
		});
		await waitFor(() => sentTexts.some((text) => text.includes("[pij-agent-b]")));

		await res.bot.handleUpdate(textUpdate(555000, "bare follows B"));
		await waitFor(() => receivedB.length === 1);
		expect(receivedB[0]).toContain("bare follows B");
		expect(receivedA).toHaveLength(1);
		await settleWhile(() => receivedA.length === 1 && receivedB.length === 1);
		expect(receivedA).toHaveLength(1);
		expect(receivedB).toHaveLength(1);

		await res.bot.handleUpdate(textUpdate(555001, "other chat has no speaker"));
		await waitFor(() => sentTexts.some((text) => text.includes("/list")));
		expect(receivedA).toHaveLength(1);
		expect(receivedB).toHaveLength(1);

		disposeA();
		disposeB();
		res.stop();
	});

	it("forgets last-speaker state across a bridge restart", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		const channel = new FsChannel(home, { pollMs: 25 });
		const firstRuntime = runtime({ channel, isAlive: () => true });
		firstRuntime.registry.write(session("pij-agent-a"));
		const first = startBridge(withChat, firstRuntime);
		expect(first.kind).toBe("started");
		if (first.kind !== "started") return;
		const firstCalls: string[] = [];
		first.bot.api.config.use((_prev, method) => {
			firstCalls.push(method);
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		channel.deliver({ from: "pij-agent-a", to: TELEGRAM_PEER_ID, body: "before restart" });
		await waitFor(() => firstCalls.includes("sendMessage"));
		first.stop();

		const second = startBridge(
			withChat,
			runtime({ channel, pid: 4243, startedAt: "2026-07-12T00:01:00.000Z", isAlive: () => true }),
		);
		expect(second.kind).toBe("started");
		if (second.kind !== "started") return;
		initOfflineBot(second.bot);
		const replies: string[] = [];
		second.bot.api.config.use((_prev, method, payload) => {
			if (method === "sendMessage") replies.push(String((payload as { text?: string }).text ?? ""));
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});

		await second.bot.handleUpdate(textUpdate(555000, "bare after restart"));
		expect(replies.at(-1)).toMatch(/\/list/);
		second.stop();
	});
});

// ── outbound media wiring (AC-11 — the PRODUCTION kind→method mapping) ─────────
//
// The real `MediaKind → grammY method` mapping lives in `startBridge`'s `sendMedia`
// (index.ts): photo→sendPhoto, animation→sendAnimation, document→sendDocument. The
// bridge.test.ts outbound tests inject a FAKE sendMedia into startForwarder, so they
// exercise a test-local copy of that mapping — not the production one. This test drives
// the REAL startBridge forwarder end-to-end and asserts the method NAME the production
// mapping chooses, so a sendPhoto→sendDocument regression in index.ts flips it RED.
describe("startBridge forwarder media wiring (AC-11 — production kind→method mapping)", () => {
	it("maps png→sendPhoto, gif→sendAnimation, pdf→sendDocument via the real sendMedia, captions carried", async () => {
		const withChat: TelegramConfig = { ...config, chatId: "555000" };
		// The forwarder's default `sizeOf` is `statSync(path).size`, so the attachment paths
		// must be real files on disk (tiny → under every per-kind upload cap).
		for (const name of ["chart.png", "loop.gif", "report.pdf"]) {
			writeFileSync(join(home, name), "x");
		}
		const channel = new FsChannel(home, { pollMs: 25 });
		const res = startBridge(withChat, runtime({ channel }));
		expect(res.kind).toBe("started");
		if (res.kind !== "started") return;

		// Capture the bot's outbound api calls offline (no network). Because this is the bot
		// `startBridge` built, the calls flow through index.ts's REAL sendMedia mapping.
		const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
		res.bot.api.config.use((_prev, method, payload) => {
			calls.push({ method, payload: payload as Record<string, unknown> });
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});

		// One attachment-only message carrying all three kinds, in order, each captioned.
		channel.deliver({
			from: "pij-osn81b",
			to: TELEGRAM_PEER_ID,
			body: "",
			attachments: [
				{ path: join(home, "chart.png"), caption: "a photo" },
				{ path: join(home, "loop.gif"), caption: "a gif" },
				{ path: join(home, "report.pdf"), caption: "a doc" },
			],
		});

		const start = Date.now();
		while (calls.length < 3) {
			if (Date.now() - start > 2000) throw new Error("media forward timed out");
			await new Promise((r) => setTimeout(r, 10));
		}
		res.stop();

		// The mutation target: index.ts photo branch `sendPhoto`. Asserting the method NAME
		// (not a payload field) is what makes sendPhoto→sendDocument flip this RED.
		expect(calls.map((c) => c.method)).toEqual(["sendPhoto", "sendAnimation", "sendDocument"]);
		expect(calls[0]?.payload.caption).toBe("[pij-osn81b] a photo");
		expect(calls[1]?.payload.caption).toBe("[pij-osn81b] a gif");
		expect(calls[2]?.payload.caption).toBe("[pij-osn81b] a doc");
		expect(calls[0]?.payload.photo).toBeInstanceOf(InputFile);
		expect(calls[1]?.payload.animation).toBeInstanceOf(InputFile);
		expect(calls[2]?.payload.document).toBeInstanceOf(InputFile);
	});
});

// ── start error handling (AC-09 — the 409 clean-exit branch) ──────────────────
//
// `bot.start()` is a real long-poll, so these pin the EXTRACTED decision
// (`handleStartError`) instead: a 409 (a duplicate getUpdates consumer raced us) must
// clean up + exit 0; any OTHER error must clean up AND surface (exit 1). The 409 case
// routes through the module's real `is409`, so it FAILS if `is409` is neutralized to
// always-return-false (the reviewer's mutation) — see the comment on the first test.

interface HandlerCalls {
	stopped: number;
	logs: string[];
	failures: string[];
	exitCodes: number[];
}

/** A `StartErrorDeps` whose effects are recorded (the injected `exit` is a no-op, so
 *  execution continues past it — mirroring how the unit returns its outcome). */
function captureHandler(): { calls: HandlerCalls; deps: StartErrorDeps } {
	const calls: HandlerCalls = { stopped: 0, logs: [], failures: [], exitCodes: [] };
	const deps: StartErrorDeps = {
		stop: () => {
			calls.stopped += 1;
		},
		log: (m) => {
			calls.logs.push(m);
		},
		fail: (m) => {
			calls.failures.push(m);
		},
		exit: (code) => {
			calls.exitCodes.push(code);
		},
	};
	return { calls, deps };
}

describe("handleStartError (AC-09 — 409 clean-exit vs fatal)", () => {
	it("a 409 error_code → cleanup + exit(0) + a 409 log, NOT surfaced as fatal", () => {
		const { calls, deps } = captureHandler();
		const out = handleStartError({ error_code: 409 }, deps);

		expect(out).toEqual({ kind: "clean-exit" });
		expect(calls.stopped).toBe(1); // lock released + descriptor removed
		expect(calls.exitCodes).toEqual([0]); // clean exit, not a crash-loop
		expect(calls.failures).toEqual([]); // never written to stderr
		expect(calls.logs.join("\n")).toMatch(/409/);
		// ↑ Non-vacuous proof: if `is409` is forced to return false, this 409 falls into the
		//   fatal branch — out.kind="fatal", exitCodes=[1], failures non-empty — and EVERY
		//   assertion above flips. So neutralizing `is409` turns this test RED (verified).
	});

	it("an Error whose message contains 409 → also a clean exit(0)", () => {
		const { calls, deps } = captureHandler();
		const out = handleStartError(
			new Error("409: Conflict: terminated by other getUpdates request"),
			deps,
		);

		expect(out).toEqual({ kind: "clean-exit" });
		expect(calls.exitCodes).toEqual([0]);
		expect(calls.failures).toEqual([]);
	});

	it("a non-409 error → cleanup AND surface (exit 1 + stderr), never swallowed", () => {
		const { calls, deps } = captureHandler();
		const out = handleStartError(new Error("network unreachable"), deps);

		expect(out.kind).toBe("fatal");
		if (out.kind === "fatal") expect(out.message).toBe("network unreachable");
		expect(calls.stopped).toBe(1); // cleanup STILL ran — lock/descriptor not leaked
		expect(calls.exitCodes).toEqual([1]); // surfaced as a non-zero exit
		expect(calls.failures.join("")).toMatch(/network unreachable/); // and written to stderr
		expect(calls.logs.join("\n")).not.toMatch(/409/); // the 409 path did not run
	});
});

// ── daemon auto-start (in-process) ────────────────────────────────────────────
//
// `maybeStartBridge` is the start/refuse/skip/fail decision the daemon makes each boot. It
// must NEVER throw into the daemon: no env → no-op; a bridge already holding the lock →
// no-op; a long-poll failure → tear down ONLY the bridge. All I/O is injected, so these run
// with no real `.env`, registry, or Telegram long-poll.

describe("maybeStartBridge (daemon auto-start)", () => {
	it("skips (no-op) when telegram.env does not load — startBridge never reached", () => {
		let startBridgeCalls = 0;
		let runBotCalls = 0;
		const logs: string[] = [];
		const stop = maybeStartBridge({
			envPath: "/nope/telegram.env",
			loadConfig: () => {
				throw new Error("ENOENT");
			},
			buildRuntime: () => runtime(),
			startBridge: () => {
				startBridgeCalls += 1;
				return { kind: "started", bot: {} as never, stop: () => {} };
			},
			runBot: () => {
				runBotCalls += 1;
				return Promise.resolve();
			},
			log: (m) => logs.push(m),
		});
		// Non-vacuous: drop the try/catch around loadConfig and this throws instead of returning.
		expect(startBridgeCalls).toBe(0);
		expect(runBotCalls).toBe(0);
		expect(logs.join("\n")).toMatch(/skip/i);
		expect(() => stop()).not.toThrow(); // the no-op teardown is safe to call
	});

	it("starts the bridge in-process + drives the long-poll, returning the bridge stop", () => {
		let stopped = 0;
		const realStop = (): void => {
			stopped += 1;
		};
		let runBotArg: unknown;
		const returned = maybeStartBridge({
			envPath: "x",
			loadConfig: () => config,
			buildRuntime: () => runtime(),
			startBridge: () => ({ kind: "started", bot: { tag: "bot" } as never, stop: realStop }),
			runBot: (bot) => {
				runBotArg = bot;
				return Promise.resolve();
			},
			log: () => {},
		});
		expect(runBotArg).toEqual({ tag: "bot" }); // the long-poll was driven with the wired bot
		expect(returned).toBe(realStop); // and the bridge teardown is handed back to the daemon
		expect(stopped).toBe(0); // not torn down on the happy path
	});

	it("does NOT start a long-poll when a bridge already holds the lock (refused)", () => {
		let runBotCalls = 0;
		const logs: string[] = [];
		const stop = maybeStartBridge({
			envPath: "x",
			loadConfig: () => config,
			buildRuntime: () => runtime(),
			startBridge: () => ({ kind: "refused", holderPid: 5150 }),
			runBot: () => {
				runBotCalls += 1;
				return Promise.resolve();
			},
			log: (m) => logs.push(m),
		});
		// Non-vacuous: remove the `refused` guard and runBot is called on a bot-less result.
		expect(runBotCalls).toBe(0);
		expect(logs.join("\n")).toMatch(/5150/);
		expect(() => stop()).not.toThrow();
	});

	it("tears down ONLY the bridge when the long-poll fails — never throws into the daemon", async () => {
		let stopped = 0;
		const logs: string[] = [];
		// Returns synchronously even though runBot rejects — the daemon must keep ticking.
		const stop = maybeStartBridge({
			envPath: "x",
			loadConfig: () => config,
			buildRuntime: () => runtime(),
			startBridge: () => ({
				kind: "started",
				bot: {} as never,
				stop: () => {
					stopped += 1;
				},
			}),
			runBot: () => Promise.reject(new Error("409: Conflict")),
			log: (m) => logs.push(m),
		});
		expect(typeof stop).toBe("function"); // no throw escaped maybeStartBridge
		await new Promise((r) => setTimeout(r, 0)); // let the rejection settle
		// Non-vacuous: drop the `.catch` and `stopped` stays 0 (and the rejection goes unhandled).
		expect(stopped).toBe(1); // the bridge was torn down
		expect(logs.join("\n")).toMatch(/stopped|409/i);
	});
});

// Type-only: the production factory's deps shape is the documented seam.
const _depsShape: DaemonBridgeDeps | undefined = undefined;
void _depsShape;
