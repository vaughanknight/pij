// pij-messaging — shared domain types (Pattern P2: pi-free).
//
// Imports NOTHING from @earendil-works/*. Plain data + structural types only.
// These are the vocabulary the whole core speaks; ports (ports.ts) and the
// pure logic modules (seq/events/state/commands/discovery/message/receipts)
// all build on these.

// ─── identity ────────────────────────────────────────────────────────────
export type SessionId = string;

/** Role a session plays in the parent/worker loop (rides in PIJ_ROLE). */
export type Role = "parent" | "worker";

// ─── liveness + state (vocabulary aligned with agent-workbench) ───────────
/** Self-reported working state of a session. */
export type SessionState = "idle" | "in-progress" | "paused" | "reviewing" | "complete" | "error";

/** Liveness verdict derived from pid probe + latest-event age. */
export type LivenessVerdict = "active" | "stale" | "dead";

// ─── registry descriptor (the ~/.pij/<id>.json a peer reads) ──────────────
export interface SessionDescriptor {
	readonly id: SessionId;
	readonly role?: Role;
	/** Absolute project folder the session runs in (used by --here filter). */
	readonly folder: string;
	/** Absolute data dir: ~/.pij/<id>/ holding events.ndjson + state.json. */
	readonly dataDir: string;
	/** Absolute path to events.ndjson (pij path <id>). */
	readonly eventsPath: string;
	/** OS process id, for the liveness pid probe. */
	readonly pid: number;
	/** ISO-8601 session start time. */
	readonly startedAt: string;
	/** Coarse working/idle signal (D-A): `working` between turn_start and
	 *  turn_end, else `idle`. Lets `pij state` report working/static without a
	 *  stream parse (AC-9); `working` + a stale `lastEventAt` = a stall (AC-7a). */
	readonly state?: "working" | "idle";
	/** ISO-8601 timestamp of this session's newest captured event (D-A) — the
	 *  cheap age source for liveness/stall, read straight from the descriptor. */
	readonly lastEventAt?: string;
}

// ─── event stream ─────────────────────────────────────────────────────────
/** Event categories captured into events.ndjson (open-ended string at the
 *  boundary; these are the known-at-minimum kinds — spec AC-7). */
export type EventType = "tool_call" | "tool_result" | "message" | "usage" | "state" | "receipt";

/** One line of events.ndjson. Every line carries a strictly monotonic `seq`
 *  AND an ISO-8601 `timestamp` so a reader computes age from the stream
 *  alone (spec AC-7 / AC-7a). */
export interface PijEvent {
	readonly seq: number;
	readonly timestamp: string;
	readonly type: string;
	readonly data?: unknown;
}

/** Filters for incremental follow (spec AC-8). */
export interface EventQuery {
	/** Only events with seq > since. */
	readonly since?: number;
	/** Only events of this type. */
	readonly type?: string;
	/** Last N events (present-minus-N). */
	readonly last?: number;
}

// ─── messaging ─────────────────────────────────────────────────────────────
/** A message as it travels to a peer's delivery channel. */
export interface PijMessage {
	readonly from: SessionId;
	readonly to: SessionId;
	readonly body: string;
	/** Present when this is a remote command rather than free text. */
	readonly command?: string;
	/** "receipt" marks an extension-issued delivery receipt: the receiver
	 *  records it as an event but never injects it, so a receipt can never
	 *  wake (or bill) the peer it acknowledges (finding 08 / Phase-3 fix). */
	readonly kind?: "receipt";
}

// ─── delivery receipts (finding 08; spec AC-13) ───────────────────────────
export type ReceiptState = "queued" | "delivered";

export interface MessageReceipt {
	readonly messageId: string;
	readonly from: SessionId;
	readonly to: SessionId;
	readonly state: ReceiptState;
	/** ISO-8601 — set when a busy peer steered the message. */
	readonly queuedAt?: string;
	/** ISO-8601 — set when the peer consumed it (next turn_start). */
	readonly deliveredAt?: string;
}

// ─── error codes (workshop 001 CLI surface) ───────────────────────────────
export type PijErrorCode =
	| "E-NOID" // no such session id in registry
	| "E-SELF" // refused: target is self
	| "E-CMD" // unknown remote command (not on allow-list)
	| "E-DEAD" // target session is dead
	| "E-NOREG" // no registry present
	| "E-ARG" // bad CLI arguments
	| "E-AMBIG"; // cannot resolve "self" (env unset + multiple local)

/** Tagged-union result used across the core (Pattern P4: no throws). */
export type Result<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly code: PijErrorCode; readonly message: string };

export function ok<T>(value: T): Result<T> {
	return { ok: true, value };
}

export function err<T>(code: PijErrorCode, message: string): Result<T> {
	return { ok: false, code, message };
}
