// pij-control-plane — harness-selected transcript LAYOUT (pure, Plan 022).
//
// The daemon's discovery bind (`loop.ts`) and the bin's spawn snapshot (`cli.ts`)
// were claude-hardcoded: `transcriptDir` (cwd-scoped), a FLAT listing, and a
// STEM session id (Finding 03/07). Codex differs on all three — a global
// date-nested dir, a recursive listing, and a trailing-UUID id (Finding 02/06).
// This selector lifts those three decisions behind one `transcriptLayout(harness)`
// so the discovery path is written ONCE and parameterised by harness; the claude
// layout is exactly today's behaviour (byte-unchanged), so claude/copilot bind is
// untouched. Only `codex` flips to the codex variants.
//
// `list` takes an injected {flat, deep} listing (the impure readdir lives in the
// daemon/bin adapters) so the layout itself stays pure + unit-testable.

import { transcriptDir, transcriptSessionId } from "./claude.js";
import { codexSessionIdFromPath, codexTranscriptRoot } from "./codex.js";
import type { HarnessKind } from "./types.js";

/** Injected directory listing the layout uses (impure readdir lives in adapters):
 *  - `flat(dir)` — `*.jsonl` directly IN `dir` (claude's project dir).
 *  - `deep(dir)` — `*.jsonl` ANYWHERE under `dir` (codex's date tree). */
export interface TranscriptListing {
	flat(dir: string): string[];
	deep(dir: string): string[];
}

/** The three harness-specific transcript decisions the discovery bind needs. */
export interface TranscriptLayout {
	/** Directory to snapshot at spawn + poll for the new transcript. Claude:
	 *  cwd-scoped (`~/.claude/projects/<mangled cwd>`). Codex: the GLOBAL sessions
	 *  root (cwd is recorded inside the file, not the path). */
	dir(home: string, cwd: string): string;
	/** All transcript `*.jsonl` paths under `dir` — FLAT for claude (its dir also
	 *  holds nested sub-session jsonl that must NOT be listed), DEEP for codex. */
	list(listing: TranscriptListing, dir: string): string[];
	/** The harnessSessionId for a discovered transcript — claude's STEM, codex's
	 *  trailing UUID (Finding 06). */
	sessionIdOf(path: string): string;
}

/** Claude/copilot/pi layout = TODAY's behaviour (cwd-scoped dir, flat listing,
 *  stem id). copilot/pi never actually discover (they bind on a planned id), so
 *  this is just the inert default for them. */
const CLAUDE_LAYOUT: TranscriptLayout = {
	dir: (home, cwd) => transcriptDir(home, cwd),
	list: (listing, dir) => listing.flat(dir),
	sessionIdOf: (path) => transcriptSessionId(path),
};

/** Codex layout = date-nested GLOBAL dir, recursive listing, trailing-UUID id. */
const CODEX_LAYOUT: TranscriptLayout = {
	dir: (home, _cwd) => codexTranscriptRoot(home),
	list: (listing, dir) => listing.deep(dir),
	sessionIdOf: (path) => codexSessionIdFromPath(path),
};

/** Select the transcript layout for a harness (Plan 022). Only `codex` diverges;
 *  every other harness gets the claude layout so claude bind stays byte-unchanged. */
export function transcriptLayout(harness: HarnessKind): TranscriptLayout {
	return harness === "codex" ? CODEX_LAYOUT : CLAUDE_LAYOUT;
}
