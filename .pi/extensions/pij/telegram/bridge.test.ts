// pij-telegram — inbound bridge tests (TDD, Plan Phase 2 / AC-02·03·04·07).
//
// Two layers:
//  1. `routeMessage` — pure routing decisions, exhaustively covered with no bot.
//  2. `createBot` — driven with fake grammY updates through `handleUpdate`, an api
//     transformer capturing outbound replies (no network), and a spy delivery (no
//     disk). This is where allowlist-FIRST ordering (AC-07) is actually exercised.

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Bot, InputFile, type Update } from "grammy";
import { describe, expect, it, vi } from "vitest";

// Real pollers share a contended filesystem across the full suite. Keep their
// contract timeout above the observed shared-workstation tail; fake-timer
// replacement remains the proper speed fix (DL-002).
vi.setConfig({ testTimeout: 60_000 });

import { FsChannel } from "../adapters/channel.js";
import { SqliteQueue } from "../adapters/sqlite-queue.js";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import {
	createBot,
	firstContactNote,
	framedBody,
	parseSenderTag,
	routeMessage,
	senderTag,
	startForwarder,
	TELEGRAM_PEER_ID,
} from "./bridge.js";
import type { TelegramConfig } from "./config.js";

/** Poll `pred` until true (the fs watcher is async); throw on timeout. */
async function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = Date.now();
	while (!pred()) {
		if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition never held");
		await new Promise((r) => setTimeout(r, 10));
	}
}

/** A throwaway PIJ_HOME for fs-backed forwarder tests. */
function tmpHome(): string {
	return mkdtempSync(join(tmpdir(), "pij-tg-bridge-"));
}

function setSqliteDeliveryState(queue: SqliteQueue, seq: number, state: "failed"): void {
	const db = new DatabaseSync(queue.dbPath);
	try {
		db.prepare(
			"UPDATE deliveries SET state = ?, claim_token = NULL, lease_until = NULL WHERE seq = ?",
		).run(state, seq);
	} finally {
		db.close();
	}
}

/** Minimal session descriptor fixture; override only what a case cares about. */
function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: `/repo/${over.id}`,
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 4242,
		startedAt: "2026-06-28T00:00:00.000Z",
		...over,
		id: over.id as SessionId,
	};
}

const ALLOWED = 777;
const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;
const BUDGET_CONTEXT = `repo/${"b".repeat(76)}`;
const BUDGET_PREFIX = `[pij-osn81b] [${BUDGET_CONTEXT}]`;

function reassemblePrefixedText(parts: readonly string[], prefix: string): string {
	return parts.map((part) => part.replace(`${prefix} `, "").replace(/^\(\d+\/\d+\) /, "")).join("");
}

// ─── pure routing ────────────────────────────────────────────────────────────
describe("routeMessage", () => {
	const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];

	it("addresses a matched session and delivers the remainder", () => {
		expect(routeMessage("osn fix the test", undefined, sessions)).toEqual({
			kind: "deliver",
			to: "pij-osn81b",
			body: "fix the test",
		});
	});

	it("preserves the remainder's internal formatting", () => {
		expect(routeMessage("osn  line one\nline two", undefined, sessions)).toEqual({
			kind: "deliver",
			to: "pij-osn81b",
			body: "line one\nline two",
		});
	});

	it("selects a matched target (no delivery) when an address carries no text", () => {
		expect(routeMessage("osn", undefined, sessions)).toEqual({
			kind: "address",
			to: "pij-osn81b",
		});
	});

	it("falls back to the last speaker with the WHOLE text when unaddressed", () => {
		// "more" matches no session → the leading word is part of the message.
		expect(routeMessage("more context here", "pij-abc123", sessions)).toEqual({
			kind: "last-speaker",
			to: "pij-abc123",
			body: "more context here",
		});
	});

	it("returns gone when the recorded last speaker is absent from the registry snapshot", () => {
		expect(routeMessage("hello?", "pij-missing", sessions)).toEqual({
			kind: "gone",
			id: "pij-missing",
		});
	});

	it("replies guidance when there is no address and no last speaker", () => {
		expect(routeMessage("hello nobody", undefined, sessions)).toEqual({ kind: "guidance" });
	});

	it("an explicit memorable partial name beats the last speaker", () => {
		const memorable = [desc({ id: "pij-rigid-minnow" }), desc({ id: "pij-planned-tiglon" })];
		expect(routeMessage("planned ship it", "pij-rigid-minnow", memorable)).toEqual({
			kind: "deliver",
			to: "pij-planned-tiglon",
			body: "ship it",
		});
	});

	it("resolves a multi-match deterministically (newest activity wins)", () => {
		const workers = [
			desc({ id: "pij-worker-old", lastEventAt: "2026-06-29T10:00:00.000Z" }),
			desc({ id: "pij-worker-new", lastEventAt: "2026-06-29T12:00:00.000Z" }),
			desc({ id: "pij-worker-mid", lastEventAt: "2026-06-29T11:00:00.000Z" }),
		];
		expect(routeMessage("worker go", undefined, workers)).toEqual({
			kind: "deliver",
			to: "pij-worker-new",
			body: "go",
		});
	});
});

describe("parseSenderTag", () => {
	it("extracts the id from a forwarded bubble's leading tag", () => {
		expect(parseSenderTag("[pij-osn81b] here's the diff")).toBe("pij-osn81b");
	});

	it("round-trips senderTag", () => {
		expect(parseSenderTag(`${senderTag("pij-abc123" as SessionId)} hello`)).toBe("pij-abc123");
	});

	it("still parses the sender when repository context follows the first tag", () => {
		expect(parseSenderTag("[pij-abc123] [pij/feature/repo-context] hello")).toBe("pij-abc123");
	});

	it("returns null for untagged text (guidance, /list output, operator messages)", () => {
		expect(parseSenderTag("Address a session to start…")).toBeNull();
		expect(parseSenderTag("• pij-osn81b — /repo")).toBeNull();
		expect(parseSenderTag("osn hello")).toBeNull();
	});
});

describe("routeMessage (swipe-reply)", () => {
	const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];

	it("routes the WHOLE text to the quoted bubble's tagged sender", () => {
		expect(
			routeMessage("yes go ahead", undefined, sessions, "[pij-abc123] shall I merge?"),
		).toEqual({ kind: "deliver", to: "pij-abc123", body: "yes go ahead" });
	});

	it("reply tag beats an address-token-looking leading word", () => {
		// "osn" would resolve to pij-osn81b as a token — but in a reply it is prose.
		expect(
			routeMessage("osn is the one to keep", undefined, sessions, "[pij-abc123] which session?"),
		).toEqual({ kind: "deliver", to: "pij-abc123", body: "osn is the one to keep" });
	});

	it("reply tag beats the last speaker", () => {
		expect(routeMessage("do it", "pij-osn81b", sessions, "[pij-abc123] ready?")).toEqual({
			kind: "deliver",
			to: "pij-abc123",
			body: "do it",
		});
	});

	it("falls through to normal routing when the quoted text carries no tag", () => {
		expect(routeMessage("more context", "pij-abc123", sessions, "my own earlier msg")).toEqual({
			kind: "last-speaker",
			to: "pij-abc123",
			body: "more context",
		});
	});

	it("is honest (never misroutes) when the tagged session is gone", () => {
		expect(routeMessage("hello?", "pij-osn81b", sessions, "[pij-dead99] bye")).toEqual({
			kind: "gone",
			id: "pij-dead99",
		});
	});

	it("an empty reply body just retargets (media-with-no-caption case)", () => {
		expect(routeMessage("", undefined, sessions, "[pij-osn81b] look at this")).toEqual({
			kind: "address",
			to: "pij-osn81b",
		});
	});
});

// ─── bot wiring (fake updates) ─────────────────────────────────────────────────
let updateSeq = 0;

/** Build a fake Telegram text update. `command:true` adds the bot_command entity;
 *  `replyTo` makes it a swipe-reply quoting a bubble with that text/caption. */
function textUpdate(opts: {
	fromId: number;
	chatId?: number;
	text: string;
	command?: boolean;
	replyTo?: { text?: string; caption?: string };
}): Update {
	updateSeq += 1;
	const firstWord = opts.text.split(/\s/)[0] ?? "";
	const entities = opts.command
		? [{ type: "bot_command", offset: 0, length: firstWord.length }]
		: undefined;
	return {
		update_id: updateSeq,
		message: {
			message_id: updateSeq,
			date: 0,
			chat: { id: opts.chatId ?? 1000, type: "private", first_name: "Op" },
			from: { id: opts.fromId, is_bot: false, first_name: "Op" },
			text: opts.text,
			...(entities ? { entities } : {}),
			...(opts.replyTo
				? {
						reply_to_message: {
							message_id: updateSeq - 1,
							date: 0,
							chat: { id: opts.chatId ?? 1000, type: "private", first_name: "Op" },
							...opts.replyTo,
						},
					}
				: {}),
		},
	} as unknown as Update;
}

