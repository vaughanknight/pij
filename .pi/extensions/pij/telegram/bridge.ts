// pij-telegram — bridge engine (Plan Phases 2/3; Findings 02/05/06/07/08;
// AC-02·03·04·05·07·08).
//
// INBOUND (Phase 2): Telegram → pij session relay. `createBot(config, deps)` builds a
// grammY bot whose FIRST middleware is the allowlist (Finding 02: it is the ONLY access
// control — a non-allowlisted update must never reach routing, or any Telegram user
// could drive a session). Allowlisted text is routed by `routeMessage` (pure): an
// addressed `<tok> <text>` delivers the remainder to the matched session and makes it
// sticky; unaddressed text goes to the chat's sticky target; with no target we reply
// guidance. A SWIPE-REPLY on a forwarded bubble outranks both: the quoted bubble's
// leading `[pij-…]` sender tag names the target, and the WHOLE text is delivered there
// (the leading word is prose, never re-parsed as an address). `/list` + `/tail` are
// registered before the relay so commands aren't relayed.
//
// OUTBOUND (Phase 3): `startForwarder(channel, deps)` drains the bridge's OWN inbox
// (`pij-telegram`) via `FsChannel.watch` — exactly like the in-process pi receiver —
// and forwards each delivered reply to the operator chat, CHUNKED (Finding 07/AC-05).
// Receipts are recorded-not-forwarded (Finding 08 parity: an ack is not agent output).
// REPLY THREADING: each inbound delivery records the operator's message id per target
// (`onDelivered`); the forwarder consumes it (`takeReplyTo`) so a session's next
// outbound bubble arrives as a Telegram reply QUOTING the message it answers.
//
// All I/O is injected via `deps` so tests drive the bot with fake updates + a spy
// delivery and exercise the forwarder over a temp inbox — no live long-poll, no network.

import { statSync } from "node:fs";
import { join } from "node:path";
import { Bot, type Context } from "grammy";
import type { DeliveredMessage, FsChannel } from "../adapters/channel.js";
import type { PijEvent, PijMessage, SessionDescriptor, SessionId } from "../core/types.js";
import { chunk } from "./chunk.js";
import { registerListCommand, registerTailCommand } from "./commands.js";
import type { TelegramConfig } from "./config.js";
import { resolveTarget } from "./match.js";
import {
	buildInboundNotice,
	classifyMedia,
	type MediaKind,
	safeMediaName,
	withinDownloadLimit,
	withinUploadLimit,
} from "./media.js";

/** The bridge's fixed peer id: the `from` on relayed messages, the registry
 *  descriptor id, and the inbox the forwarder drains. One constant, three uses. */
export const TELEGRAM_PEER_ID: SessionId = "pij-telegram";

/** Reply shown when text arrives with no address and no sticky target yet. */
const GUIDANCE =
	"Address a session to start, e.g. `osn hello` — or send /list to see who's around.";

/**
 * One-time orientation PREPENDED to the first message relayed to a given session in this
 * process run, so the agent knows the conversation just handed off to a live human on
 * Telegram (typing on a phone) and should answer for that medium. Kept short on purpose —
 * we are telling the agent NOT to dump, so the note itself stays lean. Exported for testing.
 */
export function firstContactNote(): string {
	return (
		`[pij-telegram] You're now talking to a human over Telegram — they're on a phone, typing live. ` +
		`Keep replies short and conversational: lead with the answer, no long output, code dumps, or essays. ` +
		`They only see what you send via \`pij send ${TELEGRAM_PEER_ID} "…"\` (your normal terminal output is ` +
		`invisible to them); after you reply, stop and wait for their next message.`
	);
}

/**
 * Compose the body actually delivered to a session: on first contact prepend the orientation
 * note (the agent gets context), then the operator's text verbatim; on every later message
 * deliver the text unchanged. Pure — the framing rule is unit-testable in isolation.
 */
export function framedBody(text: string, firstContact: boolean): string {
	return firstContact ? `${firstContactNote()}\n\n${text}` : text;
}

