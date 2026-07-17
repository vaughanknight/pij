// pij-messaging — port interfaces (hexagonal boundary, Pattern P3 DI).
//
// Pi-free. These are the seams the pure core depends on; adapters/ (fakes for
// tests, real fs/pi adapters in Phase 2/3) implement them. Only
// adapters/pi-runtime.ts (Phase 2) may import @earendil-works/* — never here.

import type {
	DeliveredMessage,
	EventQuery,
	InboxClaim,
	InboxMark,
	InboxReadMarker,
	PijEvent,
	PijMessage,
	Result,
	SessionDescriptor,
	SessionId,
} from "./types.js";

/** Outcome of a daemon-owned tmux text injection. */
export type SendOutcome = "confirmed" | "unverified";

/** Reads/writes the ~/.pij/ peer registry (one descriptor per session). */
export interface RegistryPort {
	/** All known session descriptors. */
	list(): SessionDescriptor[];
	/** One descriptor by id, or null if absent. */
	read(id: SessionId): SessionDescriptor | null;
	/** Upsert this session's descriptor. */
	write(descriptor: SessionDescriptor): void;
	/** Remove a session's descriptor (on shutdown). */
	remove(id: SessionId): void;
	/** Persist a terminal tombstone so stale queued writes cannot resurrect a
	 *  session after close. Dissolved descriptors are hidden from list(). */
	dissolve(id: SessionId): void;
}

/** Resolves the canonical git common directory for a checkout/worktree path. */
export interface RepositoryIdentityPort {
	gitCommonDir(folder: string): string | null;
}

/** Appends/reads a single session's events.ndjson. */
export interface EventLogPort {
	/** Append one event line (persist before mutate — Pattern P9). */
	append(event: PijEvent): void;
	/** Atomically publish one event per idempotence key. Optional so existing
	 * structural consumers remain source-compatible until they opt in. */
	appendOnce?(key: string, event: PijEvent): "appended" | "existing";
	/** Read events, optionally filtered (since/type/last). */
	read(query?: EventQuery): PijEvent[];
	/** Highest seq written so far, or 0 if empty. Drives crash-safe seq
	 *  recovery after /reload (finding 04). */
	lastSeq(): number;
	/** Total number of events. */
	count(): number;
}

/** Writes a framed message to a target peer's delivery channel. */
export interface DeliveryPort {
	/** Deliver a message to the peer named by message.to. */
	deliver(message: PijMessage): Result<{ messageId: string }>;
}

/** Reads and durably claims immutable inbox envelopes. */
export interface InboxPort {
	/** List currently unread messages in lexical message-id order. */
	listUnread(id: SessionId): Result<readonly DeliveredMessage[]>;
	/** Exclusively claim a message by atomically publishing its read marker. */
	claimUnread(id: SessionId, messageId: string, marker?: InboxReadMarker): Result<InboxClaim>;
	/** Idempotently mark a known message read without returning its envelope. */
	markRead(id: SessionId, messageId: string, marker?: InboxReadMarker): Result<InboxMark>;
}

/** The ONLY port whose real adapter imports pi (adapters/pi-runtime.ts,
 *  Phase 3). The core depends on this interface, never the pi SDK. */
export interface PiRuntimePort {
	/** Is the session currently idle (not streaming a turn)? */
	isIdle(): boolean;
	/** Inject text as user input; "steer" queues during a live turn. */
	inject(text: string, mode: "immediate" | "steer"): void;
	/** Trigger a context compaction (remote command: compact). Always available
	 *  — compact() lives on the long-lived ExtensionContext. */
	compact(): void;
	/** Run a command-context-only control op (new|reload). Returns true if a
	 *  captured ExtensionCommandContext was armed and the op fired; false if not
	 *  armed (caller should queue it for the next `/pij` invocation). */
	control(command: "new" | "reload"): boolean;
}

// ─── Tmux seam ──────────────────────────────────────────────────────────────

