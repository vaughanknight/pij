// pij-messaging — pick the durable message store (PoC, poc/comms-sqlite-socket).
//
// Backends (`PIJ_QUEUE_BACKEND`):
//   fs                 → legacy per-message JSON inbox files of `FsChannel`.
//   sqlite  (default)  → one SQLite WAL database (`<pijHome>/queue/pij.sqlite`).
//   dual               → SQLite is the source of truth AND every deliver also
//                        drops the `msg-<id>.json` file, so a peer still running
//                        the OLD fs-only CLI can read its inbox during a rollout.
//
// All implement `DeliveryPort & InboxPort`, so `pij send` / `pij inbox` / the
// daemon drain switch backends by construction — every consumer goes through
// `openChannel`, never `new FsChannel` directly.
//
// `pij queue migrate` imports legacy fs inboxes into SQLite for rollback-safe
// cutover; `PIJ_QUEUE_BACKEND=fs` remains the explicit compatibility escape hatch.

import type { DeliveryPort, InboxPort } from "../core/ports.js";
import type {
	DeliveredMessage,
	InboxClaim,
	InboxMark,
	InboxReadMarker,
	PijMessage,
	Result,
	SessionId,
} from "../core/types.js";
import { FsChannel } from "./channel.js";
import { SqliteQueue } from "./sqlite-queue.js";

export type MessageChannel = DeliveryPort & InboxPort;

export type QueueBackend = "fs" | "sqlite" | "dual";

export interface OpenChannelOptions {
	readonly fsWatchOpts?: ConstructorParameters<typeof FsChannel>[1];
}

/** The backend used when `PIJ_QUEUE_BACKEND` is unset. Now `sqlite` (Amendment
 *  4): the durable WAL queue is the default; set `PIJ_QUEUE_BACKEND=fs` to select
 *  the legacy per-message JSON inboxes, or `dual` to also mirror the fs files
 *  during a mixed-version rollout. The fs→sqlite migration runs on first daemon
 *  start (see `migrateFsInboxes`), so an existing `~/.pij` carries its unread
 *  mail over automatically. */
export const DEFAULT_BACKEND: QueueBackend = "sqlite";

export function queueBackend(env: NodeJS.ProcessEnv = process.env): QueueBackend {
	const v = env.PIJ_QUEUE_BACKEND;
	if (v === "sqlite" || v === "fs" || v === "dual") return v;
	return DEFAULT_BACKEND;
}

/** SQLite is the source of truth; every deliver ALSO writes the fs inbox file so
 *  an old fs-only reader still sees the message. Reads/claims/marks go to SQLite
 *  and best-effort mirror the fs read-marker. One release of this, then drop the
 *  fs writes and flip the default to `sqlite`. */
export class DualWriteChannel implements MessageChannel {
	constructor(
		readonly sqlite: SqliteQueue,
		private readonly fs: FsChannel,
	) {}

	deliver(message: PijMessage): Result<{ messageId: string }> {
		const primary = this.sqlite.deliver(message);
		if (!primary.ok) return primary;
		// Mirror into the fs inbox under the SAME id so an old reader dedupes with
		// the sqlite row. Best-effort: a mirror failure never fails the send.
		try {
			this.fs.deliverWithId(message, primary.value.messageId);
		} catch {
			/* fs mirror is advisory during the rollout */
		}
		return primary;
	}

	listUnread(id: SessionId): Result<readonly DeliveredMessage[]> {
		return this.sqlite.listUnread(id);
	}

	claimUnread(id: SessionId, messageId: string, marker?: InboxReadMarker): Result<InboxClaim> {
		const r = this.sqlite.claimUnread(id, messageId, marker);
		try {
			this.fs.markRead(id, messageId, marker);
		} catch {
			/* advisory */
		}
		return r;
	}

	markRead(id: SessionId, messageId: string, marker?: InboxReadMarker): Result<InboxMark> {
		const r = this.sqlite.markRead(id, messageId, marker);
		try {
			this.fs.markRead(id, messageId, marker);
		} catch {
			/* advisory */
		}
		return r;
	}
}

/** The SqliteQueue backing a channel, or undefined for the fs backend. Lets the
 *  daemon run first-start migration whichever durable backend is selected. */
export function sqliteOf(channel: MessageChannel): SqliteQueue | undefined {
	if (channel instanceof SqliteQueue) return channel;
	if (channel instanceof DualWriteChannel) return channel.sqlite;
	return undefined;
}

/** Import every unread fs inbox message (`<pijHome>/<id>/inbox/msg-*.json` with
 *  no read marker) into the SQLite queue, idempotently. Run on first daemon
 *  start so an existing `~/.pij` carries its queued mail across the fs→sqlite
 *  cutover; the fs files are left in place (rollback-safe). Returns per-seat
 *  and total import counts. Reads a directory list function so tests can drive
 *  it without a real fs tree; the daemon passes the real one. */
export function migrateFsInboxes(
	pijHome: string,
	sqlite: SqliteQueue,
	listSeatDirs: () => readonly string[],
): { readonly imported: number; readonly seats: number } {
	const fs = new FsChannel(pijHome);
	let imported = 0;
	let seats = 0;
	for (const id of listSeatDirs()) {
		const listed = fs.listUnread(id);
		if (!listed.ok || listed.value.length === 0) continue;
		const r = sqlite.importUnread(listed.value);
		if (r.imported > 0) {
			imported += r.imported;
			seats += 1;
		}
	}
	return { imported, seats };
}

export function openChannel(
	pijHome: string,
	env: NodeJS.ProcessEnv = process.env,
	options: OpenChannelOptions = {},
): MessageChannel {
	const backend = queueBackend(env);
	if (backend === "sqlite") return new SqliteQueue(pijHome);
	if (backend === "dual")
		return new DualWriteChannel(
			new SqliteQueue(pijHome),
			new FsChannel(pijHome, options.fsWatchOpts),
		);
	return new FsChannel(pijHome, options.fsWatchOpts);
}
