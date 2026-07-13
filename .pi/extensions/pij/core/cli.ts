// pij-messaging — pure CLI core (Pattern P2: pi-free; P4: tagged-union returns;
// P8: the testable backbone of the `pij` bin).
//
// Three pure pieces the thin `cli.ts` bin wires to process.argv/stdout:
//   parseArgs(argv) -> Result<ParsedCommand>     (E-ARG on bad invocation)
//   dispatch(cmd, deps) -> CliResult             ({stdout, stderr, exitCode})
// All six verbs reuse the proven core helpers (resolveSelf/filterByFolder/
// liveness/validateCommand/filterEvents via the ports) — no new logic. Node I/O
// (fs, argv, exit) and the imperative --follow / --wait loops live in the bin.

import { applyBinding, resolvePhonehomeSessionId } from "./binding.js";
import { ALLOWED_COMMANDS, validateCommand } from "./commands.js";
import { filterByFolder, filterPrime, resolveSelf, selectByRepository } from "./discovery.js";
import type { PersistReceiptEnvelopeAction } from "./inbox.js";
import { closestModel } from "./models/match.js";
import type { ModelEntry } from "./models/registry.js";
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
import { activityOf, liveness, STALE_AFTER_MS } from "./state.js";
import { planLink, projectSessionForest } from "./tree.js";
import {
	err,
	type LivenessVerdict,
	ok,
	type PijErrorCode,
	type PijEvent,
	type ReceiptState,
	type Result,
	type SessionDescriptor,
	type SessionForest,
	type SessionId,
	type SessionLifecycle,
	type SessionTreeNode,
	type TreeActivity,
	type TreeFilters,
	type TreeSession,
} from "./types.js";

// ─── deps (injected — fakes in tests, real fs adapters in the bin) ──────────
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
}

// ─── parsed command (discriminated per verb) ────────────────────────────────
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
			readonly json: boolean;
	  }
	| {
			readonly verb: "path";
			readonly id: SessionId;
			readonly which: "dir" | "events" | "state";
			readonly json: boolean;
	  };

export interface CliResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	/** Set when the bin must keep going: --follow tails, --wait polls receipts. */
	readonly follow?:
		| { readonly kind: "tail"; readonly id: SessionId; readonly nextSince: number }
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

