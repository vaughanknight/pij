// harness/driver/index.ts
//
// Public surface of the Driver SDK. Re-exports primitives, the Session
// class, and the error hierarchy. Orchestrates Session + Scenario into
// runScenario(). Per workshop 001 § Module: index.ts.

import { execFileSync } from "node:child_process";

export type { AssertionContext } from "./errors.js";
export {
	DriverAssertionError,
	DriverBootError,
	DriverError,
	DriverIdleTimeoutError,
	DriverPaneDeadError,
} from "./errors.js";
export { Session, type Step, type WaitIdleOpts } from "./session.js";
export type { BootOpts, CaptureOpts, Key, PaneInfo, Target } from "./tmux.js";
export {
	boot,
	capture,
	hasSession,
	inspect,
	paste,
	press,
	record,
	targetStr,
	teardown,
	type as send, // re-exported under `send` to avoid shadowing the `type` keyword
} from "./tmux.js";

import type { DriverAssertionError } from "./errors.js";
import { Session, type Step } from "./session.js";

// ─── Scenario shape (workshop 001 D2: clean break from legacy SmokeStep) ────

export interface Scenario {
	name: string;
	cwd?: string; // default = process.cwd()
	cmd?: string; // default = "pi"
	cols?: number;
	rows?: number;
	env?: Record<string, string>;
	bootReadyTimeoutMs?: number; // default 30_000
	recordPath?: string;
	steps: Step[];
}

export interface RunReport {
	scenario: string;
	ok: boolean;
	durationMs: number;
	executedSteps: number;
	captures: Record<string, string>;
	summary: {
		passed: number;
		failed: number;
		durationMs: number;
	};
	failure?:
		| ReturnType<DriverAssertionError["toReport"]>
		| {
				kind: "boot-failed" | "idle-timeout" | "pane-dead" | "preflight-failed" | "other";
				message: string;
		  };
}

// ─── JSON-regex wire format (per plan T004 Notes) ───────────────────────────
//
// Steps that come over the wire (from a JSON scenario file consumed by
// run.ts or the validator agent) cannot carry native RegExp. We use
// `{ source: string; flags?: string }` because it matches
// RegExp.prototype.source — symmetric round-trip. Plan T004 Notes flags
// workshop 001 lines 905+907 mentioning both `source` and `regex`; the
// chosen wire shape is `source`.

interface JsonRegex {
	source: string;
	flags?: string;
}

function isJsonRegex(v: unknown): v is JsonRegex {
	return (
		!!v &&
		typeof v === "object" &&
		"source" in v &&
		typeof (v as { source: unknown }).source === "string"
	);
}

function hydrateRegex(v: RegExp | JsonRegex | undefined): RegExp | undefined {
	if (v === undefined) return undefined;
	if (v instanceof RegExp) return v;
	if (isJsonRegex(v)) return new RegExp(v.source, v.flags);
	return undefined;
}

/**
 * Hydrate any expect/signal fields in a Scenario's steps from JSON-regex
 * wire shape (`{ source, flags? }`) into native RegExp. Safe to call on a
 * Scenario whose steps already carry native RegExp (passes them through).
 */
export function hydrateScenario(s: Scenario): Scenario {
	return {
		...s,
		steps: s.steps.map((step) => {
			if (step.kind === "type" || step.kind === "press" || step.kind === "paste") {
				return { ...step, expect: hydrateRegex(step.expect as RegExp | JsonRegex | undefined) };
			}
			if (step.kind === "wait") {
				return { ...step, signal: hydrateRegex(step.signal as RegExp | JsonRegex | undefined) };
			}
			return step;
		}),
	};
}

// ─── Loader (IA-09) ─────────────────────────────────────────────────────────

export async function loadScenario(path: string): Promise<Scenario> {
	const url = new URL(`file://${path}`);
	const mod = (await import(url.href)) as { default: unknown };
	if (!isScenario(mod.default)) {
		throw new Error(`scenario ${path} default export does not match Scenario shape`);
	}
	return hydrateScenario(mod.default);
}

export function isScenario(v: unknown): v is Scenario {
	if (!v || typeof v !== "object") return false;
	const o = v as Record<string, unknown>;
	return typeof o.name === "string" && Array.isArray(o.steps);
}

// ─── Pre-flight (D-013 extended) ────────────────────────────────────────────

export interface PreflightResult {
	ok: boolean;
	tmuxVersion?: string;
	piVersion?: string;
	missing: string[];
}

