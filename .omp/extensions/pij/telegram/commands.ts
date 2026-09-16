// pij-telegram — bot commands (Plan Phases 2/3; AC-06).
//
// `/list` answers "which sessions can I address?" — the newest few live sessions
// with their project folders. Ordering reuses `recencyKey` (match.ts) so the list
// and the address-matcher agree on what "newest" means. `/tail [N]` (Phase 3) peeks
// the last N events of the chat's selected target, so the operator can read the
// most recently addressed or routed session without changing bare-message fallback.
// All formatters are pure (data in, text out) so they unit-test without a live bot;
// the `register*Command` functions are the thin grammY wiring.

import type { Bot } from "grammy";
import { liveness, STALE_AFTER_MS } from "../core/state.js";
import type { PijEvent, SessionDescriptor, SessionId } from "../core/types.js";
import { recencyKey } from "./match.js";

/** Most sessions to show in a `/list` reply (AC-06: last 10). */
const MAX_LIST = 10;

/** `/tail` defaults to the last 10 events; clamp the operator's N to a sane ceiling
 *  so a giant `/tail 5000` can't blow past Telegram's 4096-char reply cap. */
const TAIL_DEFAULT = 10;
const TAIL_MAX = 50;

/**
 * Filter a registry snapshot down to LIVE sessions only, newest-first, capped.
 * Reuses the canonical `liveness` verdict (`core/state.ts`) — "active" for
 * `/list` means `verdict === "active"`, which drops both `dead` and `stale`
 * sessions (a stall is not something an operator should be addressing).
 *
 * @param sessions a registry snapshot (order undefined — we sort it here)
 * @param isAlive  pid liveness probe (`OsPort.isAlive` in production)
 * @param nowMs    current time, injected for testability
 * @param max      cap on the returned list (default `MAX_LIST`)
 */
export function selectActiveRecent(
	sessions: readonly SessionDescriptor[],
	isAlive: (pid: number) => boolean,
	nowMs: number,
	max: number = MAX_LIST,
): readonly SessionDescriptor[] {
	const active = sessions.filter((d) => {
		const ts = Date.parse(d.lastEventAt ?? d.startedAt);
		const ageMs = Number.isNaN(ts) ? null : nowMs - ts;
		const verdict = liveness(isAlive(d.pid), ageMs, STALE_AFTER_MS, d.state === "working");
		return verdict === "active";
	});
	// Newest-first by the same recency rule the matcher uses; stable sort keeps
	// equal-recency ties in registry order. ISO-8601 strings sort chronologically.
	return [...active]
		.sort((a, b) => {
			const ka = recencyKey(a);
			const kb = recencyKey(b);
			return ka < kb ? 1 : ka > kb ? -1 : 0;
		})
		.slice(0, max);
}

/**
 * Render a `/list` reply from an ALREADY active-filtered, sorted, capped list
 * (see {@link selectActiveRecent}) — this function only renders.
 *
 * @param sessions the selected sessions to show, newest-first
 * @param total    the active count BEFORE capping (defaults to `sessions.length`,
 *                 i.e. "this is everything") — pass the pre-cap total to surface
 *                 the AC-4 "N of TOTAL" header when more were active than shown
 * @returns the reply text (a friendly note when there are no active sessions)
 */
export function formatSessionList(
	sessions: readonly SessionDescriptor[],
	total: number = sessions.length,
): string {
	if (sessions.length === 0) return "No active pij sessions. Spawn one, then /list again.";

	const header =
		total > sessions.length
			? `${sessions.length} of ${total} active (newest first):`
			: `${sessions.length} active session${sessions.length === 1 ? "" : "s"}:`;
	const lines = sessions.map((s) => `• ${s.id} — ${s.folder}`);
	return [header, ...lines].join("\n");
}

/**
 * Wire `/list` onto a grammY bot. Kept separate from the bot factory so the bot's
 * command surface is composed from small, independently-testable pieces.
 *
 * @param bot          the grammY bot (allowlist middleware already registered first)
 * @param listSessions injected session source (FsRegistry.list in production)
 * @param isAlive      pid liveness probe, threaded into {@link selectActiveRecent}
 * @param now          clock, threaded into {@link selectActiveRecent}
 */
export function registerListCommand(
	bot: Bot,
	listSessions: () => readonly SessionDescriptor[],
	isAlive: (pid: number) => boolean,
	now: () => number,
): void {
	bot.command("list", async (ctx) => {
		const activeAll = selectActiveRecent(listSessions(), isAlive, now(), Number.POSITIVE_INFINITY);
		await ctx.reply(formatSessionList(activeAll.slice(0, MAX_LIST), activeAll.length));
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

/** I/O `/tail` needs, injected so it reads the selected-target store + event log. */
export interface TailDeps {
	/** The chat's current selected target, or `undefined` if none is set yet. */
	readonly getSelectedTarget: (chatId: number) => SessionId | undefined;
	/** Read the last `n` events of a session — `FsEventLog.read({last:n})` in prod. */
	readonly readEvents: (id: SessionId, last: number) => readonly PijEvent[];
	/** Reply shown when the chat has no selected target (same text as the relay's). */
	readonly guidance: string;
}

/**
 * Wire `/tail [N]` onto a grammY bot. Registered (like `/list`) before the text
 * relay so a `/tail` message is answered, not relayed. With no selected target it
 * replies the SAME guidance the text handler gives (Plan T003).
 *
 * @param bot  the grammY bot (allowlist middleware already registered first)
 * @param deps the selected-target accessor + event reader + guidance text
 */
export function registerTailCommand(bot: Bot, deps: TailDeps): void {
	bot.command("tail", async (ctx) => {
		const target = deps.getSelectedTarget(ctx.chat.id);
		if (target === undefined) {
			await ctx.reply(deps.guidance);
			return;
		}
		const n = parseTailCount(ctx.match);
		await ctx.reply(formatTail(deps.readEvents(target, n)));
	});
}
