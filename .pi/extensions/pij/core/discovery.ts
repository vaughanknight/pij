// pij-messaging — peer discovery + self-resolution (pure).

import { err, ok, type Result, type SessionDescriptor, type SessionId } from "./types.js";

/** Derive this session's stable pij id from pi's own session identity.
 *
 *  pi mints a fresh session id on `/new` and `/fork`, but keeps it stable across
 *  `/reload` and `/resume` — exactly pij's desired identity semantics (a `/new`
 *  session is a NEW peer; a `/reload` is the SAME peer). Keying the id off the
 *  pi session id therefore fixes "`/new` keeps the same `pij-` id" (D-041),
 *  which the old `pij-${pid}` scheme could not: `/new` reuses the OS process, so
 *  the pid never changes.
 *
 *  Falls back to the OS `pid` when pi does not surface a session id (SDK / test
 *  contexts), preserving the legacy id shape so nothing downstream breaks. */
export function deriveSelfId(piSessionId: string | undefined, pid: number): SessionId {
	const slug = sessionSlug(piSessionId);
	return slug ? `pij-${slug}` : `pij-${pid}`;
}

/** Short, stable, low-collision token for a pi session id. Uses FNV-1a (32-bit)
 *  → base36 so the token is deterministic across `/reload` (same input → same
 *  output) and well-distributed regardless of the id's internal structure. */
function sessionSlug(piSessionId: string | undefined): string | null {
	if (!piSessionId || piSessionId.trim() === "") return null;
	let h = 0x811c9dc5;
	for (let i = 0; i < piSessionId.length; i++) {
		h ^= piSessionId.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

/** True when this pi process was spawned as a SUBAGENT CHILD by pi-subagents.
 *  Such children run `pi --mode json -p "<task>"`, so pij MUST NOT activate:
 *  its session_start announce is a `sendUserMessage` (a turn-triggering prompt)
 *  that races the child's `-p` task prompt and throws
 *  "Agent is already processing" in the pi SDK (agent-session.ts) — which is
 *  exactly what breaks the subagent tool. A throwaway child is also never a
 *  real peer, so it should not register in the ~/.pij registry either.
 *  Signal: pi-subagents sets PI_SUBAGENT_CHILD=1 and PI_SUBAGENT_DEPTH>=1. */
export function isSubagentChild(env: {
	readonly PI_SUBAGENT_CHILD?: string;
	readonly PI_SUBAGENT_DEPTH?: string;
}): boolean {
	if (env.PI_SUBAGENT_CHILD === "1") return true;
	const depth = Number(env.PI_SUBAGENT_DEPTH ?? "0");
	return Number.isFinite(depth) && depth > 0;
}

/** Descriptors running in a given project folder (spec AC-1, `pij list --here`). */
export function filterByFolder(
	descriptors: readonly SessionDescriptor[],
	folder: string,
): SessionDescriptor[] {
	return descriptors.filter((d) => d.folder === folder);
}

/** Drop this session from a peer list (a session never messages itself). */
export function excludeSelf(
	descriptors: readonly SessionDescriptor[],
	selfId: SessionId,
): SessionDescriptor[] {
	return descriptors.filter((d) => d.id !== selfId);
}

/** Resolve "which session am I" when parent + worker share a cwd (finding 07).
 *  Precedence:
 *    1. PIJ_SESSION_ID env value wins (exported by the extension at boot);
 *    2. else, if exactly one local descriptor exists, use it;
 *    3. else, if `$TMUX_PANE` matches exactly one descriptor's paneId, use it
 *       (an adopted/spawned control-plane session records its pane, so sends
 *       from that pane "just work" with no export — control-plane feedback #1);
 *    4. else E-AMBIG, with an actionable message (candidate ids + the fix).
 *  `envId` is the injected env value (undefined/empty when unset); `paneId` is
 *  `$TMUX_PANE` (undefined when not in tmux). */
export function resolveSelf(
	envId: string | undefined,
	localDescriptors: readonly SessionDescriptor[],
	paneId?: string,
): Result<SessionId> {
	if (envId && envId.trim() !== "") {
		return ok(envId);
	}
	if (localDescriptors.length === 1) {
		const only = localDescriptors[0];
		if (only) return ok(only.id);
	}
	if (paneId && paneId.trim() !== "") {
		const byPane = localDescriptors.filter((d) => d.paneId === paneId);
		const first = byPane[0];
		if (byPane.length === 1 && first) return ok(first.id);
	}
	if (localDescriptors.length === 0) {
		return err("E-AMBIG", "cannot resolve self: no local session and PIJ_SESSION_ID unset");
	}
	const ids = localDescriptors.map((d) => d.id);
	const hint = ids[0] ?? "<id>";
	return err(
		"E-AMBIG",
		`cannot resolve self among ${ids.length} local sessions: ${ids.join(", ")}. ` +
			`Set who you are — \`export PIJ_SESSION_ID=${hint}\` — or run ` +
			`\`pij adopt "$TMUX_PANE" --harness <h>\` so this pane resolves itself.`,
	);
}
