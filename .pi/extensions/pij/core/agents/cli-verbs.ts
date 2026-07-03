// `pij agent` verb implementations (workshop 002 §§ list/run/show/new/check/eject).
//
// The CLI layer: parses (via cli-args.ts) and renders; the runtime (runner.ts /
// inline.ts / pack.ts) executes. Every model/harness fact is INJECTED as a
// `VerbDeps` function so this module never imports `core/cli.ts` or `core/models/`
// — that keeps the agent-runtime domain clean of the control plane (the boundary
// test guards the daemon/telegram/tmux/grammy edge; this injection guards the
// models edge). Verbs return a `VerbResult` (stdout/stderr/exitCode); the bin owns
// process I/O and `process.exit`.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IAgentAdapter } from "minih";
import { type PermissionPolicy, parseFrontmatter, resolveAgent } from "minih/runner";
import {
	type AgentErrorCode,
	coerceParams,
	exitCodeFor,
	type ParsedAgentCommand,
} from "./cli-args.js";
import { runEphemeralPack, runInlineAgent, sweepStaleTmp } from "./inline.js";
import { type DiscoverySource, discoverAgents } from "./pack.js";
import { agentsDir } from "./paths.js";
import { type RunPackResult, runAgentPack } from "./runner.js";
import type { DiscoveredAgent, RunOverrides } from "./types.js";

// ─── result + error shapes ───────────────────────────────────────────────────

/** What a verb produces; the bin writes stdout/stderr and exits with `exitCode`. */
export interface VerbResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Structured errors, rendered by {@link renderAgentError} into workshop-002 shapes. */
export type AgentError =
	| { code: "E-ARG"; message: string }
	| { code: "E-NOAGENT"; slug: string }
	| { code: "E-BADINPUT"; errors: string[] }
	| { code: "E-NOADAPTER"; harness: string }
	| { code: "E-HARNESSBIN"; bin: string; message?: string }
	| { code: "E-PERMISSION"; kind: string; preset: string }
	| { code: "E-RUNFAILED"; reason: string; reportPath: string | null };

/** Render an {@link AgentError} to its workshop-002 § Errors message shape. */
export function renderAgentError(e: AgentError): string {
	switch (e.code) {
		case "E-ARG":
			return `E-ARG: ${e.message}`;
		case "E-NOAGENT":
			return `E-NOAGENT: no agent '${e.slug}' in ./agents, ~/.pij/agents, or built-ins — pij agent list`;
		case "E-BADINPUT":
			return `E-BADINPUT: input failed input-schema.json —\n${e.errors.map((x) => `  ${x}`).join("\n")}`;
		case "E-NOADAPTER":
			return `E-NOADAPTER: harness '${e.harness}' has no agent adapter (have: claude, codex, copilot)`;
		case "E-HARNESSBIN":
			return e.message
				? `E-HARNESSBIN: ${e.message}`
				: `E-HARNESSBIN: ${e.bin} CLI not found on PATH — needed by this agent's harness`;
		case "E-PERMISSION":
			return `E-PERMISSION: run denied (${e.kind} blocked by preset '${e.preset}') — re-run with --permissions trusted`;
		case "E-RUNFAILED":
			return `E-RUNFAILED: agent finished ${e.reason}${e.reportPath ? ` — report: ${e.reportPath}` : ""}`;
	}
}

function errResult(error: AgentError): VerbResult {
	return { stdout: "", stderr: renderAgentError(error), exitCode: exitCodeFor(error.code) };
}

// ─── injected dependencies ───────────────────────────────────────────────────

/** Adapter resolution: an adapter, or a structured harness error (bin-provided). */
export type AdapterResolution =
	| { ok: true; adapter: IAgentAdapter }
	| { ok: false; error: Extract<AgentError, { code: "E-NOADAPTER" | "E-HARNESSBIN" }> };

