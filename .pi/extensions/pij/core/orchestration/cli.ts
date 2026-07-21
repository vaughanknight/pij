// pij-orchestration — pure verb-family grammar, dispatch, and rendering.

import type { PijErrorCode, Result, SessionId } from "../types.js";
import type { BatonErrorCode, BatonResult, BatonService, BatonView } from "./baton.js";
import type { PrimeService } from "./prime.js";

export const ORCHESTRATION_USAGE = `pij orchestration — machine-wide coordination primitives

USAGE
  pij orchestration baton define <name> --resource <text> [--probe <text>] [--repo <path>] [--json]
  pij orchestration baton list [--json]
  pij orchestration baton show <name> [--json]
  pij orchestration baton request <name> --purpose <text> [--pin <sha>] [--evidence <text>] [--json]
  pij orchestration baton grant <name> --to <request-id> [--repin] [--json]
  pij orchestration baton return <name> [--evidence <text>] [--json]
  pij orchestration baton reclaim <name> --evidence <text> [--json]
  pij orchestration prime set [<id>] [--json]
  pij orchestration prime retire [<id>] [--json]
  pij orchestration prime unset [<id>] [--json]

POSTURE
  Honor system: any peer may designate any session prime, grant, or reclaim.
  The lease file enforces one baton holder.
  Dead/stalled holders alert the granter but are never auto-reclaimed.`;

export type ParsedOrchestrationCommand =
	| {
			readonly primitive: "prime";
			readonly verb: "set" | "retire" | "unset";
			readonly id?: SessionId;
			readonly json: boolean;
	  }
	| { readonly primitive: "baton"; readonly verb: "help"; readonly json: false }
	| {
			readonly primitive: "baton";
			readonly verb: "define";
			readonly name: string;
			readonly resource: string;
			readonly probe?: string;
			readonly repo?: string;
			readonly json: boolean;
	  }
	| { readonly primitive: "baton"; readonly verb: "list"; readonly json: boolean }
	| {
			readonly primitive: "baton";
			readonly verb: "show";
			readonly name: string;
			readonly json: boolean;
	  }
	| {
			readonly primitive: "baton";
			readonly verb: "request";
			readonly name: string;
			readonly purpose: string;
			readonly pin?: string;
			readonly evidence?: string;
			readonly json: boolean;
	  }
	| {
			readonly primitive: "baton";
			readonly verb: "grant";
			readonly name: string;
			readonly requestId: string;
			readonly repin: boolean;
			readonly json: boolean;
	  }
	| {
			readonly primitive: "baton";
			readonly verb: "return";
			readonly name: string;
			readonly evidence?: string;
			readonly json: boolean;
	  }
	| {
			readonly primitive: "baton";
			readonly verb: "reclaim";
			readonly name: string;
			readonly evidence: string;
			readonly json: boolean;
	  };

export type ParseOrchestrationResult =
	| { readonly ok: true; readonly command: ParsedOrchestrationCommand }
	| { readonly ok: false; readonly code: "E-ARG"; readonly message: string };

export type OrchestrationErrorCode = BatonErrorCode | PijErrorCode;

export const ORCHESTRATION_EXIT: Record<OrchestrationErrorCode, 1 | 2 | 3 | 64> = {
	"E-ARG": 64,
	"E-NOBATON": 1,
	"E-NOREQUEST": 1,
	"E-NOLEASE": 1,
	"E-HELD": 1,
	"E-PIN": 1,
	"E-STORE": 2,
	"E-NOID": 2,
	"E-SELF": 2,
	"E-CMD": 2,
	"E-DEAD": 1,
	"E-NOREG": 3,
	"E-AMBIG": 2,
	"E-AMBIGUOUS": 64,
	"E-NOTMUX": 2,
	"E-FULL": 2,
	"E-BRANCH": 64,
	"E-OWN": 2,
};