/** Spin up a bot with spies + an offline api transformer that records replies. */
function makeBridge(
	sessions: SessionDescriptor[],
	allowed: number[] = [ALLOWED],
	readEvents?: (id: SessionId, last: number) => readonly PijEvent[],
	downloadMedia?: (ctx: unknown, dest: string) => Promise<void>,
	isAlive?: (pid: number) => boolean,
	now?: () => number,
	onDelivered?: (to: SessionId, telegramMessageId: number) => void,
	getLastSpeaker?: (chatId: string) => SessionId | undefined,
) {
	const deliver = vi.fn();
	const log = vi.fn();
	const config: TelegramConfig = { token: "test-token", allowedUserIds: allowed };
	const bot = createBot(config, {
		listSessions: () => sessions,
		isAlive,
		now,
		deliver,
		onDelivered,
		getLastSpeaker,
		readEvents,
		downloadMedia: downloadMedia as ((ctx: never, dest: string) => Promise<void>) | undefined,
		log,
	});
	// Mark the bot initialised so handleUpdate runs offline (no getMe round-trip).
	bot.botInfo = {
		id: 1,
		is_bot: true,
		first_name: "pij",
		username: "pijbot",
		can_join_groups: true,
		can_read_all_group_messages: false,
		supports_inline_queries: false,
	} as unknown as (typeof bot)["botInfo"];
	// Intercept every outbound api call: record it, never touch the network.
	const sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
	bot.api.config.use((_prev, method, payload) => {
		sent.push({ method, payload: payload as Record<string, unknown> });
		return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
	});
	const replies = (): string[] =>
		sent.filter((s) => s.method === "sendMessage").map((s) => String(s.payload.text));
	return { bot, deliver, log, replies };
}

/** Build a fake Telegram media update (photo/animation/document) with an optional caption. */
function mediaUpdate(opts: {
	kind: "photo" | "animation" | "document";
	fromId: number;
	chatId?: number;
	caption?: string;
	fileSize?: number;
	fileName?: string;
	replyTo?: { text?: string; caption?: string };
}): Update {
	updateSeq += 1;
	const size = opts.fileSize ?? 1024;
	const base = {
		message_id: updateSeq,
		date: 0,
		chat: { id: opts.chatId ?? 1000, type: "private", first_name: "Op" },
		from: { id: opts.fromId, is_bot: false, first_name: "Op" },
		...(opts.caption !== undefined ? { caption: opts.caption } : {}),
		...(opts.replyTo
			? {
					reply_to_message: {
						message_id: updateSeq - 1,
						date: 0,
						chat: { id: opts.chatId ?? 1000, type: "private", first_name: "Op" },
						...opts.replyTo,
					},
				}
			: {}),
	};
	let media: Record<string, unknown>;
	if (opts.kind === "photo") {
		media = {
			photo: [
				{ file_id: "f-small", file_unique_id: "u-small", width: 90, height: 60, file_size: 100 },
				{ file_id: "f-big", file_unique_id: "u-big", width: 900, height: 600, file_size: size },
			],
		};
	} else if (opts.kind === "animation") {
		media = {
			animation: {
				file_id: "f-anim",
				file_unique_id: "u-anim",
				width: 320,
				height: 240,
				duration: 2,
				file_name: opts.fileName,
				mime_type: "video/mp4",
				file_size: size,
			},
		};
	} else {
		media = {
			document: {
				file_id: "f-doc",
				file_unique_id: "u-doc",
				file_name: opts.fileName ?? "report.pdf",
				mime_type: "application/pdf",
				file_size: size,
			},
		};
	}
	return { update_id: updateSeq, message: { ...base, ...media } } as unknown as Update;
}

describe("createBot (inbound bridge)", () => {
	it("drops a non-allowlisted update before any routing (AC-07)", async () => {
		const { bot, deliver, log, replies } = makeBridge([desc({ id: "pij-osn81b" })]);
		await bot.handleUpdate(textUpdate({ fromId: 999, text: "osn do something" }));
		// allowlist is first → delivery never runs, nothing is replied
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()).toEqual([]);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("drop"));
	});

	it("delivers an addressed message to the matched session (AC-02)", async () => {
		const { bot, deliver, replies } = makeBridge([
			desc({ id: "pij-osn81b" }),
			desc({ id: "pij-abc123" }),
		]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn fix the test" }));
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(deliver).toHaveBeenCalledWith({
			from: "pij-telegram",
			to: "pij-osn81b",
			// first contact → the operator's text is framed with the one-time Telegram note
			body: framedBody("fix the test", true),
		});
		// a successful relay is silent (no chatty confirmation)
		expect(replies()).toEqual([]);
	});

	it("relays bare text to the injected per-chat last speaker (AC-03)", async () => {
		const { bot, deliver } = makeBridge(
			[desc({ id: "pij-osn81b" })],
			[ALLOWED],
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			(chatId) => (chatId === "1000" ? ("pij-osn81b" as SessionId) : undefined),
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "and one more thing" }));
		expect(deliver).toHaveBeenCalledWith({
			from: "pij-telegram",
			to: "pij-osn81b",
			body: framedBody("and one more thing", true),
		});
	});

	it("addressing with no text selects the /tail target but does not create a speaker", async () => {
		const { bot, deliver, replies } = makeBridge([desc({ id: "pij-osn81b" })]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn" }));
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()[0]).toContain("pij-osn81b");
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "now this" }));
		expect(deliver).not.toHaveBeenCalled();
		expect(replies().at(-1)).toMatch(/\/list/);
	});

	it("keeps silent explicit target B separate from last speaker A (AC-06)", async () => {
		const sessions = [desc({ id: "pij-agent-a" }), desc({ id: "pij-agent-b" })];
		const { bot, deliver } = makeBridge(
			sessions,
			[ALLOWED],
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => "pij-agent-a" as SessionId,
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "agent-b work on this" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "what is the status?" }));
		expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "pij-agent-b" });
		expect(deliver.mock.calls[1]?.[0]).toMatchObject({
			to: "pij-agent-a",
			body: expect.stringContaining("what is the status?"),
		});
	});

	it("resolves a multi-match deterministically end-to-end (AC-04)", async () => {
		const { bot, deliver } = makeBridge([
			desc({ id: "pij-worker-old", lastEventAt: "2026-06-29T10:00:00.000Z" }),
			desc({ id: "pij-worker-new", lastEventAt: "2026-06-29T12:00:00.000Z" }),
			desc({ id: "pij-worker-mid", lastEventAt: "2026-06-29T11:00:00.000Z" }),
		]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "worker ship it" }));
		expect(deliver).toHaveBeenCalledWith({
			from: "pij-telegram",
			to: "pij-worker-new",
			body: framedBody("ship it", true),
		});
	});

	it("replies guidance when unaddressed with no last speaker", async () => {
		const { bot, deliver, replies } = makeBridge([desc({ id: "pij-osn81b" })]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "hello there" }));
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()).toHaveLength(1);
		expect(replies()[0]).toMatch(/\/list/);
	});

	it("answers /list with the live sessions and never relays it", async () => {
		const { bot, deliver, replies } = makeBridge([
			desc({ id: "pij-osn81b", folder: "/work/alpha" }),
		]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/list", command: true }));
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()).toHaveLength(1);
		expect(replies()[0]).toContain("pij-osn81b");
		expect(replies()[0]).toContain("/work/alpha");
	});

	it("drops a non-allowlisted /list too (allowlist precedes commands)", async () => {
		const { bot, replies, log } = makeBridge([desc({ id: "pij-osn81b" })]);
		await bot.handleUpdate(textUpdate({ fromId: 999, text: "/list", command: true }));
		expect(replies()).toEqual([]);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("drop"));
	});

	it("/list excludes a dead session — proves isAlive threads through the wiring (Plan 027)", async () => {
		const live = desc({ id: "pij-live", folder: "/work/live", pid: 1111 });
		const dead = desc({ id: "pij-dead", folder: "/work/dead", pid: 2222 });
		const isAlive = (pid: number) => pid !== dead.pid;
		const { bot, replies } = makeBridge(
			[live, dead],
			[ALLOWED],
			undefined,
			undefined,
			isAlive,
			() => Date.now(),
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/list", command: true }));
		expect(replies()[0]).toContain("pij-live");
		expect(replies()[0]).not.toContain("pij-dead");
	});
});

