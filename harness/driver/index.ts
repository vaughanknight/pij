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