export function exitCodeForOrchestration(code: OrchestrationErrorCode): 1 | 2 | 3 | 64 {
	return ORCHESTRATION_EXIT[code];
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERBS = new Set(["define", "list", "show", "request", "grant", "return", "reclaim"]);
const BOOLEAN_FLAGS = new Set(["json", "repin"]);
const ALLOWED_FLAGS: Record<string, ReadonlySet<string>> = {
	define: new Set(["resource", "probe", "repo", "json"]),
	list: new Set(["json"]),
	show: new Set(["json"]),
	request: new Set(["purpose", "pin", "evidence", "json"]),
	grant: new Set(["to", "repin", "json"]),
	return: new Set(["evidence", "json"]),
	reclaim: new Set(["evidence", "json"]),
};

function argError(message: string): ParseOrchestrationResult {
	return { ok: false, code: "E-ARG", message };
}

function lex(args: readonly string[]):
	| ParseOrchestrationResult
	| {
			readonly positionals: readonly string[];
			readonly flags: Readonly<Record<string, string | true>>;
	  } {
	const positionals: string[] = [];
	const flags: Record<string, string | true> = {};
	for (let index = 0; index < args.length; index++) {
		const token = args[index];
		if (token === undefined) continue;
		if (!token.startsWith("--")) {
			positionals.push(token);
			continue;
		}
		const equals = token.indexOf("=");
		const key = token.slice(2, equals === -1 ? undefined : equals);
		if (key.length === 0) return argError("empty flag");
		if (equals !== -1) {
			if (BOOLEAN_FLAGS.has(key)) return argError(`--${key} does not take a value`);
			const value = token.slice(equals + 1);
			if (value.length === 0) return argError(`--${key} needs a value`);
			flags[key] = value;
			continue;
		}
		if (BOOLEAN_FLAGS.has(key)) {
			flags[key] = true;
			continue;
		}
		const value = args[index + 1];
		if (value === undefined || value.startsWith("--")) {
			return argError(`--${key} needs a value`);
		}
		flags[key] = value;
		index += 1;
	}
	return { positionals, flags };
}

function stringFlag(
	flags: Readonly<Record<string, string | true>>,
	key: string,
	required: boolean,
): BatonResult<string | undefined> {
	const value = flags[key];
	if (value === undefined) {
		return required
			? { ok: false, code: "E-ARG", message: `--${key} is required` }
			: { ok: true, value: undefined };
	}
	return typeof value === "string"
		? { ok: true, value }
		: { ok: false, code: "E-ARG", message: `--${key} needs a value` };
}

function validateFlags(
	verb: string,
	flags: Readonly<Record<string, string | true>>,
): ParseOrchestrationResult | null {
	const allowed = ALLOWED_FLAGS[verb];
	if (!allowed) return argError(`unknown baton verb '${verb}'`);
	for (const flag of Object.keys(flags)) {
		if (!allowed.has(flag)) return argError(`unknown flag '--${flag}' for baton ${verb}`);
	}
	return null;
}

function oneName(verb: string, positionals: readonly string[]): ParseOrchestrationResult | string {
	if (positionals.length !== 1) {
		return argError(`baton ${verb} needs exactly one <name>`);
	}
	const name = positionals[0] as string;
	return NAME_RE.test(name)
		? name
		: argError(`invalid baton name '${name}' (use letters, digits, dot, underscore, or hyphen)`);
}

export function parseOrchestrationArgs(args: readonly string[]): ParseOrchestrationResult {
	if (args[0] === "prime") {
		const verb = args[1];
		if (verb !== "set" && verb !== "retire" && verb !== "unset") {
			return argError(
				verb === undefined ? "expected a prime verb" : `unknown prime verb '${verb}'`,
			);
		}
		const lexed = lex(args.slice(2));
		if ("ok" in lexed) return lexed;
		for (const flag of Object.keys(lexed.flags)) {
			if (flag !== "json") return argError(`unknown flag '--${flag}' for prime ${verb}`);
		}
		if (lexed.positionals.length > 1) {
			return argError(`prime ${verb} takes at most one <id>`);
		}
		const id = lexed.positionals[0];
		if (id !== undefined && !NAME_RE.test(id)) {
			return argError(
				`invalid session id '${id}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		return {
			ok: true,
			command: {
				primitive: "prime",
				verb,
				...(id ? { id } : {}),
				json: lexed.flags.json === true,
			},
		};
	}
	if (args[0] !== "baton") {
		return argError(
			args[0] === undefined
				? "expected primitive 'baton' or 'prime'"
				: `unknown orchestration primitive '${args[0]}'`,
		);
	}
	const verb = args[1];
	if (verb === "--help" || verb === "-h" || verb === "help") {
		if (args.length !== 2) return argError("baton help takes no arguments");
		return { ok: true, command: { primitive: "baton", verb: "help", json: false } };
	}
	if (verb === undefined) return argError("expected a baton verb");
	if (!VERBS.has(verb)) return argError(`unknown baton verb '${verb}'`);
	const lexed = lex(args.slice(2));
	if ("ok" in lexed) return lexed;
	const invalidFlags = validateFlags(verb, lexed.flags);
	if (invalidFlags) return invalidFlags;
	const json = lexed.flags.json === true;

	if (verb === "list") {
		if (lexed.positionals.length !== 0) return argError("baton list takes no arguments");
		return { ok: true, command: { primitive: "baton", verb, json } };
	}

	const named = oneName(verb, lexed.positionals);
	if (typeof named !== "string") return named;

	if (verb === "show") {
		return { ok: true, command: { primitive: "baton", verb, name: named, json } };
	}
	if (verb === "define") {
		const resource = stringFlag(lexed.flags, "resource", true);
		if (!resource.ok) return argError(resource.message);
		if (resource.value === undefined) return argError("--resource is required");
		const probe = stringFlag(lexed.flags, "probe", false);
		if (!probe.ok) return argError(probe.message);
		const repo = stringFlag(lexed.flags, "repo", false);
		if (!repo.ok) return argError(repo.message);
		return {
			ok: true,
			command: {
				primitive: "baton",
				verb,
				name: named,
				resource: resource.value,
				...(probe.value ? { probe: probe.value } : {}),
				...(repo.value ? { repo: repo.value } : {}),
				json,
			},
		};
	}
	if (verb === "request") {
		const purpose = stringFlag(lexed.flags, "purpose", true);
		if (!purpose.ok) return argError(purpose.message);
		if (purpose.value === undefined) return argError("--purpose is required");
		const pin = stringFlag(lexed.flags, "pin", false);
		if (!pin.ok) return argError(pin.message);
		const evidence = stringFlag(lexed.flags, "evidence", false);
		if (!evidence.ok) return argError(evidence.message);
		return {
			ok: true,
			command: {
				primitive: "baton",
				verb,
				name: named,
				purpose: purpose.value,
				...(pin.value ? { pin: pin.value } : {}),
				...(evidence.value ? { evidence: evidence.value } : {}),
				json,
			},
		};
	}
	if (verb === "grant") {
		const requestId = stringFlag(lexed.flags, "to", true);
		if (!requestId.ok) return argError(requestId.message);
		if (requestId.value === undefined) return argError("--to is required");
		return {
			ok: true,
			command: {
				primitive: "baton",
				verb,
				name: named,
				requestId: requestId.value,
				repin: lexed.flags.repin === true,
				json,
			},
		};
	}
	if (verb === "return") {
		const evidence = stringFlag(lexed.flags, "evidence", false);
		if (!evidence.ok) return argError(evidence.message);
		return {
			ok: true,
			command: {
				primitive: "baton",
				verb,
				name: named,
				...(evidence.value ? { evidence: evidence.value } : {}),
				json,
			},
		};
	}
	const evidence = stringFlag(lexed.flags, "evidence", true);
	if (!evidence.ok) return argError(evidence.message);
	if (evidence.value === undefined) return argError("--evidence is required");
	return {
		ok: true,
		command: {
			primitive: "baton",
			verb: "reclaim",
			name: named,
			evidence: evidence.value,
			json,
		},
	};
}

export interface OrchestrationVerbResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export interface OrchestrationDeps {
	readonly service: BatonService;
	readonly actor: string;
	readonly currentHead: (baton: string) => string | null;
	readonly primeService?: PrimeService;
	readonly resolveSelf?: () => Result<SessionId>;
}

function resultError<T>(
	result: Extract<BatonResult<T>, { ok: false }> | Extract<Result<T>, { ok: false }>,
): OrchestrationVerbResult {
	return {
		stdout: "",
		stderr: `${result.code}: ${result.message}`,
		exitCode: exitCodeForOrchestration(result.code),
	};
}

function success(stdout: string): OrchestrationVerbResult {
	return { stdout, stderr: "", exitCode: 0 };
}

function receiptText(state: string): string {
	return `receipt=${state}`;
}

function humanDuration(ms: number | null): string {
	if (ms === null) return "unknown";
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	return `${Math.round(seconds / 60)}m`;
}

function renderList(views: readonly BatonView[]): string {
	if (views.length === 0) return "no orchestration batons defined";
	const rows = views.map(({ definition, lease }) => {
		const holder = lease?.holder ?? "free";
		return `${definition.name.padEnd(20)} ${holder.padEnd(16)} q=${definition.queue.length}  ${definition.resource}`;
	});
	return ["baton                holder           queue  resource", ...rows].join("\n");
}

function renderShow(view: BatonView): string {
	const { definition, lease } = view;
	const lines = [
		`baton:      ${definition.name}`,
		`resource:   ${definition.resource}`,
		`holder:     ${lease?.holder ?? "free"}`,
		`queue:      ${definition.queue.length}`,
	];
	if (definition.repo) lines.push(`repo:       ${definition.repo}`);
	if (definition.probe) lines.push(`probe:      ${definition.probe}`);
	if (lease) {
		lines.push(`lease:      ${lease.leaseId}`);
		lines.push(`purpose:    ${lease.purpose}`);
		lines.push(`blocked:    ${humanDuration(view.blockedTimeMs)}`);
	}
	for (const request of definition.queue) {
		lines.push(`request:    ${request.id} · ${request.requester} · ${request.purpose}`);
	}
	return lines.join("\n");
}

export function dispatchOrchestration(
	command: ParsedOrchestrationCommand,
	deps: OrchestrationDeps,
): OrchestrationVerbResult {
	if (command.primitive === "prime") {
		const resolved = command.id
			? ({ ok: true, value: command.id } as const)
			: (deps.resolveSelf?.() ?? {
					ok: false,
					code: "E-AMBIG",
					message: "cannot resolve self for prime designation",
				});
		if (!resolved.ok) return resultError(resolved);
		if (!deps.primeService) {
			return resultError({
				ok: false,
				code: "E-STORE",
				message: "prime service is unavailable",
			});
		}
		const result =
			command.verb === "set"
				? deps.primeService.set(resolved.value)
				: command.verb === "retire"
					? deps.primeService.retire(resolved.value)
					: deps.primeService.unset(resolved.value);
		if (!result.ok) return resultError(result);
		const jsonValue =
			command.verb === "retire"
				? result.value
				: {
						id: result.value.id,
						prime: result.value.prime,
						changed: result.value.changed,
					};
		return success(
			command.json ? JSON.stringify(jsonValue) : `prime ${command.verb}: ${result.value.id}`,
		);
	}
	if (command.verb === "help") return success(ORCHESTRATION_USAGE);
	switch (command.verb) {
		case "define": {
			const result = deps.service.define({
				name: command.name,
				resource: command.resource,
				...(command.probe ? { probe: command.probe } : {}),
				...(command.repo ? { repo: command.repo } : {}),
				actor: deps.actor,
			});
			if (!result.ok) return resultError(result);
			return success(
				command.json
					? JSON.stringify(result.value)
					: `defined baton '${result.value.name}': ${result.value.resource}`,
			);
		}
		case "list": {
			const result = deps.service.list(deps.actor);
			if (!result.ok) return resultError(result);
			return success(command.json ? JSON.stringify(result.value) : renderList(result.value));
		}
		case "show": {
			const result = deps.service.show(command.name, deps.actor);
			if (!result.ok) return resultError(result);
			return success(command.json ? JSON.stringify(result.value) : renderShow(result.value));
		}
		case "request": {
			const result = deps.service.request({
				name: command.name,
				requester: deps.actor,
				purpose: command.purpose,
				...(command.pin ? { pin: command.pin } : {}),
				...(command.evidence ? { declaredEvidence: command.evidence } : {}),
			});
			if (!result.ok) return resultError(result);
			return success(
				command.json
					? JSON.stringify(result.value)
					: `requested baton '${command.name}' as ${result.value.request.id} (filed as: ${result.value.request.requester}) · ${receiptText(result.value.receipt.state)}`,
			);
		}
		case "grant": {
			const result = deps.service.grant({
				name: command.name,
				requestId: command.requestId,
				grantedBy: deps.actor,
				currentHead: deps.currentHead(command.name),
				repin: command.repin,
			});
			if (!result.ok) return resultError(result);
			return success(
				command.json
					? JSON.stringify(result.value)
					: `granted baton '${command.name}' to ${result.value.lease.holder} (${result.value.lease.leaseId}) · blocked=${humanDuration(result.value.blockedTimeMs)} · ${receiptText(result.value.receipt.state)}`,
			);
		}
		case "return": {
			const result = deps.service.return({
				name: command.name,
				actor: deps.actor,
				...(command.evidence ? { evidence: command.evidence } : {}),
			});
			if (!result.ok) return resultError(result);
			return success(
				command.json
					? JSON.stringify(result.value)
					: `returned baton '${command.name}' (${result.value.lease.leaseId}) · ${receiptText(result.value.receipt.state)}`,
			);
		}
		case "reclaim": {
			const result = deps.service.reclaim({
				name: command.name,
				actor: deps.actor,
				evidence: command.evidence,
			});
			if (!result.ok) return resultError(result);
			return success(
				command.json
					? JSON.stringify(result.value)
					: `reclaimed baton '${command.name}' (${result.value.lease.leaseId}) · ${receiptText(result.value.receipt.state)}`,
			);
		}
	}
}
