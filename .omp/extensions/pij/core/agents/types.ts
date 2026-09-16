// agent-runtime contracts (Pi-free). Discovery shapes live here; the run
// request/result shapes are added alongside runner.ts (T007). Nothing in this
// file imports from `@earendil-works/*` or from daemon/telegram/tmux modules —
// the import-boundary sensor (boundary.test.ts) enforces that.

/** Where a discovered pack came from, in precedence order (project wins). */
export type AgentSource = "project" | "user" | "builtin";

/**
 * A pack discovered by the 3-tier scan. `shadowed` is `true` when a
 * higher-precedence source also defines this slug (the entry is marked, never
 * dropped — AC-01). `harness` is a pij-only optional frontmatter hint that minih
 * ignores; reading it does not fork the pack format.
 */
export interface DiscoveredAgent {
	slug: string;
	source: AgentSource;
	dir: string;
	description: string;
	tags: string[];
	model?: string;
	reasoning?: string;
	harness?: string;
	shadowed: boolean;
}

/**
 * Per-instantiation overrides. Each resolves against the pack's frontmatter with
 * `flag > frontmatter > unset` precedence (AC-04). `effort` is kept as a raw
 * string here — minih's enum is `low|medium|high|xhigh`, but pij accepts codex's
 * `minimal` too and warns-don't-blocks on anything unknown; the harness adapter
 * does the final harness-specific clamp (codex `minimal`→`low`).
 */
export interface RunOverrides {
	model?: string;
	effort?: string;
	timeout?: number;
	harness?: string;
	/** `--cwd <dir>` — the directory the run (and its permission policy) resolves
	 *  against; maps to minih's `AgentRunConfig.cwd`. */
	cwd?: string;
	/** `--permissions <preset>` — overrides ONLY the resolved preset layer; maps
	 *  to minih's `AgentRunConfig.permissionsOverride.preset`. Kept as a raw
	 *  string (minih's preset enum is narrower); minih clamps/validates it. */
	permissions?: string;
}