export interface VerbDeps {
	pijHome: string;
	/** The working directory `pij` was invoked from (the project root for `./agents`). */
	cwd: string;
	/** Resolved built-in-agents directory (bin resolves it relative to the module URL). */
	builtinDir: string;
	/** Harness pij falls back to when a pack/model implies none (e.g. `"claude"`). */
	defaultHarness: string;
	/** Model id → harness name; `undefined` when the model is unknown (list shows `?`). */
	harnessForModel: (model: string | undefined) => string | undefined;
	/** Warn-don't-block model diagnostic (bin wraps `buildSpawnWarning`); `null` = ok. */
	modelWarning: (model: string | undefined) => string | null;
	/** Warn-don't-block effort diagnostic (bin wraps `buildEffortWarning`); `null` = ok. */
	effortWarning: (effort: string | undefined, model: string | undefined) => string | null;
	/** Build a harness adapter (bin wires claude/codex/copilot + PATH/SDK checks). */
	makeAdapter: (harness: string) => Promise<AdapterResolution>;
	/** stderr progress sink (bin: `process.stderr`, suppressed under `--quiet`). */
	progress: (line: string) => void;
	/** Read the whole prompt from stdin, for `run --prompt -`. */
	readStdin?: () => string;
	/** True when the `minih` binary is on PATH (delegates `new`); default false. */
	hasMinihBinary?: () => boolean;
	/** Run `minih init <slug>` in `cwd` (bin wires it); required only if hasMinihBinary. */
	runMinihInit?: (slug: string, cwd: string) => { ok: boolean; stderr: string };
}

// ─── discovery helpers ───────────────────────────────────────────────────────

/** The 3-tier discovery sources in precedence order (project → user → built-in). */
function discoverySources(deps: VerbDeps): DiscoverySource[] {
	return [
		{ dir: join(deps.cwd, "agents"), source: "project" },
		{ dir: agentsDir(deps.pijHome), source: "user" },
		{ dir: deps.builtinDir, source: "builtin" },
	];
}

/** The winning (highest-precedence, non-shadowed) pack for a slug, or undefined. */
function findAgent(slug: string, deps: VerbDeps): DiscoveredAgent | undefined {
	return discoverAgents(discoverySources(deps)).find((a) => a.slug === slug && !a.shadowed);
}

/** Derived harness for display/routing: explicit hint → model-derived → undefined. */
function deriveHarness(agent: DiscoveredAgent, deps: VerbDeps): string | undefined {
	return agent.harness ?? deps.harnessForModel(agent.model);
}

// ─── list ────────────────────────────────────────────────────────────────────

export function listVerb(cmd: ParsedAgentCommand, deps: VerbDeps): VerbResult {
	const agents = discoverAgents(discoverySources(deps));

	if (cmd.json) {
		const rows = agents.map((a) => ({
			slug: a.slug,
			source: a.source,
			dir: a.dir,
			description: a.description,
			tags: a.tags,
			model: a.model ?? null,
			reasoning: a.reasoning ?? null,
			harness: deriveHarness(a, deps) ?? null,
			shadowed: a.shadowed,
		}));
		return { stdout: JSON.stringify(rows, null, 2), stderr: "", exitCode: 0 };
	}

	if (agents.length === 0) {
		return {
			stdout: "No agents found. Add packs under ./agents, ~/.pij/agents, or use a built-in.",
			stderr: "",
			exitCode: 0,
		};
	}

	const rows = agents.map((a) => ({
		agent: a.shadowed ? `${a.slug} (shadowed)` : a.slug,
		source: sourceLabel(a.source),
		harness: deriveHarness(a, deps) ?? "?",
		model: a.model ?? "—",
		description: a.description,
	}));
	const w = {
		agent: Math.max(5, ...rows.map((r) => r.agent.length)),
		source: Math.max(6, ...rows.map((r) => r.source.length)),
		harness: Math.max(7, ...rows.map((r) => r.harness.length)),
		model: Math.max(5, ...rows.map((r) => r.model.length)),
	};
	const header = `${pad("AGENT", w.agent)}  ${pad("SOURCE", w.source)}  ${pad("HARNESS", w.harness)}  ${pad("MODEL", w.model)}  DESCRIPTION`;
	const lines = rows.map(
		(r) =>
			`${pad(r.agent, w.agent)}  ${pad(r.source, w.source)}  ${pad(r.harness, w.harness)}  ${pad(r.model, w.model)}  ${r.description}`,
	);
	const counts = tally(agents);
	const summary = `\n${agents.length} agent${agents.length === 1 ? "" : "s"} · ${counts}`;
	return { stdout: [header, ...lines].join("\n") + summary, stderr: "", exitCode: 0 };
}

