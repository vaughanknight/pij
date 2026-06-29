// pij-telegram — scoped .env loader (Plan Finding 03; AC-10).
//
// CRITICAL: this reads the bridge's `.env` with dotenv's `parse()` over the file
// CONTENTS — never `dotenv.config()`, which mutates the global `process.env`. pij
// resolves PIJ_SESSION_ID / TMUX_PANE / PIJ_* from the real environment and leaks
// those to spawned children, so a global env mutation here would silently corrupt
// session resolution. We keep the parsed values entirely local. Fail closed: a
// missing/empty token or a non-numeric allowlist entry throws rather than booting a
// half-configured bridge.

import { readFileSync } from "node:fs";
import { parse } from "dotenv";

export interface TelegramConfig {
	/** BotFather token; required, non-empty. */
	readonly token: string;
	/** Telegram user ids permitted to drive the bridge (may be empty = fail-closed). */
	readonly allowedUserIds: number[];
	/** Operator chat id for outbound relay; optional. */
	readonly chatId?: string;
}

/** Parse a comma-separated integer list; reject any non-numeric entry. */
function parseUserIds(raw: string | undefined): number[] {
	if (raw === undefined) return [];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((s) => {
			if (!/^-?\d+$/.test(s)) {
				throw new Error(`telegram config: non-numeric allowed user id "${s}"`);
			}
			return Number(s);
		});
}

/**
 * Load the bridge config from a `.env` file WITHOUT touching the global environment.
 *
 * @param envPath path to the `.env` file
 * @returns the validated, typed config
 * @throws if the file is unreadable, the token is missing/empty, or an id is non-numeric
 */
export function loadConfig(envPath: string): TelegramConfig {
	// parse() over the file contents — NOT config() — keeps process.env untouched.
	const parsed = parse(readFileSync(envPath, "utf8"));

	const token = parsed.TELEGRAM_BOT_TOKEN?.trim() ?? "";
	if (token === "") {
		throw new Error("telegram config: TELEGRAM_BOT_TOKEN is missing or empty");
	}

	const allowedUserIds = parseUserIds(parsed.TELEGRAM_ALLOWED_USER_IDS);

	const chatId = parsed.TELEGRAM_CHAT_ID?.trim();
	return {
		token,
		allowedUserIds,
		...(chatId ? { chatId } : {}),
	};
}
