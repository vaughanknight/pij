import { lastActivityAtMs } from "./archive.js";
import type { SpawnCommand, SpawnLayout } from "./spawn.js";
import { err, ok, type Result, type SessionDescriptor, type SessionId } from "./types.js";

export const REVIVE_REFRAME =
	"You are a REVIVED session. Your prior conversation is context only, NOT a task to resume. " +
	"Do NOT continue the old work, spawn peers, or message anyone. Wait for new instructions.";

export const REVIVE_USAGE_LINE =
	"usage: pij revive [<pij-id>] [--print] [--attach [<pane>]] [--assume-dead] " +
	"[--layout stack|right|below|window] [--json]";

export interface ReviveRequest {
	/** Absent ⇒ resolve the seat from the current folder (s072 D1). */
	readonly id?: SessionId;
	readonly layout?: SpawnLayout;
	readonly json: boolean;
	/** Render the launch command and exit — no tmux, no spawn, no descriptor write. */
	readonly print: boolean;
	/** Bind an EXISTING pane (the operator's own) to the seat instead of spawning
	 *  one. Empty string ⇒ take the pane from `$TMUX_PANE`. */
	readonly attach?: string;
	/** Operator override for an attachment that could not be proven dead. */
	readonly assumeDead: boolean;
}

export interface ReviveArtifacts {
	readonly claudePath?: string;
	readonly copilotPath?: string;
	readonly codexPaths: readonly string[];
	readonly piPaths: readonly string[];
	readonly ompPaths: readonly string[];
}

export interface RevivePlanInput {
	readonly spawnId: string;
	readonly parentId?: SessionId;
	/** Verdict on the PRIOR incarnation's pane/process (see classifyAttachment).
	 *  Absent ⇒ not probed, so nothing is proven either way. */
	readonly attachment?: AttachmentLiveness;
	/** Why the attachment is `uncertain`, in the operator's terms (see
	 *  `uncertaintyReason`). Absent ⇒ a generic explanation is used. */
	readonly attachmentReason?: string;
	/** Planning for `--print`: renders a command, mutates nothing, so it is
	 *  permitted on a seat whose prior attachment is merely UNCERTAIN. */
	readonly print?: boolean;
	/** Operator override: treat an uncertain prior attachment as dead. */
	readonly assumeDead?: boolean;
}

export interface RevivePlan {
	readonly id: SessionId;
	readonly runtime: "claude" | "copilot" | "codex" | "pi" | "omp";
	readonly artifactPath: string;
	readonly command: SpawnCommand;
	readonly descriptor: SessionDescriptor;
}

export interface RevivedAttachment {
	readonly paneId: string;
	readonly windowId?: string;
	readonly pid: number;
	readonly spawnId: string;
	readonly nowIso: string;
	readonly reviverId?: SessionId;
}

export function parseReviveArgs(argv: readonly string[]): Result<ReviveRequest> {
	let id: string | undefined;
	let layout: SpawnLayout | undefined;
	let json = false;
	let print = false;
	let assumeDead = false;
	let attach: string | undefined;
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index];
		if (token === "--json") {
			json = true;
			continue;
		}
		if (token === "--print") {
			print = true;
			continue;
		}
		if (token === "--assume-dead") {
			assumeDead = true;
			continue;
		}
		if (token === "--attach" || token?.startsWith("--attach=")) {
			if (token.includes("=")) {
				const value = token.slice(token.indexOf("=") + 1);
				if (value === "") return err("E-ARG", "--attach=<pane> needs a tmux pane id");
				attach = value;
				continue;
			}
			// Bare `--attach` takes the caller's own pane ($TMUX_PANE, resolved by
			// the bin). A following token is the pane ONLY when it looks like one —
			// otherwise `pij revive --attach pij-x` would eat the id.
			const next = argv[index + 1];
			if (next?.startsWith("%")) {
				attach = next;
				index++;
			} else {
				attach = "";
			}
			continue;
		}
		if (token === "--layout" || token?.startsWith("--layout=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : argv[++index];
			if (value !== "stack" && value !== "right" && value !== "below" && value !== "window") {
				return err("E-ARG", `--layout must be stack|right|below|window (got '${value ?? ""}')`);
			}
			layout = value;
			continue;
		}
		if (token?.startsWith("-")) return err("E-ARG", `unknown revive flag '${token}'`);
		if (token !== undefined && id === undefined) {
			id = token;
			continue;
		}
		return err("E-ARG", REVIVE_USAGE_LINE);
	}
	if (print && attach !== undefined) {
		return err("E-ARG", "--print renders a command; --attach binds a pane — pick one");
	}
	if (print && layout !== undefined) {
		return err("E-ARG", "--print never opens a pane, so --layout has no meaning with it");
	}
	if (attach !== undefined && layout !== undefined) {
		return err("E-ARG", "--attach binds the pane you name, so --layout has no meaning with it");
	}
	return ok({
		...(id === undefined ? {} : { id }),
		...(layout === undefined ? {} : { layout }),
		...(attach === undefined ? {} : { attach }),
		json,
		print,
		assumeDead,
	});
}

