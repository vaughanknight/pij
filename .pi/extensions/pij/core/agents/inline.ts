// Ephemeral / inline engine (KF-02, AC-05).
//
// minih has no run-from-a-prompt-string API and always writes `runs/<ts>/` under
// the pack dir, so an inline run means: synthesize a throwaway pack under
// `tmpDir()/agents/<run-id>/`, run it with retro auto-harvest suppressed, read
// the result from `AgentRunResult.parsedReport` (never disk), then delete the
// whole tree on completion — success AND failure. `sweepStaleTmp()` clears crash
// leftovers and is invoked at every run start and on daemon start.

import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEventHandler, IAgentAdapter } from "minih";
import { ulid } from "minih/runner";
import { tmpDir } from "./paths.js";
import { type RunPackResult, runAgentPack } from "./runner.js";
import type { RunOverrides } from "./types.js";

/** Temp packs older than this are crash leftovers and safe to sweep. Kept well
 *  above any single inline run's lifetime so a concurrent run is never nuked. */
export const STALE_TMP_AFTER_MS = 30 * 60 * 1000;

export interface InlineRunRequest {
	/** The inline prompt (becomes the synthesized pack's `prompt.md`). */
	prompt: string;
	/** Injected harness adapter. */
	adapter: IAgentAdapter;
	/** pij home (for `tmpDir` resolution) — resolve via `resolvePijHome()`. */
	pijHome: string;
	params?: Record<string, unknown>;
	overrides?: RunOverrides;
	/** Optional agent output schema written as `output-schema.json`. */
	outputSchema?: unknown;
	onEvent?: AgentEventHandler;
}

/**
 * Run an inline prompt through a synthesized temp pack that leaves nothing on
 * disk. The temp tree (including minih's `runs/<ts>/` ledger) is deleted in a
 * `finally`, so it is removed whether the run resolves, returns an error, or
 * throws. Retro auto-harvest is suppressed with `MINIH_NO_AUTO_HARVEST=1`.
 */
export async function runInlineAgent(request: InlineRunRequest): Promise<RunPackResult> {
	const { prompt, adapter, pijHome, params, overrides, outputSchema, onEvent } = request;

	// Sweep crash leftovers at the start of every inline run (AC-05).
	sweepStaleTmp(pijHome);

	const tmpAgentsDir = join(tmpDir(pijHome), "agents");
	const slug = `inline-${ulid().toLowerCase()}`;
	const packDir = join(tmpAgentsDir, slug);
	mkdirSync(packDir, { recursive: true });
	// minih's listAgents/resolveAgent require frontmatter with a non-empty
	// `description` (folder.js listAgents) — a bare prompt is silently skipped.
	// Synthesize a minimal description; the user's prompt is the stripped body.
	writeFileSync(
		join(packDir, "prompt.md"),
		`---\ndescription: Inline pij agent run.\n---\n${prompt}`,
	);
	if (outputSchema !== undefined) {
		writeFileSync(join(packDir, "output-schema.json"), JSON.stringify(outputSchema));
	}

	const prevHarvest = process.env.MINIH_NO_AUTO_HARVEST;
	process.env.MINIH_NO_AUTO_HARVEST = "1";
	try {
		return await runAgentPack({
			slug,
			agentsDir: tmpAgentsDir,
			adapter,
			...(params ? { params } : {}),
			...(overrides ? { overrides } : {}),
			...(onEvent ? { onEvent } : {}),
		});
	} finally {
		if (prevHarvest === undefined) delete process.env.MINIH_NO_AUTO_HARVEST;
		else process.env.MINIH_NO_AUTO_HARVEST = prevHarvest;
		// Leave nothing on disk — delete the synthesized pack + its runs/ ledger.
		rmSync(packDir, { recursive: true, force: true });
	}
}

