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
import { Bot, InputFile, type Update } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { FsChannel } from "../adapters/channel.js";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import {
	createBot,
	firstContactNote,
	framedBody,
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

	it("switches sticky (no delivery) when a matched address carries no text", () => {
		expect(routeMessage("osn", undefined, sessions)).toEqual({
			kind: "address",
			to: "pij-osn81b",
		});
	});

	it("falls back to the sticky target with the WHOLE text when unaddressed", () => {
		// "more" matches no session → the leading word is part of the message.
		expect(routeMessage("more context here", "pij-abc123", sessions)).toEqual({
			kind: "sticky",
			to: "pij-abc123",
			body: "more context here",
		});
	});

	it("replies guidance when there is no address and no sticky target", () => {
		expect(routeMessage("hello nobody", undefined, sessions)).toEqual({ kind: "guidance" });
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

// ─── bot wiring (fake updates) ─────────────────────────────────────────────────
let updateSeq = 0;

/** Build a fake Telegram text update. `command:true` adds the bot_command entity. */
function textUpdate(opts: {
	fromId: number;
	chatId?: number;
	text: string;
	command?: boolean;
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
		},
	} as unknown as Update;
}

/** Spin up a bot with spies + an offline api transformer that records replies. */
function makeBridge(
	sessions: SessionDescriptor[],
	allowed: number[] = [ALLOWED],
	readEvents?: (id: SessionId, last: number) => readonly PijEvent[],
	downloadMedia?: (ctx: unknown, dest: string) => Promise<void>,
) {
	const deliver = vi.fn();
	const log = vi.fn();
	const config: TelegramConfig = { token: "test-token", allowedUserIds: allowed };
	const bot = createBot(config, {
		listSessions: () => sessions,
		deliver,
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
}): Update {
	updateSeq += 1;
	const size = opts.fileSize ?? 1024;
	const base = {
		message_id: updateSeq,
		date: 0,
		chat: { id: opts.chatId ?? 1000, type: "private", first_name: "Op" },
		from: { id: opts.fromId, is_bot: false, first_name: "Op" },
		...(opts.caption !== undefined ? { caption: opts.caption } : {}),
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

	it("relays unaddressed follow-ups to the sticky target (AC-03)", async () => {
		const { bot, deliver } = makeBridge([desc({ id: "pij-osn81b" })]);
		// 1) address sets the sticky target …
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn hello" }));
		// 2) … a follow-up with no address goes to that same target, whole text
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "and one more thing" }));
		expect(deliver).toHaveBeenNthCalledWith(1, {
			from: "pij-telegram",
			to: "pij-osn81b",
			body: framedBody("hello", true), // first contact carries the note …
		});
		expect(deliver).toHaveBeenNthCalledWith(2, {
			from: "pij-telegram",
			to: "pij-osn81b",
			body: "and one more thing", // … the follow-up is the raw text, no repeat note
		});
	});

	it("addressing with no text switches the sticky target and confirms", async () => {
		const { bot, deliver, replies } = makeBridge([desc({ id: "pij-osn81b" })]);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn" }));
		expect(deliver).not.toHaveBeenCalled();
		expect(replies()[0]).toContain("pij-osn81b");
		// the switch sticks: the next bare message is relayed there (first real delivery →
		// first contact, so it carries the note)
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "now this" }));
		expect(deliver).toHaveBeenCalledWith({
			from: "pij-telegram",
			to: "pij-osn81b",
			body: framedBody("now this", true),
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

	it("replies guidance when unaddressed with no sticky target", async () => {
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
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "second message" }));

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
	it("tails the sticky target's last 10 events by default", async () => {
		const events = [ev({ seq: 7, type: "message", data: { body: "build is green" } })];
		const readEvents = vi.fn((_id: SessionId, _n: number) => events);
		const { bot, replies } = makeBridge([desc({ id: "pij-osn81b" })], [ALLOWED], readEvents);
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn" })); // set sticky
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

	it("replies guidance (not an empty tail) when no sticky target is set", async () => {
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
	it("forwards a >4096-char reply chunked AND untruncated (AC-05)", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (t) => {
					sent.push(t);
				},
			});
			const body = "x".repeat(9000); // forces ≥3 parts at the 4000 budget
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body });
			await waitFor(() => sent.length >= 3);
			dispose();
			for (const part of sent) expect(part.length).toBeLessThanOrEqual(4096);
			// strip the `(i/n) ` prefixes → the parts reassemble to the original, lossless.
			// strip the `[sender-id] ` tag then the `(i/n) ` chunk prefix to reassemble.
			const reassembled = sent
				.map((p) => p.replace(/^\[[^\]]+\] /, "").replace(/^\(\d+\/\d+\) /, ""))
				.join("");
			expect(reassembled).toBe(body);
			// every bubble is tagged with the sender id
			for (const p of sent) expect(p.startsWith("[pij-osn81b] ")).toBe(true);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("forwards a short reply as one unprefixed part", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (t) => {
					sent.push(t);
				},
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "all done ✅" });
			await waitFor(() => sent.length >= 1);
			dispose();
			expect(sent).toEqual(["[pij-osn81b] all done ✅"]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("records-but-never-forwards a receipt (Finding 08 parity)", async () => {
		const home = tmpHome();
		try {
			const channel = new FsChannel(home, { pollMs: 25 });
			const sent: string[] = [];
			const log: string[] = [];
			const dispose = startForwarder(channel, {
				send: async (t) => {
					sent.push(t);
				},
				log: (m) => log.push(m),
			});
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "ack", kind: "receipt" });
			channel.deliver({ from: "pij-osn81b", to: TELEGRAM_PEER_ID, body: "real reply" });
			await waitFor(() => sent.length >= 1);
			dispose();
			expect(sent).toEqual(["[pij-osn81b] real reply"]); // the receipt was skipped, the reply forwarded
			expect(log.some((l) => l.includes("skip receipt"))).toBe(true);
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

	it("routes a captionless photo to the sticky target (no caption ⇒ sticky)", async () => {
		const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
		const { bot, deliver } = makeBridge(
			[desc({ id: "pij-osn81b" })],
			[ALLOWED],
			undefined,
			download,
		);
		// set the sticky target with a text address first …
		await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "osn" }));
		// … then a photo with NO caption follows it there.
		await bot.handleUpdate(mediaUpdate({ kind: "photo", fromId: ALLOWED }));
		expect(download).toHaveBeenCalledTimes(1);
		expect(String(download.mock.calls[0]?.[1])).toContain("/pij-osn81b/attachments/");
		expect((deliver.mock.calls[0]?.[0] as { to: string }).to).toBe("pij-osn81b");
	});

	it("with no target (no caption, no sticky) replies guidance and downloads NOTHING", async () => {
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
	function mediaForwarder(home: string, sizeOf?: (path: string) => number) {
		const channel = new FsChannel(home, { pollMs: 25 });
		const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
		const bot = new Bot("test-token");
		bot.api.config.use((_prev, method, payload) => {
			calls.push({ method, payload: payload as Record<string, unknown> });
			return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
		});
		const dispose = startForwarder(channel, {
			send: (text) => bot.api.sendMessage(CHAT, text),
			sizeOf,
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
		return { channel, calls, dispose };
	}

	it("classifies png→sendPhoto, gif→sendAnimation, pdf→sendDocument (each captioned, in order), no blank text", async () => {
		const home = tmpHome();
		try {
			for (const n of ["chart.png", "loop.gif", "report.pdf"]) {
				writeFileSync(join(home, n), "x"); // real temp files for InputFile
			}
			const { channel, calls, dispose } = mediaForwarder(home);
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
			expect(calls[0]?.payload.caption).toBe("[pij-osn81b] a photo");
			expect(calls[1]?.payload.caption).toBe("[pij-osn81b] a gif");
			expect(calls[2]?.payload.caption).toBe("[pij-osn81b] a doc");
			expect(calls[0]?.payload.photo).toBeInstanceOf(InputFile);
			expect(calls[1]?.payload.animation).toBeInstanceOf(InputFile);
			expect(calls[2]?.payload.document).toBeInstanceOf(InputFile);
			// attachment-only (empty body) → NO blank sendMessage. Mutation: chunk("") unconditionally
			// would add a sendMessage("") here.
			expect(calls.some((c) => c.method === "sendMessage")).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("an oversize photo falls back to a text notice — sendMessage, no sendPhoto, no throw", async () => {
		const home = tmpHome();
		try {
			writeFileSync(join(home, "huge.png"), "x");
			// Force the upload-cap check to see 11 MB without a real 11 MB file.
			const { channel, calls, dispose } = mediaForwarder(home, () => 11 * 1024 * 1024);
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
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("forwards the text body first, then the media (ordering across text + media)", async () => {
		const home = tmpHome();
		try {
			writeFileSync(join(home, "shot.png"), "x");
			const { channel, calls, dispose } = mediaForwarder(home);
			channel.deliver({
				from: "pij-osn81b",
				to: TELEGRAM_PEER_ID,
				body: "here is the screenshot",
				attachments: [{ path: join(home, "shot.png"), caption: "shot" }],
			});
			await waitFor(() => calls.length >= 2);
			dispose();
			expect(calls[0]?.method).toBe("sendMessage");
			expect(String(calls[0]?.payload.text)).toBe("[pij-osn81b] here is the screenshot");
			expect(calls[1]?.method).toBe("sendPhoto");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