// ─── s072 D3 — is the prior attachment gone, or is it still running? ──────────

/** Verdict on the PRIOR incarnation of a seat.
 *  `live` = don't stomp it · `stale` = proven gone · `uncertain` = unproven. */
export type AttachmentLiveness = "live" | "stale" | "uncertain";

/** What tmux could tell us about the pane the descriptor recorded.
 *
 *  - `ours`      — the pane exists AND its `#{pane_pid}` still equals the pid
 *                  this seat recorded, so it really is this seat's pane.
 *  - `not-ours`  — a pane bearing that id exists, but it is running something
 *                  else. tmux numbers panes from `%0` upward in EVERY new
 *                  server, so after a reboot the old id is handed straight to an
 *                  unrelated pane. A bare `%N` match proves nothing.
 *  - `gone`      — tmux answered and there is no such pane (or the seat never
 *                  had one).
 *  - `unprobed`  — tmux could not be asked at all: no binary, or no server.
 *                  Absence of an answer is not an answer. */
export type PaneObservation = "ours" | "not-ours" | "gone" | "unprobed";

export interface AttachmentProbe {
	/** What tmux says about the descriptor's recorded pane — including whether
	 *  that pane is still OURS. See `PaneObservation`. */
	readonly pane: PaneObservation;
	/** Is the descriptor's recorded pid alive RIGHT NOW? (May be a recycled pid.) */
	readonly pidAlive: boolean;
	/** Did pij itself already OBSERVE this seat end? A recorded terminal
	 *  observation outranks a live pid: pij watched the pane or the process go,
	 *  so anything answering on that pid now is somebody else. An `unavailable`
	 *  observation proves nothing and must not be passed as true. */
	readonly terminalObserved?: boolean;
	/** Epoch ms of the host's last boot; absent when the platform can't say. */
	readonly hostBootAtMs?: number;
	/** Epoch ms of the descriptor's newest provable activity. */
	readonly lastActivityAtMs?: number;
	/** Epoch ms at which the process now holding the pane STARTED — the only
	 *  non-recycled identity signal in this probe (s072 FIX-6). Absent when the
	 *  platform could not be asked, in which case it proves nothing either way. */
	readonly paneProcessStartedAtMs?: number;
}

/** How far BEFORE a seat's newest recorded activity the pane process must have
 *  started for that pane to be read as proof of life. Anything later — including
 *  the same second — is `uncertain`.
 *
 *  ─── TOLERANCE DIRECTION (s072 FIX-7) — read before changing this number. ───
 *
 *    A TOLERANCE MAY ONLY EVER WIDEN THE UNCERTAIN BAND, NEVER THE CONFIDENT
 *    ONE. Slack, skew and fuzz exist because MEASUREMENT IS IMPRECISE, and
 *    imprecision can only ever make you LESS sure of a verdict — never more.
 *
 *  This constant's predecessor got that backwards. It was named for skew and
 *  applied on the far side of the comparison (`start <= activity + 5s`), which
 *  extended `live` FORWARD IN TIME and converted a measurement limit into
 *  manufactured certainty. The reviewer built the consequence through the real
 *  CLI (round 3): a fresh `%0` server whose pane process started at 03:30:25Z,
 *  against a matching post-boot descriptor whose newest activity was 03:30:21Z —
 *  four seconds EARLIER — returned an irrevocable `live`, ahead of
 *  `--assume-dead`. A genuinely recycled process born in that window has exactly
 *  those observable facts.
 *
 *  So the tolerance now points the other way: it is a REQUIRED LEAD, subtracted
 *  from our own evidence, and every case it cannot settle falls into `uncertain`.
 *  One second is the smallest lead `ps -o lstart=` can actually resolve — it
 *  reports whole seconds, so a process that started in the SAME second as the
 *  recorded activity is indistinguishable from one that started just after it.
 *
 *  The cost lands where it is survivable: a brand-new seat that has done nothing
 *  since it started reads `uncertain` for its first second, which is an operator
 *  `--assume-dead` away — never a corpse. Sizing this signal out of existence is
 *  the wrong fix; the right long-term fix is a DURABLE INCARNATION IDENTITY
 *  recorded at spawn (see the s072 execution log's follow-up). */
