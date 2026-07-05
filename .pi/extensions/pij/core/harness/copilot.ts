// pij-control-plane — GitHub Copilot CLI harness transport (pure, Plan 019 ext).
//
// Copilot differs from Claude in two ways the control plane exploits:
//
//   1. Identity is CHOSEN, not discovered. `copilot --session-id <uuid>` SETS a
//      NEW session's UUID, so the daemon binds deterministically to the id pij
//      passed at spawn — no new-path race, no phonehome needed to bind (contrast
//      claude.ts `discoverNewTranscript`). The chosen id rides the descriptor as
//      `plannedHarnessSessionId` and becomes `harnessSessionId` on bind.
//
//   2. The transcript is a per-session JSONL written LIVE, like Claude's — but at
//      a DIFFERENT path and shape. Copilot streams every event to
//      `~/.copilot/session-state/<uuid>/events.jsonl` the instant it happens. The
//      sqlite `session-store.db` `turns` table is NOT a tail source: it persists
//      `assistant_response` lazily (still null while the pane shows the reply).
//
// All impure parts (reading the file, send-keys, timers) live in the daemon/bin;
// `pij tail` reuses the exact claude file-tail loop, swapping path + summarizer.

import type { TranscriptEntry } from "./claude.js";

/** Canonical 8-4-4-4-12 UUID matcher (a copilot session-state dir IS a uuid). */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Absolute root of copilot's session-state tree: `~/.copilot/session-state`.
 *  Each immediate child is a session dir named by its UUID. GLOBAL — every cwd's
 *  sessions live here (unlike claude's per-cwd project dir). */
export function copilotStateRoot(home: string): string {
	return `${home}/.copilot/session-state`;
}

/** One `~/.copilot/session-state` child dir: its UUID name + mtime. */
export interface CopilotSessionDir {
	readonly name: string;
	readonly mtimeMs: number;
}

/** Adopt-resolution for a COPILOT orchestrator (finding 02b): the harness session
 *  id is the newest `~/.copilot/session-state/<uuid>` dir by mtime (dir-name =
 *  uuid), a pane-start-time proxy. This is NEW code, NOT a reuse of
 *  `transcriptLayout('copilot')` (which is the inert CLAUDE_LAYOUT that would
 *  mis-bind a copilot adopt to the newest *claude* stem in the cwd). Non-uuid
 *  entries (`.DS_Store`, stray files) are ignored; returns `null` when no uuid
 *  dir exists — the caller then writes `pending` (never a wrong-harness id).
 *  Pure: the impure readdir+stat is injected via `listState`. */
export function copilotSessionStateScan(
	listState: (root: string) => readonly CopilotSessionDir[],
	home: string,
): string | null {
	const dirs = listState(copilotStateRoot(home))
		.filter((d) => UUID_RE.test(d.name))
		.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return dirs[0]?.name ?? null;
}

/** Absolute live event-stream file for a bound Copilot session (`pij tail`):
 *  `~/.copilot/session-state/<harnessSessionId>/events.jsonl`. The session id is
 *  the UUID pij chose at spawn (`--session-id`), so this path is known the moment
 *  the session is bound — no discovery. */
export function sessionEventsPath(home: string, harnessSessionId: string): string {
	return `${home}/.copilot/session-state/${harnessSessionId}/events.jsonl`;
}

/** One human-readable line distilled from a raw Copilot `events.jsonl` line, or
 *  `null` for lines that carry no conversational signal (session/system/turn
 *  markers, empty system injections). Mirrors `summarizeTranscriptLine` so
 *  `pij tail` renders claude + copilot identically (`[role] text`, tools `⚙ name`). */
export function summarizeCopilotEvent(raw: string): TranscriptEntry | null {
	let d: { type?: string; data?: unknown };
	try {
		d = JSON.parse(raw);
	} catch {
		return null;
	}
	const data = (d.data ?? {}) as {
		content?: unknown;
		toolRequests?: unknown;
	};
	if (d.type === "user.message") {
		// `content` is the clean user text; `transformedContent` (skipped) bolts on
		// system reminders. Empty content = a deferred-tool/system injection — drop it.
		const text = typeof data.content === "string" ? data.content.trim() : "";
		return text ? { role: "user", text } : null;
	}
	if (d.type === "assistant.message") {
		const parts: string[] = [];
		if (typeof data.content === "string" && data.content.trim()) parts.push(data.content.trim());
		if (Array.isArray(data.toolRequests)) {
			for (const tr of data.toolRequests) {
				const name = (tr as { name?: string })?.name;
				if (name) parts.push(`⚙ ${name}`);
			}
		}
		const text = parts.join(" ").replace(/\s+/g, " ").trim();
		return text ? { role: "assistant", text } : null;
	}
	return null;
}
