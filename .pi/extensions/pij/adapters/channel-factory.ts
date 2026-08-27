// pij-messaging — pick the durable message store (PoC, poc/comms-sqlite-socket).
//
// `PIJ_QUEUE_BACKEND=sqlite` → one SQLite WAL database (`<pijHome>/queue/pij.sqlite`).
// Anything else (default) → the per-message JSON files of `FsChannel`, so a
// fleet that has not opted in sees no behaviour change. Both implement the
// same `DeliveryPort & InboxPort` seams; every `pij send` / `pij inbox` /
// daemon drain goes through `openChannel`, never `new FsChannel` directly.

import type { DeliveryPort, InboxPort } from "../core/ports.js";
import { FsChannel } from "./channel.js";
import { SqliteQueue } from "./sqlite-queue.js";

export type MessageChannel = DeliveryPort & InboxPort;

export type QueueBackend = "fs" | "sqlite";

export function queueBackend(env: NodeJS.ProcessEnv = process.env): QueueBackend {
	return env.PIJ_QUEUE_BACKEND === "sqlite" ? "sqlite" : "fs";
}

export function openChannel(pijHome: string, env: NodeJS.ProcessEnv = process.env): MessageChannel {
	return queueBackend(env) === "sqlite" ? new SqliteQueue(pijHome) : new FsChannel(pijHome);
}