export const PANE_START_MIN_LEAD_MS = 1_000;
/** Did the host boot AFTER the seat's last recorded activity? Then no process and
 *  no pane belonging to that seat survived: a boot destroys every process on the
 *  machine, and a seat cannot have been active before an event it predates.
 *
 *  This is the one direction that is safe to read as proof of death, and it holds
 *  regardless of what any identifier says. */
function hostRebootInvalidates(probe: AttachmentProbe): boolean {
	return (
		probe.hostBootAtMs !== undefined &&
		probe.lastActivityAtMs !== undefined &&
		probe.hostBootAtMs > probe.lastActivityAtMs
	);
}

/** Is a `#{pane_pid}` match backed by evidence that did NOT come from a recycled
 *  identifier? Callers must have ruled out {@link hostRebootInvalidates} first.
 *
 *  Two acceptable backings, strongest first:
 *
 *   1. PROCESS START TIME (`ps -o lstart=`) — an absolute wall-clock instant that
 *      no allocator reuses. To corroborate, that process must have started at
 *      least {@link PANE_START_MIN_LEAD_MS} BEFORE our seat's newest recorded
 *      activity: only then is it provably the process that produced that
 *      activity. Same second or later proves nothing (the reading is rounded to
 *      whole seconds), so it falls to `uncertain` — see the tolerance-direction
 *      rule at the constant.
 *   2. BOOT EPOCH — reaching here means the host did NOT boot after our last
 *      activity, so the seat was active in the CURRENT boot epoch and the
 *      allocators have not been reset since it was recorded.
 *
 *  With neither available there is no non-recycled evidence at all, and the
 *  honest answer is `uncertain` — which `--assume-dead` can override. */
function paneIdentityCorroborated(probe: AttachmentProbe): boolean {
	if (probe.paneProcessStartedAtMs !== undefined && probe.lastActivityAtMs !== undefined) {
		return probe.paneProcessStartedAtMs <= probe.lastActivityAtMs - PANE_START_MIN_LEAD_MS;
	}
	return probe.hostBootAtMs !== undefined && probe.lastActivityAtMs !== undefined;
}

/** Classify the prior attachment (s072 D3).
 *
 *  Every identifier in this problem is RECYCLED. The OS re-issues pids from the
 *  bottom after a restart (pid 101 is a system daemon on any darwin box), and
 *  tmux re-issues pane ids from `%0` in every new server. So neither a live pid
 *  nor a live pane id means, on its own, that this seat is still running.
 *
 *  One direction is forbidden: nothing here may call a genuinely live pane dead.
 *  That is why `not-ours` stops at `uncertain` instead of falling through to the
 *  pid axis, and why `unprobed` never yields `stale` on the pid alone. The cost
 *  of over-caution is one `--assume-dead`; the cost of under-caution is stomping
 *  a live seat. */
