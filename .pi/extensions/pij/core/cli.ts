// pij-messaging — pure CLI core (Pattern P2: pi-free; P4: tagged-union returns;
// P8: the testable backbone of the `pij` bin).
//
// Three pure pieces the thin `cli.ts` bin wires to process.argv/stdout:
//   parseArgs(argv) -> Result<ParsedCommand>     (E-ARG on bad invocation)
//   dispatch(cmd, deps) -> CliResult             ({stdout, stderr, exitCode})
// All six verbs reuse the proven core helpers (resolveSelf/filterByFolder/
// liveness/validateCommand/filterEvents via the ports) — no new logic. Node I/O
// (fs, argv, exit) and the imperative --follow / --wait loops live in the bin.

import { chainStateOf, detectAnomalies } from "./anomalies.js";
import { applyBinding, resolvePhonehomeSessionId } from "./binding.js";
import {
	buildCanaryPacket,
	CANARY_PACKET_ERROR,
	type CanaryErrorCode,
	evaluateCanary,
	renderCanaryPass,
} from "./canary.js";
import { ALLOWED_COMMANDS, validateCommand } from "./commands.js";
import { type ContextReaderPort, contextMaxFor } from "./context/gauge.js";
import type { ContextWindowReaderPort } from "./context/window.js";
import { isCompacting } from "./daemon/router.js";
import { filterByFolder, filterPrime, resolveSelf, selectByRepository } from "./discovery.js";
import type { PersistReceiptEnvelopeAction } from "./inbox.js";
import { type BriefAckReceipt, briefAckBody } from "./message.js";
import { closestModel } from "./models/match.js";
import type { ModelEntry } from "./models/registry.js";
import { canonicalAllocationJson } from "./platform/allocation.js";
import {
	appendStateRef,
	assignmentIdCandidates,
	canonicalAssignmentJson,
	materializeGeneralIfMissing,
	openAssignment,
} from "./platform/assignment.js";
import {
	acknowledgeDispatch,
	canonicalDispatchJson,
	markDispatchDelivered,
} from "./platform/dispatch.js";
import { canonicalFenceJson, fencesForPath } from "./platform/fence.js";
import { recoverPendingOps } from "./platform/journal.js";
import type {
	AllocationStorePort,
	AssignmentStorePort,
	DispatchStorePort,
	FenceStorePort,
	OpJournalPort,
	PlatformWriteLockPort,
	ProjectStorePort,
	SpineLogPort,
} from "./platform/ports.js";
import { createProject, setProject } from "./platform/project.js";
import { buildSpineEvent } from "./platform/spine.js";
import { isoTimestamp } from "./platform/time.js";
import {
	type ActorProvenance,
	type Allocation,
	type Assignment,
	type Dispatch,
	type Fence,
	generalAssignmentId,
	SPINE_KIND_DISPATCH,
	SPINE_KIND_FENCE,
	SPINE_KIND_NODE_LINKED,
	SPINE_KIND_STATE_CLEARED,
	SPINE_KIND_STATE_SET,
	SPINE_KIND_STATE_VERIFIED,
	SPINE_KIND_TASK_SET,
	type SpineEventDraft,
} from "./platform/types.js";
import type {
	DeliveryPort,
	EventLogPort,
	InboxPort,
	ProcessPort,
	RegistryPort,
	RepositoryIdentityPort,
} from "./ports.js";
import { daemonTickStatus } from "./receipts.js";
import { buildExportLines, buildSessionJoinRows } from "./session-join.js";
import { activityOf, badgeOf, liveness, STALE_AFTER_MS } from "./state.js";
import {
	closeStream,
	createStream,
	type StreamCommitPort,
	type StreamWorktreePort,
} from "./stream.js";
import { effectiveParent, isUnadopted, planLink, projectSessionForest } from "./tree.js";
import {
	err,
	isSemanticState,
	type LivenessVerdict,
	ok,
	type PijErrorCode,
	type PijEvent,
	type ReceiptState,
	type Result,
	SEMANTIC_STATES,
	type SemanticState,
	type SessionDescriptor,
	type SessionForest,
	type SessionId,
	type SessionLifecycle,
	type SessionTreeNode,
	type TreeActivity,
	type TreeFilters,
	type TreeSession,
	type WatchdogCapturePolicy,
	type WatchdogSidecar,
} from "./types.js";
import {
	applyWatchdogExemption,
	applyWatchdogResume,
	DEFAULT_WATCHDOG_EXEMPT_TTL_MS,
	describeWatchdogState,
	effectiveWatchdog,
	parseWatchdogInterval,
	reconcileWatchdogExemption,
} from "./watchdog.js";

// ─── deps (injected — fakes in tests, real fs adapters in the bin) ──────────
export interface WatchdogCliStore {
	read(id: SessionId): WatchdogSidecar | undefined;
	write(id: SessionId, sidecar: WatchdogSidecar): void;
}

/** The machine-wide watchdog switch (Plan 056), read/written by
 *  `pij watchdog disable-all|enable-all`. */
export interface WatchdogGlobalCliStore {
	disabled(): boolean;
	setEnabled(enabled: boolean): void;
}

export interface CliDeps {
	readonly registry: RegistryPort;
	/** A per-target event log (the bin builds `FsEventLog(pijHome, id)`). */
	readonly eventLogFor: (id: SessionId) => EventLogPort;
	readonly delivery: DeliveryPort;
	/** Shared read side of the delivery channel; supplied by the standalone CLI. */
	readonly inbox?: InboxPort;
	readonly process: ProcessPort;
	/** The invoking shell's cwd (ProcessPort has no cwd seam). */
	readonly cwd: string;
	/** Registry home (`~/.pij`) — only `path --state` needs it. */
	readonly pijHome: string;
	/** Model entries loaded by the bin (for pij models verb). Empty when absent. */
	readonly models?: readonly ModelEntry[];
	/** Exact ambient native-identity reverse lookup, supplied by the bin. */
	readonly resolveAmbientSelf?: () => Result<SessionId | undefined>;
	/** Repository identity is needed only by bare `tree`; optional for legacy callers. */
	readonly repository?: RepositoryIdentityPort;
	/** Full tree source, including dissolved descriptors hidden by RegistryPort.list(). */
	readonly treeDescriptors?: readonly SessionDescriptor[];
	/** Plan-054 platform stores — optional so legacy deps-sites compile unchanged.
	 *  The bin wires all three; the project/spine family verbs require them. */
	readonly projectStore?: ProjectStorePort;
	readonly assignmentStore?: AssignmentStorePort;
	readonly allocationStore?: AllocationStorePort;
	readonly fenceStore?: FenceStorePort;
	readonly dispatchStore?: DispatchStorePort;
	/** Node-owned packet identity read. The bin resolves the path and hashes the
	 * current file bytes; tests inject deterministic identities. */
	readonly packetIdentity?: (
		path: string,
	) => Result<{ readonly path: string; readonly sha256: string }>;
	/** Preallocate a durable dispatch id before peer delivery so the packet
	 * header can carry a runnable ack command. */
	readonly nextDispatchId?: () => string;
	/** Canary packets live below the caller descriptor's dataDir, not in a new
	 * registry/store namespace. All target/self preconditions run before this. */
	readonly writeCanaryPacket?: (input: {
		readonly caller: SessionDescriptor;
		readonly dispatchId: string;
		readonly body: string;
	}) => Result<{ readonly path: string; readonly sha256: string }>;
	readonly nextCanaryNonce?: () => string;
	readonly worktrees?: StreamWorktreePort;
	readonly worktreeRoot?: string;
	readonly spineLog?: SpineLogPort;
	/** Write-ahead op journal for the journal-FIRST coupled write (HIGH-2);
	 *  the platform WRITE verbs require it wired (the bin always wires it). */
	readonly opJournal?: OpJournalPort;
	/** Machine-wide platform write lock (review 002 G2/G3): every platform
	 *  WRITE verb runs its whole coupled write under it, which is what makes
	 *  intent-phase recovery sound. Required wired for WRITE verbs. */
	readonly platformWriteLock?: PlatformWriteLockPort;
	/** Per-harness contextCurrent reads (plan 054 P2 T007, AC-09) — real
	 *  readings or honest unknown, never estimates. Optional so legacy
	 *  deps-sites compile; `node show` reports unknown/none when unwired. */
	readonly contextReader?: ContextReaderPort;
	/** Effective runtime tier evidence from the harness footer. Canary validation
	 * fails honestly when a catalog window is expected but this observer has no reading. */
	readonly contextWindowReader?: ContextWindowReaderPort;
	/** CLI-owned watchdog sidecars. Optional for legacy/in-process send-only callers. */
	readonly watchdogStore?: WatchdogCliStore;
	readonly watchdogGlobalStore?: WatchdogGlobalCliStore;
}

// ─── parsed command (discriminated per verb) ────────────────────────────────
type WatchdogAction =
	| "status"
	| "pause"
	| "resume"
	| "exempt"
	| "reset"
	| "interval"
	| "watch"
	| "unwatch"
	| "list"
	| "disable-all"
	| "enable-all";

export type ParsedCommand =
	| { readonly verb: "whoami"; readonly json: boolean; readonly env?: boolean }
	| {
			readonly verb: "list";
			readonly here: boolean;
			readonly prime: boolean;
			readonly json: boolean;
	  }
	| { readonly verb: "sessions"; readonly here: boolean; readonly json: boolean }
	| {
			readonly verb: "models";
			readonly filter?: string;
			/** Provider/harness filter: pi|claude|copilot (or any provider string). */
			readonly harnessFilter?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "send";
			readonly to: SessionId;
			/** Ordered broadcast targets. Absent means the legacy positional single-target form. */
			readonly targets?: readonly SessionId[];
			readonly broadcast?: true;
			readonly text?: string;
			readonly command?: string;
			/** Reference-passing attachment (Plan 026 Phase 5): a local file path. */
			readonly file?: string;
			/** Caption for the attached file (only valid alongside `file`). */
			readonly caption?: string;
			readonly wait: boolean;
			readonly waitMs?: number;
			readonly json: boolean;
	  }
	| {
			readonly verb: "tail";
			readonly id: SessionId;
			readonly since?: number;
			readonly type?: string;
			readonly lines?: number;
			readonly follow: boolean;
			readonly json: boolean;
	  }
	| { readonly verb: "state"; readonly id: SessionId; readonly json: boolean }
	| {
			readonly verb: "watchdog";
			readonly action: WatchdogAction;
			readonly id?: SessionId;
			readonly capture?: WatchdogCapturePolicy;
			readonly intervalMs?: number;
			readonly exemptDurationMs?: number;
			readonly json: boolean;
	  }
	| { readonly verb: "phonehome"; readonly json: boolean }
	| {
			readonly verb: "tree";
			readonly rootId?: SessionId;
			readonly global: boolean;
			readonly filters: TreeFilters;
			readonly json: boolean;
	  }
	| {
			readonly verb: "link";
			readonly childId: SessionId;
			readonly parentId: SessionId | null;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "path";
			readonly id: SessionId;
			readonly which: "dir" | "events" | "state";
			readonly json: boolean;
	  }
	// ── plan 054 family verbs (project/spine) — pure core-table verbs ─────────
	| {
			readonly verb: "project-create";
			readonly description: string;
			/** Explicitly chosen slug (`--slug <slug>`) — verbatim, E-ARG on collision. */
			readonly slug?: string;
			/** Asserted attribution (`--actor <label>`), F2: wins over a resolved self. */
			readonly actor?: string;
			readonly json: boolean;
	  }
	| { readonly verb: "project-list"; readonly json: boolean }
	| { readonly verb: "project-show"; readonly slug: string; readonly json: boolean }
	| {
			readonly verb: "project-set";
			readonly slug: string;
			readonly planPath?: string;
			readonly primeId?: string;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "stream-create";
			readonly project: string;
			readonly slug: string;
			readonly baseRef?: string;
			readonly ordinal?: number;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "stream-close";
			readonly id: string;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "fence-set";
			readonly stream: string;
			readonly touchSet: readonly string[];
			readonly shared: readonly string[];
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "fence-show";
			readonly path?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "dispatch-packet";
			readonly to: SessionId;
			readonly packetPath: string;
			/** Internal preallocation used by canary so its packet path and
			 * standard dispatch header share one id. Never parsed from argv. */
			readonly dispatchId?: string;
			/** Internal canary writer hash. The dispatch reread must match this
			 * at the commitment point before any record or delivery write. */
			readonly expectedPacketSha256?: string;
			readonly wait: boolean;
			readonly waitMs?: number;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "ack-dispatch";
			readonly dispatchId: string;
			readonly packetSha256: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "canary";
			readonly to: SessionId;
			readonly expectedModel?: string;
			readonly waitMs?: number;
			readonly json: boolean;
	  }
	| {
			readonly verb: "spine-append";
			readonly kind: string;
			readonly refs: readonly string[];
			readonly peer?: string;
			readonly project?: string;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "spine-events";
			readonly since?: number;
			readonly peer?: string;
			readonly project?: string;
			readonly json: boolean;
	  }
	/** Parse-row only (plan 054 P4 T002): the markdown write is BIN-owned —
	 *  the pij bin intercepts `spine render` before dispatch. Core keeps the
	 *  row for usage/E-ARG parity and E-NOREGs if ever reached. `--project`
	 *  scopes the render to one project's events (s057 dogfood). */
	| { readonly verb: "spine-render"; readonly json: boolean; readonly project?: string }
	// ── plan 054 Phase 2 — assignment/state family verbs (AC-05/AC-06) ────────
	| {
			readonly verb: "task-set";
			readonly node: SessionId;
			readonly task: string;
			readonly projectSlug?: string;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "state-set";
			readonly node: SessionId;
			readonly state: SemanticState;
			readonly assignmentId?: string;
			readonly refs: readonly string[];
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "state-verify";
			readonly node: SessionId;
			readonly assignmentId?: string;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "state-clear";
			readonly node: SessionId;
			readonly assignmentId?: string;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| { readonly verb: "node-show"; readonly id: SessionId; readonly json: boolean }
	| {
			readonly verb: "anomalies";
			readonly json: boolean;
			readonly here: boolean;
			readonly project?: string;
	  };

export interface CliResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	/** Set when the bin must keep going: --follow tails, --wait polls receipts. */
	readonly follow?:
		| { readonly kind: "tail"; readonly id: SessionId; readonly nextSince: number }
		| {
				readonly kind: "dispatch-wait";
				readonly dispatchId: string;
				readonly timeoutMs?: number;
				readonly exitCode: number;
		  }
		| {
				readonly kind: "canary-wait";
				readonly dispatchId: string;
				readonly nonce: string;
				readonly expectedModel?: string;
				readonly timeoutMs?: number;
				readonly json: boolean;
		  }
		| {
				readonly kind: "wait";
				readonly self: SessionId;
				readonly targets: readonly WaitTarget[];
				readonly timeoutMs?: number;
				/** Exit after waiting with the dispatch result (partial broadcast failures stay non-zero). */
				readonly exitCode: number;
		  };
}

export interface WaitTarget {
	readonly to: SessionId;
	readonly messageId: string;
}

export interface WaitReceiptUpdate {
	readonly target?: WaitTarget;
	readonly pending: readonly WaitTarget[];
}

export interface WaitReceiptSourcesResult {
	readonly pending: readonly WaitTarget[];
	readonly seen: readonly string[];
	readonly updates: ReadonlyArray<{
		readonly target: WaitTarget;
		readonly state: ReceiptState;
	}>;
}

/** Apply one parsed receipt to the pending target set. Queued receipts retain the
 * target; delivered/unverified receipts remove only their correlated message. */
export function applyWaitReceipt(
	pending: readonly WaitTarget[],
	receipt: { readonly messageId: string; readonly state: ReceiptState },
): WaitReceiptUpdate {
	const target = pending.find(({ messageId }) => messageId === receipt.messageId);
	if (!target) return { pending };
	if (receipt.state === "queued") return { target, pending };
	return {
		target,
		pending: pending.filter(({ messageId }) => messageId !== receipt.messageId),
	};
}

/** Merge durable receipt events first, then prepared receipt envelopes. A state
 * is emitted once; receipt durability/marking is handled before this reduction. */
export function applyWaitReceiptSources(
	pendingInput: readonly WaitTarget[],
	seenInput: readonly string[],
	eventReceipts: readonly {
		readonly messageId: string;
		readonly state: ReceiptState;
	}[],
	envelopeReceipts: readonly PersistReceiptEnvelopeAction[],
): WaitReceiptSourcesResult {
	let pending = pendingInput;
	const seen = new Set(seenInput);
	const updates: Array<{ target: WaitTarget; state: ReceiptState }> = [];
	const accept = (receipt: { readonly messageId: string; readonly state: ReceiptState }): void => {
		const update = applyWaitReceipt(pending, receipt);
		if (!update.target) return;
		const key = `${receipt.messageId}:${receipt.state}`;
		if (seen.has(key)) return;
		seen.add(key);
		updates.push({ target: update.target, state: receipt.state });
		pending = update.pending;
	};
	for (const receipt of eventReceipts) accept(receipt);
	for (const envelope of envelopeReceipts) accept(envelope.receipt);
	return { pending, seen: [...seen], updates };
}

export function renderWaitReceipt(
	target: SessionId,
	state: ReceiptState,
	broadcast: boolean,
): string {
	return broadcast ? `receipt ${target} → ${state}` : `receipt → ${state}`;
}

export function renderWaitTimeout(pending: readonly WaitTarget[], broadcast: boolean): string {
	if (!broadcast) return "receipt → (timeout; check `pij tail` later)";
	return `receipt → (timeout; unresolved: ${pending.map(({ to }) => to).join(", ")}; check \`pij tail\` later)`;
}

export function renderDispatchWaitTimeout(dispatchRecord: Dispatch): string {
	return `dispatch ${dispatchRecord.id} state=${dispatchRecord.state} (timeout awaiting brief ack)`;
}

/** Workshop-001 exit codes. */
const EXIT: Record<PijErrorCode, number> = {
	"E-NOID": 2,
	"E-SELF": 2,
	"E-CMD": 2,
	"E-AMBIG": 2,
	"E-AMBIGUOUS": 64,
	"E-DEAD": 1,
	"E-NOREG": 3,
	"E-ARG": 64,
	"E-NOTMUX": 2,
	"E-FULL": 2,
	"E-BRANCH": 64,
	"E-OWN": 2,
};

function daemonReceiptAuthoritative(target: SessionDescriptor): boolean {
	return (
		target.deliveryMode !== "pull" &&
		(target.harness === "claude" || target.harness === "copilot" || target.harness === "codex")
	);
}

// ─── argv parsing ───────────────────────────────────────────────────────────
/** Split argv into positionals + flags. `--k v` consumes the next token unless
 *  it is a known boolean flag; `--k=v` is also accepted. */
