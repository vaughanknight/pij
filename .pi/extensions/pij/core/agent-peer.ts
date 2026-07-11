// pij-control-plane — agent-pack-as-peer planning (Plan 029 Phase 3).
//
// Pure planning helpers for `pij agent spawn` / `pij agent report`, sibling of
// core/spawn.ts and core/close.ts. These decide env, permissions posture,
// lifecycle, and once-close — plus the injectable spawn/report orchestration
// (`prepareAgentSpawn` / `finalizeAgentSpawn` / `executeAgentReport`) whose only
// impure edges are the injected ports (registry/channel) + the bin's tmux split.
// This file is NOT under core/agents/ (the import-boundary sensor bars
// descriptor/channel types there); it needs the SessionDescriptor vocabulary, so
// it lives alongside the other control-plane pure cores.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "minih/runner";
import { coerceParams, type ParsedAgentCommand } from "./agents/cli-args.js";
import { parsePackMeta } from "./agents/pack.js";
import { renderPeerPacket } from "./agents/peer-packet.js";
import { validateReport } from "./agents/report.js";
import type { DiscoveredAgent } from "./agents/types.js";
import type { DeliveryPort, RegistryPort } from "./ports.js";
import { buildPendingDescriptor } from "./spawn.js";
import type { HarnessKind, SessionDescriptor, SessionId } from "./types.js";

// ─── env ─────────────────────────────────────────────────────────────────────

/**
 * Extend a spawn env with `PIJ_AGENT_CWD` so the pack's own shell can reach the
 * project it must operate on. A daemon-bound harness runs the pack in its pane's
 * cwd, but pack instructions (e.g. flowspace-search) read `$PIJ_AGENT_CWD` to
 * locate the repo's fs2 graph — the same variable the one-shot run path exports
 * (cli.ts agentDeps). `PIJ_SESSION_ID`/`PIJ_HARNESS`/`PIJ_PARENT_ID` already ride
 * the base env from `buildControlSpawnCommand`; this only adds the cwd pointer.
 */
export function buildAgentPeerEnv(
	base: Record<string, string>,
	opts: { agentCwd?: string },
): Record<string, string> {
	return {
		...base,
		...(opts.agentCwd ? { PIJ_AGENT_CWD: opts.agentCwd } : {}),
	};
}

// ─── permissions posture (KF-09) ──────────────────────────────────────────────

/** The subset of a pack's frontmatter permissions this planner reasons about. */
export interface PeerPackPermissions {
	readonly preset?: string;
}

/** The pack-meta facts the peer planner reads (a superset-safe view of minih's
 *  frontmatter + the pij-only `lifecycle` key). */
export interface PeerPackMeta {
	readonly permissions?: PeerPackPermissions;
	/** The pij-only `lifecycle:` frontmatter value (`once` | `resident`), extracted
	 *  via {@link extractLifecycle}. Absent ⇒ no frontmatter lifecycle. */
	readonly lifecycle?: string;
}

/**
 * One loud advisory line when a pack declares a permissions preset — because a
 * daemon-bound peer runs FULLY permissioned regardless (KF-09: there is no human
 * at the pane to answer a harness permission prompt, so a scoped preset would hang
 * the peer the instant it ran a tool). The preset is honoured only by the one-shot
 * `pij agent run` path. Returns `null` when the pack declares no preset (the common
 * case), so the bin prints the advisory exactly once and only when relevant.
 */
export function permissionsAdvisory(meta: PeerPackMeta): string | null {
	const preset = meta.permissions?.preset;
	if (!preset) return null;
	return (
		`⚠️  pack declares permissions preset '${preset}', but a daemon-bound peer runs fully ` +
		"permissioned (no human at the pane to approve tool prompts — KF-09). The preset is " +
		"ignored for `spawn`; use `pij agent run` if you need scoped permissions."
	);
}

// ─── lifecycle (D3) ────────────────────────────────────────────────────────────