/** I/O the bridge needs, injected so tests use mocks (no disk / network). */
export interface BridgeDeps {
	/** Live session snapshot — `FsRegistry.list` in production. */
	listSessions: () => readonly SessionDescriptor[];
	/** pid liveness probe for `/list`'s active filter — `OsPort.isAlive` in production
	 *  (same seam the CLI's `liveOf` uses). Defaults to "always alive" so callers that
	 *  only care about routing (not `/list`) don't need to wire a probe. */
	isAlive?: (pid: number) => boolean;
	/** Clock for `/list`'s active filter. Defaults to `Date.now`. */
	now?: () => number;
	/** Deliver a framed message to a session inbox — `FsChannel.deliver` in production. */
	deliver: (message: PijMessage) => void;
	/** Read the last `n` events of a session for `/tail` — `FsEventLog.read({last:n})`
	 *  in production. Optional: absent ⇒ `/tail` reports an empty log (Phase-2 callers
	 *  that never wired an event source still construct a valid bot). */
	readEvents?: (id: SessionId, last: number) => readonly PijEvent[];
	/** Download the media in this update to `dest` (Plan 026 Phase 5 inbound). Injected
	 *  so tests drive a fake — NO network. Production uses `@grammyjs/files`:
	 *  `ctx.getFile()` → `file.download(dest)` (the downloader owns the fs incl. mkdir).
	 *  Absent ⇒ inbound media is dropped (the bot still builds for text-only callers). */
	downloadMedia?: (ctx: Context, dest: string) => Promise<void>;
	/** Reply-threading seam: called after each inbound delivery with the operator's
	 *  Telegram message id, so the forwarder can quote it on that session's NEXT
	 *  outbound bubble (`startBridge` wires both ends to one shared map). */
	onDelivered?: (to: SessionId, telegramMessageId: number) => void;
	/** Debug logger for resolution/fallback/drop traces. Defaults to a no-op. */
	log?: (message: string) => void;
}

/** What `routeMessage` decided to do with one inbound text message. */
export type Routing =
	/** Addressed a matched session AND carried text → deliver it, make it sticky. */
	| { readonly kind: "deliver"; readonly to: SessionId; readonly body: string }
	/** Addressed a matched session with no text → just switch the sticky target. */
	| { readonly kind: "address"; readonly to: SessionId }
	/** No address but a sticky target exists → deliver the whole text there. */
	| { readonly kind: "sticky"; readonly to: SessionId; readonly body: string }
	/** No address and no sticky target → nothing to deliver, reply guidance. */
	| { readonly kind: "guidance" }
	/** Swipe-reply on a forwarded bubble whose tagged sender is no longer live →
	 *  tell the operator honestly; NEVER silently fall through to the sticky target. */
	| { readonly kind: "gone"; readonly id: SessionId };

/**
 * Parse the sender tag off a forwarded bubble — the inverse of `senderTag`. Every
 * bubble the forwarder sends leads with `[<pij-id>]` (text parts and media captions
 * alike), so a swipe-reply's quoted text identifies exactly which session was talking.
 * Returns null for bot-authored non-forwarded text (guidance, `/list` output,
 * "Now addressing…") and the operator's own quoted messages — those carry no tag.
 */
export function parseSenderTag(quoted: string): SessionId | null {
	const m = /^\[(pij-[a-z0-9][a-z0-9-]*)\]/.exec(quoted.trim());
	return m ? (m[1] as SessionId) : null;
}

/**
 * Decide where an inbound text goes. Pure — no I/O, no sticky mutation — so the
 * routing rules (Findings 05/06) are exhaustively unit-testable in isolation.
 *
 * Precedence: swipe-reply tag → address token → sticky → guidance. The reply gesture
 * is the operator's most explicit targeting act, so when `quoted` carries a sender
 * tag the WHOLE text goes to that session — the leading word is prose there, never
 * re-parsed as an address (`"5l is the answer"` in a reply to `[pij-abc]` must not
 * route to `pij-5l…`).
 *
 * @param text     the raw inbound message text
 * @param sticky   the chat's current sticky target, if any
 * @param sessions the live session snapshot to resolve an address against
 * @param quoted   the swipe-replied bubble's visible text/caption, when this is a reply
 */
