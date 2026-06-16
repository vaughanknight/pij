// pij-messaging — remote command allow-list (pure, Pattern P4).
//
// Security: only allow-listed command names may be sent as remote commands
// (spec AC-6). The list lives next to the validator (Pattern P5).

import { err, ok, type Result } from "./types.js";

/** Remote commands a session will honour. First (and only) v1 command: compact. */
export const ALLOWED_COMMANDS = ["compact"] as const;

export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

/** Validate a remote command name against the allow-list. Unknown names are
 *  rejected with E-CMD rather than executed. */
export function validateCommand(name: string): Result<AllowedCommand> {
	if ((ALLOWED_COMMANDS as readonly string[]).includes(name)) {
		return ok(name as AllowedCommand);
	}
	return err("E-CMD", `unknown command '${name}'; allowed: ${ALLOWED_COMMANDS.join(", ")}`);
}
