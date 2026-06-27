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