/** Extract the pij-only `lifecycle: <value>` from a prompt.md's LEADING frontmatter
 *  block only (the `harness`-key precedent in pack.ts — minih neither emits nor
 *  validates it, so it is read via a separate regex, never written back). A
 *  `lifecycle:` line in the markdown body is ignored. Returns the trimmed value or
 *  `undefined`. */
export function extractLifecycle(content: string): string | undefined {
	const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const body = block?.[1];
	if (!body) return undefined;
	const line = body.split(/\r?\n/).find((l) => /^lifecycle\s*:/.test(l));
	if (!line) return undefined;
	const value = line
		.replace(/^lifecycle\s*:/, "")
		.trim()
		.replace(/^["']|["']$/g, "");
	return value.length > 0 ? value : undefined;
}

/**
 * Resolve a spawn's lifecycle with `flag > frontmatter > resident` precedence
 * (workshop 003 D3): `--once` always wins; else a pack `lifecycle: once`; else
 * resident (the default — a peer stays open for `pij send` follow-ups). Only the
 * literal `once` opts into auto-close; any other frontmatter value is resident.
 */
export function lifecycleFor(cmd: { once: boolean }, meta: PeerPackMeta): "resident" | "once" {
	if (cmd.once) return "once";
	if (meta.lifecycle === "once") return "once";
	return "resident";
}

// ─── once-close latch (AC-16) ─────────────────────────────────────────────────

/**
 * Should the daemon close this peer's pane now? True only for a `once`-mode peer
 * that has already pushed a report (`agentOnce && reportedAt`). The report is
 * durable in the spawner's inbox before `reportedAt` is stamped (T007), so closing
 * the reporter's pane never loses the report. A resident peer (or a once peer that
 * hasn't reported yet) is left untouched. Pure — the daemon does the killPane +
 * registry.remove (T008).
 */
export function planOnceClose(d: SessionDescriptor): boolean {
	return d.agentOnce === true && typeof d.reportedAt === "string" && d.reportedAt.length > 0;
}

// ─── spawn orchestration (T006 / AC-14) ───────────────────────────────────────

/** The daemon-bound harnesses a pack can spawn as (pi self-registers, so it is
 *  never a peer-pack harness). Agent spawn is always daemon-driven. */
const CONTROL_HARNESSES: ReadonlySet<string> = new Set<HarnessKind>(["claude", "copilot", "codex"]);

/** Structured spawn-prepare failures, rendered by the bin via `renderAgentError`. */
export type AgentSpawnError =
	| { code: "E-NOAGENT"; slug: string }
	| { code: "E-BADINPUT"; errors: string[] }
	| { code: "E-NOADAPTER"; harness: string };

/** Everything the bin needs to launch + record a pack peer, computed WITHOUT any
 *  tmux/registry side effect so a bad input never opens a pane (AC-14). */
export interface AgentSpawnPlan {
	readonly id: SessionId;
	/** Pack slug, or `"inline"` for a `--prompt` spawn. */
	readonly slug: string;
	/** Resolved pack dir (discovered dir, or `~/.pij/<id>/pack/` for inline). */
	readonly packDir: string;
	readonly harness: HarnessKind;
	readonly model?: string;
	readonly effort?: string;
	readonly lifecycle: "resident" | "once";
	/** The permissions advisory to print once on stderr (`null` ⇒ none). */
	readonly advisory: string | null;
	/** The rendered first-turn packet (written to `~/.pij/<id>/packet.md`). */
	readonly packetContent: string;
	/** Raw `output-schema.json` to copy to `~/.pij/<id>/output-schema.json`, if any. */
	readonly outputSchemaJson?: string;
	readonly params: Record<string, unknown>;
	readonly spawnedBy?: SessionId;
}

export type AgentSpawnPrepareResult =
	| { ok: true; plan: AgentSpawnPlan }
	| { ok: false; error: AgentSpawnError };

export interface AgentSpawnPrepareInput {
	readonly cmd: ParsedAgentCommand;
	/** Pre-allocated pij id (the bin mints it before the pane exists). */
	readonly id: SessionId;
	/** The resolved caller (stamped as `spawnedBy`), or undefined when unresolved. */
	readonly spawnedBy?: SessionId;
}

export interface AgentSpawnPrepareDeps {
	readonly pijHome: string;
	/** Project cwd — used for `PIJ_AGENT_CWD` and the inline pack dir root. */
	readonly cwd: string;
	/** The merged 3-tier discovery (project→user→builtin) — injected for testability. */
	readonly discover: () => DiscoveredAgent[];
	/** minih `validateInput(schemaPath, params)` — fail-fast BEFORE any spawn. */
	readonly validateInput: (
		schemaPath: string,
		params: Record<string, unknown>,
	) => { valid: boolean; errors: string[] };
	/** Model id → harness (unknown ⇒ undefined). */
	readonly harnessForModel: (model?: string) => string | undefined;
	/** Harness pij falls back to when the pack/model implies none (e.g. `"claude"`). */
	readonly defaultHarness: string;
}

/** Resolve the pack for a spawn: a named slug via discovery, or a synthesized
 *  inline pack (`--prompt`) written under `~/.pij/<id>/pack/`. */
function resolveSpawnPack(
	input: AgentSpawnPrepareInput,
	deps: AgentSpawnPrepareDeps,
): { slug: string; dir: string } | { error: AgentSpawnError } {
	const { cmd, id } = input;
	const inline = cmd.prompt !== undefined || cmd.promptStdin;
	if (inline) {
		const dir = join(deps.pijHome, id, "pack");
		mkdirSync(dir, { recursive: true });
		// minih requires a non-empty frontmatter description or the pack is silently
		// skipped (inline.ts precedent); synthesize one, prompt body is the task.
		writeFileSync(
			join(dir, "prompt.md"),
			`---\ndescription: Inline pij agent peer.\n---\n${cmd.prompt ?? ""}`,
		);
		return { slug: "inline", dir };
	}
	const slug = cmd.slug as string;
	const agent = deps.discover().find((a) => a.slug === slug && !a.shadowed);
	if (!agent) return { error: { code: "E-NOAGENT", slug } };
	return { slug: agent.slug, dir: agent.dir };
}

/**
 * Prepare an `agent spawn` WITHOUT any tmux/registry side effect: resolve the
 * pack, AJV-validate `-p` input against the pack's `input-schema.json` (fail fast
 * → E-BADINPUT so no pane opens, AC-14), derive harness/model/effort, compute the
 * permissions advisory + lifecycle, and render the peer packet. The bin then does
 * the impure split and hands the pane back to {@link finalizeAgentSpawn}.
 */
export function prepareAgentSpawn(
	input: AgentSpawnPrepareInput,
	deps: AgentSpawnPrepareDeps,
): AgentSpawnPrepareResult {
	const { cmd } = input;
	const resolved = resolveSpawnPack(input, deps);
	if ("error" in resolved) return { ok: false, error: resolved.error };
	const { slug, dir } = resolved;

	const promptRaw = readFileSync(join(dir, "prompt.md"), "utf8");
	const meta = parsePackMeta(promptRaw);
	const fm = parseFrontmatter(promptRaw);
	const params = coerceParams(cmd.params);

	// Fail-fast input validation — BEFORE deriving anything spawn-side (AC-14).
	const inputSchemaPath = join(dir, "input-schema.json");
	if (existsSync(inputSchemaPath)) {
		const res = deps.validateInput(inputSchemaPath, params);
		if (!res.valid) return { ok: false, error: { code: "E-BADINPUT", errors: res.errors } };
	}

	const model = cmd.model ?? meta.model;
	const effort = cmd.effort ?? meta.reasoning;
	const harnessName =
		cmd.harness ?? meta.harness ?? deps.harnessForModel(model) ?? deps.defaultHarness;
	if (!CONTROL_HARNESSES.has(harnessName)) {
		return { ok: false, error: { code: "E-NOADAPTER", harness: harnessName } };
	}
	const harness = harnessName as HarnessKind;

	const lifecycle = lifecycleFor(cmd, {
		lifecycle: extractLifecycle(promptRaw),
		...(fm.permissions ? { permissions: fm.permissions } : {}),
	});
	const advisory = permissionsAdvisory(fm.permissions ? { permissions: fm.permissions } : {});
	const packetContent = renderPeerPacket({ slug, dir }, params);
	const schemaPath = join(dir, "output-schema.json");
	const outputSchemaJson = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : undefined;

	return {
		ok: true,
		plan: {
			id: input.id,
			slug,
			packDir: dir,
			harness,
			...(model !== undefined ? { model } : {}),
			...(effort !== undefined ? { effort } : {}),
			lifecycle,
			advisory,
			packetContent,
			...(outputSchemaJson !== undefined ? { outputSchemaJson } : {}),
			params,
			...(input.spawnedBy !== undefined ? { spawnedBy: input.spawnedBy } : {}),
		},
	};
}

/** The pane + binding facts the bin's tmux split hands back for descriptor write. */
export interface AgentSpawnPaneInfo {
	readonly paneId: string;
	readonly panePid: number;
	readonly dataDir: string;
	readonly eventsPath: string;
	readonly startedAtIso: string;
	/** Claude/codex only: transcript snapshot at spawn (deterministic discovery). */
	readonly transcriptsAtSpawn?: readonly string[];
	/** Copilot only: the chosen session UUID (deterministic bind). */
	readonly plannedHarnessSessionId?: string;
}

export interface AgentSpawnFinalizeDeps {
	readonly pijHome: string;
	readonly registry: RegistryPort;
	readonly channel: DeliveryPort;
	readonly cwd: string;
}

/** The pointer message body delivered to a freshly-spawned peer's inbox. The
 *  daemon injects it as the peer's first turn AFTER bind; it points at the packet
 *  file (never the whole body — flow-pair discipline) so the peer reads + follows
 *  it. Exported for the report round-trip test + doc parity. */
export function packetPointerBody(packetPath: string): string {
	return (
		"📦 You were spawned as a pij agent peer. Your full briefing is the packet file below — " +
		`read it and follow it now:\n\n    ${packetPath}\n\n` +
		"Run `cat` on that path to read it, do the task, then report exactly as its **Reporting** " +
		"section says."
	);
}

/**
 * Record a spawned pack peer AFTER the bin opened its pane: write the pending
 * descriptor (with the agent fields + control-plane binding fields), copy the
 * pack's output schema to `~/.pij/<id>/output-schema.json` (so `pij agent report`
 * can validate against it independent of the pack dir), write the packet to
 * `~/.pij/<id>/packet.md`, and deliver a short pointer message to the new peer's
 * inbox — it persists and the daemon injects it on the first drainInbox after bind
 * (AC-14). `agentOnce` is derived from the plan's lifecycle (never the raw flag),
 * so a frontmatter `lifecycle: once` is honoured.
 */
export function finalizeAgentSpawn(
	plan: AgentSpawnPlan,
	pane: AgentSpawnPaneInfo,
	deps: AgentSpawnFinalizeDeps,
): { id: SessionId; packetPath: string } {
	const base = buildPendingDescriptor({
		pijId: plan.id,
		paneId: pane.paneId,
		cwd: deps.cwd,
		harness: plan.harness,
		dataDir: pane.dataDir,
		eventsPath: pane.eventsPath,
		pid: pane.panePid,
		startedAtIso: pane.startedAtIso,
		...(plan.spawnedBy ? { spawnedBy: plan.spawnedBy } : {}),
		...(pane.transcriptsAtSpawn ? { transcriptsAtSpawn: pane.transcriptsAtSpawn } : {}),
		...(pane.plannedHarnessSessionId
			? { plannedHarnessSessionId: pane.plannedHarnessSessionId }
			: {}),
		...(plan.model !== undefined ? { model: plan.model } : {}),
		...(plan.effort !== undefined ? { effort: plan.effort } : {}),
	});
	const descriptor: SessionDescriptor = {
		...base,
		agentPack: plan.slug,
		agentPackDir: plan.packDir,
		agentOnce: plan.lifecycle === "once",
	};
	deps.registry.write(descriptor);

	const dataHome = join(deps.pijHome, plan.id);
	mkdirSync(dataHome, { recursive: true });
	if (plan.outputSchemaJson !== undefined) {
		writeFileSync(join(dataHome, "output-schema.json"), plan.outputSchemaJson);
	}
	const packetPath = join(dataHome, "packet.md");
	writeFileSync(packetPath, plan.packetContent);

	// The pointer persists in the new peer's inbox; the daemon injects it as the
	// first turn once the peer is bound + owned (daemon.ts drainInbox).
	deps.channel.deliver({
		from: plan.spawnedBy ?? plan.id,
		to: plan.id,
		body: packetPointerBody(packetPath),
	});

	return { id: plan.id, packetPath };
}

// ─── report orchestration (T007 / AC-15) ──────────────────────────────────────

/** Structured report failures — all exit 1; the bin prints `message` (+ `errors`
 *  for the AJV lines) on stderr and delivers NOTHING on failure. */
export type AgentReportError =
	| { code: "E-NOID"; message: string }
	| { code: "E-NOREPORTTARGET"; message: string }
	| { code: "E-BADREPORT"; message: string; errors: string[] };

export type AgentReportResult =
	| { ok: true; to: SessionId }
	| { ok: false; error: AgentReportError };

export interface AgentReportDeps {
	readonly pijHome: string;
	readonly registry: RegistryPort;
	readonly channel: DeliveryPort;
	readonly now: () => number;
}

/**
 * Push a validated report from a spawned peer to its spawner (AC-15). Resolve the
 * caller's own descriptor (`self` comes from `PIJ_SESSION_ID` via `resolveSelf` in
 * the bin), read its `spawnedBy` (the report target), validate the payload against
 * `~/.pij/<self>/output-schema.json` via {@link validateReport} — an INVALID report
 * is rejected with the AJV lines and NOTHING is delivered — then deliver the report
 * to the spawner's inbox and stamp `reportedAt` on the peer's own descriptor.
 * Repeatable: a second call re-delivers and re-stamps (each re-task can report).
 */
export function executeAgentReport(
	self: SessionId,
	payload: unknown,
	deps: AgentReportDeps,
): AgentReportResult {
	const descriptor = deps.registry.read(self);
	if (!descriptor) {
		return {
			ok: false,
			error: {
				code: "E-NOID",
				message: `no descriptor for '${self}' — pij agent report must run inside a spawned pack pane`,
			},
		};
	}
	const to = descriptor.spawnedBy;
	if (!to) {
		return {
			ok: false,
			error: {
				code: "E-NOREPORTTARGET",
				message: `'${self}' has no spawner to report to (not a spawned agent peer)`,
			},
		};
	}

	const schemaPath = join(deps.pijHome, self, "output-schema.json");
	const schemaJson = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : undefined;
	const validation = validateReport(payload, schemaJson);
	if (!validation.valid) {
		return {
			ok: false,
			error: {
				code: "E-BADREPORT",
				message: `report failed the pack's output-schema.json — nothing delivered to ${to}`,
				errors: validation.errors,
			},
		};
	}

	deps.channel.deliver({
		from: self,
		to,
		body: `📋 agent report from ${self}:\n\n${JSON.stringify(payload, null, 2)}`,
	});
	deps.registry.write({ ...descriptor, reportedAt: new Date(deps.now()).toISOString() });
	return { ok: true, to };
}
