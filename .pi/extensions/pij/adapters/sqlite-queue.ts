// pij-messaging — SQLite (WAL) durable peer-message queue (PoC, poc/comms-sqlite-socket).
//
// Replaces the per-message `msg-<id>.json` + `read-<id>.json` files of
// `FsChannel` with ONE database: `<pijHome>/queue/pij.sqlite`. Implements the
// same `DeliveryPort` + `InboxPort` seams so `pij send`, `pij inbox` and the
// daemon drain switch backends by construction, and adds the delivery state
// machine the review recommended (reports/pij-comms-review-2026-08-27.md §7):
//
//   queued ─claim→ claimed ─settle(injected)→ injected ─ack (claimUnread/markRead)→ acked
//      ▲                │ settle(queued) / lease expiry / restart            │
//      └────────────────┴──────────── redelivered (attempt+1) ──→ parked (attempt ≥ maxAttempts)
//
// `messages` is immutable after insert; `deliveries` carries the mutable state;
// `receipts` is append-only (what `pij tail` will render); `cursors` holds the
// per-recipient pointer watermark for the notify-line path.
//
// Durability: WAL + synchronous=NORMAL — a process crash never loses a committed
// row; only an OS crash can lose the last few ms. Every state change is one
// transaction. Ids are minted by the SENDER process (`<ms>-<seq>-<pid>`, the
// same shape FsChannel used) and are UNIQUE, so a retried deliver() is a no-op.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DeliveryPort, InboxPort } from "../core/ports.js";
import {
	type DeliveredMessage,
	err,
	type InboxClaim,
	type InboxMark,
	type InboxReadMarker,
	ok,
	type PijMessage,
	type Result,
	type SessionId,
} from "../core/types.js";

export type DeliveryState = "queued" | "claimed" | "injected" | "acked" | "parked";

export interface ClaimedMessage extends DeliveredMessage {
	readonly seq: number;
	readonly attempt: number;
}

export interface QueueSummaryRow {
	readonly seq: number;
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly bytes: number;
	readonly createdAt: number;
	readonly state: DeliveryState;
	readonly attempt: number;
	readonly leaseUntil: number | null;
	readonly trail: ReadonlyArray<{
		state: string;
		attempt: number;
		at: number;
		detail: string | null;
	}>;
}

export interface QueueReceipt {
	readonly seq: number;
	readonly state: string;
	readonly attempt: number;
	readonly at: number;
	readonly detail: string | null;
}