function sourceLabel(s: DiscoveredAgent["source"]): string {
	return s === "builtin" ? "built-in" : s;
}

function tally(agents: DiscoveredAgent[]): string {
	const by = { project: 0, user: 0, builtin: 0 };
	for (const a of agents) by[a.source]++;
	const parts: string[] = [];
	if (by.project) parts.push(`${by.project} project (./agents)`);
	if (by.user) parts.push(`${by.user} user (~/.pij/agents)`);
	if (by.builtin) parts.push(`${by.builtin} built-in (pij)`);
	return `sources: ${parts.join(" · ")}`;
}

function pad(s: string, n: number): string {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// ─── run (named + inline + ephemeral) ─────────────────────────────────────────

export async function runVerb(cmd: ParsedAgentCommand, deps: VerbDeps): Promise<VerbResult> {
	// AC-05: sweep crash-leftover temp packs at the start of EVERY run (inline
	// users may never start the daemon, so the daemon-start hook alone is not enough).
	sweepStaleTmp(deps.pijHome);

	const inline = cmd.prompt !== undefined || cmd.promptStdin;
	if (inline) return runInline(cmd, deps);
	return runNamed(cmd, deps);
}

async function runNamed(cmd: ParsedAgentCommand, deps: VerbDeps): Promise<VerbResult> {
	const slug = cmd.slug as string;
	const agent = findAgent(slug, deps);
	if (!agent) return errResult({ code: "E-NOAGENT", slug });

	const model = cmd.model ?? agent.model;
	const effort = cmd.effort ?? agent.reasoning;
	const harness =
		cmd.harness ?? agent.harness ?? deps.harnessForModel(model) ?? deps.defaultHarness;

	emitWarnings(model, effort, deps);

	const adapterRes = await deps.makeAdapter(harness);
	if (!adapterRes.ok) return errResult(adapterRes.error);

	// Built-ins are read-only: minih roots `runs/` at the pack dir (the installed
	// package), so they MUST run through the temp-copy path (KF-07 / AC-08). A
	// user opts into recording with `pij agent eject`.
	const ephemeral = cmd.ephemeral || agent.source === "builtin";
	const overrides = buildOverrides(cmd);
	const params = coerceParams(cmd.params);
	const permissions = cmd.permissions ?? "read-only";

	deps.progress(
		`▸ ${agent.slug} (${sourceLabel(agent.source)}) · harness ${harness} · model ${model ?? "?"}${effort ? ` · effort ${effort}` : ""}${ephemeral ? " · ephemeral (not recorded)" : ""}`,
	);
	deps.progress("▸ running… (stream on stderr; --quiet to silence)");

	const result = ephemeral
		? await runEphemeralPack({
				packDir: agent.dir,
				slug: agent.slug,
				adapter: adapterRes.adapter,
				pijHome: deps.pijHome,
				params,
				overrides,
			})
		: await runAgentPack({
				slug: agent.slug,
				agentsDir: dirname(agent.dir),
				adapter: adapterRes.adapter,
				params,
				overrides,
			});

	return renderRun(result, {
		slug: agent.slug,
		model,
		harness,
		effort,
		ephemeral,
		json: cmd.json,
		permissions,
	});
}

async function runInline(cmd: ParsedAgentCommand, deps: VerbDeps): Promise<VerbResult> {
	const prompt = cmd.promptStdin ? (deps.readStdin?.() ?? "") : (cmd.prompt ?? "");
	if (!prompt.trim()) return errResult({ code: "E-ARG", message: "inline prompt is empty" });

	const model = cmd.model;
	const effort = cmd.effort;
	const harness = cmd.harness ?? deps.harnessForModel(model) ?? deps.defaultHarness;

	emitWarnings(model, effort, deps);

	const adapterRes = await deps.makeAdapter(harness);
	if (!adapterRes.ok) return errResult(adapterRes.error);

	let outputSchema: unknown;
	if (cmd.outputSchema) {
		try {
			outputSchema = JSON.parse(readFileSync(cmd.outputSchema, "utf8"));
		} catch (e) {
			return errResult({
				code: "E-ARG",
				message: `--output-schema '${cmd.outputSchema}' is not readable JSON: ${(e as Error).message}`,
			});
		}
	}

	deps.progress(
		`▸ inline · harness ${harness}${model ? ` · model ${model}` : ""}${effort ? ` · effort ${effort}` : ""} · ephemeral (not recorded)`,
	);
	deps.progress("▸ running… (stream on stderr; --quiet to silence)");

	const result = await runInlineAgent({
		prompt,
		adapter: adapterRes.adapter,
		pijHome: deps.pijHome,
		params: coerceParams(cmd.params),
		overrides: buildOverrides(cmd),
		...(outputSchema !== undefined ? { outputSchema } : {}),
	});

	return renderRun(result, {
		slug: "(inline)",
		model,
		harness,
		effort,
		ephemeral: true,
		json: cmd.json,
		permissions: cmd.permissions ?? "read-only",
	});
}

function buildOverrides(cmd: ParsedAgentCommand): RunOverrides {
	return {
		...(cmd.model !== undefined ? { model: cmd.model } : {}),
		...(cmd.effort !== undefined ? { effort: cmd.effort } : {}),
		...(cmd.timeout !== undefined ? { timeout: cmd.timeout } : {}),
		...(cmd.harness !== undefined ? { harness: cmd.harness } : {}),
		...(cmd.cwd !== undefined ? { cwd: cmd.cwd } : {}),
		...(cmd.permissions !== undefined ? { permissions: cmd.permissions } : {}),
	};
}

function emitWarnings(model: string | undefined, effort: string | undefined, deps: VerbDeps): void {
	const mw = deps.modelWarning(model);
	if (mw) deps.progress(mw);
	const ew = deps.effortWarning(effort, model);
	if (ew) deps.progress(ew);
}

interface RunView {
	slug: string;
	model: string | undefined;
	harness: string;
	effort: string | undefined;
	ephemeral: boolean;
	json: boolean;
	permissions: string;
}

/** Classify a completed run's metadata into a terminal error, or null on success.
 *  Pure + exported so the E-PERMISSION / E-RUNFAILED mapping is unit-testable
 *  without driving a real (permission-denying) adapter. E-PERMISSION wins: a real
 *  recorded run once died silently on a permission denial (workshop 002 § Errors). */
export function runOutcomeError(
	meta: { result: string; permissionError?: { kind: string } },
	ctx: { preset: string; reportPath: string | null },
): AgentError | null {
	if (meta.permissionError) {
		return { code: "E-PERMISSION", kind: meta.permissionError.kind, preset: ctx.preset };
	}
	if (meta.result !== "completed") {
		return { code: "E-RUNFAILED", reason: meta.result, reportPath: ctx.reportPath };
	}
	return null;
}

/** Map a `RunPackResult` to the human summary or `--json` envelope (AC-09/AC-10). */
function renderRun(result: RunPackResult, view: RunView): VerbResult {
	if (!result.ok) {
		if (result.code === "E-NOAGENT") return errResult({ code: "E-NOAGENT", slug: view.slug });
		return errResult({ code: "E-BADINPUT", errors: result.errors });
	}

	const meta = result.runResult.metadata;
	const runDir = view.ephemeral ? null : result.runResult.runDir;
	const reportPath = runDir ? join(runDir, "output", "report.json") : null;

	const outcome = runOutcomeError(meta, { preset: view.permissions, reportPath });
	if (outcome) return errResult(outcome);

	const report = result.runResult.parsedReport;
	const validated = meta.validated ?? meta.systemValidated;

	if (view.json) {
		const envelope = {
			run: {
				slug: view.slug,
				status: meta.result,
				model: view.model ?? null,
				harness: view.harness,
				effort: view.effort ?? null,
				runDir,
				validated,
			},
			report,
		};
		return { stdout: JSON.stringify(envelope, null, 2), stderr: "", exitCode: 0 };
	}

	const lines = [
		`✔ done · ${view.slug} · validated ${validated ? "✓" : "—"}`,
		"",
		report?.summary ? `  ${report.summary}` : "  (no summary in report)",
	];
	if (reportPath) lines.push("", `  report: ${reportPath}`);
	return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
}

// ─── show ──────────────────────────────────────────────────────────────────

export function showVerb(cmd: ParsedAgentCommand, deps: VerbDeps): VerbResult {
	const slug = cmd.slug as string;
	const agent = findAgent(slug, deps);
	if (!agent) return errResult({ code: "E-NOAGENT", slug });

	const def = resolveAgent(agent.slug, dirname(agent.dir));
	const harness = deriveHarness(agent, deps) ?? "?";
	const isBuiltin = agent.source === "builtin";
	const header = isBuiltin
		? `${agent.slug}  (built-in, read-only — \`pij agent eject ${agent.slug}\` to customise)`
		: `${agent.slug}  (${agent.source})`;

	const permissions = def?.permissions
		? summarizePermissions(def.permissions)
		: "(harness default)";
	const lines = [
		header,
		`  description : ${agent.description}`,
		`  model       : ${agent.model ?? "(harness default)"} (harness: ${harness})   reasoning: ${agent.reasoning ?? "(default)"}   permissions: ${permissions}`,
	];

	const inputDesc = describeInputSchema(def?.inputSchemaPath ?? null);
	if (inputDesc) lines.push(`  input       : ${inputDesc}`);
	lines.push(
		`  output      : ${def?.schemaPath ? "summary + schema-validated output (output-schema.json)" : "summary + retrospective (system envelope)"}`,
	);
	lines.push(`  files       : ${readdirSync(agent.dir).sort().join(" · ")}`);

	return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
}

function summarizePermissions(perm: PermissionPolicy): string {
	const preset = perm.preset ?? "read-only";
	return perm.overrides?.shell ? `${preset} + shell:${String(perm.overrides.shell)}` : preset;
}

function describeInputSchema(schemaPath: string | null): string | null {
	if (!schemaPath || !existsSync(schemaPath)) return null;
	try {
		const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
			properties?: Record<string, { type?: string; default?: unknown }>;
			required?: string[];
		};
		const required = new Set(schema.required ?? []);
		const props = Object.entries(schema.properties ?? {});
		if (props.length === 0) return null;
		return props
			.map(([name, spec]) => {
				const req = required.has(name) ? "required" : `default ${JSON.stringify(spec.default)}`;
				return `${name} (${spec.type ?? "any"}, ${req})`;
			})
			.join(" · ");
	} catch {
		return "(input-schema.json is not valid JSON)";
	}
}

