// pij-messaging — pure spawn-command builder + ready-body codec.
//
// Pi-free, child_process-free (AC-08). The argv/env surface the rest of
// the system deduces spawn behaviour from. No @earendil-works/* imports.
//
// Design notes:
//   - task rides PIJ_SPAWN_TASK env (never positional) to dodge the
//     announce-vs-initial-prompt race (finding 01 / CF-01).
//   - paneId? is an optional pass-through: Phase 2 resolves whether the
//     child ever reads PIJ_PANE_ID (e.g. for self-close) or if it is
//     spawner-only state. See PIJ_PANE_ID advisory in phase-1 dossier.

import { deriveSelfId } from "./discovery.js";
import type { HarnessKind, Role, SessionDescriptor, SessionId } from "./types.js";
import { err, ok, type Result } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Input to buildSpawnCommand. */
export interface SpawnInput {
	/** Optional model override (passed as --model <model>). */
	model?: string;
	/** Optional first task; delivered via PIJ_SPAWN_TASK env (finding 01). */
	task?: string;
	/** Correlation token — becomes PIJ_SPAWN_ID. */
	spawnId: string;
	/** The spawner's pij id — becomes PIJ_ANNOUNCE_TO. */
	announceTo: string;
	/** Optional pane id pass-through — becomes PIJ_PANE_ID iff set.
	 *  Phase 2 resolves ownership; do not require it here. */
	paneId?: string;
	/** Absolute working directory for the new pi session. */
	cwd: string;
	/** Role the new session plays ("worker" for spawned children). */
	role: Role;
}

/** Output of buildSpawnCommand — passed to TmuxPort.newWindow. `cmd` is `"pi"`
 *  for a pi worker; the control-plane builder (buildControlSpawnCommand) widens
 *  it to `"claude"` (copilot later), hence the `string` type. */
export interface SpawnCommand {
	readonly cmd: string;
	readonly args: string[];
	readonly env: Record<string, string>;
}

/** The payload a spawned child sends back to the parent once ready. */
export interface ReadyPayload {
	readonly spawnId: string;
	readonly model: string;
	readonly cwd: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the argv + env needed to launch a new pij worker via tmux.
 *
 * - `--model <model>` is emitted iff `input.model` is given.
 * - `PIJ_SPAWN_MODEL` is emitted in env iff `input.model` is given, so the
 *   child's `boot()` can include it in the ready-ping body (§H2).
 * - `task` is passed via `PIJ_SPAWN_TASK` env (not positional arg) to avoid
 *   the announce-vs-initial-prompt race (finding 01 / CF-01).
 * - `paneId` is an optional pass-through (Phase 2 resolves ownership).
 */
export function buildSpawnCommand(input: SpawnInput): SpawnCommand {
	const args: string[] = [];
	if (input.model !== undefined) {
		args.push("--model", input.model);
	}

	const env: Record<string, string> = {
		PIJ_ANNOUNCE_TO: input.announceTo,
		PIJ_SPAWN_ID: input.spawnId,
		PIJ_ROLE: input.role,
	};

	// §H2: thread model via env so the child boot() reads PIJ_SPAWN_MODEL
	// and includes it in the ready-ping body — same value as --model argv.
	if (input.model !== undefined) {
		env.PIJ_SPAWN_MODEL = input.model;
	}

	if (input.task !== undefined) {
		env.PIJ_SPAWN_TASK = input.task;
	}

	if (input.paneId !== undefined) {
		env.PIJ_PANE_ID = input.paneId;
	}

	return { cmd: "pi", args, env };
}

/**
 * Build the ready-ping body string that a spawned child sends to the
 * parent once it is initialised. Encodes spawnId, model, and cwd.
 */
export function readyBody(spawnId: string, model: string, cwd: string): string {
	return JSON.stringify({ spawnId, model, cwd });
}

/**
 * Parse a ready-ping body produced by readyBody(). Returns null if the
 * payload is malformed or missing required fields.
 */
export function parseReadyBody(body: string): ReadyPayload | null {
	try {
		const parsed = JSON.parse(body) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof (parsed as Record<string, unknown>).spawnId === "string" &&
			typeof (parsed as Record<string, unknown>).model === "string" &&
			typeof (parsed as Record<string, unknown>).cwd === "string"
		) {
			const p = parsed as Record<string, unknown>;
			return {
				spawnId: p.spawnId as string,
				model: p.model as string,
				cwd: p.cwd as string,
			};
		}
		return null;
	} catch {
		return null;
	}
}

