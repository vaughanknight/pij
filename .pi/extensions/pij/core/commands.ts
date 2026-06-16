// pij-messaging — remote command allow-list (pure, Pattern P4).
//
// Security: only allow-listed command names may be sent as remote commands
// (spec AC-6). The list lives next to the validator (Pattern P5).

import { err, ok, type Result } from "./types.js";

/** Remote commands a session will honour. `compact` runs on the long-lived
 *  ExtensionContext (autonomous from the receive watcher); `new`/`reload` are
 *  CONTROL_COMMANDS that only exist on pi's ExtensionCommandContext, so they
 *  execute via a captured command context (see PiRuntimePort.control). */
export const ALLOWED_COMMANDS = ["compact", "new", "reload"] as const;

export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

/** The subset that needs a command context (cannot run from the background
 *  watcher; routed onto the captured ExtensionCommandContext). */
export const CONTROL_COMMANDS = ["new", "reload"] as const;

export type ControlCommand = (typeof CONTROL_COMMANDS)[number];

/** Narrow an allow-listed command to the command-context-only subset. */
export function isControlCommand(name: AllowedCommand): name is ControlCommand {
	return (CONTROL_COMMANDS as readonly string[]).includes(name);
}

/** Validate a remote command name against the allow-list. Unknown names are
 *  rejected with E-CMD rather than executed. */
export function validateCommand(name: string): Result<AllowedCommand> {
	if ((ALLOWED_COMMANDS as readonly string[]).includes(name)) {
		return ok(name as AllowedCommand);
	}
	return err("E-CMD", `unknown command '${name}'; allowed: ${ALLOWED_COMMANDS.join(", ")}`);
}
