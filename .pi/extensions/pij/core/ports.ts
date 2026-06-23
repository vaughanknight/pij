// pij-messaging — port interfaces (hexagonal boundary, Pattern P3 DI).
//
// Pi-free. These are the seams the pure core depends on; adapters/ (fakes for
// tests, real fs/pi adapters in Phase 2/3) implement them. Only
// adapters/pi-runtime.ts (Phase 2) may import @earendil-works/* — never here.

import type {
	EventQuery,
	PijEvent,
	PijMessage,
	Result,
	SessionDescriptor,
	SessionId,
} from "./types.js";

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
}

/** Appends/reads a single session's events.ndjson. */
export interface EventLogPort {
	/** Append one event line (persist before mutate — Pattern P9). */
	append(event: PijEvent): void;
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
}

/** Seam for creating/destroying tmux windows (Pattern P2: impurity confined
 *  to adapters/tmux.ts; this interface is pi-free). The 6th port — additive;
 *  existing PijPorts consumers are unaffected until Phase 2 wires it. */
export interface TmuxPort {
	/** Create a new tmux window running the given command. Returns the
	 *  captured %N pane id. */
	newWindow(opts: NewWindowOpts): Result<{ paneId: string }>;
	/** Kill a window by its pane id. Swallows "already gone" (idempotent). */
	killWindow(paneId: string): Result<void>;
	/** Returns the current tmux session name if inside tmux, else null. */
	currentSession(): string | null;
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
