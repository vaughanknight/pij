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

import type { Role } from "./types.js";

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

/** Output of buildSpawnCommand — passed to TmuxPort.newWindow. */
export interface SpawnCommand {
	readonly cmd: "pi";
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
