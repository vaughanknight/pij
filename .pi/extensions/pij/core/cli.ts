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
import {
	BG_ACTOR,
	BG_ENV,
	bgJobState,
	bgWrapperScript,
	buildBgCompletionTurn,
	buildBgKilledTurn,
	jobStartedAtMs,
	newBgJobRecord,
	planBgJob,
	renderBgJobLine,
} from "./bg.js";
import {
	bindHealthDetail,
	classifyBindHealth,
	isBindDegraded,
	type QueuedReason,
	type SendDisposition,
} from "./bind-health.js";
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
import {
	parseSchedulerProjection,
	readSchedulerVerdict,
	renderSchedulerVerdict,
	WATCHDOG_SCHEDULER_FILE,
} from "./daemon/watchdog-scheduler-projection.js";
import {
	filterByFolder,
	filterPrime,
	resolveLivePane,
	resolveSelf,
	selectByRepository,
} from "./discovery.js";
import type { PersistReceiptEnvelopeAction } from "./inbox.js";
import { type BriefAckReceipt, briefAckBody } from "./message.js";
import { closestModel } from "./models/match.js";
import type { ModelEntry } from "./models/registry.js";
import {
	PA_VERB_CLASSIFICATION,
	type PaCapability,
	paConditionalWhy,
	paRefusal,
	paRefusalMessage,
} from "./orchestration/pa-capability.js";
import { paTargetDecision } from "./orchestration/pa-target.js";
import {
	type DesignationAuditPort,
	DesignationAuditService,
	isStoredOrchestrationRole,
	paLineageRefusal,
	projectOrchestrationRole,
	RoleService,
	STORED_ROLE_CHOICES,
	type StoredOrchestrationRole,
} from "./orchestration/role.js";
import { canonicalAllocationJson } from "./platform/allocation.js";
import {
	appendStateRef,
	assignmentIdCandidates,
	canonicalAssignmentJson,
	closeAssignment,
	isAssignmentCloseReason,
	materializeGeneralIfMissing,
	openAssignment,
	permittedCloseReasons,
} from "./platform/assignment.js";
import {
	acknowledgeDispatch,
	canonicalDispatchJson,
	isOpenDispatch,
	markDispatchDelivered,
	retireDispatch,
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
	ASSIGNMENT_CLOSE_REASONS,
	type Assignment,
	type AssignmentCloseReason,
	type Dispatch,
	type Fence,
	generalAssignmentId,
	isValidProjectSlug,
	SPINE_KIND_DISPATCH,
	SPINE_KIND_FENCE,
	SPINE_KIND_NODE_LINKED,
	SPINE_KIND_ROLE_SET,
	SPINE_KIND_STATE_CLEARED,
	SPINE_KIND_STATE_SET,
	SPINE_KIND_STATE_VERIFIED,
	SPINE_KIND_STATUS,
	SPINE_KIND_TASK_CLOSE,
	SPINE_KIND_TASK_SET,
	type SpineEvent,
	type SpineEventDraft,
} from "./platform/types.js";
import type {
	BackgroundLauncherPort,
	BgJobStorePort,
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
	type SystemState,
	type TreeActivity,
	type TreeFilters,
	type TreeSession,
	type WatchdogCapturePolicy,
	type WatchdogSidecar,
} from "./types.js";
import {
	applyNewWorkTransition,
	applyWatchdogExemption,
	applyWatchdogResume,
	DEFAULT_WATCHDOG_EXEMPT_TTL_MS,
	describeWatchdogState,
	effectiveWatchdog,
	humanizeDurationMs,
	parseWatchdogInterval,
	reconcileWatchdogExemption,
	renderWatcherRoster,
} from "./watchdog.js";

// ─── deps (injected — fakes in tests, real fs adapters in the bin) ──────────
export interface WatchdogCliStore {
	read(id: SessionId): WatchdogSidecar | undefined;
	write(id: SessionId, sidecar: WatchdogSidecar): void;
}

function rearmWatchdogForNewWork(store: WatchdogCliStore | undefined, id: SessionId): void {
	if (!store) return;
	const current = store.read(id);
	if (!current) return;
	const next = applyNewWorkTransition(current);
	if (next !== current) store.write(id, next);
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
	/** Detached job launcher; absent in builds/tests that never run `pij bg`. */
	readonly backgroundLauncher?: BackgroundLauncherPort;
	/** How the detached wrapper re-enters this CLI to deliver its result.
	 *  Injected because only the bin knows how it was itself invoked. */
	readonly bgNotifyArgv?: readonly string[];
	/** Reads a bg job's captured log; supplied by the bin. */
	readonly readTextFile?: (path: string) => string;
	/** Durable bg job records — what makes `bg list|tail|kill` possible. */
	readonly bgJobStore?: BgJobStorePort;
	/** Signals a job's process GROUP; supplied by the bin. */
	readonly killProcessGroup?: (pgid: number, signal: string) => boolean;
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
			/** Show the ARCHIVED tier instead of the live one (plan 071 D1).
			 *  Optional: `tsconfig` excludes tests, so a REQUIRED field here would
			 *  leave every existing test call site silently wrong with tsc still
			 *  green — exactly the class of lie this plan exists to kill. */
			readonly archived?: boolean;
			/** Opt-in AC-05 badge per row (chainglass). Optional for the same
			 *  tsconfig-excludes-tests reason as `archived` above. */
			readonly badge?: boolean;
			readonly json: boolean;
	  }
	| { readonly verb: "sessions"; readonly here: boolean; readonly json: boolean }
	| {
			readonly verb: "attest";
			readonly id: SessionId;
			readonly planId?: string;
			readonly json: boolean;
	  }
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
			readonly verb: "bg-create";
			readonly title: string;
			readonly command: string;
			readonly json: boolean;
	  }
	| { readonly verb: "bg-list"; readonly all: boolean; readonly json: boolean }
	| {
			readonly verb: "bg-tail";
			readonly jobId: string;
			readonly lines?: number;
			readonly json: boolean;
	  }
	| { readonly verb: "bg-kill"; readonly jobId: string; readonly json: boolean }
	| {
			readonly verb: "bg-deliver";
			readonly to: SessionId;
			readonly title: string;
			readonly outPath: string;
			readonly exitCode: number;
			readonly jobId: string;
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
			/** `--for <seat>`: the seat being bound, when it is not the caller.
			 *  The RECOVERY path — a prime binds on behalf of a seat that is
			 *  already stamped, unreachable, or dead. */
			readonly forSeat?: SessionId;
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
			readonly role?: StoredOrchestrationRole;
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
			readonly verb: "dispatch-retire";
			readonly dispatchId?: string;
			readonly to?: SessionId;
			readonly reason: string;
			readonly dryRun: boolean;
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
			readonly verb: "task-close";
			readonly assignmentId: string;
			readonly reason: AssignmentCloseReason;
			readonly actor?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "report-now";
			readonly did: string;
			readonly next: string;
			readonly state?: SemanticState;
			readonly note?: string;
			readonly projectSlug?: string;
			/** Relay a card FOR another seat (plan 078). Only a PA writing for its
			 *  own prime is permitted; the written card records `statusWrittenBy`
			 *  so the relay is attributable rather than indistinguishable from the
			 *  subject writing it. */
			readonly forSeat?: SessionId;
			readonly json: boolean;
	  }
	| {
			readonly verb: "state-set";
			readonly state: SemanticState;
			readonly note?: string;
			readonly assignmentId?: string;
			readonly refs: readonly string[];
			readonly json: boolean;
	  }
	| {
			readonly verb: "state-verify";
			readonly node: SessionId;
			readonly assignmentId?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "state-clear";
			readonly assignmentId?: string;
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
	// A refusal about the request's CONTENT, not its shape — so `2` (like
	// E-SELF), never `64`. A wrapper must be able to tell "you sent nothing"
	// apart from "you typed the flags wrong" (plan 093 D3).
	"E-EMPTY": 2,
	"E-OWN": 2,
};

function daemonReceiptAuthoritative(target: SessionDescriptor): boolean {
	return (
		effectiveDeliveryMode(target) !== "pull" &&
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
	"dry-run",
]);
const REPEATABLE_FLAGS = new Set(["to", "activity", "liveness", "lifecycle"]);

/** Family verbs: the tables below key on "<verb> <subcommand>". */
const FAMILY_SUBCOMMANDS: Record<string, string> = {
	project: "create|list|show|set",
	stream: "create|close",
	fence: "set|show",
	spine: "append|events|render",
	task: "set|close",
	report: "now|question|blocked|state|clear|verify",
	bg: "create|list|tail|kill",
	node: "show",
};

/** Per-verb flag VALENCE (plan 054 T010): flags that are boolean globally but
 *  take a value for a given verb key — `project set --prime <id>` vs the
 *  boolean `list --prime`. Existing verbs keep the global BOOLEAN_FLAGS set. */
const VALUED_FLAG_OVERRIDES: Record<string, ReadonlySet<string>> = {
	"project set": new Set(["prime"]),
	"report now": new Set(["state"]),
};

/** Retired call shapes, answered with the verb that replaced them.
 *
 *  When `pij state set|clear|verify` moved to the `report` family (s074), the
 *  old form started failing the generic arity check — "too many arguments for
 *  'state'" — which names no replacement and reads like a typo rather than a
 *  migration. Every seat still following an older handover packet hit that wall
 *  and paid a `--help` crawl to escape it (reported from the field by
 *  pij-long-skellor, 2026-07-30).
 *
 *  A retired verb is a promise you already made. Deleting it is fine; deleting
 *  the SIGNPOST is not, because the caller cannot tell "I typed it wrong" from
 *  "this moved" — and only one of those has an answer they can act on. */
function retiredSyntaxHint(key: string, pos: readonly string[]): string | undefined {
	if (key !== "state") return undefined;
	const sub = pos[0];
	if (sub !== "set" && sub !== "clear" && sub !== "verify") return undefined;
	// `state set <id> <state>` / `state set <state>` → the first-person report.
	const example =
		sub === "set"
			? `pij report state ${pos[pos.length - 1] ?? "<state>"}`
			: sub === "clear"
				? "pij report clear"
				: "pij report verify <node>";
	return (
		`'pij state ${sub}' was retired — the setter is now first-person: ${example}. ` +
		"`pij state <id>` remains, read-only. (Update any handover packet that still teaches the old form.)"
	);
}

function booleanFlagsFor(key: string): ReadonlySet<string> {
	const valued = VALUED_FLAG_OVERRIDES[key];
	if (!valued) return BOOLEAN_FLAGS;
	return new Set([...BOOLEAN_FLAGS].filter((flag) => !valued.has(flag)));
}

const REPORT_TEXT_MAX_LENGTH = 280;
const REPORT_NOTE_MAX_LENGTH = 200;

function normalizeReportText(label: "did" | "next", input: string): Result<string> {
	if (/[\r\n\u2028\u2029]/.test(input)) {
		return err("E-ARG", `report ${label} must be one line`);
	}
	const normalized = input.trim().replace(/\s+/g, " ");
	if (normalized === "") return err("E-ARG", `report ${label} must not be empty`);
	if (normalized.length > REPORT_TEXT_MAX_LENGTH) {
		return err(
			"E-ARG",
			`report ${label} exceeds the ${REPORT_TEXT_MAX_LENGTH}-character limit after whitespace collapsing`,
		);
	}
	return ok(normalized);
}

function normalizeReportNote(input: string): Result<string> {
	if (/[\r\n\u2028\u2029]/.test(input)) {
		return err("E-ARG", "report note must be one line");
	}
	const normalized = input.trim().replace(/\s+/g, " ");
	if (normalized === "") return err("E-ARG", "report note must not be empty");
	if (normalized.length > REPORT_NOTE_MAX_LENGTH) {
		return err(
			"E-ARG",
			`report note exceeds the ${REPORT_NOTE_MAX_LENGTH}-character limit after whitespace collapsing`,
		);
	}
	return ok(normalized);
}

/** Flags each verb accepts — anything else is E-ARG. */
const ALLOWED_FLAGS: Record<string, ReadonlySet<string>> = {
	whoami: new Set(["json", "env"]),
	// `archived` was parsed and handled but never allowlisted, so plan 071's
	// entire archived tier answered E-ARG and was unreachable from the CLI.
	list: new Set(["here", "prime", "archived", "badge", "json"]),
	sessions: new Set(["here", "json"]),
	models: new Set(["harness", "json"]),
	send: new Set(["to", "command", "file", "caption", "wait", "json"]),
	dispatch: new Set(["packet", "wait", "actor", "json"]),
	"dispatch-retire": new Set(["to", "reason", "dry-run", "json"]),
	ack: new Set(["packet-sha", "json"]),
	canary: new Set(["expect-model", "wait", "json"]),
	tail: new Set(["since", "type", "lines", "follow", "json"]),
	"bg create": new Set(["title", "command", "json"]),
	"bg list": new Set(["json", "all"]),
	"bg tail": new Set(["lines", "json"]),
	"bg kill": new Set(["json"]),
	"bg-deliver": new Set(["to", "title", "out", "exit", "job", "json"]),
	state: new Set(["json"]),
	phonehome: new Set(["json"]),
	attest: new Set(["plan-id", "json"]),
	tree: new Set(["global", "activity", "liveness", "lifecycle", "all", "json"]),
	link: new Set(["parent", "root", "role", "actor", "json"]),
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
	"task close": new Set(["reason", "actor", "json"]),
	"report now": new Set(["state", "note", "project", "for", "json"]),
	"report question": new Set(["assignment", "json"]),
	"report blocked": new Set(["assignment", "json"]),
	"report state": new Set(["assignment", "refs", "json"]),
	"report clear": new Set(["assignment", "json"]),
	"report verify": new Set(["assignment", "json"]),
	"node show": new Set(["json"]),
	anomalies: new Set(["json", "here", "project"]),
	watchdog: new Set(["capture", "max-lines", "max-bytes", "for", "json"]),
};
/** Max positionals per verb (send allows id + text; models allows optional filter). */
const MAX_POS: Record<string, number> = {
	whoami: 0,
	list: 0,
	sessions: 0,
	models: 1,
	send: 2,
	dispatch: 1,
	"dispatch-retire": 1,
	ack: 1,
	canary: 1,
	tail: 1,
	"bg create": 0,
	"bg list": 0,
	"bg tail": 1,
	"bg kill": 1,
	"bg-deliver": 0,
	state: 1,
	phonehome: 0,
	attest: 1,
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
	"task close": 1,
	"report now": 2,
	"report question": 1,
	"report blocked": 1,
	"report state": 1,
	"report clear": 0,
	"report verify": 1,
	"node show": 1,
	anomalies: 0,
	watchdog: 3, // action + id + duration (for `interval <id> <duration>`)
};

