// pij-messaging — `pij close <id> [--force]` pure core (Pattern P2: pi-free;
// P4: tagged-union returns; P8: the testable backbone of the bin's runClose).
//
// Teardown is a first-class verb: kill a colleague's tmux pane + drop its
// descriptor with just the pij-id — no hand-rolled `tmux kill-pane` + `rm
// ~/.pij/<id>.json`. Ownership-guarded: you may close a session you spawned;
// closing one you DON'T own is refused (E-OWN) unless `--force`. The impurity
// (tmux killPane + registry.remove) lives in the bin; the decision is pure here.

import { err, ok, type Result, type SessionDescriptor, type SessionId } from "./types.js";

/** Parsed `pij close` invocation. */
export interface ParsedClose {
	readonly id: SessionId;
	readonly force: boolean;
}

/** Parse `pij close <id> [--force]`. Strict: one positional id, only --force. */
export function parseCloseArgs(argv: readonly string[]): Result<ParsedClose> {
	let id: string | undefined;
	let force = false;
	for (const tok of argv) {
		if (tok === "--force" || tok === "-f") {
			force = true;
		} else if (tok.startsWith("-")) {
			return err("E-ARG", `unknown flag '${tok}' for 'close' (usage: pij close <id> [--force])`);
		} else if (id === undefined) {
			id = tok;
		} else {
			return err("E-ARG", "usage: pij close <id> [--force]");
		}
	}
	if (id === undefined) return err("E-ARG", "usage: pij close <id> [--force]");
	return ok({ id, force });
}

/** The action a successful `pij close` should take: kill `paneId`, then drop
 *  `id` from the registry. `warning` is set when a non-owned session is being
 *  force-closed (the bin surfaces it). */
export interface ClosePlan {
	readonly id: SessionId;
	readonly paneId: string;
	readonly warning?: string;
}

/**
 * Decide whether a `pij close <id>` may proceed, given who is asking.
 *
 * Ownership = the caller spawned the target (`descriptor.spawnedBy === self`).
 * A non-owner (or unknown-owner) close is REFUSED with `E-OWN` unless `force` —
 * then it proceeds carrying a warning. Self-close is always refused (`E-SELF`):
 * a session never tears down its own pane via this path. A descriptor with no
 * `paneId` is not a closable tmux session (`E-NOID`).
 *
 * Pure: returns the plan; the bin wires `tmux killPane` + `registry.remove`.
 */
export function planClose(
	descriptor: SessionDescriptor | null,
	id: SessionId,
	self: SessionId | undefined,
	force: boolean,
): Result<ClosePlan> {
	if (!descriptor) return err("E-NOID", `no session '${id}' in registry`);
	if (id === self) return err("E-SELF", `refusing to close yourself (${id})`);
	if (!descriptor.paneId) {
		return err("E-NOID", `session '${id}' has no pane — not a spawned/adopted tmux session`);
	}
	const owned = self !== undefined && descriptor.spawnedBy === self;
	if (!owned && !force) {
		const owner = descriptor.spawnedBy ?? "unknown";
		return err(
			"E-OWN",
			`session '${id}' was spawned by ${owner}, not you (${self ?? "unknown"}) — ` +
				"re-run with --force to close a session you don't own",
		);
	}
	const warning = owned
		? undefined
		: `forced close of '${id}' — spawned by ${descriptor.spawnedBy ?? "unknown"}, you are ${
				self ?? "unknown"
			}`;
	return ok({ id, paneId: descriptor.paneId, warning });
}
