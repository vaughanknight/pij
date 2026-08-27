// PoC day-2 item 6: backend selection + dual-write rollout behaviour.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./channel.js";
import { DualWriteChannel, openChannel, queueBackend } from "./channel-factory.js";
import { SqliteQueue } from "./sqlite-queue.js";

let home: string;
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-factory-"));
});
afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("queueBackend", () => {
	it("defaults to fs, honours fs/sqlite/dual, ignores garbage", () => {
		expect(queueBackend({})).toBe("fs");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "sqlite" })).toBe("sqlite");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "dual" })).toBe("dual");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "nonsense" })).toBe("fs");
	});

	it("openChannel returns the matching implementation", () => {
		expect(openChannel(home, {})).toBeInstanceOf(FsChannel);
		const s = openChannel(home, { PIJ_QUEUE_BACKEND: "sqlite" });
		expect(s).toBeInstanceOf(SqliteQueue);
		(s as SqliteQueue).close();
		const d = openChannel(home, { PIJ_QUEUE_BACKEND: "dual" });
		expect(d).toBeInstanceOf(DualWriteChannel);
	});
});

describe("DualWriteChannel", () => {
	it("writes both the sqlite row and the fs inbox file under one id, and reads from sqlite", () => {
		const sqlite = new SqliteQueue(home);
		const fs = new FsChannel(home);
		const dual = new DualWriteChannel(sqlite, fs);
		const sent = dual.deliver({ from: "pij-a", to: "pij-b", body: "3kb-ish" });
		expect(sent.ok).toBe(true);
		if (!sent.ok) throw new Error("send failed");
		// sqlite is the source of truth
		const viaSqlite = dual.listUnread("pij-b");
		expect(viaSqlite.ok && viaSqlite.value[0]?.body).toBe("3kb-ish");
		// an OLD fs-only reader sees the same message under the same id
		const fsFile = join(home, "pij-b", "inbox", `msg-${sent.value.messageId}.json`);
		expect(existsSync(fsFile)).toBe(true);
		const fsUnread = fs.listUnread("pij-b");
		expect(fsUnread.ok && fsUnread.value[0]?.messageId).toBe(sent.value.messageId);
		// acking via dual marks BOTH: the fs read-marker appears and sqlite is acked
		dual.markRead("pij-b", sent.value.messageId);
		expect(readdirSync(join(home, "pij-b", "inbox")).some((n) => n.startsWith("read-"))).toBe(true);
		expect(
			sqlite.listUnread("pij-b").ok &&
				(sqlite.listUnread("pij-b") as { value: unknown[] }).value.length,
		).toBe(0);
		sqlite.close();
	});
});
