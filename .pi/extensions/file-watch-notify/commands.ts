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
function tokenize(args: string): { tokens: string[]; malformed: boolean } {
	const tokens: string[] = [];
	let malformed = false;
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const m of args.matchAll(re)) {
		if (m[3] !== undefined) {
			// A bare run still carrying a quote char means the quote was never closed
			// (a properly quoted run matches m[1]/m[2] and is stripped instead).
			if (m[3].includes('"') || m[3].includes("'")) malformed = true;
			tokens.push(m[3]);
		} else {
			tokens.push(m[1] ?? m[2] ?? "");
		}
	}
	return { tokens, malformed };
}

export function parseCommand(args: string): ParsedCommand {
	const { tokens, malformed } = tokenize(args);
	if (malformed) {
		return { kind: "error", reason: `unmatched quote in arguments. ${COMMAND_USAGE}` };
	}

	const [first, ...rest] = tokens;
	if (!first) return { kind: "status" };

	const verb = first.toLowerCase();

	// Arity policy: `help`/`status`/`list` are lenient (no args — surplus ignored);
	// `watch` is variadic (extra tokens are additional globs); `stop` is exact-arity
	// (a stray token is almost certainly a typo). (Tested in commands.test.ts.)

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
			const [dir, ...extra] = rest;
			if (!dir) return { kind: "error", reason: `stop needs a <dir>. ${COMMAND_USAGE}` };
			if (extra.length > 0) {
				return {
					kind: "error",
					reason: `stop takes exactly one <dir> (unexpected: "${extra.join(" ")}"). ${COMMAND_USAGE}`,
				};
			}
			return { kind: "stop", dir };
		}
		default:
			return { kind: "error", reason: `unknown subcommand "${verb}". ${COMMAND_USAGE}` };
	}
}