// ─── new ─────────────────────────────────────────────────────────────────────

export function newVerb(cmd: ParsedAgentCommand, deps: VerbDeps): VerbResult {
	const slug = cmd.slug as string;
	const dest = join(deps.cwd, "agents", slug);
	if (existsSync(dest)) {
		return errResult({ code: "E-ARG", message: `./agents/${slug} already exists` });
	}

	// Prefer minih's own scaffolder (byte-compatible pack) when available (workshop
	// 001 D4); else write pij's bundled template. Both emit a NON-EMPTY frontmatter
	// `description` — minih's listAgents silently drops packs without one (gotcha C).
	if (deps.hasMinihBinary?.() && deps.runMinihInit) {
		const r = deps.runMinihInit(slug, deps.cwd);
		if (!r.ok) {
			return errResult({ code: "E-ARG", message: `minih init failed: ${r.stderr}` });
		}
		return {
			stdout: `Created ./agents/${slug}/ (via minih init). Edit prompt.md, then \`pij agent run ${slug}\`.`,
			stderr: "",
			exitCode: 0,
		};
	}

	writeBundledTemplate(dest, slug);
	return {
		stdout: `Created ./agents/${slug}/ (bundled template). Edit prompt.md, then \`pij agent run ${slug}\`.`,
		stderr: "",
		exitCode: 0,
	};
}