function lex(
	argv: readonly string[],
	booleans: ReadonlySet<string>,
	repeatables: ReadonlySet<string>,
) {
	const pos: string[] = [];
	const flags: Record<string, string | true> = {};
	const repeated: Record<string, string[]> = {};
	const setFlag = (key: string, value: string | true): void => {
		if (repeatables.has(key) && typeof value === "string") {
			const values = repeated[key] ?? [];
			values.push(value);
			repeated[key] = values;
			return;
		}
		flags[key] = value;
	};
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === undefined) continue;
		if (tok.startsWith("--")) {
			const eq = tok.indexOf("=");
			if (eq !== -1) {
				setFlag(tok.slice(2, eq), tok.slice(eq + 1));
			} else {
				const key = tok.slice(2);
				const next = argv[i + 1];
				if (booleans.has(key) || next === undefined || next.startsWith("--")) {
					setFlag(key, true);
				} else {
					setFlag(key, next);
					i++;
				}
			}
		} else {
			pos.push(tok);
		}
	}
	return { pos, flags, repeated };
}

const BOOLEAN_FLAGS = new Set([
	"here",
	"prime",
	"json",
	"follow",
	"events",
	"state",
	"dir",
	"env",
	"global",
	"all",
	"root",
]);
const REPEATABLE_FLAGS = new Set(["to", "activity", "liveness", "lifecycle"]);

/** Family verbs (plan 054): the tables below key on "<verb> <subcommand>".
 *  `state` is deliberately NOT here — it is BOTH a positional verb
 *  (`pij state <id>`) and a family verb (P2: `state set|verify`), routed by
 *  the exact-subcommand special case in parseArgs. */
const FAMILY_SUBCOMMANDS: Record<string, string> = {
	project: "create|list|show|set",
	stream: "create|close",
	fence: "set|show",
	spine: "append|events|render",
	task: "set",
	node: "show",
};

/** Per-verb flag VALENCE (plan 054 T010): flags that are boolean globally but
 *  take a value for a given verb key — `project set --prime <id>` vs the
 *  boolean `list --prime`. Existing verbs keep the global BOOLEAN_FLAGS set. */
const VALUED_FLAG_OVERRIDES: Record<string, ReadonlySet<string>> = {
	"project set": new Set(["prime"]),
};

function booleanFlagsFor(key: string): ReadonlySet<string> {
	const valued = VALUED_FLAG_OVERRIDES[key];
	if (!valued) return BOOLEAN_FLAGS;
	return new Set([...BOOLEAN_FLAGS].filter((flag) => !valued.has(flag)));
}

/** Flags each verb accepts — anything else is E-ARG. */
const ALLOWED_FLAGS: Record<string, ReadonlySet<string>> = {
	whoami: new Set(["json", "env"]),
	list: new Set(["here", "prime", "json"]),
	sessions: new Set(["here", "json"]),
	models: new Set(["harness", "json"]),
	send: new Set(["to", "command", "file", "caption", "wait", "json"]),
	dispatch: new Set(["packet", "wait", "actor", "json"]),
	ack: new Set(["packet-sha", "json"]),
	canary: new Set(["expect-model", "wait", "json"]),
	tail: new Set(["since", "type", "lines", "follow", "json"]),
	state: new Set(["json"]),
	phonehome: new Set(["json"]),
	tree: new Set(["global", "activity", "liveness", "lifecycle", "all", "json"]),
	link: new Set(["parent", "root", "actor", "json"]),
	path: new Set(["events", "state", "dir", "json"]),
	// --slug is not in BOOLEAN_FLAGS, so lex values it (no override row needed).
	"project create": new Set(["slug", "actor", "json"]),
	"project list": new Set(["json"]),
	"project show": new Set(["json"]),
	"project set": new Set(["plan", "prime", "actor", "json"]),
	"stream create": new Set(["project", "slug", "base", "ordinal", "actor", "json"]),
	"stream close": new Set(["actor", "json"]),
	"fence set": new Set(["paths", "shared", "actor", "json"]),
	"fence show": new Set(["path", "json"]),
	"spine append": new Set(["kind", "refs", "peer", "project", "actor", "bare", "json"]),
	"spine events": new Set(["since", "peer", "project", "json"]),
	"spine render": new Set(["project", "json"]),
	// plan 054 P2 (T005). --project/--assignment/--refs are not in
	// BOOLEAN_FLAGS, so lex values them without VALUED_FLAG_OVERRIDES rows.
	"task set": new Set(["project", "actor", "json"]),
	"state set": new Set(["assignment", "refs", "actor", "json"]),
	"state verify": new Set(["assignment", "actor", "json"]),
	"state clear": new Set(["assignment", "actor", "json"]),
	"node show": new Set(["json"]),
	anomalies: new Set(["json", "here", "project"]),
	watchdog: new Set(["capture", "max-lines", "max-bytes", "json"]),
};
/** Max positionals per verb (send allows id + text; models allows optional filter). */
const MAX_POS: Record<string, number> = {
	whoami: 0,
	list: 0,
	sessions: 0,
	models: 1,
	send: 2,
	dispatch: 1,
	ack: 1,
	canary: 1,
	tail: 1,
	state: 1,
	phonehome: 0,
	tree: 1,
	link: 1,
	path: 1,
	"project create": 1,
	"project list": 0,
	"project show": 1,
	"project set": 1,
	"stream create": 0,
	"stream close": 1,
	"fence set": 1,
	"fence show": 0,
	"spine append": 0,
	"spine events": 0,
	"spine render": 0,
	"task set": 2,
	"state set": 2,
	"state verify": 1,
	"state clear": 1,
	"node show": 1,
	anomalies: 0,
	watchdog: 3, // action + id + duration (for `interval <id> <duration>`)
};