// ─── Control plane (Plan 019) ────────────────────────────────────────────────
//
// A non-pi harness (Claude Code today) cannot derive its own pij-id at boot the
// way a child pi session does (it knows nothing about pij). So the daemon
// PRE-ALLOCATES the id before the pane exists (AC-01), threads it into the child
// env (PIJ_SESSION_ID), and writes a `pending` descriptor the daemon then drives
// to `ready` → `bound`. These builders are PURE — the impure split/write/inject
// orchestration lives in the daemon (Groups E/F).

/** Input to {@link buildControlSpawnCommand}. */
export interface ControlSpawnInput {
	/** The harness to launch (`claude` now; `copilot` reserved). */
	readonly harness: HarnessKind;
	/** The PRE-ALLOCATED pij-id ({@link allocatePijId}) — rides PIJ_SESSION_ID so
	 *  the agent's `pij phonehome` self-resolves to the same id. */
	readonly pijId: SessionId;
	/** Absolute working directory for the new session. */
	readonly cwd: string;
	/** Optional model override (`claude --model <model>`). */
	readonly model?: string;
	/** Optional first task — delivered later via the init inject, not argv. */
	readonly task?: string;
	/** Copilot only: the pij-chosen session UUID, passed as `--session-id <uuid>`
	 *  so binding is deterministic at spawn (Copilot sets a new session's UUID). */
	readonly copilotSessionId?: string;
	/** Branch-from-self (claude, Plan 020): the SOURCE harness session id to fork —
	 *  emits `--resume <branchFrom> --fork-session`. Paired with {@link forkSessionId}.
	 *  Absent for a normal (non-branch) spawn. */
	readonly branchFrom?: string;
	/** Branch-from-self (claude): the pij-chosen NEW session id for the fork —
	 *  emits `--session-id <forkSessionId>` so the daemon binds deterministically
	 *  (the planned-id path, no transcript discovery). Set with `branchFrom`. */
	readonly forkSessionId?: string;
}

/** Input to {@link buildPendingDescriptor}. */
export interface PendingDescriptorInput {
	readonly pijId: SessionId;
	/** %N captured from `split-window -P` at spawn (finding 04). */
	readonly paneId: string;
	readonly cwd: string;
	readonly harness: HarnessKind;
	readonly dataDir: string;
	readonly eventsPath: string;
	readonly pid: number;
	/** ISO-8601 — the daemon's clock at spawn. */
	readonly startedAtIso: string;
	/** Transcript paths present at spawn (BEFORE the pane exists) — seeds
	 *  deterministic new-path discovery (AC-03 / review H1). Claude only. */
	readonly transcriptsAtSpawn?: readonly string[];
	/** Copilot only: the pij-chosen session UUID (`--session-id`) the daemon binds
	 *  to deterministically — no discovery. */
	readonly plannedHarnessSessionId?: string;
	/** Branch-from-self (Plan 020): the source harness session id this pane was
	 *  forked from. Observability only — the bind keys on `plannedHarnessSessionId`. */
	readonly branchedFrom?: string;
}

/**
 * Pre-allocate a control-plane pij-id BEFORE the pane exists (AC-01). A non-pi
 * harness has no pi session id, so we seed {@link deriveSelfId} with the spawn
 * token (the daemon's `s<now>-<counter>`): deterministic, collision-resistant,
 * and known before launch — the value spawn returns to its caller immediately.
 */
export function allocatePijId(spawnToken: string, pid: number): SessionId {
	return deriveSelfId(spawnToken, pid);
}

/**
 * Build argv + env to launch a non-pi harness in a tmux pane. The pre-allocated
 * pij-id rides PIJ_SESSION_ID (so `pij phonehome` from inside binds to it) and
 * the harness kind rides PIJ_HARNESS. argv stays an array (AC-09: no shell).
 *
 * - `claude`:  `claude --dangerously-skip-permissions [--model <model>]`.
 * - `copilot`: `copilot --yolo --session-id <uuid> [--model <model>]`.
 *
 * The blanket-permission flag (`--dangerously-skip-permissions` for claude,
 * `--yolo` for copilot — the latter = --allow-all-tools/paths/urls) is REQUIRED
 * for a daemon-driven pane: there is no human at the pane to answer the harness's
 * permission/auto-mode prompts, so without it the agent hangs the instant it runs
 * a tool (e.g. the confirmatory `pij phonehome` bash call gets blocked). The pane
 * is a controlled peer we spawned, not an untrusted surface, so this is the right
 * trust posture. `--session-id <uuid>` SETS the copilot session UUID so the daemon
 * binds deterministically to it (no transcript-discovery race like claude).
 */