export interface SqliteQueueOpts {
	readonly dbPath?: string;
	readonly now?: () => number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  seq         INTEGER PRIMARY KEY,
  id          TEXT NOT NULL UNIQUE,
  to_id       TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  kind        TEXT,
  command     TEXT,
  body        TEXT NOT NULL,
  attachments TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_to_seq ON messages(to_id, seq);
CREATE TABLE IF NOT EXISTS deliveries (
  seq         INTEGER PRIMARY KEY REFERENCES messages(seq),
  to_id       TEXT NOT NULL,
  state       TEXT NOT NULL,
  attempt     INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT,
  lease_until INTEGER,
  updated_at  INTEGER NOT NULL,
  last_error  TEXT
);
CREATE INDEX IF NOT EXISTS deliveries_ready ON deliveries(to_id, state, seq);
CREATE TABLE IF NOT EXISTS receipts (
  id      INTEGER PRIMARY KEY,
  seq     INTEGER NOT NULL REFERENCES messages(seq),
  state   TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS receipts_seq ON receipts(seq, id);
CREATE TABLE IF NOT EXISTS cursors (
  to_id        TEXT PRIMARY KEY,
  notified_seq INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
`;

interface MessageRow {
	seq: number;
	id: string;
	to_id: string;
	from_id: string;
	kind: string | null;
	command: string | null;
	body: string;
	attachments: string | null;
	state?: string;
	attempt?: number;
}

function rowToMessage(row: MessageRow): DeliveredMessage {
	const message: {
		messageId: string;
		from: SessionId;
		to: SessionId;
		body: string;
		command?: string;
		kind?: "receipt";
		attachments?: ReadonlyArray<{ readonly path: string; readonly caption?: string }>;
	} = { messageId: row.id, from: row.from_id, to: row.to_id, body: row.body };
	if (row.command !== null) message.command = row.command;
	if (row.kind === "receipt") message.kind = "receipt";
	if (row.attachments !== null) {
		try {
			message.attachments = JSON.parse(row.attachments);
		} catch {
			/* a malformed attachments column degrades to "no attachments" — the body is the contract */
		}
	}
	return message;
}

export class SqliteQueue implements DeliveryPort, InboxPort {
	readonly dbPath: string;
	private readonly db: DatabaseSync;
	private readonly now: () => number;
	private seq = 0;

	constructor(pijHome: string, opts: SqliteQueueOpts = {}) {
		this.dbPath = opts.dbPath ?? join(pijHome, "queue", "pij.sqlite");
		this.now = opts.now ?? Date.now;
		mkdirSync(join(this.dbPath, ".."), { recursive: true });
		this.db = new DatabaseSync(this.dbPath, { timeout: 5_000 });
		this.db.exec("PRAGMA journal_mode=WAL");
		this.db.exec("PRAGMA synchronous=NORMAL");
		this.db.exec("PRAGMA foreign_keys=ON");
		this.db.exec("PRAGMA busy_timeout=5000");
		this.db.exec(SCHEMA);
	}

	close(): void {
		this.db.close();
	}

	journalMode(): string {
		const row = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
		return row.journal_mode;
	}

	private tx<T>(fn: () => T): T {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const out = fn();
			this.db.exec("COMMIT");
			return out;
		} catch (e) {
			this.db.exec("ROLLBACK");
			throw e;
		}
	}

	private receipt(seq: number, state: string, attempt: number, detail?: string): void {
		this.db
			.prepare("INSERT INTO receipts(seq, state, attempt, at, detail) VALUES (?, ?, ?, ?, ?)")
			.run(seq, state, attempt, this.now(), detail ?? null);
	}

	// ─── DeliveryPort ─────────────────────────────────────────────────────────

	/** Insert one message (idempotent on `messageId`). Returns the id either way. */
	deliver(
		message: PijMessage,
		opts: { readonly messageId?: string } = {},
	): Result<{ messageId: string }> {
		this.seq += 1;
		const messageId =
			opts.messageId ?? `${this.now()}-${String(this.seq).padStart(6, "0")}-${process.pid}`;
		try {
			this.tx(() => {
				const existing = this.db.prepare("SELECT seq FROM messages WHERE id = ?").get(messageId) as
					| { seq: number }
					| undefined;
				if (existing) return;
				const at = this.now();
				const inserted = this.db
					.prepare(
						"INSERT INTO messages(id, to_id, from_id, kind, command, body, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.run(
						messageId,
						message.to,
						message.from,
						message.kind ?? null,
						message.command ?? null,
						message.body,
						message.attachments ? JSON.stringify(message.attachments) : null,
						at,
					);
				const seq = Number(inserted.lastInsertRowid);
				this.db
					.prepare(
						"INSERT INTO deliveries(seq, to_id, state, attempt, updated_at) VALUES (?, ?, 'queued', 0, ?)",
					)
					.run(seq, message.to, at);
				this.receipt(seq, "queued", 0);
			});
		} catch (error) {
			return err("E-NOREG", `cannot enqueue message for ${message.to}: ${String(error)}`);
		}
		return ok({ messageId });
	}

	// ─── InboxPort ────────────────────────────────────────────────────────────

	/** Every message the recipient has not yet acked, oldest first. Includes rows
	 *  the daemon has claimed/injected (a pointer told the recipient to pull). */
	listUnread(id: SessionId): Result<readonly DeliveredMessage[]> {
		try {
			const rows = this.db
				.prepare(
					`SELECT m.*, d.state, d.attempt FROM messages m JOIN deliveries d ON d.seq = m.seq
					 WHERE m.to_id = ? AND d.state IN ('queued','claimed','injected') ORDER BY m.seq`,
				)
				.all(id) as unknown as MessageRow[];
			return ok(rows.map(rowToMessage));
		} catch (error) {
			return err("E-NOREG", `cannot list queue for ${id}: ${String(error)}`);
		}
	}

	/** Daemon-side view: rows the daemon may act on (`queued`), with their seq,
	 *  oldest first. Rows already `claimed`/`injected` (a pointer is out, or a
	 *  socket send is in flight) are NOT returned, so a tick never re-announces
	 *  a message until its lease expires (`recoverStaleClaims`). */
	listQueued(id: SessionId): ReadonlyArray<DeliveredMessage & { readonly seq: number }> {
		const rows = this.db
			.prepare(
				`SELECT m.*, d.state, d.attempt FROM messages m JOIN deliveries d ON d.seq = m.seq
				 WHERE m.to_id = ? AND d.state = 'queued' ORDER BY m.seq`,
			)
			.all(id) as unknown as MessageRow[];
		return rows.map((r) => ({ ...rowToMessage(r), seq: r.seq }));
	}

	/** Seq of a message id (undefined if unknown). */
	seqOf(messageId: string): number | undefined {
		const row = this.db.prepare("SELECT seq FROM messages WHERE id = ?").get(messageId) as
			| { seq: number }
			| undefined;
		return row?.seq;
	}

	/** Ack: the recipient has read the body. Exactly-once by row state. */
	claimUnread(
		id: SessionId,
		messageId: string,
		marker: InboxReadMarker = { messageId },
	): Result<InboxClaim> {
		try {
			return this.tx(() => {
				const row = this.db
					.prepare(
						`SELECT m.*, d.state, d.attempt FROM messages m JOIN deliveries d ON d.seq = m.seq
						 WHERE m.to_id = ? AND m.id = ?`,
					)
					.get(id, messageId) as unknown as MessageRow | undefined;
				if (!row) return err("E-NOREG", `no message ${messageId} for ${id}`);
				if (row.state === "acked") return ok({ kind: "already-read", messageId } as InboxClaim);
				this.ack(row.seq, row.attempt ?? 0, marker);
				return ok({ kind: "claimed", message: rowToMessage(row) } as InboxClaim);
			});
		} catch (error) {
			return err("E-NOREG", `cannot claim ${messageId} for ${id}: ${String(error)}`);
		}
	}

	markRead(
		id: SessionId,
		messageId: string,
		marker: InboxReadMarker = { messageId },
	): Result<InboxMark> {
		const claimed = this.claimUnread(id, messageId, marker);
		if (!claimed.ok) return claimed;
		if (claimed.value.kind === "already-read") return ok({ kind: "already-read", messageId });
		return ok({ kind: "marked", marker });
	}

	private ack(seq: number, attempt: number, marker: InboxReadMarker): void {
		this.db
			.prepare(
				"UPDATE deliveries SET state='acked', claim_token=NULL, lease_until=NULL, updated_at=? WHERE seq=?",
			)
			.run(this.now(), seq);
		this.receipt(seq, "acked", attempt, marker.reader ? `reader=${marker.reader}` : undefined);
	}

	// ─── daemon-side state machine ────────────────────────────────────────────

	/** Claim the oldest `queued` message for `to` under a lease. Undefined when
	 *  nothing is queued. One transaction; safe across processes. */
	claim(
		to: SessionId,
		opts: { readonly leaseMs: number; readonly token: string; readonly maxAttempts?: number },
	): ClaimedMessage | undefined {
		return this.tx(() => {
			const row = this.db
				.prepare(
					`SELECT m.*, d.state, d.attempt FROM messages m JOIN deliveries d ON d.seq = m.seq
					 WHERE m.to_id = ? AND d.state = 'queued' ORDER BY m.seq LIMIT 1`,
				)
				.get(to) as unknown as MessageRow | undefined;
			if (!row) return undefined;
			const attempt = (row.attempt ?? 0) + 1;
			const at = this.now();
			this.db
				.prepare(
					"UPDATE deliveries SET state='claimed', attempt=?, claim_token=?, lease_until=?, updated_at=? WHERE seq=? AND state='queued'",
				)
				.run(attempt, opts.token, at + opts.leaseMs, at, row.seq);
			this.receipt(row.seq, "claimed", attempt, opts.token);
			return { ...rowToMessage(row), seq: row.seq, attempt };
		});
	}

	/** After an injection attempt: `injected` (typed/sent; wait for the recipient's
	 *  ack under a fresh lease) or `queued` (release: held/failed, retry later). */
	settle(
		seq: number,
		state: "injected" | "queued",
		opts: { readonly leaseMs?: number; readonly detail?: string } = {},
	): void {
		this.tx(() => {
			const row = this.db.prepare("SELECT attempt, state FROM deliveries WHERE seq = ?").get(seq) as
				| { attempt: number; state: string }
				| undefined;
			if (!row || row.state === "acked") return;
			const at = this.now();
			const lease = state === "injected" && opts.leaseMs ? at + opts.leaseMs : null;
			this.db
				.prepare(
					"UPDATE deliveries SET state=?, lease_until=?, claim_token=CASE WHEN ?='queued' THEN NULL ELSE claim_token END, updated_at=?, last_error=? WHERE seq=?",
				)
				.run(state, lease, state, at, opts.detail ?? null, seq);
			this.receipt(seq, state === "queued" ? "released" : "injected", row.attempt, opts.detail);
		});
	}

	/** Daemon start: a claim without a live daemon is meaningless. */
	resetClaimsOnStart(): number {
		return this.tx(() => {
			const rows = this.db
				.prepare("SELECT seq, attempt FROM deliveries WHERE state = 'claimed'")
				.all() as unknown as { seq: number; attempt: number }[];
			for (const r of rows) {
				this.db
					.prepare(
						"UPDATE deliveries SET state='queued', claim_token=NULL, lease_until=NULL, updated_at=? WHERE seq=?",
					)
					.run(this.now(), r.seq);
				this.receipt(r.seq, "redelivered", r.attempt, "daemon-restart");
			}
			return rows.length;
		});
	}

	/** Lease sweep: claimed/injected rows past their lease go back to `queued`
	 *  (or `parked` past `maxAttempts`). Returns how many were touched. */
	recoverStaleClaims(opts: { readonly maxAttempts?: number } = {}): number {
		const max = opts.maxAttempts ?? 6;
		return this.tx(() => {
			const at = this.now();
			const rows = this.db
				.prepare(
					"SELECT seq, attempt FROM deliveries WHERE state IN ('claimed','injected') AND lease_until IS NOT NULL AND lease_until < ?",
				)
				.all(at) as unknown as { seq: number; attempt: number }[];
			for (const r of rows) {
				const parked = r.attempt >= max;
				this.db
					.prepare(
						"UPDATE deliveries SET state=?, claim_token=NULL, lease_until=NULL, updated_at=? WHERE seq=?",
					)
					.run(parked ? "parked" : "queued", at, r.seq);
				this.receipt(r.seq, parked ? "parked" : "redelivered", r.attempt, "lease-expired");
			}
			return rows.length;
		});
	}

	receipts(messageId: string): QueueReceipt[] {
		return this.db
			.prepare(
				`SELECT r.seq, r.state, r.attempt, r.at, r.detail FROM receipts r JOIN messages m ON m.seq = r.seq
				 WHERE m.id = ? ORDER BY r.id`,
			)
			.all(messageId) as unknown as QueueReceipt[];
	}

	stats(to: SessionId): Record<DeliveryState, number> {
		const out: Record<DeliveryState, number> = {
			queued: 0,
			claimed: 0,
			injected: 0,
			acked: 0,
			parked: 0,
		};
		const rows = this.db
			.prepare("SELECT state, COUNT(*) AS n FROM deliveries WHERE to_id = ? GROUP BY state")
			.all(to) as unknown as { state: DeliveryState; n: number }[];
		for (const r of rows) out[r.state] = r.n;
		return out;
	}

	/** Pointer watermark for the notify-line path: seqs above this have not been
	 *  announced to the recipient's pane yet. */
	notifiedSeq(to: SessionId): number {
		const row = this.db.prepare("SELECT notified_seq FROM cursors WHERE to_id = ?").get(to) as
			| { notified_seq: number }
			| undefined;
		return row?.notified_seq ?? 0;
	}

	setNotifiedSeq(to: SessionId, seq: number): void {
		this.db
			.prepare(
				"INSERT INTO cursors(to_id, notified_seq, updated_at) VALUES (?, ?, ?) ON CONFLICT(to_id) DO UPDATE SET notified_seq=excluded.notified_seq, updated_at=excluded.updated_at",
			)
			.run(to, seq, this.now());
	}

	/** Import already-delivered fs messages (from `FsChannel.listUnread`) into the
	 *  queue as `queued`, idempotent on their existing id (a re-run imports
	 *  nothing new). Returns how many rows were newly inserted. Used by
	 *  `pij queue migrate` for a safe fs→sqlite cutover. */
	importUnread(messages: readonly DeliveredMessage[]): { imported: number; skipped: number } {
		let imported = 0;
		let skipped = 0;
		for (const m of messages) {
			const before = this.seqOfById(m.messageId);
			if (before !== undefined) {
				skipped += 1;
				continue;
			}
			const r = this.deliver(m, { messageId: m.messageId });
			if (r.ok) imported += 1;
			else skipped += 1;
		}
		return { imported, skipped };
	}

	private seqOfById(messageId: string): number | undefined {
		const row = this.db.prepare("SELECT seq FROM messages WHERE id = ?").get(messageId) as
			| { seq: number }
			| undefined;
		return row?.seq;
	}

	/** Read-only snapshot for `pij queue`	/** Read-only snapshot for `pij queue`: one entry per message with its current
	 *  delivery state and the receipt trail, newest last. Optional recipient
	 *  filter and a `sinceSeq` low-water mark. */
	summary(
		opts: { readonly to?: SessionId; readonly sinceSeq?: number; readonly limit?: number } = {},
	): QueueSummaryRow[] {
		const where: string[] = [];
		const params: (string | number)[] = [];
		if (opts.to !== undefined) {
			where.push("m.to_id = ?");
			params.push(opts.to);
		}
		if (opts.sinceSeq !== undefined) {
			where.push("m.seq > ?");
			params.push(opts.sinceSeq);
		}
		const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT m.seq, m.id, m.from_id, m.to_id, m.kind, m.command, length(m.body) AS bytes,
				        m.created_at, d.state, d.attempt, d.lease_until
				 FROM messages m JOIN deliveries d ON d.seq = m.seq ${clause}
				 ORDER BY m.seq${opts.limit ? " DESC LIMIT ?" : ""}`,
			)
			.all(...params, ...(opts.limit ? [opts.limit] : [])) as unknown as Array<{
			seq: number;
			id: string;
			from_id: string;
			to_id: string;
			kind: string | null;
			command: string | null;
			bytes: number;
			created_at: number;
			state: string;
			attempt: number;
			lease_until: number | null;
		}>;
		if (opts.limit) rows.reverse();
		return rows.map((r) => ({
			seq: r.seq,
			id: r.id,
			from: r.from_id,
			to: r.to_id,
			kind: r.command ? `cmd:${r.command}` : (r.kind ?? "text"),
			bytes: r.bytes,
			createdAt: r.created_at,
			state: r.state as DeliveryState,
			attempt: r.attempt,
			leaseUntil: r.lease_until,
			trail: this.db
				.prepare("SELECT state, attempt, at, detail FROM receipts WHERE seq = ? ORDER BY id")
				.all(r.seq) as unknown as Array<{
				state: string;
				attempt: number;
				at: number;
				detail: string | null;
			}>,
		}));
	}

	maxSeq(to: SessionId): number {
		const row = this.db.prepare("SELECT MAX(seq) AS s FROM messages WHERE to_id = ?").get(to) as {
			s: number | null;
		};
		return row.s ?? 0;
	}
}