export function routeMessage(
	text: string,
	sticky: SessionId | undefined,
	sessions: readonly SessionDescriptor[],
	quoted?: string,
): Routing {
	const trimmed = text.trim();
	if (quoted !== undefined) {
		const tagged = parseSenderTag(quoted);
		if (tagged !== null) {
			if (!sessions.some((s) => s.id === tagged)) return { kind: "gone", id: tagged };
			// An empty reply body (a media reply with no caption) just retargets, like a
			// bare address; the media handler still delivers the file to the target.
			return trimmed === ""
				? { kind: "address", to: tagged }
				: { kind: "deliver", to: tagged, body: trimmed };
		}
	}
	// First whitespace splits the address token from the remainder; keep the
	// remainder's internal formatting (only the inter-token gap is dropped).
	const gap = trimmed.search(/\s/);
	const token = gap === -1 ? trimmed : trimmed.slice(0, gap);
	const rest = gap === -1 ? "" : trimmed.slice(gap + 1).replace(/^\s+/, "");

	const match = resolveTarget(token, sessions);
	if (match) {
		return rest === ""
			? { kind: "address", to: match.id }
			: { kind: "deliver", to: match.id, body: rest };
	}
	// Unaddressed: fall back to the sticky target with the WHOLE text (the leading
	// word was not an address, so it is part of the message).
	if (sticky !== undefined) return { kind: "sticky", to: sticky, body: trimmed };
	return { kind: "guidance" };
}

/**
 * Resolve the inbound media's target session + the caption-after-address from a routing
 * decision. A media message is addressed by its caption exactly like text: `osn look` →
 * deliver to osn with rest "look"; a bare address → that session, no caption; no
 * caption → the sticky target with the whole caption; no target at all → `undefined`
 * (the caller replies guidance and downloads NOTHING). Pure — no I/O.
 */
function mediaTarget(
	decision: Routing,
): { readonly to: SessionId; readonly caption: string } | undefined {
	switch (decision.kind) {
		case "deliver":
			return { to: decision.to, caption: decision.body };
		case "sticky":
			return { to: decision.to, caption: decision.body };
		case "address":
			return { to: decision.to, caption: "" };
		case "guidance":
		case "gone":
			return undefined;
	}
}

/** The quoted bubble's visible text when this update is a swipe-reply: forwarded text
 *  parts carry the sender tag in `text`, forwarded media carry it in `caption`. */
function quotedOf(
	msg: { reply_to_message?: { text?: string; caption?: string } } | undefined,
): string | undefined {
	const q = msg?.reply_to_message;
	return q === undefined ? undefined : (q.text ?? q.caption);
}

/** Reply shown when a swipe-reply targets a session that has since gone away. */
function goneNotice(id: SessionId): string {
	return `${id} isn't live any more — /list to see who's around.`;
}

/** The fields the bridge needs from an inbound media update, normalised across the three
 *  Telegram media shapes (photo has no name/mime; animation/document carry their own). */
interface InboundMedia {
	readonly kind: MediaKind;
	/** Candidate filename BEFORE `safeMediaName` (photos get a synthesised name). */
	readonly fileName: string;
	readonly mime: string;
	/** Size in bytes if Telegram reported it, else 0 (cannot pre-check ⇒ treated as ok). */
	readonly size: number;
}

/**
 * Pull the media descriptor out of an inbound update. Priority photo → animation →
 * document (a GIF arrives as `animation`, sometimes with a back-compat `document` too —
 * animation wins). Returns `undefined` for a non-media message. Pure read of `ctx`.
 */
function extractInboundMedia(ctx: Context): InboundMedia | undefined {
	const msg = ctx.message;
	if (!msg) return undefined;
	if (msg.photo && msg.photo.length > 0) {
		// PhotoSize array is ascending by resolution — the last entry is the largest.
		const largest = msg.photo[msg.photo.length - 1];
		if (!largest) return undefined;
		return {
			kind: "photo",
			fileName: `photo_${largest.file_unique_id}.jpg`,
			mime: "image/jpeg",
			size: largest.file_size ?? 0,
		};
	}
	if (msg.animation) {
		const a = msg.animation;
		return {
			kind: "animation",
			fileName: a.file_name ?? `animation_${a.file_unique_id}.gif`,
			mime: a.mime_type ?? "image/gif",
			size: a.file_size ?? 0,
		};
	}
	if (msg.document) {
		const d = msg.document;
		return {
			kind: "document",
			fileName: d.file_name ?? `document_${d.file_unique_id}`,
			mime: d.mime_type ?? "application/octet-stream",
			size: d.file_size ?? 0,
		};
	}
	return undefined;
}

