// `pij agent` subverb argument parsing (workshop 002 §§ grammar/flags/errors).
//
// Pure, adapter-free, I/O-free — placed under `core/agents/` so the import-boundary
// sensor keeps guarding it (no daemon/telegram/tmux/grammy imports). The bin
// (cli.ts) hands us the argv slice *after* `agent`; we return a tagged-union
// `ParsedAgentCommand` or an `E-ARG` error (Pattern P4). No stdout/exit here.

/** The subverbs of `pij agent`. */
export type AgentSubverb = "list" | "run" | "show" | "new" | "check" | "eject" | "spawn" | "report";

const SUBVERBS: ReadonlySet<string> = new Set<AgentSubverb>([
	"list",
	"run",
	"show",
	"new",
	"check",
	"eject",
	"spawn",
	"report",
]);

/** Subverbs that take exactly one `<slug>` positional and no flags. */
const SLUG_ONLY: ReadonlySet<string> = new Set(["show", "new", "check", "eject"]);

/** A fully-parsed `pij agent` invocation. Raw `-p` values stay strings here;
 *  {@link coerceParams} applies minih's JSON auto-coercion at run time. */
export interface ParsedAgentCommand {
	subverb: AgentSubverb;
	/** Pack slug for run(named)/show/new/check/eject; undefined for list + inline run. */
	slug?: string;
	/** Inline prompt text (`run --prompt "<text>"`); undefined when reading stdin. */
	prompt?: string;
	/** True for `run --prompt -` (read the prompt from stdin). */
	promptStdin: boolean;
	/** Repeated `-p k=v` params, raw string values (coerce with {@link coerceParams}). */
	params: Record<string, string>;
	/** `--ephemeral` — run a named pack without recording (temp-copy path). */
	ephemeral: boolean;
	/** `--json` — machine envelope on stdout, progress on stderr. */
	json: boolean;
	/** `spawn --once` (or pack `lifecycle: once`) — auto-close the peer after its
	 *  first report push (Phase 3). Default false (resident). */
	once: boolean;
	/** `spawn --layout stack|right|below|window` (FX001-3 / SUGG-001) — explicit
	 *  pane placement; unset ⇒ `stack` (the default side stack). */
	layout?: "stack" | "right" | "below" | "window";
	/** `report --json '<payload>'` — the raw report JSON string (report subverb).
	 *  Distinct from the boolean {@link json}; only set for `report`. */
	reportJson?: string;
	/** `--quiet` — silence stderr progress stream. */
	quiet: boolean;
	model?: string;
	effort?: string;
	harness?: string;
	permissions?: string;
	timeout?: number;
	cwd?: string;
	/** `--output-schema <file>` for inline runs (validated structured output). */
	outputSchema?: string;
}

export type ParseAgentResult =
	| { ok: true; cmd: ParsedAgentCommand }
	| { ok: false; code: "E-ARG"; message: string };

// ─── error codes + exit mapping (AC-09) ──────────────────────────────────────

/** Every error the `pij agent` surface can emit. */
export type AgentErrorCode =
	| "E-ARG"
	| "E-NOAGENT"
	| "E-BADINPUT"
	| "E-NOADAPTER"
	| "E-HARNESSBIN"
	| "E-PERMISSION"
	| "E-RUNFAILED";

/**
 * Exit-code table (workshop 002 § Errors — the fs2 convention): `0` success, `1`
 * user/agent error (bad input, run failed, validation failed, bad flags, unknown
 * slug/harness/permission), `2` system error (a required harness CLI is missing).
 */
export const AGENT_EXIT: Record<AgentErrorCode, 1 | 2> = {
	"E-ARG": 1,
	"E-NOAGENT": 1,
	"E-BADINPUT": 1,
	"E-NOADAPTER": 1,
	"E-PERMISSION": 1,
	"E-RUNFAILED": 1,
	"E-HARNESSBIN": 2,
};

/** Exit code for a given agent error code (0 is reserved for success). */
export function exitCodeFor(code: AgentErrorCode): 1 | 2 {
	return AGENT_EXIT[code];
}

// ─── parsing ─────────────────────────────────────────────────────────────────

/** Flags that consume the next argv token as their value. */
const VALUE_FLAGS = new Set([
	"--prompt",
	"--model",
	"--effort",
	"--harness",
	"--permissions",
	"--timeout",
	"--cwd",
	"--output-schema",
]);

function argErr(message: string): ParseAgentResult {
	return { ok: false, code: "E-ARG", message };
}

/**
 * Parse the argv slice *after* `agent` (e.g. `["run","x","-p","k=v","--json"]`).
 * Warn-free, pure. Returns `{ok:true, cmd}` or `{ok:false, code:"E-ARG", message}`.
 * The bin renders the message + a usage block and exits 1 (workshop § grammar).
 */
