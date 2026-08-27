// PoC day-2 item 6: backend selection + dual-write rollout behaviour.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./channel.js";
import {
	DualWriteChannel,
	migrateFsInboxes,
	openChannel,
	queueBackend,
	sqliteOf,
} from "./channel-factory.js";
import { SqliteQueue } from "./sqlite-queue.js";

let home: string;
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-factory-"));
});
afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("queueBackend", () => {
	it("defaults to sqlite (Amendment 4), honours fs/sqlite/dual, ignores garbage", () => {
		expect(queueBackend({})).toBe("sqlite");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "sqlite" })).toBe("sqlite");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "fs" })).toBe("fs");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "dual" })).toBe("dual");
		expect(queueBackend({ PIJ_QUEUE_BACKEND: "nonsense" })).toBe("sqlite");
	});

	it("openChannel returns the matching implementation", () => {
		const dflt = openChannel(home, {});
		expect(dflt).toBeInstanceOf(SqliteQueue);
		(dflt as SqliteQueue).close();
		expect(openChannel(home, { PIJ_QUEUE_BACKEND: "fs" })).toBeInstanceOf(FsChannel);
		const s = openChannel(home, { PIJ_QUEUE_BACKEND: "sqlite" });
		expect(s).toBeInstanceOf(SqliteQueue);
		(s as SqliteQueue).close();
		const d = openChannel(home, { PIJ_QUEUE_BACKEND: "dual" });
		expect(d).toBeInstanceOf(DualWriteChannel);
	});
});

describe("migrateFsInboxes + sqliteOf", () => {
	it("imports unread fs inboxes into sqlite idempotently and finds the sqlite behind any backend", () => {
		const fs = new FsChannel(home);
		fs.deliver({ from: "pij-a", to: "pij-x", body: "carried one" });
		fs.deliver({ from: "pij-a", to: "pij-x", body: "carried two" });
		fs.deliver({ from: "pij-a", to: "pij-y", body: "carried y" });
		const sqlite = new SqliteQueue(home);
		const seatDirs = () => ["pij-x", "pij-y", "pij-empty"];
		const first = migrateFsInboxes(home, sqlite, seatDirs);
		expect(first).toEqual({ imported: 3, seats: 2 });
		const again = migrateFsInboxes(home, sqlite, seatDirs);
		expect(again).toEqual({ imported: 0, seats: 0 });
		const x = sqlite.listUnread("pij-x");
		expect(x.ok && x.value.map((m) => m.body)).toEqual(["carried one", "carried two"]);
		expect(sqliteOf(sqlite)).toBe(sqlite);
		expect(sqliteOf(new DualWriteChannel(sqlite, fs))).toBe(sqlite);
		expect(sqliteOf(fs)).toBeUndefined();
		sqlite.close();
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