/** pij's bundled minih-compatible pack template (runs unchanged under stock minih). */
function writeBundledTemplate(dest: string, slug: string): void {
	mkdirSync(dest, { recursive: true });
	writeFileSync(
		join(dest, "prompt.md"),
		`---
description: A ${slug} agent. Replace this line with what it does (required, non-empty).
tags: []
model: claude-sonnet-4-6
reasoning: low
---

# ${slug}

Describe the task here. This prompt becomes the agent's system prompt.

Read the input params, do the work, then produce the required output JSON.
`,
	);
	writeFileSync(
		join(dest, "input-schema.json"),
		`${JSON.stringify(
			{
				$schema: "https://json-schema.org/draft/2020-12/schema",
				type: "object",
				properties: { query: { type: "string", description: "The thing to work on." } },
				required: ["query"],
				additionalProperties: false,
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(dest, "output-schema.json"),
		`${JSON.stringify(
			{
				$schema: "https://json-schema.org/draft/2020-12/schema",
				type: "object",
				properties: { summary: { type: "string" } },
				required: ["summary"],
			},
			null,
			2,
		)}\n`,
	);
}

// ─── check ─────────────────────────────────────────────────────────────────

export function checkVerb(cmd: ParsedAgentCommand, deps: VerbDeps): VerbResult {
	const slug = cmd.slug as string;
	const agent = findAgent(slug, deps);
	if (!agent) return errResult({ code: "E-NOAGENT", slug });

	const errors: string[] = [];

	// Frontmatter: description must be non-empty (minih drops packs without one).
	try {
		const fm = parseFrontmatter(readFileSync(join(agent.dir, "prompt.md"), "utf8"));
		if (!fm.description.trim()) errors.push("prompt.md: frontmatter `description` is empty");
	} catch (e) {
		errors.push(`prompt.md: ${(e as Error).message}`);
	}

	// Schemas must be valid JSON (minih's validators would AJV-compile these).
	for (const file of ["input-schema.json", "output-schema.json"]) {
		const path = join(agent.dir, file);
		if (!existsSync(path)) continue;
		try {
			JSON.parse(readFileSync(path, "utf8"));
		} catch (e) {
			errors.push(`${file}: not valid JSON — ${(e as Error).message}`);
		}
	}

	if (errors.length > 0) {
		return {
			stdout: "",
			stderr: `check failed for '${slug}':\n${errors.map((x) => `  - ${x}`).join("\n")}`,
			exitCode: exitCodeFor("E-BADINPUT"),
		};
	}
	return { stdout: `✔ ${slug} is valid.`, stderr: "", exitCode: 0 };
}

// ─── eject ─────────────────────────────────────────────────────────────────

export function ejectVerb(cmd: ParsedAgentCommand, deps: VerbDeps): VerbResult {
	const slug = cmd.slug as string;
	const builtinPack = join(deps.builtinDir, slug);
	if (!existsSync(join(builtinPack, "prompt.md"))) {
		return errResult({ code: "E-NOAGENT", slug });
	}
	const dest = join(deps.cwd, "agents", slug);
	if (existsSync(dest)) {
		return errResult({
			code: "E-ARG",
			message: `./agents/${slug} already exists (eject would overwrite)`,
		});
	}
	mkdirSync(join(deps.cwd, "agents"), { recursive: true });
	cpSync(builtinPack, dest, { recursive: true });
	return {
		stdout: `Ejected built-in '${slug}' → ./agents/${slug} (now shadows the built-in; runs are recorded).`,
		stderr: "",
		exitCode: 0,
	};
}

// ─── dispatch ─────────────────────────────────────────────────────────────

/** Route a parsed command to its verb. `run` is async; the rest are synchronous. */
export async function dispatchAgent(cmd: ParsedAgentCommand, deps: VerbDeps): Promise<VerbResult> {
	switch (cmd.subverb) {
		case "list":
			return listVerb(cmd, deps);
		case "run":
			return runVerb(cmd, deps);
		case "show":
			return showVerb(cmd, deps);
		case "new":
			return newVerb(cmd, deps);
		case "check":
			return checkVerb(cmd, deps);
		case "eject":
			return ejectVerb(cmd, deps);
		case "spawn":
		case "report":
			// Peer-mode subverbs are impure (tmux split / registry / channel) and are
			// intercepted at the bin layer (cli.ts runAgentSpawn/runAgentReport) BEFORE
			// dispatchAgent. Reaching here means the bin wiring regressed.
			return {
				stdout: "",
				stderr: `E-ARG: '${cmd.subverb}' is handled by the pij bin, not the pure verb dispatcher`,
				exitCode: exitCodeFor("E-ARG"),
			};
	}
}

export type { AgentErrorCode };
// Re-export for the bin's error path (arg-parse failures render the same way).
export { exitCodeFor };