export function preflight(): PreflightResult {
	const missing: string[] = [];
	let tmuxVersion: string | undefined;
	let piVersion: string | undefined;
	try {
		const out: string = execFileSync("tmux", ["-V"], { encoding: "utf8" });
		tmuxVersion = out.trim();
	} catch {
		missing.push("tmux");
	}
	try {
		const out: string = execFileSync("pi", ["--version"], { encoding: "utf8" });
		piVersion = out.trim();
	} catch {
		missing.push("pi");
	}
	return { ok: missing.length === 0, tmuxVersion, piVersion, missing };
}

// ─── runScenario — the high-level orchestrator ──────────────────────────────

export async function runScenario(
	scenario: Scenario,
	override: { cwd?: string; cmd?: string; recordPath?: string } = {},
): Promise<RunReport> {
	const t0 = Date.now();
	const captures: Record<string, string> = {};
	const hydrated = hydrateScenario(scenario);

	const pre = preflight();
	if (!pre.ok) {
		const durationMs = Date.now() - t0;
		return {
			scenario: hydrated.name,
			ok: false,
			durationMs,
			executedSteps: 0,
			captures,
			summary: { passed: 0, failed: 0, durationMs },
			failure: {
				kind: "preflight-failed",
				message: `missing: ${pre.missing.join(", ")}`,
			},
		};
	}

	const session = await Session.start({
		session: `pij-${hydrated.name}-${process.pid}`,
		cwd: override.cwd ?? hydrated.cwd ?? process.cwd(),
		cmd: override.cmd ?? hydrated.cmd ?? "pi",
		cols: hydrated.cols,
		rows: hydrated.rows,
		env: hydrated.env,
		recordPath: override.recordPath ?? hydrated.recordPath,
	});

	let executed = 0;
	try {
		await session.waitIdle({ timeoutMs: hydrated.bootReadyTimeoutMs ?? 30_000 });
		for (const step of hydrated.steps) {
			await session.execute(step);
			executed++;
		}
		Object.assign(captures, session.capturedNamed());
		const durationMs = Date.now() - t0;
		return {
			scenario: hydrated.name,
			ok: true,
			durationMs,
			executedSteps: executed,
			captures,
			summary: { passed: executed, failed: 0, durationMs },
		};
	} catch (err) {
		Object.assign(captures, session.capturedNamed());
		const failure = toFailureReport(err);
		const durationMs = Date.now() - t0;
		return {
			scenario: hydrated.name,
			ok: false,
			durationMs,
			executedSteps: executed,
			captures,
			summary: { passed: executed, failed: 1, durationMs },
			failure,
		};
	} finally {
		session.teardown();
	}
}

function toFailureReport(err: unknown): RunReport["failure"] {
	if (err && typeof err === "object" && "name" in err) {
		const e = err as { name: string; message: string; toReport?: () => unknown };
		if (e.name === "DriverAssertionError" && typeof e.toReport === "function") {
			return e.toReport() as RunReport["failure"];
		}
		if (e.name === "DriverBootError") return { kind: "boot-failed", message: e.message };
		if (e.name === "DriverIdleTimeoutError") return { kind: "idle-timeout", message: e.message };
		if (e.name === "DriverPaneDeadError") return { kind: "pane-dead", message: e.message };
	}
	return { kind: "other", message: err instanceof Error ? err.message : String(err) };
}

// ─── compactAndAssert (AC-12 gift; workshop 004 § Helper utilities) ───────
//
// Drive pi through `/compact` (and optionally `/reload`), capture the
// extension's status JSON before/after, and report any divergences. The
// canonical use-case is Plan 008 AC-05: prove that `customType` entries
// appended by an extension survive context compaction. Reusable across
// every future event-sourced extension.
//
// Design choices:
// - Pure `compareFields()` is exported separately so unit tests cover
//   the diff logic without needing a tmux mock.
// - `extractLatestJsonObject()` finds the last balanced `{...}` block in
//   pane scrollback and returns the parsed object. It is intentionally
//   permissive about pi's chrome around the JSON envelope.
// - JSON envelope must be EMITTED by the extension's status command
//   (Plan 008: `/ralph status --json`). Helper does not enrich it.
// - When divergences are found we DO NOT throw — callers compose this
//   into a smoke step that decides the failure shape (workshop 004
//   § Failure interpretation). `ok: false + divergences[]` is the wire.

export interface CompactAssertOpts {
	/** Status command to run before and after /compact (must emit JSON in pane). */
	statusCommand: string;
	/** Field paths in the parsed JSON to compare for equality. Default: ["iterations"]. */
	fields?: readonly string[];
	/** Wall-clock to allow /compact to complete. Default: 30_000. */
	compactTimeoutMs?: number;
	/** Whether to also run /reload and re-assert after. Default: true. */
	includeReloadCheck?: boolean;
	/** Wall-clock to allow /reload to complete. Default: 30_000. */
	reloadTimeoutMs?: number;
	/** Regex that signals the JSON envelope has been printed by the status command. Default: `/\}\s*$/m`. */
	jsonReadyRe?: RegExp;
}

