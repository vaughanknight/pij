// file-watch-notify — pure runtime-command parser (Pattern P2: pi-free, P8: unit-tested).
//
// Parses the `/file-watch-notify <subcommand> ...` argument string into a tagged
// union (Pattern P4) that the index.ts handler dispatches on. No fs, no pi imports —
// arming/disposing watchers is the wiring's job; this file only interprets text.

export type ParsedCommand =
	| { kind: "watch"; dir: string; patterns: string[] }
	| { kind: "list" }
	| { kind: "stop"; dir: string }
	| { kind: "status" }
	| { kind: "error"; reason: string };

export const COMMAND_USAGE =
	"usage: /file-watch-notify [watch <dir> <glob...> | list | stop <dir>]";

/**
 * Split on whitespace, honouring single/double quoted runs (so a dir or glob
 * containing spaces survives) and stripping one layer of surrounding quotes.
 */
function tokenize(args: string): string[] {
	const out: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const m of args.matchAll(re)) {
		out.push(m[1] ?? m[2] ?? m[3] ?? "");
	}
	return out;
}

export function parseCommand(args: string): ParsedCommand {
	const [first, ...rest] = tokenize(args);
	if (!first) return { kind: "status" };

	const verb = first.toLowerCase();

	switch (verb) {
		case "help":
		case "status":
			return { kind: "status" };
		case "list":
			return { kind: "list" };
		case "watch": {
			const [dir, ...patterns] = rest;
			if (!dir) {
				return {
					kind: "error",
					reason: `watch needs a <dir> and at least one <glob>. ${COMMAND_USAGE}`,
				};
			}
			if (patterns.length === 0) {
				return {
					kind: "error",
					reason: `watch "${dir}" needs at least one <glob>. ${COMMAND_USAGE}`,
				};
			}
			return { kind: "watch", dir, patterns };
		}
		case "stop": {
			const [dir] = rest;
			if (!dir) return { kind: "error", reason: `stop needs a <dir>. ${COMMAND_USAGE}` };
			return { kind: "stop", dir };
		}
		default:
			return { kind: "error", reason: `unknown subcommand "${verb}". ${COMMAND_USAGE}` };
	}
}
