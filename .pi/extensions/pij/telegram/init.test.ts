// pij-telegram — onboarding tests (Plan Phase 4; AC-01).
//
// The pure `.env` merge is the one real unit of this phase, so it carries the weight:
// every case round-trips the merged text back through dotenv's `parse` (what `loadConfig`
// actually uses) to prove the EFFECTIVE values — not just the surface text — are right.
// A thin `runInit` test then pins the flow wiring: token → getMe → capture → merge → write,
// with the captured id landing in the allowlist, and a rejected token surfacing clearly.

import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import {
	type BotIdentity,
	type InitDeps,
	mergeEnv,
	type OperatorIdentity,
	runInit,
	writeEnvFile,
} from "./init.js";

const VALUES = {
	TELEGRAM_BOT_TOKEN: "123456:AAH-token",
	TELEGRAM_ALLOWED_USER_IDS: "777",
	TELEGRAM_CHAT_ID: "777",
};

describe("mergeEnv (AC-01 — set the 3 keys, clobber nothing else)", () => {
	it("appends all three keys to an empty file", () => {
		const out = mergeEnv("", VALUES);
		expect(parse(out)).toEqual(VALUES);
	});

	it("preserves a pre-existing UNRELATED key untouched", () => {
		const out = mergeEnv("OPENAI_API_KEY=sk-keep-me\n", VALUES);
		// the unrelated key survives verbatim …
		expect(out).toContain("OPENAI_API_KEY=sk-keep-me");
		// … and the parsed result is the unrelated key PLUS our three (nothing dropped).
		expect(parse(out)).toEqual({ OPENAI_API_KEY: "sk-keep-me", ...VALUES });
	});

	it("updates an existing telegram key IN PLACE (same position, new value)", () => {
		const before = ["# header", "TELEGRAM_BOT_TOKEN=OLD", "OTHER=1"].join("\n");
		const out = mergeEnv(before, VALUES);
		const lines = out.trimEnd().split("\n");
		// position is preserved: the token line is still line 2, not appended at the end.
		expect(lines[0]).toBe("# header");
		expect(lines[1]).toBe("TELEGRAM_BOT_TOKEN=123456:AAH-token");
		expect(lines[2]).toBe("OTHER=1");
		expect(parse(out).TELEGRAM_BOT_TOKEN).toBe("123456:AAH-token");
		expect(parse(out).OTHER).toBe("1");
	});

	it("appends only the MISSING managed keys, updates the present one", () => {
		// token present (update in place), the other two absent (appended).
		const out = mergeEnv("TELEGRAM_BOT_TOKEN=OLD\nKEEP=yes\n", VALUES);
		expect(parse(out)).toEqual({ KEEP: "yes", ...VALUES });
		// exactly ONE token line — the update did not also append a duplicate.
		expect(out.match(/^TELEGRAM_BOT_TOKEN=/gm)?.length).toBe(1);
	});

	it("collapses a stale duplicate of a managed key so the EFFECTIVE value is ours", () => {
		// dotenv is last-wins; a leftover second copy must not shadow our new value.
		const before = "TELEGRAM_CHAT_ID=OLD-A\nFOO=bar\nTELEGRAM_CHAT_ID=OLD-B\n";
		const out = mergeEnv(before, VALUES);
		expect(out.match(/^TELEGRAM_CHAT_ID=/gm)?.length).toBe(1); // de-duplicated
		expect(parse(out).TELEGRAM_CHAT_ID).toBe("777"); // and it is OUR value
		expect(parse(out).FOO).toBe("bar"); // unrelated key between them survives
	});

	it("does not require a trailing newline on the input, emits exactly one", () => {
		const out = mergeEnv("KEEP=1", VALUES); // no trailing newline
		expect(out.endsWith("\n")).toBe(true);
		expect(out.endsWith("\n\n")).toBe(false);
		expect(parse(out)).toEqual({ KEEP: "1", ...VALUES });
	});
});

