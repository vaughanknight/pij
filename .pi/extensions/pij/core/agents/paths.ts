// The single home resolver for pij's agent runtime (KF-05).
//
// This is the one place that computes `PIJ_HOME ?? ~/.pij`. It was inlined at
// seven sites (cli.ts ×2 / index.ts / daemon.ts / core/daemon/watch.ts /
// adapters/focus-store.ts / telegram/index.ts); pij#169 swept all seven onto
// this function, so no other module re-derives the home. Pure — no I/O, no side
// effects — so it is trivially testable with an injected env and composes with
// a temp-home fixture for isolation.
//
// The sweep also settled one behavioural disagreement: the inlined `??` form
// only fell back on null/undefined, so a SET-but-EMPTY `PIJ_HOME` yielded ""
// and produced cwd-relative paths. Every surface now treats empty as unset.

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve pij's home directory: `PIJ_HOME` when set (and non-empty), else
 * `~/.pij`. An empty string is treated as unset. The env is injectable so tests
 * (and Phase-2 callers) can isolate a temp home without mutating `process.env`.
 */
export function resolvePijHome(env: NodeJS.ProcessEnv = process.env): string {
	const fromEnv = env.PIJ_HOME;
	if (fromEnv && fromEnv.length > 0) return fromEnv;
	return join(homedir(), ".pij");
}

/** The discovered/installed agent packs root: `<pijHome>/agents`. */
export function agentsDir(pijHome: string): string {
	return join(pijHome, "agents");
}

/** The ephemeral/inline temp-pack root: `<pijHome>/tmp`. */
export function tmpDir(pijHome: string): string {
	return join(pijHome, "tmp");
}