/**
 * Build the inbound Telegram bridge bot.
 *
 * Middleware order is load-bearing: allowlist FIRST (drops non-allowlisted updates
 * before any routing — Finding 02), then `/list` + `/tail`, then the text relay. The
 * bot is returned un-started; the foreground long-poll is driven from `index.ts`.
 *
 * @param config the loaded bridge config (token + allowlist)
 * @param deps   injected session list + delivery + event reader (+ optional debug log)
 */
export function createBot(config: TelegramConfig, deps: BridgeDeps): Bot {
	const bot = new Bot(config.token);
	const allow = new Set(config.allowedUserIds);
	// Sticky target per chat id; persists across messages within this process run.
	const sticky = new Map<number, SessionId>();
	// Sessions already handed a first-contact note this run — so each gets the Telegram
	// orientation exactly once, on the first message we relay to it (not on every message).
	const greeted = new Set<SessionId>();
	const log = deps.log ?? (() => {});

	// (1) Allowlist — the FIRST middleware and the only access control (Finding 02).
	// A non-allowlisted (or sender-less) update is dropped WITHOUT calling next(), so
	// nothing downstream — not /list, not /tail, not the relay — ever sees it (AC-07).
	bot.use(async (ctx, next) => {
		const fromId = ctx.from?.id;
		if (fromId === undefined || !allow.has(fromId)) {
			log(`drop: non-allowlisted from.id=${fromId ?? "unknown"}`);
			return;
		}
		await next();
	});

	// (2) Commands — registered before the text relay so a `/list` or `/tail` message
	// is answered by its command and never falls through to be relayed as an address.
	// `/tail` shares THIS closure's sticky map so it peeks the same target the relay
	// is talking to, and reuses the relay's GUIDANCE when no target is set (T003).
	registerListCommand(bot, deps.listSessions, deps.isAlive ?? (() => true), deps.now ?? Date.now);
	registerTailCommand(bot, {
		getStickyTarget: (chatId) => sticky.get(chatId),
		readEvents: deps.readEvents ?? (() => []),
		guidance: GUIDANCE,
	});

	// (3) Text relay — swipe-reply tag → address token → sticky fallback.
	bot.on("message:text", async (ctx) => {
		const chatId = ctx.chat.id;
		const decision = routeMessage(
			ctx.message.text,
			sticky.get(chatId),
			deps.listSessions(),
			quotedOf(ctx.message),
		);
		switch (decision.kind) {
			case "deliver": {
				const body = framedBody(decision.body, !greeted.has(decision.to));
				greeted.add(decision.to);
				deps.deliver({ from: TELEGRAM_PEER_ID, to: decision.to, body });
				sticky.set(chatId, decision.to);
				deps.onDelivered?.(decision.to, ctx.message.message_id);
				log(`→ ${decision.to}`);
				return;
			}
			case "address":
				sticky.set(chatId, decision.to);
				log(`address ${decision.to}`);
				await ctx.reply(`Now addressing ${decision.to}. Send a message and I'll relay it.`);
				return;
			case "sticky": {
				const body = framedBody(decision.body, !greeted.has(decision.to));
				greeted.add(decision.to);
				deps.deliver({ from: TELEGRAM_PEER_ID, to: decision.to, body });
				deps.onDelivered?.(decision.to, ctx.message.message_id);
				log(`sticky ${decision.to}`);
				return;
			}
			case "guidance":
				log("no target");
				await ctx.reply(GUIDANCE);
				return;
			case "gone":
				log(`reply target ${decision.id} gone`);
				await ctx.reply(goneNotice(decision.id));
				return;
		}
	});

	// (4) Inbound media relay (Plan 026 Phase 5) — registered AFTER the allowlist so a
	// non-allowlisted photo/gif/document is dropped before any download (Finding 02 / AC-07
	// parity for media). The caption addresses the target exactly like text; with no target
	// we reply guidance and download NOTHING. The pij wire stays text: the file is saved
	// with the target session (`<dataDir>/attachments/`) and the session is handed a text
	// notice carrying the path — never bytes (AC-12/13).
	bot.on(["message:photo", "message:animation", "message:document"], async (ctx) => {
		const chatId = ctx.chat?.id;
		if (chatId === undefined) return;
		const media = extractInboundMedia(ctx);
		if (media === undefined) return;

		const caption = ctx.message?.caption ?? "";
		const decision = routeMessage(
			caption,
			sticky.get(chatId),
			deps.listSessions(),
			quotedOf(ctx.message),
		);
		if (decision.kind === "gone") {
			log(`media: reply target ${decision.id} gone`);
			await ctx.reply(goneNotice(decision.id));
			return;
		}
		const target = mediaTarget(decision);
		if (target === undefined) {
			log("media: no target");
			await ctx.reply(GUIDANCE);
			return;
		}
		// Download-cap pre-check BEFORE any fetch: an oversize file is refused, never fetched.
		if (!withinDownloadLimit(media.size)) {
			log(`media: ${target.to} over download cap (${media.size} bytes)`);
			await ctx.reply("That file is too big to download (limit 20 MB) — nothing was fetched.");
			return;
		}
		const descriptor = deps.listSessions().find((d) => d.id === target.to);
		if (descriptor === undefined) {
			log(`media: target ${target.to} vanished before download`);
			return;
		}
		if (deps.downloadMedia === undefined) {
			log("media: no downloader wired — dropping");
			return;
		}
		// `safeMediaName` guarantees a single safe segment, so this join cannot escape the
		// session's own attachments dir even with a hostile inbound filename (AC-13).
		const dest = join(descriptor.dataDir, "attachments", safeMediaName(media.fileName));
		try {
			await deps.downloadMedia(ctx, dest);
		} catch (e) {
			log(`media: download failed (${target.to}): ${(e as Error).message}`);
			await ctx.reply("Couldn't save that file — please try again.");
			return;
		}
		deps.deliver({
			from: TELEGRAM_PEER_ID,
			to: target.to,
			body: buildInboundNotice({
				path: dest,
				caption: target.caption,
				mime: media.mime,
				size: media.size,
			}),
		});
		sticky.set(chatId, target.to);
		const mid = ctx.message?.message_id;
		if (mid !== undefined) deps.onDelivered?.(target.to, mid);
		log(`media → ${target.to} (${dest})`);
	});

	return bot;
}