export function buildControlSpawnCommand(input: ControlSpawnInput): SpawnCommand {
	const args: string[] = [];
	if (input.harness === "claude") {
		args.push("--dangerously-skip-permissions");
		// Branch-from-self: fork the caller's own session into this pane. `--session-id`
		// pins the fork's id so the daemon binds deterministically (no discovery race).
		if (input.branchFrom !== undefined && input.forkSessionId !== undefined) {
			args.push(
				"--resume",
				input.branchFrom,
				"--fork-session",
				"--session-id",
				input.forkSessionId,
			);
		}
	} else if (input.harness === "copilot") {
		args.push("--yolo");
		if (input.copilotSessionId !== undefined) {
			args.push("--session-id", input.copilotSessionId);
		}
	}
	if (input.model !== undefined) {
		args.push("--model", input.model);
	}
	const env: Record<string, string> = {
		PIJ_SESSION_ID: input.pijId,
		PIJ_HARNESS: input.harness,
	};
	if (input.task !== undefined) {
		env.PIJ_SPAWN_TASK = input.task;
	}
	const cmd = input.harness === "claude" ? "claude" : input.harness;
	return { cmd, args, env };
}

/**
 * Build the `pending` descriptor written atomically at spawn, before any inject
 * (F2 / AC-01). The daemon's dir-watch keys on `lifecycle: "pending"` to start
 * readiness; `paneId` (from split `-P`) is how it addresses the pane.
 */
export function buildPendingDescriptor(input: PendingDescriptorInput): SessionDescriptor {
	return {
		id: input.pijId,
		folder: input.cwd,
		dataDir: input.dataDir,
		eventsPath: input.eventsPath,
		pid: input.pid,
		startedAt: input.startedAtIso,
		harness: input.harness,
		paneId: input.paneId,
		lifecycle: "pending",
		...(input.transcriptsAtSpawn ? { transcriptsAtSpawn: input.transcriptsAtSpawn } : {}),
		...(input.plannedHarnessSessionId
			? { plannedHarnessSessionId: input.plannedHarnessSessionId }
			: {}),
		...(input.branchedFrom ? { branchedFrom: input.branchedFrom } : {}),
	};
}

/** A parsed `pij compact-self [--pane %N] [--delay-ms N] [instruction…]` request. */
export interface CompactSelfRequest {
	/** Target pane (`--pane`, else the caller's `$TMUX_PANE` default). */
	readonly pane?: string;
	/** Optional follow-up to TYPE after `/compact` — queued by the harness while it
	 *  compacts, so it runs as the first turn of the fresh context. */
	readonly instruction?: string;
	/** ms to wait after firing `/compact` before typing the instruction, so the
	 *  harness has entered compaction and queues the follow-up (not run pre-compact). */
	readonly delayMs: number;
}

/** Parse `compact-self` args (pure). Non-flag tokens join into the instruction
 *  (so an unquoted multi-word follow-up still works); `--pane`/`--delay-ms` take
 *  values in space or `=` form. Default delay 1500ms (~1–2s). */
export function parseCompactSelfArgs(
	argv: readonly string[],
	envPane?: string,
): CompactSelfRequest {
	let pane = envPane;
	let delayMs = 1500;
	const rest: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === "--pane") pane = argv[++i];
		else if (tok?.startsWith("--pane=")) pane = tok.slice("--pane=".length);
		else if (tok === "--delay-ms") {
			const v = Number(argv[++i]);
			if (Number.isFinite(v) && v >= 0) delayMs = v;
		} else if (tok?.startsWith("--delay-ms=")) {
			const v = Number(tok.slice("--delay-ms=".length));
			if (Number.isFinite(v) && v >= 0) delayMs = v;
		} else if (tok !== undefined) {
			rest.push(tok);
		}
	}
	const instruction = rest.join(" ").trim();
	return { pane, delayMs, ...(instruction ? { instruction } : {}) };
}

/** Where a control-plane spawn should split, mirroring pi's `layout:"split"`. */
export type ControlSplitPlan =
	| {
			readonly ok: true;
			readonly target: string;
			readonly direction: "h" | "v";
			readonly percent?: number;
	  }
	| { readonly ok: false; readonly code: "E-FULL"; readonly message: string };

