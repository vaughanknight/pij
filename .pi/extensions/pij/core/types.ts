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

/** Which coding-agent harness a session runs under (Plan 019 control plane).
 *  The transport-selection contract (`HarnessKind` → inbox|sendkeys) lives in
 *  `core/harness/types.ts`; the kind is declared here because it is part of the
 *  shared `SessionDescriptor` vocabulary. Absent ⇒ legacy pi session.
 *  `codex` (Plan 022) is the 4th spawnable harness — a discovery-bound,
 *  send-keys-driven, claude-style harness with its own transcript layout. */
export type HarnessKind = "pi" | "claude" | "copilot" | "codex";

/** Spawn→bind lifecycle of a control-plane session (Plan 019). DISTINCT from
 *  `SessionDescriptor.state` (working/idle of a live turn): this tracks the
 *  pre-bind handoff `pending` → `ready` → `bound`, or `failed` on watchdog
 *  timeout. Absent ⇒ a session that never went through control-plane spawn. */
export type SessionLifecycle = "pending" | "ready" | "bound" | "failed";

// ─── fail-loud death-reason vocabulary ───────────────────────────────────────
/** Machine-stable reason a spawned session failed to bind or died after binding.
 *  Used in `SessionDescriptor.failureReason` and `classifyDeathReason`. */
export type DeathReason =
	| "model-not-supported" // harness rejected the --model (400/not_found_error)
	| "auth" // authentication failure (401)
	| "quota" // terminal quota: credit/billing/insufficient (429/529/overloaded are transient → unknown)
	| "stalled" // watchdog: working but silent past the stale threshold
	| "dead" // pane exited (no specific error signal)
	| "unknown"; // fallback when no pattern matched

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
	/** Tmux pane id (%N) of this session's window, self-recorded by the child
	 *  from $TMUX_PANE at fresh boot (§H1). Present iff spawned via pij_spawn.
	 *  Used by PijSession.close() to killPane. */
	readonly paneId?: string;
	/** SessionId of the session that spawned this one (= PIJ_ANNOUNCE_TO at
	 *  fresh boot). Present iff this is a spawned worker session. */
	readonly spawnedBy?: SessionId;
	// ─── control plane (Plan 019; all optional ⇒ migration-safe) ──────────
	/** Which harness this session runs (`pi`/`claude`/`copilot`). Absent ⇒
	 *  legacy pi session. Decides the message transport (inbox vs send-keys). */
	readonly harness?: HarnessKind;
	/** The harness-native session id bound to this pij-id — for Claude, the
	 *  transcript stem under ~/.claude/projects/<mangled cwd>/<this>.jsonl,
	 *  discovered deterministically by the daemon (AC-03). Drives `pij tail`. */
	readonly harnessSessionId?: string;
	/** Codex only (Plan 022): the ABSOLUTE path to the discovered rollout `*.jsonl`,
	 *  persisted at bind. Codex's transcript dir is date-nested + global, so a bare
	 *  `harnessSessionId` (the trailing UUID) cannot reconstruct the path the way
	 *  claude's stem→`transcriptPathFor` join can (Finding 06) — `pij tail` reads
	 *  this file directly. Absent for claude (stem-derived) and copilot/pi. */
	readonly transcriptPath?: string;
	/** Copilot only: the session UUID pij CHOSE at spawn and passed to
	 *  `copilot --session-id <uuid>`. Copilot lets us set a new session's UUID, so
	 *  binding is deterministic at spawn (no transcript-discovery race like Claude).
	 *  The daemon binds to this once the pane is ready + initialised; it then
	 *  becomes `harnessSessionId`. Absent for claude/pi. */
	readonly plannedHarnessSessionId?: string;
	/** ISO-8601 — set the moment the daemon injects the init exactly once.
	 *  Persisted so a daemon restart never re-injects (init-exactly-once, AC-02/12). */
	readonly initInjectedAt?: string;
	/** Spawn→bind lifecycle (pending/ready/bound/failed) — distinct from
	 *  `state` (working/idle). The daemon dir-watch keys on `pending` (AC-01). */
	readonly lifecycle?: SessionLifecycle;
	/** Transcript `*.jsonl` paths present in the cwd's project dir at the instant
	 *  of spawn — captured BEFORE the pane exists so new-path discovery is truly
	 *  deterministic (AC-03). Without this the daemon's first-tick snapshot races
	 *  Claude's early transcript write (dogfood review H1). Cleared once bound. */
	readonly transcriptsAtSpawn?: readonly string[];
	/** Branch-from-self (Plan 020): the source harness session id this session was
	 *  forked from at spawn (claude `--resume <src> --fork-session`). Observability
	 *  only — binding keys on `plannedHarnessSessionId`. Absent for a normal spawn. */
	readonly branchedFrom?: string;
	// ─── fail-loud model layer (additive — migration-safe) ────────────────
	/** The actual model reported by the harness footer after first inference
	 *  (may differ from the --model arg if the harness substituted a fallback).
	 *  Absent until the daemon captures it from the pane. */
	readonly boundModel?: string;
	/** Machine-stable failure reason set by the daemon when lifecycle → failed.
	 *  model-not-supported|auth|quota|stalled|dead|unknown. Absent until failed. */
	readonly failureReason?: DeathReason;
	// ─── agent-pack peer layer (Plan 029 Phase 3; additive — migration-safe) ──
	/** The agent pack slug this peer runs (`pij agent spawn <slug>`), or `"inline"`
	 *  for a `--prompt` spawn. Absent ⇒ not an agent-pack peer (a plain colleague). */
	readonly agentPack?: string;
	/** The resolved pack directory captured at spawn — the discovered pack's dir, or
	 *  `~/.pij/<id>/pack/` for an inline (`--prompt`) spawn. Lets `pij agent report`
	 *  and the daemon locate the pack's schema without re-running discovery. */
	readonly agentPackDir?: string;
	/** `--once`/pack `lifecycle: once` — the daemon closes this peer's pane after
	 *  its first report push is durable (T008). Absent/false ⇒ resident (default). */
	readonly agentOnce?: boolean;
	/** ISO-8601 — stamped by `pij agent report` the moment a VALID report is pushed
	 *  to the spawner. Drives the `--once` auto-close latch (`agentOnce && reportedAt`,
	 *  T005 planOnceClose). Re-stamped on each subsequent report. */
	readonly reportedAt?: string;
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
	/** Reference-passing media (Plan 026 Phase 5): each entry is a LOCAL file path
	 *  plus an optional caption — never bytes on the wire. Only the telegram bridge
	 *  acts on these (uploads each via grammY); every other peer ignores the field, so
	 *  it is fully additive and the text `body` stays the contract. Present only when
	 *  `pij send … --file` attached a file; a plain text send has no `attachments` key. */
	readonly attachments?: ReadonlyArray<{ readonly path: string; readonly caption?: string }>;
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
	| "E-AMBIG" // cannot resolve "self" (env unset + multiple local)
	| "E-NOTMUX" // not inside a tmux session (required for pij_spawn)
	| "E-FULL" // explicit --layout right|below full — 2 workers already split (the default stack is uncapped)
	| "E-BRANCH" // branch-from-self refused (unsupported harness / unresolved / mismatch / unbound)
	| "E-OWN"; // close refused: caller does not own the target session (re-run with --force)

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
