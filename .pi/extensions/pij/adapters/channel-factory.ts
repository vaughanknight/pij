// pij-messaging — pick the durable message store (PoC, poc/comms-sqlite-socket).
//
// Backends (`PIJ_QUEUE_BACKEND`):
//   fs      (default)  → per-message JSON inbox files of `FsChannel`.
//   sqlite             → one SQLite WAL database (`<pijHome>/queue/pij.sqlite`).
//   dual               → SQLite is the source of truth AND every deliver also
//                        drops the `msg-<id>.json` file, so a peer still running
//                        the OLD fs-only CLI can read its inbox during a rollout.
//
// All implement `DeliveryPort & InboxPort`, so `pij send` / `pij inbox` / the
// daemon drain switch backends by construction — every consumer goes through
// `openChannel`, never `new FsChannel` directly.
//
// The DEFAULT is one edit away from flipping to sqlite: change
// `DEFAULT_BACKEND` below. It stays `fs` until a fleet has migrated (see
// `pij queue migrate`, which imports the fs inboxes into SQLite).

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

/** The backend used when `PIJ_QUEUE_BACKEND` is unset. Flip to `"sqlite"` (or
 *  `"dual"` for a safe rollout) once a fleet has run `pij queue migrate`. */
export const DEFAULT_BACKEND: QueueBackend = "fs";

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
		private readonly sqlite: SqliteQueue,
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

export function openChannel(pijHome: string, env: NodeJS.ProcessEnv = process.env): MessageChannel {
	const backend = queueBackend(env);
	if (backend === "sqlite") return new SqliteQueue(pijHome);
	if (backend === "dual")
		return new DualWriteChannel(new SqliteQueue(pijHome), new FsChannel(pijHome));
	return new FsChannel(pijHome);
}