/** I/O the outbound forwarder needs, injected so tests run over a temp inbox. */
export interface ForwarderDeps {
	/** Send one already-chunked part to the operator chat; resolves when sent. In
	 *  production this is `(text, replyTo) => bot.api.sendMessage(chatId, text, …)` —
	 *  a defined `replyToMessageId` makes the bubble a Telegram reply quoting that
	 *  operator message (reply threading). */
	send: (text: string, replyToMessageId?: number) => Promise<unknown>;
	/** Upload one media file to the operator chat by kind (Plan 026 Phase 5 outbound).
	 *  Injected so tests use a fake `Bot.api`; production maps to `bot.api.sendPhoto`/
	 *  `sendAnimation`/`sendDocument` with `InputFile(path)` + caption. Absent ⇒ a media
	 *  attachment falls back to a text notice (no media sender configured). */
	sendMedia?: (
		kind: MediaKind,
		path: string,
		caption?: string,
		replyToMessageId?: number,
	) => Promise<unknown>;
	/** Reply-threading seam (the outbound half of `BridgeDeps.onDelivered`): take —
	 *  consume, once — the operator message id this session's next reply answers, or
	 *  undefined when it speaks unprompted. Absent ⇒ no threading (plain bubbles). */
	takeReplyTo?: (from: SessionId) => number | undefined;
	/** File size in bytes for the upload-cap pre-check. Defaults to `statSync(path).size`
	 *  (only called for messages that actually carry attachments). */
	sizeOf?: (path: string) => number;
	/** Inbox `msg-*.json` names to treat as already-seen, so a (re)start forwards
	 *  only NEW replies, not the whole inbox history (the pi receiver's boot watermark). */
	seen?: Set<string>;
	/** Debug logger for forward/skip/error traces. Defaults to a no-op. */
	log?: (message: string) => void;
}

/** Text fallback when an outbound file exceeds Telegram's upload cap for its kind. The
 *  file is left on disk; we never throw (AC-11), just tell the operator it was too big. */
function oversizeNotice(path: string, bytes: number, kind: MediaKind): string {
	const mb = (bytes / (1024 * 1024)).toFixed(1);
	return `⚠️ Couldn't send ${path} — ${mb} MB exceeds Telegram's upload limit for a ${kind}. The file is on disk.`;
}

