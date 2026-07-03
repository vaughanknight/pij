// The single home resolver for pij's agent runtime (KF-05).
//
// `PIJ_HOME ?? ~/.pij` was inlined 3× (cli.ts / index.ts / daemon.ts); this is
// the one place that computes it, plus the two derived roots the runtime needs.
// Pure — no I/O, no side effects — so it is trivially testable with an injected
// env and composes with a temp-home fixture for isolation.

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
