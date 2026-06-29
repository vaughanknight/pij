// pij-telegram — bot commands (Plan Phases 2/3; AC-06).
//
// `/list` answers "which sessions can I address?" — the newest few live sessions
// with their project folders. Ordering reuses `recencyKey` (match.ts) so the list
// and the address-matcher agree on what "newest" means. `/tail [N]` (Phase 3) peeks
// the last N events of the chat's STICKY target — the same target the text relay
// uses — so the operator can read a session's recent output without leaving Telegram.
// All formatters are pure (data in, text out) so they unit-test without a live bot;
// the `register*Command` functions are the thin grammY wiring.

import type { Bot } from "grammy";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import { recencyKey } from "./match.js";

/** Most sessions to show in a `/list` reply (AC-06: last 10). */
const MAX_LIST = 10;

/** `/tail` defaults to the last 10 events; clamp the operator's N to a sane ceiling
 *  so a giant `/tail 5000` can't blow past Telegram's 4096-char reply cap. */
const TAIL_DEFAULT = 10;
const TAIL_MAX = 50;

/**
 * Render a `/list` reply: the newest `MAX_LIST` sessions, each as `id — folder`.
 *
 * @param sessions a registry snapshot (order undefined — we sort it here)
 * @returns the reply text (a friendly note when there are no sessions)
 */
export function formatSessionList(sessions: readonly SessionDescriptor[]): string {
	if (sessions.length === 0) return "No live pij sessions. Spawn one, then /list again.";

	// Newest-first by the same recency rule the matcher uses; stable sort keeps
	// equal-recency ties in registry order. ISO-8601 strings sort chronologically.
	const ordered = [...sessions]
		.sort((a, b) => {
			const ka = recencyKey(a);
			const kb = recencyKey(b);
			return ka < kb ? 1 : ka > kb ? -1 : 0;
		})
		.slice(0, MAX_LIST);

	const header =
		sessions.length > MAX_LIST
			? `${ordered.length} of ${sessions.length} sessions (newest first):`
			: `${ordered.length} session${ordered.length === 1 ? "" : "s"}:`;
	const lines = ordered.map((s) => `• ${s.id} — ${s.folder}`);
	return [header, ...lines].join("\n");
}

/**
 * Wire `/list` onto a grammY bot. Kept separate from the bot factory so the bot's
 * command surface is composed from small, independently-testable pieces.
 *
 * @param bot          the grammY bot (allowlist middleware already registered first)
 * @param listSessions injected session source (FsRegistry.list in production)
 */
export function registerListCommand(
	bot: Bot,
	listSessions: () => readonly SessionDescriptor[],
): void {
	bot.command("list", async (ctx) => {
		await ctx.reply(formatSessionList(listSessions()));
	});
}

/**
 * Parse the `N` argument of `/tail [N]` (grammY hands us the post-command text).
 * Empty/garbage/≤0 falls back to the default; the value is clamped to `TAIL_MAX`.
 *
 * @param arg the raw text after `/tail` (e.g. `"20"`, `""`, `"  "`)
 * @returns a positive integer in `[1, TAIL_MAX]`
 */
export function parseTailCount(arg: string | undefined): number {
	const raw = (arg ?? "").trim();
	if (raw === "") return TAIL_DEFAULT;
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0) return TAIL_DEFAULT;
	return Math.min(n, TAIL_MAX);
}

/** One-line summary of an event's payload — mirrors `pij tail`'s renderer: prefer a
 *  tool `name`, then a message/receipt `body`, else the raw JSON, clipped for chat. */
function summarizeEvent(data: unknown): string {
	if (data && typeof data === "object") {
		const rec = data as Record<string, unknown>;
		const s =
			typeof rec.name === "string"
				? rec.name
				: typeof rec.body === "string"
					? rec.body
					: JSON.stringify(data);
		return clip(s);
	}
	return data === undefined ? "" : clip(String(data));
}

/** Clip a summary to keep a tailed line readable (and the whole reply under the cap). */
function clip(s: string): string {
	const flat = s.replace(/\s+/g, " ").trim();
	return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

/**
 * Render a `/tail` reply: one compact `seq · type — summary` line per event, oldest
 * to newest (the order `FsEventLog.read` returns). Pure — events in, text out.
 *
 * @param events the last-N event slice for the target session
 * @returns the reply text (a friendly note when the log is empty)
 */
export function formatTail(events: readonly PijEvent[]): string {
	if (events.length === 0) return "(no events yet for this session)";
	return events
		.map((e) => {
			const summary = summarizeEvent(e.data);
			return `${e.seq} · ${e.type}${summary ? ` — ${summary}` : ""}`;
		})
		.join("\n");
}

/** I/O `/tail` needs, injected so it reads the live sticky store + event log. */
export interface TailDeps {
	/** The chat's current sticky target, or `undefined` if none is set yet. */
	readonly getStickyTarget: (chatId: number) => SessionId | undefined;
	/** Read the last `n` events of a session — `FsEventLog.read({last:n})` in prod. */
	readonly readEvents: (id: SessionId, last: number) => readonly PijEvent[];
	/** Reply shown when the chat has no sticky target (same text as the relay's). */
	readonly guidance: string;
}

/**
 * Wire `/tail [N]` onto a grammY bot. Registered (like `/list`) before the text
 * relay so a `/tail` message is answered, not relayed. With no sticky target it
 * replies the SAME guidance the text handler gives (Plan T003).
 *
 * @param bot  the grammY bot (allowlist middleware already registered first)
 * @param deps the sticky-target accessor + event reader + guidance text
 */
export function registerTailCommand(bot: Bot, deps: TailDeps): void {
	bot.command("tail", async (ctx) => {
		const target = deps.getStickyTarget(ctx.chat.id);
		if (target === undefined) {
			await ctx.reply(deps.guidance);
			return;
		}
		const n = parseTailCount(ctx.match);
		await ctx.reply(formatTail(deps.readEvents(target, n)));
	});
}