export function classifyAttachment(probe: AttachmentProbe): AttachmentLiveness {
	// An uncorroborated pane is the reboot case. It is NOT proof of life — and it
	// is not proof of death either, so it stops here rather than falling through
	// to the pid axis, where a corroboration could wrongly declare it dead. It is
	// safe above the time evidence below precisely because it can return neither
	// `live` nor `stale`.
	if (probe.pane === "not-ours") return "uncertain";

	// ─── ORDERING DECISION (s072 FIX-6) — read before adding anything below. ───
	//
	//   A RECYCLED IDENTIFIER CAN NEVER BE CORROBORATED BY ANOTHER RECYCLED
	//   IDENTIFIER. ONLY MONOTONIC OR ABSOLUTE TIME EVIDENCE BREAKS THE TIE.
	//
	// Pane ids restart at `%0` in every new tmux server; pids restart at the
	// bottom of the range in every new kernel. Checking one against the other
	// draws both halves of the "proof" from the same well — the two agree exactly
	// when a reboot has reset both allocators, which is the case this whole
	// feature exists to survive. That is how `#{pane_pid} === descriptor.pid`
	// promoted a post-reboot stranger to an irrevocable `live` (reviewer, round
	// 2): the `ours` return sat ABOVE the boot-time evidence that already proved
	// the old process could not exist.
	//
	// So the rule this ordering encodes is: NO `live` RETURN MAY PRECEDE THE TIME
	// EVIDENCE. Anything added between here and the `ours` branch must be time
	// evidence, not identity.
	if (hostRebootInvalidates(probe)) return "stale";
	// A matching pane pid is now only as good as the non-recycled signal behind
	// it; without one the answer is `uncertain`, which `--assume-dead` overrides.
	if (probe.pane === "ours") return paneIdentityCorroborated(probe) ? "live" : "uncertain";
	if (probe.pane === "gone" && !probe.pidAlive) return "stale";
	// pij's OWN terminal observation: it watched this seat end, so whoever holds
	// that pid now is a stranger.
	if (probe.terminalObserved === true) return "stale";
	return "uncertain";
}

/** Why a seat came back `uncertain`, in the operator's terms. Every branch names
 *  the recycled identifier that made the answer unprovable. */
export function uncertaintyReason(probe: AttachmentProbe): string {
	if (probe.pane === "ours") {
		if (probe.paneProcessStartedAtMs !== undefined && probe.lastActivityAtMs !== undefined) {
			return "the pane's pid matches, but that pane's process did not start before this seat's last recorded activity (ps lstart, whole-second resolution), so it cannot be shown to be the process that produced that activity — the kernel recycled the pid, and a matching pid cannot corroborate a matching pane id, both are reissued from the bottom after a reboot";
		}
		return "the pane's pid matches, but no absolute-time evidence (host boot time, ps process start time) was available to rule out a reboot having recycled BOTH the pane id and the pid";
	}
	if (probe.pane === "not-ours") {
		return "a pane with the recorded id exists but is running a different process — tmux re-issues pane ids from %0 in every new server, so after a reboot that id is almost certainly somebody else's";
	}
	if (probe.pane === "unprobed") {
		return "tmux could not be reached, so the recorded pane could not be checked at all";
	}
	return "the recorded pane is gone but the recorded pid still answers — the OS may have recycled it";
}

// ─── s072 D1 — which seat owns this folder? ───────────────────────────────────

/** Which storage tier an answer came from. `archive` = `~/.pij/archive/`. */
export type SeatTier = "hot" | "archive";

export interface SeatCandidate {
	readonly descriptor: SessionDescriptor;
	/** The descriptor's folder AFTER realpath. Raw strings never compare safely:
	 *  worktrees, symlinked homes, and `/tmp` vs `/private/tmp` on darwin. */
	readonly resolvedFolder: string;
	readonly tier: SeatTier;
}

export interface ResolvedSeat {
	readonly descriptor: SessionDescriptor;
	readonly tier: SeatTier;
	/** True when this seat was picked because it is designated prime. */
	readonly viaPrime: boolean;
}

/** ACTIVITY, not the archival anchor (pij#204). This string is printed as "last
 *  activity" on each revive candidate and a human picks a seat off it, so it must
 *  mean activity. It previously borrowed `archiveAgeAnchorMs` — which now anchors
 *  on DEATH — and would otherwise report when a seat died as when it last worked. */
function lastActivityIso(descriptor: SessionDescriptor): string {
	const anchorMs = lastActivityAtMs(descriptor);
	return anchorMs === null ? "unknown" : new Date(anchorMs).toISOString();
}

function describeCandidate(candidate: SeatCandidate): string {
	const d = candidate.descriptor;
	const runtime = d.runtimeBin === "omp" ? "omp" : (d.harness ?? "pi");
	return `${d.id} (${runtime}, model ${d.boundModel ?? "—"}, last activity ${lastActivityIso(d)}, ${candidate.tier})`;
}