export function parseArgs(argv: readonly string[]): Result<ParsedCommand> {
	const verb = argv[0];
	if (verb === undefined)
		return err(
			"E-ARG",
			"usage: pij <whoami|list|sessions|models|send|dispatch|ack|canary|tail|bg|state|watchdog|phonehome|attest|tree|link|path|project|stream|fence|spine|task|report|node|anomalies> …",
		);
	// Family verbs route "<verb> <subcommand>" into the same strict tables —
	// no bin interception (Finding 06); everything downstream keys on `key`.
	let key = verb;
	let args = argv.slice(1);
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
			`unknown command '${verb}' (whoami|list|sessions|models|send|dispatch|ack|canary|tail|state|watchdog|phonehome|attest|tree|link|path|project|stream|fence|spine|task|report|node|anomalies)`,
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
	const retired = retiredSyntaxHint(key, pos);
	if (retired !== undefined) return err("E-ARG", retired);
	if (pos.length > (MAX_POS[key] ?? 0)) return err("E-ARG", `too many arguments for '${key}'`);
	const json = flags.json === true;
	// number | undefined (absent) | "bad" (present but non-numeric -> E-ARG).
	const pnum = (v: string | true | undefined): number | undefined | "bad" =>
		v === undefined ? undefined : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : "bad";

	switch (key) {
		case "whoami":
			return ok({ verb: "whoami", json, env: flags.env === true });
		case "list":
			return ok({
				verb: "list",
				here: flags.here === true,
				prime: flags.prime === true,
				archived: flags.archived === true,
				badge: flags.badge === true,
				json,
			});
		case "sessions":
			return ok({ verb: "sessions", here: flags.here === true, json });
		case "attest": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij attest <id> <attested-field>...");
			const planId = flags["plan-id"];
			if (planId === true) return err("E-ARG", "--plan-id needs a non-empty id");
			if (planId !== undefined && planId.trim() === "") {
				return err("E-ARG", "--plan-id needs a non-empty id");
			}
			if (planId === undefined) {
				return err("E-ARG", "pij attest needs at least one attested field");
			}
			return ok({ verb: "attest", id, planId, json });
		}
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
				// plan 093 AC-04: broadcast returns from HERE, before the shared
				// "nothing to send" check further down, so it needs its own. An
				// empty broadcast fans a zero-byte message out to every target and
				// reports success N times.
				//
				// `.trim()` because whitespace is not content (F1). The test trims;
				// the delivered body never does — see the dispatch guard.
				if ((pos[0] ?? "").trim() === "")
					return err(
						"E-EMPTY",
						"nothing to send: the broadcast body is empty — pass text, or read it literally with `pij send <id> --body-file <path|->` (single-target)",
					);
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
		case "dispatch-retire": {
			const dispatchId = pos[0];
			if (flags.to === true || flags.to === "") return err("E-ARG", "--to needs a seat id");
			const targets = repeated.to ?? [];
			if (targets.length > 1) return err("E-ARG", "dispatch-retire accepts one --to seat");
			const to = targets[0];
			if ((dispatchId === undefined) === (to === undefined)) {
				return err("E-ARG", "choose one dispatch id OR --to <seat>");
			}
			if (flags.reason === true || flags.reason === "") {
				return err("E-ARG", "--reason needs text");
			}
			const reason = typeof flags.reason === "string" ? flags.reason : undefined;
			if (reason === undefined) {
				return err(
					"E-ARG",
					"usage: pij dispatch-retire <dispatch-id> | --to <seat> --reason <text> [--dry-run]",
				);
			}
			return ok({
				verb: "dispatch-retire",
				dispatchId,
				to,
				reason,
				dryRun: flags["dry-run"] !== undefined,
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
		case "bg create": {
			const title = typeof flags.title === "string" ? flags.title : undefined;
			const command = typeof flags.command === "string" ? flags.command : undefined;
			if (title === undefined || command === undefined) {
				return err(
					"E-ARG",
					'usage: pij bg create --title "<what this is>" --command "<shell command>"',
				);
			}
			return ok({ verb: "bg-create", title, command, json });
		}
		case "bg list":
			return ok({ verb: "bg-list", all: flags.all === true, json });
		case "bg tail": {
			const jobId = pos[0];
			if (jobId === undefined) return err("E-ARG", "usage: pij bg tail <job> [--lines N]");
			const lines = pnum(flags.lines);
			if (lines === "bad") return err("E-ARG", "--lines takes a number");
			return ok({ verb: "bg-tail", jobId, ...(lines === undefined ? {} : { lines }), json });
		}
		case "bg kill": {
			const jobId = pos[0];
			if (jobId === undefined) return err("E-ARG", "usage: pij bg kill <job>");
			return ok({ verb: "bg-kill", jobId, json });
		}
		case "bg-deliver": {
			// `--to` is a REPEATABLE flag (send broadcasts on it), so it lands in
			// `repeated`, never in `flags`. Reading `flags.to` here silently yielded
			// undefined and every delivery failed E-ARG inside the detached child.
			const to = repeated.to?.[0];
			const title = typeof flags.title === "string" ? flags.title : undefined;
			const outPath = typeof flags.out === "string" ? flags.out : undefined;
			const jobId = typeof flags.job === "string" ? flags.job : undefined;
			const exitCode = pnum(flags.exit);
			if (
				to === undefined ||
				title === undefined ||
				outPath === undefined ||
				jobId === undefined ||
				exitCode === "bad" ||
				exitCode === undefined
			) {
				return err(
					"E-ARG",
					"usage: pij bg-deliver --to <id> --title <t> --out <path> --exit <n> --job <id> (internal; queued by pij bg)",
				);
			}
			return ok({ verb: "bg-deliver", to, title, outPath, exitCode, jobId, json });
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
			// `--for` IS VALIDATED HERE, BEFORE ANY ACTION-SPECIFIC EARLY RETURN.
			// It used to sit further down, past the returns for interval/exempt/
			// list/disable-all/enable-all — so those five SILENTLY IGNORED the flag
			// and executed anyway. A caller who mistyped `--for` still changed a
			// timeout, or hit the machine-wide kill switch, believing they had
			// scoped the call to one seat. That contradicted this parser's own
			// strict-arity stance and the operator guide, and it stayed green
			// because the test only covered the actions that fell through to the
			// bottom. Position is the fix; do not move it back down.
			if (typedAction !== "watch" && typedAction !== "unwatch" && flags.for !== undefined) {
				return err("E-ARG", "--for is valid only for 'pij watchdog watch' and 'unwatch'");
			}
			if (flags.for === true) return err("E-ARG", "--for needs a session id");
			const forSeat = typeof flags.for === "string" ? flags.for.trim() : undefined;
			if (forSeat !== undefined && forSeat === "") return err("E-ARG", "--for needs a session id");
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
			// `--for` names the WATCHER, so it is meaningless on any action that has
			// no watcher concept. Validated at the TOP of this case, before the
			// action-specific early returns — see the comment there.
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
			return ok({ verb: "watchdog", action: typedAction, id, capture, forSeat, json });
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
			if (flags.role === true) return err("E-ARG", `--role needs ${STORED_ROLE_CHOICES}`);
			const role = typeof flags.role === "string" ? flags.role : undefined;
			if (role !== undefined && !isStoredOrchestrationRole(role)) {
				return err(
					"E-ARG",
					`unknown orchestration role '${role}' (expected ${STORED_ROLE_CHOICES})`,
				);
			}
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "link",
				childId,
				parentId: root ? null : (parentId as string),
				...(role === undefined ? {} : { role }),
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
		case "task close": {
			const assignmentId = pos[0];
			if (assignmentId === undefined)
				return err(
					"E-ARG",
					`usage: pij task close <assignment-id> --reason <${ASSIGNMENT_CLOSE_REASONS.join("|")}>`,
				);
			if (typeof flags.reason !== "string" || flags.reason === "")
				return err("E-ARG", `--reason is required: one of ${ASSIGNMENT_CLOSE_REASONS.join("|")}`);
			if (!isAssignmentCloseReason(flags.reason))
				return err(
					"E-ARG",
					`unknown close reason '${flags.reason}' (expected ${ASSIGNMENT_CLOSE_REASONS.join("|")})`,
				);
			if (flags.actor === true || flags.actor === "") return err("E-ARG", "--actor needs a label");
			return ok({
				verb: "task-close",
				assignmentId,
				reason: flags.reason,
				actor: typeof flags.actor === "string" ? flags.actor : undefined,
				json,
			});
		}
		case "report now": {
			const didInput = pos[0];
			const nextInput = pos[1];
			if (didInput === undefined || nextInput === undefined) {
				return err(
					"E-ARG",
					'usage: pij report now "<did>" "<next>" [--state <word>] [--project <slug>]',
				);
			}
			const did = normalizeReportText("did", didInput);
			if (!did.ok) return did;
			const next = normalizeReportText("next", nextInput);
			if (!next.ok) return next;
			if (flags.state === true || flags.state === "") {
				return err("E-ARG", "--state takes a semantic state");
			}
			const state = typeof flags.state === "string" ? flags.state : undefined;
			if (state !== undefined && !isSemanticState(state)) {
				return err("E-ARG", `invalid semantic state '${state}' (${SEMANTIC_STATES.join("|")})`);
			}
			if (flags.note === true) return err("E-ARG", "--note takes text");
			const noteInput = typeof flags.note === "string" ? flags.note : undefined;
			if (noteInput !== undefined && state !== "question" && state !== "blocked") {
				return err("E-ARG", "--note is permitted only with --state question or --state blocked");
			}
			const note = noteInput === undefined ? undefined : normalizeReportNote(noteInput);
			if (note !== undefined && !note.ok) return note;
			if (flags.project === true || flags.project === "") {
				return err("E-ARG", "--project takes a project slug");
			}
			const projectSlug = typeof flags.project === "string" ? flags.project : undefined;
			if (projectSlug !== undefined && !isValidProjectSlug(projectSlug)) {
				return err("E-ARG", `invalid project slug '${projectSlug}' (use lowercase kebab-case)`);
			}
			if (flags.for === true || flags.for === "") {
				return err("E-ARG", "--for takes the seat id whose card you are relaying");
			}
			// A relay carries the CARD, never a state declaration. `--state` is
			// first-person testimony about the subject's own work, and a PA
			// asserting its prime is `blocked` would be exactly the identity
			// borrowing the relay exists to make attributable instead of invisible.
			if (typeof flags.for === "string" && state !== undefined) {
				return err(
					"E-ARG",
					"--for relays a card only; a semantic state is first-person and cannot be declared on another seat's behalf",
				);
			}
			return ok({
				verb: "report-now",
				did: did.value,
				next: next.value,
				state,
				note: note?.value,
				projectSlug,
				forSeat: typeof flags.for === "string" ? flags.for : undefined,
				json,
			});
		}
		case "report question":
		case "report blocked": {
			const state: "question" | "blocked" = key === "report question" ? "question" : "blocked";
			const noteInput = pos[0];
			if (noteInput === undefined) {
				return err("E-ARG", `usage: pij report ${state} "<text>" [--assignment <id>]`);
			}
			const note = normalizeReportNote(noteInput);
			if (!note.ok) return note;
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			return ok({
				verb: "state-set",
				state,
				note: note.value,
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
				refs: [],
				json,
			});
		}
		case "report state": {
			const state = pos[0];
			if (state === undefined) {
				return err("E-ARG", "usage: pij report state <state> [--assignment <id>] [--refs <r,s>]");
			}
			if (!isSemanticState(state)) {
				return err("E-ARG", `invalid semantic state '${state}' (${SEMANTIC_STATES.join("|")})`);
			}
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			if (flags.refs === true) return err("E-ARG", "--refs takes a comma-separated list");
			const stateRefs =
				typeof flags.refs === "string"
					? flags.refs
							.split(",")
							.map((ref) => ref.trim())
							.filter((ref) => ref !== "")
					: [];
			return ok({
				verb: "state-set",
				state,
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
				refs: stateRefs,
				json,
			});
		}
		case "report verify": {
			const node = pos[0];
			if (node === undefined) {
				return err("E-ARG", "usage: pij report verify <node> [--assignment <id>]");
			}
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			return ok({
				verb: "state-verify",
				node,
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
				json,
			});
		}
		case "report clear": {
			if (flags.assignment === true) return err("E-ARG", "--assignment takes an assignment id");
			return ok({
				verb: "state-clear",
				assignmentId: typeof flags.assignment === "string" ? flags.assignment : undefined,
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
				`unknown command '${verb}' (whoami|list|sessions|models|send|dispatch|ack|canary|tail|state|watchdog|phonehome|tree|link|path|project|spine|task|report|node|anomalies)`,
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

/** The `pij watchdog <action> <id>` result line, in ONE place.
 *
 * Extracted (plan 094) when the PA self-resignation path had to return before
 * the shared preamble: two exits rendering the same receipt by hand is how the
 * two start describing the same sidecar differently. `describeWatchdogState`
 * stays FIRST — watching-vs-paused is the armed/inert discriminator in the
 * tool's own words, and a prime once got that for free from a pasted receipt. */
/** The scheduler verdict line for `pij watchdog status` (s101).
 *
 *  Answers "is this seat actually IN the scheduler?", which was previously
 *  unanswerable from any command: `WatchdogManager.states` is a private in-memory
 *  Map in the DAEMON process, so establishing it for one seat cost a prime 28
 *  minutes of deliberately withheld status cards.
 *
 *  THREE VERDICTS, NEVER TWO: `scheduled`, `not-scheduled`, and `unknown` (no
 *  projection yet, stale, or corrupt). Collapsing the last two would report a seat
 *  as absent from the scheduler whenever the DAEMON had simply not written the
 *  file — manufacturing exactly the false certainty the experiment was run to
 *  avoid.
 *
 *  RETURNS undefined ONLY when this build has no file reader wired, which is a
 *  fact about the BUILD and never about the seat. That is a third axis, kept
 *  separate on purpose rather than folded into `unknown`. */
function schedulerVerdictLine(id: string, deps: CliDeps, nowMs: number): string | undefined {
	const read = deps.readTextFile;
	if (read === undefined) return undefined;
	let raw: string | undefined;
	try {
		raw = read(`${deps.pijHome}/${WATCHDOG_SCHEDULER_FILE}`);
	} catch {
		raw = undefined; // missing/unreadable -> parses to undefined -> UNKNOWN
	}
	return renderSchedulerVerdict(
		readSchedulerVerdict(raw === undefined ? undefined : parseSchedulerProjection(raw), id, nowMs),
	);
}

function renderWatchdogResult(
	id: string,
	block: ReturnType<typeof watchdogBlock>,
	rebound: boolean,
	json: boolean,
	scheduler?: string,
): CliResult {
	if (json)
		return okOut(
			JSON.stringify({
				id,
				watchdog: block,
				watcherRebound: rebound,
				...(scheduler === undefined ? {} : { scheduler }),
			}),
		);
	const expiry =
		block.exemptUntilMs === null
			? ""
			: ` · until ${new Date(block.exemptUntilMs).toISOString()} (${humanizeDurationMs(block.exemptRemainingMs ?? 0)} remaining)`;
	return okOut(
		`${id}: ${describeWatchdogState(block)} · interval ${humanizeDurationMs(block.intervalMs)}${expiry} · ${renderWatcherRoster(block.watchers)}${rebound ? " · re-bound (original addedAt preserved)" : ""}${scheduler === undefined ? "" : ` · ${scheduler}`}`,
	);
}

function selfId(deps: CliDeps): Result<SessionId> {
	// PIJ_SENDER escape hatch (PoC day-2 item 3): a hard sender override that
	// SKIPS ambient harness detection, so a script, the daemon, or a test can
	// declare which pij id it is sending as even from inside a Claude/Copilot/Codex
	// tool shell (where CLAUDE_CODE_SESSION_ID would otherwise win). The id must be
	// a registered seat; a pull descriptor is the intended shape for a non-harness
	// sender. `pij send --as <id>` sets this for one call (see the bin).
	const sender = deps.process.env("PIJ_SENDER")?.trim();
	if (sender) {
		if (!deps.registry.read(sender)) {
			return err(
				"E-NOID",
				`PIJ_SENDER=${sender} is not a registered session; register a pull peer first or drop --as/PIJ_SENDER`,
			);
		}
		return ok(sender);
	}
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
		const resolved = resolveLivePane(pane, deps.registry.list());
		if (!resolved.ok) return resolved;
		if (resolved.value) return resolveSelf(resolved.value, [], pane);
	}
	return resolveSelf(undefined, filterByFolder(deps.registry.list(), deps.cwd), pane);
}

/** First-person reports require a registry-backed seat. PIJ_SESSION_ID can
 * assert an arbitrary id for compatibility elsewhere; a durable report cannot
 * be attributed to that assertion unless the descriptor resolves here. */
function readReportingDescriptor(deps: CliDeps, id: SessionId): Result<SessionDescriptor> {
	const descriptor = deps.registry.read(id);
	if (!descriptor) return err("E-NOID", `reporting seat '${id}' is not registered`);
	if (descriptor.lifecycle === "dissolved") {
		return err(
			"E-NOID",
			`reporting seat '${id}' is dissolved; run pij revive ${id} before reporting`,
		);
	}
	return ok(descriptor);
}

function resolveReportingSelf(deps: CliDeps): Result<SessionDescriptor> {
	const resolved = selfId(deps);
	if (!resolved.ok) return err("E-NOID", `cannot resolve reporting seat (${resolved.message})`);
	return readReportingDescriptor(deps, resolved.value);
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

/** Production composition seam for `pij orchestration role|prime`.
 * Attribution is resolved by the bin before this port is created, so dispatch
 * can refuse missing platform wiring before any descriptor write. */
export function createOrchestrationDesignationAudit(
	deps: CliDeps,
	actor: string,
): Result<DesignationAuditPort> {
	const ports = platformWritePorts(deps);
	if (!ports.ok) return ports;
	return ok(
		new DesignationAuditService({
			spineLog: ports.value.spineLog,
			platformWriteLock: ports.value.platformWriteLock,
			recover: () => recoverPlatformWrites(ports.value),
			now: () => deps.process.now(),
			actor,
		}),
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
	readonly receipt: SendDisposition;
	/** Machine-stable WHY for a non-delivered receipt (plan 071 D3). `queued`
	 *  alone was a single opaque word that covered "mid-turn", "not bound yet",
	 *  and "will never bind" identically. */
	readonly reason?: QueuedReason | "never-bound";
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

/** What this send can honestly claim, and why (plan 071 D3).
 *
 *  `delivered` is reserved for the ONE case the sender can actually prove from
 *  here: a peer that owns its own injection and was idle when we looked. Every
 *  other outcome names its cause instead of hiding behind a bare `queued`.
 *
 *  It keys on descriptor liveness and daemon authority ONLY — body length is
 *  deliberately not an input here. Whether there is anything worth a receipt at
 *  all is decided EARLIER, by the empty-payload guard in the send dispatch
 *  branch (plan 093 D1, search `E-EMPTY`), which refuses before
 *  `deps.delivery.deliver` runs. That ordering is the fix for pij#132: no
 *  receipt can describe a payload that was never delivered, because this
 *  function is unreachable for a refused send. */
function classifySendReceipt(
	descriptor: SessionDescriptor,
	now: number,
): { receipt: SendDisposition; reason?: QueuedReason | "never-bound" } {
	// A seat that has stopped binding will never inject this message. Saying
	// `queued` here is the specific lie that let a wedged peer look healthy for
	// 16 minutes.
	const health = classifyBindHealth(descriptor, now);
	if (isBindDegraded(health)) return { receipt: "blocked", reason: "never-bound" };
	if (effectiveDeliveryMode(descriptor) === "pull")
		return { receipt: "queued", reason: "pull-inbox" };
	// Checked BEFORE the transport branches: a seat that has not bound yet cannot
	// have been delivered to, whatever harness it will turn out to be running.
	if (health === "pre-bind") return { receipt: "queued", reason: "unbound" };
	if (daemonReceiptAuthoritative(descriptor)) {
		if (isCompacting(descriptor, now)) return { receipt: "queued", reason: "compacting" };
		return { receipt: "queued", reason: "tick-pending" };
	}
	if ((descriptor.state ?? "idle") === "working") return { receipt: "queued", reason: "busy" };
	return { receipt: "delivered" };
}

function sendSuccess(
	target: PreflightTarget,
	messageId: string,
	kind: string,
	now: number,
): SendSuccess {
	const { receipt, reason } = classifySendReceipt(target.descriptor, now);
	const tickStatus = daemonReceiptAuthoritative(target.descriptor)
		? daemonTickStatus(target.descriptor.lastTickAt, now)
		: undefined;
	return {
		to: target.id,
		messageId,
		kind,
		receipt,
		...(reason ? { reason } : {}),
		liveness: target.liveness,
		...(tickStatus ?? {}),
	};
}

/** A descriptor's EFFECTIVE delivery mode (plan 093 T002).
 *
 *  `deliveryMode` is optional on the descriptor; a seat that predates the field
 *  is `push` iff it owns a pane. The bin already derives it this way for
 *  `pij inbox`, so this is that same one expression, named once, rather than a
 *  third copy of it.
 *
 *  Return type is spelled `NonNullable<SessionDescriptor["deliveryMode"]>`
 *  rather than the `DeliveryMode` alias ON PURPOSE: this file is co-owned with
 *  another stream this wave, and the type-import block is outside this change's
 *  edit fence. Same type, no import churn, no merge conflict for a seat that has
 *  no idea this edit exists. */
export function effectiveDeliveryMode(
	descriptor: SessionDescriptor,
): NonNullable<SessionDescriptor["deliveryMode"]> {
	return descriptor.deliveryMode ?? (descriptor.paneId ? "push" : "pull");
}

/** Can this target render a reference-passing attachment at all?
 *
 *  Only two consumers ever read `attachments`: the `pij inbox` PULL renderer and
 *  the telegram bridge (which is a pull seat). BOTH push injectors — the daemon
 *  router and the in-session handler — drop the field and inject `frame(from,
 *  body)`, so an attachment sent to a pushed peer is not "degraded", it is
 *  invisible. That asymmetry is the whole of pij#132, and it is a property of
 *  the TARGET, which is why the guard cannot live in the pure parse. */
export function targetRendersAttachments(descriptor: SessionDescriptor): boolean {
	return effectiveDeliveryMode(descriptor) === "pull";
}

/** The safe literal channel, named in every refusal and warning (AC-13). A
 *  caller who hits a guard is told what to do, at the surface — not in an issue. */
function safeBodyHint(to: SessionId): string {
	return `put the content in the BODY: pij send ${to} --body-file <path|-> (reads the file/stdin literally)`;
}

/** The human-readable half of a receipt. Every branch names its cause; the
 *  `blocked` branch is deliberately the loudest thing `pij send` can print
 *  without failing (plan 071 D3). */
/** Stamp the SENDER's own activity axis after a successful outbound send
 *  (plan 071 D3 addendum).
 *
 *  Proved by timed probe on 2026-07-25: a sender's `lastEventAt` grew
 *  monotonically across a window containing a verified send, because only the
 *  in-process pi receiver (`PijSession.capture`) ever refreshed it — the `pij
 *  send` CLI is a separate short-lived process and stamped nothing. Sending is
 *  work: anything keyed off last-event (watchdog deadness, stall detection,
 *  liveness) otherwise reads a busy send-only orchestrator as quiet.
 *
 *  Best-effort by design: a failed stamp must never fail a delivered message, so
 *  every fault is swallowed. Re-reads immediately before writing so it bumps one
 *  field on current truth instead of replaying a stale snapshot. */
function stampSenderActivity(deps: CliDeps, self: SessionId, nowMs: number): void {
	try {
		const latest = deps.registry.read(self);
		if (!latest || latest.lifecycle === "dissolved") return;
		// Never write over a seat that is closing or already terminal (s070/#47's
		// lesson, applied to this CLI-side write). `pij close` persists
		// `closeIntent` → kills the pane → stamps `terminal` → dissolves; a
		// read-modify-write from another process that straddles any of those steps
		// can replay a pre-close snapshot over them. That is a LOST UPDATE, not a
		// missing check, and it is what made a pij-requested close announce itself
		// as `unrequested-by-pij`. A closing seat's activity axis is worth nothing,
		// so the safe move is simply not to write.
		if (latest.closeIntent !== undefined || latest.terminal !== undefined) return;
		if (latest.lifecycle === "failed") return;
		deps.registry.write({ ...latest, lastEventAt: new Date(nowMs).toISOString() });
	} catch {
		/* the message is already delivered — never fail a send over telemetry */
	}
}

function renderReceiptHint(
	result: {
		readonly receipt: SendDisposition;
		readonly reason?: QueuedReason | "never-bound";
		readonly daemonTickStale?: boolean;
		readonly daemonTickAgeMs?: number | null;
	},
	target: SessionDescriptor,
	now: number,
): string {
	if (result.receipt === "blocked") {
		return `BLOCKED: peer never bound — ${bindHealthDetail(target, classifyBindHealth(target, now), now) ?? "no binding"}. Nothing will deliver this until the seat is re-spawned or recovered (\`pij state ${target.id}\`)`;
	}
	if (result.receipt === "delivered") return "delivered: peer was idle";
	switch (result.reason) {
		case "pull-inbox":
			return "queued (pull-inbox): awaiting the peer's own inbox check";
		case "compacting":
			return "queued (compacting): target is compacting, drain resumes when it is ready";
		case "unbound":
			return "queued (unbound): peer is still binding — delivery starts at bind";
		case "busy":
			return "queued (busy): peer is mid-turn, will steer after the current turn";
		default:
			return result.daemonTickStale
				? `queued (tick-pending): daemon tick stale (${humanAge(result.daemonTickAgeMs ?? null)} old)`
				: "queued (tick-pending): awaiting daemon delivery confirmation";
	}
}

function renderBroadcastSuccess(
	result: SendSuccess,
	target: SessionDescriptor,
	now: number,
): string {
	const recvHint = renderReceiptHint(result, target, now);
	const targetAgeMs = descAgeMs(target, now);
	const warn =
		targetAgeMs === null || targetAgeMs > STALE_AFTER_MS
			? " (note: no recent pij events from peer — normal for a control-plane peer; the send still lands)"
			: "";
	return `sent → ${result.to}  ${result.kind}${warn}  (${recvHint})`;
}

// ─── dispatch ───────────────────────────────────────────────────────────────
/** The PA capability boundary, seam 1 of 2 (plan 078).
 *
 * Placed at the TOP of dispatch() so it covers every parsed verb and every
 * caller — the bin, the extension, and the daemon alike. Seam 2 lives in the
 * bin's main() because spawn/adopt/close/orchestration branch on raw argv and
 * return BEFORE core parse ever runs; a gate here alone would refuse `task set`
 * and silently permit `close`. Both seams consult ONE predicate
 * (`paRefusal`), and `pa-capability.test.ts` asserts the classification table is
 * total against BOTH source files, so a new verb cannot slip through unclassified.
 *
 * Fail-OPEN on an unresolvable self, deliberately: refusing a caller we cannot
 * identify would break every unregistered context (tests, tooling, first-run)
 * to constrain a seat that is always registered by construction. The boundary
 * is for a cooperative internal role, not an adversary.
 */
function paGate(cmd: ParsedCommand, deps: CliDeps): CliResult | null {
	// PURE TABLE FIRST, IDENTITY ONLY IF IT COULD MATTER. Resolving the caller
	// means a registry read, and doing that on every verb would put an I/O hit on
	// the whole CLI to constrain one role — existing read-count invariants caught
	// exactly that. A verb nobody is ever refused for cannot need to know who is
	// asking, so allowed verbs now cost nothing at all.
	const capability = PA_VERB_CLASSIFICATION[cmd.verb];
	if (capability === undefined || capability.kind === "allow") return null;
	// CONDITIONAL verbs cost nothing here either, and that is the point: the
	// table cannot see the target, so there is no decision to make and no reason
	// to pay for a caller lookup. The handler that CAN see the target does its
	// own resolution, so the read count for these verbs is unchanged — the gate
	// simply stops guessing.
	if (capability.kind === "conditional") return null;
	const self = selfId(deps);
	if (!self.ok) return null;
	const descriptor = deps.registry.read(self.value);
	if (!descriptor) return null;
	const why = paRefusal(projectOrchestrationRole(descriptor), cmd.verb);
	if (why === null) return null;
	return fail("E-OWN", paRefusalMessage(cmd.verb, why), cmd.json === true);
}

/** The PA's watchdog boundary, enforced HERE rather than in the gate.
 *
 * The gate classifies `watchdog` as CONDITIONAL and passes it through, which
 * means this function is the only thing between a PA and every seat on the box.
 * It lives in the handler for one reason: **the gate must not read the
 * registry** on the hot path (`core/cli.test.ts` pins `reads === 0` for a
 * 25-node tree projection, and the gate's own comment records that a caller
 * lookup there was caught by exactly that invariant). The target is knowable
 * only here.
 *
 * NARROWED BY ACTION FIRST, THEN BY TARGET — and the order is load-bearing:
 *   - **action** — `list` is a permitted read, `unwatch` is permitted against
 *     any target, `watch` is lineage-scoped, and everything else is refused.
 *     `list`/`disable-all`/`enable-all` branch BEFORE any per-seat id is
 *     resolved, so a check placed after target resolution would never reach
 *     them — it would silently permit the machine-wide pair, the widest hole in
 *     the set, while never permitting the read.
 *   - **target** — for `watch` only: the PA itself or its own `effectiveParent`.
 *
 * THREE-VALUED, not two (plan 094). `unwatch` is permitted against a stranger,
 * but the ORDINARY unwatch path is not what a PA may run: reaching it means
 * running a shared preamble that reconciles and PERSISTS the target's exemption
 * state, which can un-pause a seat that is neither the PA nor its parent. So the
 * decision distinguishes *permitted outright* from *permitted as a
 * self-resignation*, and the handler routes the latter to a path that writes
 * only the caller's own watcher row.
 *
 * POLARITIES DIFFER ON PURPOSE. Caller identity fails **open** (an unresolvable
 * caller keeps today's behaviour, so unregistered contexts — tests, tooling,
 * first run — are not broken to constrain a seat that is always registered).
 * Target questions fail **closed** (`pa-target.ts`).
 */
type PaWatchdogDecision =
	| { readonly kind: "allow" }
	/** A PA `unwatch`: permitted, but only as the removal of its OWN row. */
	| { readonly kind: "self-resign" }
	| { readonly kind: "refuse"; readonly result: CliResult };

function paWatchdogRefusal(
	cmd: Extract<ParsedCommand, { verb: "watchdog" }>,
	deps: CliDeps,
): PaWatchdogDecision {
	const allow: PaWatchdogDecision = { kind: "allow" };
	const condition = paConditionalWhy("watchdog");
	// Defensive, and deliberately not an assertion: if `watchdog` is ever
	// reclassified away from `conditional`, the table is once again the
	// authority and this handler must not invent a second boundary beside it.
	if (condition === null) return allow;
	const self = selfId(deps);
	if (!self.ok) return allow;
	const descriptor = deps.registry.read(self.value);
	if (!descriptor) return allow;
	if (projectOrchestrationRole(descriptor) !== "pa") return allow;
	const verb = `watchdog ${cmd.action}`;
	const refuse = (why: string): PaWatchdogDecision => ({
		kind: "refuse",
		result: fail("E-OWN", paRefusalMessage(verb, why), cmd.json),
	});
	// AC-10 — THE ONE PLACE PHASE 3 COULD SILENTLY UNDO PHASE 2. `--for` names
	// the watcher, so a PA allowed to use it could bind ANY seat to ANY target
	// and walk straight around the target rule above: the boundary defeated by a
	// flag rather than by a bug. Refused OUTRIGHT, including when the PA names
	// itself — `--for` exists for acting on ANOTHER seat's behalf, and a PA has
	// no behalf but its own, which the plain path already serves. Checked before
	// the target decision so the refusal names the real reason.
	//
	// It is also what makes the widened `unwatch` below safe: with `--for` gone,
	// the effective watcher is always the caller, so self-resignation is enforced
	// by the data path rather than by trust.
	if (cmd.forSeat !== undefined) {
		return refuse(
			"'--for' binds a subscription on ANOTHER seat's behalf, which is a prime's repair path — a PA acts only for itself, so run it without '--for'",
		);
	}
	// A pure read over every seat's roster, and the ONLY way a PA can discover
	// which subscriptions it holds. Checked here, ahead of target resolution,
	// because `list` takes no target at all.
	if (cmd.action === "list") return allow;
	if (cmd.action === "unwatch") return { kind: "self-resign" };
	if (cmd.action !== "watch") return refuse(condition);
	const decision = paTargetDecision(descriptor, cmd.id);
	if (decision.kind === "allow") return allow;
	return refuse(decision.why);
}

export function dispatch(cmd: ParsedCommand, deps: CliDeps): CliResult {
	const refused = paGate(cmd, deps);
	if (refused !== null) return refused;
	const now = deps.process.now();
	switch (cmd.verb) {
		case "watchdog": {
			// FIRST in the case, ahead of the store-availability check: whether a
			// PA may act must not depend on whether a store happens to be wired,
			// or a missing store would mask the refusal with an E-ARG.
			const paRefused = paWatchdogRefusal(cmd, deps);
			if (paRefused.kind === "refuse") return paRefused.result;
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
										`${row.id}: ${describeWatchdogState(row.watchdog)} · ${renderWatcherRoster(row.watchdog.watchers)}`,
								)
								.join("\n"),
				);
			}
			const id = cmd.id;
			if (!id) return fail("E-ARG", `pij watchdog ${cmd.action} needs a session id`, cmd.json);
			const descriptor = deps.registry.read(id);
			if (!descriptor) return fail("E-NOID", `no session '${id}' in registry`, cmd.json);
			// ── A PA's self-resignation, and it RETURNS BEFORE THE PREAMBLE BELOW ──
			// That ordering is the entire point, not a tidiness preference. The
			// preamble reads the TARGET's sidecar, reconciles its exemption and
			// PERSISTS the result — on an expired exemption that resolves through
			// `withoutPause`, it un-pauses the watchdog of a seat which is neither
			// the PA nor its parent. A PA is permitted `unwatch <anyone>` because
			// `--for` is refused for it, so the write can only reach its own row;
			// letting it fall through here would smuggle a supervision-policy change
			// for a third party in behind that permission, through code with nothing
			// to do with watchers. A branch placed AFTER the preamble is
			// non-reconciling in intent only.
			//
			// NO-OP WHEN THERE IS NOTHING TO REMOVE: resigning from a subscription
			// you do not hold writes nothing at all, so a PA cannot touch a
			// stranger's file merely by asking a question with an `unwatch` shape.
			if (paRefused.kind === "self-resign") {
				const self = selfId(deps);
				if (!self.ok) return fail(self.code, self.message, cmd.json);
				const current = store.read(id);
				const watchers = current?.watchers ?? [];
				const remaining = watchers.filter((watcher) => watcher.watcherId !== self.value);
				let resigned: WatchdogSidecar = current ?? {};
				if (remaining.length !== watchers.length) {
					resigned = { ...current, watchers: remaining };
					store.write(id, resigned);
				}
				const block = watchdogBlock(
					descriptor,
					resigned,
					deps.watchdogGlobalStore?.disabled() ?? false,
					now,
				);
				return renderWatchdogResult(
					id,
					block,
					false,
					cmd.json,
					cmd.action === "status" ? schedulerVerdictLine(id, deps, now) : undefined,
				);
			}
			const storedSidecar = store.read(id);
			const reconciled = reconcileWatchdogExemption(storedSidecar, now);
			if (reconciled.sidecar !== storedSidecar && reconciled.sidecar !== undefined) {
				store.write(id, reconciled.sidecar);
			}
			let sidecar = reconciled.sidecar ?? {};
			// Key Finding 04: `addedAt` is read by nothing today, so once a re-bind
			// stops moving it, the ONLY evidence a re-bind happened would be gone.
			// Surfacing it keeps the trail — the stamp records when the
			// subscription was created, this records that it was just re-bound.
			let rebound = false;
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
				// THE EFFECTIVE WATCHER — the seat being bound, which is the `--for`
				// value when present and otherwise the caller. Key Finding 03: the
				// filter used to key on the CALLER, which was wrong in BOTH
				// directions. `watch --for X` left X's own entry unfiltered and
				// appended a second one (a duplicate nothing could clean up), and
				// `unwatch --for X` removed the caller's entry instead of X's, so a
				// --for-created subscription was un-removable by the seat that owned
				// it. One concept, applied to both actions, fixes both.
				const watcherId = cmd.forSeat ?? self.value;
				// CAPTURED BEFORE THE FILTER — this ordering IS the fix. The old code
				// filtered first and then built a fresh record, so the original
				// `addedAt` was already gone by the time it could have been reused.
				const prior = (sidecar.watchers ?? []).find((watcher) => watcher.watcherId === watcherId);
				const others = (sidecar.watchers ?? []).filter(
					(watcher) => watcher.watcherId !== watcherId,
				);
				rebound = cmd.action === "watch" && prior !== undefined;
				const watchers =
					cmd.action === "watch"
						? [
								...others,
								{
									watcherId,
									// R-01, Jordan verbatim: "original". A re-bind PRESERVES the
									// creation stamp on every path, matching the in-repo
									// precedent at `core/watch-subscription.ts:75`; only a
									// genuinely new subscription stamps. Settings still change —
									// preservation applies to the creation time, not the record.
									addedAt: prior?.addedAt ?? new Date(now).toISOString(),
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
			return renderWatchdogResult(
				id,
				block,
				rebound,
				cmd.json,
				cmd.action === "status" ? schedulerVerdictLine(id, deps, now) : undefined,
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
			// ROLE AND CAPABILITY ARE PROJECTED HERE (plan 078) because a gate whose
			// input is unobservable is the defect this stream exists to prevent. The
			// s075 authority rule shipped with `opened.actor` unreadable, so seats
			// discovered their own authorisation by attempting and reading refusals;
			// the PA gate must not repeat that. A PA can now ask what it is and what
			// it may do BEFORE it attempts anything. Internal surface — chainglass
			// consumes list/tree/node-show and never whoami (o-prime verified).
			const role = projectOrchestrationRole(d);
			const refusedForText = Object.keys(PA_VERB_CLASSIFICATION)
				.filter((verb) => paRefusal(role, verb) !== null)
				.sort();
			// CONDITIONAL verbs are stated SEPARATELY in the TEXT surface, never
			// folded into the refused line (plan 084, AC-13). Folding them in would
			// be a lie in the restrictive direction — a PA reads "watchdog:
			// refused", concludes it cannot supervise its own prime, and escalates
			// to a human instead of running the command that would have worked,
			// which is the loop #95 describes. Omitting them would be a lie in the
			// permissive direction: the PA attempts a forbidden target and learns
			// the boundary by refusal, which is the discovery-by-attempting this
			// stream exists to end. The honest answer states the condition.
			const conditions =
				role === "pa"
					? Object.keys(PA_VERB_CLASSIFICATION)
							.map((verb) => ({ verb, why: paConditionalWhy(verb) }))
							.filter((entry): entry is { verb: string; why: string } => entry.why !== null)
							.sort((left, right) => left.verb.localeCompare(right.verb))
					: [];
			// THE JSON SURFACE IS A TOTAL MAP, NOT TWO LISTS (plan 094, #153).
			// `refusedVerbs`/`conditionalVerbs` partitioned a space this payload
			// never enumerated, so ABSENCE FROM `refusedVerbs` READ AS ALLOWED —
			// and a consumer cannot tell a verb that is permitted from one the
			// producer had never heard of. #134 demonstrated the cost: it ADDED
			// `conditionalVerbs` and left `refusedVerbs` present and still correct,
			// so a probe testing `'watchdog' in refusedVerbs` kept parsing, kept
			// succeeding, and returned a confident falsehood. An additive schema
			// change is silent to a stale consumer; only a removal is loud, so both
			// fields are GONE rather than kept as derived views.
			//
			// TOTAL FOR EVERY ROLE. A non-PA gets the same complete map, uniformly
			// `allow`, because emitting it only for a PA would recreate the same
			// defect one level up: an absent map would then mean either "not a PA"
			// or "this build has no gate", and a consumer could not tell.
			const verbs: Record<string, PaCapability["kind"]> = Object.fromEntries(
				Object.entries(PA_VERB_CLASSIFICATION)
					.map(([verb, capability]): [string, PaCapability["kind"]] => [
						verb,
						role === "pa" ? capability.kind : "allow",
					])
					.sort(([left], [right]) => left.localeCompare(right)),
			);
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: d.id,
						folder: d.folder,
						dataDir: d.dataDir,
						state: d.state ?? "idle",
						pid: d.pid,
						orchestrationRole: role,
						// The schema marker exists so a consumer detects this reshape
						// DELIBERATELY rather than inferring it from a missing key. It does
						// NOT close the residual: a consumer doing `get('refusedVerbs', [])`
						// still reads `[]` and concludes "nothing is refused" — silent and
						// permissive. No payload shape can fix that, and this comment does
						// not pretend otherwise.
						capabilitySchema: 2,
						verbs,
					}),
				);
			return okOut(
				[
					`pij session: ${d.id}`,
					`folder:      ${d.folder}`,
					`data dir:    ${d.dataDir}`,
					`state:       ${d.state ?? "idle"}`,
					`role:        ${role ?? "—"}`,
					...(refusedForText.length === 0 ? [] : [`refused:     ${refusedForText.join(" ")}`]),
					// The CONDITION, not just the verb: a bare list would tell a PA it
					// might be allowed and nothing about when.
					...conditions.map((entry) => `conditional: ${entry.verb} — ${entry.why}`),
				].join("\n"),
			);
		}
		case "list": {
			// Archived tier (plan 071 D1): served entirely from the append-only
			// `archive/index.jsonl`, so listing thousands of buried seats never
			// opens thousands of descriptor files. Read-only — the daemon is the
			// single writer for everything under `archive/`.
			if (cmd.archived) {
				const entries = deps.registry.listArchived?.() ?? [];
				if (cmd.json) return okOut(JSON.stringify(entries));
				if (entries.length === 0) return okOut("no archived pij sessions");
				const archivedHeader = `  ${pad("id", 22)} ${pad("archived", 20)} ${pad("lifecycle", 10)} ${pad("reason", 20)} folder`;
				const archivedLines = entries.map(
					(entry) =>
						`  ${pad(entry.id, 22)} ${pad(entry.archivedAt, 20)} ${pad(entry.lifecycle ?? "—", 10)} ${pad(entry.failureReason ?? "—", 20)} ${entry.folder ?? "—"}`,
				);
				return okOut(
					[archivedHeader, ...archivedLines, `${entries.length} archived session(s)`].join("\n"),
				);
			}
			let descs = deps.registry.list();
			if (cmd.here) descs = filterByFolder(descs, deps.cwd);
			if (cmd.prime) descs = filterPrime(descs);
			// `--badge` is OPT-IN because it is the one part of this projection
			// that costs a join. Everything else on a row is a descriptor field
			// read, and seats that never wanted a badge keep `list` at ~0.45s.
			let badges: ReadonlyMap<SessionId, SemanticState | SystemState> | undefined;
			if (cmd.badge === true) {
				const built = badgeIndex(deps, descs);
				if (!built.ok) return fail(built.code, built.message, cmd.json);
				badges = built.value;
			}
			const s = selfId(deps);
			const self = s.ok ? s.value : undefined;
			// ONE liveness probe and ONE bind-health verdict per row, computed here
			// and reused by both the JSON and human renderings (plan 071 D5 T014).
			const rows = descs.map((d) => {
				const live = liveOf(deps, d, now);
				return { d, live, degraded: isBindDegraded(classifyBindHealth(d, now)) };
			});
			if (cmd.json)
				return okOut(
					JSON.stringify(
						rows.map(({ d, live, degraded }) => ({
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
							bindHealth: classifyBindHealth(d, now),
							degraded,
							terminal: d.terminal ?? null,
							watchdog: watchdogBlock(
								d,
								deps.watchdogStore?.read(d.id),
								deps.watchdogGlobalStore?.disabled() ?? false,
								now,
							),
							prime: d.prime === true,
							oldPrime: d.oldPrime === true,
							orchestrationRole: projectOrchestrationRole(d),
							// Assignment/state denorm: CLI-owned fields already stamped
							// by `task set` and the `report` family via denormDescriptor,
							// so projecting them here is a field read —
							// NO spine read, NO assignmentStore join, NO per-row fan-out.
							// A UI otherwise pays N × `node show` to answer "what is this
							// seat doing/asking" (measured: 179 rows ≈ 80s). Deliberately NOT
							// `badge`, which is computed from every OPEN assignment's
							// chain state and cannot be derived from these fields.
							currentAssignment: d.currentAssignment ?? null,
							currentTask: d.currentTask ?? null,
							semanticState: d.semanticState ?? null,
							stateNote: d.stateNote ?? null,
							statusPrev: d.statusPrev ?? null,
							statusNext: d.statusNext ?? null,
							statusAt: d.statusAt ?? null,
							statusSeq: d.statusSeq ?? null,
							statusWrittenBy: d.statusWrittenBy ?? null,
							planId: d.planId ?? null,
							// Present ONLY under --badge. Absent (not null) when not
							// asked for, so a consumer can tell "not requested" from
							// "requested and genuinely unknown" (which is `"unknown"`).
							...(badges ? { badge: badges.get(d.id) ?? "unknown" } : {}),
							// Adoption axis (plan 054 P3, WS-1): explicit boolean in the
							// row projection so a UI/skill can filter without joins.
							// `parent` is the EVIDENCE `unadopted` is derived from, and
							// withholding it while publishing the verdict is what made
							// three separate governments draw false lineage conclusions
							// (D-041): a consumer reading `d.parent == null` on a row that
							// never carried the key gets `true` for every seat alive, and
							// the fabricated answer is the alarming one. Deliberately
							// `effectiveParent`, the SAME notion and the SAME key name
							// `node show` projects — a raw `parentId` here would disagree
							// with `node show` for every spawned-but-never-linked seat and
							// buy back the class it was added to remove.
							parent: effectiveParent(d),
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
				({ d, live, degraded }) =>
					`${d.id === self ? "★ " : "  "}${pad(d.id, 14)} ${d.prime === true ? "P" : d.oldPrime === true ? "O" : d.orchestrationRole === "pm" ? "M" : " "} ${pad(degraded ? "DEGRADED" : activityOf(d.state, d.lastEventAt != null), 8)} ${pad(live, 7)} ${pad(d.boundProvider ?? "—", 18)} ${pad(d.boundModel ?? "—", 28)} ${pad(d.effort ?? "—", 7)} ${d.folder}`,
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
		case "attest": {
			const attested = [
				...(cmd.planId !== undefined ? [{ field: "planId" as const, value: cmd.planId }] : []),
			];
			if (attested.length === 0) {
				return fail("E-ARG", "pij attest needs at least one attested field", cmd.json);
			}
			const current = deps.registry.read(cmd.id);
			if (!current) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const changed = attested.some(({ field, value }) => current[field] !== value);
			try {
				if (changed) {
					const next = { ...current };
					for (const { field, value } of attested) next[field] = value;
					deps.registry.write(next, "cli");
				}
			} catch (error) {
				return fail("E-NOREG", `could not attest '${cmd.id}' (${String(error)})`, cmd.json);
			}
			const persisted = deps.registry.read(cmd.id);
			if (!persisted || attested.some(({ field, value }) => persisted[field] !== value)) {
				return fail("E-NOREG", `attestation for '${cmd.id}' did not persist`, cmd.json);
			}
			const reported = Object.fromEntries(
				attested.map(({ field, value }) => [field, value] as const),
			);
			if (cmd.json) {
				return okOut(JSON.stringify({ id: cmd.id, ...reported, changed }));
			}
			const fields = attested.map(({ field, value }) => `${field}=${value}`).join(" ");
			return okOut(`attested ${cmd.id}: ${fields}${changed ? "" : " (unchanged)"}`);
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
			if (cmd.role !== undefined && !wired.ok) {
				return fail(wired.code, wired.message, cmd.json);
			}
			let attribution: { actor: string; provenance: ActorProvenance } | undefined;
			if (wired.ok) {
				const resolved = resolveActor(cmd.actor, deps);
				if (!resolved.ok) return fail(resolved.code, resolved.message, cmd.json);
				attribution = { actor: resolved.value.actor, provenance: resolved.value.provenance };
			}
			const changed = current?.parentId !== cmd.parentId;
			// A pa must never be left unadopted (paLineageRefusal): check the state
			// the write WOULD produce — the role after this command joined to the
			// parent after it — so `--root` on an existing pa refuses as loudly as
			// stamping pa on an unadopted seat. Before any write: refusal mutates
			// nothing (F2).
			const roleAfter = cmd.role ?? current?.orchestrationRole;
			const lineageRefusal = paLineageRefusal(
				roleAfter,
				effectiveParent(planned.value),
				cmd.childId,
			);
			if (lineageRefusal !== null) return fail("E-ARG", lineageRefusal, cmd.json);
			// "cli": `pij link` OWNS parentId. Without the declaration the write law
			// would take it from disk and the verb would silently no-op.
			if (changed) deps.registry.write(planned.value, "cli");
			const roleChange =
				cmd.role === undefined
					? undefined
					: new RoleService(deps.registry).set(cmd.childId, cmd.role);
			if (roleChange && !roleChange.ok) {
				return fail(roleChange.code, roleChange.message, cmd.json);
			}
			// prev = the tree truth the link replaces (effectiveParent, the notion
			// every projection uses), not the raw parentId override — a spawned
			// child's first re-parent honestly records "was under its spawner".
			const prevParent = current === null ? null : effectiveParent(current);
			let spineSeq: number | null | undefined;
			let roleSpineSeq: number | null | undefined;
			let spineWarning: string | undefined;
			if (wired.ok && attribution !== undefined) {
				const ports = wired.value;
				const att = attribution;
				// V-05 uncoupled append under lock + recovery gate (runtime-axis
				// shape): descriptor truth already landed and never waits on the
				// spine; a failed append is surfaced, never forged past.
				const locked = ports.platformWriteLock.withPlatformWriteLock(
					(): Result<{ readonly nodeSeq: number; readonly roleSeq?: number }> => {
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
						let roleSeq: number | undefined;
						if (roleChange?.ok && roleChange.value.changed) {
							const roleDraft = buildSpineEvent({
								nowMs: now,
								actor: att.actor,
								kind: SPINE_KIND_ROLE_SET,
								refs: [`node:${cmd.childId}`],
								peer: cmd.childId,
								...(roleChange.value.previousRole === undefined
									? {}
									: { prev: roleChange.value.previousRole }),
								next: roleChange.value.role,
								actorProvenance: att.provenance,
							});
							if (!roleDraft.ok) return roleDraft;
							const roleEvent = ports.spineLog.append(roleDraft.value);
							if (!roleEvent.ok) return roleEvent;
							roleSeq = roleEvent.value.seq;
						}
						return ok({
							nodeSeq: event.value.seq,
							...(roleSeq === undefined ? {} : { roleSeq }),
						});
					},
				);
				const outcome: Result<{ readonly nodeSeq: number; readonly roleSeq?: number }> = locked.ok
					? locked.value
					: locked;
				if (outcome.ok) {
					spineSeq = outcome.value.nodeSeq;
					roleSpineSeq = outcome.value.roleSeq;
				} else {
					spineSeq = null;
					if (roleChange?.ok && roleChange.value.changed) roleSpineSeq = null;
					spineWarning = `link spine event not fully recorded: ${outcome.code}: ${outcome.message}`;
				}
			}
			if (cmd.json) {
				return okOut(
					JSON.stringify({
						id: cmd.childId,
						parentId: cmd.parentId,
						changed,
						...(roleChange?.ok
							? {
									role: roleChange.value.role,
									roleChanged: roleChange.value.changed,
								}
							: {}),
						...(spineSeq !== undefined ? { spineSeq } : {}),
						...(roleSpineSeq !== undefined ? { roleSpineSeq } : {}),
						...(spineWarning !== undefined ? { spineWarning } : {}),
					}),
				);
			}
			const human =
				cmd.parentId === null
					? `${changed ? "linked" : "unchanged"} ${cmd.childId} → root`
					: `${changed ? "linked" : "unchanged"} ${cmd.childId} → ${cmd.parentId}`;
			const designated =
				roleChange?.ok === true ? `${human} · role ${roleChange.value.role}` : human;
			return okOut(
				spineWarning === undefined ? designated : `${designated}  (WARNING: ${spineWarning})`,
			);
		}
		case "send": {
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const self = s.value;
			const preflight = preflightSendTargets(cmd.targets ?? [cmd.to], self, deps, now);
			if (!preflight.ok) return fail(preflight.code, preflight.message, cmd.json);

			if (cmd.broadcast) {
				// plan 093 AC-04: refuse BEFORE the loop, so an empty broadcast
				// cannot deliver to target 1 and then discover it had nothing to
				// say. Broadcast is text-only (no attachments to make an empty body
				// meaningful), so the capability question of D2 does not arise.
				//
				// F1: `.trim()` catches the whitespace-only body that the parse
				// guard above cannot see when the body arrived via `--body-file`
				// (the bytes are attached to the parsed command, so parse only ever
				// saw a placeholder). The value delivered below is untouched.
				if ((cmd.text ?? "").trim() === "")
					return fail(
						"E-EMPTY",
						"nothing to send: the broadcast body is empty — pass text, or read it literally with `pij send <id> --body-file <path|->` (single-target)",
						cmd.json,
					);
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
					// A broadcast is activity too — stamped once per landed message so a
					// fan-out orchestrator never reads as quiet (plan 071 D3 addendum).
					stampSenderActivity(deps, self, now);
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
			// AC-07: set when the message DID deliver but carried a reference the
			// target cannot render. The text lands; the drop is never silent.
			let attachmentWarning: string | undefined;
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
				// ── plan 093: the empty-payload guard (pij#132) ──────────────────
				//
				// Placed AFTER target preflight and BEFORE `deliver`, which is the
				// only position that works: the rule needs the target descriptor
				// (so the pure parse cannot decide it), and it must precede
				// `classifySendReceipt` (so a refused send can never acquire a
				// receipt). Every caller inherits it here — the CLI, the `pij_send`
				// tool, and any direct `dispatch()` caller (AC-03).
				//
				// The rule, in one sentence: REFUSE WHEN THE TARGET WOULD RECEIVE NO
				// CONTENT IT CAN RENDER. Deliberately NOT "refuse empty bodies" —
				// that global form would delete the shipped Plan-026 capability of
				// sending an attachment-only message to a pull/telegram seat, which
				// is a real, tested feature (AC-06). Capability, not flag shape.
				//
				// F1 (cross-model review): "no content" is `.trim()`-empty, not
				// `""`-empty. A body of "\n" — what `pij send peer "$(cat notes)"`
				// yields against a blank file — is a message the receiver sees as
				// blank, so a success receipt for it is exactly as dishonest.
				//
				// The asymmetry is the whole point and must not be collapsed: the
				// EMPTINESS TEST trims, the DELIVERED BODY never does. `"  hello  "`
				// arrives with both pads intact (AC-08 byte-for-byte). Trimming what
				// we deliver would reintroduce the `trimEnd()` defect this plan
				// removed one layer up.
				const body = cmd.text ?? "";
				const rendersAttachments = targetRendersAttachments(target);
				if (body.trim() === "" && !(attachments !== undefined && rendersAttachments)) {
					// `--command` never reaches here (it returns above): a command
					// message legitimately carries an empty body (AC-05).
					//
					// F1: a caller who typed `"$(cat notes)"` DID pass an argument,
					// so "the message body is empty" reads as a lie and sends them
					// looking for the wrong bug. Name what actually happened.
					const blankKind = body === "" ? "empty" : "blank (whitespace only)";
					const why =
						attachments !== undefined
							? `${cmd.to} receives PUSHED messages and cannot render attachments, so it would receive an ${body === "" ? "empty" : "effectively empty"} message`
							: `the message body is ${blankKind}`;
					return fail("E-EMPTY", `nothing to send: ${why} — ${safeBodyHint(cmd.to)}`, cmd.json);
				}
				if (attachments !== undefined && !rendersAttachments) {
					// AC-07: text + an unrenderable reference. The text is worth
					// delivering, but the sender must not read `delivered` and
					// believe the file went with it.
					attachmentWarning =
						`${cmd.to} receives PUSHED messages and cannot render attachments — ` +
						`'${cmd.file}' was NOT delivered, only the text. ${safeBodyHint(cmd.to)}`;
				}
				const del = deps.delivery.deliver(
					attachments !== undefined
						? { from: self, to: cmd.to, body: cmd.text ?? "", attachments }
						: { from: self, to: cmd.to, body: cmd.text ?? "" },
				);
				if (!del.ok) return fail(del.code, del.message, cmd.json);
				messageId = del.value.messageId;
				kindNote =
					attachments !== undefined
						? // F1: same reading as the guard — a whitespace-only body is
							// not text the receiver can perceive, so a receipt saying
							// `text+file` would overstate what arrived. The BYTES are
							// still delivered untouched; only the label trims.
							(cmd.text ?? "").trim() !== ""
							? "text+file"
							: "file"
						: "text";
			}
			// ONE rule, one place (plan 071 D3). This branch used to carry its own
			// copy of the receipt ternary, so a fix applied to `sendSuccess` left
			// the plain `pij send` path still saying `queued` — the single most
			// used surface lying while the code looked fixed.
			// Sending is activity on the SENDER's axis too (plan 071 D3 addendum).
			stampSenderActivity(deps, self, now);
			const { receipt: initial, reason: initialReason } = classifySendReceipt(target, now);
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
						...(initialReason ? { reason: initialReason } : {}),
						liveness: live,
						...(tickStatus ?? {}),
						// AC-07: machine-readable, and additive — a consumer that has
						// never heard of it is unaffected, and one that wants to gate
						// on "my attachment was dropped" no longer has to parse prose.
						...(attachmentWarning ? { attachmentWarning } : {}),
					}),
					stderr: attachmentWarning ? `warning: ${attachmentWarning}` : "",
					exitCode: 0,
					follow,
				};
			const recvHint = renderReceiptHint(
				{
					receipt: initial,
					...(initialReason ? { reason: initialReason } : {}),
					...(tickStatus ?? {}),
				},
				target,
				now,
			);
			const tail = cmd.wait
				? ""
				: `\nreceipt → ${initial}   (also in: pij tail ${self} --type receipt)`;
			return {
				stdout: `sent → ${cmd.to}  ${kindNote}${warn}  (${recvHint})${tail}`,
				stderr: attachmentWarning ? `warning: ${attachmentWarning}` : "",
				exitCode: 0,
				follow,
			};
		}
		case "bg-create": {
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const self = s.value;
			const owner = deps.registry.read(self);
			if (!owner) return fail("E-NOID", `no session '${self}' in registry`, cmd.json);
			if (!deps.backgroundLauncher) {
				return fail("E-CMD", "background jobs are unavailable in this build", cmd.json);
			}
			const jobId = `bg-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
			const planned = planBgJob({
				title: cmd.title,
				command: cmd.command,
				to: self,
				jobId,
				outDir: owner.dataDir,
			});
			if (!planned.ok) return fail(planned.code, planned.message, cmd.json);
			const job = planned.value;
			const launched = deps.backgroundLauncher.launch({
				script: bgWrapperScript(deps.bgNotifyArgv ?? ["pij", "bg-deliver"]),
				cwd: deps.cwd,
				env: {
					[BG_ENV.command]: job.command,
					[BG_ENV.out]: job.outPath,
					[BG_ENV.title]: job.title,
					[BG_ENV.to]: job.to,
					[BG_ENV.jobId]: job.jobId,
					// The child re-enters the CLI to deliver. It must not inherit an
					// ambient identity that would make it resolve as somebody.
					PIJ_SESSION_ID: "",
				},
			});
			if (!launched.ok) return fail(launched.code, launched.message, cmd.json);
			// Persist-before-mutate (P9) in spirit: the record is what makes the job
			// addressable, and a running job nobody can list is a job nobody can
			// stop. Written immediately after launch, when the pgid first exists.
			deps.bgJobStore?.write(
				newBgJobRecord({
					spec: job,
					pgid: launched.value.pid,
					nowIso: new Date(now).toISOString(),
				}),
			);
			return {
				stdout: cmd.json
					? JSON.stringify({
							job: job.jobId,
							title: job.title,
							pid: launched.value.pid,
							out: job.outPath,
							to: job.to,
						})
					: `bg started — ${job.title} (job ${job.jobId}, pid ${launched.value.pid})\nresult will arrive as an injected turn from ${BG_ACTOR}; full output at ${job.outPath}`,
				stderr: "",
				exitCode: 0,
			};
		}
		case "bg-list": {
			const store = deps.bgJobStore;
			if (!store) return fail("E-CMD", "background jobs are unavailable in this build", cmd.json);
			const rows = store
				.list()
				.map((record) => ({
					record,
					state: bgJobState(record, (pid) => deps.process.isAlive(pid)),
				}))
				// Finished jobs stay on disk for their logs, but `list` answers "what
				// is running" unless asked — a default that grows without bound is one
				// nobody reads.
				.filter((row) => cmd.all || row.state !== "done");
			if (cmd.json) {
				return {
					stdout: JSON.stringify(rows.map((row) => ({ ...row.record, state: row.state }))),
					stderr: "",
					exitCode: 0,
				};
			}
			const empty = cmd.all ? "no bg jobs" : "no bg jobs running (--all includes finished)";
			return {
				stdout:
					rows.length === 0
						? empty
						: rows.map((row) => renderBgJobLine(row.record, row.state, now)).join("\n"),
				stderr: "",
				exitCode: 0,
			};
		}
		case "bg-tail": {
			const store = deps.bgJobStore;
			if (!store) return fail("E-CMD", "background jobs are unavailable in this build", cmd.json);
			const record = store.read(cmd.jobId);
			if (!record) return fail("E-NOID", `no bg job '${cmd.jobId}'`, cmd.json);
			let output = "";
			try {
				output = deps.readTextFile?.(record.logPath) ?? "";
			} catch {
				output = "";
			}
			// A BOUNDED snapshot, never a follow loop: `bg` exists so a seat stops
			// blocking on slow work, and `--follow` here would quietly reinstate the
			// very wait it removed.
			const wanted = cmd.lines ?? 40;
			const all = output.trimEnd().split("\n");
			const tail = all.slice(Math.max(0, all.length - wanted)).join("\n");
			const state = bgJobState(record, (pid) => deps.process.isAlive(pid));
			if (cmd.json) {
				return {
					stdout: JSON.stringify({ job: record.jobId, state, lines: tail.split("\n") }),
					stderr: "",
					exitCode: 0,
				};
			}
			return {
				stdout: `${renderBgJobLine(record, state, now)}\n${record.logPath}\n\n${tail}`,
				stderr: "",
				exitCode: 0,
			};
		}
		case "bg-kill": {
			const store = deps.bgJobStore;
			if (!store) return fail("E-CMD", "background jobs are unavailable in this build", cmd.json);
			const record = store.read(cmd.jobId);
			if (!record) return fail("E-NOID", `no bg job '${cmd.jobId}'`, cmd.json);
			const state = bgJobState(record, (pid) => deps.process.isAlive(pid));
			if (state !== "running") {
				return fail("E-ARG", `bg job '${cmd.jobId}' is not running (${state})`, cmd.json);
			}
			// Signal the process GROUP: the wrapper spawns the real command as a
			// child, so signalling the wrapper alone leaves the actual work running
			// and orphaned — with nothing left to report its own completion.
			const signalled = deps.killProcessGroup?.(record.pgid, "SIGTERM") ?? false;
			if (!signalled) return fail("E-CMD", `could not signal bg job '${cmd.jobId}'`, cmd.json);
			// Persist before delivering (P9). A SILENT kill re-creates the exact
			// failure bg exists to abolish: the caller waits forever for a result
			// that can now never arrive. Killing is an ending, and endings report.
			store.write({ ...record, finishedAt: new Date(now).toISOString(), outcome: "killed" });
			deps.delivery.deliver({
				from: BG_ACTOR,
				to: record.owner,
				body: buildBgKilledTurn(record, record.logPath),
			});
			return {
				stdout: cmd.json
					? JSON.stringify({ killed: true, job: record.jobId })
					: `killed ${record.jobId} — ${record.title}`,
				stderr: "",
				exitCode: 0,
			};
		}
		case "bg-deliver": {
			// Internal: the detached wrapper's final act. Runs with NO ambient
			// identity, and delivers as the `pij-bg` pseudo-actor rather than as the
			// queueing seat — the message is genuinely from the runner, and stamping
			// it as the seat would also trip the E-SELF guard.
			let output = "";
			try {
				output = deps.readTextFile?.(cmd.outPath) ?? "";
			} catch {
				output = "";
			}
			const startedMs = jobStartedAtMs(cmd.jobId, now);
			const durationMs = startedMs === undefined ? Number.NaN : now - startedMs;
			const body = buildBgCompletionTurn({
				title: cmd.title,
				exitCode: cmd.exitCode,
				durationMs,
				outPath: cmd.outPath,
				output,
			});
			// Close the record BEFORE delivering, so `bg list` can never show a job
			// as still running after its result has already landed in the caller's
			// context.
			const existing = deps.bgJobStore?.read(cmd.jobId);
			if (existing !== undefined && existing.finishedAt === undefined) {
				deps.bgJobStore?.write({
					...existing,
					finishedAt: new Date(now).toISOString(),
					outcome: cmd.exitCode === 0 ? "ok" : "failed",
					exitCode: cmd.exitCode,
				});
			}
			const delivered = deps.delivery.deliver({ from: BG_ACTOR, to: cmd.to, body });
			if (!delivered.ok) return fail(delivered.code, delivered.message, cmd.json);
			return {
				stdout: cmd.json
					? JSON.stringify({ delivered: true, job: cmd.jobId, to: cmd.to })
					: `bg result delivered → ${cmd.to}`,
				stderr: "",
				exitCode: 0,
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
			// Pre-bind health, computed on READ (plan 071 D3 T007). The wedged seat
			// in the 2026-07-25 report showed `idle · active` with failureReason null
			// while the correct diagnosis existed only in an anomaly push that landed
			// ~16 minutes later. A read surface must not need a push to tell the truth.
			const bindHealth = classifyBindHealth(d, now);
			const bindDetail = bindHealthDetail(d, bindHealth, now);
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
						// The capability gate's KEYING FIELD and the seat's lineage,
						// projected here because a gate whose input no inspection verb
						// displays cannot be self-diagnosed: `pij state` was the verb a
						// seat runs on itself first, and it was silent on both (#95).
						//
						// ALWAYS PRESENT, `null` when unset — never absent. JSON.stringify
						// DROPS undefined, so a bare `d.orchestrationRole` would make the
						// key vanish for every pre-078 descriptor, and a consumer reading
						// `j.orchestrationRole == null` on a row that never carried the key
						// gets "ungated" for every seat alive. The fabricated answer is the
						// permissive one, which is the wrong way for this to fail.
						//
						// `projectOrchestrationRole` (not the raw field) because prime-ness
						// is stored on a SEPARATE flag; the raw field reports a prime as
						// unstamped. `parent`/`effectiveParent` (not a raw `parentId`) is
						// the same name and same notion `list` (above) and `node show`
						// already project — D-041. It also matters beyond agreement: a PA
						// spawned by its prime and never explicitly linked has NO raw
						// `parentId`, so a raw projection would report it parentless and
						// any target predicate reading it would refuse that PA permission
						// over its real parent — #95 rebuilt inside #95's own fix.
						orchestrationRole: projectOrchestrationRole(d),
						parent: effectiveParent(d),
						// Fail-loud model layer (T013): surface actual bound model + reason
						boundModel: d.boundModel ?? null,
						effort: d.effort ?? null,
						daemonLastTickAt: tickStatus?.daemonLastTickAt ?? null,
						daemonTickAgeMs: tickStatus?.daemonTickAgeMs ?? null,
						daemonTickStale: tickStatus?.daemonTickStale ?? null,
						failureReason: d.failureReason ?? null,
						bindHealth,
						degraded: isBindDegraded(bindHealth),
						degradedReason: bindDetail,
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
			// Role and parent are INDEPENDENT facts, rendered independently: a
			// stamped seat with no parent must still show its role, and suppressing
			// both on one absence is how a gated seat reads as ungated. Silent when
			// there is nothing to say, so an unstamped seat's line is unchanged.
			const stateRole = projectOrchestrationRole(d);
			const stateParent = effectiveParent(d);
			const roleLine = stateRole ? `  ·  role: ${stateRole}` : "";
			const parentLine = stateParent ? `  ·  parent: ${stateParent}` : "";
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
			// DEGRADED leads the line — an operator scanning output must not have to
			// infer "wedged" from a healthy-looking activity badge.
			const degradedBadge = isBindDegraded(bindHealth) ? "DEGRADED · " : "";
			const degradedLine = bindDetail ? `\n  ⚠️  DEGRADED: ${bindDetail}` : "";
			return okOut(
				`${d.id}: ${degradedBadge}${activityOf(d.state, d.lastEventAt != null)} · ${live}   (last event ${humanAge(ageMs)} ago, pid ${d.pid} ${alive ? "alive" : "gone"})\n  cwd: ${d.folder}${d.harness ? `  ·  harness: ${d.harness}` : ""}${roleLine}${parentLine}${modelLine}${effortLine}${tickLine}${failLine}${terminalLine}${degradedLine}`,
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
			if (
				harnessSessionId &&
				harnessSessionId.trim() !== "" &&
				(d.lifecycle === "pending" || d.lifecycle === undefined)
			) {
				bound = applyBinding(d, harnessSessionId);
				deps.registry.write(bound);
			}
			const confirmed = bound.lifecycle === "bound" && Boolean(bound.harnessSessionId);
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
		case "dispatch-retire":
		case "ack-dispatch":
		case "canary":
		case "spine-append":
		case "spine-events":
		case "spine-render":
		case "task-set":
		case "task-close":
		case "report-now":
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
			| "dispatch-retire"
			| "ack-dispatch"
			| "canary"
			| "spine-append"
			| "spine-events"
			| "spine-render"
			| "task-set"
			| "task-close"
			| "report-now"
			| "state-set"
			| "state-verify"
			| "state-clear"
			| "node-show"
			| "anomalies";
	}
>;

/** Descriptor denorm for assignment, semantic-state, note, and status fields.
 *  The registry is NOT platform state — the spine/record are
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
		readonly assignment?: {
			readonly currentAssignment: string;
			readonly currentTask: string;
			readonly semanticState: SemanticState | undefined;
			readonly stateNote: SessionDescriptor["stateNote"];
		};
		readonly status?: {
			readonly prev: string;
			readonly next: string;
			readonly at: string;
			readonly seq: number;
			/** Absent for a self-authored card — the overwhelming case, and it keeps
			 *  every existing descriptor byte-identical. Set when a PA relays. */
			readonly writtenBy?: string;
		};
		/** Plan 075 — the DISCHARGE case, deliberately a separate branch from the
		 *  `assignment` swap above rather than a nullable widening of it. A swap
		 *  points the node at different work; a clear says the node has no current
		 *  work at all. Collapsing them into one optional-field shape is how the
		 *  next reader loses the distinction.
		 *
		 *  Ratified wire contract (o-prime + chainglass, 2026-07-30): cleared
		 *  fields must reach consumers as EXPLICIT NULL, never as absent keys.
		 *  `list` already maps each of these through `?? null`, so removing the
		 *  descriptor keys here yields `null` on that surface — which is the whole
		 *  requirement. It matters because `tree` OMITS absent keys, and the rail
		 *  reads an omitted key as "this read does not carry the field" and falls
		 *  through to a cached snapshot, re-rendering the closed task as current.
		 *  **Null is an answer; absence is a silence.** */
		readonly clearAssignment?: true;
	},
): Result<void> {
	try {
		const latest = deps.registry.read(nodeId);
		if (!latest) return err("E-NOID", `node descriptor '${nodeId}' vanished before the denorm`);
		let nextDescriptor = latest;
		if (fields.assignment !== undefined) {
			// Assignment swaps and state clears remove semanticState/stateNote;
			// statusPrev/statusNext/statusAt/statusSeq deliberately survive them.
			const { semanticState: _staleState, stateNote: _staleNote, ...rest } = nextDescriptor;
			nextDescriptor = {
				...rest,
				currentAssignment: fields.assignment.currentAssignment,
				currentTask: fields.assignment.currentTask,
				...(fields.assignment.semanticState === undefined
					? {}
					: { semanticState: fields.assignment.semanticState }),
				...(fields.assignment.stateNote === undefined
					? {}
					: { stateNote: fields.assignment.stateNote }),
			};
		}
		if (fields.clearAssignment === true) {
			// The obligation was discharged, so the node advertises no current work.
			// statusPrev/Next/At/Seq deliberately SURVIVE, exactly as they do on an
			// assignment swap: the last thing the seat said about itself is still
			// true, and erasing it here would blank the card as a side effect of
			// closing a ledger row — the coupled-write hazard this stream exists to
			// stop repeating.
			const {
				currentAssignment: _asg,
				currentTask: _task,
				semanticState: _state,
				stateNote: _note,
				...cleared
			} = nextDescriptor;
			nextDescriptor = cleared;
		}
		if (fields.status !== undefined) {
			// statusWrittenBy is CLEARED on a self-authored write, not merely left
			// alone: a seat that writes its own card after a relay must not keep
			// advertising the relay's author. Absence means self-authored, so the
			// key is removed rather than set to the subject's own id — same
			// null-is-an-answer discipline, inverted, because here ABSENCE is the
			// meaningful value and a present one is the exception.
			const { statusWrittenBy: _priorWriter, ...withoutWriter } = nextDescriptor;
			nextDescriptor = {
				...withoutWriter,
				statusPrev: fields.status.prev,
				statusNext: fields.status.next,
				statusAt: fields.status.at,
				statusSeq: fields.status.seq,
				...(fields.status.writtenBy === undefined
					? {}
					: { statusWrittenBy: fields.status.writtenBy }),
			};
		}
		// writeExact, deliberately: this both OWNS the node-truth denorms and must be
		// able to CLEAR stale `semanticState`/`stateNote` on an assignment swap. A
		// merging write cannot clear a contested field (by design), and `latest` was
		// re-read one line above, so exact semantics are safe here — the re-read IS the merge.
		deps.registry.writeExact(nextDescriptor);
		return ok(undefined);
	} catch (error) {
		return err("E-NOREG", `the node descriptor could not be updated (${String(error)})`);
	}
}

/** The refusal a closed target earns, carrying its own way out (plan 077).
 *
 * The remedy is IN the error, not in documentation: a seat that hits this has
 * no open assignment, and `pij task set` always works and needs none — so the
 * path forward is always one command and it is printed at the point of failure.
 */
function closedTargetError(record: Assignment, node: SessionDescriptor): Result<never> {
	return err(
		"E-ARG",
		`assignment '${record.id}' is closed (${record.closed?.reason ?? "closed"}) — a state is a claim ABOUT an assignment, so open one first: pij task set ${node.id} "<task>"`,
	);
}

/** Who is this card ABOUT, and who WROTE it (plan 078)?
 *
 * Without `--for` the answer is the caller for both — every existing call, byte
 * identical. With `--for` the card is about another seat, which is a real
 * capability and so is fenced tightly: the caller must be a `pa`, and the target
 * must be that PA's own parent.
 *
 * Attribution is what makes this safe to GRANT rather than something to forbid.
 * A PA doing its prime's chores needs to post its prime's card; without a
 * legitimate path it would have to assume the prime's identity outright, which
 * no gate can detect. Given one, the relay is recorded as a relay.
 */
function resolveRelayTarget(
	deps: CliDeps,
	self: SessionDescriptor,
	forSeat: SessionId | undefined,
): Result<{ readonly subjectId: SessionId; readonly writtenBy: string | undefined }> {
	if (forSeat === undefined || forSeat === self.id) {
		return ok({ subjectId: self.id, writtenBy: undefined });
	}
	if (projectOrchestrationRole(self) !== "pa") {
		return err(
			"E-OWN",
			`--for relays another seat's card and is available only to a PA (role 'pa'); '${self.id}' is not one`,
		);
	}
	const parent = effectiveParent(self);
	if (parent === null || parent !== forSeat) {
		return err(
			"E-OWN",
			`a PA may relay only for its OWN prime (${parent ?? "none recorded"}), not '${forSeat}'`,
		);
	}
	if (!deps.registry.read(forSeat)) return err("E-NOID", `no session '${forSeat}' in registry`);
	return ok({ subjectId: forSeat, writtenBy: self.id });
}

/** Resolve which assignment a state verb targets: explicit --assignment
 *  (must exist and belong to the node), else the descriptor's
 *  currentAssignment (dangling is an honest error, never a silent fallback),
 *  else the node's general assignment — `existing` undefined means the
 *  general is not yet materialized.
 *
 *  TERMINAL MEANS TERMINAL ON EVERY BRANCH (plan 077). Closure was enforced in
 *  `closeAssignment` (double-close is E-ARG) and NOWHERE ELSE, so every path
 *  through here would happily hand back a closed record to be written to. That
 *  was unreachable until s075 made `currentAssignment` clearable on close —
 *  after which ONE bare `report state` fell through to the general, repointed
 *  the node at it, and wrote a state onto a CLOSED record, silently, exit 0.
 *  Measured on a live seat (spine 26224) and reproduced hermetically.
 *
 *  ABSENT AND CLOSED MUST NOT SHARE A BRANCH (o-prime's binding constraint,
 *  from a live measurement): 17 active seats across 5 governments currently
 *  have an empty currentAssignment, and for them the fall-through with
 *  `existing === undefined` is what lets them post a card at all. Refusing
 *  absence would mute 17 seats to fix a hazard whose window is currently shut.
 *  So: refuse CLOSED, materialize ABSENT. */
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
		if (record.closed !== undefined) return closedTargetError(record, node);
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
		if (record.closed !== undefined) return closedTargetError(record, node);
		return ok({ id: record.id, existing: record });
	}
	const generalId = generalAssignmentId(node.id);
	const general = assignmentStore.read(generalId);
	// Absent → materialize as before (the 17-seat path). Closed → refuse: the
	// general id is DETERMINISTIC, so a closed general permanently occupies it,
	// and "skip it and materialize a fresh one" would either collide or silently
	// re-open a retired record — erasing the retire from the other side.
	if (general !== null && general.closed !== undefined) return closedTargetError(general, node);
	return ok({ id: generalId, existing: general ?? undefined });
}

function resolveCurrentReportAssignment(
	assignmentStore: AssignmentStorePort,
	node: SessionDescriptor,
): Result<Assignment | undefined> {
	if (node.currentAssignment === undefined) return ok(undefined);
	const target = resolveTargetAssignment(assignmentStore, node, node.currentAssignment);
	if (!target.ok) return target;
	return ok(target.value.existing);
}

function setSemanticStateWithinLock(
	cmd: Extract<PlatformCommand, { readonly verb: "state-set" }>,
	deps: CliDeps,
	ports: PlatformWritePorts,
	node: SessionDescriptor,
	attribution: { readonly actor: string; readonly provenance: ActorProvenance },
	now: number,
): Result<{ readonly event: SpineEvent; readonly record: Assignment }> {
	const target = resolveTargetAssignment(ports.assignmentStore, node, cmd.assignmentId);
	if (!target.ok) return target;
	const materialized = materializeGeneralIfMissing(target.value.existing, {
		nodeId: node.id,
		actor: attribution.actor,
		nowMs: now,
	});
	if (!materialized.ok) return materialized;
	const record = materialized.value;
	const draft = buildSpineEvent({
		nowMs: now,
		actor: attribution.actor,
		kind: SPINE_KIND_STATE_SET,
		refs: [
			`node:${node.id}`,
			`assignment:${record.id}`,
			...(record.projectSlug === undefined ? [] : [`project:${record.projectSlug}`]),
			`state:${cmd.state}`,
			...cmd.refs,
		],
		peer: node.id,
		project: record.projectSlug,
		prev: target.value.existing === undefined ? undefined : canonicalAssignmentJson(record),
		next: canonicalAssignmentJson(record),
		actorProvenance: attribution.provenance,
	});
	if (!draft.ok) return draft;
	const recorded = ports.opJournal.record(draft.value);
	if (!recorded.ok) return recorded;
	const opId = recorded.value;
	const written = ports.assignmentStore.write(record);
	if (!written.ok) {
		return err(written.code, withResidualDiagnostic(written.message, ports.opJournal.clear(opId)));
	}
	ports.opJournal.markCommitted(opId);
	const appended = ports.spineLog.appendOnce(opId, draft.value);
	if (!appended.ok) {
		return err(
			appended.code,
			`state '${cmd.state}' on '${node.id}' WAS recorded (assignment ${record.id}), but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
		);
	}
	const event = appended.value.event;
	const chained = ports.assignmentStore.write(appendStateRef(record, event.seq));
	if (!chained.ok) {
		return err(
			chained.code,
			`state '${cmd.state}' WAS set on '${node.id}' and its spine event landed, but the assignment's states chain could not be updated (${chained.message}); the op remains journaled and the next platform write will reconcile it`,
		);
	}
	const cleared = ports.opJournal.clear(opId);
	if (!cleared.ok) {
		return err(
			cleared.code,
			`state '${cmd.state}' WAS set on '${node.id}' and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
		);
	}
	const denormed = denormDescriptor(deps, node.id, {
		assignment: {
			currentAssignment: record.id,
			currentTask: record.task,
			semanticState: cmd.state,
			stateNote:
				cmd.note === undefined ? undefined : { text: cmd.note, state: cmd.state, at: event.ts },
		},
	});
	if (!denormed.ok) {
		return err(
			denormed.code,
			`state '${cmd.state}' WAS set on '${node.id}' and its spine event landed, but ${denormed.message}`,
		);
	}
	return ok({ event, record });
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
				// The durable dispatch record has no `blocked` state. `unverified` is
				// the honest projection — it claims no delivery — and the CLI's printed
				// receipt still carries the loud BLOCKED line (plan 071 D3).
				deliveryState: success.receipt === "blocked" ? "unverified" : success.receipt,
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
			rearmWatchdogForNewWork(deps.watchdogStore, cmd.to);
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
		case "dispatch-retire": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const attribution = resolveActor(undefined, deps);
			if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
			const ts = isoTimestamp(now);
			if (!ts.ok) return fail(ts.code, ts.message, cmd.json);
			const records =
				cmd.dispatchId !== undefined
					? (() => {
							const record = ports.value.dispatchStore.read(cmd.dispatchId);
							return record === null ? null : [record];
						})()
					: ports.value.dispatchStore.list().filter((record) => record.to === cmd.to);
			if (records === null) {
				return fail("E-NOREG", `no dispatch '${cmd.dispatchId}'`, cmd.json);
			}
			const candidates = records.filter(isOpenDispatch);
			let retired = 0;
			if (!cmd.dryRun) {
				for (const previous of candidates) {
					const next = retireDispatch(previous, {
						reason: cmd.reason,
						actor: attribution.value.actor,
						ts: ts.value,
					});
					if (!next.ok) return fail(next.code, next.message, cmd.json);
					const written = ports.value.dispatchStore.write(next.value);
					if (!written.ok) return fail(written.code, written.message, cmd.json);
					retired += 1;
				}
			}
			const matched = candidates.length;
			const count = cmd.dryRun ? matched : retired;
			return okOut(
				cmd.json
					? JSON.stringify({
							retired,
							matched,
							reason: cmd.reason,
							...(cmd.dryRun ? { dryRun: true } : {}),
						})
					: `${cmd.dryRun ? "would retire" : "retired"} ${count}/${matched} dispatch(es) — reason: ${cmd.reason}`,
			);
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
				rearmWatchdogForNewWork(deps.watchdogStore, cmd.node);
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
					assignment: {
						currentAssignment: record.id,
						currentTask: record.task,
						semanticState: undefined,
						stateNote: undefined,
					},
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
		// ── plan 075 — the far end of the lifecycle `task-set` opens ───────────
		// Until this verb existed NOTHING could close an assignment: measured
		// 2026-07-30, 91 of 91 on the first box open, zero ever closed, because
		// `closeAssignment` had no caller. It read as healthy because
		// `report state done` silences `axis-disagreement` (any declared state
		// does) WITHOUT discharging the record — masking, not closing.
		case "task-close": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const { assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const existing = assignmentStore.read(cmd.assignmentId);
			if (existing === null) return fail("E-NOID", `no assignment '${cmd.assignmentId}'`, cmd.json);
			const self = selfId(deps);
			if (!self.ok) return fail(self.code, self.message, cmd.json);
			// AUTHORITY: close only in the direction of your own authorship.
			// Evaluated against the SEAT, never the --actor label: --actor is an
			// attribution override and letting it choose the authority set would
			// make the gate self-service.
			const permitted = permittedCloseReasons(existing, self.value);
			if (permitted.length === 0) {
				return fail(
					"E-OWN",
					`assignment '${existing.id}' is neither yours to complete (assignee '${existing.nodeId}') nor yours to withdraw (opened by '${existing.opened.actor}') — you are '${self.value}'`,
					cmd.json,
				);
			}
			if (!permitted.includes(cmd.reason)) {
				const asAssignee = self.value === existing.nodeId;
				return fail(
					"E-OWN",
					`'${self.value}' may close '${existing.id}' only with ${permitted.join("|")} (got '${cmd.reason}')${
						asAssignee
							? ""
							: ` — only the assignee '${existing.nodeId}' may attest done|failed; an opener withdraws, it does not testify`
					}`,
					cmd.json,
				);
			}
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const attribution = resolveActor(cmd.actor, deps);
				if (!attribution.ok) return fail(attribution.code, attribution.message, cmd.json);
				// Re-read under the lock: the authority gate ran before it, so a
				// concurrent close could have landed in between (double-close is
				// E-ARG from the primitive, but the read must be fresh to see it).
				const current = assignmentStore.read(cmd.assignmentId);
				if (current === null)
					return fail("E-NOID", `no assignment '${cmd.assignmentId}'`, cmd.json);
				const closed = closeAssignment(current, {
					actor: attribution.value.actor,
					nowMs: now,
					reason: cmd.reason,
				});
				if (!closed.ok) return fail(closed.code, closed.message, cmd.json);
				const record = closed.value;
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.value.actor,
					kind: SPINE_KIND_TASK_CLOSE,
					refs: [
						`node:${record.nodeId}`,
						`assignment:${record.id}`,
						...(record.projectSlug === undefined ? [] : [`project:${record.projectSlug}`]),
						`reason:${cmd.reason}`,
					],
					peer: record.nodeId,
					project: record.projectSlug,
					prev: canonicalAssignmentJson(current),
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
						`assignment '${record.id}' WAS closed, but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`assignment '${record.id}' WAS closed and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				// Clear the node's denorm ONLY if it still points at the assignment we
				// just closed. A seat that has since moved to different work must not
				// have that work blanked as a side effect of discharging an older row.
				const descriptor = deps.registry.read(record.nodeId);
				if (descriptor?.currentAssignment === record.id) {
					const denormed = denormDescriptor(deps, record.nodeId, { clearAssignment: true });
					if (!denormed.ok) {
						return fail(
							denormed.code,
							`assignment '${record.id}' WAS closed and its spine event landed, but ${denormed.message}`,
							cmd.json,
						);
					}
				}
				if (cmd.json) return okOut(JSON.stringify(assignmentStore.read(record.id) ?? record));
				// THE PRECONDITION TRAVELS WITH THE REMEDY (doctrine,
				// government/doctrine/preconditions-travel-with-remedies.md). Closing a
				// GENERAL assignment is not like closing a dispatch: the id is
				// DETERMINISTIC (`asg-general-<node>`), so it is burned permanently and
				// can never be recycled, and until the seat has some OTHER open
				// assignment it cannot declare a semantic state at all.
				//
				// That is recoverable — `pij task set` re-arms it in one command — but
				// it arrives SILENTLY: nothing tells the seat until it next tries to
				// park, which can be days, while `report now` keeps working and its card
				// keeps rendering as current. A consequence nobody is told about at the
				// moment they cause it is a consequence discovered by its victim.
				const generalNote =
					record.id === generalAssignmentId(record.nodeId)
						? ` — NOTE: that was the GENERAL assignment. Its id is deterministic and is now permanently burned; '${record.nodeId}' cannot declare a semantic state until it has another open assignment. Re-arm with: pij task set ${record.nodeId} "<task>"`
						: "";
				return okOut(
					`assignment ${record.id} closed: ${cmd.reason} (by ${self.value})${generalNote}`,
				);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "report-now": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const reporter = resolveReportingSelf(deps);
			if (!reporter.ok) return fail(reporter.code, reporter.message, cmd.json);
			const { assignmentStore, spineLog, platformWriteLock } = ports.value;
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				// RELAY (plan 078): `--for` is the one place the card's SUBJECT is not
				// the caller, so it is the one place the boundary must be explicit
				// rather than implied by a verb list. Only a PA, only for its own
				// prime, and the write records who wrote it.
				const relay = resolveRelayTarget(deps, reporter.value, cmd.forSeat);
				if (!relay.ok) return fail(relay.code, relay.message, cmd.json);
				const currentReporter = readReportingDescriptor(deps, relay.value.subjectId);
				if (!currentReporter.ok) {
					return fail(currentReporter.code, currentReporter.message, cmd.json);
				}
				// The ACTOR stays the writer even when the SUBJECT is someone else —
				// that separation already existed on the spine (actor vs peer) and
				// is exactly what the descriptor denorm was missing.
				const attribution = {
					actor: relay.value.writtenBy ?? currentReporter.value.id,
					provenance: "resolved" as const,
				};
				let stateCommit: { readonly event: SpineEvent; readonly record: Assignment } | undefined;
				if (cmd.state !== undefined) {
					const stateResult = setSemanticStateWithinLock(
						{
							verb: "state-set",
							state: cmd.state,
							note: cmd.note,
							refs: [],
							json: cmd.json,
						},
						deps,
						ports.value,
						currentReporter.value,
						attribution,
						now,
					);
					if (!stateResult.ok) {
						return fail(stateResult.code, stateResult.message, cmd.json);
					}
					stateCommit = stateResult.value;
				}
				let assignment = stateCommit?.record;
				if (assignment === undefined) {
					const currentAssignment = resolveCurrentReportAssignment(
						assignmentStore,
						currentReporter.value,
					);
					if (!currentAssignment.ok) {
						return fail(currentAssignment.code, currentAssignment.message, cmd.json);
					}
					assignment = currentAssignment.value;
				}
				const assignmentId = assignment?.id;
				const projectSlug = cmd.projectSlug ?? assignment?.projectSlug;
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.actor,
					kind: SPINE_KIND_STATUS,
					refs: [
						`node:${currentReporter.value.id}`,
						...(assignmentId === undefined ? [] : [`assignment:${assignmentId}`]),
						...(projectSlug === undefined ? [] : [`project:${projectSlug}`]),
						...(stateCommit === undefined ? [] : [`state-set:${stateCommit.event.seq}`]),
					],
					peer: currentReporter.value.id,
					project: projectSlug,
					prev: cmd.did,
					next: cmd.next,
					actorProvenance: attribution.provenance,
				});
				if (!draft.ok) return fail(draft.code, draft.message, cmd.json);
				const appended = spineLog.append(draft.value);
				if (!appended.ok) {
					const landed =
						stateCommit === undefined
							? `status on '${currentReporter.value.id}' did not land`
							: `state '${cmd.state}' WAS set on '${currentReporter.value.id}' (spine ${stateCommit.event.seq}), but the status event did not land`;
					return fail(appended.code, `${landed} (${appended.message})`, cmd.json);
				}
				const event = appended.value;
				const denormed = denormDescriptor(deps, currentReporter.value.id, {
					status: {
						prev: cmd.did,
						next: cmd.next,
						at: event.ts,
						seq: event.seq,
						writtenBy: relay.value.writtenBy,
					},
				});
				if (!denormed.ok) {
					const landed =
						stateCommit === undefined
							? `status on '${currentReporter.value.id}' WAS recorded (spine ${event.seq})`
							: `state '${cmd.state}' WAS set on '${currentReporter.value.id}' and its status event landed (spine ${event.seq})`;
					return fail(denormed.code, `${landed}, but ${denormed.message}`, cmd.json);
				}
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(
					`reported by ${currentReporter.value.id}: "${cmd.did}" → "${cmd.next}" (spine ${event.seq})`,
				);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "state-set": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const reporter = resolveReportingSelf(deps);
			if (!reporter.ok) return fail(reporter.code, reporter.message, cmd.json);
			const { platformWriteLock } = ports.value;
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const currentReporter = readReportingDescriptor(deps, reporter.value.id);
				if (!currentReporter.ok) {
					return fail(currentReporter.code, currentReporter.message, cmd.json);
				}
				const stateResult = setSemanticStateWithinLock(
					cmd,
					deps,
					ports.value,
					currentReporter.value,
					{ actor: currentReporter.value.id, provenance: "resolved" },
					now,
				);
				if (!stateResult.ok) return fail(stateResult.code, stateResult.message, cmd.json);
				const { event, record } = stateResult.value;
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(
					`state ${cmd.state} set on ${currentReporter.value.id} (assignment ${record.id}, spine ${event.seq})`,
				);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "state-clear": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const reporter = resolveReportingSelf(deps);
			if (!reporter.ok) return fail(reporter.code, reporter.message, cmd.json);
			const { assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const currentReporter = readReportingDescriptor(deps, reporter.value.id);
				if (!currentReporter.ok) {
					return fail(currentReporter.code, currentReporter.message, cmd.json);
				}
				const node = currentReporter.value;
				const attribution = { actor: node.id, provenance: "resolved" as const };
				const target = resolveTargetAssignment(assignmentStore, node, cmd.assignmentId);
				if (!target.ok) return fail(target.code, target.message, cmd.json);
				// Unlike state set, clear never materializes the implicit general: an
				// absent record has no declaration to remove.
				const record = target.value.existing;
				if (record === undefined) {
					return fail("E-NOREG", `no assignment to clear for node '${node.id}'`, cmd.json);
				}
				const chain = chainStateOf(record, spineLog.read({ peer: node.id }));
				if (chain.state === undefined) {
					return fail(
						"E-ARG",
						`assignment '${record.id}' is already undeclared — nothing to clear`,
						cmd.json,
					);
				}
				const draft = buildSpineEvent({
					nowMs: now,
					actor: attribution.actor,
					kind: SPINE_KIND_STATE_CLEARED,
					refs: [
						`node:${node.id}`,
						`assignment:${record.id}`,
						...(record.projectSlug === undefined ? [] : [`project:${record.projectSlug}`]),
						"transition:clear",
					],
					peer: node.id,
					project: record.projectSlug,
					prev: canonicalAssignmentJson(record),
					next: canonicalAssignmentJson(record),
					actorProvenance: attribution.provenance,
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
						`state on '${node.id}' WAS cleared (assignment ${record.id}), but its spine event failed to append (${appended.message}); the event is journaled and will be replayed by the next platform write`,
						cmd.json,
					);
				}
				const event = appended.value.event;
				const chained = assignmentStore.write(appendStateRef(record, event.seq));
				if (!chained.ok) {
					return fail(
						chained.code,
						`state on '${node.id}' WAS cleared and its spine event landed, but the assignment's states chain could not be updated (${chained.message}); the op remains journaled and the next platform write will reconcile it`,
						cmd.json,
					);
				}
				const cleared = opJournal.clear(opId);
				if (!cleared.ok) {
					return fail(
						cleared.code,
						`state on '${node.id}' WAS cleared and its spine event landed, but its journal entry could not be cleared (${cleared.message}) — further platform writes are blocked until it is resolved`,
						cmd.json,
					);
				}
				const denormed = denormDescriptor(deps, node.id, {
					assignment: {
						currentAssignment: record.id,
						currentTask: record.task,
						semanticState: undefined,
						stateNote: undefined,
					},
				});
				if (!denormed.ok) {
					return fail(
						denormed.code,
						`state on '${node.id}' WAS cleared and its spine event landed, but ${denormed.message}`,
						cmd.json,
					);
				}
				if (cmd.json) return okOut(JSON.stringify(event));
				return okOut(`state cleared on ${node.id} (assignment ${record.id}, spine ${event.seq})`);
			});
			return locked.ok ? locked.value : fail(locked.code, locked.message, cmd.json);
		}
		case "state-verify": {
			const ports = platformWritePorts(deps);
			if (!ports.ok) return fail(ports.code, ports.message, cmd.json);
			const reporter = resolveReportingSelf(deps);
			if (!reporter.ok) return fail(reporter.code, reporter.message, cmd.json);
			const { assignmentStore, spineLog, opJournal, platformWriteLock } = ports.value;
			const locked = platformWriteLock.withPlatformWriteLock((): CliResult => {
				const recovered = recoverPlatformWrites(ports.value);
				if (!recovered.ok) return fail(recovered.code, recovered.message, cmd.json);
				const currentReporter = readReportingDescriptor(deps, reporter.value.id);
				if (!currentReporter.ok) {
					return fail(currentReporter.code, currentReporter.message, cmd.json);
				}
				const node = deps.registry.read(cmd.node);
				if (!node) return fail("E-NOID", `no session '${cmd.node}' in registry`, cmd.json);
				if (currentReporter.value.id === node.id) {
					return fail(
						"E-ARG",
						`report verify is supervisory; '${node.id}' cannot verify its own done claim`,
						cmd.json,
					);
				}
				const attribution = { actor: currentReporter.value.id, provenance: "resolved" as const };
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
					actor: attribution.actor,
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
					verifiedBy: attribution.actor,
					actorProvenance: attribution.provenance,
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
				stateNote: d.stateNote ?? null,
				badge,
				currentAssignment: d.currentAssignment ?? null,
				currentTask: d.currentTask ?? null,
				statusPrev: d.statusPrev ?? null,
				statusNext: d.statusNext ?? null,
				statusAt: d.statusAt ?? null,
				statusSeq: d.statusSeq ?? null,
				statusWrittenBy: d.statusWrittenBy ?? null,
				planId: d.planId ?? null,
				orchestrationRole: projectOrchestrationRole(d),
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
				`note:        ${d.stateNote?.text ?? "—"}`,
				`task:        ${d.currentTask ?? "—"}  (${d.currentAssignment ?? "no assignment"})`,
				`report:      ${d.statusPrev ?? "—"} → ${d.statusNext ?? "—"}  (${d.statusAt ?? "never"}${d.statusSeq === undefined ? "" : `, spine ${d.statusSeq}`})`,
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
			const anomalyDescriptors = deps.registry.list();
			// Watchdog state as a PLAIN PROJECTION built HERE, at the I/O edge, so
			// the detector stays pure (s079). Absent when the stores are unwired,
			// which keeps `inert-subscription` silent rather than guessing.
			const watchdogView =
				deps.watchdogStore === undefined
					? undefined
					: {
							globallyDisabled: deps.watchdogGlobalStore?.disabled() ?? false,
							nodes: anomalyDescriptors.flatMap((d) => {
								const sidecar = deps.watchdogStore?.read(d.id);
								if (sidecar === undefined) return [];
								return [
									{
										nodeId: d.id,
										watchers: (sidecar.watchers ?? []).map((w) => w.watcherId),
										...(sidecar.pausedBy === undefined ? {} : { pausedBy: sidecar.pausedBy }),
										...(sidecar.exemptUntilMs === undefined
											? {}
											: { exemptUntilMs: sidecar.exemptUntilMs }),
									},
								];
							}),
						};
			let anomalies = detectAnomalies({
				descriptors: anomalyDescriptors,
				assignments,
				events: ports.value.spineLog.read(),
				dispatches: deps.dispatchStore?.list() ?? [],
				allocations,
				nowMs: now,
				...(watchdogView === undefined ? {} : { watchdog: watchdogView }),
			});
			// Kept so an EMPTY scoped result can say what it did not look at. An
			// empty answer is indistinguishable from "all clear", and that is the
			// whole failure: a seat naturally runs the scoped query to check its own
			// area, reads "no anomalies", and stops — while fleet rows about it sit
			// in the unscoped view. Observed 2026-07-30: `--here` returned "no
			// anomalies" for a seat while global carried 11 rows, one of which was
			// its own governing prime's twelve-day-stale card.
			const unscopedCount = anomalies.length;
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
			// Name the scope and the rows it hid. Silence about what was filtered is
			// how a narrowing flag turns into a false all-clear.
			//
			// D-038: this footer originally fired ONLY when the scoped result was
			// EMPTY, which made the fix for "a scoped query must say what it did not
			// look at" itself silent about what it did not look at — the same defect
			// one level inside its own remedy. The PARTIAL case is the more dangerous
			// one: a non-empty result reads as a complete answer, where an empty one
			// at least invites suspicion. So it now fires on ANY filtering.
			const scope =
				cmd.here && cmd.project !== undefined
					? `in this folder and project '${cmd.project}'`
					: cmd.here
						? "in this folder"
						: cmd.project !== undefined
							? `in project '${cmd.project}'`
							: undefined;
			const hidden = unscopedCount - anomalies.length;
			if (anomalies.length === 0) {
				if (scope === undefined) return okOut("no anomalies");
				return okOut(
					hidden === 0
						? `no anomalies ${scope} (and none anywhere)`
						: `no anomalies ${scope} — but ${hidden} elsewhere; run 'pij anomalies' unscoped to see them`,
				);
			}
			const rows = anomalies
				.map((a) => {
					const evidence =
						a.recordRef === undefined
							? `spine ${a.evidence.join(",") || "—"}`
							: `${a.recordRef}${a.ageMs === undefined ? "" : ` age=${a.ageMs}ms`}`;
					return `${pad(a.kind, 26)} ${pad(a.nodeId, 20)} ${a.detail} [${evidence}]`;
				})
				.join("\n");
			return okOut(
				scope === undefined || hidden === 0
					? rows
					: `${rows}\n— showing ${anomalies.length} ${scope}; ${hidden} more hidden by that scope. Run 'pij anomalies' unscoped to see them.`,
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
			orchestrationRole: projectOrchestrationRole(node),
		});
		output.push(head.slice(0, -1), ',"children":[');
		stack.push({ nodes: children, index: 0, close: "]}" });
	}
	return output.join("");
}

/** Worst-first AC-05 badge for every row, in ONE pass over the spine.
 *
 *  ─── THE HOIST IS THE WHOLE POINT — MEASURE BEFORE YOU SIMPLIFY IT. ───
 *  The obvious implementation is to do per row exactly what `node show` does:
 *  `spineLog.read({ peer: d.id })`, then join that peer's open assignments.
 *  That is CORRECT and it is what this function returns — but at fleet scale it
 *  measured **4249 / 4184 / 4265 ms** over 179 rows and 20,059 spine events,
 *  because it walks the whole log once per row. Reading the spine ONCE and
 *  bucketing by peer measured **190 / 205 / 183 ms** for byte-identical badges
 *  (verified: zero disagreements, and non-vacuously — 8 rows carried an open
 *  assignment, all 8 produced a chain state, and on 7 that state changed the
 *  badge away from `systemState` alone).
 *
 *  So a "cleanup" that inlines this back to a per-row read is a 20x regression
 *  that no test will fail and no reviewer will see. If you change it, re-measure
 *  at fleet scale — not on a fixture, where both shapes look free. */
function badgeIndex(
	deps: CliDeps,
	descs: readonly SessionDescriptor[],
): Result<ReadonlyMap<SessionId, SemanticState | SystemState>> {
	const { assignmentStore, spineLog } = deps;
	if (!assignmentStore || !spineLog)
		return err("E-NOREG", "project/spine stores are not wired — update the pij bin");
	const eventsByPeer = new Map<SessionId, SpineEvent[]>();
	for (const event of spineLog.read()) {
		const peer = event.peer;
		if (peer === undefined) continue;
		const bucket = eventsByPeer.get(peer);
		if (bucket) bucket.push(event);
		else eventsByPeer.set(peer, [event]);
	}
	const badges = new Map<SessionId, SemanticState | SystemState>();
	for (const d of descs) {
		const events = eventsByPeer.get(d.id) ?? [];
		const openStates = assignmentStore
			.listByNode(d.id)
			.filter((assignment) => assignment.closed === undefined)
			.map((assignment) => chainStateOf(assignment, events).state)
			.filter((state): state is SemanticState => state !== undefined);
		badges.set(d.id, badgeOf(d.systemState, openStates));
	}
	return ok(badges);
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
