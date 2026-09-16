// pij-telegram — guided onboarding (`pij telegram init`) + the pure .env merge (Plan
// Phase 4; AC-01).
//
// `pij telegram init` walks the operator through BotFather, validates the pasted token
// via grammY `getMe` (and prints the bot @handle), then captures the operator's OWN
// Telegram id by long-polling for their first message — that id BECOMES the allowlist
// (Finding 02: the allowlist is the ONLY access control). Finally it merges exactly three
// keys — TELEGRAM_BOT_TOKEN / TELEGRAM_ALLOWED_USER_IDS / TELEGRAM_CHAT_ID — into the
// scoped `.env` that `loadConfig` reads (Finding 03), PRESERVING every other line (AC-01).
//
// `mergeEnv` is pure (text in, text out) — the one real unit of this phase. All I/O
// (prompt, getMe, capture, file read/write) is injected via `InitDeps`, so `runInit` is
// testable without a terminal or the network; the production wiring is at the bottom.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Api } from "grammy";

/** The exact three keys onboarding writes — must match what `loadConfig` reads. */
export interface TelegramEnvValues {
	readonly TELEGRAM_BOT_TOKEN: string;
	readonly TELEGRAM_ALLOWED_USER_IDS: string;
	readonly TELEGRAM_CHAT_ID: string;
}

/** The managed keys, in canonical append order. ONLY these are ever written by init. */
const MANAGED_KEYS = [
	"TELEGRAM_BOT_TOKEN",
	"TELEGRAM_ALLOWED_USER_IDS",
	"TELEGRAM_CHAT_ID",
] as const;

/** The `KEY` of a `KEY=value` line (ignoring leading blanks); null for comments, blanks,
 *  or `export KEY=` forms — which are left untouched as "unrelated" lines. */
function envKeyOf(line: string): string | null {
	return /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1] ?? null;
}

/**
 * Merge the three Telegram keys into an existing `.env` text WITHOUT clobbering anything
 * else (AC-01). A managed key already present is updated IN PLACE (its first line is
 * rewritten); any later duplicate of the same managed key is dropped so the parsed value
 * is unambiguously the new one (dotenv is last-wins). A managed key that is absent is
 * appended (after a blank separator when the file had content). Every other line —
 * comments, blanks, and unrelated keys — is preserved verbatim, in order.
 *
 * Pure: text in, text out. This is the one real unit test of Phase 4.
 *
 * @param existingText the current `.env` contents ("" if the file does not exist yet)
 * @param values       the three key values to set
 */