// ─── swipe-reply routing (bot wiring) ────────────────────────────────────────────
describe("createBot swipe-reply routing", () => {
	const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];

	it("delivers a swipe-reply to the quoted sender without replacing last-speaker fallback", async () => {
		const { bot, deliver } = makeBridge(
			[...sessions],
			[ALLOWED],
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => "pij-osn81b" as SessionId,
		);
		await bot.handleUpdate(
			textUpdate({
				fromId: ALLOWED,
				text: "yes merge it",
				replyTo: { text: "[pij-abc123] shall I merge?" },
			}),
		);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "pij-abc123" });
		expect(deliver.mock.calls[0]?.[0].body).toContain("yes merge it");
		// B was selected but has not spoken; the strict fallback remains A.
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "and push please" }));
		expect(deliver).toHaveBeenCalledTimes(2);
		expect(deliver.mock.calls[1]?.[0]).toMatchObject({
			to: "pij-osn81b",
			body: expect.stringContaining("and push please"),
		});
	});

	it("routes a reply to a MEDIA bubble via its caption tag", async () => {
		const { bot, deliver } = makeBridge([...sessions]);
		await bot.handleUpdate(
			textUpdate({
				fromId: ALLOWED,
				text: "nice screenshot",
				replyTo: { caption: "[pij-osn81b]" },
			}),
		);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "pij-osn81b" });
	});

	it("replies the gone notice (and delivers nothing) when the tagged session vanished", async () => {
		const { bot, deliver, replies } = makeBridge([...sessions]);
		await bot.handleUpdate(
			textUpdate({
				fromId: ALLOWED,
				text: "hello?",
				replyTo: { text: "[pij-dead99] last words" },
			}),
		);
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()[0]).toContain("pij-dead99");
		expect(replies()[0]).toContain("isn't live");
	});

	it("a reply to an untagged bot message falls through to normal routing", async () => {
		const { bot, deliver } = makeBridge(
			[...sessions],
			[ALLOWED],
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => "pij-osn81b" as SessionId,
		);
		await bot.handleUpdate(
			textUpdate({
				fromId: ALLOWED,
				text: "carry on",
				replyTo: { text: "Address a session to start…" },
			}),
		);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(deliver.mock.calls[0]?.[0]).toMatchObject({
			to: "pij-osn81b",
			body: expect.stringContaining("carry on"),
		});
	});

	it("routes inbound MEDIA sent as a swipe-reply to the tagged sender", async () => {
		const downloads: string[] = [];
		const downloadMedia = async (_ctx: unknown, dest: string) => {
			downloads.push(dest);
		};
		const { bot, deliver } = makeBridge([...sessions], [ALLOWED], undefined, downloadMedia);
		await bot.handleUpdate(
			mediaUpdate({
				kind: "photo",
				fromId: ALLOWED,
				replyTo: { text: "[pij-abc123] which layout?" },
			}),
		);
		expect(downloads).toHaveLength(1);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "pij-abc123" });
	});
});

// ─── reply threading (operator msg id → quoted outbound bubble) ──────────────────
describe("reply threading", () => {
	const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];

	it("onDelivered reports the operator message id for addressed AND last-speaker deliveries", async () => {
		const delivered: Array<[SessionId, number]> = [];
		const { bot } = makeBridge(
			[...sessions],
			[ALLOWED],
			undefined,
			undefined,
			undefined,
			undefined,
			(to, mid) => delivered.push([to, mid]),
			() => "pij-osn81b" as SessionId,
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn hello" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "and another thing" }));
		expect(delivered).toHaveLength(2);
		expect(delivered[0]?.[0]).toBe("pij-osn81b");
		expect(delivered[1]?.[0]).toBe("pij-osn81b"); // fallback delivery reports too
		expect(delivered[0]?.[1]).not.toBe(delivered[1]?.[1]); // distinct telegram message ids
	});

	it("forwarder quotes the pending operator message on the FIRST bubble only, then consumes it", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: Array<{ text: string; replyTo?: number }> = [];
			const onSpoke = vi.fn();
			const pending = new Map<string, number>([["pij-osn81b", 42]]);
			const dispose = startForwarder(channel, {
				send: async (text, replyTo) => {
					sent.push({ text, replyTo });
				},
				takeReplyTo: (from) => {
					const mid = pending.get(from);
					pending.delete(from);
					return mid;
				},
				onSpoke,
			});
			const body = "x".repeat(9000); // ≥3 chunked parts — only the first may quote
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body });
			await waitFor(() => sent.length >= 3);
			expect(onSpoke).toHaveBeenCalledTimes(1); // threaded message counts once, not per chunk
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "unprompted follow-up" });
			await waitFor(() => sent.length >= 4);
			dispose();
			expect(sent[0]?.replyTo).toBe(42);
			for (const s of sent.slice(1)) expect(s.replyTo).toBeUndefined();
			expect(onSpoke).toHaveBeenCalledTimes(2); // one callback per delivered message
			expect(onSpoke).toHaveBeenCalledWith("pij-osn81b");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("a session that speaks unprompted sends a plain (unquoted) bubble", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: Array<{ text: string; replyTo?: number }> = [];
			const dispose = startForwarder(channel, {
				send: async (text, replyTo) => {
					sent.push({ text, replyTo });
				},
				takeReplyTo: () => undefined,
			});
			channel.deliver({ from: "pij-abc123", to: TELEGRAM_PEER_ID, body: "status: all green" });
			await waitFor(() => sent.length >= 1);
			dispose();
			expect(sent[0]?.replyTo).toBeUndefined();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ─── first-contact preamble ──────────────────────────────────────────────────────
describe("framedBody (first-contact framing)", () => {
	it("prepends the note on first contact and passes text through afterwards", () => {
		// Non-vacuous: collapse the branch to always-`text` and the first assertion flips RED.
		expect(framedBody("hello", true)).toBe(`${firstContactNote()}\n\nhello`);
		expect(framedBody("hello", false)).toBe("hello");
	});

	it("the note orients the agent to a live mobile Telegram user + the reply contract", () => {
		const note = firstContactNote();
		expect(note).toMatch(/telegram/i);
		expect(note).toMatch(/phone|mobile/i);
		expect(note).toMatch(/short|brief/i); // tells the agent not to dump
		expect(note).toContain(`pij send ${TELEGRAM_PEER_ID}`); // how to reply back
	});
});

describe("createBot first-contact preamble (relayed once per session)", () => {
	it("frames the FIRST relayed message to a session, then relays raw text after", async () => {
		const { bot, deliver } = makeBridge([desc({ id: "pij-osn81b" })]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn first message" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn second message" }));

		const first = String(deliver.mock.calls[0][0].body);
		const second = String(deliver.mock.calls[1][0].body);
		expect(first).toBe(framedBody("first message", true)); // note + the user's text
		expect(first).toMatch(/telegram/i);
		// Non-vacuous: drop the `greeted` guard and the second message would be framed too.
		expect(second).toBe("second message");
		expect(second).not.toMatch(/telegram/i);
	});

	it("greets each session independently (first contact is per-session, not per-chat)", async () => {
		const { bot, deliver } = makeBridge([desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn hi" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "abc hi" }));
		expect(String(deliver.mock.calls[0][0].body)).toMatch(/telegram/i); // osn's first contact
		expect(String(deliver.mock.calls[1][0].body)).toMatch(/telegram/i); // abc's first contact
	});
});

// ─── /tail (Phase 3) ───────────────────────────────────────────────────────────
const ev = (over: Partial<PijEvent> & { seq: number }): PijEvent => ({
	timestamp: "2026-06-29T10:00:00.000Z",
	type: "message",
	...over,
});

describe("createBot /tail", () => {
	it("tails the selected target's last 10 events by default", async () => {
		const events = [ev({ seq: 7, type: "message", data: { body: "build is green" } })];
		const readEvents = vi.fn((_id: SessionId, _n: number) => events);
		const { bot, replies } = makeBridge([desc({ id: "pij-osn81b" })], [ALLOWED], readEvents);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn" })); // select target
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/tail", command: true }));
		expect(readEvents).toHaveBeenCalledWith("pij-osn81b", 10);
		expect(replies().at(-1)).toContain("message");
		expect(replies().at(-1)).toContain("build is green");
	});

	it("honours an explicit /tail N", async () => {
		const readEvents = vi.fn((_id: SessionId, _n: number) => [] as PijEvent[]);
		const { bot } = makeBridge([desc({ id: "pij-osn81b" })], [ALLOWED], readEvents);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/tail 20", command: true }));
		expect(readEvents).toHaveBeenCalledWith("pij-osn81b", 20);
	});

	it("a bare fallback selects its actual recipient for /tail", async () => {
		const readEvents = vi.fn((_id: SessionId, _n: number) => [] as PijEvent[]);
		const { bot } = makeBridge(
			[desc({ id: "pij-agent-a" }), desc({ id: "pij-agent-b" })],
			[ALLOWED],
			readEvents,
			undefined,
			undefined,
			undefined,
			undefined,
			() => "pij-agent-a" as SessionId,
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "agent-b" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/tail", command: true }));
		expect(readEvents).toHaveBeenLastCalledWith("pij-agent-b", 10);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "bare follow-up" }));
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/tail", command: true }));
		expect(readEvents).toHaveBeenLastCalledWith("pij-agent-a", 10);
	});

	it("replies guidance (not an empty tail) when no selected target is set", async () => {
		const readEvents = vi.fn((_id: SessionId, _n: number) => [] as PijEvent[]);
		const { bot, replies } = makeBridge([desc({ id: "pij-osn81b" })], [ALLOWED], readEvents);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "/tail", command: true }));
		expect(readEvents).not.toHaveBeenCalled();
		expect(replies()).toHaveLength(1);
		expect(replies()[0]).toMatch(/\/list/); // same guidance the text relay gives
	});
});