/** Resolve "which seat was driving THIS folder" (s072 D1).
 *
 *  Hot tier first, archive only as a fallback — a reboot can outlast the 48h
 *  archive window, so archived seats are in scope, but a live-tier seat for the
 *  same folder always wins. Prime beats non-prime; two primes, or two non-primes
 *  with no prime, is an E-AMBIG the operator resolves with an explicit id.
 *  Never guess. */
export function resolveSeatForFolder(
	candidates: readonly SeatCandidate[],
	resolvedFolder: string,
): Result<ResolvedSeat> {
	const here = candidates.filter((candidate) => candidate.resolvedFolder === resolvedFolder);
	const hot = here.filter((candidate) => candidate.tier === "hot");
	const pool = hot.length > 0 ? hot : here;
	if (pool.length === 0) {
		return err("E-NOID", `no pij seat is registered for folder '${resolvedFolder}'`);
	}
	const prime = pool.filter((candidate) => candidate.descriptor.prime === true);
	if (prime.length > 1) {
		return err(
			"E-AMBIG",
			`folder '${resolvedFolder}' has ${prime.length} prime seats: ${prime.map(describeCandidate).join("; ")} — pass an explicit pij id`,
		);
	}
	const chosen = prime[0] ?? (pool.length === 1 ? pool[0] : undefined);
	if (chosen === undefined) {
		return err(
			"E-AMBIG",
			`folder '${resolvedFolder}' has ${pool.length} seats and none is prime: ${pool.map(describeCandidate).join("; ")} — pass an explicit pij id`,
		);
	}
	return ok({
		descriptor: chosen.descriptor,
		tier: chosen.tier,
		viaPrime: chosen.descriptor.prime === true,
	});
}

// ─── s072 D2 — hand the launch command to the human ──────────────────────────

/** POSIX single-quote a value unless it is already shell-safe. Keeps the golden
 *  lines paste-able verbatim: no `$`, backtick, space, or quote escapes leak. */
