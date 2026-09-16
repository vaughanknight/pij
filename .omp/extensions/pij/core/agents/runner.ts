// The `runAgent` wrapper (AC-03/AC-04 core).
//
// Two responsibilities, both pure-ish and adapter-agnostic:
//   1. buildRunConfig — resolve model/effort/timeout overrides against the
//      pack's frontmatter with `flag > frontmatter > unset` precedence; warn
//      (never block) on an unknown effort (AC-04).
//   2. runAgentPack — resolve the pack, AJV-validate input *before any adapter
//      session starts* (AC-03 fail-fast), then drive minih's real `runAgent`
//      with the injected `IAgentAdapter`, surfacing `parsedReport`.
//
// Tagged-union returns, never throws (Pattern P4). The harness adapter is
// injected by the caller (FakeAgentAdapter in tests, claude/codex/copilot in
// prod), so this module never imports a concrete adapter.

import type { AgentEventHandler, IAgentAdapter } from "minih";
import {
	type AgentDefinition,
	type AgentRunConfig,
	type AgentRunResult,
	type ParsedReport,
	resolveAgent,
	runAgent,
	validateInput,
} from "minih/runner";
import type { RunOverrides } from "./types.js";

/** Efforts pij recognises without warning: minih's enum plus codex's `minimal`
 *  (which the codex adapter later clamps to `low`). Anything else warns. */
export const KNOWN_EFFORTS: ReadonlySet<string> = new Set([
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

export interface RunnerDeps {
	/** Warn sink for warn-don't-block diagnostics (default: no-op). Phase 2 wires stderr. */
	warn?: (message: string) => void;
}

/**
 * Build a minih `AgentRunConfig` from a resolved definition + per-instantiation
 * overrides. Precedence is `flag > frontmatter > unset`. The effort string is
 * passed through verbatim (the harness adapter does the final harness-specific
 * mapping); an unrecognised effort warns but never blocks (AC-04).
 */
export function buildRunConfig(
	def: AgentDefinition,
	overrides: RunOverrides,
	deps: RunnerDeps = {},
): AgentRunConfig {
	const model = overrides.model ?? def.model;
	const timeout = overrides.timeout ?? def.timeout;
	const effort = overrides.effort ?? def.reasoning;

	if (effort !== undefined && !KNOWN_EFFORTS.has(effort)) {
		deps.warn?.(
			`unknown effort '${effort}' — proceeding anyway (known: ${[...KNOWN_EFFORTS].join("|")})`,
		);
	}

	return {
		slug: def.slug,
		...(model !== undefined ? { model } : {}),
		// minih types `reasoningEffort` as low|medium|high|xhigh, but it only
		// forwards the value to `adapter.run()`, and the adapter (pij code) does
		// the real per-harness mapping/clamp — so a wider string is safe here.
		...(effort !== undefined
			? { reasoningEffort: effort as AgentRunConfig["reasoningEffort"] }
			: {}),
		...(timeout !== undefined ? { timeout } : {}),
		// `--cwd` sets the run cwd; `--permissions` overrides ONLY the preset layer
		// (workshop 002 § Override flags). The preset string is passed through
		// verbatim (minih's enum is narrower, but it validates/clamps at compile);
		// both are omitted when unset so frontmatter/sidecar/release defaults win.
		...(overrides.cwd !== undefined ? { cwd: overrides.cwd } : {}),
		...(overrides.permissions !== undefined
			? {
					permissionsOverride: {
						preset: overrides.permissions as NonNullable<
							AgentRunConfig["permissionsOverride"]
						>["preset"],
					},
				}
			: {}),
	};
}

export interface RunPackRequest {
	/** Pack slug to run. */
	slug: string;
	/** Directory containing `<slug>/prompt.md` (the resolved source dir). */
	agentsDir: string;
	/** Injected harness adapter (Fake in tests; claude/codex/copilot in prod). */
	adapter: IAgentAdapter;
	/** Input params validated against the pack's `input-schema.json` (if any). */
	params?: Record<string, unknown>;
	/** Per-instantiation model/effort/timeout/harness overrides. */
	overrides?: RunOverrides;
	/** Optional real-time event callback forwarded to minih. */
	onEvent?: AgentEventHandler;
}

export type RunPackResult =
	| {
			ok: true;
			runResult: AgentRunResult;
			report: ParsedReport | null;
			/** Whether input was validated against a schema (a pack may have none). */
			validated: boolean;
	  }
	| { ok: false; code: "E-NOAGENT"; slug: string }
	| { ok: false; code: "E-BADINPUT"; errors: string[] };

/**
 * Resolve, validate, and run a pack through the injected adapter.
 *
 * Fail-fast order (AC-03): resolve → **AJV input validation** → run. Input
 * validation happens before `runAgent` (which is what calls `adapter.run`), so
 * an invalid input never starts an adapter session.
 */
export async function runAgentPack(
	request: RunPackRequest,
	deps: RunnerDeps = {},
): Promise<RunPackResult> {
	const { slug, agentsDir, adapter, params = {}, overrides = {}, onEvent } = request;

	const def = resolveAgent(slug, agentsDir);
	if (!def) return { ok: false, code: "E-NOAGENT", slug };

	let validated = false;
	if (def.inputSchemaPath) {
		const result = validateInput(def.inputSchemaPath, params);
		if (!result.valid) return { ok: false, code: "E-BADINPUT", errors: result.errors };
		validated = true;
	}

	const config = buildRunConfig(def, overrides, deps);
	const runResult = await runAgent(adapter, def, { ...config, params }, onEvent, agentsDir);

	return { ok: true, runResult, report: runResult.parsedReport, validated };
}