// ── runInit flow wiring (token → getMe → capture → merge → write) ─────────────

interface FakeIo {
	written: { path: string; text: string }[];
	logs: string[];
}

function fakeDeps(over: Partial<InitDeps> & { existing?: string } = {}): {
	io: FakeIo;
	deps: InitDeps;
} {
	const io: FakeIo = { written: [], logs: [] };
	const deps: InitDeps = {
		prompt: async () => "123456:AAH-token",
		getMe: async (): Promise<BotIdentity> => ({ username: "pij_bot", id: 42 }),
		captureFirstSender: async (): Promise<OperatorIdentity> => ({ userId: 555, chatId: 999 }),
		readEnv: () => over.existing ?? "",
		writeEnv: (path, text) => io.written.push({ path, text }),
		log: (m) => io.logs.push(m),
		...over,
	};
	return { io, deps };
}

describe("runInit (AC-01 — captured id becomes the allowlist; no clobber)", () => {
	it("writes the 3 keys with the captured id as the allowlist, preserving prior keys", async () => {
		const { io, deps } = fakeDeps({ existing: "OPENAI_API_KEY=sk-keep\n" });
		const outcome = await runInit("/tmp/scoped.env", deps);

		expect(io.written).toHaveLength(1);
		expect(io.written[0].path).toBe("/tmp/scoped.env");
		const env = parse(io.written[0].text);
		expect(env).toEqual({
			OPENAI_API_KEY: "sk-keep", // existing key survived
			TELEGRAM_BOT_TOKEN: "123456:AAH-token",
			TELEGRAM_ALLOWED_USER_IDS: "555", // ← the captured user id, not anything else
			TELEGRAM_CHAT_ID: "999",
		});
		expect(outcome).toEqual({
			handle: "pij_bot",
			operator: { userId: 555, chatId: 999 },
			envPath: "/tmp/scoped.env",
		});
		expect(io.logs.join("\n")).toMatch(/@pij_bot/); // printed the bot handle (T001)
	});

	it("rejects an invalid token with a clear error and writes nothing", async () => {
		const { io, deps } = fakeDeps({
			getMe: async () => {
				throw new Error("401: Unauthorized");
			},
		});
		await expect(runInit("/tmp/scoped.env", deps)).rejects.toThrow(/getMe failed.*401/);
		expect(io.written).toEqual([]); // never wrote a half-configured .env
	});

	it("rejects an empty token before calling getMe or writing", async () => {
		let getMeCalls = 0;
		const { io, deps } = fakeDeps({
			prompt: async () => "   ",
			getMe: async () => {
				getMeCalls += 1;
				return { username: "x", id: 1 };
			},
		});
		await expect(runInit("/tmp/scoped.env", deps)).rejects.toThrow(/no token/);
		expect(getMeCalls).toBe(0);
		expect(io.written).toEqual([]);
	});
});

// ── writeEnvFile perms (HIGH — token file forced owner-only, even pre-existing) ─

describe("writeEnvFile (the token file is 0600 even when it already existed loose)", () => {
	it("forces a pre-existing 0644 env file down to 0600", () => {
		// Real fs in an OS temp dir — never the repo. A bare writeFileSync({mode:0600})
		// only sets perms on CREATE, so a leftover 0644 file would stay group/world-readable;
		// this proves writeEnvFile chmods it back to owner-only. FAILS without the chmod.
		const dir = mkdtempSync(join(tmpdir(), "pij-tg-perms-"));
		const path = join(dir, "telegram.env");
		try {
			writeFileSync(path, "TELEGRAM_BOT_TOKEN=old\n");
			chmodSync(path, 0o644);
			expect(statSync(path).mode & 0o777).toBe(0o644); // precondition: loose perms

			writeEnvFile(path, "TELEGRAM_BOT_TOKEN=new\n");

			expect(statSync(path).mode & 0o777).toBe(0o600); // enforced owner-only
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
