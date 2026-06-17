// pij-messaging — fs DeliveryPort adapter + receive-side watcher.
//
// Writer (`deliver`, satisfies DeliveryPort): drops a framed message into the
// recipient's inbox `<pijHome>/<to>/inbox/msg-<id>.json`, written via a dot-tmp
// file in the same dir then atomically `rename`d into place (no partial reads).
// Reader (`watch`, NOT a core port — the receive loop is wired in Phase 3):
// dir-`fs.watch`es `<pijHome>/<self>/inbox/`, debounces a burst, and dedupes by
// message id (finding 03 — the proven prototype path; `fs.watch` is flaky on
// file targets, reliable on directories).

import { mkdirSync, readdirSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ok, type PijMessage, type Result, type SessionId } from "../core/types.js";

/** A message as persisted in the inbox (the wire payload + its id). */
export interface DeliveredMessage extends PijMessage {
	readonly messageId: string;
}

const DEBOUNCE_MS = 20;
// fs.watch silently drops events under load (notably while a session is busy
// compacting), which can strand a delivered message until the next inbox event.
// A low-frequency poll guarantees a missed event still drains within POLL_MS.
const POLL_MS = 1500;

export class FsChannel {
	private seq = 0;

	constructor(
		private readonly pijHome: string,
		private readonly watchOpts: {
			pollMs?: number;
			/** Injectable for tests; defaults to node:fs watch. */
			watchFactory?: (dir: string, onEvent: () => void) => { close(): void };
		} = {},
	) {}

	private inboxDir(id: SessionId): string {
		return join(this.pijHome, id, "inbox");
	}

	/** DeliveryPort.deliver — atomic write into the recipient's inbox. */
	deliver(message: PijMessage): Result<{ messageId: string }> {
		const dir = this.inboxDir(message.to);
		mkdirSync(dir, { recursive: true });
		this.seq += 1;
		// id sorts time-major then seq-minor so a single sender's burst is ordered.
		const messageId = `${Date.now()}-${String(this.seq).padStart(6, "0")}-${process.pid}`;
		const payload: DeliveredMessage = { ...message, messageId };
		const finalPath = join(dir, `msg-${messageId}.json`);
		const tmpPath = join(dir, `.tmp-${messageId}.json`);
		writeFileSync(tmpPath, JSON.stringify(payload));
		renameSync(tmpPath, finalPath); // atomic; watcher only reacts to msg-*.json
		return ok({ messageId });
	}

	/**
	 * Subscribe to this session's inbox. Calls `onMessage` exactly once per
	 * message, in id order. Returns a disposer (close the watcher). Existing
	 * messages are drained on subscribe; pass a watermark via `seen` to skip
	 * history (Phase 3 seeds it at boot).
	 */
	watch(
		id: SessionId,
		onMessage: (message: DeliveredMessage) => void,
		seen: Set<string> = new Set(),
	): () => void {
		const dir = this.inboxDir(id);
		mkdirSync(dir, { recursive: true });
		let timer: ReturnType<typeof setTimeout> | undefined;

		const scan = (): void => {
			timer = undefined;
			let names: string[];
			try {
				names = readdirSync(dir);
			} catch {
				return;
			}
			const pending = names
				.filter((n) => n.startsWith("msg-") && n.endsWith(".json") && !seen.has(n))
				.sort();
			for (const name of pending) {
				seen.add(name);
				try {
					const payload = JSON.parse(readFileSync(join(dir, name), "utf8")) as DeliveredMessage;
					onMessage(payload);
				} catch {
					seen.delete(name); // partial write — retry on the next scan
				}
			}
		};

		const mkWatcher = this.watchOpts.watchFactory ?? ((d, cb) => watch(d, cb));
		const watcher = mkWatcher(dir, () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(scan, DEBOUNCE_MS);
		});
		// Fallback poll: covers fs.watch events dropped under load (e.g. while the
		// session is compacting) so a delivered message can never strand longer than
		// pollMs. unref so it never keeps the process alive.
		const poll = setInterval(scan, this.watchOpts.pollMs ?? POLL_MS);
		poll.unref?.();
		scan(); // drain anything already present
		return () => {
			if (timer) clearTimeout(timer);
			clearInterval(poll);
			watcher.close();
		};
	}
}