export interface CompactAssertDivergence {
	field: string;
	pre: unknown;
	post: unknown;
	phase: "compact" | "reload";
}

export interface CompactAssertResult {
	ok: boolean;
	pre: Record<string, unknown>;
	postCompact: Record<string, unknown>;
	postReload?: Record<string, unknown>;
	divergences: CompactAssertDivergence[];
}

export async function compactAndAssert(
	session: Session,
	opts: CompactAssertOpts,
): Promise<CompactAssertResult> {
	const fields = opts.fields ?? ["iterations"];
	const compactTimeoutMs = opts.compactTimeoutMs ?? 30_000;
	const includeReloadCheck = opts.includeReloadCheck ?? true;
	const reloadTimeoutMs = opts.reloadTimeoutMs ?? 30_000;
	const jsonReadyRe = opts.jsonReadyRe ?? /\}\s*$/m;

	const pre = await runStatusAndCapture(session, opts.statusCommand, jsonReadyRe);

	await session.execute({ kind: "type", text: "/compact", press: "Enter" });
	await session.waitIdle({ timeoutMs: compactTimeoutMs });
	const postCompact = await runStatusAndCapture(session, opts.statusCommand, jsonReadyRe);

	const divergences: CompactAssertDivergence[] = [
		...compareFields(pre, postCompact, fields, "compact"),
	];

	let postReload: Record<string, unknown> | undefined;
	if (includeReloadCheck) {
		await session.execute({ kind: "type", text: "/reload", press: "Enter" });
		await session.waitIdle({ timeoutMs: reloadTimeoutMs });
		postReload = await runStatusAndCapture(session, opts.statusCommand, jsonReadyRe);
		divergences.push(...compareFields(pre, postReload, fields, "reload"));
	}

	return {
		ok: divergences.length === 0,
		pre,
		postCompact,
		postReload,
		divergences,
	};
}

async function runStatusAndCapture(
	session: Session,
	statusCommand: string,
	jsonReadyRe: RegExp,
): Promise<Record<string, unknown>> {
	const pane = await session.run(statusCommand, jsonReadyRe);
	return extractLatestJsonObject(pane);
}

/**
 * Find every balanced `{...}` block in `pane`, parse from the LAST one back
 * to the first, and return the first that parses to a non-array object.
 * Returns `{}` if none parse. Intentionally permissive about preceding chrome.
 */
export function extractLatestJsonObject(pane: string): Record<string, unknown> {
	const matches: string[] = [];
	let depth = 0;
	let start = -1;
	let inString = false;
	let escape = false;
	for (let i = 0; i < pane.length; i++) {
		const c = pane.charAt(i);
		if (inString) {
			if (escape) escape = false;
			else if (c === "\\") escape = true;
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') {
			inString = true;
			continue;
		}
		if (c === "{") {
			if (depth === 0) start = i;
			depth++;
		} else if (c === "}") {
			depth--;
			if (depth === 0 && start >= 0) {
				matches.push(pane.substring(start, i + 1));
				start = -1;
			} else if (depth < 0) {
				depth = 0;
				start = -1;
			}
		}
	}
	for (let i = matches.length - 1; i >= 0; i--) {
		const raw = matches[i];
		if (raw === undefined) continue;
		try {
			const obj = JSON.parse(raw) as unknown;
			if (obj && typeof obj === "object" && !Array.isArray(obj)) {
				return obj as Record<string, unknown>;
			}
		} catch {
			// try next
		}
	}
	return {};
}

/** Pure function: compare a set of top-level fields between two parsed status envelopes. */
export function compareFields(
	pre: Record<string, unknown>,
	post: Record<string, unknown>,
	fields: readonly string[],
	phase: CompactAssertDivergence["phase"],
): CompactAssertDivergence[] {
	const out: CompactAssertDivergence[] = [];
	for (const field of fields) {
		if (!deepEqual(pre[field], post[field])) {
			out.push({ field, pre: pre[field], post: post[field], phase });
		}
	}
	return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}
	if (typeof a === "object" && typeof b === "object") {
		const ak = Object.keys(a as object).sort();
		const bk = Object.keys(b as object).sort();
		if (ak.length !== bk.length) return false;
		if (!ak.every((k, i) => k === bk[i])) return false;
		return ak.every((k) =>
			deepEqual(
				(a as Record<string, unknown>)[k],
				(b as Record<string, unknown>)[k],
			),
		);
	}
	return false;
}