/** Options for opening a new tmux window running a pij worker. */
export interface NewWindowOpts {
	/** Command to run (always "pi"). */
	cmd: string;
	/** Argv to pass to the command. */
	args: string[];
	/** Environment variables for the new window. */
	env: Record<string, string>;
	/** Tmux window name, e.g. "pi:<spawnId>". */
	name: string;
	/** Working directory for the new window. */
	cwd?: string;
	/** Pass tmux `-d`: create the window in the BACKGROUND without switching the
	 *  client's focus to it (e.g. the auto-started daemon window — it must not
	 *  steal the operator's view). */
	detached?: boolean;
}

/** Options for splitting an existing pane (layout:"split" mode). */
export interface SplitWindowOpts {
	/** Command to run (always "pi"). */
	cmd: string;
	/** Argv to pass to the command. */
	args: string[];
	/** Environment variables for the new pane. */
	env: Record<string, string>;
	/** Working directory for the new pane. */
	cwd?: string;
	/** Pane to split (%N): orchestrator pane for the right column; worker-1's
	 *  pane to stack the second worker below it. */
	target: string;
	/** "h" = LEFT/RIGHT (side-by-side column); "v" = UP/DOWN (stacked).
	 *  NB: bare `split-window` defaults to -v, so -h must be explicit. */
	direction: "h" | "v";
	/** Size % for the NEW pane (e.g. 33 → right column ~1/3 width). */
	percent?: number;
	/** Pass tmux -d: keep focus on the current pane (don't follow into the new one). */
	detached?: boolean;
	/** After the split, even out the new pane's stack (`select-layout -E -t <new>`)
	 *  — evens the heights of that vertical run. Best-effort cosmetic step;
	 *  failures are swallowed. */
	evenOut?: boolean;
	/** After evening, pin the stack column back to this % of the window width
	 *  (`resize-pane -x N%` on the new pane) — `-E` can re-spread the root h-split
	 *  too (seen live on tmux 3.6a). Best-effort; failures are swallowed. */
	columnPercent?: number;
}

/** Seam for creating/destroying tmux windows + panes (Pattern P2: impurity
 *  confined to adapters/tmux.ts; this interface is pi-free). */
export interface TmuxPort {
	/** Create a new tmux window running the given command. Returns the
	 *  captured %N pane id plus the @M window id holding it (plan 054 P2
	 *  T006, AC-09 terminal addressability). `windowId` is optional: a
	 *  malformed capture degrades to paneId-only — the daemon backfill
	 *  retries it, and addressability is never worth failing a spawn. */
	newWindow(opts: NewWindowOpts): Result<{ paneId: string; windowId?: string }>;
	/** Split an existing pane (layout:"split"); returns the new %N pane id
	 *  (+ @M window id, same contract as newWindow). */
	splitWindow(opts: SplitWindowOpts): Result<{ paneId: string; windowId?: string }>;
	/** Kill a window by its pane id. Swallows "already gone" (idempotent). */
	killWindow(paneId: string): Result<void>;
	/** Kill a single pane by its id (split-safe: siblings survive; a window's
	 *  last pane dying closes the window). Swallows "already gone". */
	killPane(paneId: string): Result<void>;
	/** Returns the current tmux session name if inside tmux, else null. */
	currentSession(): string | null;
	/** The orchestrator's own pane id ($TMUX_PANE), or null if not in tmux. */
	currentPane(): string | null;
	/** Pane ids in the orchestrator's current window (for the split cap count). */
	currentWindowPanes(): string[];
}

/** OS-level seams: pid, liveness probe, clock, env. */
export interface ProcessPort {
	/** This process's pid. */
	pid(): number;
	/** Is a pid currently alive? */
	isAlive(pid: number): boolean;
	/** Current time (ms epoch) — injected for deterministic tests. */
	now(): number;
	/** Read an environment variable (e.g. PIJ_SESSION_ID). */
	env(key: string): string | undefined;
}