export function parseAgentArgs(args: string[]): ParseAgentResult {
	const first = args[0];
	if (first === undefined) {
		return argErr("expected a subverb: list | run | show | new | check | eject | spawn | report");
	}
	if (!SUBVERBS.has(first)) {
		return argErr(
			`unknown subverb '${first}' — expected list | run | show | new | check | eject | spawn | report`,
		);
	}
	const subverb = first as AgentSubverb;

	const cmd: ParsedAgentCommand = {
		subverb,
		promptStdin: false,
		params: {},
		ephemeral: false,
		json: false,
		once: false,
		quiet: false,
	};
	const positionals: string[] = [];

	for (let i = 1; i < args.length; i++) {
		const tok = args[i] as string;

		if (tok === "-p") {
			const kv = args[++i];
			if (kv === undefined) return argErr("-p needs a key=value pair");
			const eq = kv.indexOf("=");
			if (eq < 0) return argErr(`-p needs key=value (got '${kv}')`);
			cmd.params[kv.slice(0, eq)] = kv.slice(eq + 1);
			continue;
		}
		if (tok === "--json") {
			// `report --json '<payload>'` consumes the payload as a VALUE; every other
			// subverb keeps `--json` as the boolean machine-output flag.
			if (subverb === "report") {
				const val = args[++i];
				if (val === undefined) return argErr("report --json needs a JSON payload");
				cmd.reportJson = val;
			} else {
				cmd.json = true;
			}
			continue;
		}
		if (tok === "--once") {
			if (subverb !== "spawn") return argErr("--once is only valid for spawn");
			cmd.once = true;
			continue;
		}
		if (tok === "--layout") {
			if (subverb !== "spawn") return argErr("--layout is only valid for spawn");
			const val = args[++i];
			if (val !== "stack" && val !== "right" && val !== "below" && val !== "window")
				return argErr(`--layout must be stack|right|below|window (got '${val ?? ""}')`);
			cmd.layout = val;
			continue;
		}
		if (tok === "--ephemeral") {
			cmd.ephemeral = true;
			continue;
		}
		if (tok === "--quiet") {
			cmd.quiet = true;
			continue;
		}
		if (VALUE_FLAGS.has(tok)) {
			const val = args[++i];
			if (val === undefined) return argErr(`${tok} needs a value`);
			const assigned = assignValueFlag(cmd, tok, val);
			if (assigned) return assigned;
			continue;
		}
		if (tok.startsWith("-")) {
			return argErr(`unknown flag '${tok}' for '${subverb}'`);
		}
		positionals.push(tok);
	}

	return finalize(cmd, positionals);
}

/** Apply a `--flag value` pair to the command; returns an error result or null. */
function assignValueFlag(
	cmd: ParsedAgentCommand,
	flag: string,
	val: string,
): ParseAgentResult | null {
	switch (flag) {
		case "--prompt":
			if (val === "-") cmd.promptStdin = true;
			else cmd.prompt = val;
			return null;
		case "--model":
			cmd.model = val;
			return null;
		case "--effort":
			cmd.effort = val;
			return null;
		case "--harness":
			cmd.harness = val;
			return null;
		case "--permissions":
			cmd.permissions = val;
			return null;
		case "--cwd":
			cmd.cwd = val;
			return null;
		case "--output-schema":
			cmd.outputSchema = val;
			return null;
		case "--timeout": {
			const n = Number(val);
			if (!Number.isFinite(n) || n <= 0 || !/^\d+$/.test(val)) {
				return argErr(`--timeout needs a positive integer (seconds), got '${val}'`);
			}
			cmd.timeout = n;
			return null;
		}
		default:
			return argErr(`unknown flag '${flag}'`);
	}
}

/** Validate the positional/flag combination per subverb and finalize the command. */
function finalize(cmd: ParsedAgentCommand, positionals: string[]): ParseAgentResult {
	const { subverb } = cmd;

	if (subverb === "list") {
		if (positionals.length > 0) return argErr(`list takes no arguments (got '${positionals[0]}')`);
		return { ok: true, cmd };
	}

	if (SLUG_ONLY.has(subverb)) {
		if (positionals.length === 0) return argErr(`${subverb} needs a <slug>`);
		if (positionals.length > 1) {
			return argErr(`${subverb} takes exactly one <slug> (got ${positionals.length})`);
		}
		cmd.slug = positionals[0];
		return { ok: true, cmd };
	}

	if (subverb === "report") {
		if (positionals.length > 0) {
			return argErr(`report takes no positional arguments (got '${positionals[0]}')`);
		}
		if (cmd.reportJson === undefined) {
			return argErr("report needs --json '<payload>' (the report JSON matching the pack's schema)");
		}
		return { ok: true, cmd };
	}

	// spawn + run share the same "slug OR --prompt" positional shape.
	const hasPrompt = cmd.prompt !== undefined || cmd.promptStdin;
	if (subverb === "spawn") {
		if (positionals.length > 1) {
			return argErr(`spawn takes at most one <slug> (got ${positionals.length})`);
		}
		if (positionals.length === 1) {
			if (hasPrompt) return argErr("spawn takes a <slug> OR --prompt, not both");
			cmd.slug = positionals[0];
			return { ok: true, cmd };
		}
		if (!hasPrompt) return argErr("spawn needs a <slug> or --prompt <text>");
		return { ok: true, cmd };
	}

	// subverb === "run"
	if (positionals.length > 1) {
		return argErr(`run takes at most one <slug> (got ${positionals.length})`);
	}
	if (positionals.length === 1) {
		if (hasPrompt) return argErr("run takes a <slug> OR --prompt, not both");
		cmd.slug = positionals[0];
		return { ok: true, cmd };
	}
	if (!hasPrompt) return argErr("run needs a <slug> or --prompt <text>");
	return { ok: true, cmd };
}

/**
 * Coerce raw `-p key=value` strings with minih's `-p` semantics: attempt
 * `JSON.parse` on each value, falling back to the bare string when it isn't valid
 * JSON. So `limit=20` → `20` (number), `flag=true` → `true`, `q=hello` → `"hello"`.
 */
export function coerceParams(raw: Record<string, string>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(raw)) {
		try {
			out[k] = JSON.parse(v);
		} catch {
			out[k] = v;
		}
	}
	return out;
}