export interface EphemeralRunRequest {
	/** The resolved pack directory to copy (a discovered/built-in pack). */
	packDir: string;
	/** The pack's slug (the temp copy is placed at `<root>/<slug>`). */
	slug: string;
	/** Injected harness adapter. */
	adapter: IAgentAdapter;
	/** pij home (for `tmpDir` resolution) — resolve via `resolvePijHome()`. */
	pijHome: string;
	params?: Record<string, unknown>;
	overrides?: RunOverrides;
	onEvent?: AgentEventHandler;
}

/**
 * Run an *existing* pack (a named agent under `--ephemeral`, or an un-ejected
 * built-in) through a throwaway temp copy so minih's `runs/<ts>/` ledger — which
 * it always roots at the pack dir — never lands in the source tree (KF-07). The
 * whole pack (prompt + schemas + instructions, unlike {@link runInlineAgent}'s
 * prompt-only synthesis) is `cpSync`'d under
 * `tmpDir(pijHome)/agents/ephemeral-<id>/<slug>`, run with retro auto-harvest
 * suppressed (`MINIH_NO_AUTO_HARVEST=1`, set-and-restored exactly like
 * {@link runInlineAgent}), and the copy is deleted in `finally` — on success,
 * error, or throw. The source pack is never written to.
 */
export async function runEphemeralPack(request: EphemeralRunRequest): Promise<RunPackResult> {
	const { packDir, slug, adapter, pijHome, params, overrides, onEvent } = request;

	// Sweep crash leftovers at the start of every run (AC-05), same as inline.
	sweepStaleTmp(pijHome);

	const ephemeralRoot = join(tmpDir(pijHome), "agents", `ephemeral-${ulid().toLowerCase()}`);
	const destPackDir = join(ephemeralRoot, slug);
	mkdirSync(ephemeralRoot, { recursive: true });
	cpSync(packDir, destPackDir, { recursive: true });
	// Drop any `runs/` ledger that rode along in the copy so a prior recorded run
	// can never leak into (or be confused with) this ephemeral one.
	rmSync(join(destPackDir, "runs"), { recursive: true, force: true });

	const prevHarvest = process.env.MINIH_NO_AUTO_HARVEST;
	process.env.MINIH_NO_AUTO_HARVEST = "1";
	try {
		return await runAgentPack({
			slug,
			agentsDir: ephemeralRoot,
			adapter,
			...(params ? { params } : {}),
			...(overrides ? { overrides } : {}),
			...(onEvent ? { onEvent } : {}),
		});
	} finally {
		if (prevHarvest === undefined) delete process.env.MINIH_NO_AUTO_HARVEST;
		else process.env.MINIH_NO_AUTO_HARVEST = prevHarvest;
		// Leave nothing on disk — delete the whole ephemeral copy + its runs/ ledger.
		rmSync(ephemeralRoot, { recursive: true, force: true });
	}
}

export interface SweepDeps {
	/** Injectable clock (tests). */
	now?: () => number;
	/** Age threshold override (tests). */
	maxAgeMs?: number;
}

/**
 * Remove stale temp packs under `tmpDir(pijHome)/agents`. Idempotent and safe to
 * call on every run start and on daemon start; a missing dir yields `[]`. Only
 * entries older than `maxAgeMs` (default {@link STALE_TMP_AFTER_MS}) are removed,
 * so a concurrent inline run's fresh dir is never swept. Returns swept names.
 */
export function sweepStaleTmp(pijHome: string, deps: SweepDeps = {}): string[] {
	const dir = join(tmpDir(pijHome), "agents");
	const now = deps.now?.() ?? Date.now();
	const maxAge = deps.maxAgeMs ?? STALE_TMP_AFTER_MS;
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const swept: string[] = [];
	for (const name of names) {
		const path = join(dir, name);
		let mtimeMs: number;
		try {
			mtimeMs = statSync(path).mtimeMs;
		} catch {
			continue;
		}
		if (now - mtimeMs >= maxAge) {
			rmSync(path, { recursive: true, force: true });
			swept.push(name);
		}
	}
	return swept;
}