export function mergeEnv(existingText: string, values: TelegramEnvValues): string {
	const managed = new Set<string>(MANAGED_KEYS);
	const written = new Set<string>();
	const lines = existingText === "" ? [] : existingText.split("\n");
	const out: string[] = [];

	for (const line of lines) {
		const key = envKeyOf(line);
		if (key !== null && managed.has(key)) {
			if (written.has(key)) continue; // collapse a stale duplicate of a managed key
			written.add(key);
			out.push(`${key}=${values[key as keyof TelegramEnvValues]}`);
			continue;
		}
		out.push(line); // comment, blank, or unrelated key — preserved verbatim
	}

	const missing = MANAGED_KEYS.filter((k) => !written.has(k));
	if (missing.length > 0) {
		// Separate the appended block from any pre-existing body with one blank line.
		const last = out.at(-1);
		if (last !== undefined && last.trim() !== "") out.push("");
		for (const k of missing) out.push(`${k}=${values[k]}`);
	}

	// Exactly one trailing newline, regardless of how the input was terminated.
	return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** A bot identity from `getMe` — proof the token is valid. */
export interface BotIdentity {
	readonly username: string;
	readonly id: number;
}

/** The operator identity captured from their first inbound message (AC-01). */
export interface OperatorIdentity {
	readonly userId: number;
	readonly chatId: number;
}

/** I/O the onboarding flow needs, injected so `runInit` is testable without a TTY or the
 *  network. The production wiring (readline + grammY + fs) is built in `telegramInit`. */
export interface InitDeps {
	/** Ask the operator a question; resolve with their typed answer. */
	prompt: (question: string) => Promise<string>;
	/** Validate a token by calling Telegram `getMe`; reject if the token is invalid. */
	getMe: (token: string) => Promise<BotIdentity>;
	/** Long-poll until the operator's first message; resolve with their id + chat id. */
	captureFirstSender: (token: string) => Promise<OperatorIdentity>;
	/** Read the current `.env` text — "" if the file does not exist. */
	readEnv: (path: string) => string;
	/** Write the merged `.env` text (init creates parent dirs, mode 0600). */
	writeEnv: (path: string, text: string) => void;
	/** Progress logger (stdout in production). */
	log: (message: string) => void;
}

/** What `runInit` accomplished — returned so callers/tests can assert the outcome. */
export interface InitOutcome {
	readonly handle: string;
	readonly operator: OperatorIdentity;
	readonly envPath: string;
}

/**
 * Run the guided onboarding (T001/T002/T003): print the BotFather steps, read + validate
 * the token (`getMe`, prints the @handle), capture the operator's id from their first
 * message (that id IS the allowlist — Finding 02), then merge exactly the three keys into
 * `envPath` without clobbering existing keys (AC-01). Throws a clear error on an empty or
 * rejected token. All effects are injected, so this is fully testable.
 *
 * @param envPath the scoped `.env` to write (the same path `loadConfig` reads)
 * @param deps    injected prompt / getMe / capture / file I/O / log
 */
export async function runInit(envPath: string, deps: InitDeps): Promise<InitOutcome> {
	deps.log("pij telegram init — one-time setup\n");
	deps.log("1. In Telegram, open @BotFather → send /newbot → follow the prompts.");
	deps.log("2. Copy the HTTP API token BotFather gives you.\n");

	const token = (await deps.prompt("Paste your bot token: ")).trim();
	if (token === "") {
		throw new Error("no token entered — re-run when you have one from @BotFather");
	}

	let bot: BotIdentity;
	try {
		bot = await deps.getMe(token);
	} catch (e) {
		throw new Error(`Telegram rejected that token (getMe failed): ${(e as Error).message}`);
	}
	deps.log(`✓ token valid — your bot is @${bot.username}\n`);

	deps.log(`3. Open a DM with @${bot.username} and send it any message now.`);
	deps.log("   (the sender of that first message becomes the ONLY allowed operator)\n");
	const operator = await deps.captureFirstSender(token);
	deps.log(`✓ locked the allowlist to your id ${operator.userId} (chat ${operator.chatId})\n`);

	const merged = mergeEnv(deps.readEnv(envPath), {
		TELEGRAM_BOT_TOKEN: token,
		TELEGRAM_ALLOWED_USER_IDS: String(operator.userId),
		TELEGRAM_CHAT_ID: String(operator.chatId),
	});
	deps.writeEnv(envPath, merged);
	deps.log(`✓ wrote ${envPath} — only TELEGRAM_* keys set; any existing keys preserved.\n`);
	deps.log("Done. Start the bridge with:  pij telegram start");

	return { handle: bot.username, operator, envPath };
}

// ── production wiring (readline + grammY + fs) ────────────────────────────────

/** Read one line from stdin by accumulating raw data until a newline. Works for BOTH an
 *  interactive TTY (a typed/pasted line) and piped/redirected input (`echo tok | …`) — the
 *  readline-based version silently resolved "" for non-TTY stdin. EOF before a newline
 *  resolves whatever was buffered, trimmed (so a piped token without a trailing newline still
 *  reads, and `</dev/null` yields "" → the empty-token guard fails loudly). */
function promptLine(question: string): Promise<string> {
	process.stdout.write(question);
	const stdin = process.stdin;
	return new Promise((resolve) => {
		let buf = "";
		const finish = (value: string): void => {
			stdin.off("data", onData);
			stdin.off("end", onEnd);
			stdin.pause();
			resolve(value);
		};
		const onData = (chunk: string): void => {
			buf += chunk;
			const nl = buf.indexOf("\n");
			if (nl >= 0) finish(buf.slice(0, nl).replace(/\r$/, ""));
		};
		const onEnd = (): void => finish(buf.trim());
		stdin.setEncoding("utf8");
		stdin.on("data", onData);
		stdin.on("end", onEnd);
		stdin.resume();
	});
}

/** Validate a token: a successful `getMe` proves it; grammY throws on an invalid token. */
async function validateToken(token: string): Promise<BotIdentity> {
	const me = await new Api(token).getMe();
	return { username: me.username ?? me.first_name, id: me.id };
}

/** One-shot capture: long-poll `getUpdates` until a message with a sender arrives, then
 *  return that sender + chat. Advances the offset so an update is never re-seen. */
async function captureFirstSender(token: string): Promise<OperatorIdentity> {
	const api = new Api(token);
	let offset = 0;
	for (;;) {
		const updates = await api.getUpdates({ offset, timeout: 30, allowed_updates: ["message"] });
		for (const u of updates) {
			offset = u.update_id + 1;
			const userId = u.message?.from?.id;
			const chatId = u.message?.chat.id;
			if (userId !== undefined && chatId !== undefined) {
				return { userId, chatId };
			}
		}
	}
}

/**
 * Production `.env` writer: create the parent dirs and write the token file owner-only.
 * The create-time `mode` only applies when the file is NEW, so we ALSO `chmodSync` to force
 * `0600` on a pre-existing file (e.g. a `0644` left by an earlier run) — the token is a
 * secret and must never stay world/group-readable across a re-run. Exported so the perms
 * invariant is covered by a real-fs test; `telegramInit` injects it as `writeEnv`.
 */
export function writeEnvFile(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text, { mode: 0o600 }); // owner-only at creation …
	chmodSync(path, 0o600); // … and enforce it even if the file already existed
}

/**
 * Production entry for `pij telegram init`: build the real (readline + grammY + fs) deps,
 * run the flow, and surface any error as a non-zero exit. `envPath` is supplied by the
 * caller (`index.ts`) so init and `start` agree on the scoped `.env` location.
 */
export async function telegramInit(envPath: string): Promise<void> {
	try {
		await runInit(envPath, {
			// Token from $TELEGRAM_BOT_TOKEN if set (lets you skip the interactive prompt,
			// e.g. when stdin isn't a usable TTY); otherwise read one line from stdin.
			prompt: (q) => {
				const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
				return envToken ? Promise.resolve(envToken) : promptLine(q);
			},
			getMe: validateToken,
			captureFirstSender,
			readEnv: (p) => {
				try {
					return readFileSync(p, "utf8");
				} catch {
					return ""; // no file yet — merge into an empty .env
				}
			},
			writeEnv: writeEnvFile,
			log: (m) => process.stdout.write(`${m}\n`),
		});
	} catch (e) {
		process.stderr.write(`pij telegram init — ${(e as Error).message}\n`);
		process.exitCode = 1;
	}
}