/** Workshop-001 exit codes. */
const EXIT: Record<PijErrorCode, number> = {
	"E-NOID": 2,
	"E-SELF": 2,
	"E-CMD": 2,
	"E-AMBIG": 2,
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

/** Flags each verb accepts — anything else is E-ARG. */
const ALLOWED_FLAGS: Record<string, ReadonlySet<string>> = {
	whoami: new Set(["json", "env"]),
	list: new Set(["here", "prime", "json"]),
	sessions: new Set(["here", "json"]),
	models: new Set(["harness", "json"]),
	send: new Set(["to", "command", "file", "caption", "wait", "json"]),
	tail: new Set(["since", "type", "lines", "follow", "json"]),
	state: new Set(["json"]),
	phonehome: new Set(["json"]),
	tree: new Set(["global", "activity", "liveness", "lifecycle", "all", "json"]),
	link: new Set(["parent", "root", "json"]),
	path: new Set(["events", "state", "dir", "json"]),
};
/** Max positionals per verb (send allows id + text; models allows optional filter). */
const MAX_POS: Record<string, number> = {
	whoami: 0,
	list: 0,
	sessions: 0,
	models: 1,
	send: 2,
	tail: 1,
	state: 1,
	phonehome: 0,
	tree: 1,
	link: 1,
	path: 1,
};

export function parseArgs(argv: readonly string[]): Result<ParsedCommand> {
	const verb = argv[0];
	if (verb === undefined)
		return err(
			"E-ARG",
			"usage: pij <whoami|list|sessions|models|send|tail|state|phonehome|tree|link|path> …",
		);
	const allowed = ALLOWED_FLAGS[verb];
	if (!allowed)
		return err(
			"E-ARG",
			`unknown command '${verb}' (whoami|list|sessions|models|send|tail|state|phonehome|tree|link|path)`,
		);
	const args = argv.slice(1);
	for (const token of args) {
		const equals = token.startsWith("--") ? token.indexOf("=") : -1;
		if (equals === -1) continue;
		const key = token.slice(2, equals);
		if (BOOLEAN_FLAGS.has(key)) return err("E-ARG", `--${key} does not take a value`);
	}
	const { pos, flags, repeated } = lex(args, BOOLEAN_FLAGS, REPEATABLE_FLAGS);
	// strict: reject unknown flags and extra arity (finding F001).
	for (const k of [...Object.keys(flags), ...Object.keys(repeated)]) {
		if (!allowed.has(k)) return err("E-ARG", `unknown flag --${k} for '${verb}'`);
	}
	if (pos.length > (MAX_POS[verb] ?? 0)) return err("E-ARG", `too many arguments for '${verb}'`);
	const json = flags.json === true;
	// number | undefined (absent) | "bad" (present but non-numeric -> E-ARG).
	const pnum = (v: string | true | undefined): number | undefined | "bad" =>
		v === undefined ? undefined : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : "bad";

	switch (verb) {
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
			return ok({ verb: "link", childId, parentId: root ? null : (parentId as string), json });
		}
		case "path": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij path <id> [--events|--state|--dir]");
			const which = flags.events === true ? "events" : flags.state === true ? "state" : "dir";
			return ok({ verb: "path", id, which, json });
		}
		default:
			return err(
				"E-ARG",
				`unknown command '${verb}' (whoami|list|sessions|models|send|tail|state|phonehome|tree|link|path)`,
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
					? result.daemonTickStale
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
		case "models": {
			let entries = deps.models ?? [];
			// pi proxies ALL providers — applying a provider filter would return nothing
			// because real provider keys are github-copilot, sakana, openrouter, etc.
			if (cmd.harnessFilter && cmd.harnessFilter !== "pi") {
				entries = entries.filter((e) => providerMatchesHarness(e.provider, cmd.harnessFilter!));
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
							effort: d.effort ?? null,
							failureReason: d.failureReason ?? null,
							prime: d.prime === true,
							oldPrime: d.oldPrime === true,
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
					`${d.id === self ? "★ " : "  "}${pad(d.id, 14)} ${d.prime === true ? "P" : d.oldPrime === true ? "O" : " "} ${pad(activityOf(d.state, d.lastEventAt != null), 8)} ${pad(live, 7)} ${pad(d.boundModel ?? "—", 20)} ${pad(d.effort ?? "—", 7)} ${d.folder}`,
			);
			const header = `  ${pad("id", 14)} P ${pad("activity", 8)} ${pad("liveness", 7)} ${pad("model", 20)} ${pad("effort", 7)} folder`;
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
			const changed = current?.parentId !== cmd.parentId;
			if (changed) deps.registry.write(planned.value);
			if (cmd.json) {
				return okOut(JSON.stringify({ id: cmd.childId, parentId: cmd.parentId, changed }));
			}
			return okOut(
				cmd.parentId === null
					? `${changed ? "linked" : "unchanged"} ${cmd.childId} → root`
					: `${changed ? "linked" : "unchanged"} ${cmd.childId} → ${cmd.parentId}`,
			);
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
							? tickStatus?.daemonTickStale
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
			return okOut(
				`${d.id}: ${activityOf(d.state, d.lastEventAt != null)} · ${live}   (last event ${humanAge(ageMs)} ago, pid ${d.pid} ${alive ? "alive" : "gone"})\n  cwd: ${d.folder}${d.harness ? `  ·  harness: ${d.harness}` : ""}${modelLine}${effortLine}${tickLine}${failLine}`,
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
		lines.push(
			`${indent}${prime} ${node.id}  ${node.activity}/${node.liveness}/${lifecycle}${problem}`,
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
