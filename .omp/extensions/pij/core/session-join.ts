// pij-cli — the telemetry join-tuple projection (pure, Plan 031).
//
// Feature #1 is a PROJECTION, not new capture: every join key the fleet-telemetry
// consumer needs — `harnessSessionId` (+ `harness`/`transcriptPath`/`boundModel`/
// `spawnedBy`/`lifecycle`) — is already persisted per peer on bind (Finding 01).
// `buildSessionJoinRows` distils a registry `SessionDescriptor[]` down to that
// stable, telemetry-focused tuple so `pij sessions` emits a clean contract
// instead of the fleet globbing raw descriptor JSON (Finding 05).
//
// Contract (AC-1): `pijId`, `harness`, `harnessSessionId` are ALWAYS present —
// `null` when unbound/absent. The remaining fields are OMITTED when absent (never
// invented, never `null`) so a consumer can distinguish "no value" from "the key
// exists but is null".

import type { HarnessKind, SessionDescriptor, SessionId, SessionLifecycle } from "./types.js";

/** One row of the `pij sessions` join table — the harness↔pij telemetry tuple. */
export interface JoinRow {
	readonly pijId: SessionId;
	/** The harness this peer runs, or `null` for a legacy/untagged session. */
	readonly harness: HarnessKind | null;
	/** The harness-native session id bound to this pij-id, or `null` if unbound. */
	readonly harnessSessionId: string | null;
	/** Codex only: absolute rollout `*.jsonl` path. Omitted for other harnesses. */
	readonly transcriptPath?: string;
	/** Model reported by the harness footer, once captured. Omitted until known. */
	readonly boundModel?: string;
	/** The pij-id of the session that spawned this one. Omitted for operator spawns. */
	readonly spawnedBy?: SessionId;
	/** Structural tree parent. Explicit root is retained as `null`; absence is omitted. */
	readonly parentId?: SessionId | null;
	/** Canonical repository identity shared by linked worktrees. */
	readonly gitCommonDir?: string;
	/** Current-prime projection is always explicit for consumers. */
	readonly prime: boolean;
	/** Retired-prime projection is always explicit for consumers. */
	readonly oldPrime: boolean;
	/** Spawn→bind lifecycle. Omitted for a session that never went through spawn. */
	readonly lifecycle?: SessionLifecycle;
}

/** Project registry descriptors to the join tuple (pure). Order is preserved so
 *  the caller controls sort/filter. Absent optional fields are omitted, not
 *  nulled — only `harness`/`harnessSessionId` carry an explicit `null`. */
export function buildSessionJoinRows(descriptors: readonly SessionDescriptor[]): JoinRow[] {
	return descriptors.map((d) => ({
		pijId: d.id,
		harness: d.harness ?? null,
		harnessSessionId: d.harnessSessionId ?? null,
		...(d.transcriptPath !== undefined ? { transcriptPath: d.transcriptPath } : {}),
		...(d.boundModel !== undefined ? { boundModel: d.boundModel } : {}),
		...(d.spawnedBy !== undefined ? { spawnedBy: d.spawnedBy } : {}),
		...(d.parentId !== undefined ? { parentId: d.parentId } : {}),
		...(d.gitCommonDir !== undefined ? { gitCommonDir: d.gitCommonDir } : {}),
		prime: d.prime === true,
		oldPrime: d.oldPrime === true,
		...(d.lifecycle !== undefined ? { lifecycle: d.lifecycle } : {}),
	}));
}

/** Single-quote a value for a POSIX `eval`-safe assignment: wrap in `'…'` and
 *  render any embedded single quote as the canonical `'\''` break-out. pij ids
 *  are alnum+hyphen (no metacharacters), so this is belt-and-braces. */
function shQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Build the eval-able self-identity block for `pij adopt --export` / `pij whoami
 *  --env` (AC-5). `export PIJ_SESSION_ID=<id>` always; `PIJ_PARENT_ID` and
 *  `PIJ_ROLE` are added only when the descriptor carries them. This is ergonomic
 *  SUGAR (repairs pij self-resolution in the adopted shell + tags future
 *  children) — NOT the telemetry fix (it cannot retro-tag the running process;
 *  Finding 04). Every value is shell-quoted so the whole block is safe to `eval`. */
export function buildExportLines(descriptor: SessionDescriptor): string {
	const lines = [`export PIJ_SESSION_ID=${shQuote(descriptor.id)}`];
	const parentId =
		descriptor.parentId !== undefined ? descriptor.parentId : (descriptor.spawnedBy ?? null);
	if (parentId) lines.push(`export PIJ_PARENT_ID=${shQuote(parentId)}`);
	if (descriptor.role) lines.push(`export PIJ_ROLE=${shQuote(descriptor.role)}`);
	return lines.join("\n");
}