// ─── sender tag (every forwarded bubble carries the sender's pij id) ─────────────
describe("senderTag", () => {
	it("wraps the sender id so the operator can see + address it after a reset", () => {
		// Non-vacuous: change the format and the forwarder's exact-text assertions flip too.
		expect(senderTag("pij-5lztp8" as SessionId)).toBe("[pij-5lztp8]");
		expect(senderTag("pij-abc123" as SessionId)).toBe("[pij-abc123]");
	});
});

// ─── outbound forwarder (Phase 3 / AC-05·08) ────────────────────────────────────
describe("startForwarder (inbox → chat)", () => {
	it("subtracts the 96-character sender prefix from the 4096 text budget", async () => {
		expect(BUDGET_PREFIX).toHaveLength(96);
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				senderContext: () => BUDGET_CONTEXT,
			});
			const body = "x".repeat(4000);
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body });
			await waitFor(() => sent.length === 2);
			dispose();

			for (const part of sent) expect(part.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
			expect(reassemblePrefixedText(sent, BUDGET_PREFIX)).toBe(body);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	// FLAKY (quarantined 2026-07-21, Jordan ruling): passes in isolation, fails under full-suite parallel-load contention. Re-enable when the suite is de-contended.
	it.skip("normalizes an existing exact canonical prefix to one", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				senderContext: () => "pij",
			});
			channel.deliver({
				from: "pij-primary-carp",
				to: TELEGRAM_PEER_ID,
				body: "[pij-primary-carp] [pij] Restart done on the approved Telegram update",
			});
			await waitFor(() => sent.length === 1);
			dispose();

			expect(sent).toEqual([
				"[pij-primary-carp] [pij] Restart done on the approved Telegram update",
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("upgrades an exact same-sender tag to canonical and preserves other bracketed content", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				senderContext: () => "pij/feature/idempotent-prefix",
			});
			channel.deliver({
				from: "pij-primary-carp",
				to: TELEGRAM_PEER_ID,
				body: "[pij-primary-carp] sender-only",
			});
			channel.deliver({
				from: "pij-primary-carp",
				to: TELEGRAM_PEER_ID,
				body: "[pij-other-agent] different sender",
			});
			channel.deliver({
				from: "pij-primary-carp",
				to: TELEGRAM_PEER_ID,
				body: "[status] arbitrary bracket",
			});
			await waitFor(() => sent.length === 3);
			dispose();

			expect(sent).toEqual([
				"[pij-primary-carp] [pij/feature/idempotent-prefix] sender-only",
				"[pij-primary-carp] [pij/feature/idempotent-prefix] [pij-other-agent] different sender",
				"[pij-primary-carp] [pij/feature/idempotent-prefix] [status] arbitrary bracket",
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("normalizes before applying the prefix-aware text budget", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				senderContext: () => BUDGET_CONTEXT,
			});
			const content = "z".repeat(4000);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: `${BUDGET_PREFIX} ${content}`,
			});
			await waitFor(() => sent.length === 2);
			dispose();

			for (const part of sent) expect(part.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
			expect(reassemblePrefixedText(sent, BUDGET_PREFIX)).toBe(content);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("forwards a >4096-char reply chunked AND untruncated (AC-05)", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const senderContext = vi.fn(() => "pij/feature/repo-context");
			const dispose = startForwarder(channel, {
				send: async (t) => {
					sent.push(t);
				},
				senderContext,
			});
			const body = "x".repeat(9000); // forces ≥3 parts at the 4000 budget
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body });
			await waitFor(() => sent.length >= 3);
			dispose();
			for (const part of sent) expect(part.length).toBeLessThanOrEqual(4096);
			// strip the `(i/n) ` prefixes → the parts reassemble to the original, lossless.
			// strip the `[sender-id] ` tag then the `(i/n) ` chunk prefix to reassemble.
			const reassembled = sent
				.map((p) => p.replace(/^\[[^\]]+\] \[[^\]]+\] /, "").replace(/^\(\d+\/\d+\) /, ""))
				.join("");
			expect(reassembled).toBe(body);
			for (const p of sent) {
				expect(p.startsWith("[pij-osn81b] [pij/feature/repo-context] ")).toBe(true);
			}
			expect(senderContext).toHaveBeenCalledTimes(1);
			expect(senderContext).toHaveBeenCalledWith("pij-osn81b");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("omits /main from the repository context prefix", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (t) => {
					sent.push(t);
				},
				senderContext: () => "pij",
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "all done ✅" });
			await waitFor(() => sent.length >= 1);
			dispose();
			expect(sent).toEqual(["[pij-osn81b] [pij] all done ✅"]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("degrades to the existing sender tag when repository context is unavailable", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				senderContext: () => undefined,
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "fallback" });
			await waitFor(() => sent.length === 1);
			dispose();
			expect(sent).toEqual(["[pij-osn81b] fallback"]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("does not record speech when every Telegram send fails", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			let attempts = 0;
			const onSpoke = vi.fn();
			const dispose = startForwarder(channel, {
				send: async () => {
					attempts += 1;
					throw new Error("telegram unavailable");
				},
				onSpoke,
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "not delivered" });
			await waitFor(() => attempts === 1);
			dispose();
			expect(onSpoke).not.toHaveBeenCalled();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("records speech once on the first successful part after an earlier failure", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			let attempts = 0;
			const onSpoke = vi.fn();
			const dispose = startForwarder(channel, {
				send: async () => {
					attempts += 1;
					if (attempts === 1) throw new Error("first chunk failed");
				},
				onSpoke,
			});
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "x".repeat(9000),
			});
			await waitFor(() => attempts >= 3);
			dispose();
			expect(onSpoke).toHaveBeenCalledTimes(1);
			expect(onSpoke).toHaveBeenCalledWith("pij-osn81b");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("records-but-never-forwards a receipt and never treats the receipt as speech", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const log: string[] = [];
			const onSpoke = vi.fn();
			const dispose = startForwarder(channel, {
				send: async (t) => {
					sent.push(t);
				},
				log: (m) => log.push(m),
				onSpoke,
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "ack", kind: "receipt" });
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "real reply" });
			await waitFor(() => sent.length >= 1);
			dispose();
			expect(sent).toEqual(["[pij-osn81b] real reply"]); // the receipt was skipped, the reply forwarded
			expect(log.some((l) => l.includes("skip receipt"))).toBe(true);
			expect(onSpoke).toHaveBeenCalledTimes(1);
			expect(onSpoke).toHaveBeenCalledWith("pij-osn81b");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("skips inbox history present at boot (seeded watermark)", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			// a reply already sitting in the inbox before the bridge boots …
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "old — already seen" });
			const inbox = join(home, TELEGRAM_PEER_ID, "inbox");
			const seen = new Set(readdirSync(inbox).filter((n) => n.startsWith("msg-")));
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				seen,
				send: async (t) => {
					sent.push(t);
				},
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "new reply" });
			await waitFor(() => sent.length >= 1);
			dispose();
			expect(sent).toEqual(["[pij-osn81b] new reply"]); // the pre-boot message is NOT replayed
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