/** Decide where `pij spawn --harness …` splits, mirroring pi's `pij_spawn`
 *  layout (core/session.ts): worker #1 splits the orchestrator pane LEFT/RIGHT
 *  (`-h` → a right column ~40% wide); worker #2 splits worker-1's pane UP/DOWN
 *  (`-v` → stacked below it). Cap = main + 2 panes; a 3rd → E-FULL. `peerPanes`
 *  is the set of LIVE control-plane peer panes already in the orchestrator's
 *  window (a closed pane drops out, freeing its slot). */
export function planControlSplit(ownPane: string, peerPanes: readonly string[]): ControlSplitPlan {
	if (peerPanes.length >= 2) {
		return {
			ok: false,
			code: "E-FULL",
			message:
				"split layout full — 2 workers already on the right; close one or kill its pane first",
		};
	}
	const first = peerPanes.length === 0;
	const firstPeer = peerPanes[0];
	if (first || firstPeer === undefined) {
		return { ok: true, target: ownPane, direction: "h", percent: 40 };
	}
	return { ok: true, target: firstPeer, direction: "v" };
}

/** The live peer panes sharing the orchestrator's window — the input to
 *  {@link planControlSplit}'s main+2 cap. A descriptor counts iff it has a `paneId`,
 *  it isn't the caller's own pane, and that pane is still ALIVE (present in
 *  `windowPanes`, which lists only live panes — a closed peer frees its slot).
 *  **Harness-agnostic (Plan 021)**: every spawned colleague — pi, claude, or copilot
 *  — counts toward the SAME cap, so a mixed fleet is consistent (a pi pane and a claude
 *  pane are both just panes). Deduped; insertion order preserved. Pure, so both the pi
 *  and the daemon-bound spawn paths share one definition (and one test). */
export function livePeerPanes(
	descriptors: readonly SessionDescriptor[],
	windowPanes: readonly string[],
	ownPane: string,
): string[] {
	const alive = new Set(windowPanes);
	return Array.from(
		new Set(
			descriptors
				.filter((d) => d.paneId && d.paneId !== ownPane && alive.has(d.paneId))
				.map((d) => d.paneId as string),
		),
	);
}

/** A parsed `pij spawn --harness <h> [--task …] [--model …] [--json]` request.
 *  Pure parse so the bin only owns the impure split/write (T018). */
export interface SpawnRequest {
	readonly harness: HarnessKind;
	readonly task?: string;
	readonly model?: string;
	/** Branch-from-self (Plan 020): fork the CALLER's own session into the new pane
	 *  (`--branch`). Default false. Gated + resolved by the bin via {@link planBranch}. */
	readonly branch: boolean;
	readonly json: boolean;
}

/** Daemon-bound harnesses: the daemon pre-allocates an id and drives boot→bound
 *  (transcript discovery for claude, deterministic `--session-id` for copilot). */
const CONTROL_HARNESSES = new Set<HarnessKind>(["claude", "copilot"]);

/** Harnesses `pij spawn` can launch (Plan 021 — one uniform surface). `pi` joins
 *  claude/copilot here, but it is NOT a CONTROL_HARNESS: a pi child derives its own
 *  pij-id at boot and self-registers (core/session.ts §H1), so it needs no daemon,
 *  no pre-allocated id, and no binding — the bin dispatches it down the pi path. */
const SPAWNABLE_HARNESSES = new Set<HarnessKind>(["pi", "claude", "copilot"]);

/** Parse the `spawn` verb's args. `--harness` is required and must be a spawnable
 *  harness (pi | claude | copilot). pi launches via the in-process path inside the
 *  bin (self-registering); claude/copilot are daemon-bound. Unknown flags / missing
 *  values → E-ARG. */
export function parseSpawnArgs(argv: readonly string[]): Result<SpawnRequest> {
	let harness: HarnessKind | undefined;
	let task: string | undefined;
	let model: string | undefined;
	let branch = false;
	let json = false;
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === "--json") {
			json = true;
			continue;
		}
		if (tok === "--branch") {
			branch = true;
			continue;
		}
		const eq = tok?.indexOf("=") ?? -1;
		const key = tok?.startsWith("--") ? tok.slice(2, eq === -1 ? undefined : eq) : undefined;
		if (!key) return err("E-ARG", `unexpected argument '${tok}' for spawn`);
		const inlineVal = eq === -1 ? undefined : tok?.slice(eq + 1);
		const value = inlineVal ?? argv[++i];
		if (value === undefined) return err("E-ARG", `--${key} needs a value`);
		if (key === "harness") {
			if (!SPAWNABLE_HARNESSES.has(value as HarnessKind))
				return err("E-ARG", `--harness must be pi|claude|copilot (got '${value}')`);
			harness = value as HarnessKind;
		} else if (key === "task") {
			task = value;
		} else if (key === "model") {
			model = value;
		} else {
			return err("E-ARG", `unknown flag --${key} for spawn`);
		}
	}
	if (!harness)
		return err("E-ARG", "usage: pij spawn --harness pi|claude|copilot [--task …] [--model …]");
	return ok({ harness, task, model, branch, json });
}

