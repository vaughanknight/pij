// pij-messaging — serialized at-least-once consumption over SqliteQueue.
//
// Delivery state is the watermark: claim one queued row, await the handler, then
// ack it. A rejected handler leaves the row claimed for the daemon's lease sweep
// to redeliver or park; this adapter never changes the queue's write-side rules.

import type { SessionId } from "../core/types.js";
import type { ClaimedMessage, SqliteQueue } from "./sqlite-queue.js";

export interface QueueConsumerDeps {
	readonly queue: SqliteQueue;
	readonly self: SessionId;
	readonly onMessage: (message: ClaimedMessage) => Promise<void>;
	readonly pollMs?: number;
	readonly leaseMs?: number;
	readonly token?: string;
	readonly log?: (message: string) => void;
	readonly onScan?: (atMs: number) => void;
	readonly now?: () => number;
}

export function startQueueConsumer(deps: QueueConsumerDeps): () => void {
	const pollMs = deps.pollMs ?? 500;
	const leaseMs = deps.leaseMs ?? 60_000;
	const token = deps.token ?? `consumer-${process.pid}`;
	const log = deps.log ?? (() => {});
	const now = deps.now ?? Date.now;
	let disposed = false;
	let scanning = false;

	const scan = async (): Promise<void> => {
		if (disposed || scanning) return;
		scanning = true;
		try {
			deps.onScan?.(now());
			while (!disposed) {
				const row = deps.queue.claim(deps.self, { leaseMs, token });
				if (row === undefined) break;
				try {
					await deps.onMessage(row);
					const acked = deps.queue.claimUnread(deps.self, row.messageId, {
						messageId: row.messageId,
						readAt: new Date(now()).toISOString(),
						reader: deps.self,
					});
					if (!acked.ok) throw new Error(`${acked.code}: ${acked.message}`);
				} catch (error) {
					log(
						`queue consumer error (${row.messageId}, attempt ${row.attempt}): ${
							(error as Error).message
						}`,
					);
					break;
				}
			}
		} catch (error) {
			log(`queue consumer scan error: ${(error as Error).message}`);
		} finally {
			scanning = false;
		}
	};

	const timer = setInterval(() => {
		void scan();
	}, pollMs);
	timer.unref();
	void scan();

	return () => {
		if (disposed) return;
		disposed = true;
		clearInterval(timer);
	};
}