describe("startForwarder over SqliteQueue (sqlite default)", () => {
	it("forwards once and acks only after the Telegram send resolves", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "sqlite reply",
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let sendResolvedAt = 0;
			const sent: string[] = [];
			const logs: string[] = [];
			dispose = startForwarder(queue, {
				send: async (text) => {
					sent.push(text);
					now = 2_000;
					sendResolvedAt = now;
				},
				log: (message) => logs.push(message),
			});

			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(sent).toEqual(["[pij-osn81b] sqlite reply"]);
			const ack = queue
				.receipts(delivered.value.messageId)
				.find((receipt) => receipt.state === "acked");
			expect(ack?.at).toBeGreaterThanOrEqual(sendResolvedAt);
			expect(ack?.detail).toBe(`reader=${TELEGRAM_PEER_ID}`);
			expect(logs.filter((line) => line.includes("forwarded"))).toEqual([
				expect.stringContaining(`${delivered.value.messageId} part 1/1`),
			]);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("acks after one transient retry and delivers exactly one Telegram bubble", async () => {
		const home = tmpHome();
		const queue = new SqliteQueue(home);
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "retry without duplicate",
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let attempts = 0;
			const sent: string[] = [];
			dispose = startForwarder(queue, {
				send: async (text) => {
					attempts += 1;
					if (attempts === 1) throw new Error("ETIMEDOUT");
					sent.push(text);
				},
			});

			await waitFor(() => attempts >= 1);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(attempts).toBe(2);
			expect(sent).toEqual(["[pij-osn81b] retry without duplicate"]);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("acked");
			expect(
				queue
					.receipts(delivered.value.messageId)
					.some((receipt) => receipt.state === "redelivered"),
			).toBe(false);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("acks a two-bubble message on attempt 1 when the first deps.send fails before sending", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "x".repeat(5_000),
			});
			if (!delivered.ok) throw new Error(delivered.message);
			const attempts: string[] = [];
			const sent: string[] = [];
			const logs: string[] = [];
			dispose = startForwarder(queue, {
				send: async (text) => {
					attempts.push(text);
					now += 25;
					if (attempts.length === 1) {
						throw new Error("Network request for 'sendMessage' failed!");
					}
					sent.push(text);
				},
				log: (message) => logs.push(message),
			});

			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(attempts.filter((text) => text.includes("(1/2)"))).toHaveLength(2);
			expect(attempts.filter((text) => text.includes("(2/2)"))).toHaveLength(1);
			expect(sent.filter((text) => text.includes("(1/2)"))).toHaveLength(1);
			expect(sent.filter((text) => text.includes("(2/2)"))).toHaveLength(1);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.attempt).toBe(1);
			const receipts = queue.receipts(delivered.value.messageId);
			const claimedAt = receipts.find((receipt) => receipt.state === "claimed")?.at;
			const ackedAt = receipts.find((receipt) => receipt.state === "acked")?.at;
			expect(claimedAt).toBeDefined();
			expect(ackedAt).toBeDefined();
			expect((ackedAt ?? 0) - (claimedAt ?? 0)).toBe(75);
			expect(receipts.some((receipt) => receipt.state === "redelivered")).toBe(false);
			expect(logs).toContainEqual(
				expect.stringContaining(
					`text deps.send retry after transient failure (${delivered.value.messageId} part 1/2)`,
				),
			);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("redelivery sends only text parts not already persisted as successful", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "x".repeat(9000),
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let failMiddle = true;
			const attempts: string[] = [];
			const sent: string[] = [];
			dispose = startForwarder(queue, {
				send: async (text) => {
					attempts.push(text);
					if (failMiddle && text.includes("(2/3)")) throw new Error("ETIMEDOUT");
					sent.push(text);
				},
			});

			await waitFor(
				() => attempts.filter((text) => text.includes("(2/3)")).length === 2 && sent.length === 2,
			);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");
			failMiddle = false;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(sent.filter((text) => text.includes("(1/3)"))).toHaveLength(1);
			expect(sent.filter((text) => text.includes("(2/3)"))).toHaveLength(1);
			expect(sent.filter((text) => text.includes("(3/3)"))).toHaveLength(1);
			expect([...queue.telegramSentParts(delivered.value.messageId)]).toEqual([0, 1, 2]);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("same-count distribution drift sends the whole current bubble plan", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const firstPath = "/tmp/first.png";
			const secondPath = "/tmp/second.png";
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: firstPath }, { path: secondPath }],
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let pass = 1;
			const firstText: string[] = [];
			const redeliveryText: string[] = [];
			const firstMedia: string[] = [];
			const redeliveryMedia: string[] = [];
			dispose = startForwarder(queue, {
				sizeOf: (path) => {
					if (pass === 1) return path === firstPath ? 11 * 1024 * 1024 : 1;
					return path === secondPath ? 11 * 1024 * 1024 : 1;
				},
				send: async (text) => {
					(pass === 1 ? firstText : redeliveryText).push(text);
				},
				sendMedia: async (_kind, path) => {
					if (pass === 1) {
						firstMedia.push(path);
						throw new Error("Call to 'sendPhoto' failed! (400: Bad Request)");
					}
					redeliveryMedia.push(path);
				},
			});

			await waitFor(() => firstText.length === 1 && firstMedia.length === 1);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");
			expect([...queue.telegramSentParts(delivered.value.messageId)]).toEqual([0]);

			pass = 2;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(redeliveryMedia).toEqual([firstPath]);
			expect(redeliveryText).toHaveLength(1);
			expect(redeliveryText[0]).toContain(secondPath);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("same-hash redelivery skips acknowledged media and sends only unmarked media", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const firstPath = "/tmp/first.png";
			const secondPath = "/tmp/second.png";
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: firstPath }, { path: secondPath }],
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let failSecond = true;
			const attempts: string[] = [];
			const sent: string[] = [];
			dispose = startForwarder(queue, {
				sizeOf: () => 1,
				send: async () => {},
				sendMedia: async (_kind, path) => {
					attempts.push(path);
					if (failSecond && path === secondPath) {
						throw new Error("Call to 'sendPhoto' failed! (400: Bad Request)");
					}
					sent.push(path);
				},
			});

			await waitFor(() => sent.length === 1 && attempts.includes(secondPath));
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");

			failSecond = false;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(sent).toEqual([firstPath, secondPath]);
			expect(attempts.filter((path) => path === firstPath)).toHaveLength(1);
			expect(attempts.filter((path) => path === secondPath)).toHaveLength(2);
			expect([...queue.telegramSentParts(delivered.value.messageId)]).toEqual([0, 1]);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("marks a failed bubble only after a later positive Telegram acknowledgment", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "ack before mark",
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let fail = true;
			let attempts = 0;
			const sent: string[] = [];
			dispose = startForwarder(queue, {
				send: async (text) => {
					attempts += 1;
					if (fail) throw new Error("Call to 'sendMessage' failed! (400: Bad Request)");
					sent.push(text);
				},
			});

			await waitFor(() => attempts === 1);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");
			expect([...queue.telegramSentParts(delivered.value.messageId)]).toEqual([]);

			fail = false;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(attempts).toBe(2);
			expect(sent).toEqual(["[pij-osn81b] ack before mark"]);
			expect([...queue.telegramSentParts(delivered.value.messageId)]).toEqual([0]);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("bubble-plan drift sends every recomputed part and preserves the full tail", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const body = "z".repeat(8100);
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body,
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let context: string | undefined = BUDGET_CONTEXT;
			let failMiddle = true;
			let redelivering = false;
			const firstSent: string[] = [];
			const redeliverySent: string[] = [];
			dispose = startForwarder(queue, {
				senderContext: () => context,
				send: async (text) => {
					if (failMiddle && text.includes("(2/3)")) throw new Error("ETIMEDOUT");
					(redelivering ? redeliverySent : firstSent).push(text);
				},
			});

			await waitFor(() => firstSent.length === 2);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");
			expect(queue.telegramBubblesHash(delivered.value.messageId)).toMatch(/^[0-9a-f]{64}$/);

			context = undefined;
			failMiddle = false;
			redelivering = true;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(redeliverySent).toHaveLength(2);
			expect(reassemblePrefixedText(redeliverySent, "[pij-osn81b]")).toBe(body);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("legacy sent-part rows without a bubbles hash degrade to send-all", async () => {
		const home = tmpHome();
		const queue = new SqliteQueue(home);
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "legacy row",
			});
			if (!delivered.ok) throw new Error(delivered.message);
			queue.markTelegramPartSent(delivered.value.messageId, 0);
			expect(queue.telegramBubblesHash(delivered.value.messageId)).toBeUndefined();
			const sent: string[] = [];
			dispose = startForwarder(queue, {
				send: async (text) => {
					sent.push(text);
				},
			});

			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");
			expect(sent).toEqual(["[pij-osn81b] legacy row"]);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("stable-count prefix drift still sends every recomputed part", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const body = "s".repeat(7000);
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body,
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let context: string | undefined = BUDGET_CONTEXT;
			let failSecond = true;
			let failedSecondAttempts = 0;
			let redelivering = false;
			const firstSent: string[] = [];
			const redeliverySent: string[] = [];
			dispose = startForwarder(queue, {
				senderContext: () => context,
				send: async (text) => {
					if (failSecond && text.includes("(2/2)")) {
						failedSecondAttempts += 1;
						throw new Error("ETIMEDOUT");
					}
					(redelivering ? redeliverySent : firstSent).push(text);
				},
			});

			await waitFor(() => firstSent.length === 1 && failedSecondAttempts === 2);
			expect(queue.telegramBubblesHash(delivered.value.messageId)).toMatch(/^[0-9a-f]{64}$/);
			context = undefined;
			failSecond = false;
			redelivering = true;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(redeliverySent).toHaveLength(2);
			expect(reassemblePrefixedText(redeliverySent, "[pij-osn81b]")).toBe(body);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("equal-length prefix drift still sends every recomputed part", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const body = "h".repeat(7000);
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body,
			});
			if (!delivered.ok) throw new Error(delivered.message);
			const contextA = `repo/${"a".repeat(76)}`;
			const contextB = `repo/${"b".repeat(76)}`;
			let context = contextA;
			let failSecond = true;
			let failedSecondAttempts = 0;
			let redelivering = false;
			const firstSent: string[] = [];
			const redeliverySent: string[] = [];
			dispose = startForwarder(queue, {
				senderContext: () => context,
				send: async (text) => {
					if (failSecond && text.includes("(2/2)")) {
						failedSecondAttempts += 1;
						throw new Error("ETIMEDOUT");
					}
					(redelivering ? redeliverySent : firstSent).push(text);
				},
			});

			await waitFor(() => firstSent.length === 1 && failedSecondAttempts === 2);
			const prefixA = `[pij-osn81b] [${contextA}]`;
			const prefixB = `[pij-osn81b] [${contextB}]`;
			expect(prefixA).toHaveLength(prefixB.length);
			expect(queue.telegramBubblesHash(delivered.value.messageId)).toMatch(/^[0-9a-f]{64}$/);

			context = contextB;
			failSecond = false;
			redelivering = true;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(redeliverySent).toHaveLength(2);
			expect(reassemblePrefixedText(redeliverySent, prefixB)).toBe(body);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("A-B-A drift never records mismatched B positions as A sent parts", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const body = "q".repeat(8100);
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body,
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let pass = 1;
			let context: string | undefined;
			let pass1Attempts = 0;
			let pass2Attempts = 0;
			const pass3Sent: string[] = [];
			dispose = startForwarder(queue, {
				senderContext: () => context,
				send: async (text) => {
					if (pass === 1) {
						pass1Attempts += 1;
						throw new Error("ETIMEDOUT");
					}
					if (pass === 2) {
						pass2Attempts += 1;
						if (!text.includes("(2/3)")) throw new Error("ETIMEDOUT");
						return;
					}
					pass3Sent.push(text);
				},
			});

			await waitFor(() => pass1Attempts === 4);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");
			expect(queue.telegramBubblesHash(delivered.value.messageId)).toMatch(/^[0-9a-f]{64}$/);
			pass = 2;
			context = BUDGET_CONTEXT;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => pass2Attempts === 5);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");

			pass = 3;
			context = undefined;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(pass3Sent).toHaveLength(2);
			expect(reassemblePrefixedText(pass3Sent, "[pij-osn81b]")).toBe(body);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("redelivery skips successful body and attachment notices and sends only unmarked text", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "body",
				attachments: [{ path: "/tmp/first.bin" }, { path: "/tmp/second.bin" }],
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let failSecond = true;
			let failedSecondAttempts = 0;
			const attempts: string[] = [];
			const sent: string[] = [];
			dispose = startForwarder(queue, {
				sizeOf: () => 1,
				send: async (text) => {
					attempts.push(text);
					if (failSecond && text.includes("/tmp/second.bin")) {
						failedSecondAttempts += 1;
						throw new Error("ETIMEDOUT");
					}
					sent.push(text);
				},
			});

			await waitFor(() => sent.length === 2 && failedSecondAttempts === 2);
			expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("claimed");
			expect(queue.telegramBubblesHash(delivered.value.messageId)).toMatch(/^[0-9a-f]{64}$/);

			failSecond = false;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");
			expect(sent).toEqual([
				"[pij-osn81b] body",
				"[pij-osn81b] [attachment /tmp/first.bin] (no media sender configured)",
				"[pij-osn81b] [attachment /tmp/second.bin] (no media sender configured)",
			]);
			expect(attempts.filter((text) => text.endsWith("body"))).toHaveLength(1);
			expect(attempts.filter((text) => text.includes("/tmp/first.bin"))).toHaveLength(1);
			expect(attempts.filter((text) => text.includes("/tmp/second.bin"))).toHaveLength(3);
			expect([...queue.telegramSentParts(delivered.value.messageId)]).toEqual([0, 1, 2]);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("acks receipt rows without sending them to Telegram", async () => {
		const home = tmpHome();
		const queue = new SqliteQueue(home);
		let dispose: (() => void) | undefined;
		try {
			queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "ack",
				kind: "receipt",
			});
			const send = vi.fn(async () => {});
			dispose = startForwarder(queue, { send });

			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(send).not.toHaveBeenCalled();
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("drains queued backlog, skips failed and acked rows, and sends nothing after restart", async () => {
		const home = tmpHome();
		const queue = new SqliteQueue(home);
		let firstDispose: (() => void) | undefined;
		let secondDispose: (() => void) | undefined;
		try {
			queue.deliver({ from: "pij-a", to: TELEGRAM_PEER_ID, body: "queued one" });
			queue.deliver({ from: "pij-b", to: TELEGRAM_PEER_ID, body: "queued two" });
			queue.deliver({ from: "pij-c", to: TELEGRAM_PEER_ID, body: "failed" });
			setSqliteDeliveryState(queue, 3, "failed");
			const acked = queue.deliver({
				from: "pij-d",
				to: TELEGRAM_PEER_ID,
				body: "already acked",
			});
			if (!acked.ok) throw new Error(acked.message);
			queue.claimUnread(TELEGRAM_PEER_ID, acked.value.messageId);

			const sent: string[] = [];
			firstDispose = startForwarder(queue, {
				send: async (text) => {
					sent.push(text);
				},
			});
			await waitFor(() => sent.length === 2);
			await waitFor(() =>
				queue
					.summary({ to: TELEGRAM_PEER_ID })
					.filter((row) => row.seq <= 2)
					.every((row) => row.state === "acked"),
			);
			firstDispose();

			secondDispose = startForwarder(queue, {
				send: async (text) => {
					sent.push(text);
				},
			});
			await new Promise((resolve) => setTimeout(resolve, 600));

			expect(sent).toEqual(["[pij-a] queued one", "[pij-b] queued two"]);
			expect(queue.summary({ to: TELEGRAM_PEER_ID }).map((row) => row.state)).toEqual([
				"acked",
				"acked",
				"failed",
				"acked",
			]);
		} finally {
			firstDispose?.();
			secondDispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("leaves failed text claimed and redelivers it after lease recovery", async () => {
		const home = tmpHome();
		let now = 1_000;
		const queue = new SqliteQueue(home, { now: () => now });
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "retry this",
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let fail = true;
			let attempts = 0;
			dispose = startForwarder(queue, {
				send: async () => {
					attempts += 1;
					if (fail) throw new Error("telegram unavailable");
				},
			});

			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "claimed");
			expect(queue.receipts(delivered.value.messageId).map((receipt) => receipt.state)).toEqual([
				"queued",
				"claimed",
			]);

			fail = false;
			now += 60_001;
			expect(queue.recoverStaleClaims()).toBe(1);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "acked");

			expect(attempts).toBe(2);
			expect(queue.receipts(delivered.value.messageId).map((receipt) => receipt.state)).toEqual([
				"queued",
				"claimed",
				"redelivered",
				"claimed",
				"acked",
			]);
			expect(
				queue.receipts(delivered.value.messageId).some((receipt) => receipt.state === "released"),
			).toBe(false);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("leaves a handled media-only failure claimed after echoing it to the sender", async () => {
		const home = tmpHome();
		const queue = new SqliteQueue(home);
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: "/tmp/missing.png" }],
			});
			if (!delivered.ok) throw new Error(delivered.message);
			const send = vi.fn(async () => {});
			const echoes: string[] = [];
			dispose = startForwarder(queue, {
				send,
				sizeOf: () => 1,
				sendMedia: async () => {
					throw new Error("Call to 'sendPhoto' failed! (400: Bad Request)");
				},
				echoFailure: (_to, body) => {
					echoes.push(body);
				},
			});

			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "claimed");

			expect(send).not.toHaveBeenCalled();
			expect(echoes).toHaveLength(1);
			expect(echoes[0]).toContain("media forward FAILED");
			expect(
				queue.receipts(delivered.value.messageId).some((receipt) => receipt.state === "acked"),
			).toBe(false);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("does not ack when a later text bubble is undelivered", async () => {
		const home = tmpHome();
		const queue = new SqliteQueue(home);
		let dispose: (() => void) | undefined;
		try {
			const delivered = queue.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "x".repeat(5_000),
			});
			if (!delivered.ok) throw new Error(delivered.message);
			let attempts = 0;
			dispose = startForwarder(queue, {
				send: async () => {
					attempts += 1;
					if (attempts === 2) throw new Error("second bubble failed");
				},
			});

			await waitFor(() => attempts === 2);
			await waitFor(() => queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state === "claimed");

			expect(
				queue.receipts(delivered.value.messageId).some((receipt) => receipt.state === "acked"),
			).toBe(false);
		} finally {
			dispose?.();
			queue.close();
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ─── inbound media relay (Phase 5 / AC-12·07) ───────────────────────────────────
describe("createBot inbound media", () => {
	it("saves an addressed photo to THAT session's attachments dir + delivers a path notice", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];
		const { bot, deliver, log } = makeBridge(sessions, [ALLOWED], undefined, download);
		await bot.handleUpdate(
			mediaUpdate({ kind: "photo", fromId: ALLOWED, caption: "osn look at this" }),
		);
		// downloaded into osn's OWN data dir, under attachments/, with the synthesised name
		expect(download).toHaveBeenCalledTimes(1);
		const dest = String(download.mock.calls[0]?.[1]);
		expect(dest.startsWith("/home/.pij/pij-osn81b/attachments/")).toBe(true);
		// the session is handed a TEXT notice carrying that exact path (no bytes on the wire)
		expect(deliver).toHaveBeenCalledTimes(1);
		const msg = deliver.mock.calls[0]?.[0] as { to: string; body: string; attachments?: unknown };
		expect(msg.to).toBe("pij-osn81b");
		expect(msg.body).toContain(dest);
		expect(msg.body).toContain("look at this"); // the caption-after-address
		expect(msg.attachments).toBeUndefined(); // pij wire stays text
		expect(log).toHaveBeenCalledWith(expect.stringContaining("media → pij-osn81b"));
	});

	it("routes captionless media to the last speaker, not the selected silent target", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot, deliver } = makeBridge(
			[desc({ id: "pij-agent-a" }), desc({ id: "pij-agent-b" })],
			[ALLOWED],
			undefined,
			download,
			undefined,
			undefined,
			undefined,
			() => "pij-agent-a" as SessionId,
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "agent-b" }));
		await bot.handleUpdate(mediaUpdate({ kind: "photo", fromId: ALLOWED }));
		expect(download).toHaveBeenCalledTimes(1);
		expect(String(download.mock.calls[0]?.[1])).toContain("/pij-agent-a/attachments/");
		expect((deliver.mock.calls[0]?.[0] as { to: string }).to).toBe("pij-agent-a");
	});

	it("with no target (no caption, no last speaker) replies guidance and downloads NOTHING", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot, deliver, replies } = makeBridge(
			[desc({ id: "pij-osn81b" })],
			[ALLOWED],
			undefined,
			download,
		);
		await bot.handleUpdate(mediaUpdate({ kind: "photo", fromId: ALLOWED }));
		// Mutation: drop the no-target guard and the downloader would fire here.
		expect(download).not.toHaveBeenCalled();
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()).toHaveLength(1);
		expect(replies()[0]).toMatch(/\/list/);
	});

	it("a missing recorded speaker replies honestly and downloads NOTHING", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot, deliver, replies } = makeBridge(
			[desc({ id: "pij-agent-b" })],
			[ALLOWED],
			undefined,
			download,
			undefined,
			undefined,
			undefined,
			() => "pij-agent-a" as SessionId,
		);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "agent-b" }));
		await bot.handleUpdate(mediaUpdate({ kind: "photo", fromId: ALLOWED }));
		expect(download).not.toHaveBeenCalled();
		expect(deliver).not.toHaveBeenCalled();
		expect(replies().at(-1)).toMatch(/pij-agent-a|live/i);
	});

	it("refuses an over-cap file: a 'too big' reply and NO download (AC-12 pre-check)", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot, deliver, replies } = makeBridge(
			[desc({ id: "pij-osn81b" })],
			[ALLOWED],
			undefined,
			download,
		);
		await bot.handleUpdate(
			mediaUpdate({
				kind: "document",
				fromId: ALLOWED,
				caption: "osn big one",
				fileSize: 21 * 1024 * 1024, // > 20 MB download cap
			}),
		);
		// Mutation: remove the withinDownloadLimit guard and the download fires.
		expect(download).not.toHaveBeenCalled();
		expect(deliver).not.toHaveBeenCalled();
		expect(replies().some((r) => /too big/i.test(r))).toBe(true);
	});

	it("drops non-allowlisted media before any download (allowlist-first, AC-07 parity)", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot, deliver, replies, log } = makeBridge(
			[desc({ id: "pij-osn81b" })],
			[ALLOWED],
			undefined,
			download,
		);
		await bot.handleUpdate(
			mediaUpdate({ kind: "photo", fromId: 999, caption: "osn sneak this in" }),
		);
		expect(download).not.toHaveBeenCalled();
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()).toEqual([]);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("drop"));
	});

	it("a hostile inbound filename cannot escape the attachments dir (sanitised join)", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot } = makeBridge([desc({ id: "pij-osn81b" })], [ALLOWED], undefined, download);
		await bot.handleUpdate(
			mediaUpdate({
				kind: "document",
				fromId: ALLOWED,
				caption: "osn here",
				fileName: "../../../../etc/passwd",
			}),
		);
		const dest = String(download.mock.calls[0]?.[1]);
		expect(dest).toBe("/home/.pij/pij-osn81b/attachments/passwd");
		expect(dest).not.toContain(".."); // traversal neutralised
	});
});