export function shellQuote(value: string): string {
	if (value !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	return `'${value.split("'").join(`'\\''`)}'`;
}

/** `KEY=value … cmd arg arg` — the env prefix rides INLINE on the command line,
 *  because without `PIJ_SESSION_ID` the resumed seat comes back nameless and
 *  unaddressable. */
export function renderShellLine(command: SpawnCommand): string {
	const env = Object.entries(command.env).map(([key, value]) => `${key}=${shellQuote(value)}`);
	return [...env, shellQuote(command.cmd), ...command.args.map(shellQuote)].join(" ");
}

/** The one-line re-bind an externally-launched seat needs BEFORE it starts.
 *  claude/copilot/codex have no in-process pij extension, so nothing rewrites
 *  their descriptor: pasting the resume command alone brings the harness back
 *  but leaves pij pointing at the dead pane. `--attach` binds the operator's own
 *  pane to the seat first. pi/omp self-register at boot and need no such step. */
export function attachCommandLine(id: SessionId): string {
	return `pij revive ${shellQuote(id)} --attach "$TMUX_PANE"`;
}

/** Does the harness re-register itself with pij from the env alone? */
export function harnessSelfAdopts(runtime: RevivePlan["runtime"]): boolean {
	return runtime === "pi" || runtime === "omp";
}

export interface RevivePrintout {
	readonly id: SessionId;
	readonly runtime: RevivePlan["runtime"];
	readonly selfAdopts: boolean;
	/** Exactly what a human pastes into the pane they already opened. */
	readonly shellLine: string;
	/** The re-bind step alone; absent when the harness self-adopts. */
	readonly attachLine?: string;
	readonly launchLine: string;
}

export function buildRevivePrintout(plan: RevivePlan): RevivePrintout {
	const launchLine = renderShellLine(plan.command);
	const selfAdopts = harnessSelfAdopts(plan.runtime);
	const attachLine = selfAdopts ? undefined : attachCommandLine(plan.id);
	return {
		id: plan.id,
		runtime: plan.runtime,
		selfAdopts,
		launchLine,
		...(attachLine === undefined ? {} : { attachLine }),
		shellLine: attachLine === undefined ? launchLine : `${attachLine} && ${launchLine}`,
	};
}

function exactlyOne(paths: readonly string[], label: string): Result<string> {
	const unique = [...new Set(paths)];
	if (unique.length === 0) return err("E-NOREG", `${label} native session artifact is missing`);
	if (unique.length > 1) {
		return err(
			"E-AMBIG",
			`${label} native session resolves to multiple artifacts: ${unique.join(", ")}`,
		);
	}
	const path = unique[0];
	return path === undefined
		? err("E-NOREG", `${label} native session artifact is missing`)
		: ok(path);
}

function modelArgs(model?: string): string[] {
	return model === undefined ? [] : ["--model", model];
}

function effortArgs(effort?: string): string[] {
	return effort === undefined ? [] : ["--effort", effort];
}

function controlEnv(descriptor: SessionDescriptor, input: RevivePlanInput): Record<string, string> {
	return {
		PIJ_SESSION_ID: descriptor.id,
		PIJ_HARNESS: descriptor.harness ?? "pi",
		PIJ_SPAWN_ID: input.spawnId,
		...(input.parentId ? { PIJ_PARENT_ID: input.parentId } : {}),
	};
}

function piEnv(
	descriptor: SessionDescriptor,
	input: RevivePlanInput,
	runtime: "pi" | "omp",
): Record<string, string> {
	const parentId = input.parentId ?? "";
	return {
		PIJ_ANNOUNCE_TO: parentId,
		PIJ_PARENT_ID: parentId,
		PIJ_SPAWN_ID: input.spawnId,
		PIJ_ROLE: descriptor.role ?? "worker",
		PIJ_SPAWN_TASK: REVIVE_REFRAME,
		PIJ_PI_BIN: runtime,
		...(descriptor.boundModel ? { PIJ_SPAWN_MODEL: descriptor.boundModel } : {}),
		...(descriptor.boundProvider ? { PIJ_SPAWN_PROVIDER: descriptor.boundProvider } : {}),
		...(descriptor.effort ? { PIJ_SPAWN_EFFORT: descriptor.effort } : {}),
	};
}

function buildCommand(
	descriptor: SessionDescriptor,
	runtime: RevivePlan["runtime"],
	artifactPath: string,
	input: RevivePlanInput,
): SpawnCommand {
	const nativeId = descriptor.harnessSessionId ?? "";
	if (runtime === "claude") {
		return {
			cmd: "claude",
			args: [
				"--dangerously-skip-permissions",
				"--resume",
				nativeId,
				...modelArgs(descriptor.boundModel),
				...effortArgs(descriptor.effort),
			],
			env: controlEnv(descriptor, input),
		};
	}
	if (runtime === "copilot") {
		return {
			cmd: "copilot",
			args: [
				"--yolo",
				`--resume=${nativeId}`,
				...modelArgs(descriptor.boundModel),
				...effortArgs(descriptor.effort),
			],
			env: controlEnv(descriptor, input),
		};
	}
	if (runtime === "codex") {
		return {
			cmd: "codex",
			args: [
				"--dangerously-bypass-approvals-and-sandbox",
				...modelArgs(descriptor.boundModel),
				...(descriptor.effort ? ["-c", `model_reasoning_effort=${descriptor.effort}`] : []),
				"resume",
				nativeId,
			],
			env: controlEnv(descriptor, input),
		};
	}
	if (runtime === "pi") {
		const model =
			descriptor.boundModel && descriptor.effort
				? `${descriptor.boundModel}:${descriptor.effort}`
				: descriptor.boundModel;
		return {
			cmd: "pi",
			args: ["--session", artifactPath, ...(model ? ["--model", model] : [])],
			env: piEnv(descriptor, input, runtime),
		};
	}
	return {
		cmd: "omp",
		args: [
			"--auto-approve",
			`--resume=${artifactPath}`,
			...modelArgs(descriptor.boundModel),
			...(descriptor.effort ? ["--thinking", descriptor.effort] : []),
		],
		env: piEnv(descriptor, input, runtime),
	};
}

export function planRevive(
	descriptor: SessionDescriptor | null,
	artifacts: ReviveArtifacts,
	input: RevivePlanInput,
): Result<RevivePlan> {
	if (!descriptor) return err("E-NOID", "no session with that pij id");
	if (input.attachment === "live") {
		return err(
			"E-ARG",
			`session '${descriptor.id}' still has a live prior attachment; close it before reviving`,
		);
	}
	// s072 D3. `--print` mutates nothing, so it is allowed while liveness is
	// merely uncertain (the printout says so). Anything that WRITES demands proof
	// or an explicit operator override.
	if (input.attachment === "uncertain" && input.print !== true && input.assumeDead !== true) {
		const reason =
			input.attachmentReason ??
			"its prior attachment could not be proven dead — a recycled pane id or pid may be answering for it";
		return err(
			"E-ARG",
			`session '${descriptor.id}': ${reason}. Re-run with --print (safe, mutates nothing) or ` +
				"--assume-dead to override",
		);
	}
	const provenDead = input.attachment === "stale" || input.assumeDead === true;
	if (
		descriptor.lifecycle !== "dissolved" &&
		descriptor.terminal === undefined &&
		!provenDead &&
		input.print !== true
	) {
		return err(
			"E-ARG",
			`session '${descriptor.id}' has no terminal observation and its prior attachment was not proven dead`,
		);
	}
	if (!descriptor.harness || !descriptor.harnessSessionId?.trim()) {
		return err("E-NOREG", `session '${descriptor.id}' has no bound native session identity`);
	}

	let runtime: RevivePlan["runtime"];
	let artifact: Result<string>;
	if (descriptor.harness === "claude") {
		runtime = "claude";
		artifact = artifacts.claudePath
			? ok(artifacts.claudePath)
			: err("E-NOREG", "claude native session artifact is missing");
	} else if (descriptor.harness === "copilot") {
		runtime = "copilot";
		artifact = artifacts.copilotPath
			? ok(artifacts.copilotPath)
			: err("E-NOREG", "copilot native session artifact is missing");
	} else if (descriptor.harness === "codex") {
		runtime = "codex";
		artifact = exactlyOne(artifacts.codexPaths, "codex");
	} else {
		const pi = [...new Set(artifacts.piPaths)];
		const omp = [...new Set(artifacts.ompPaths)];
		if (descriptor.runtimeBin === "pi") {
			runtime = "pi";
			artifact = exactlyOne(pi, "pi");
		} else if (descriptor.runtimeBin === "omp") {
			runtime = "omp";
			artifact = exactlyOne(omp, "omp");
		} else if (pi.length === 1 && omp.length === 0) {
			runtime = "pi";
			artifact = ok(pi[0] ?? "");
		} else if (omp.length === 1 && pi.length === 0) {
			runtime = "omp";
			artifact = ok(omp[0] ?? "");
		} else if (pi.length === 0 && omp.length === 0) {
			return err(
				"E-NOREG",
				`pi-family session '${descriptor.harnessSessionId}' is absent from both Pi and OMP stores`,
			);
		} else {
			return err(
				"E-AMBIG",
				`legacy pi-family session '${descriptor.harnessSessionId}' matches both/multiple native stores`,
			);
		}
	}
	if (!artifact.ok) return artifact;
	return ok({
		id: descriptor.id,
		runtime,
		artifactPath: artifact.value,
		command: buildCommand(descriptor, runtime, artifact.value, input),
		descriptor,
	});
}

export function buildRevivedDescriptor(
	existing: SessionDescriptor,
	attachment: RevivedAttachment,
): SessionDescriptor {
	const {
		closeIntent: _closeIntent,
		terminal: _terminal,
		deathNoticeLatchedAt: _deathNoticeLatchedAt,
		failureReason: _failureReason,
		initInjectedAt: _initInjectedAt,
		lastTickAt: _lastTickAt,
		lastInboxScanAt: _lastInboxScanAt,
		compactingAt: _compactingAt,
		lastWatchdogFireAt: _lastWatchdogFireAt,
		transcriptsAtSpawn: _transcriptsAtSpawn,
		plannedHarnessSessionId: _plannedHarnessSessionId,
		windowId: _windowId,
		...durable
	} = existing;
	return {
		...durable,
		pid: attachment.pid,
		paneId: attachment.paneId,
		...(attachment.windowId ? { windowId: attachment.windowId } : {}),
		...(attachment.reviverId
			? { spawnedBy: attachment.reviverId, parentId: attachment.reviverId }
			: { spawnedBy: undefined, parentId: undefined }),
		state: "idle",
		systemState: "starting",
		lifecycle: "pending",
		spawnId: attachment.spawnId,
		plannedHarnessSessionId: existing.harnessSessionId,
		revivePendingAt: attachment.nowIso,
	};
}