/**
 * Drain the bridge's OWN inbox (`pij-telegram`) and forward each delivered reply to
 * the operator chat, chunked (Finding 07 / AC-05). Mirrors the in-process pi receiver:
 * `FsChannel.watch` is the SOLE consumer of this peer's inbox, and the `harness:"pi"`
 * descriptor keeps the daemon from also draining it (AC-08) — so there is no double-send.
 *
 * Receipts are recorded-not-forwarded (Finding 08 parity: a delivery ack is not agent
 * output, and forwarding it would be operator noise). Sends are serialized through a
 * promise chain so a single reply's chunks — and successive replies — arrive in order.
 *
 * @param channel the fs delivery channel (its `pijHome` decides the watched inbox)
 * @param deps    the chat sender (+ optional boot watermark + debug log)
 * @returns the watch disposer — call it to stop forwarding (Phase-3 shutdown)
 */
/** Tag every forwarded Telegram message with the SENDER's pij id, so the operator always
 *  knows which session is talking — and how to address it back — even after their chat
 *  scrolls away or a client reset hides earlier context. Prepended to every outgoing text
 *  part and every media caption (so each Telegram bubble carries the id). Exported for tests. */
export function senderTag(from: SessionId): string {
	return `[${from}]`;
}

/** Compose one outgoing text bubble: the sender tag, then the body. */
function taggedText(from: SessionId, text: string): string {
	return `${senderTag(from)} ${text}`;
}

export function startForwarder(channel: FsChannel, deps: ForwarderDeps): () => void {
	const log = deps.log ?? (() => {});
	const sizeOf = deps.sizeOf ?? ((path: string) => statSync(path).size);
	// Serialize sends so chunk parts (and successive messages) keep arrival order.
	let queue: Promise<void> = Promise.resolve();

	const onMessage = (dm: DeliveredMessage): void => {
		if (dm.kind === "receipt") {
			log(`skip receipt ${dm.messageId}`);
			return;
		}
		const attachments = dm.attachments ?? [];
		// Skip a blank text send for an attachment-only message: chunk("") would emit one
		// empty part, so the operator would get a stray blank line before the media
		// (validation MEDIUM fix). Text-only messages are chunked exactly as before.
		const parts = attachments.length > 0 && dm.body.trim() === "" ? [] : chunk(dm.body);
		queue = queue.then(async () => {
			// Quote the operator message this reply presumably answers — taken ONCE, so
			// only the first bubble of this pij message threads; the rest follow it.
			let replyTo = deps.takeReplyTo?.(dm.from);
			for (const part of parts) {
				try {
					// Every bubble is prefixed with the sender's pij id (see senderTag).
					await deps.send(taggedText(dm.from, part), replyTo);
					replyTo = undefined;
				} catch (e) {
					log(`forward error (${dm.messageId}): ${(e as Error).message}`);
				}
			}
			// Outbound media: classify each file, enforce the per-kind upload cap (oversize →
			// text notice, NEVER a throw), and upload via the injected media sender — all in
			// THIS queue tick so a message's text + media + later messages stay in order (AC-11).
			for (const att of attachments) {
				try {
					const kind = classifyMedia(att.path);
					const bytes = sizeOf(att.path);
					if (!withinUploadLimit(bytes, kind)) {
						await deps.send(taggedText(dm.from, oversizeNotice(att.path, bytes, kind)), replyTo);
						replyTo = undefined;
						continue;
					}
					if (deps.sendMedia !== undefined) {
						// Tag the caption with the sender id too, so a media bubble is identifiable.
						const caption =
							att.caption !== undefined ? taggedText(dm.from, att.caption) : senderTag(dm.from);
						await deps.sendMedia(kind, att.path, caption, replyTo);
						replyTo = undefined;
					} else {
						await deps.send(
							taggedText(dm.from, `[attachment ${att.path}] (no media sender configured)`),
							replyTo,
						);
						replyTo = undefined;
					}
				} catch (e) {
					log(`media forward error (${dm.messageId}): ${(e as Error).message}`);
				}
			}
			log(
				`forwarded ${dm.from} → chat (${parts.length} text part${parts.length === 1 ? "" : "s"}` +
					`${attachments.length > 0 ? `, ${attachments.length} media` : ""})`,
			);
		});
	};

	return channel.watch(TELEGRAM_PEER_ID, onMessage, deps.seen);
}
