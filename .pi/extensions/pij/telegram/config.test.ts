// pij-telegram — `loadConfig` scoped .env loader tests (TDD, Plan Finding 03 / AC-10).
// CRITICAL: loading the bridge's .env must NEVER mutate the global process.env —
// pij resolves PIJ_SESSION_ID / TMUX_PANE / PIJ_* from the real environment, and a
// leaking dotenv config() would corrupt that contract for spawned children.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

let dir: string;

function envFile(contents: string): string {
	const p = join(dir, ".env");
	writeFileSync(p, contents, "utf8");
	return p;
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pij-tg-cfg-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("loads a valid .env into a typed config", () => {
		const p = envFile(
			[
				"TELEGRAM_BOT_TOKEN=123:abc",
				"TELEGRAM_ALLOWED_USER_IDS=111,222,333",
				"TELEGRAM_CHAT_ID=-1009999",
			].join("\n"),
		);
		expect(loadConfig(p)).toEqual({
			token: "123:abc",
			allowedUserIds: [111, 222, 333],
			chatId: "-1009999",
		});
	});

	it("leaves chatId undefined when TELEGRAM_CHAT_ID is absent", () => {
		const p = envFile("TELEGRAM_BOT_TOKEN=t\nTELEGRAM_ALLOWED_USER_IDS=1");
		const cfg = loadConfig(p);
		expect(cfg.chatId).toBeUndefined();
		expect(cfg.token).toBe("t");
		expect(cfg.allowedUserIds).toEqual([1]);
	});

	it("tolerates whitespace and a trailing comma in the id list", () => {
		const p = envFile("TELEGRAM_BOT_TOKEN=t\nTELEGRAM_ALLOWED_USER_IDS= 1 , 2 ,3, ");
		expect(loadConfig(p).allowedUserIds).toEqual([1, 2, 3]);
	});

	it("defaults to an empty allowlist when the ids key is absent", () => {
		const p = envFile("TELEGRAM_BOT_TOKEN=t");
		expect(loadConfig(p).allowedUserIds).toEqual([]);
	});

	it("throws when the token is missing", () => {
		const p = envFile("TELEGRAM_ALLOWED_USER_IDS=1");
		expect(() => loadConfig(p)).toThrow(/token/i);
	});

	it("throws when the token is present but empty", () => {
		const p = envFile("TELEGRAM_BOT_TOKEN=\nTELEGRAM_ALLOWED_USER_IDS=1");
		expect(() => loadConfig(p)).toThrow(/token/i);
	});

	it("throws when an allowed id is non-numeric", () => {
		const p = envFile("TELEGRAM_BOT_TOKEN=t\nTELEGRAM_ALLOWED_USER_IDS=1,nope,3");
		expect(() => loadConfig(p)).toThrow(/id/i);
	});

	it("does NOT mutate global process.env (isolation, AC-10)", () => {
		const p = envFile(
			"TELEGRAM_BOT_TOKEN=secret\nTELEGRAM_ALLOWED_USER_IDS=1\nTELEGRAM_CHAT_ID=42",
		);
		// guarantee the keys are absent before the load
		delete process.env.TELEGRAM_BOT_TOKEN;
		delete process.env.TELEGRAM_ALLOWED_USER_IDS;
		delete process.env.TELEGRAM_CHAT_ID;
		const before = JSON.stringify(process.env);
		loadConfig(p);
		expect(JSON.stringify(process.env)).toBe(before);
		expect(process.env.TELEGRAM_BOT_TOKEN).toBeUndefined();
		expect(process.env.TELEGRAM_ALLOWED_USER_IDS).toBeUndefined();
		expect(process.env.TELEGRAM_CHAT_ID).toBeUndefined();
	});
});