export function parseArgs(argv: readonly string[]): Result<ParsedCommand> {
	const verb = argv[0];
	if (verb === undefined)
		return err(
			"E-ARG",
			"usage: pij <whoami|list|sessions|models|send|dispatch|ack|canary|tail|state|watchdog|phonehome|tree|link|path|project|stream|fence|spine|task|node|anomalies> …",
		);
	// Family verbs route "<verb> <subcommand>" into the same strict tables —
	// no bin interception (Finding 06); everything downstream keys on `key`.
	let key = verb;
	let args = argv.slice(1);
	// `state` dual routing (plan 054 P2): the family route engages ONLY on the
	// exact reserved subcommands, so the legacy positional card
	// (`pij state <id>`) keeps working for every other first argument.
	if (verb === "state" && (argv[1] === "set" || argv[1] === "verify" || argv[1] === "clear")) {
		key = `state ${argv[1]}`;
		args = argv.slice(2);
	}
	const subcommands = key === verb ? FAMILY_SUBCOMMANDS[verb] : undefined;
	if (subcommands !== undefined) {
		const sub = argv[1];
		if (sub === undefined || sub.startsWith("--"))
			return err("E-ARG", `usage: pij ${verb} <${subcommands}> …`);
		key = `${verb} ${sub}`;
		if (ALLOWED_FLAGS[key] === undefined)
			return err("E-ARG", `unknown ${verb} subcommand '${sub}' (${subcommands})`);
		args = argv.slice(2);
	}
	const allowed = ALLOWED_FLAGS[key];
	if (!allowed)
		return err(
			"E-ARG",
			`unknown command '${verb}' (whoami|list|sessions|models|send|dispatch|ack|canary|tail|state|watchdog|phonehome|tree|link|path|project|stream|fence|spine|task|node|anomalies)`,
		);
	// Valence is per verb key (plan 054): the same flag can be boolean for one
	// verb and valued for another; existing verbs see the unchanged global set.
	const booleans = booleanFlagsFor(key);
	for (const token of args) {
		const equals = token.startsWith("--") ? token.indexOf("=") : -1;
		if (equals === -1) continue;
		const flag = token.slice(2, equals);
		if (booleans.has(flag)) return err("E-ARG", `--${flag} does not take a value`);
	}
	const { pos, flags, repeated } = lex(args, booleans, REPEATABLE_FLAGS);
	// strict: reject unknown flags and extra arity (finding F001).
	for (const k of [...Object.keys(flags), ...Object.keys(repeated)]) {
		if (!allowed.has(k)) return err("E-ARG", `unknown flag --${k} for '${key}'`);
	}
	if (pos.length > (MAX_POS[key] ?? 0)) return err("E-ARG", `too many arguments for '${key}'`);
	const json = flags.json === true;
	// number | undefined (absent) | "bad" (present but non-numeric -> E-ARG).
	const pnum = (v: string | true | undefined): number | undefined | "bad" =>
		v === undefined ? undefined : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : "bad";

	switch (key) {
		case "whoami":
			return ok({ verb: "whoami", json, env: flags.env === true });
		case "list":
			return ok({ verb: "list", here: flags.here === true, prime: flags.prime === true, json });
		case "sessions":
			return ok({ verb: "sessions", here: flags.here === true, json });
		case "models": {
			const filter = pos[0];
			const harnessFilter = typeof flags.harness === "string" ? flags.harness : undefined;
			return ok({ verb: "models", filter, harnessFilter, json });
		}
		case "send": {
			const broadcastTargets = repeated.to ?? [];
			if (flags.to === true) return err("E-ARG", "--to needs a session id");
			if (broadcastTargets.length > 0) {
				if (broadcastTargets.some((target) => target.length === 0))
					return err("E-ARG", "--to needs a session id");
				if (broadcastTargets.length < 2)
					return err("E-ARG", "broadcast requires at least two --to <id> targets");
				if (new Set(broadcastTargets).size !== broadcastTargets.length)
					return err("E-ARG", "broadcast targets must be unique");
				if (pos.length !== 1) return err("E-ARG", 'usage: pij send --to <id> --to <id> "<text>"');
				if (flags.command !== undefined || flags.file !== undefined || flags.caption !== undefined)
					return err(
						"E-ARG",
						"broadcast supports text only; --command and --file are single-target",
					);
				let waitMs: number | undefined;
				if (typeof flags.wait === "string") {
					if (!/^\d+$/.test(flags.wait))
						return err("E-ARG", "--wait takes an optional milliseconds value");
					waitMs = Number(flags.wait);
				}
				const first = broadcastTargets[0];
				if (first === undefined) return err("E-ARG", "broadcast requires at least two targets");
				return ok({
					verb: "send",
					to: first,
					targets: broadcastTargets,
					broadcast: true,
					text: pos[0],
					wait: flags.wait !== undefined,
					waitMs,
					json,
				});
			}
			const to = pos[0];
			if (to === undefined) return err("E-ARG", 'usage: pij send <id> "<text>" | --command <name>');
			if (flags.command === true)
				return err("E-ARG", `--command needs a name (allowed: ${ALLOWED_COMMANDS.join(", ")})`);
			let command = typeof flags.command === "string" ? flags.command : undefined;
			let text = pos[1];
			// Reference-passing attachment (Plan 026 Phase 5): `--file <path>` carries one
			// local file, `--caption <text>` its caption. The file path + caption ride the
			// message's `attachments` field; only the telegram bridge acts on it. A bare
			// `--caption` without `--file` is a user error (nothing to caption), and a file
			// is mutually exclusive with `--command` (a remote command can't carry media).
			if (flags.file === true) return err("E-ARG", "--file needs a path");
			const file = typeof flags.file === "string" ? flags.file : undefined;
			if (flags.caption === true) return err("E-ARG", "--caption needs text");
			const caption = typeof flags.caption === "string" ? flags.caption : undefined;
			if (caption !== undefined && file === undefined)
				return err("E-ARG", "--caption requires --file <path>");
			if (file !== undefined && command !== undefined)
				return err("E-ARG", "pij send takes --file OR --command <name>, not both");
			// Ergonomic (D-042): a bare "/compact" | "/reload" | "/new" text body is
			// almost certainly meant as a remote command, not a chat line for the
			// peer's LLM. Route an EXACT, trimmed "/"+allow-listed name to the command
			// path so it executes instead of leaking as text. Anything else (extra
			// words, unknown name) stays plain text.
			if (command === undefined && text !== undefined) {
				const slug = text.trim();
				if (slug.startsWith("/")) {
					const name = slug.slice(1);
					if ((ALLOWED_COMMANDS as readonly string[]).includes(name)) {
						command = name;
						text = undefined;
					}
				}
			}
			if (command !== undefined && text !== undefined)
				return err("E-ARG", "pij send takes a <text> OR --command <name>, not both");
			if (command === undefined && text === undefined && file === undefined)
				return err("E-ARG", 'usage: pij send <id> "<text>" | --command <name> | --file <path>');
			let waitMs: number | undefined;
			if (typeof flags.wait === "string") {
				if (!/^\d+$/.test(flags.wait))
					return err("E-ARG", "--wait takes an optional milliseconds value");
				waitMs = Number(flags.wait);
			}
			return ok({
				verb: "send",
				to,
				text,
				command,
				file,
				caption,
				wait: flags.wait !== undefined,
				waitMs,
				json,
			});
		}
		case "dispatch": {
			const to = pos[0];
			if (to === undefined || to.trim() === "") {
				return err("E-ARG", "usage: pij dispatch <id> --packet <file> [--wait]");
			}
			if (flags.packet === true || flags.packet === "") {
				return err("E-ARG", "--packet needs a file path");
			}
			const packetPath = typeof flags.packet === "string" ? flags.packet : undefined;
			if (packetPath === undefined) {
				return err("E-ARG", "usage: pij dispatch <id> --packet <file> [--wait]");
			}
			let waitMs: number | undefined;
			if (typeof flags.wait === "string") {
				if (!/^\d+$/.test(flags.wait)) {
					return err("E-ARG", "--wait takes an optional milliseconds value");
				}
				waitMs = Number(flags.wait);
			}
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "dispatch-packet",
				to,
				packetPath,
				wait: flags.wait !== undefined,
				waitMs,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "ack": {
			const dispatchId = pos[0];
			if (dispatchId === undefined || dispatchId.trim() === "") {
				return err("E-ARG", "usage: pij ack <dispatch-id> --packet-sha <sha256>");
			}
			if (flags["packet-sha"] === true || flags["packet-sha"] === "") {
				return err("E-ARG", "--packet-sha needs a sha256 value");
			}
			const packetSha256 =
				typeof flags["packet-sha"] === "string" ? flags["packet-sha"] : undefined;
			if (packetSha256 === undefined) {
				return err("E-ARG", "usage: pij ack <dispatch-id> --packet-sha <sha256>");
			}
			if (!/^[a-f0-9]{64}$/.test(packetSha256)) {
				return err("E-ARG", "--packet-sha needs a lowercase 64-character sha256 value");
			}
			return ok({ verb: "ack-dispatch", dispatchId, packetSha256, json });
		}
		case "canary": {
			const to = pos[0];
			if (to === undefined || to.trim() === "") {
				return err("E-ARG", "usage: pij canary <id> [--expect-model <model>] [--wait[=MS]]");
			}
			if (flags["expect-model"] === true || flags["expect-model"] === "") {
				return err("E-ARG", "--expect-model needs a model id");
			}
			let waitMs: number | undefined;
			if (typeof flags.wait === "string") {
				if (!/^\d+$/.test(flags.wait)) {
					return err("E-ARG", "--wait takes an optional milliseconds value");
				}
				waitMs = Number(flags.wait);
			}
			return ok({
				verb: "canary",
				to,
				expectedModel:
					typeof flags["expect-model"] === "string" ? flags["expect-model"] : undefined,
				waitMs,
				json,
			});
		}
		case "tail": {
			const id = pos[0];
			if (id === undefined)
				return err("E-ARG", "usage: pij tail <id> [--since N --type T --lines N --follow]");
			const since = pnum(flags.since);
			if (since === "bad") return err("E-ARG", "--since takes a number");
			const lines = pnum(flags.lines);
			if (lines === "bad") return err("E-ARG", "--lines takes a number");
			if (flags.type === true) return err("E-ARG", "--type takes an event type");
			return ok({
				verb: "tail",
				id,
				since,
				type: typeof flags.type === "string" ? flags.type : undefined,
				lines,
				follow: flags.follow === true,
				json,
			});
		}
		case "state": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij state <id>");
			return ok({ verb: "state", id, json });
		}
		case "watchdog": {
			const action = pos[0];
			const actions = new Set<WatchdogAction>([
				"status",
				"pause",
				"resume",
				"exempt",
				"reset",
				"interval",
				"watch",
				"unwatch",
				"list",
				"disable-all",
				"enable-all",
			]);
			if (!action || !actions.has(action as WatchdogAction)) {
				return err(
					"E-ARG",
					"usage: pij watchdog <status|pause|resume|exempt|reset|interval|watch|unwatch|list|disable-all|enable-all> [id] [duration]",
				);
			}
			const typedAction = action as WatchdogAction;
			const id = pos[1];
			// Machine-wide switch (Plan 056): no id, no flags.
			if (typedAction === "disable-all" || typedAction === "enable-all") {
				if (id !== undefined) return err("E-ARG", `pij watchdog ${typedAction} takes no id`);
				return ok({ verb: "watchdog", action: typedAction, json });
			}
			// Set a per-peer timeout (Plan 056): `interval <id> <duration>`, human
			// durations (30s/20m/1h) or bare ms.
			if (typedAction === "interval") {
				if (!id) return err("E-ARG", "usage: pij watchdog interval <id> <duration>");
				const raw = pos[2];
				if (raw === undefined)
					return err("E-ARG", "usage: pij watchdog interval <id> <duration> (e.g. 20m, 1h, 30s)");
				const intervalMs = parseWatchdogInterval(raw);
				if (intervalMs === null)
					return err("E-ARG", `invalid duration '${raw}' — use e.g. 30s, 20m, 1h, or ms`);
				return ok({ verb: "watchdog", action: typedAction, id, intervalMs, json });
			}
			if (typedAction === "exempt") {
				if (!id) return err("E-ARG", "pij watchdog exempt needs a session id");
				const raw = pos[2];
				const exemptDurationMs =
					raw === undefined ? DEFAULT_WATCHDOG_EXEMPT_TTL_MS : parseWatchdogInterval(raw);
				if (exemptDurationMs === null)
					return err("E-ARG", `invalid duration '${raw}' — use e.g. 30s, 20m, 1h, or ms`);
				return ok({ verb: "watchdog", action: typedAction, id, exemptDurationMs, json });
			}
			if (typedAction === "list") {
				if (id !== undefined) return err("E-ARG", "pij watchdog list takes no id");
				if (
					flags.capture !== undefined ||
					flags["max-lines"] !== undefined ||
					flags["max-bytes"] !== undefined
				) {
					return err("E-ARG", "capture flags are valid only for 'pij watchdog watch'");
				}
				return ok({ verb: "watchdog", action: typedAction, json });
			}
			if (!id) return err("E-ARG", `pij watchdog ${typedAction} needs a session id`);
			// Strict arity: the family cap is 3 (for `interval <id> <duration>`),
			// but every OTHER verb here takes exactly <id> — a stray third
			// positional is a mistake, not silently ignored. (interval + the global
			// switch already returned above.)
			if (pos[2] !== undefined) {
				return err("E-ARG", `pij watchdog ${typedAction} takes only <id>`);
			}
			if (
				typedAction !== "watch" &&
				(flags.capture !== undefined ||
					flags["max-lines"] !== undefined ||
					flags["max-bytes"] !== undefined)
			) {
				return err("E-ARG", "capture flags are valid only for 'pij watchdog watch'");
			}
			if (flags.capture === true) return err("E-ARG", "--capture needs anomaly|always|never");
			const mode = typeof flags.capture === "string" ? flags.capture : undefined;
			if (mode !== undefined && mode !== "anomaly" && mode !== "always" && mode !== "never") {
				return err("E-ARG", "--capture needs anomaly|always|never");
			}
			const maxLines = pnum(flags["max-lines"]);
			if (maxLines === "bad") return err("E-ARG", "--max-lines takes a number");
			const maxBytes = pnum(flags["max-bytes"]);
			if (maxBytes === "bad") return err("E-ARG", "--max-bytes takes a number");
			const capture: WatchdogCapturePolicy | undefined =
				mode !== undefined || maxLines !== undefined || maxBytes !== undefined
					? {
							...(mode !== undefined ? { mode } : {}),
							...(maxLines !== undefined ? { maxLines } : {}),
							...(maxBytes !== undefined ? { maxBytes } : {}),
						}
					: undefined;
			return ok({ verb: "watchdog", action: typedAction, id, capture, json });
		}
		case "phonehome":
			return ok({ verb: "phonehome", json });
		case "tree": {
			const rootId = pos[0];
			const global = flags.global === true;
			if (rootId !== undefined && global) {
				return err("E-ARG", "pij tree takes a positional <id> OR --global, not both");
			}
			const activities = repeated.activity ?? [];
			const livenessValues = repeated.liveness ?? [];
			const lifecycles = repeated.lifecycle ?? [];
			if (flags.activity === true || activities.some((value) => value.length === 0)) {
				return err("E-ARG", "--activity needs working|idle|done");
			}
			if (flags.liveness === true || livenessValues.some((value) => value.length === 0)) {
				return err("E-ARG", "--liveness needs active|stale|dead|dissolved");
			}
			if (flags.lifecycle === true || lifecycles.some((value) => value.length === 0)) {
				return err("E-ARG", "--lifecycle needs pending|ready|bound|failed|dissolved");
			}
			const validActivities = new Set<TreeActivity>(["working", "idle", "done"]);
			const validLiveness = new Set<LivenessVerdict>(["active", "stale", "dead", "dissolved"]);
			const validLifecycles = new Set<SessionLifecycle>([
				"pending",
				"ready",
				"bound",
				"failed",
				"dissolved",
			]);
			const invalidActivity = activities.find(
				(value) => !validActivities.has(value as TreeActivity),
			);
			if (invalidActivity) return err("E-ARG", `invalid --activity '${invalidActivity}'`);
			const invalidLiveness = livenessValues.find(
				(value) => !validLiveness.has(value as LivenessVerdict),
			);
			if (invalidLiveness) return err("E-ARG", `invalid --liveness '${invalidLiveness}'`);
			const invalidLifecycle = lifecycles.find(
				(value) => !validLifecycles.has(value as SessionLifecycle),
			);
			if (invalidLifecycle) return err("E-ARG", `invalid --lifecycle '${invalidLifecycle}'`);
			const filters: TreeFilters = {
				...(activities.length > 0 ? { activity: activities as TreeActivity[] } : {}),
				...(livenessValues.length > 0 ? { liveness: livenessValues as LivenessVerdict[] } : {}),
				...(lifecycles.length > 0 ? { lifecycle: lifecycles as SessionLifecycle[] } : {}),
				...(flags.all === true ? { all: true } : {}),
			};
			return ok({ verb: "tree", rootId, global, filters, json });
		}
		case "link": {
			const childId = pos[0];
			if (childId === undefined) {
				return err("E-ARG", "usage: pij link <child> --parent <parent> | --root");
			}
			if (flags.parent === true) return err("E-ARG", "--parent needs a session id");
			const parentId = typeof flags.parent === "string" ? flags.parent : undefined;
			if (parentId !== undefined && parentId.trim() === "") {
				return err("E-ARG", "--parent needs a non-empty session id");
			}
			const root = flags.root === true;
			if ((parentId === undefined) === !root) {
				return err("E-ARG", "pij link requires exactly one of --parent <parent> or --root");
			}
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "link",
				childId,
				parentId: root ? null : (parentId as string),
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "path": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij path <id> [--events|--state|--dir]");
			const which = flags.events === true ? "events" : flags.state === true ? "state" : "dir";
			return ok({ verb: "path", id, which, json });
		}
		case "project create": {
			const description = pos[0];
			if (description === undefined)
				return err("E-ARG", 'usage: pij project create "<description>" [--slug <slug>]');
			if (flags.slug === true || flags.slug === "")
				return err("E-ARG", "--slug needs a kebab slug");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "project-create",
				description,
				slug: typeof flags.slug === "string" ? flags.slug : undefined,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "project list":
			return ok({ verb: "project-list", json });
		case "project show": {
			const slug = pos[0];
			if (slug === undefined) return err("E-ARG", "usage: pij project show <slug>");
			return ok({ verb: "project-show", slug, json });
		}
		case "project set": {
			const slug = pos[0];
			if (slug === undefined)
				return err("E-ARG", "usage: pij project set <slug> [--plan <path>] [--prime <id>]");
			if (flags.plan === true) return err("E-ARG", "--plan needs a path");
			if (flags.prime === true) return err("E-ARG", "--prime needs a session id");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "project-set",
				slug,
				planPath: typeof flags.plan === "string" ? flags.plan : undefined,
				primeId: typeof flags.prime === "string" ? flags.prime : undefined,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "stream create": {
			if (flags.project === true || flags.project === "")
				return err("E-ARG", "--project needs a project slug");
			if (flags.slug === true || flags.slug === "")
				return err("E-ARG", "--slug needs a stream slug");
			const project = typeof flags.project === "string" ? flags.project : undefined;
			const slug = typeof flags.slug === "string" ? flags.slug : undefined;
			if (project === undefined || slug === undefined) {
				return err(
					"E-ARG",
					"usage: pij stream create --project <slug> --slug <stream> [--base <ref>] [--ordinal N]",
				);
			}
			if (flags.base === true || flags.base === "") return err("E-ARG", "--base needs a git ref");
			const ordinal = pnum(flags.ordinal);
			if (ordinal === "bad" || ordinal === 0)
				return err("E-ARG", "--ordinal needs a positive integer");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "stream-create",
				project,
				slug,
				baseRef: typeof flags.base === "string" ? flags.base : undefined,
				ordinal,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "stream close": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij stream close <allocation-id>");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "stream-close",
				id,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "fence set": {
			const stream = pos[0];
			if (stream === undefined)
				return err("E-ARG", "usage: pij fence set <stream> --paths <a,b> [--shared <x,y>]");
			if (flags.paths === true || flags.paths === "") {
				return err("E-ARG", "--paths needs a comma-separated touch set");
			}
			if (flags.shared === true) {
				return err("E-ARG", "--shared needs a comma-separated path list");
			}
			const touchSet =
				typeof flags.paths === "string"
					? flags.paths
							.split(",")
							.map((path) => path.trim())
							.filter((path) => path !== "")
					: [];
			if (touchSet.length === 0) return err("E-ARG", "fence set requires --paths <a,b>");
			const shared =
				typeof flags.shared === "string"
					? flags.shared
							.split(",")
							.map((path) => path.trim())
							.filter((path) => path !== "")
					: [];
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "fence-set",
				stream,
				touchSet,
				shared,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "fence show": {
			if (flags.path === true || flags.path === "") return err("E-ARG", "--path needs a repo path");
			return ok({
				verb: "fence-show",
				path: typeof flags.path === "string" ? flags.path : undefined,
				json,
			});
		}
		case "task set": {
			const node = pos[0];
			const task = pos[1];
			if (node === undefined || task === undefined)
				return err("E-ARG", 'usage: pij task set <node> "<task>" [--project <slug>]');
			if (flags.project === true) return err("E-ARG", "--project takes a project slug");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "task-set",
				node,
				task,
				projectSlug: typeof flags.project === "string" ? flags.project : undefined,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "state set": {
			const node = pos[0];
			const state = pos[1];
			if (node === undefined || state === undefined)
				return err(
					"E-ARG",
					"usage: pij state set <node> <state> [--assignment <id>] [--refs <r,s>]",
				);
			// WS-6: the semantic vocabulary is human-ruled and closed — an
			// unknown word is a user error naming the whole vocabulary.
			if (!isSemanticState(state))
				return err("E-ARG", `invalid semantic state '${state}' (${SEMANTIC_STATES.join("|")})`);
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			if (flags.refs === true) return err("E-ARG", "--refs takes a comma-separated list");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			const stateRefs =
				typeof flags.refs === "string"
					? flags.refs
							.split(",")
							.map((ref) => ref.trim())
							.filter((ref) => ref !== "")
					: [];
			return ok({
				verb: "state-set",
				node,
				state,
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
				refs: stateRefs,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "state verify": {
			const node = pos[0];
			if (node === undefined)
				return err("E-ARG", "usage: pij state verify <node> [--assignment <id>]");
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "state-verify",
				node,
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "state clear": {
			const node = pos[0];
			if (node === undefined)
				return err("E-ARG", "usage: pij state clear <node> [--assignment <id>]");
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "state-clear",
				node,
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "node show": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij node show <id> [--json]");
			return ok({ verb: "node-show", id, json });
		}
		case "anomalies": {
			if (flags.project === true) return err("E-ARG", "--project takes a project slug");
			return ok({
				verb: "anomalies",
				json,
				here: flags.here === true,
				project: typeof flags.project === "string" ? flags.project : undefined,
			});
		}
		case "spine append": {
			if (flags.kind === true) return err("E-ARG", "--kind takes an event kind");
			const kind = typeof flags.kind === "string" ? flags.kind : undefined;
			if (kind === undefined) return err("E-ARG", "spine append requires --kind <kind>");
			if (flags.refs === true) return err("E-ARG", "--refs takes a comma-separated list");
			if (flags.peer === true) return err("E-ARG", "--peer takes a session id");
			if (flags.project === true) return err("E-ARG", "--project takes a project slug");
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			const refs =
				typeof flags.refs === "string"
					? flags.refs
							.split(",")
							.map((ref) => ref.trim())
							.filter((ref) => ref !== "")
					: [];
			// Probe-safety (dogfood: two stray junk events in one day — seq 1538
			// 'x', seq 2785 projectless): a kind-only append with NO linking
			// context is almost always an accidental usage probe against an
			// irreversible log. Deliberate bare events opt in with --bare.
			if (
				refs.length === 0 &&
				typeof flags.peer !== "string" &&
				typeof flags.project !== "string" &&
				flags.bare !== true
			) {
				return err(
					"E-ARG",
					"kind-only append with no --refs/--project/--peer — the spine is append-only and this is usually an accidental probe; link the event, or pass --bare to append deliberately",
				);
			}
			return ok({
				verb: "spine-append",
				kind,
				refs,
				peer: typeof flags.peer === "string" ? flags.peer : undefined,
				project: typeof flags.project === "string" ? flags.project : undefined,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "spine events": {
			const since = pnum(flags.since);
			if (since === "bad") return err("E-ARG", "--since takes a number");
			if (flags.peer === true) return err("E-ARG", "--peer takes a session id");
			if (flags.project === true) return err("E-ARG", "--project takes a project slug");
			return ok({
				verb: "spine-events",
				since,
				peer: typeof flags.peer === "string" ? flags.peer : undefined,
				project: typeof flags.project === "string" ? flags.project : undefined,
				json,
			});
		}
		case "spine render": {
			if (flags.project === true) return err("E-ARG", "--project takes a project slug");
			return ok({
				verb: "spine-render",
				project: typeof flags.project === "string" ? flags.project : undefined,
				json,
			});
		}
		default:
			return err(
				"E-ARG",
				`unknown command '${verb}' (whoami|list|sessions|models|send|dispatch|ack|canary|tail|state|watchdog|phonehome|tree|link|path|project|spine|task|node|anomalies)`,
			);
	}
}

// ─── render helpers (pure) ──────────────────────────────────────────────────
function hhmmss(iso: string | undefined): string {
	if (!iso) return "—";
	const t = iso.slice(11, 19);
	return t || "—";
}

function humanAge(ms: number | null): string {
	if (ms === null) return "never";
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m${s % 60}s`;
	const h = Math.floor(m / 60);
	return `${h}h${m % 60}m`;
}

function descAgeMs(d: SessionDescriptor, nowMs: number): number | null {
	if (!d.lastEventAt) return null;
	const t = Date.parse(d.lastEventAt);
	return Number.isNaN(t) ? null : nowMs - t;
}

function watchdogBlock(
	d: SessionDescriptor,
	sidecar: WatchdogSidecar | undefined,
	globallyDisabled = false,
	nowMs = Date.now(),
) {
	const reconciled = reconcileWatchdogExemption(sidecar, nowMs);
	const normalized = reconciled.sidecar;
	const cfg = effectiveWatchdog(normalized);
	const exemptUntilMs =
		reconciled.effectivePause === "exempt" && normalized?.exemptUntilMs !== undefined
			? normalized.exemptUntilMs
			: null;
	const exemptRemainingMs = exemptUntilMs === null ? null : Math.max(0, exemptUntilMs - nowMs);
	// A relay/bridge is born exempt and never watched (Plan 056) — report that
	// truthfully rather than `enabled`, the same effective-state invariant as the
	// global switch: what status says must match scheduler eligibility.
	const relay = d.relay === true;
	return {
		// The machine-wide switch and the relay class both dominate the per-session
		// config: a globally-disabled runtime, or a relay peer, fires nothing
		// regardless of sidecar — so never say `enabled` for either.
		enabled: cfg.enabled && !globallyDisabled && !relay,
		globallyDisabled,
		relay,
		intervalMs: cfg.intervalMs,
		pausedBy: reconciled.effectivePause ?? null,
		exempt: reconciled.effectivePause === "exempt",
		exemptUntilMs,
		exemptRemainingMs,
		lastFireAt: d.lastWatchdogFireAt ?? null,
		watchers: (normalized?.watchers ?? []).map((watcher) => watcher.watcherId),
	};
}

function fail(code: PijErrorCode, message: string, json: boolean): CliResult {
	const stderr = json ? JSON.stringify({ error: code, message }) : `${code}: ${message}`;
	return { stdout: "", stderr, exitCode: EXIT[code] };
}

function selfId(deps: CliDeps): Result<SessionId> {
	const envId = deps.process.env("PIJ_SESSION_ID");
	const pane = deps.process.env("TMUX_PANE");
	const explicitId = envId?.trim() || undefined;
	const ambient = deps.resolveAmbientSelf?.();
	if (ambient) {
		if (!ambient.ok) return ambient;
		if (ambient.value) {
			if (explicitId && explicitId !== ambient.value) {
				return err(
					"E-AMBIG",
					`PIJ_SESSION_ID ${explicitId} does not match ambient session ${ambient.value}`,
				);
			}
			return ok(ambient.value);
		}
	}
	if (explicitId) return resolveSelf(explicitId, [], pane);
	// Pane-first across the FULL registry (FX001-1 / DL-003): tmux pane ids are
	// server-global, so a registered pane identifies the caller regardless of cwd.
	// The folder filter below starved resolveSelf's pane branch on cross-repo
	// calls, silently losing spawnedBy (reports then died E-NOREPORTTARGET).
	if (pane && pane.trim() !== "") {
		const byPane = deps.registry.list().filter((d) => d.paneId === pane);
		const only = byPane[0];
		if (byPane.length === 1 && only) return resolveSelf(only.id, [], pane);
	}
	return resolveSelf(undefined, filterByFolder(deps.registry.list(), deps.cwd), pane);
}

// ─── platform attribution + ports (plan 054) ────────────────────────────────
/** WRITE-verb attribution (convention F2): `--actor <label>` asserts and WINS
 *  even over a resolvable self; otherwise the resolved self attributes;
 *  otherwise refuse, naming --actor as the escape hatch. READ verbs never call
 *  this. */
function resolveActor(
	asserted: string | undefined,
	deps: CliDeps,
): Result<{ readonly actor: string; readonly provenance: ActorProvenance }> {
	if (asserted !== undefined) return ok({ actor: asserted, provenance: "asserted" });
	const s = selfId(deps);
	if (!s.ok) return err(s.code, `${s.message} (pass --actor <label> to assert attribution)`);
	return ok({ actor: s.value, provenance: "resolved" });
}

/** The plan-054 stores are optional on CliDeps so legacy deps-sites compile
 *  unchanged; the family verbs need them wired (the bin always wires them). */
function platformPorts(deps: CliDeps): Result<{
	readonly projectStore: ProjectStorePort;
	readonly spineLog: SpineLogPort;
	readonly opJournal?: OpJournalPort;
}> {
	if (!deps.projectStore || !deps.spineLog)
		return err("E-NOREG", "project/spine stores are not wired — update the pij bin");
	return ok({
		projectStore: deps.projectStore,
		spineLog: deps.spineLog,
		...(deps.opJournal ? { opJournal: deps.opJournal } : {}),
	});
}

/** WRITE verbs additionally require the op journal (HIGH-2 coupled write +
 *  start-of-verb recovery) and the machine-wide platform write lock (review
 *  002 G2/G3). READ verbs stay on platformPorts — no journal, no lock, no
 *  recovery. */
interface PlatformWritePorts {
	readonly projectStore: ProjectStorePort;
	readonly assignmentStore: AssignmentStorePort;
	readonly allocationStore: AllocationStorePort;
	readonly fenceStore: FenceStorePort;
	readonly dispatchStore: DispatchStorePort;
	readonly spineLog: SpineLogPort;
	readonly opJournal: OpJournalPort;
	readonly platformWriteLock: PlatformWriteLockPort;
}

function platformWritePorts(deps: CliDeps): Result<PlatformWritePorts> {
	const ports = platformPorts(deps);
	if (!ports.ok) return ports;
	const { projectStore, spineLog, opJournal } = ports.value;
	// The assignment store joined the WRITE-port set in plan 054 P2 (T005):
	// recovery adjudicates assignment coupled ops against it, so every WRITE
	// verb needs it wired even before the assignment verbs run.
	if (
		!opJournal ||
		!deps.platformWriteLock ||
		!deps.assignmentStore ||
		!deps.allocationStore ||
		!deps.fenceStore ||
		!deps.dispatchStore
	)
		return err("E-NOREG", "project/spine stores are not wired — update the pij bin");
	return ok({
		projectStore,
		assignmentStore: deps.assignmentStore,
		allocationStore: deps.allocationStore,
		fenceStore: deps.fenceStore,
		dispatchStore: deps.dispatchStore,
		spineLog,
		opJournal,
		platformWriteLock: deps.platformWriteLock,
	});
}

function recoverPlatformWrites(ports: PlatformWritePorts): Result<unknown> {
	return recoverPendingOps(
		ports.opJournal,
		ports.spineLog,
		ports.projectStore,
		ports.assignmentStore,
		ports.allocationStore,
		ports.fenceStore,
		ports.dispatchStore,
	);
}

// ─── models helpers (pure) ──────────────────────────────────────────────────
/** Map a pi provider key (or harness name) to a pij harness. Exported so the
 *  `pij agent` CLI surface can derive a pack's HARNESS column from its model's
 *  provider without re-deriving the mapping (plan 029 T002 / KF-03). */
export const PROVIDER_HARNESS_MAP: Record<string, string> = {
	"github-copilot": "copilot",
	copilot: "copilot",
	claude: "claude",
	codex: "codex",
	pi: "pi",
};

function providerMatchesHarness(provider: string, harness: string): boolean {
	const mapped = PROVIDER_HARNESS_MAP[provider];
	return mapped === harness || provider === harness;
}

type SendLiveness = "active" | "stale" | "dead" | "dissolved";

interface PreflightTarget {
	readonly id: SessionId;
	readonly descriptor: SessionDescriptor;
	readonly liveness: SendLiveness;
}

interface SendSuccess {
	readonly to: SessionId;
	readonly messageId: string;
	readonly kind: string;
	readonly receipt: "queued" | "delivered";
	readonly liveness: SendLiveness;
	readonly daemonLastTickAt?: string | null;
	readonly daemonTickAgeMs?: number | null;
	readonly daemonTickStale?: boolean;
}

interface SendFailure {
	readonly to: SessionId;
	readonly error: PijErrorCode;
	readonly message: string;
}

function preflightSendTargets(
	targetIds: readonly SessionId[],
	self: SessionId,
	deps: CliDeps,
	now: number,
): Result<readonly PreflightTarget[]> {
	const targets: PreflightTarget[] = [];
	for (const id of targetIds) {
		if (id === self) return err("E-SELF", `cannot send to yourself (${self})`);
		const descriptor = deps.registry.read(id);
		if (!descriptor) return err("E-NOID", `no session '${id}' in registry`);
		const targetLiveness = liveOf(deps, descriptor, now);
		if (
			targetLiveness === "dissolved" ||
			(targetLiveness === "dead" && descriptor.deliveryMode !== "pull")
		) {
			const why = targetLiveness === "dissolved" ? "dissolved (closed)" : "dead (pid gone)";
			return err("E-DEAD", `session ${id} is ${why}`);
		}
		targets.push({ id, descriptor, liveness: targetLiveness });
	}
	return ok(targets);
}

function sendSuccess(
	target: PreflightTarget,
	messageId: string,
	kind: string,
	now: number,
): SendSuccess {
	const receipt =
		target.descriptor.deliveryMode === "pull"
			? "queued"
			: daemonReceiptAuthoritative(target.descriptor)
				? "queued"
				: (target.descriptor.state ?? "idle") === "working"
					? "queued"
					: "delivered";
	const tickStatus = daemonReceiptAuthoritative(target.descriptor)
		? daemonTickStatus(target.descriptor.lastTickAt, now)
		: undefined;
	return {
		to: target.id,
		messageId,
		kind,
		receipt,
		liveness: target.liveness,
		...(tickStatus ?? {}),
	};
}

function renderBroadcastSuccess(
	result: SendSuccess,
	target: SessionDescriptor,
	now: number,
): string {
	const recvHint =
		result.receipt === "queued"
			? target.deliveryMode === "pull"
				? "queued: awaiting inbox check"
				: daemonReceiptAuthoritative(target)
					? isCompacting(target, now)
						? "queued: target compacting"
						: result.daemonTickStale
							? `queued: daemon tick stale (${humanAge(result.daemonTickAgeMs ?? null)} old)`
							: "queued: awaiting daemon delivery confirmation"
					: "queued: peer is busy, will steer after current turn"
			: "delivered: peer was idle";
	const targetAgeMs = descAgeMs(target, now);
	const warn =
		targetAgeMs === null || targetAgeMs > STALE_AFTER_MS
			? " (note: no recent pij events from peer — normal for a control-plane peer; the send still lands)"
			: "";
	return `sent → ${result.to}  ${result.kind}${warn}  (${recvHint})`;
}

// ─── dispatch ───────────────────────────────────────────────────────────────
export function dispatch(cmd: ParsedCommand, deps: CliDeps): CliResult {
	const now = deps.process.now();
	switch (cmd.verb) {
		case "watchdog": {
			const store = deps.watchdogStore;
			if (!store) return fail("E-ARG", "watchdog sidecar store is unavailable", cmd.json);
			if (cmd.action === "disable-all" || cmd.action === "enable-all") {
				const globalStore = deps.watchdogGlobalStore;
				if (!globalStore) return fail("E-ARG", "watchdog global store is unavailable", cmd.json);
				const enable = cmd.action === "enable-all";
				globalStore.setEnabled(enable);
				if (cmd.json) return okOut(JSON.stringify({ watchdog: { globallyDisabled: !enable } }));
				return okOut(
					enable
						? "watchdog ENABLED machine-wide — every session is watched again"
						: "watchdog DISABLED machine-wide — no session fires until `pij watchdog enable-all`",
				);
			}
			if (cmd.action === "list") {
				const globalOff = deps.watchdogGlobalStore?.disabled() ?? false;
				const rows = deps.registry.list().map((descriptor) => ({
					id: descriptor.id,
					watchdog: watchdogBlock(descriptor, store.read(descriptor.id), globalOff, now),
				}));
				if (cmd.json) return okOut(JSON.stringify(rows));
				return okOut(
					rows.length === 0
						? "no watchdog sessions"
						: rows
								.map(
									(row) =>
										`${row.id}: ${describeWatchdogState(row.watchdog)} · watchers ${row.watchdog.watchers.length}`,
								)
								.join("\n"),
				);
			}
			const id = cmd.id;
			if (!id) return fail("E-ARG", `pij watchdog ${cmd.action} needs a session id`, cmd.json);
			const descriptor = deps.registry.read(id);
			if (!descriptor) return fail("E-NOID", `no session '${id}' in registry`, cmd.json);
			const storedSidecar = store.read(id);
			const reconciled = reconcileWatchdogExemption(storedSidecar, now);
			if (reconciled.sidecar !== storedSidecar && reconciled.sidecar !== undefined) {
				store.write(id, reconciled.sidecar);
			}
			let sidecar = reconciled.sidecar ?? {};
			if (cmd.action === "reset") {
				// Back to default: on, 20 min, un-paused, UN-EXEMPT. The clean undo —
				// `resume` deliberately won't clear `exempt`, so this is the only way
				// to un-exempt a peer without hand-editing the sidecar (Plan 056).
				sidecar = {};
				store.write(id, sidecar);
			} else if (cmd.action === "interval") {
				if (cmd.intervalMs === undefined)
					return fail("E-ARG", "pij watchdog interval needs a duration", cmd.json);
				sidecar = { ...sidecar, intervalMs: cmd.intervalMs };
				store.write(id, sidecar);
			} else if (cmd.action === "pause") {
				if (sidecar.pausedBy === "exempt") {
					return fail(
						"E-ARG",
						`watchdog ${id} has an active exemption; pause cannot downgrade it`,
						cmd.json,
					);
				}
				sidecar = { ...sidecar, pausedBy: "self", pausedAtMs: now };
				store.write(id, sidecar);
			} else if (cmd.action === "resume") {
				sidecar = applyWatchdogResume(sidecar);
				store.write(id, sidecar);
			} else if (cmd.action === "exempt") {
				sidecar = applyWatchdogExemption(sidecar, now, cmd.exemptDurationMs);
				store.write(id, sidecar);
			} else if (cmd.action === "watch" || cmd.action === "unwatch") {
				const self = selfId(deps);
				if (!self.ok) return fail(self.code, self.message, cmd.json);
				const others = (sidecar.watchers ?? []).filter(
					(watcher) => watcher.watcherId !== self.value,
				);
				const watchers =
					cmd.action === "watch"
						? [
								...others,
								{
									watcherId: self.value,
									addedAt: new Date(now).toISOString(),
									capture: cmd.capture ?? { mode: "anomaly" as const },
								},
							]
						: others;
				sidecar = { ...sidecar, watchers };
				store.write(id, sidecar);
			}
			const block = watchdogBlock(
				descriptor,
				sidecar,
				deps.watchdogGlobalStore?.disabled() ?? false,
				now,
			);
			if (cmd.json) return okOut(JSON.stringify({ id, watchdog: block }));
			const expiry =
				block.exemptUntilMs === null
					? ""
					: ` · until ${new Date(block.exemptUntilMs).toISOString()} (${block.exemptRemainingMs}ms remaining)`;
			return okOut(
				`${id}: ${describeWatchdogState(block)} · interval ${block.intervalMs}ms${expiry} · watchers ${block.watchers.length}`,
			);
		}
		case "models": {
			let entries = deps.models ?? [];
			// pi proxies ALL providers — applying a provider filter would return nothing
			// because real provider keys are github-copilot, sakana, openrouter, etc.
			const harnessFilter = cmd.harnessFilter;
			if (harnessFilter && harnessFilter !== "pi") {
				entries = entries.filter((e) => providerMatchesHarness(e.provider, harnessFilter));
			}
			if (cmd.filter) {
				// Fuzzy filter: keep entries whose normalised id or name contains the query,
				// or match via closestModel.
				const q = cmd.filter.toLowerCase();
				const filtered = entries.filter(
					(e) => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
				);
				if (filtered.length > 0) {
					entries = filtered;
				} else {
					const closest = closestModel(cmd.filter, entries);
					entries = closest ? [closest] : [];
				}
			}
			if (entries.length === 0) {
				return okOut(
					cmd.json ? JSON.stringify([]) : "no models found (try a different filter or harness)",
				);
			}
			if (cmd.json) return okOut(JSON.stringify(entries));
			const lines = entries.map((e) => {
				const tag = e.verified ? "" : " *";
				// `thinking` column (#1): the canonical effort levels the model honors,
				// or `yes`/`—` when only the reasoning flag (not the level set) is known.
				const thinking = e.levels?.length ? e.levels.join("/") : e.reasoning ? "yes" : "—";
				return `${pad(e.id, 36)} ${pad(e.name, 40)} ${pad(e.provider, 10)} ${thinking}${tag}`;
			});
			const header = `${pad("id", 36)} ${pad("name", 40)} ${pad("provider", 10)} thinking`;
			const unverNote = entries.some((e) => !e.verified)
				? "\n* unverified (best-effort alias list — not confirmed by a live registry)"
				: "";
			return okOut([header, ...lines, `\n${entries.length} model(s)${unverNote}`].join("\n"));
		}
		case "whoami": {
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const d = deps.registry.read(s.value);
			if (!d) return fail("E-NOID", `no session '${s.value}' in registry`, cmd.json);
			// `--env` (AC-5): the eval-able self-identity block is the ONLY stdout.
			if (cmd.env) return okOut(buildExportLines(d));
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: d.id,
						folder: d.folder,
						dataDir: d.dataDir,
						state: d.state ?? "idle",
						pid: d.pid,
					}),
				);
			return okOut(
				[
					`pij session: ${d.id}`,
					`folder:      ${d.folder}`,
					`data dir:    ${d.dataDir}`,
					`state:       ${d.state ?? "idle"}`,
				].join("\n"),
			);
		}
		case "list": {
			let descs = deps.registry.list();
			if (cmd.here) descs = filterByFolder(descs, deps.cwd);
			if (cmd.prime) descs = filterPrime(descs);
			const s = selfId(deps);
			const self = s.ok ? s.value : undefined;
			const rows = descs.map((d) => {
				const live = liveOf(deps, d, now);
				return { d, live };
			});
			if (cmd.json)
				return okOut(
					JSON.stringify(
						rows.map(({ d, live }) => ({
							id: d.id,
							folder: d.folder,
							dataDir: d.dataDir,
							pid: d.pid,
							state: d.state ?? "idle",
							activity: activityOf(d.state, d.lastEventAt != null),
							liveness: live,
							lastEventAt: d.lastEventAt ?? null,
							boundModel: d.boundModel ?? null,
							boundProvider: d.boundProvider ?? null,
							effort: d.effort ?? null,
							failureReason: d.failureReason ?? null,
							terminal: d.terminal ?? null,
							watchdog: watchdogBlock(
								d,
								deps.watchdogStore?.read(d.id),
								deps.watchdogGlobalStore?.disabled() ?? false,
								now,
							),
							prime: d.prime === true,
							oldPrime: d.oldPrime === true,
							// Adoption axis (plan 054 P3, WS-1): explicit boolean in the
							// row projection so a UI/skill can filter without joins.
							unadopted: isUnadopted(d),
						})),
					),
				);
			if (rows.length === 0)
				return okOut(
					cmd.prime
						? cmd.here
							? "no prime pij sessions in this folder"
							: "no prime pij sessions"
						: cmd.here
							? "no pij sessions in this folder"
							: "no pij sessions",
				);
			const lines = rows.map(
				({ d, live }) =>
					`${d.id === self ? "★ " : "  "}${pad(d.id, 14)} ${d.prime === true ? "P" : d.oldPrime === true ? "O" : " "} ${pad(activityOf(d.state, d.lastEventAt != null), 8)} ${pad(live, 7)} ${pad(d.boundProvider ?? "—", 18)} ${pad(d.boundModel ?? "—", 28)} ${pad(d.effort ?? "—", 7)} ${d.folder}`,
			);
			const header = `  ${pad("id", 14)} P ${pad("activity", 8)} ${pad("liveness", 7)} ${pad("provider", 18)} ${pad("model", 28)} ${pad("effort", 7)} folder`;
			return okOut(
				[header, ...lines, `${rows.length} session(s)${self ? ` · ★ = you (${self})` : ""}`].join(
					"\n",
				),
			);
		}
		case "sessions": {
			// The telemetry join-table verb (AC-1/AC-2): a stable projection of the
			// already-persisted harness↔pij join keys (Finding 01/05) — no daemon, a
			// pure sibling of `list` decoupled from its human/live-state view.
			let descs = deps.registry.list();
			if (cmd.here) descs = filterByFolder(descs, deps.cwd);
			const rows = buildSessionJoinRows(descs);
			if (cmd.json) return okOut(JSON.stringify(rows));
			if (rows.length === 0)
				return okOut(cmd.here ? "no pij sessions in this folder" : "no pij sessions");
			// transcriptPath is LAST (longest, most-variable — codex-only) so the
			// aligned columns stay readable; `—` marks a null, same as the others.
			// Same-tuple parity with the `--json` projection above (AC-2).
			const lines = rows.map(
				(r) =>
					`${pad(r.pijId, 16)} ${pad(r.harness ?? "—", 8)} ${pad(r.harnessSessionId ?? "—", 38)} ${pad(r.lifecycle ?? "—", 8)} ${pad(r.boundModel ?? "—", 20)} ${pad(r.spawnedBy ?? "—", 14)} ${r.transcriptPath ?? "—"}`,
			);
			const header = `${pad("pij-id", 16)} ${pad("harness", 8)} ${pad("harness-session", 38)} ${pad("lifecycle", 8)} ${pad("model", 20)} ${pad("parent", 14)} transcript`;
			return okOut([header, ...lines, `${rows.length} session(s)`].join("\n"));
		}
		case "tree": {
			const descriptors = [...(deps.treeDescriptors ?? deps.registry.list())];
			let selectedIds: readonly SessionId[] | undefined;
			if (!cmd.global && cmd.rootId === undefined) {
				if (!deps.repository) {
					return fail(
						"E-ARG",
						"repository identity is unavailable; use pij tree --global",
						cmd.json,
					);
				}
				const selection = selectByRepository(descriptors, deps.cwd, deps.repository);
				if (selection.gitCommonDir === null) {
					return fail(
						"E-ARG",
						"current folder is not in a git repository; use pij tree --global or pij tree <id>",
						cmd.json,
					);
				}
				selectedIds = selection.descriptors.map((descriptor) => descriptor.id);
			}
			const sessions: TreeSession[] = descriptors.map((descriptor) => ({
				descriptor,
				activity: activityOf(descriptor.state, descriptor.lastEventAt !== undefined),
				liveness: liveOf(deps, descriptor, now),
			}));
			const projection = projectSessionForest(sessions, {
				selectedIds,
				rootId: cmd.rootId,
				filters: cmd.filters,
			});
			if (!projection.ok) return fail(projection.code, projection.message, cmd.json);
			return okOut(
				cmd.json
					? renderSessionForestJson(projection.value)
					: renderSessionForestHuman(projection.value),
			);
		}
		case "link": {
			const descriptors = [...(deps.treeDescriptors ?? deps.registry.list())];
			const current = deps.registry.read(cmd.childId);
			const planned = planLink(descriptors, cmd.childId, cmd.parentId);
			if (!planned.ok) return fail(planned.code, planned.message, cmd.json);
			// Re-parent audit event (plan 054 P3 T004): with the platform stores
			// wired, every link — including an attributed no-op (the adjudicated
			// no-op-set precedent) — appends an UNCOUPLED node-linked event.
			// Attribution resolves BEFORE any write (F2: refusal mutates nothing);
			// unwired stores = legacy deps-sites, which keep the descriptor-only
			// behavior byte-for-byte (the bin always wires).
			const wired = platformWritePorts(deps);
			let attribution: { actor: string; provenance: ActorProvenance } | undefined;
			if (wired.ok) {
				const resolved = resolveActor(cmd.actor, deps);
				if (!resolved.ok) return fail(resolved.code, resolved.message, cmd.json);
				attribution = { actor: resolved.value.actor, provenance: resolved.value.provenance };
			}
			const changed = current?.parentId !== cmd.parentId;
			if (changed) deps.registry.write(planned.value);
			// prev = the tree truth the link replaces (effectiveParent, the notion
			// every projection uses), not the raw parentId override — a spawned
			// child's first re-parent honestly records "was under its spawner".
			const prevParent = current === null ? null : effectiveParent(current);
			let spineSeq: number | null | undefined;
			let spineWarning: string | undefined;
			if (wired.ok && attribution !== undefined) {
				const ports = wired.value;
				const att = attribution;
				// V-05 uncoupled append under lock + recovery gate (runtime-axis
				// shape): descriptor truth already landed and never waits on the
				// spine; a failed append is surfaced, never forged past.
				const locked = ports.platformWriteLock.withPlatformWriteLock((): Result<number> => {
					const recovered = recoverPlatformWrites(ports);
					if (!recovered.ok) return recovered;
					const draft = buildSpineEvent({
						nowMs: now,
						actor: att.actor,
						kind: SPINE_KIND_NODE_LINKED,
						refs: [
							`node:${cmd.childId}`,
							...(cmd.parentId === null ? [] : [`parent:${cmd.parentId}`]),
						],
						peer: cmd.childId,
						...(prevParent === null ? {} : { prev: prevParent }),
						...(cmd.parentId === null ? {} : { next: cmd.parentId }),
						actorProvenance: att.provenance,
					});
					if (!draft.ok) return draft;
					const event = ports.spineLog.append(draft.value);
					if (!event.ok) return event;
					return ok(event.value.seq);
				});
				const outcome: Result<number> = locked.ok ? locked.value : locked;
				if (outcome.ok) {
					spineSeq = outcome.value;
				} else {
					spineSeq = null;
					spineWarning = `node-linked spine event not recorded: ${outcome.code}: ${outcome.message}`;
				}
			}
			if (cmd.json) {
				return okOut(
					JSON.stringify({
						id: cmd.childId,
						parentId: cmd.parentId,
						changed,
						...(spineSeq !== undefined ? { spineSeq } : {}),
						...(spineWarning !== undefined ? { spineWarning } : {}),
					}),
				);
			}
			const human =
				cmd.parentId === null
					? `${changed ? "linked" : "unchanged"} ${cmd.childId} → root`
					: `${changed ? "linked" : "unchanged"} ${cmd.childId} → ${cmd.parentId}`;
			return okOut(spineWarning === undefined ? human : `${human}  (WARNING: ${spineWarning})`);
		}
		case "send": {
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const self = s.value;
			const preflight = preflightSendTargets(cmd.targets ?? [cmd.to], self, deps, now);
			if (!preflight.ok) return fail(preflight.code, preflight.message, cmd.json);

			if (cmd.broadcast) {
				const results: Array<SendSuccess | SendFailure> = [];
				const humanLines: string[] = [];
				const waitTargets: WaitTarget[] = [];
				let deliveryFailed = false;
				for (const target of preflight.value) {
					const delivered = deps.delivery.deliver({
						from: self,
						to: target.id,
						body: cmd.text ?? "",
					});
					if (!delivered.ok) {
						deliveryFailed = true;
						results.push({
							to: target.id,
							error: delivered.code,
							message: delivered.message,
						});
						humanLines.push(`failed → ${target.id}  ${delivered.code}: ${delivered.message}`);
						continue;
					}
					const result = sendSuccess(target, delivered.value.messageId, "text", now);
					results.push(result);
					waitTargets.push({ to: target.id, messageId: delivered.value.messageId });
					humanLines.push(renderBroadcastSuccess(result, target.descriptor, now));
				}
				const exitCode = deliveryFailed ? 1 : 0;
				const follow =
					cmd.wait && waitTargets.length > 0
						? ({
								kind: "wait",
								self,
								targets: waitTargets,
								timeoutMs: cmd.waitMs,
								exitCode,
							} as const)
						: undefined;
				return {
					stdout: cmd.json ? JSON.stringify({ from: self, results }) : humanLines.join("\n"),
					stderr: "",
					exitCode,
					follow,
				};
			}

			const firstTarget = preflight.value[0];
			if (!firstTarget) return fail("E-NOID", `no session '${cmd.to}' in registry`, cmd.json);
			const target = firstTarget.descriptor;
			const live = firstTarget.liveness;
			let messageId: string;
			let kindNote: string;
			if (cmd.command !== undefined) {
				const v = validateCommand(cmd.command);
				if (!v.ok)
					return fail(
						"E-CMD",
						`unknown command '${cmd.command}' (allowed: ${ALLOWED_COMMANDS.join(", ")})`,
						cmd.json,
					);
				const del = deps.delivery.deliver({ from: self, to: cmd.to, body: "", command: v.value });
				if (!del.ok) return fail(del.code, del.message, cmd.json);
				messageId = del.value.messageId;
				kindNote = `command=${v.value}`;
			} else {
				// F1: deliver the RAW text — the receiver frames on inject. NEVER frame() here.
				// Plan 026 Phase 5: a `--file` attaches one reference-passing entry (path +
				// optional caption); the attachments field is added ONLY when a file is given,
				// so a plain text send round-trips byte-for-byte unchanged (no `attachments` key).
				const attachments =
					cmd.file !== undefined
						? [
								cmd.caption !== undefined
									? { path: cmd.file, caption: cmd.caption }
									: { path: cmd.file },
							]
						: undefined;
				const del = deps.delivery.deliver(
					attachments !== undefined
						? { from: self, to: cmd.to, body: cmd.text ?? "", attachments }
						: { from: self, to: cmd.to, body: cmd.text ?? "" },
				);
				if (!del.ok) return fail(del.code, del.message, cmd.json);
				messageId = del.value.messageId;
				kindNote =
					attachments !== undefined
						? cmd.text !== undefined && cmd.text !== ""
							? "text+file"
							: "file"
						: "text";
			}
			const initial =
				target.deliveryMode === "pull"
					? "queued"
					: daemonReceiptAuthoritative(target)
						? "queued"
						: (target.state ?? "idle") === "working"
							? "queued"
							: "delivered";
			const tickStatus = daemonReceiptAuthoritative(target)
				? daemonTickStatus(target.lastTickAt, now)
				: undefined;
			// Informational "quiet peer" note keys on event AGE, not the liveness
			// label: an idle/done peer is now `active` (INS-001), but a long-quiet
			// peer is still worth flagging to the sender. The send lands regardless.
			const targetAgeMs = descAgeMs(target, now);
			const warn =
				targetAgeMs === null || targetAgeMs > STALE_AFTER_MS
					? " (note: no recent pij events from peer — normal for a control-plane peer; the send still lands)"
					: "";
			const follow = cmd.wait
				? ({
						kind: "wait",
						self,
						targets: [{ to: cmd.to, messageId }],
						timeoutMs: cmd.waitMs,
						exitCode: 0,
					} as const)
				: undefined;
			if (cmd.json)
				return {
					stdout: JSON.stringify({
						to: cmd.to,
						from: self,
						messageId,
						kind: kindNote,
						receipt: initial,
						liveness: live,
						...(tickStatus ?? {}),
					}),
					stderr: "",
					exitCode: 0,
					follow,
				};
			const recvHint =
				initial === "queued"
					? target.deliveryMode === "pull"
						? "queued: awaiting inbox check"
						: daemonReceiptAuthoritative(target)
							? isCompacting(target, now)
								? "queued: target compacting"
								: tickStatus?.daemonTickStale
									? `queued: daemon tick stale (${humanAge(tickStatus.daemonTickAgeMs)} old)`
									: "queued: awaiting daemon delivery confirmation"
							: "queued: peer is busy, will steer after current turn"
					: "delivered: peer was idle";
			const tail = cmd.wait
				? ""
				: `\nreceipt → ${initial}   (also in: pij tail ${self} --type receipt)`;
			return {
				stdout: `sent → ${cmd.to}  ${kindNote}${warn}  (${recvHint})${tail}`,
				stderr: "",
				exitCode: 0,
				follow,
			};
		}
		case "tail": {
			const target = deps.registry.read(cmd.id);
			if (!target) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const evs = deps
				.eventLogFor(cmd.id)
				.read({ since: cmd.since, type: cmd.type, last: cmd.lines });
			const maxSeq = evs.reduce((m, e) => (e.seq > m ? e.seq : m), cmd.since ?? 0);
			const follow = cmd.follow
				? ({ kind: "tail", id: cmd.id, nextSince: maxSeq } as const)
				: undefined;
			if (cmd.json) return { stdout: JSON.stringify(evs), stderr: "", exitCode: 0, follow };
			if (evs.length === 0)
				return {
					stdout: `(no events${cmd.since !== undefined ? ` since ${cmd.since}` : ""})`,
					stderr: "",
					exitCode: 0,
					follow,
				};
			const body = evs.map((e) => renderEventLine(e, now)).join("\n");
			const newest = evs[evs.length - 1];
			const trailer = `(next: --since ${maxSeq} · newest event ${humanAge(newest ? now - Date.parse(newest.timestamp) : null)} ago)`;
			return {
				stdout: `${pad("seq", 5)} ${pad("ts", 8)} ${pad("age", 7)} ${pad("type", 12)} summary\n${body}\n${trailer}`,
				stderr: "",
				exitCode: 0,
				follow,
			};
		}
		case "state": {
			const d = deps.registry.read(cmd.id);
			if (!d) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const ageMs = descAgeMs(d, now);
			const live = liveOf(deps, d, now);
			const alive = deps.process.isAlive(d.pid);
			const tickStatus =
				d.lastTickAt !== undefined || daemonReceiptAuthoritative(d)
					? daemonTickStatus(d.lastTickAt, now)
					: null;
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: d.id,
						lifecycle: d.lifecycle ?? null,
						state: d.state ?? "idle",
						activity: activityOf(d.state, d.lastEventAt != null),
						liveness: live,
						lastEventAt: d.lastEventAt ?? null,
						pid: d.pid,
						ageMs,
						// First-class cwd + harness so a colleague's working dir is
						// machine-readable without scraping the tmux footer (feedback #4).
						cwd: d.folder,
						harness: d.harness ?? null,
						// Fail-loud model layer (T013): surface actual bound model + reason
						boundModel: d.boundModel ?? null,
						effort: d.effort ?? null,
						daemonLastTickAt: tickStatus?.daemonLastTickAt ?? null,
						daemonTickAgeMs: tickStatus?.daemonTickAgeMs ?? null,
						daemonTickStale: tickStatus?.daemonTickStale ?? null,
						failureReason: d.failureReason ?? null,
						terminal: d.terminal ?? null,
						watchdog: watchdogBlock(
							d,
							deps.watchdogStore?.read(d.id),
							deps.watchdogGlobalStore?.disabled() ?? false,
							now,
						),
					}),
				);
			const modelLine = d.boundModel ? `  ·  model: ${d.boundModel}` : "";
			const effortLine = d.effort ? `  ·  effort: ${d.effort}` : "";
			const tickLine = tickStatus
				? `  ·  daemon tick: ${tickStatus.daemonTickStale ? "stale" : "fresh"} (${humanAge(
						tickStatus.daemonTickAgeMs,
					)} old)`
				: "";
			const failLine = d.failureReason ? `  ·  failure: ${d.failureReason}` : "";
			const terminalLine = d.terminal
				? `  ·  terminal: ${d.terminal.disposition} at ${d.terminal.observedAt} (${d.terminal.evidence})${
						d.terminal.unavailableReason ? ` — ${d.terminal.unavailableReason}` : ""
					}`
				: "";
			return okOut(
				`${d.id}: ${activityOf(d.state, d.lastEventAt != null)} · ${live}   (last event ${humanAge(ageMs)} ago, pid ${d.pid} ${alive ? "alive" : "gone"})\n  cwd: ${d.folder}${d.harness ? `  ·  harness: ${d.harness}` : ""}${modelLine}${effortLine}${tickLine}${failLine}${terminalLine}`,
			);
		}
		case "phonehome": {
			// Confirmatory binding: the agent self-reports the current native id from
			// its own harness-specific env. A pending peer cannot pass ambient reverse-
			// join validation until this operation binds it, so the spawn-provided
			// explicit id remains the bootstrap identity for phonehome only.
			const explicitId = deps.process.env("PIJ_SESSION_ID");
			const s =
				explicitId && explicitId.trim() !== ""
					? resolveSelf(explicitId, [], deps.process.env("TMUX_PANE"))
					: selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const d = deps.registry.read(s.value);
			if (!d) return fail("E-NOID", `no session '${s.value}' in registry`, cmd.json);
			const harnessSessionId = resolvePhonehomeSessionId(d.harness ?? "pi", {
				CLAUDE_CODE_SESSION_ID: deps.process.env("CLAUDE_CODE_SESSION_ID"),
				COPILOT_AGENT_SESSION_ID: deps.process.env("COPILOT_AGENT_SESSION_ID"),
				CODEX_THREAD_ID: deps.process.env("CODEX_THREAD_ID"),
			});
			let bound = d;
			if (harnessSessionId && harnessSessionId.trim() !== "") {
				if (d.harnessSessionId !== harnessSessionId) {
					bound = applyBinding(d, harnessSessionId);
					deps.registry.write(bound);
				}
			}
			const confirmed = Boolean(bound.harnessSessionId);
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: bound.id,
						harness: bound.harness ?? null,
						harnessSessionId: bound.harnessSessionId ?? null,
						lifecycle: bound.lifecycle ?? null,
						confirmed,
					}),
				);
			return okOut(
				confirmed
					? `phoned home: ${bound.id} ↔ ${bound.harness ?? "?"} session ${bound.harnessSessionId} (${bound.lifecycle ?? "?"})`
					: `phoned home: ${bound.id} — no valid current-session env for ${bound.harness ?? "unknown"} (expected ${
							bound.harness === "copilot"
								? "COPILOT_AGENT_SESSION_ID UUID"
								: bound.harness === "codex"
									? "CODEX_THREAD_ID UUID"
									: "CLAUDE_CODE_SESSION_ID"
						})`,
			);
		}
		case "path": {
			const d = deps.registry.read(cmd.id);
			if (!d) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const p =
				cmd.which === "events"
					? d.eventsPath
					: cmd.which === "state"
						? `${deps.pijHome}/${d.id}.json`
						: d.dataDir;
			return okOut(cmd.json ? JSON.stringify({ path: p }) : p);
		}
		// ── plan 054 — project/spine family verbs ─────────────────────────────
		// Routed through ONE containment gate (HIGH-2 hard requirement b): no
		// exception may escape dispatch for a platform verb — a throwing port
		// becomes an E-NOREG CliResult naming the verb, never a crash.
		case "project-create":
		case "project-list":
		case "project-show":
		case "project-set":
		case "stream-create":
		case "stream-close":
		case "fence-set":
		case "fence-show":
		case "dispatch-packet":
		case "ack-dispatch":
		case "canary":
		case "spine-append":
		case "spine-events":
		case "spine-render":
		case "task-set":
		case "state-set":
		case "state-verify":
		case "state-clear":
		case "node-show":
		case "anomalies": {
			try {
				return dispatchPlatform(cmd, deps, now);
			} catch (error) {
				return fail("E-NOREG", `internal error in ${cmd.verb}: ${String(error)}`, cmd.json);
			}
		}
	}
}

/** The six platform verbs (plan 054), extracted so dispatch can wrap them in
 *  the no-throw containment gate above. WRITE verbs run the journal-FIRST
 *  coupled write (HIGH-2, lifecycle per review 002 G2/G3) UNDER the machine-
 *  wide platform write lock: recover every surviving op (or fail honestly —
 *  never write past an unresolvable predecessor), journal the draft event
 *  durably as an INTENT before any state commit, durably mark it COMMITTED
 *  after, append via appendOnce(opId, draft), clear on success — so committed
 *  state without its audit event never survives a single append failure and
 *  the spine never claims state that never landed. */
/** Fold an abort-path journal-clear Result into the primary error message
 *  (review 004 J2): the primary failure stays the headline, but a failed
 *  cleanup leaves a residual intent entry — adjudicated by the next verb's
 *  recovery — that the operator must hear about now, never silently. */
function withResidualDiagnostic(primary: string, cleared: Result<void>): string {
	if (cleared.ok) return primary;
	return `${primary} (journal cleanup also failed: ${cleared.message} — a residual intent entry remains for the next platform write's recovery)`;
}

function coupledRecordCommit(
	ports: PlatformWritePorts,
	event: SpineEventDraft,
	label: string,
	writeRecord: () => Result<void>,
): Result<void> {
	const locked = ports.platformWriteLock.withPlatformWriteLock((): Result<void> => {
		const recovered = recoverPlatformWrites(ports);
		if (!recovered.ok) return recovered;
		const recorded = ports.opJournal.record(event);
		if (!recorded.ok) return recorded;
		const opId = recorded.value;
		const written = writeRecord();
		if (!written.ok) {
			return err(
				written.code,
				withResidualDiagnostic(written.message, ports.opJournal.clear(opId)),
			);
		}
		const marked = ports.opJournal.markCommitted(opId);
		if (!marked.ok) {
			return err(
				marked.code,
				`${label} WAS committed, but its committed marker could not be persisted (${marked.message}); the intent remains journaled and the next platform write will adjudicate the landed record before replay`,
			);
		}
		const appended = ports.spineLog.appendOnce(opId, event);
		if (!appended.ok) {
			return err(
				appended.code,
				`${label} WAS committed, but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
			);
		}
		const cleared = ports.opJournal.clear(opId);
		if (!cleared.ok) {
			return err(
				cleared.code,
				`${label} WAS committed and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
			);
		}
		return ok(undefined);
	});
	return locked.ok ? locked.value : locked;
}

function allocationCommitPort(ports: PlatformWritePorts): StreamCommitPort {
	return {
		commitAllocation(previous, next, event): Result<void> {
			return coupledRecordCommit(ports, event, `allocation '${next.id}'`, () => {
				const current = ports.allocationStore.read(previous.id);
				if (
					current === null ||
					canonicalAllocationJson(current) !== canonicalAllocationJson(previous)
				) {
					return err(
						"E-NOREG",
						`allocation '${previous.id}' changed during stream transaction — retry`,
					);
				}
				return ports.allocationStore.write(next);
			});
		},
	};
}

type PlatformCommand = Extract<
	ParsedCommand,
	{
		verb:
			| "project-create"
			| "project-list"
			| "project-show"
			| "project-set"
			| "stream-create"
			| "stream-close"
			| "fence-set"
			| "fence-show"
			| "dispatch-packet"
			| "ack-dispatch"
			| "canary"
			| "spine-append"
			| "spine-events"
			| "spine-render"
			| "task-set"
			| "state-set"
			| "state-verify"
			| "state-clear"
			| "node-show"
			| "anomalies";
	}
>;

/** Post-clear descriptor denorm for the assignment verbs (plan 054 P2): the
 *  UI-facing currentAssignment/currentTask/semanticState cache on the node
 *  descriptor. The registry is NOT platform state — the spine/record are
 *  truth and have already landed when this runs — so a failure here must be
 *  reported honestly (WAS-set framing at the call site) but can never forge
 *  or lose platform history. Reads the LATEST descriptor so a concurrent
 *  writer's fields survive (Finding 04 discipline) — the FRESH read is the
 *  write's basis, never the verb's opening snapshot (pinned, P3 T006b /
 *  p2-review-001 note 2). Residual: the read→write lines below are still a
 *  raw replace, so a daemon write landing INSIDE that microsecond window is
 *  reverted until the next tick re-derives it (self-healing, no spurious
 *  V-05 event — the tracker's latch already advanced). CLI-vs-CLI raced
 *  denorms don't exist: every caller runs under the platform write lock. */
function denormDescriptor(
	deps: CliDeps,
	nodeId: SessionId,
	fields: {
		readonly currentAssignment: string;
		readonly currentTask: string;
		readonly semanticState: SemanticState | undefined;
	},
): Result<void> {
	try {
		const latest = deps.registry.read(nodeId);
		if (!latest) return err("E-NOID", `node descriptor '${nodeId}' vanished before the denorm`);
		// A fresh assignment has no declared state yet: a stale semanticState
		// from the previous assignment must not survive the pointer swap.
		const { semanticState: _stale, ...rest } = latest;
		deps.registry.write({
			...rest,
			currentAssignment: fields.currentAssignment,
			currentTask: fields.currentTask,
			...(fields.semanticState === undefined ? {} : { semanticState: fields.semanticState }),
		});
		return ok(undefined);
	} catch (error) {
		return err("E-NOREG", `the node descriptor could not be updated (${String(error)})`);
	}
}

/** Resolve which assignment a state verb targets: explicit --assignment
 *  (must exist and belong to the node), else the descriptor's
 *  currentAssignment (dangling is an honest error, never a silent fallback),
 *  else the node's general assignment — `existing` undefined means the
 *  general is not yet materialized. */
function resolveTargetAssignment(
	assignmentStore: AssignmentStorePort,
	node: SessionDescriptor,
	explicitId: string | undefined,
): Result<{ readonly id: string; readonly existing: Assignment | undefined }> {
	if (explicitId !== undefined) {
		const record = assignmentStore.read(explicitId);
		if (record === null) return err("E-NOREG", `no assignment '${explicitId}'`);
		if (record.nodeId !== node.id) {
			return err(
				"E-ARG",
				`assignment '${record.id}' belongs to node '${record.nodeId}', not '${node.id}'`,
			);
		}
		return ok({ id: record.id, existing: record });
	}
	if (node.currentAssignment !== undefined) {
		const record = assignmentStore.read(node.currentAssignment);
		if (record === null) {
			return err(
				"E-NOREG",
				`descriptor of '${node.id}' points at missing assignment '${node.currentAssignment}'`,
			);
		}
		return ok({ id: record.id, existing: record });
	}
	const generalId = generalAssignmentId(node.id);
	return ok({ id: generalId, existing: assignmentStore.read(generalId) ?? undefined });
}

function resolveStreamAllocation(store: AllocationStorePort, stream: string): Result<Allocation> {
	const matches = store
		.list()
		.filter((allocation) => allocation.id === stream || allocation.slug === stream);
	if (matches.length === 0) return err("E-NOREG", `no allocation or stream '${stream}'`);
	if (matches.length > 1) {
		return err(
			"E-AMBIG",
			`stream '${stream}' matches multiple allocations: ${matches.map((item) => item.id).join(", ")}`,
		);
	}
	return ok(matches[0] as Allocation);
}

function readPacketIdentity(
	deps: CliDeps,
	path: string,
): Result<{ readonly path: string; readonly sha256: string }> {
	if (!deps.packetIdentity) {
		return err("E-NOREG", "packet identity reader is not wired — update the pij bin");
	}
	const identity = deps.packetIdentity(path);
	if (!identity.ok) return identity;
	if (identity.value.path.trim() === "" || !/^[a-f0-9]{64}$/.test(identity.value.sha256)) {
		return err("E-NOREG", `packet identity reader returned invalid metadata for '${path}'`);
	}
	return identity;
}

function dispatchPacketBody(dispatchId: string, packetPath: string, packetSha256: string): string {
	return [
		`[pij dispatch ${dispatchId}]`,
		`packet: ${packetPath}`,
		`sha256: ${packetSha256}`,
		"ACKNOWLEDGE FIRST after reading the packet:",
		`pij ack ${dispatchId} --packet-sha ${packetSha256}`,
	].join("\n");
}

function renderDispatchRecord(dispatchRecord: Dispatch): string {
	return [
		`dispatch ${dispatchRecord.id} state=${dispatchRecord.state}`,
		`packet ${dispatchRecord.packetPath} sha256=${dispatchRecord.packetSha256}`,
		...(dispatchRecord.messageId ? [`message ${dispatchRecord.messageId}`] : []),
		...(dispatchRecord.deliveryState ? [`delivery ${dispatchRecord.deliveryState}`] : []),
	].join("\n");
}

function failCanary(code: CanaryErrorCode, message: string, json: boolean): CliResult {
	return {
		stdout: "",
		stderr: json ? JSON.stringify({ error: code, message }) : `${code}: ${message}`,
		exitCode: 3,
	};
}

export interface FinalizeCanaryInput {
	readonly dispatchId: string;
	readonly nonce: string;
	readonly expectedModel?: string;
	readonly json: boolean;
}

/** Pass-time canary commit. Transport truth already lives on the acknowledged
 * dispatch; identity/model refusals return before any CanaryRecord write. */
export function finalizeCanary(input: FinalizeCanaryInput, deps: CliDeps): CliResult {
	try {
		const ports = platformWritePorts(deps);
		if (!ports.ok) return fail(ports.code, ports.message, input.json);
		const previous = ports.value.dispatchStore.read(input.dispatchId);
		if (previous === null) {
			return fail("E-NOREG", `no dispatch '${input.dispatchId}'`, input.json);
		}
		if (previous.state !== "acked" || previous.ack === undefined) {
			return failCanary(
				"E-CANARY-IDENTITY",
				`dispatch '${previous.id}' has no durable brief ack to evaluate`,
				input.json,
			);
		}
		if (previous.canary !== undefined) {
			if (
				previous.canary.nonce !== input.nonce ||
				previous.canary.expectedModel !== input.expectedModel
			) {
				return failCanary(
					"E-CANARY-IDENTITY",
					`dispatch '${previous.id}' already carries a different canary verdict`,
					input.json,
				);
			}
			return okOut(input.json ? JSON.stringify(previous) : renderCanaryPass(previous.canary));
		}
		const descriptor = deps.registry.read(previous.to);
		if (!descriptor) {
			return failCanary(
				"E-CANARY-IDENTITY",
				`target descriptor '${previous.to}' vanished after acknowledgement`,
				input.json,
			);
		}
		const attribution = resolveActor(undefined, deps);
		if (!attribution.ok) return fail(attribution.code, attribution.message, input.json);
		let expectedContextWindow: number | undefined;
		let observedContextWindow = null;
		const contextModel = descriptor.boundModel;
		if (contextModel !== undefined) {
			expectedContextWindow = contextMaxFor(contextModel, deps.models ?? []);
			if (expectedContextWindow === undefined) {
				return failCanary(
					"E-CANARY-CONTEXT",
					`target '${descriptor.id}' pinned model '${contextModel}' has no catalog context window; cannot validate effective tier`,
					input.json,
				);
			}
			observedContextWindow = deps.contextWindowReader?.read(descriptor) ?? null;
		}
		const evaluated = evaluateCanary({
			dispatch: previous,
			descriptor,
			nonce: input.nonce,
			expectedModel: input.expectedModel,
			expectedContextWindow,
			observedContextWindow,
			actor: attribution.value.actor,
			nowMs: deps.process.now(),
		});
		if (!evaluated.ok) return failCanary(evaluated.code, evaluated.message, input.json);
		const next: Dispatch = { ...previous, canary: evaluated.value };
		const event = buildSpineEvent({
			nowMs: deps.process.now(),
			actor: attribution.value.actor,
			kind: SPINE_KIND_DISPATCH,
			refs: [
				`dispatch:${previous.id}`,
				`message:${previous.messageId}`,
				`nonce:${input.nonce}`,
				"canary:pass",
			],
			peer: previous.to,
			prev: canonicalDispatchJson(previous),
			next: canonicalDispatchJson(next),
			actorProvenance: attribution.value.provenance,
		});
		if (!event.ok) return fail(event.code, event.message, input.json);
		const committed = coupledRecordCommit(
			ports.value,
			event.value,
			`dispatch '${previous.id}' canary`,
			() => {
				const current = ports.value.dispatchStore.read(previous.id);
				if (
					current === null ||
					canonicalDispatchJson(current) !== canonicalDispatchJson(previous)
				) {
					return err("E-NOREG", `dispatch '${previous.id}' changed during canary — retry`);
				}
				return ports.value.dispatchStore.write(next);
			},
		);
		if (!committed.ok) return fail(committed.code, committed.message, input.json);
		const current = ports.value.dispatchStore.read(previous.id);
		if (current?.canary === undefined) {
			return fail("E-NOREG", `dispatch '${previous.id}' canary did not persist`, input.json);
		}
		return okOut(input.json ? JSON.stringify(current) : renderCanaryPass(current.canary));
	} catch (error) {
		return fail("E-NOREG", `internal error in canary: ${String(error)}`, input.json);
	}
}

function dispatchPlatform(cmd: PlatformCommand, deps: CliDeps, now: number): CliResult {
	switch (cmd.verb) {
		case "canary": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const self = selfId(deps);
			if (!self.ok) return fail(self.code, self.message, cmd.json);
			const attribution = resolveActor(undefined, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const preflight = preflightSendTargets([cmd.to], self.value, deps, now);
			if (!preflight.ok) return fail(preflight.code, preflight.message, cmd.json);
			const caller = deps.registry.read(self.value);
			if (!caller) return fail("E-NOID", `no session '${self.value}' in registry`, cmd.json);
			if (!deps.nextDispatchId) {
				return fail("E-NOREG", "dispatch id allocator is not wired — update the pij bin", cmd.json);
			}
			if (!deps.nextCanaryNonce || !deps.writeCanaryPacket) {
				return fail("E-NOREG", "canary packet writer is not wired — update the pij bin", cmd.json);
			}
			const dispatchId = deps.nextDispatchId();
			const nonce = deps.nextCanaryNonce();
			if (dispatchId.trim() === "" || nonce.trim() === "") {
				return fail("E-NOREG", "canary id allocator returned an empty value", cmd.json);
			}
			const packet = deps.writeCanaryPacket({
				caller,
				dispatchId,
				body: buildCanaryPacket({ nonce, from: self.value, to: cmd.to }),
			});
			if (!packet.ok) return fail(packet.code, packet.message, cmd.json);
			if (packet.value.path.trim() === "" || !/^[a-f0-9]{64}$/.test(packet.value.sha256)) {
				return fail("E-NOREG", "canary packet writer returned invalid metadata", cmd.json);
			}
			const sent = dispatchPlatform(
				{
					verb: "dispatch-packet",
					to: cmd.to,
					packetPath: packet.value.path,
					dispatchId,
					expectedPacketSha256: packet.value.sha256,
					wait: true,
					waitMs: cmd.waitMs,
					json: cmd.json,
				},
				deps,
				now,
			);
			if (sent.exitCode !== 0 || sent.follow?.kind !== "dispatch-wait") return sent;
			return {
				...sent,
				follow: {
					kind: "canary-wait",
					dispatchId,
					nonce,
					expectedModel: cmd.expectedModel,
					timeoutMs: cmd.waitMs,
					json: cmd.json,
				},
			};
		}
		case "dispatch-packet": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const self = selfId(deps);
			if (!self.ok) return fail(self.code, self.message, cmd.json);
			const attribution = resolveActor(cmd.actor, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const preflight = preflightSendTargets([cmd.to], self.value, deps, now);
			if (!preflight.ok) return fail(preflight.code, preflight.message, cmd.json);
			const target = preflight.value[0];
			if (!target) return fail("E-NOID", `no session '${cmd.to}' in registry`, cmd.json);
			const packet = readPacketIdentity(deps, cmd.packetPath);
			if (!packet.ok) return fail(packet.code, packet.message, cmd.json);
			if (
				cmd.expectedPacketSha256 !== undefined &&
				packet.value.sha256 !== cmd.expectedPacketSha256
			) {
				return failCanary(
					CANARY_PACKET_ERROR,
					`canary packet sha changed before dispatch commitment (writer ${cmd.expectedPacketSha256}, reread ${packet.value.sha256})`,
					cmd.json,
				);
			}
			if (!deps.nextDispatchId) {
				return fail("E-NOREG", "dispatch id allocator is not wired — update the pij bin", cmd.json);
			}
			const dispatchId = cmd.dispatchId ?? deps.nextDispatchId();
			const ts = isoTimestamp(now);
			if (!ts.ok) return fail(ts.code, ts.message, cmd.json);
			const initial: Dispatch = {
				schema_version: 1,
				id: dispatchId,
				packetPath: packet.value.path,
				packetSha256: packet.value.sha256,
				from: self.value,
				to: cmd.to,
				state: "undelivered",
				created: { actor: attribution.value.actor, ts: ts.value },
				updated: { actor: attribution.value.actor, ts: ts.value },
			};
			const createdEvent = buildSpineEvent({
				nowMs: now,
				actor: attribution.value.actor,
				kind: SPINE_KIND_DISPATCH,
				refs: [`dispatch:${initial.id}`, `packet:${initial.packetSha256}`],
				peer: initial.to,
				next: canonicalDispatchJson(initial),
				actorProvenance: attribution.value.provenance,
			});
			if (!createdEvent.ok) return fail(createdEvent.code, createdEvent.message, cmd.json);
			const created = coupledRecordCommit(
				ports.value,
				createdEvent.value,
				`dispatch '${initial.id}'`,
				() => {
					if (ports.value.dispatchStore.read(initial.id) !== null) {
						return err("E-NOREG", `dispatch '${initial.id}' already exists — retry`);
					}
					return ports.value.dispatchStore.write(initial);
				},
			);
			if (!created.ok) return fail(created.code, created.message, cmd.json);

			// Peer I/O deliberately sits between the two record commits, outside
			// the platform lock. The first record preserves an honest undelivered
			// artifact if channel delivery fails.
			const delivered = deps.delivery.deliver({
				from: self.value,
				to: cmd.to,
				body: dispatchPacketBody(initial.id, initial.packetPath, initial.packetSha256),
			});
			if (!delivered.ok) {
				return fail(
					delivered.code,
					`dispatch ${initial.id} state=undelivered: ${delivered.message}`,
					cmd.json,
				);
			}
			const success = sendSuccess(target, delivered.value.messageId, "packet", now);
			const next = markDispatchDelivered(initial, {
				messageId: delivered.value.messageId,
				deliveryState: success.receipt,
				updated: { actor: attribution.value.actor, ts: ts.value },
			});
			const deliveredEvent = buildSpineEvent({
				nowMs: now,
				actor: attribution.value.actor,
				kind: SPINE_KIND_DISPATCH,
				refs: [
					`dispatch:${next.id}`,
					`packet:${next.packetSha256}`,
					`message:${delivered.value.messageId}`,
				],
				peer: next.to,
				prev: canonicalDispatchJson(initial),
				next: canonicalDispatchJson(next),
				actorProvenance: attribution.value.provenance,
			});
			if (!deliveredEvent.ok) return fail(deliveredEvent.code, deliveredEvent.message, cmd.json);
			const committed = coupledRecordCommit(
				ports.value,
				deliveredEvent.value,
				`dispatch '${next.id}'`,
				() => {
					const current = ports.value.dispatchStore.read(initial.id);
					if (
						current === null ||
						canonicalDispatchJson(current) !== canonicalDispatchJson(initial)
					) {
						return err("E-NOREG", `dispatch '${initial.id}' changed during delivery — retry`);
					}
					return ports.value.dispatchStore.write(next);
				},
			);
			if (!committed.ok) return fail(committed.code, committed.message, cmd.json);
			const follow = cmd.wait
				? ({
						kind: "dispatch-wait",
						dispatchId: next.id,
						timeoutMs: cmd.waitMs,
						exitCode: 0,
					} as const)
				: undefined;
			return {
				stdout: cmd.json ? JSON.stringify(next) : renderDispatchRecord(next),
				stderr: "",
				exitCode: 0,
				follow,
			};
		}
		case "ack-dispatch": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const previous = ports.value.dispatchStore.read(cmd.dispatchId);
			if (previous === null) {
				return fail("E-NOREG", `no dispatch '${cmd.dispatchId}'`, cmd.json);
			}
			if (previous.state === "undelivered" || !previous.messageId) {
				return fail("E-ARG", `dispatch '${cmd.dispatchId}' has not been delivered`, cmd.json);
			}
			const packet = readPacketIdentity(deps, previous.packetPath);
			if (!packet.ok) return fail(packet.code, packet.message, cmd.json);
			if (
				cmd.packetSha256 !== previous.packetSha256 ||
				packet.value.sha256 !== previous.packetSha256
			) {
				return fail(
					"E-ARG",
					`packet sha mismatch for dispatch '${cmd.dispatchId}' (expected ${previous.packetSha256}, file is ${packet.value.sha256}, supplied ${cmd.packetSha256})`,
					cmd.json,
				);
			}
			const self = selfId(deps);
			if (!self.ok) return fail(self.code, self.message, cmd.json);
			if (self.value !== previous.to) {
				return fail(
					"E-OWN",
					`dispatch '${cmd.dispatchId}' belongs to seat '${previous.to}', not '${self.value}'`,
					cmd.json,
				);
			}
			const attribution = resolveActor(undefined, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const descriptor = deps.registry.read(self.value);
			if (!descriptor) return fail("E-NOID", `no session '${self.value}' in registry`, cmd.json);
			const ts = isoTimestamp(now);
			if (!ts.ok) return fail(ts.code, ts.message, cmd.json);
			const ack: BriefAckReceipt = {
				schema_version: 1,
				kind: "brief-ack",
				messageId: previous.messageId,
				packetId: previous.id,
				packetSha256: previous.packetSha256,
				declaredRuntime: {
					model: descriptor.boundModel ?? "default",
					effort: descriptor.effort ?? "default",
					source: "self-report",
				},
				seat: self.value,
				ts: ts.value,
			};
			if (previous.state !== "acked") {
				const acknowledged = acknowledgeDispatch(previous, ack);
				if (!acknowledged.ok) {
					return fail(acknowledged.code, acknowledged.message, cmd.json);
				}
				const event = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: SPINE_KIND_DISPATCH,
					refs: [
						`dispatch:${previous.id}`,
						`packet:${previous.packetSha256}`,
						`message:${previous.messageId}`,
					],
					peer: previous.to,
					prev: canonicalDispatchJson(previous),
					next: canonicalDispatchJson(acknowledged.value),
					actorProvenance: attribution.value.provenance,
				});
				if (!event.ok) return fail(event.code, event.message, cmd.json);
				const committed = coupledRecordCommit(
					ports.value,
					event.value,
					`dispatch '${previous.id}' acknowledgement`,
					() => {
						const current = ports.value.dispatchStore.read(previous.id);
						if (
							current === null ||
							canonicalDispatchJson(current) !== canonicalDispatchJson(previous)
						) {
							return err(
								"E-NOREG",
								`dispatch '${previous.id}' changed during acknowledgement — retry`,
							);
						}
						return ports.value.dispatchStore.write(acknowledged.value);
					},
				);
				if (!committed.ok) return fail(committed.code, committed.message, cmd.json);
			}
			const current = ports.value.dispatchStore.read(previous.id);
			if (current === null || current.state !== "acked" || !current.ack) {
				return fail(
					"E-NOREG",
					`dispatch '${previous.id}' acknowledgement did not persist`,
					cmd.json,
				);
			}
			const receipt = deps.delivery.deliver({
				from: self.value,
				to: current.from,
				body: briefAckBody(current.ack),
				kind: "receipt",
			});
			if (!receipt.ok) {
				return fail(
					receipt.code,
					`dispatch ${current.id} state=acked, but brief-ack envelope delivery failed: ${receipt.message}`,
					cmd.json,
				);
			}
			return okOut(cmd.json ? JSON.stringify(current) : renderDispatchRecord(current));
		}
		case "stream-create": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			if (!deps.worktrees) {
				return fail("E-NOREG", "worktree adapter is not wired — update the pij bin", cmd.json);
			}
			if (ports.value.projectStore.read(cmd.project) === null) {
				return fail("E-NOREG", `no project '${cmd.project}' — create it first`, cmd.json);
			}
			const attribution = resolveActor(cmd.actor, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const created = createStream(
				{
					project: cmd.project,
					slug: cmd.slug,
					baseRef: cmd.baseRef,
					ordinal: cmd.ordinal,
					actor: attribution.value.actor,
					actorProvenance: attribution.value.provenance,
					nowMs: now,
					repoRoot: deps.cwd,
					worktreeRoot: deps.worktreeRoot,
				},
				{
					allocations: ports.value.allocationStore,
					worktrees: deps.worktrees,
					commit: allocationCommitPort(ports.value),
				},
			);
			if (!created.ok) return fail(created.code, created.message, cmd.json);
			if (cmd.json) return okOut(JSON.stringify(created.value));
			return okOut(
				[
					`allocation ${created.value.id} created`,
					`worktree ${created.value.worktree}`,
					`branch ${created.value.branch}`,
					`base ${created.value.baseSha}`,
				].join("\n"),
			);
		}
		case "stream-close": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			if (!deps.worktrees) {
				return fail("E-NOREG", "worktree adapter is not wired — update the pij bin", cmd.json);
			}
			const attribution = resolveActor(cmd.actor, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const closed = closeStream(
				{
					id: cmd.id,
					actor: attribution.value.actor,
					actorProvenance: attribution.value.provenance,
					nowMs: now,
					repoRoot: deps.cwd,
				},
				{
					allocations: ports.value.allocationStore,
					worktrees: deps.worktrees,
					commit: allocationCommitPort(ports.value),
				},
			);
			if (!closed.ok) return fail(closed.code, closed.message, cmd.json);
			if (cmd.json) return okOut(JSON.stringify(closed.value));
			return okOut(
				[
					`allocation ${closed.value.id} closed`,
					`worktree ${closed.value.worktree} preserved/removed safely`,
					`ordinal ${closed.value.ordinal} remains reserved`,
				].join("\n"),
			);
		}
		case "fence-set": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const attribution = resolveActor(cmd.actor, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const allocation = resolveStreamAllocation(ports.value.allocationStore, cmd.stream);
			if (!allocation.ok) return fail(allocation.code, allocation.message, cmd.json);
			const ts = isoTimestamp(now);
			if (!ts.ok) return fail(ts.code, ts.message, cmd.json);
			const id = `fence-${allocation.value.id}`;
			const previous = ports.value.fenceStore.read(id);
			const next: Fence = {
				...(previous ?? {}),
				schema_version: 1,
				id,
				allocation: allocation.value.id,
				touchSet: cmd.touchSet,
				shared: cmd.shared,
				class: "notify-only",
				updated: { actor: attribution.value.actor, ts: ts.value },
			};
			const event = buildSpineEvent({
				nowMs: now,
				actor: attribution.value.actor,
				kind: SPINE_KIND_FENCE,
				refs: [
					`project:${allocation.value.project}`,
					`allocation:${allocation.value.id}`,
					`fence:${id}`,
					`stream:${allocation.value.slug}`,
				],
				project: allocation.value.project,
				...(previous === null ? {} : { prev: canonicalFenceJson(previous) }),
				next: canonicalFenceJson(next),
				actorProvenance: attribution.value.provenance,
			});
			if (!event.ok) return fail(event.code, event.message, cmd.json);
			const committed = coupledRecordCommit(ports.value, event.value, `fence '${id}'`, () => {
				const current = ports.value.fenceStore.read(id);
				if (
					(previous === null && current !== null) ||
					(previous !== null &&
						(current === null || canonicalFenceJson(current) !== canonicalFenceJson(previous)))
				) {
					return err("E-NOREG", `fence '${id}' changed during update — retry`);
				}
				return ports.value.fenceStore.write(next);
			});
			if (!committed.ok) return fail(committed.code, committed.message, cmd.json);
			const overlaps = ports.value.fenceStore
				.list()
				.filter(
					(other) =>
						other.id !== next.id &&
						other.touchSet.some((pattern) => next.touchSet.includes(pattern)),
				);
			if (cmd.json) return okOut(JSON.stringify(next));
			return okOut(
				[
					`fence ${next.id} set`,
					`allocation ${next.allocation}`,
					`paths ${next.touchSet.join(",")}`,
					`shared ${next.shared.length === 0 ? "—" : next.shared.join(",")}`,
					`overlap ${overlaps.length === 0 ? "none" : overlaps.map((item) => item.allocation).join(",")}`,
				].join("\n"),
			);
		}
		case "fence-show": {
			if (!deps.fenceStore) {
				return fail("E-NOREG", "fence store is not wired — update the pij bin", cmd.json);
			}
			const fences =
				cmd.path === undefined
					? deps.fenceStore.list()
					: fencesForPath(deps.fenceStore.list(), cmd.path);
			if (cmd.json) return okOut(JSON.stringify(fences));
			if (cmd.path !== undefined && fences.length === 0) {
				return okOut(`path ${cmd.path}: no declared owner`);
			}
			if (fences.length === 0) return okOut("no fences");
			const heading =
				cmd.path === undefined
					? "fences"
					: fences.length > 1
						? `path ${cmd.path}: overlap (${fences.length} owners)`
						: `path ${cmd.path}: owner`;
			return okOut(
				[
					heading,
					...fences.map(
						(fence) =>
							`${fence.allocation} ${fence.touchSet.join(",")} shared=${fence.shared.join(",") || "—"}`,
					),
				].join("\n"),
			);
		}
		case "project-create": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { projectStore, spineLog, opJournal, platformWriteLock } = ports.value;
			// The WHOLE coupled write holds the machine-wide write lock (review
			// 002 G2/G3): recovery's intent adjudication is sound only when no
			// live writer can be mid-window concurrently.
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				// Recovery gate (G2/G3): every surviving op is resolved before this
				// verb mutates anything; an unresolvable predecessor is an honest
				// recovery error, never something to write past.
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				const write = createProject({
					description: cmd.description,
					actor: attribution.value.actor,
					nowMs: now,
					existingSlugs: new Set(projectStore.list().map((p) => p.slug)),
					slug: cmd.slug,
					actorProvenance: attribution.value.provenance,
				});
				if (!write.ok) return fail(write.code, write.message, cmd.json);
				// Journal FIRST (HIGH-2): the draft event is durable — phase intent —
				// BEFORE any state commit; a journal fault aborts with NOTHING committed.
				const recorded = opJournal.record(write.value.event);
				if (!recorded.ok) return fail(recorded.code, recorded.message, cmd.json);
				const opId = recorded.value;
				const claimed = projectStore.create(write.value.project);
				if (!claimed.ok) {
					// Abort-path clear (review 004 J2): the create failure stays the
					// primary error, but a failed cleanup leaves a residual intent
					// entry the operator should hear about NOW, not from the next
					// verb's recovery pass.
					return fail(
						claimed.code,
						withResidualDiagnostic(claimed.message, opJournal.clear(opId)),
						cmd.json,
					);
				}
				if (claimed.value === "exists") {
					return fail(
						"E-NOREG",
						withResidualDiagnostic(
							`project '${write.value.project.slug}' already exists (concurrent create) — retry`,
							opJournal.clear(opId),
						),
						cmd.json,
					);
				}
				// Durable phase flip (review 002 G2): from here the op replays once
				// recovery corroborates it against persisted state (review 003 H1 /
				// 004 J1 — a bare marker is a claim, not proof, and a once-record
				// proves only the EVENT survived, never the project publish). A
				// failed flip is survivable — the entry stays intent and recovery
				// adjudicates it against the state that DID land — so the coupled
				// write proceeds either way.
				opJournal.markCommitted(opId);
				// Coupling law (AC-03): the event lands ONLY after a successful record
				// write; appendOnce keyed by opId keeps journal replay exactly-once.
				const appended = spineLog.appendOnce(opId, write.value.event);
				if (!appended.ok) {
					// The journal entry SURVIVES: the next platform write verb replays
					// it, so the committed record is never left without its audit event.
					return fail(
						appended.code,
						`project '${write.value.project.slug}' WAS created, but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				// Success-path clear is inspected (review 004 J2): the write and its
				// audit event both landed, but a failed cleanup is a machine-wide
				// write outage KNOWN at return time — every later platform write
				// blocks in recovery until the entry clears. Exit 0 here would hide
				// it; the entry stays adjudicable (committed + once-record), so the
				// next recovery resolves it to the EXISTING event once clears heal.
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`project '${write.value.project.slug}' WAS created and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(write.value.project));
				return okOut(`project ${write.value.project.slug} created`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "project-list": {
			const ports = platformPorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const projects = ports.value.projectStore.list();
			if (cmd.json) return okOut(JSON.stringify(projects));
			if (projects.length === 0) return okOut("no projects");
			const lines = projects.map(
				(p) => `${pad(p.slug, 24)} ${pad(p.primeId ?? "—", 12)} ${p.description}`,
			);
			return okOut([`${pad("slug", 24)} ${pad("prime", 12)} description`, ...lines].join("\n"));
		}
		case "project-show": {
			const ports = platformPorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const project = ports.value.projectStore.read(cmd.slug);
			if (!project) return fail("E-NOREG", `no project '${cmd.slug}'`, cmd.json);
			if (cmd.json) return okOut(JSON.stringify(project));
			return okOut(
				[
					`project:     ${project.slug}`,
					`description: ${project.description}`,
					`plan:        ${project.planPath ?? "—"}`,
					`prime:       ${project.primeId ?? "—"}`,
					`created:     ${project.created.ts} by ${project.created.actor}`,
				].join("\n"),
			);
		}
		case "project-set": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { projectStore, spineLog, opJournal, platformWriteLock } = ports.value;
			// Whole coupled write under the write lock (review 002 G2/G3).
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				// Recovery gate (G2/G3) — see project-create.
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				const existing = projectStore.read(cmd.slug);
				if (!existing)
					return fail("E-NOREG", `no project '${cmd.slug}' — create it first`, cmd.json);
				const write = setProject(existing, {
					actor: attribution.value.actor,
					nowMs: now,
					planPath: cmd.planPath,
					primeId: cmd.primeId,
					actorProvenance: attribution.value.provenance,
				});
				if (!write.ok) return fail(write.code, write.message, cmd.json);
				// Journal FIRST (HIGH-2): a journal fault aborts BEFORE the update.
				const recorded = opJournal.record(write.value.event);
				if (!recorded.ok) return fail(recorded.code, recorded.message, cmd.json);
				const opId = recorded.value;
				const updated = projectStore.update(write.value.project);
				if (!updated.ok) {
					// Abort-path clear (review 004 J2) — primary error plus any
					// residual-entry diagnostic, see project-create.
					return fail(
						updated.code,
						withResidualDiagnostic(updated.message, opJournal.clear(opId)),
						cmd.json,
					);
				}
				// Durable phase flip (review 002 G2) — survivable if it fails, see
				// project-create.
				opJournal.markCommitted(opId);
				// Coupling law (AC-03): the event lands ONLY after a successful record
				// write; appendOnce keyed by opId keeps journal replay exactly-once.
				const appended = spineLog.appendOnce(opId, write.value.event);
				if (!appended.ok) {
					// The journal entry SURVIVES for the next write verb's replay.
					return fail(
						appended.code,
						`project '${write.value.project.slug}' WAS updated, but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				// Success-path clear is inspected (review 004 J2) — see project-create.
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`project '${write.value.project.slug}' WAS updated and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(write.value.project));
				return okOut(`project ${write.value.project.slug} updated`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "spine-render":
			// Bin-owned write (plan 054 P4 T002): SpineLogPort deliberately has
			// no markdown-write method, so core cannot honor this verb — the pij
			// bin intercepts `spine render` BEFORE dispatch (two-tier precedent),
			// reads the log, and writes ~/.pij/spine/spine.md atomically. Reaching
			// this case means the intercept is missing.
			return fail(
				"E-NOREG",
				"spine render is bin-owned — the pij bin writes spine/spine.md (intercept missing: update the pij bin)",
				cmd.json,
			);
		case "spine-append": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { spineLog, platformWriteLock } = ports.value;
			// Under the write lock like every platform WRITE verb (review 002
			// G2/G3): the append itself is UNcoupled (no state write rides on it,
			// so no journal entry of its own), but it must not causally overtake
			// a pending predecessor, and its recovery pass needs the lock's
			// exclusion to adjudicate intents soundly.
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				// Fallible on the clock (review 001 F7): a bad deps.process.now() is an
				// E-ARG envelope here, never a RangeError for the dispatch wrapper.
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: cmd.kind,
					refs: cmd.refs,
					peer: cmd.peer,
					project: cmd.project,
					actorProvenance: attribution.value.provenance,
				});
				if (!draft.ok) return fail(draft.code, draft.message, cmd.json);
				// The port stamps seq atomically (review 001 F1); output the STAMPED event.
				const appended = spineLog.append(draft.value);
				if (!appended.ok) return fail(appended.code, appended.message, cmd.json);
				const event = appended.value;
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(`spine ${event.seq} appended: ${event.kind} (by ${event.actor})`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		// ── plan 054 Phase 2 — assignment/state coupled writes (AC-05/AC-06) ──
		// Same journal-FIRST template as the project verbs; the state side is
		// the assignment RECORD (prev/next = canonicalAssignmentJson, states[]
		// excluded), the STATE kinds chain the stamped seq inside the pend
		// window, and the descriptor denorm runs after the clear.
		case "task-set": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { projectStore, assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const node = deps.registry.read(cmd.node);
			if (!node) return fail("E-NOID", `no session '${cmd.node}' in registry`, cmd.json);
			if (cmd.projectSlug !== undefined && projectStore.read(cmd.projectSlug) === null) {
				return fail("E-NOREG", `no project '${cmd.projectSlug}' — create it first`, cmd.json);
			}
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				// First free memorable asg id (store read is the occupancy probe;
				// the store's create-or-replace never clobbers because only free
				// ids are chosen under the machine-wide write lock).
				let assignmentId: string | undefined;
				for (const candidate of assignmentIdCandidates(`${cmd.node}\0${cmd.task}`)) {
					if (assignmentStore.read(candidate) === null) {
						assignmentId = candidate;
						break;
					}
				}
				if (assignmentId === undefined) {
					return fail("E-FULL", "memorable assignment id space exhausted", cmd.json);
				}
				const opened = openAssignment({
					id: assignmentId,
					nodeId: cmd.node,
					task: cmd.task,
					actor: attribution.value.actor,
					nowMs: now,
					projectSlug: cmd.projectSlug,
				});
				if (!opened.ok) return fail(opened.code, opened.message, cmd.json);
				const record = opened.value;
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: SPINE_KIND_TASK_SET,
					refs: [
						`node:${cmd.node}`,
						`assignment:${record.id}`,
						...(cmd.projectSlug === undefined ? [] : [`project:${cmd.projectSlug}`]),
					],
					peer: cmd.node,
					project: cmd.projectSlug,
					// Creation-shaped: no prior record — next only (F3 law).
					next: canonicalAssignmentJson(record),
					actorProvenance: attribution.value.provenance,
				});
				if (!draft.ok) return fail(draft.code, draft.message, cmd.json);
				const recorded = opJournal.record(draft.value);
				if (!recorded.ok) return fail(recorded.code, recorded.message, cmd.json);
				const opId = recorded.value;
				const written = assignmentStore.write(record);
				if (!written.ok) {
					return fail(
						written.code,
						withResidualDiagnostic(written.message, opJournal.clear(opId)),
						cmd.json,
					);
				}
				opJournal.markCommitted(opId);
				const appended = spineLog.appendOnce(opId, draft.value);
				if (!appended.ok) {
					return fail(
						appended.code,
						`task on '${cmd.node}' WAS set (assignment ${record.id}), but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`task on '${cmd.node}' WAS set and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				const denormed = denormDescriptor(deps, cmd.node, {
					currentAssignment: record.id,
					currentTask: record.task,
					semanticState: undefined,
				});
				if (!denormed.ok) {
					return fail(
						denormed.code,
						`task on '${cmd.node}' WAS set (assignment ${record.id}) and its spine event landed, but ${denormed.message}`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(assignmentStore.read(record.id) ?? record));
				return okOut(`task set on ${cmd.node}: ${record.id} "${record.task}"`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "state-set": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const node = deps.registry.read(cmd.node);
			if (!node) return fail("E-NOID", `no session '${cmd.node}' in registry`, cmd.json);
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				const target = resolveTargetAssignment(assignmentStore, node, cmd.assignmentId);
				if (!target.ok) return fail(target.code, target.message, cmd.json);
				// Implicit-general fallback (AC-05): first write materializes it.
				const materialized = materializeGeneralIfMissing(target.value.existing, {
					nodeId: cmd.node,
					actor: attribution.value.actor,
					nowMs: now,
				});
				if (!materialized.ok) return fail(materialized.code, materialized.message, cmd.json);
				const record = materialized.value;
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: SPINE_KIND_STATE_SET,
					refs: [
						`node:${cmd.node}`,
						`assignment:${record.id}`,
						...(record.projectSlug === undefined ? [] : [`project:${record.projectSlug}`]),
						`state:${cmd.state}`,
						...cmd.refs,
					],
					peer: cmd.node,
					project: record.projectSlug,
					// An existing record couples prev===next (the ruled no-op-set
					// shape); a fresh general is creation-shaped (next only).
					prev: target.value.existing === undefined ? undefined : canonicalAssignmentJson(record),
					next: canonicalAssignmentJson(record),
					actorProvenance: attribution.value.provenance,
				});
				if (!draft.ok) return fail(draft.code, draft.message, cmd.json);
				const recorded = opJournal.record(draft.value);
				if (!recorded.ok) return fail(recorded.code, recorded.message, cmd.json);
				const opId = recorded.value;
				const written = assignmentStore.write(record);
				if (!written.ok) {
					return fail(
						written.code,
						withResidualDiagnostic(written.message, opJournal.clear(opId)),
						cmd.json,
					);
				}
				opJournal.markCommitted(opId);
				const appended = spineLog.appendOnce(opId, draft.value);
				if (!appended.ok) {
					return fail(
						appended.code,
						`state '${cmd.state}' on '${cmd.node}' WAS recorded (assignment ${record.id}), but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				const event = appended.value.event;
				// The stamped seq joins the chain INSIDE the pend window: a cut
				// here leaves a committed op recovery replays AND reconciles.
				const chained = assignmentStore.write(appendStateRef(record, event.seq));
				if (!chained.ok) {
					return fail(
						chained.code,
						`state '${cmd.state}' WAS set on '${cmd.node}' and its spine event landed, but the assignment's states chain could not be updated (${chained.message}); the op remains journaled and the next platform write will reconcile it`,
						cmd.json,
					);
				}
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`state '${cmd.state}' WAS set on '${cmd.node}' and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				const denormed = denormDescriptor(deps, cmd.node, {
					currentAssignment: record.id,
					currentTask: record.task,
					semanticState: cmd.state,
				});
				if (!denormed.ok) {
					return fail(
						denormed.code,
						`state '${cmd.state}' WAS set on '${cmd.node}' and its spine event landed, but ${denormed.message}`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(
					`state ${cmd.state} set on ${cmd.node} (assignment ${record.id}, spine ${event.seq})`,
				);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "state-clear": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const node = deps.registry.read(cmd.node);
			if (!node) return fail("E-NOID", `no session '${cmd.node}' in registry`, cmd.json);
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				const target = resolveTargetAssignment(assignmentStore, node, cmd.assignmentId);
				if (!target.ok) return fail(target.code, target.message, cmd.json);
				// Unlike state set, clear never materializes the implicit general: an
				// absent record has no declaration to remove.
				const record = target.value.existing;
				if (record === undefined) {
					return fail("E-NOREG", `no assignment to clear for node '${cmd.node}'`, cmd.json);
				}
				const chain = chainStateOf(record, spineLog.read({ peer: cmd.node }));
				if (chain.state === undefined) {
					return fail(
						"E-ARG",
						`assignment '${record.id}' is already undeclared — nothing to clear`,
						cmd.json,
					);
				}
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: SPINE_KIND_STATE_CLEARED,
					refs: [
						`node:${cmd.node}`,
						`assignment:${record.id}`,
						...(record.projectSlug === undefined ? [] : [`project:${record.projectSlug}`]),
						"transition:clear",
					],
					peer: cmd.node,
					project: record.projectSlug,
					prev: canonicalAssignmentJson(record),
					next: canonicalAssignmentJson(record),
					actorProvenance: attribution.value.provenance,
				});
				if (!draft.ok) return fail(draft.code, draft.message, cmd.json);
				const recorded = opJournal.record(draft.value);
				if (!recorded.ok) return fail(recorded.code, recorded.message, cmd.json);
				const opId = recorded.value;
				const written = assignmentStore.write(record);
				if (!written.ok) {
					return fail(
						written.code,
						withResidualDiagnostic(written.message, opJournal.clear(opId)),
						cmd.json,
					);
				}
				opJournal.markCommitted(opId);
				const appended = spineLog.appendOnce(opId, draft.value);
				if (!appended.ok) {
					return fail(
						appended.code,
						`state on '${cmd.node}' WAS cleared (assignment ${record.id}), but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				const event = appended.value.event;
				const chained = assignmentStore.write(appendStateRef(record, event.seq));
				if (!chained.ok) {
					return fail(
						chained.code,
						`state on '${cmd.node}' WAS cleared and its spine event landed, but the assignment's states chain could not be updated (${chained.message}); the op remains journaled and the next platform write will reconcile it`,
						cmd.json,
					);
				}
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`state on '${cmd.node}' WAS cleared and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				const denormed = denormDescriptor(deps, cmd.node, {
					currentAssignment: record.id,
					currentTask: record.task,
					semanticState: undefined,
				});
				if (!denormed.ok) {
					return fail(
						denormed.code,
						`state on '${cmd.node}' WAS cleared and its spine event landed, but ${denormed.message}`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(`state cleared on ${cmd.node} (assignment ${record.id}, spine ${event.seq})`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "state-verify": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const node = deps.registry.read(cmd.node);
			if (!node) return fail("E-NOID", `no session '${cmd.node}' in registry`, cmd.json);
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				const target = resolveTargetAssignment(assignmentStore, node, cmd.assignmentId);
				if (!target.ok) return fail(target.code, target.message, cmd.json);
				// Verify never materializes: an absent chain is nothing to verify.
				const record = target.value.existing;
				if (record === undefined) {
					return fail("E-NOREG", `no assignment to verify for node '${cmd.node}'`, cmd.json);
				}
				// The shared chain projection is the sole authority for the latest
				// declaration: a later state-cleared makes this assignment undeclared.
				const chain = chainStateOf(record, spineLog.read({ peer: cmd.node }));
				if (chain.state === undefined) {
					return fail(
						"E-ARG",
						`assignment '${record.id}' has no declared state to verify`,
						cmd.json,
					);
				}
				if (chain.state !== "done") {
					return fail(
						"E-ARG",
						`assignment '${record.id}' is not done (latest state: ${chain.state}) — nothing to verify`,
						cmd.json,
					);
				}
				const doneSeq = chain.stateSeq;
				if (doneSeq === undefined) {
					return fail(
						"E-NOREG",
						`assignment '${record.id}' has an invalid done declaration without a spine seq`,
						cmd.json,
					);
				}
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: SPINE_KIND_STATE_VERIFIED,
					refs: [
						`node:${cmd.node}`,
						`assignment:${record.id}`,
						...(record.projectSlug === undefined ? [] : [`project:${record.projectSlug}`]),
						"state:done",
						`event:${doneSeq}`,
					],
					peer: cmd.node,
					project: record.projectSlug,
					prev: canonicalAssignmentJson(record),
					next: canonicalAssignmentJson(record),
					verifiedBy: attribution.value.actor,
					actorProvenance: attribution.value.provenance,
				});
				if (!draft.ok) return fail(draft.code, draft.message, cmd.json);
				const recorded = opJournal.record(draft.value);
				if (!recorded.ok) return fail(recorded.code, recorded.message, cmd.json);
				const opId = recorded.value;
				const written = assignmentStore.write(record);
				if (!written.ok) {
					return fail(
						written.code,
						withResidualDiagnostic(written.message, opJournal.clear(opId)),
						cmd.json,
					);
				}
				opJournal.markCommitted(opId);
				const appended = spineLog.appendOnce(opId, draft.value);
				if (!appended.ok) {
					return fail(
						appended.code,
						`verification of '${record.id}' WAS recorded, but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				const event = appended.value.event;
				const chained = assignmentStore.write(appendStateRef(record, event.seq));
				if (!chained.ok) {
					return fail(
						chained.code,
						`'${record.id}' WAS verified and its spine event landed, but the assignment's states chain could not be updated (${chained.message}); the op remains journaled and the next platform write will reconcile it`,
						cmd.json,
					);
				}
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`'${record.id}' WAS verified and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(`state verified on ${cmd.node} (assignment ${record.id}, spine ${event.seq})`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "node-show": {
			// READ verb (AC-09): the full card — identity, both axes, badge,
			// assignments join, addressability, gauges. Bare JSON, no envelope.
			const ports = platformPorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			if (!deps.assignmentStore)
				return fail("E-NOREG", "project/spine stores are not wired — update the pij bin", cmd.json);
			const d = deps.registry.read(cmd.id);
			if (!d) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const events = ports.value.spineLog.read({ peer: d.id });
			const assignments = deps.assignmentStore.listByNode(d.id).map((assignment) => ({
				assignment,
				chain: chainStateOf(assignment, events),
			}));
			const openStates = assignments
				.filter(({ assignment }) => assignment.closed === undefined)
				.map(({ chain }) => chain.state)
				.filter((state) => state !== undefined);
			const badge = badgeOf(d.systemState, openStates);
			const contextCurrent = deps.contextReader?.current(d) ?? null;
			const contextMax = contextMaxFor(d.boundModel, deps.models ?? []);
			const card = {
				id: d.id,
				harness: d.harness ?? null,
				lifecycle: d.lifecycle ?? null,
				parent: effectiveParent(d),
				spawnedBy: d.spawnedBy ?? null,
				systemState: d.systemState ?? null,
				semanticState: d.semanticState ?? null,
				badge,
				currentAssignment: d.currentAssignment ?? null,
				currentTask: d.currentTask ?? null,
				assignments: assignments.map(({ assignment, chain }) => ({
					id: assignment.id,
					task: assignment.task,
					projectSlug: assignment.projectSlug ?? null,
					open: assignment.closed === undefined,
					state: chain.state ?? null,
					// AC-06 render: done is UNVERIFIED until a verify write lands.
					verified: chain.state === "done" ? chain.verified : null,
					verifiedBy: chain.verifiedBy ?? null,
					stateSeq: chain.stateSeq ?? null,
				})),
				paneId: d.paneId ?? null,
				windowId: d.windowId ?? null,
				boundModel: d.boundModel ?? null,
				effort: d.effort ?? null,
				contextMax: contextMax ?? null,
				contextCurrent,
				state: d.state ?? "idle",
				activity: activityOf(d.state, d.lastEventAt != null),
				liveness: liveOf(deps, d, now),
				lastEventAt: d.lastEventAt ?? null,
				pid: d.pid,
				cwd: d.folder,
			};
			if (cmd.json) return okOut(JSON.stringify(card));
			const gauge =
				contextCurrent === null
					? "—"
					: `${contextCurrent.value}${contextMax !== undefined ? ` / ${contextMax}` : ""} (${contextCurrent.provenance})`;
			const lines = [
				`node:        ${d.id}  [${badge}]`,
				`harness:     ${d.harness ?? "—"}  ·  lifecycle: ${d.lifecycle ?? "—"}  ·  pid ${d.pid}`,
				`axes:        system ${d.systemState ?? "—"} · semantic ${d.semanticState ?? "—"}`,
				`task:        ${d.currentTask ?? "—"}  (${d.currentAssignment ?? "no assignment"})`,
				...assignments.map(
					({ assignment, chain }) =>
						`  assignment ${assignment.id}: ${chain.state ?? "undeclared"}${
							chain.state === "done" ? (chain.verified ? " ✓verified" : " (UNVERIFIED)") : ""
						}${assignment.closed ? ` [closed:${assignment.closed.reason}]` : ""} — ${assignment.task}`,
				),
				`terminal:    pane ${d.paneId ?? "—"} · window ${d.windowId ?? "—"}`,
				`model:       ${d.boundModel ?? "—"}  ·  effort: ${d.effort ?? "—"}`,
				`context:     ${gauge}`,
				`parent:      ${effectiveParent(d) ?? "(root)"}`,
				`cwd:         ${d.folder}`,
			];
			return okOut(lines.join("\n"));
		}
		case "anomalies": {
			// READ verb (AC-06/AC-07): pure queries with spine-seq evidence.
			const ports = platformPorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			if (!deps.assignmentStore)
				return fail("E-NOREG", "project/spine stores are not wired — update the pij bin", cmd.json);
			// Detect over the FULL inputs (cross-descriptor invariants stay
			// whole); --here/--project scope only the VIEW (s057 dogfood —
			// repo primes drown in other repos' peers otherwise).
			const assignments = deps.assignmentStore.list();
			const allocations = deps.allocationStore?.list() ?? [];
			let anomalies = detectAnomalies({
				descriptors: deps.registry.list(),
				assignments,
				events: ports.value.spineLog.read(),
				dispatches: deps.dispatchStore?.list() ?? [],
				allocations,
				nowMs: now,
			});
			if (cmd.here) {
				const hereIds = new Set(filterByFolder(deps.registry.list(), deps.cwd).map((d) => d.id));
				anomalies = anomalies.filter((a) => hereIds.has(a.nodeId));
			}
			if (cmd.project !== undefined) {
				const byAssignment = new Map(assignments.map((record) => [record.id, record]));
				const byAllocation = new Map(allocations.map((record) => [record.id, record]));
				anomalies = anomalies.filter((anomaly) => {
					if (anomaly.assignmentId !== undefined) {
						return byAssignment.get(anomaly.assignmentId)?.projectSlug === cmd.project;
					}
					const allocationId = anomaly.recordRef?.startsWith("allocation:")
						? anomaly.recordRef.slice("allocation:".length)
						: undefined;
					return (
						allocationId !== undefined && byAllocation.get(allocationId)?.project === cmd.project
					);
				});
			}
			if (cmd.json) return okOut(JSON.stringify(anomalies));
			if (anomalies.length === 0) return okOut("no anomalies");
			return okOut(
				anomalies
					.map((a) => {
						const evidence =
							a.recordRef === undefined
								? `spine ${a.evidence.join(",") || "—"}`
								: `${a.recordRef}${a.ageMs === undefined ? "" : ` age=${a.ageMs}ms`}`;
						return `${pad(a.kind, 26)} ${pad(a.nodeId, 20)} ${a.detail} [${evidence}]`;
					})
					.join("\n"),
			);
		}
		case "spine-events": {
			const ports = platformPorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const events = ports.value.spineLog.read({
				since: cmd.since,
				peer: cmd.peer,
				project: cmd.project,
			});
			if (cmd.json) return okOut(JSON.stringify(events));
			if (events.length === 0) return okOut("(no spine events)");
			const lines = events.map(
				(e) =>
					`${pad(String(e.seq), 5)} ${pad(hhmmss(e.ts), 8)} ${pad(e.kind, 16)} ${pad(e.actor, 16)}${
						e.project ? ` project:${e.project}` : ""
					}${e.peer ? ` peer:${e.peer}` : ""}`,
			);
			return okOut(
				[
					`${pad("seq", 5)} ${pad("ts", 8)} ${pad("kind", 16)} ${pad("actor", 16)} context`,
					...lines,
				].join("\n"),
			);
		}
	}
}

// ─── small shared helpers ───────────────────────────────────────────────────
function okOut(stdout: string): CliResult {
	return { stdout, stderr: "", exitCode: 0 };
}

function pad(s: string, n: number): string {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function renderSessionForestHuman(forest: SessionForest): string {
	if (forest.roots.length === 0) return "no pij sessions";
	const lines: string[] = [];
	const pending: Array<{ readonly node: SessionTreeNode; readonly depth: number }> = [];
	for (let index = forest.roots.length - 1; index >= 0; index--) {
		const node = forest.roots[index];
		if (node) pending.push({ node, depth: 0 });
	}
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) continue;
		const { node, depth } = current;
		const indentDepth = Math.min(depth, 32);
		const indent = `${"  ".repeat(indentDepth)}${depth > indentDepth ? "… " : ""}`;
		const prime = node.prime === true ? "P" : node.oldPrime === true ? "O" : " ";
		const lifecycle = node.lifecycle === "dissolved" ? "closed" : (node.lifecycle ?? "—");
		const problem =
			node.problem === undefined
				? ""
				: node.problem === "cycle"
					? ` [cycle${node.cycleTo ? `→${node.cycleTo}` : ""}]`
					: ` [${node.problem}${node.effectiveParentId ? `:${node.effectiveParentId}` : ""}]`;
		// Adoption axis, rendered apart from structural problems (WS-1 split).
		const unadopted = node.unadopted === true ? " [unadopted]" : "";
		lines.push(
			`${indent}${prime} ${node.id}  ${node.activity}/${node.liveness}/${lifecycle}${problem}${unadopted}`,
		);
		for (let index = node.children.length - 1; index >= 0; index--) {
			const child = node.children[index];
			if (child) pending.push({ node: child, depth: depth + 1 });
		}
	}
	return lines.join("\n");
}

function renderSessionForestJson(forest: SessionForest): string {
	interface Frame {
		readonly nodes: readonly SessionTreeNode[];
		index: number;
		readonly close: string;
	}
	const output: string[] = ['{"roots":['];
	const stack: Frame[] = [{ nodes: forest.roots, index: 0, close: "]}" }];
	while (stack.length > 0) {
		const frame = stack.at(-1);
		if (!frame) break;
		const node = frame.nodes[frame.index];
		if (!node) {
			output.push(frame.close);
			stack.pop();
			continue;
		}
		if (frame.index > 0) output.push(",");
		frame.index += 1;
		const { children, ...raw } = node;
		const head = JSON.stringify({
			...raw,
			prime: node.prime === true,
			oldPrime: node.oldPrime === true,
		});
		output.push(head.slice(0, -1), ',"children":[');
		stack.push({ nodes: children, index: 0, close: "]}" });
	}
	return output.join("");
}

function liveOf(
	deps: CliDeps,
	d: SessionDescriptor,
	nowMs: number,
): "active" | "stale" | "dead" | "dissolved" {
	if (d.lifecycle === "dissolved") return "dissolved";
	// `stale` is reserved for a peer that claims to be working but has gone quiet
	// (a stall). An idle/done peer that is simply quiet stays `active` (INS-001).
	return liveness(
		deps.process.isAlive(d.pid),
		descAgeMs(d, nowMs),
		STALE_AFTER_MS,
		d.state === "working",
	);
}

function renderEventLine(e: PijEvent, nowMs: number): string {
	const age = humanAge(nowMs - Date.parse(e.timestamp));
	let summary = "";
	if (e.data && typeof e.data === "object") {
		const rec = e.data as Record<string, unknown>;
		summary =
			typeof rec.name === "string"
				? rec.name
				: typeof rec.body === "string"
					? rec.body
					: JSON.stringify(e.data);
	} else if (e.data !== undefined) {
		summary = String(e.data);
	}
	return `${pad(String(e.seq), 5)} ${pad(hhmmss(e.timestamp), 8)} ${pad(age, 7)} ${pad(e.type, 12)} ${summary.slice(0, 80)}`;
}