// ─── outbound media relay (Phase 5 / AC-11) ─────────────────────────────────────
describe("startForwarder media (outbound)", () => {
	const CHAT = 555;

	/** A forwarder wired EXACTLY like index.ts: an offline Bot.api transformer records the
	 *  real method (`sendPhoto`/`sendAnimation`/`sendDocument`/`sendMessage`) + payload, and
	 *  `sendMedia` builds a grammY `InputFile(path)` — so the kind→method mapping + InputFile
	 *  usage are asserted on the production path, never the network. */
	function mediaForwarder(
		home: string,
		sizeOf?: (path: string) => number,
		context = "pij/feature/repo-context",
	) {
		const channel = new FsChannel(home, { pollMs: 25 });
		const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
		const onSpoke = vi.fn();
		const senderContext = vi.fn(() => context);
		const bot = new Bot("test-token");
		bot.api.config.use((_prev, method, payload) => {
			calls.push({ method, payload: payload as Record<string, unknown> });
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		const dispose = startForwarder(channel, {
			send: (text) => bot.api.sendMessage(CHAT, text),
			sizeOf,
			onSpoke,
			senderContext,
			sendMedia: (kind, path, caption) => {
				const input = new InputFile(path);
				const opts = caption !== undefined ? { caption } : undefined;
				switch (kind) {
					case "photo":
						return bot.api.sendPhoto(CHAT, input, opts);
					case "animation":
						return bot.api.sendAnimation(CHAT, input, opts);
					case "document":
						return bot.api.sendDocument(CHAT, input, opts);
				}
			},
		});
		return { channel, calls, dispose, onSpoke, senderContext };
	}

	it("classifies png→sendPhoto, gif→sendAnimation, pdf→sendDocument (each captioned, in order), no blank text", async () => {
		const home = tmpHome();
		try {
			for (const n of ["chart.png", "loop.gif", "report.pdf"]) {
				writeFileSync(join(home, n), "x"); // real temp files for InputFile
			}
			const { channel, calls, dispose, onSpoke, senderContext } = mediaForwarder(home);
			// One attachment-only message (empty body) carrying all three, in order.
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
			await waitFor(() => calls.length >= 3);
			dispose();
			expect(calls.map((c) => c.method)).toEqual(["sendPhoto", "sendAnimation", "sendDocument"]);
			expect(calls[0]?.payload.caption).toBe("[pij-osn81b] [pij/feature/repo-context] a photo");
			expect(calls[1]?.payload.caption).toBe("[pij-osn81b] [pij/feature/repo-context] a gif");
			expect(calls[2]?.payload.caption).toBe("[pij-osn81b] [pij/feature/repo-context] a doc");
			expect(calls[0]?.payload.photo).toBeInstanceOf(InputFile);
			expect(calls[1]?.payload.animation).toBeInstanceOf(InputFile);
			expect(calls[2]?.payload.document).toBeInstanceOf(InputFile);
			expect(onSpoke).toHaveBeenCalledTimes(1);
			expect(onSpoke).toHaveBeenCalledWith("pij-osn81b");
			expect(senderContext).toHaveBeenCalledTimes(1);
			// attachment-only (empty body) → NO blank sendMessage. Mutation: chunk("") unconditionally
			// would add a sendMessage("") here.
			expect(calls.some((c) => c.method === "sendMessage")).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("normalizes exact canonical and sender-only media captions but preserves other senders", async () => {
		const home = tmpHome();
		try {
			for (const name of ["canonical.png", "tag.png", "other.png"]) {
				writeFileSync(join(home, name), "x");
			}
			const { channel, calls, dispose } = mediaForwarder(home, undefined, "pij");
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [
					{ path: join(home, "canonical.png"), caption: "[pij-osn81b] [pij] canonical" },
					{ path: join(home, "tag.png"), caption: "[pij-osn81b] sender-only" },
					{ path: join(home, "other.png"), caption: "[pij-other] keep me" },
				],
			});
			await waitFor(() => calls.length === 3);
			dispose();

			expect(calls.map((call) => call.payload.caption)).toEqual([
				"[pij-osn81b] [pij] canonical",
				"[pij-osn81b] [pij] sender-only",
				"[pij-osn81b] [pij] [pij-other] keep me",
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("an oversize photo falls back to a text notice — sendMessage, no sendPhoto, no throw", async () => {
		const home = tmpHome();
		try {
			writeFileSync(join(home, "huge.png"), "x");
			// Force the upload-cap check to see 11 MB without a real 11 MB file.
			const { channel, calls, dispose, onSpoke } = mediaForwarder(
				home,
				() => 11 * 1024 * 1024,
				"pij",
			);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: join(home, "huge.png"), caption: "too big" }],
			});
			await waitFor(() => calls.length >= 1);
			dispose();
			expect(calls.some((c) => c.method === "sendPhoto")).toBe(false);
			const notice = calls.find((c) => c.method === "sendMessage");
			expect(notice).toBeDefined();
			expect(String(notice?.payload.text)).toMatch(/exceeds/i);
			expect(String(notice?.payload.text)).toMatch(/^\[pij-osn81b\] \[pij\] /);
			expect(onSpoke).toHaveBeenCalledTimes(1);
			expect(onSpoke).toHaveBeenCalledWith("pij-osn81b");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("chunks an oversize notice against the prefixed 4096-character budget without loss", async () => {
		const home = tmpHome();
		try {
			const path = `/tmp/${"n".repeat(5000)}.png`;
			const { channel, calls, dispose } = mediaForwarder(
				home,
				() => 11 * 1024 * 1024,
				BUDGET_CONTEXT,
			);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path }],
			});
			await waitFor(() => calls.length >= 2);
			dispose();

			const textParts = calls
				.filter((call) => call.method === "sendMessage")
				.map((call) => String(call.payload.text));
			expect(textParts.length).toBeGreaterThan(1);
			for (const text of textParts) expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
			expect(reassemblePrefixedText(textParts, BUDGET_PREFIX)).toContain(path);
			expect(calls.some((call) => call.method === "sendPhoto")).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("forwards the text body first, then the media (ordering across text + media)", async () => {
		const home = tmpHome();
		try {
			writeFileSync(join(home, "shot.png"), "x");
			const { channel, calls, dispose, senderContext } = mediaForwarder(home);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "here is the screenshot",
				attachments: [{ path: join(home, "shot.png"), caption: "shot" }],
			});
			await waitFor(() => calls.length >= 2);
			dispose();
			expect(calls[0]?.method).toBe("sendMessage");
			expect(String(calls[0]?.payload.text)).toBe(
				"[pij-osn81b] [pij/feature/repo-context] here is the screenshot",
			);
			expect(calls[1]?.method).toBe("sendPhoto");
			expect(calls[1]?.payload.caption).toBe("[pij-osn81b] [pij/feature/repo-context] shot");
			expect(senderContext).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("prefixes the no-media-sender attachment fallback with repository context", async () => {
		const home = tmpHome();
		try {
			const path = join(home, "artifact.bin");
			writeFileSync(path, "x");
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				senderContext: () => "pij/feature/repo-context",
			});
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path }],
			});
			await waitFor(() => sent.length === 1);
			dispose();
			expect(sent[0]).toBe(
				`[pij-osn81b] [pij/feature/repo-context] [attachment ${path}] (no media sender configured)`,
			);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("chunks a long attachment fallback against the prefixed text budget without loss", async () => {
		const home = tmpHome();
		try {
			const path = `/tmp/${"f".repeat(5000)}.bin`;
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (text) => {
					sent.push(text);
				},
				sizeOf: () => 1,
				senderContext: () => BUDGET_CONTEXT,
			});
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path }],
			});
			await waitFor(() => sent.length >= 2);
			dispose();

			for (const text of sent) expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
			const reassembled = reassemblePrefixedText(sent, BUDGET_PREFIX);
			expect(reassembled).toBe(`[attachment ${path}] (no media sender configured)`);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("moves an overflowing media caption to lossless text bubbles before prefix-only media", async () => {
		expect(BUDGET_PREFIX).toHaveLength(96);
		const home = tmpHome();
		try {
			const path = join(home, "caption.png");
			writeFileSync(path, "x");
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: Array<{ text: string; replyTo?: number }> = [];
			const media: Array<{ caption?: string; replyTo?: number }> = [];
			const onSpoke = vi.fn();
			const senderContext = vi.fn(() => BUDGET_CONTEXT);
			const captionContent = "c".repeat(TELEGRAM_CAPTION_LIMIT - BUDGET_PREFIX.length);
			const caption = `${BUDGET_PREFIX} ${captionContent}`;
			const dispose = startForwarder(channel, {
				send: async (text, replyTo) => {
					sent.push({ text, replyTo });
				},
				sendMedia: async (_kind, _path, mediaCaption, replyTo) => {
					media.push({ caption: mediaCaption, replyTo });
				},
				takeReplyTo: () => 42,
				onSpoke,
				senderContext,
			});
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path, caption }],
			});
			await waitFor(() => media.length === 1);
			dispose();

			expect(sent.length).toBeGreaterThan(0);
			for (const part of sent) expect(part.text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
			expect(
				reassemblePrefixedText(
					sent.map((part) => part.text),
					BUDGET_PREFIX,
				),
			).toBe(captionContent);
			expect(sent[0]?.replyTo).toBe(42);
			for (const part of sent.slice(1)) expect(part.replyTo).toBeUndefined();
			expect(media).toEqual([{ caption: BUDGET_PREFIX, replyTo: undefined }]);
			expect(media[0]?.caption?.length).toBeLessThanOrEqual(TELEGRAM_CAPTION_LIMIT);
			expect(onSpoke).toHaveBeenCalledTimes(1);
			expect(senderContext).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

describe("startForwarder media failure handling (s113 W5)", () => {
	/** A forwarder whose sendMedia is scripted to fail: `failures` messages are thrown in
	 *  order, then sends succeed. Records every sendMedia attempt and every failure-echo. */
	function failingMediaForwarder(home: string, failures: readonly string[]) {
		const channel = new FsChannel(home, { pollMs: 25 });
		const attempts: string[] = [];
		const echoes: Array<{ to: string; body: string }> = [];
		const onSpoke = vi.fn();
		const remaining = [...failures];
		const dispose = startForwarder(channel, {
			send: async () => {},
			sizeOf: () => 1,
			onSpoke,
			echoFailure: (to, body) => {
				echoes.push({ to, body });
			},
			sendMedia: async (_kind, path) => {
				attempts.push(path);
				const failure = remaining.shift();
				if (failure !== undefined) throw new Error(failure);
			},
		});
		return { channel, attempts, echoes, onSpoke, dispose };
	}

	it("retries ONCE on a transient network failure and succeeds silently", async () => {
		const home = tmpHome();
		try {
			const { channel, attempts, echoes, onSpoke, dispose } = failingMediaForwarder(home, [
				"Network request for 'sendPhoto' failed!",
			]);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: "/tmp/chart.png" }],
			});
			await waitFor(() => attempts.length === 2);
			dispose();
			// Mutation: unbounded retry loop → a third attempt; no retry → only one.
			expect(attempts).toEqual(["/tmp/chart.png", "/tmp/chart.png"]);
			expect(echoes).toEqual([]); // recovered — the sender hears nothing
			expect(onSpoke).toHaveBeenCalledWith("pij-osn81b");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("echoes an honest failure to the SENDING session when the retry also fails", async () => {
		const home = tmpHome();
		try {
			const { channel, attempts, echoes, onSpoke, dispose } = failingMediaForwarder(home, [
				"read ECONNRESET",
				"read ECONNRESET",
			]);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: "/tmp/chart.png" }],
			});
			await waitFor(() => echoes.length === 1);
			dispose();
			expect(attempts).toHaveLength(2); // the ONE bounded retry, then give up
			expect(echoes[0]?.to).toBe("pij-osn81b"); // back to the sender, not the operator
			expect(echoes[0]?.body).toContain("media forward FAILED");
			expect(echoes[0]?.body).toContain("sendPhoto network error");
			expect(echoes[0]?.body).toContain("/tmp/chart.png");
			expect(onSpoke).not.toHaveBeenCalled(); // a failed upload is not speech
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("does NOT retry a deterministic rejection — one attempt, immediate echo", async () => {
		const home = tmpHome();
		try {
			const { channel, attempts, echoes, dispose } = failingMediaForwarder(home, [
				"Call to 'sendDocument' failed! (400: Bad Request)",
			]);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: "/tmp/report.pdf" }],
			});
			await waitFor(() => echoes.length === 1);
			dispose();
			// Mutation: retry everything → two attempts here.
			expect(attempts).toHaveLength(1);
			expect(echoes[0]?.body).toContain("sendDocument error");
			expect(echoes[0]?.body).toContain("/tmp/report.pdf");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("a final failure without an echoFailure seam still only logs (no crash), and later attachments still send", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			let first = true;
			const dispose = startForwarder(channel, {
				send: async () => {},
				sizeOf: () => 1,
				sendMedia: async (_kind, path) => {
					if (first) {
						first = false;
						throw new Error("Call to 'sendPhoto' failed! (400: Bad Request)");
					}
					sent.push(path);
				},
			});
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "",
				attachments: [{ path: "/tmp/bad.png" }, { path: "/tmp/good.png" }],
			});
			await waitFor(() => sent.length === 1);
			dispose();
			expect(sent).toEqual(["/tmp/good.png"]); // the failure never wedged the queue
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