/** Result of planning a branch-from-self spawn (Plan 020). */
export interface BranchPlan {
	/** Source harness session id to fork (`--resume <from>`). */
	readonly from: string;
	/** The pij-chosen new session id for the fork (`--session-id <newSessionId>`). */
	readonly newSessionId: string;
}

/**
 * Decide whether a `--branch` (branch-from-self) spawn is allowed, given the
 * resolved CALLER descriptor (`self`) and a freshly-minted session id. PURE — the
 * impure self-resolution + uuid mint live in the bin. Branch-from-self forks the
 * caller's OWN session, so it requires: the caller resolves, the requested harness
 * supports branching, the caller runs the SAME harness, and the caller is already
 * BOUND (has a `harnessSessionId` to fork). Every reject is a specific, actionable
 * E-BRANCH. `supports` is injected ({@link supportsBranching}) for testability;
 * branching from ANOTHER peer is intentionally out of scope but not precluded —
 * a future caller passes that peer's descriptor as `self`.
 */
export function planBranch(
	reqHarness: HarnessKind,
	self: SessionDescriptor | null,
	supports: (h: HarnessKind) => boolean,
	newSessionId: string,
): Result<BranchPlan> {
	if (!supports(reqHarness)) {
		return err(
			"E-BRANCH",
			`--branch is not supported for ${reqHarness} yet (claude only) — spawn without --branch`,
		);
	}
	if (!self) {
		return err(
			"E-BRANCH",
			"cannot --branch: cannot resolve which session is calling. Set PIJ_SESSION_ID, " +
				'or run `pij adopt "$TMUX_PANE" --harness <h>` so this pane resolves itself',
		);
	}
	const selfHarness = self.harness ?? "pi";
	if (selfHarness !== reqHarness) {
		return err(
			"E-BRANCH",
			`--branch forks your OWN session, so the new harness must match yours: ` +
				`you are ${selfHarness}, spawning ${reqHarness}`,
		);
	}
	if (!self.harnessSessionId || self.harnessSessionId.trim() === "") {
		return err(
			"E-BRANCH",
			"cannot --branch: your session is not bound yet (no harness session id to fork) — " +
				"wait for binding, then retry",
		);
	}
	return ok({ from: self.harnessSessionId, newSessionId });
}

/** A parsed `pij adopt <pane> --harness <h> [--id <pij-id>] [--json]` request. */
export interface AdoptRequest {
	readonly pane: string;
	readonly harness: HarnessKind;
	readonly id?: SessionId;
	readonly json: boolean;
}

/** Parse the `adopt` verb: a positional `<pane>` (%N) + `--harness` (required,
 *  a control harness) + optional `--id` (else allocate) + `--json`. */
export function parseAdoptArgs(argv: readonly string[]): Result<AdoptRequest> {
	let pane: string | undefined;
	let harness: HarnessKind | undefined;
	let id: SessionId | undefined;
	let json = false;
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === "--json") {
			json = true;
			continue;
		}
		if (tok && !tok.startsWith("--")) {
			if (pane !== undefined) return err("E-ARG", `unexpected extra argument '${tok}'`);
			pane = tok;
			continue;
		}
		const eq = tok?.indexOf("=") ?? -1;
		const key = tok?.startsWith("--") ? tok.slice(2, eq === -1 ? undefined : eq) : undefined;
		if (!key) return err("E-ARG", `unexpected argument '${tok}' for adopt`);
		const value = eq === -1 ? argv[++i] : tok?.slice(eq + 1);
		if (value === undefined) return err("E-ARG", `--${key} needs a value`);
		if (key === "harness") {
			if (!CONTROL_HARNESSES.has(value as HarnessKind))
				return err("E-ARG", `--harness must be claude|copilot (got '${value}')`);
			harness = value as HarnessKind;
		} else if (key === "id") {
			id = value;
		} else {
			return err("E-ARG", `unknown flag --${key} for adopt`);
		}
	}
	if (!pane || !/^%\d+$/.test(pane))
		return err("E-ARG", "usage: pij adopt <pane:%N> --harness claude [--id <pij-id>]");
	if (!harness) return err("E-ARG", "adopt needs --harness claude|copilot");
	return ok({ pane, harness, id, json });
}
