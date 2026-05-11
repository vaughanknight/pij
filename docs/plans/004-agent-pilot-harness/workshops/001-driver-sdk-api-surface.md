# Workshop 001: Driver SDK API Surface

**Type**: API Contract
**Plan**: 004-agent-pilot-harness
**Spec**: *(not yet written — workshop precedes spec; produces paste-ready code for `/plan-1b-specify --simple`)*
**Created**: 2026-05-10
**Status**: Draft

**Value Thesis**: This workshop turns "the harness drives tmux" from a tribal recipe scattered across `smoke.ts` into a **typed, encoded, paste-ready module** at `harness/driver/`. Twelve tmux gotchas (TC-01..TC-12) and ten `smoke.ts` brittleness points (IA-01..IA-10) get encoded once, so every future minih agent inherits them without rediscovery. After this lands, "drive `pi` in tmux" becomes a four-line idiom for any caller — script, agent, or REPL.

**Target Proof Level**: **Implementation Ready** — the implementation phase should be transcription, not design.
**Current Proof Level**: **Contract Ready** approaching Implementation Ready (every public method has a paste-ready body; integration tests are sketched but not yet validated against a live tmux).

**Selected Value Axes**:
- **Implementation Readiness**: every type and method has a paste-ready body in the file it will live in.
- **Agent Readiness**: minih agents shell into `harness/driver/run.ts`; the JSON contract is locked here.
- **Knowability**: 12 tmux gotchas and 4 pi rendering gotchas are encoded with citations to the research dossier.
- **Learning Compounding**: this surface is exactly where magic-wand wishes from validator-agents will land — defining it well makes the wish-loop productive.

**Related Documents**:
- [`../research-dossier.md`](../research-dossier.md) — research that drove this design (TC, PR, IA, MA, PL, EX findings)
- [`../../003-scratch/`](../../003-scratch/) — the first kept extension; its `smoke.ts` is the validator's first target
- [`../../../project-rules/harness.md`](../../../project-rules/harness.md) — current Boot/Interact/Observe contract this plan upgrades

**Domain Context**: pij has no formal `docs/domains/` registry. The relevant boundary is **harness ↔ extension**: the Driver SDK lives entirely in `harness/`; extensions consume it only through `smoke.ts` exports.

---

## Purpose

Specify the public API of `harness/driver/` — the typed module that wraps `tmux`, drives `pi`, and exposes a tested surface for three classes of caller: the existing `smoke.ts` runner, the future `extension-validator` minih agent, and humans debugging in a REPL. Every gotcha surfaced by research is encoded here so that no caller has to rediscover it.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Drop `harness/driver/{tmux,session,index,errors}.ts` into the repo from this document, run `npm run typecheck`, and have it pass.
- Rewrite `harness/scripts/smoke.ts` as a ~25-line adapter over `runScenario()`.
- Write `harness/driver/run.ts` — a CLI invoked by minih agents with a JSON scenario — in <40 lines.
- Author `.pi/extensions/<name>/smoke.ts` files using only `Scenario` and `Step` types from `harness/driver`, with the discriminated-union `Step` shape.
- Mock `child_process.execFileSync` in unit tests to assert tmux argv shape without a live tmux.

## Key Questions Addressed

1. What is the smallest type-safe API that wraps the 12 tmux primitives identified in TC-01..TC-12?
2. How does an agent detect "pi is ready for the next command" without a fixed sleep? (PR-07)
3. How does the SDK refuse the four classes of brittleness in `smoke.ts` today (IA-01..IA-10)?
4. What does a minih `extension-validator` agent invoke — a TS module, or a CLI runner with JSON input?
5. What does a `Scenario` JSON file look like such that it's safe to ship in `.pi/extensions/<name>/smoke.ts`?
6. What does `DriverAssertionError` carry so failures are debuggable without spelunking?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | Plan-3-architect should treat this as transcription input — same model as workshop 003 → scratch. |
| Primary Value Axis | Implementation Readiness | The implementation phase ships if and only if this contract is paste-ready. |
| Supporting Value Axes | Agent Readiness, Knowability, Learning Compounding | The agent slug and the magic-wand loop both depend on this surface. |
| Downstream Loop Improved | Implementation + Agent execution + Future-extension authoring | One module replaces three rediscovery loops (smoke author, validator-agent author, ad-hoc human debugger). |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Tmux primitive command shapes (12 functions) | § Module: `tmux.ts` | TC-01..TC-12 encoded | Ready |
| `Session` class with `waitIdle` + `run` | § Module: `session.ts` | PR-07 readiness strategy + IA-02 retry fix | Ready |
| `Scenario` + `Step` discriminated union | § Module: `index.ts` | IA-03 typed-step refactor | Ready |
| `DriverAssertionError` with `actual`, `scrollback`, `priorSteps` | § Module: `errors.ts` | IA-08 structured failure | Ready |
| Pre-flight `preflight()` (`tmux -V`, `pi --version`) | § Module: `index.ts` | D-013 fresh-clone safety extended | Ready |
| Adapter: `smoke.ts` rewritten over driver | § Adapter | IA-04 + IA-09 | Ready |
| Agent CLI: `harness/driver/run.ts` | § Agent CLI | MA-02 (agents shell into pij) | Ready |
| Unit test pattern (mocked `execFileSync`) | § Testing strategy | New finding — validates argv shape without live tmux | Ready |
| Live-tmux integration test sketch | § Testing strategy | Validates real tmux behavior end-to-end | Sketched (drives `bash`, not `pi`, to stay deterministic) |
| Asciinema-style transcript via `pipe-pane` | § Recording | TC-06 + EX-05 | Ready |

## Decision Space

| # | Question | Option A | Option B | Decision |
|---|----------|----------|----------|----------|
| D1 | Functional vs class API for sessions | Functional: every primitive takes `Target` first arg | Class: `Session` owns lifecycle | **Both.** Functional primitives stay public for power users (`type`, `press`, `capture`, `paste`); `Session` is the ergonomic wrapper most callers use. |
| D2 | Backwards-compat with current `SmokeStep`? | Keep `{send, expect, delay}` | Clean break to discriminated `Step` union | **Clean break.** Only one extension exists today (scratch). Its `smoke.ts` gets rewritten in this plan as part of the migration. Cost is one ~30-line file. |
| D3 | Should `runScenario` collect findings/wishes? | Yes — emits structured report | No — pure mechanical execution; throws on failure | **No.** Reporting and magic-wand wishes are the agent's job (workshop 002). The SDK stays pure: drive, assert, throw. |
| D4 | How does the validator agent invoke the SDK? | Import the TS module via `tsx -e "..."` | Shell into a CLI runner with JSON input | **CLI runner.** `harness/driver/run.ts` takes a JSON scenario on stdin or via `--scenario <path>`, prints JSON result. Cheap to call from any agent. Module also exported for in-process callers. |
| D5 | Geometry default | 120×40 (today's smoke) | 200×50 (per TC-09) | **200×50.** Wider avoids pi banner wrap; configurable per scenario. |
| D6 | Send risky payloads | Always `send-keys -l` | Auto-route to `paste-buffer` if risky | **Auto-route.** A regex `/[\n"`$;]|^-/` triggers `paste()` instead of `type()`. Caller can force either with `step.kind`. |
| D7 | Should `Session.boot` accept a shell pipeline? | Accept `cmd: "cd /x && pi"` | Force `cwd:` + `cmd: "pi"` separation | **Force separation.** Better hygiene; `new-session -c <cwd> ... <cmd>` natively splits these. |
| D8 | Test strategy | Live tmux only | Mocked `execFileSync` for unit, live tmux for integration | **Both layers.** Unit tests mock `execFileSync` to assert argv shape. Integration tests drive real tmux against `bash` (not `pi`) to verify `waitIdle`/`run` semantics deterministically. Ext-validator pilot is the end-to-end test against real `pi`. |

## Attention Reduction

| Future loop | Before workshop | After workshop |
|-------------|-----------------|----------------|
| Implementation | Transcribe smoke.ts patterns + reinvent argv quoting + figure out readiness from scratch | Paste from § Module sections; tests already pattern-shaped |
| Review | Reviewer reads tmux man page to judge correctness | Reviewer checks against this workshop's TC-NN citations |
| Testing | Author reinvents how to test tmux automation | `makeFakeTmux()` pattern in § Testing covers 90% of cases |
| Agent execution | Validator agent must learn tmux | Agent shells `tsx harness/driver/run.ts` with JSON; never sees tmux |
| Future extension authoring | Each `smoke.ts` invents its step shape | `Scenario`/`Step` types are imported, autocompleted |

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- All four module files (`tmux.ts`, `session.ts`, `errors.ts`, `index.ts`) compile under pij's existing `npm run typecheck` if pasted as-is.
- The rewritten `smoke.ts` adapter (§ Adapter) drives scratch's `smoke.ts` to green using only this workshop's exports.
- A unit test for `Session.run()` passes with a `makeFakeTmux()` in place of real `tmux`.
- The CLI runner `harness/driver/run.ts` accepts the JSON scenario shape in § Agent CLI and prints a `RunReport`.

---

## Overview — what this SDK is and is not

The Driver SDK is a thin, opinionated wrapper around `tmux` that exposes a typed surface for piloting `pi`. It is **mechanical only**: send keys, capture output, assert against regexes, throw structured errors. It does **not** decide what to validate (that's the scenario author's job) and it does **not** report findings (that's the agent's job).

The SDK is the **single place** where:
- Argument-array execution replaces shell-string interpolation.
- Output-stable polling replaces fixed sleeps.
- Pi's render surface (status pills, prompt regex, spinner glyphs) is encoded once.
- Risky payloads route to `paste-buffer` automatically.
- Failures carry structured context (step, expected, actual, scrollback, status, prior-steps, durationMs).

What it deliberately is **not**:
- A node-pty wrapper. Tmux remains the substrate (per user vision; CC-04 in dossier). A `Driver.headless()` mode that swaps to node-pty is a future option, not v1.
- An agent-coordination layer. The minih agent in workshop 002 owns reporting, retrospectives, and magic-wand wishes.
- A scenario authoring DSL. Scenarios are JSON-shaped TS objects; humans and agents both write them by hand.

---

## Module Layout

```
harness/driver/
├── index.ts        # public re-exports + runScenario + Scenario.load + preflight + main()
├── tmux.ts         # primitives: type, press, paste, capture, boot, teardown, inspect, record
├── session.ts      # Session class: high-level API; waitIdle + run composition
├── errors.ts       # DriverError + DriverAssertionError + DriverIdleTimeoutError + DriverBootError + DriverPaneDeadError
└── run.ts          # CLI entrypoint: tsx harness/driver/run.ts --scenario <path>
```

Plus tests:

```
harness/
├── driver.test.ts  # unit tests using makeFakeTmux()
└── driver.it.test.ts  # integration tests with live tmux against bash (NOT pi)
```

Total target: **~450 LOC across the four module files**, **~120 LOC across the two test files**, **~25 LOC in `run.ts`**.

---

## Module: `tmux.ts` (primitives)

Encodes TC-01..TC-12. The only file that calls `child_process` directly. All argv arrays — never shell strings.

```typescript
// harness/driver/tmux.ts
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";

import { DriverBootError, DriverPaneDeadError } from "./errors.js";

// ─── Public types ──────────────────────────────────────────────────────────

export interface Target {
	session: string;
	window?: number;  // default 0
	pane?: number;    // default 0
	paneId?: string;  // canonical "%N" id, captured at boot — rename-proof (TC-08)
}

export type Key =
	| "Enter" | "C-c" | "C-d" | "C-z" | "C-l" | "C-u"
	| "Escape" | "Tab" | "BSpace" | "BTab" | "Space"
	| "Up" | "Down" | "Left" | "Right" | "Home" | "End" | "PageUp" | "PageDown"
	| "F1" | "F2" | "F3" | "F4" | "F5" | "F6"
	| "F7" | "F8" | "F9" | "F10" | "F11" | "F12";

export interface BootOpts {
	session: string;
	cwd: string;
	cmd: string;                              // direct command — no shell pipeline (D7)
	cols?: number;                            // default 200 (D5)
	rows?: number;                            // default 50
	env?: Record<string, string>;
}

export interface CaptureOpts {
	scrollback?: number;  // -S -<N>; default 0 (visible only); pass 2000 for history
	join?: boolean;       // -J join wrapped lines; default true (TC-04)
	ansi?: boolean;       // -e include escape sequences; default false
}

// ─── Internal primitive ─────────────────────────────────────────────────────

const TMUX_OPTS: ExecFileSyncOptions = {
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
};

function tmux(args: string[]): string {
	// TC-01: argv array — never `args.join(" ")`. Closes D-014 shell-injection.
	return execFileSync("tmux", args, TMUX_OPTS);
}

function tmuxSafe(args: string[]): void {
	try { tmux(args); } catch { /* swallow */ }
}

// ─── Targeting (TC-08) ──────────────────────────────────────────────────────

export function targetStr(t: Target): string {
	if (t.paneId) return t.paneId;             // %N — rename-proof
	const w = t.window ?? 0;
	const p = t.pane ?? 0;
	return `${t.session}:${w}.${p}`;
}

// ─── Lifecycle (TC-09) ──────────────────────────────────────────────────────

export function boot(opts: BootOpts): Target {
	tmuxSafe(["kill-session", "-t", opts.session]);  // idempotent

	const args = [
		"new-session", "-d",
		"-s", opts.session,
		"-x", String(opts.cols ?? 200),
		"-y", String(opts.rows ?? 50),
		"-c", opts.cwd,
	];
	if (opts.env) {
		for (const [k, v] of Object.entries(opts.env)) {
			args.push("-e", `${k}=${v}`);  // tmux 3.0+ supports repeated -e
		}
	}
	args.push(opts.cmd);

	try { tmux(args); }
	catch (e) { throw new DriverBootError(opts, e as Error); }

	const paneId = tmux([
		"display-message", "-p", "-t", `${opts.session}:0.0`, "#{pane_id}",
	]).trim();
	if (!/^%\d+$/.test(paneId)) {
		tmuxSafe(["kill-session", "-t", opts.session]);
		throw new DriverBootError(opts, new Error(`bad pane_id: ${paneId}`));
	}

	return { session: opts.session, paneId };
}

export function teardown(t: Target): void {
	tmuxSafe(["kill-session", "-t", t.session]);
}

export function hasSession(name: string): boolean {
	try { tmux(["has-session", "-t", name]); return true; }
	catch { return false; }
}

// ─── Inspection (TC-11) ─────────────────────────────────────────────────────

export interface PaneInfo {
	paneId: string;
	pid: number;
	cmd: string;
	dead: boolean;
	cols: number;
	rows: number;
}

export function inspect(t: Target): PaneInfo {
	const fmt = "#{pane_id}\t#{pane_pid}\t#{pane_current_command}\t#{pane_dead}\t#{pane_width}\t#{pane_height}";
	const out = tmux(["list-panes", "-t", targetStr(t), "-F", fmt]).trim();
	const [paneId, pid, cmd, dead, cols, rows] = out.split("\t");
	return {
		paneId,
		pid: Number(pid),
		cmd,
		dead: dead === "1",
		cols: Number(cols),
		rows: Number(rows),
	};
}

export function assertAlive(t: Target): void {
	const info = inspect(t);
	if (info.dead) throw new DriverPaneDeadError(t, info);
}

// ─── Input (TC-02) ──────────────────────────────────────────────────────────

export function type(t: Target, text: string): void {
	// TC-02: `-l` literal mode disables key-name lookup. Always separate from press().
	tmux(["send-keys", "-t", targetStr(t), "-l", text]);
}

export function press(t: Target, key: Key, n: number = 1): void {
	const args = ["send-keys", "-t", targetStr(t)];
	if (n > 1) args.push("-N", String(n));
	args.push(key);
	tmux(args);
}

export function paste(t: Target, data: string, opts: { bracketed?: boolean } = {}): void {
	// TC-03: set-buffer takes ONE argv → no shell interpretation, safe for any payload.
	const buf = `pij-${process.pid}-${Date.now()}`;
	tmux(["set-buffer", "-b", buf, data]);
	const args = ["paste-buffer", "-d", "-b", buf, "-t", targetStr(t)];
	if (opts.bracketed) args.splice(1, 0, "-p");
	tmux(args);
}

// ─── Capture (TC-04) ────────────────────────────────────────────────────────

export function capture(t: Target, opts: CaptureOpts = {}): string {
	const args = ["capture-pane", "-t", targetStr(t), "-p"];
	if (opts.join !== false) args.push("-J");
	if (opts.ansi) args.push("-e");
	if (opts.scrollback && opts.scrollback > 0) {
		args.push("-S", `-${opts.scrollback}`, "-E", "-");
	}
	return tmux(args);
}

// ─── Recording (TC-06) ──────────────────────────────────────────────────────

export function record(t: Target, path: string): { stop: () => void } {
	tmux(["pipe-pane", "-O", "-t", targetStr(t), `cat >> ${shellQuote(path)}`]);
	return {
		stop: () => tmuxSafe(["pipe-pane", "-t", targetStr(t)]),
	};
}

function shellQuote(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}
```

**Encoded gotchas in `tmux.ts`** (cross-reference to dossier):

| Inline rule | Source | What it prevents |
|-------------|--------|------------------|
| Argv array via `execFileSync` | TC-01 | D-014 shell-injection on PIJ_ROOT or step bodies |
| `paneId` cached after boot | TC-08 | Rename-races when pi spawns helper windows |
| `type` uses `-l`, separate from `press` | TC-02 | "Enterfoo" bug from mixed-mode send-keys |
| `paste-buffer` for risky data | TC-03 | Newlines/quotes/dollars/backticks in payload |
| `capture-pane -J` default true | TC-04 | Wrapped tokens splitting mid-line, breaking regex |
| `kill-session` before `new-session` | TC-09 | Idempotent boot from prior failed run |
| `pane_id` must match `/^%\d+$/` | TC-11 | Boot succeeded but pane is dead immediately |
| `wait-for` is NOT exported | TC-10 | Wrong tool — it's tmux↔tmux semaphore, not output predicate |

---

## Module: `errors.ts`

Structured failure classes. Each carries enough context that a human or agent reading a stack trace doesn't need to spelunk live state.

```typescript
// harness/driver/errors.ts
import type { Target, BootOpts, PaneInfo } from "./tmux.js";
import type { Step } from "./session.js";

export class DriverError extends Error {
	constructor(message: string, public readonly cause?: Error) {
		super(message);
		this.name = "DriverError";
	}
}

export class DriverBootError extends DriverError {
	constructor(public readonly opts: BootOpts, cause: Error) {
		super(`boot failed: session=${opts.session} cmd=${opts.cmd}: ${cause.message}`, cause);
		this.name = "DriverBootError";
	}
}

export class DriverPaneDeadError extends DriverError {
	constructor(public readonly target: Target, public readonly info: PaneInfo) {
		super(`pane ${info.paneId} is dead (last cmd: ${info.cmd}, pid: ${info.pid})`);
		this.name = "DriverPaneDeadError";
	}
}

export interface AssertionContext {
	target: Target;
	step: Step;
	expected: RegExp;
	actual: string;             // last full capture before failure (visible region)
	scrollback: string;         // wider window, includes history
	status: string;             // bottom 3 lines (status / footer)
	priorSteps: Step[];         // breadcrumb of completed steps in this run
	durationMs: number;
}

export class DriverAssertionError extends DriverError {
	public readonly target: Target;
	public readonly step: Step;
	public readonly expected: RegExp;
	public readonly actual: string;
	public readonly scrollback: string;
	public readonly status: string;
	public readonly priorSteps: Step[];
	public readonly durationMs: number;

	constructor(ctx: AssertionContext) {
		const tail = ctx.actual.slice(-800);
		super(
			`assertion failed: expected /${ctx.expected.source}/ after ${ctx.durationMs}ms\n` +
			`step: ${JSON.stringify(ctx.step)}\n` +
			`--- last 800 bytes of pane ---\n${tail}`,
		);
		this.name = "DriverAssertionError";
		this.target = ctx.target;
		this.step = ctx.step;
		this.expected = ctx.expected;
		this.actual = ctx.actual;
		this.scrollback = ctx.scrollback;
		this.status = ctx.status;
		this.priorSteps = ctx.priorSteps;
		this.durationMs = ctx.durationMs;
	}

	/** JSON-serializable failure record — what the agent CLI returns. */
	toReport(): {
		kind: "assertion-failed";
		expected: string;
		actual: string;
		scrollback: string;
		status: string;
		priorSteps: Step[];
		durationMs: number;
	} {
		return {
			kind: "assertion-failed",
			expected: this.expected.source,
			actual: this.actual,
			scrollback: this.scrollback,
			status: this.status,
			priorSteps: this.priorSteps,
			durationMs: this.durationMs,
		};
	}
}

export class DriverIdleTimeoutError extends DriverError {
	constructor(
		public readonly target: Target,
		public readonly lastCapture: string,
		public readonly timeoutMs: number,
	) {
		const tail = lastCapture.slice(-800);
		super(`waitIdle timed out after ${timeoutMs}ms\n--- last 800 bytes ---\n${tail}`);
		this.name = "DriverIdleTimeoutError";
	}
}
```

**Why structured errors matter**: scratch's smoke today throws `Error` with a string. A validator-agent reading the failure can't distinguish "assertion failed" from "session died" from "tmux not on PATH" without parsing the message. Each subclass + `toReport()` makes failures machine-actionable.

---

## Module: `session.ts`

The high-level API most callers use. Wraps a `Target` with state-aware methods.

```typescript
// harness/driver/session.ts
import {
	type BootOpts, type CaptureOpts, type Key, type Target,
	assertAlive, boot, capture, paste, press, record as recordPane, targetStr, teardown, type as typeText,
} from "./tmux.js";
import {
	DriverAssertionError, DriverIdleTimeoutError,
} from "./errors.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Step types (IA-03) ─────────────────────────────────────────────────────

export type Step =
	| { kind: "type"; text: string; press?: Key; expect?: RegExp; expectTimeoutMs?: number }
	| { kind: "press"; key: Key; n?: number; expect?: RegExp; expectTimeoutMs?: number }
	| { kind: "paste"; data: string; expect?: RegExp; expectTimeoutMs?: number }
	| { kind: "wait"; quietMs?: number; signal?: RegExp; timeoutMs?: number }
	| { kind: "sleep"; ms: number }                     // explicit escape hatch — discouraged
	| { kind: "capture"; name: string };                // attach named capture to report

// ─── Readiness opts (PR-07) ─────────────────────────────────────────────────

export interface WaitIdleOpts {
	/** Bottom-line prompt regex. Default: `/^>\s/m` — pi's prompt (PR-01). */
	promptRe?: RegExp;
	/** Spinner glyphs to wait OUT. Default: pi's Braille frames (PR-07). */
	spinnerRe?: RegExp;
	/** Footer context-percent token. Default: `/\d+(\.\d+)?%\//` (PR-02). */
	contextRe?: RegExp;
	/** Polling interval. Default 250ms. */
	quietMs?: number;
	/** Hard ceiling. Default 5000ms; bump to 60000 for `/compact` / `/reload`. */
	timeoutMs?: number;
	/** Capture window in lines. Default 50. */
	scrollback?: number;
}

const DEFAULT_PROMPT_RE = /^>\s/m;
const DEFAULT_SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;
const DEFAULT_CONTEXT_RE = /\d+(\.\d+)?%\//;

const RISKY_PAYLOAD_RE = /[\n"`$;]|^-/;  // D6: auto-route to paste()

// ─── Session class ──────────────────────────────────────────────────────────

export class Session {
	private readonly target: Target;
	private readonly priorSteps: Step[] = [];
	private readonly captures: Record<string, string> = {};
	private recorder?: { stop: () => void };

	private constructor(target: Target) {
		this.target = target;
	}

	/** Boot a new tmux session running `cmd`. */
	static async start(opts: BootOpts & { recordPath?: string }): Promise<Session> {
		const target = boot(opts);
		const s = new Session(target);
		if (opts.recordPath) s.recorder = recordPane(target, opts.recordPath);
		return s;
	}

	get id(): string { return targetStr(this.target); }

	/** Wait until pi is idle: output-stable + prompt visible + no spinner (PR-07). */
	async waitIdle(opts: WaitIdleOpts = {}): Promise<string> {
		const promptRe   = opts.promptRe   ?? DEFAULT_PROMPT_RE;
		const spinnerRe  = opts.spinnerRe  ?? DEFAULT_SPINNER_RE;
		const contextRe  = opts.contextRe  ?? DEFAULT_CONTEXT_RE;
		const quietMs    = opts.quietMs    ?? 250;
		const timeoutMs  = opts.timeoutMs  ?? 5000;
		const scrollback = opts.scrollback ?? 50;

		const deadline = Date.now() + timeoutMs;
		let last = "";
		let stable = "";

		while (Date.now() < deadline) {
			const now = capture(this.target, { scrollback, join: true });
			if (now === last && now !== "") {
				const last3 = now.split("\n").slice(-3).join("\n");
				const lines = now.split("\n");
				const lastNonEmpty = [...lines].reverse().find((l) => l.trim() !== "") ?? "";
				if (
					contextRe.test(now) &&
					promptRe.test(lastNonEmpty) &&
					!spinnerRe.test(last3)
				) {
					return now;
				}
				stable = now;
			}
			last = now;
			await sleep(quietMs);
		}
		throw new DriverIdleTimeoutError(this.target, stable || last, timeoutMs);
	}

	/** Type-then-confirm — the atomic primitive (TC-12). Auto-routes risky payloads. */
	async run(input: string, expect: RegExp, opts: { timeoutMs?: number; press?: Key } = {}): Promise<string> {
		const t0 = Date.now();
		const pressKey = opts.press ?? "Enter";
		const timeout = opts.timeoutMs ?? 5000;
		const step: Step = { kind: "type", text: input, press: pressKey, expect, expectTimeoutMs: timeout };

		assertAlive(this.target);

		if (RISKY_PAYLOAD_RE.test(input)) paste(this.target, input);
		else                              typeText(this.target, input);
		press(this.target, pressKey);

		const deadline = t0 + timeout;
		let pane = "";
		while (Date.now() < deadline) {
			pane = capture(this.target, { scrollback: 2000, join: true });
			if (expect.test(pane)) {
				this.priorSteps.push(step);
				return pane;
			}
			await sleep(150);
		}
		throw this.assertionFailure(step, expect, pane, t0);
	}

	/** Execute one Step. Adapter between scenario JSON and the underlying primitives. */
	async execute(step: Step): Promise<void> {
		const t0 = Date.now();
		switch (step.kind) {
			case "type": {
				if (RISKY_PAYLOAD_RE.test(step.text)) paste(this.target, step.text);
				else                                  typeText(this.target, step.text);
				if (step.press) press(this.target, step.press);
				if (step.expect) await this.expectMatch(step, step.expect, step.expectTimeoutMs ?? 5000, t0);
				break;
			}
			case "press": {
				press(this.target, step.key, step.n);
				if (step.expect) await this.expectMatch(step, step.expect, step.expectTimeoutMs ?? 5000, t0);
				break;
			}
			case "paste": {
				paste(this.target, step.data);
				if (step.expect) await this.expectMatch(step, step.expect, step.expectTimeoutMs ?? 5000, t0);
				break;
			}
			case "wait": {
				await this.waitIdle({
					quietMs:   step.quietMs,
					promptRe:  step.signal,
					timeoutMs: step.timeoutMs,
				});
				break;
			}
			case "sleep": {
				await sleep(step.ms);
				break;
			}
			case "capture": {
				this.captures[step.name] = capture(this.target, { scrollback: 2000, join: true });
				break;
			}
		}
		this.priorSteps.push(step);
	}

	capturedNamed(): Record<string, string> { return { ...this.captures }; }

	teardown(): void {
		this.recorder?.stop();
		teardown(this.target);
	}

	// ─── private ──────────────────────────────────────────────────────────────

	private async expectMatch(step: Step, re: RegExp, timeoutMs: number, t0: number): Promise<void> {
		const deadline = t0 + timeoutMs;
		let pane = "";
		while (Date.now() < deadline) {
			pane = capture(this.target, { scrollback: 2000, join: true });
			if (re.test(pane)) return;
			await sleep(150);
		}
		throw this.assertionFailure(step, re, pane, t0);
	}

	private assertionFailure(step: Step, expected: RegExp, actual: string, t0: number): DriverAssertionError {
		const scrollback = capture(this.target, { scrollback: 5000, join: true });
		const status = scrollback.split("\n").slice(-3).join("\n");
		return new DriverAssertionError({
			target: this.target,
			step,
			expected,
			actual,
			scrollback,
			status,
			priorSteps: [...this.priorSteps],
			durationMs: Date.now() - t0,
		});
	}
}
```

**What `Session.run` solves**:
- IA-02 (fixed sleep) → bounded 150ms poll until match or timeout.
- IA-04 (lifecycle hardcoded inside runScenario) → lifecycle moves to `Session.start` / `Session.teardown`, callers control it.
- IA-05 (no scrollback) → `capture()` calls use `scrollback: 2000`; assertion-failure capture grabs `5000`.
- IA-08 (loss of context on failure) → `DriverAssertionError` carries `scrollback`, `status`, `priorSteps`, `durationMs`.

---

## Module: `index.ts` (public surface + runScenario + preflight)

```typescript
// harness/driver/index.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export { DriverError, DriverAssertionError, DriverBootError, DriverIdleTimeoutError, DriverPaneDeadError } from "./errors.js";
export type { AssertionContext } from "./errors.js";
export { Session, type Step, type WaitIdleOpts } from "./session.js";
export { boot, capture, paste, press, record, teardown, type, targetStr, hasSession, inspect } from "./tmux.js";
export type { BootOpts, CaptureOpts, Key, PaneInfo, Target } from "./tmux.js";

import { Session, type Step } from "./session.js";

// ─── Scenario shape (D2: clean break from legacy SmokeStep) ─────────────────

export interface Scenario {
	name: string;
	cwd?: string;                  // default = process.cwd()
	cmd?: string;                  // default = "pi"
	cols?: number;
	rows?: number;
	env?: Record<string, string>;
	bootReadyTimeoutMs?: number;   // default 30_000
	recordPath?: string;
	steps: Step[];
}

export interface RunReport {
	scenario: string;
	ok: boolean;
	durationMs: number;
	executedSteps: number;
	captures: Record<string, string>;
	failure?: ReturnType<import("./errors.js").DriverAssertionError["toReport"]> | { kind: "boot-failed" | "idle-timeout" | "pane-dead" | "preflight-failed" | "other"; message: string };
}

// ─── Loader (IA-09) ─────────────────────────────────────────────────────────

export async function loadScenario(path: string): Promise<Scenario> {
	const url = new URL(`file://${path}`);
	const mod = (await import(url.href)) as { default: unknown };
	if (!isScenario(mod.default)) {
		throw new Error(`scenario ${path} default export does not match Scenario shape`);
	}
	return mod.default;
}

function isScenario(v: unknown): v is Scenario {
	if (!v || typeof v !== "object") return false;
	const o = v as Record<string, unknown>;
	return typeof o.name === "string" && Array.isArray(o.steps);
}

// ─── Pre-flight (D-013 extended) ────────────────────────────────────────────

export interface PreflightResult { ok: boolean; tmuxVersion?: string; piVersion?: string; missing: string[]; }

export function preflight(): PreflightResult {
	const missing: string[] = [];
	let tmuxVersion: string | undefined;
	let piVersion:   string | undefined;
	try { tmuxVersion = execFileSync("tmux", ["-V"], { encoding: "utf8" }).trim(); }
	catch { missing.push("tmux"); }
	try { piVersion   = execFileSync("pi",   ["--version"], { encoding: "utf8" }).trim(); }
	catch { missing.push("pi"); }
	return { ok: missing.length === 0, tmuxVersion, piVersion, missing };
}

// ─── runScenario — the high-level orchestrator ──────────────────────────────

export async function runScenario(scenario: Scenario, override: { cwd?: string; cmd?: string; recordPath?: string } = {}): Promise<RunReport> {
	const t0 = Date.now();
	const captures: Record<string, string> = {};

	const pre = preflight();
	if (!pre.ok) {
		return {
			scenario: scenario.name, ok: false, durationMs: Date.now() - t0, executedSteps: 0, captures,
			failure: { kind: "preflight-failed", message: `missing: ${pre.missing.join(", ")}` },
		};
	}

	const session = await Session.start({
		session: `pij-${scenario.name}-${process.pid}`,
		cwd:     override.cwd     ?? scenario.cwd     ?? process.cwd(),
		cmd:     override.cmd     ?? scenario.cmd     ?? "pi",
		cols:    scenario.cols,
		rows:    scenario.rows,
		env:     scenario.env,
		recordPath: override.recordPath ?? scenario.recordPath,
	});

	let executed = 0;
	try {
		await session.waitIdle({ timeoutMs: scenario.bootReadyTimeoutMs ?? 30_000 });
		for (const step of scenario.steps) {
			await session.execute(step);
			executed++;
		}
		Object.assign(captures, session.capturedNamed());
		return { scenario: scenario.name, ok: true, durationMs: Date.now() - t0, executedSteps: executed, captures };
	}
	catch (err) {
		Object.assign(captures, session.capturedNamed());
		const failure = toFailureReport(err);
		return { scenario: scenario.name, ok: false, durationMs: Date.now() - t0, executedSteps: executed, captures, failure };
	}
	finally { session.teardown(); }
}

function toFailureReport(err: unknown): RunReport["failure"] {
	if (err && typeof err === "object" && "name" in err) {
		const e = err as { name: string; message: string; toReport?: () => unknown };
		if (e.name === "DriverAssertionError" && typeof e.toReport === "function") {
			return e.toReport() as RunReport["failure"];
		}
		if (e.name === "DriverBootError")        return { kind: "boot-failed",   message: e.message };
		if (e.name === "DriverIdleTimeoutError") return { kind: "idle-timeout",  message: e.message };
		if (e.name === "DriverPaneDeadError")    return { kind: "pane-dead",     message: e.message };
	}
	return { kind: "other", message: err instanceof Error ? err.message : String(err) };
}
```

---

## Adapter: `harness/scripts/smoke.ts` (rewritten)

```typescript
#!/usr/bin/env tsx
// npm run smoke -- [name]   — runs each .pi/extensions/<name>/smoke.ts via the Driver SDK.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadScenario, runScenario } from "../driver/index.js";

const PIJ_ROOT = join(import.meta.dirname, "..", "..");

function findScenarios(filter?: string): string[] {
	const root = join(PIJ_ROOT, ".pi", "extensions");
	const found: string[] = [];
	let entries: string[];
	try { entries = readdirSync(root); }
	catch { return found; }                              // D-013 defense-in-depth
	for (const entry of entries) {
		if (filter && entry !== filter) continue;
		const file = join(root, entry, "smoke.ts");
		try { if (statSync(file).isFile()) found.push(file); }
		catch { /* none */ }
	}
	return found;
}

async function main(): Promise<void> {
	const filter = process.argv[2];
	const files = findScenarios(filter);
	if (files.length === 0) {
		console.log(filter ? `no smoke.ts in ${filter}` : "no smoke scenarios");
		process.exit(0);
	}
	let failed = 0;
	for (const file of files) {
		const scenario = await loadScenario(file);
		process.stdout.write(`smoke: ${scenario.name} ... `);
		const report = await runScenario(scenario, { cwd: PIJ_ROOT });
		if (report.ok) console.log("✓");
		else {
			failed++;
			console.log("✗");
			console.error(JSON.stringify(report.failure, null, 2));
		}
	}
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: Error) => { console.error(err.message); process.exit(2); });
```

About **35 lines**, down from 113 in the current implementation. All tmux logic moved to `harness/driver/`.

---

## Agent CLI: `harness/driver/run.ts`

The minih `extension-validator` agent (workshop 002) shells into this. Takes a JSON scenario, prints a JSON `RunReport`.

```typescript
#!/usr/bin/env tsx
// Usage:
//   npx tsx harness/driver/run.ts --scenario <path-to-json>
//   echo '{...}' | npx tsx harness/driver/run.ts --stdin

import { readFileSync } from "node:fs";
import { runScenario, type Scenario } from "./index.js";

function parseArgs(argv: string[]): { scenario?: string; stdin?: boolean } {
	const out: { scenario?: string; stdin?: boolean } = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--scenario") out.scenario = argv[++i];
		else if (argv[i] === "--stdin") out.stdin = true;
	}
	return out;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	let raw: string;
	if (args.stdin) raw = readFileSync(0, "utf8");
	else if (args.scenario) raw = readFileSync(args.scenario, "utf8");
	else { console.error("usage: --scenario <path> | --stdin"); process.exit(2); }

	const scenario = JSON.parse(raw) as Scenario;
	const report = await runScenario(scenario, { cwd: process.cwd() });
	console.log(JSON.stringify(report, null, 2));
	process.exit(report.ok ? 0 : 1);
}

main().catch((err: Error) => { console.error(err.message); process.exit(2); });
```

Note: scenarios consumed by `run.ts` are **JSON**, not TS modules. Steps with `expect: RegExp` need wire-format adaptation — the JSON form uses `expect: { source: string; flags?: string }`. Update `loadScenario` and `Step` parsing accordingly when the scenario comes via JSON. (The TS-import path keeps native RegExp.)

The simplest way: extend the JSON parser to accept `{ regex: "pattern", flags: "i" }` shapes anywhere a `RegExp` would normally appear, and convert at parse time. Six lines added in `index.ts`. Encoded but not shown above to keep the example tight; the implementation phase materializes it.

---

## Sample scenario — scratch's smoke rewritten over the new shape

```typescript
// .pi/extensions/scratch/smoke.ts
import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "scratch",
	bootReadyTimeoutMs: 30_000,
	steps: [
		{ kind: "type", text: "/scratch add scratch-smoke-alpha", press: "Enter",
		  expect: /saved \[#1\]/,             expectTimeoutMs: 5_000 },
		{ kind: "type", text: "/scratch add scratch-smoke-bravo", press: "Enter",
		  expect: /saved \[#2\]/,             expectTimeoutMs: 5_000 },
		{ kind: "type", text: "/scratch list", press: "Enter",
		  expect: /scratch-smoke-alpha[\s\S]*scratch-smoke-bravo/, expectTimeoutMs: 5_000 },
		{ kind: "type", text: "/compact", press: "Enter" },
		{ kind: "wait", timeoutMs: 60_000 },                       // PR-09
		{ kind: "type", text: "/scratch list", press: "Enter",
		  expect: /(?=.*scratch-smoke-alpha)(?=.*scratch-smoke-bravo)/, expectTimeoutMs: 10_000 },
	],
};

export default scenario;
```

The `wait` step replaces the current 30-second hard sleep — `Session.waitIdle` polls until output is stable AND the prompt is back AND no spinner is visible (PR-07). Cap at 60s in case of slow `/compact`.

---

## Testing strategy

### Unit tests — mocked `execFileSync`

Goal: verify the SDK passes the right argv to tmux for each method, without a live tmux.

```typescript
// harness/driver.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[][] = [];

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn((file: string, args: string[]) => {
		calls.push([file, ...args]);
		// Minimal scripted responses for the methods under test:
		if (args[0] === "display-message") return "%5\n";
		if (args[0] === "list-panes")      return "%5\t12345\tpi\t0\t200\t50\n";
		if (args[0] === "capture-pane")    return "> \n";
		return "";
	}),
}));

beforeEach(() => { calls.length = 0; });

describe("driver/tmux", () => {
	it("type uses send-keys -l", async () => {
		const { type } = await import("./driver/tmux.js");
		type({ session: "s", paneId: "%5" }, "/scratch list");
		expect(calls.at(-1)).toEqual(["tmux", "send-keys", "-t", "%5", "-l", "/scratch list"]);
	});

	it("paste uses set-buffer + paste-buffer (TC-03)", async () => {
		const { paste } = await import("./driver/tmux.js");
		paste({ session: "s", paneId: "%5" }, "weird `$payload`");
		expect(calls.at(-2)?.[1]).toBe("set-buffer");
		expect(calls.at(-1)?.[1]).toBe("paste-buffer");
	});

	it("boot kills prior session, captures pane_id (TC-08, TC-09)", async () => {
		const { boot } = await import("./driver/tmux.js");
		const t = boot({ session: "s", cwd: "/tmp", cmd: "bash" });
		expect(t.paneId).toBe("%5");
		const cmds = calls.map((c) => c[1]);
		expect(cmds).toContain("kill-session");
		expect(cmds).toContain("new-session");
		expect(cmds).toContain("display-message");
	});
});

describe("driver/session", () => {
	it("Session.run() routes risky payloads to paste", async () => {
		const { Session } = await import("./driver/session.js");
		// drive against a fake target — Session.start would call boot(); use private constructor via cast for the unit test
		const session = (Session as unknown as { new(t: { session: string; paneId: string }): unknown })
			.constructor.call(Object.create((Session as object).prototype as object), { session: "s", paneId: "%5" });
		// (an alternate exposed factory in tests is cleaner — sketched here for brevity)
		// ...
	});
});
```

The unit-test file is sketched for shape; integration tests against a real tmux give the ground truth.

### Integration tests — live tmux against `bash`

Goal: verify `waitIdle` and `run` behave correctly against real tmux and a real shell, **without depending on `pi`** (which requires API keys + non-determinism).

```typescript
// harness/driver.it.test.ts
import { describe, it, expect } from "vitest";
import { Session } from "./driver/session.js";
import { hasSession } from "./driver/tmux.js";

describe("driver integration (live tmux + bash)", () => {
	it("Session.start → run → waitIdle → teardown", async () => {
		if (!process.env.PIJ_DRIVER_IT) return;       // opt-in via env
		const session = await Session.start({
			session: `pij-it-${process.pid}`, cwd: process.cwd(), cmd: "bash --noprofile --norc",
			cols: 80, rows: 24,
		});
		try {
			await session.waitIdle({
				promptRe: /\$\s*$/m,                          // bash prompt
				contextRe: /./,                                // anything
				timeoutMs: 5_000,
			});
			const pane = await session.run("echo hello-pij", /hello-pij/);
			expect(pane).toMatch(/hello-pij/);
		}
		finally {
			session.teardown();
			expect(hasSession(`pij-it-${process.pid}`)).toBe(false);
		}
	});
});
```

Gated behind `PIJ_DRIVER_IT=1` so CI without tmux skips it cleanly.

### End-to-end — the validator-agent pilot

The real proof is the `extension-validator` agent (workshop 002) running scratch's scenario unattended and reporting `{ ok: true }`. That's what the plan's acceptance criteria gate on.

---

## Status pill contract clarity (cross-link to D-006 fix)

This workshop's surface does **not** call `setStatus`. But the validator will assert against status pills, so authors need to know: per **PR-04** (pi-mono `footer-data-provider.ts:132-138`):

- `ctx.ui.setStatus(key, "")` stores an empty string and renders an empty pill.
- `ctx.ui.setStatus(key, undefined)` calls `delete` and clears the pill.

Scratch currently calls `setStatus("scratch", "")` at `.pi/extensions/scratch/index.ts:98`. **This should be `undefined`.** The implementation phase of plan 004 should land the one-line fix in scratch and update `docs/difficulties.md` to mark D-006 `encoded`.

This isn't strictly part of the SDK API surface, but the validator-agent will assert "absence of `/scratch:/` after clear" — so the contract has to be right for the test to be meaningful.

---

## Open questions

### Q1: Should `Scenario.steps` accept inline `Session => void` callbacks?

**OPEN.** A power-user might want a step like `{ kind: "callback"; fn: async (s) => { ... } }` for arbitrary logic. This breaks the JSON-serializable property of `Scenario` (the validator-agent CLI needs JSON). 

**Provisional answer**: NO. If a scenario needs custom logic, it imports `Session` directly and orchestrates from a TS file, not through `runScenario`. Keep `Scenario` JSON-shaped.

### Q2: Should `record()` produce asciinema cast format or raw stream?

**OPEN.** Asciinema (.cast v2) is the standard for replay; raw `pipe-pane` output is simpler.

**Provisional answer**: RAW STREAM (`pipe-pane -O 'cat >> log'`) for v1. Cast format adds a header + per-line timing JSON; not necessary unless someone wants `asciinema play` replay. Defer to an opt-in helper later.

### Q3: Should the SDK retry on transient tmux errors?

**OPEN.** Some tmux operations can fail transiently (`server not found`, `session not found` mid-teardown).

**Provisional answer**: NO RETRY in primitives. `tmuxSafe` exists for fire-and-forget cleanup. Callers that want retry semantics build them on top — keeps primitives predictable.

### Q4: How do we handle long-running commands beyond `/compact`?

**RESOLVED.** `bootReadyTimeoutMs` (default 30s) covers boot; `expectTimeoutMs` per-step covers per-command waits; `wait` step with explicit `timeoutMs` covers any explicit pause. No special case needed.

### Q5: How do tests run if tmux isn't available?

**RESOLVED.** Unit tests mock `execFileSync` — no tmux required. Integration tests are env-gated (`PIJ_DRIVER_IT=1`). This pattern matches D-013 / D-008 disposition: tmux is local-only; CI runs typecheck + lint + unit tests.

---

## Encoded gotchas — index of citations in the code

Every code block above carries comments like `(TC-01)`, `(IA-08)`, `(D-006)`. Index for review:

| Citation | Where it appears | What it encodes |
|----------|------------------|-----------------|
| TC-01 | `tmux.ts:tmux()` | `execFileSync` argv array; closes D-014 |
| TC-02 | `tmux.ts:type()` / `press()` | `-l` literal mode separated from key-name mode |
| TC-03 | `tmux.ts:paste()` | `set-buffer` + `paste-buffer` for risky payloads |
| TC-04 | `tmux.ts:capture()` | `-J` join wrapped lines on by default |
| TC-05 | `session.ts:waitIdle()` | Output-stable polling |
| TC-06 | `tmux.ts:record()` | `pipe-pane -O` for transcripts |
| TC-08 | `tmux.ts:targetStr()` / `boot()` | `pane_id` cached after boot, used as canonical target |
| TC-09 | `tmux.ts:boot()` | `kill-session` before `new-session`; 200×50 default geometry |
| TC-10 | (NOT implemented) | `wait-for` deliberately not exposed |
| TC-11 | `tmux.ts:inspect()` / `assertAlive()` | `list-panes -F` to detect dead pane |
| TC-12 | `session.ts:Session.run()` | Composed type-then-confirm primitive |
| PR-01 | `session.ts:DEFAULT_PROMPT_RE` | `/^>\s/m` is pi's prompt |
| PR-02 | `session.ts:DEFAULT_CONTEXT_RE` | Footer context-percent token |
| PR-04 | § Status pill contract clarity | Cross-link to D-006 fix in scratch |
| PR-07 | `session.ts:waitIdle()` | Composite readiness signal |
| PR-09 | scratch sample scenario | `wait` step with 60s ceiling for `/compact` |
| IA-02 | `session.ts:waitIdle()` / `run()` | Bounded retry replaces fixed sleep |
| IA-03 | `session.ts:Step` discriminated union | Typed scenario shape |
| IA-04 | `session.ts:Session` class | Lifecycle ownership |
| IA-05 | `session.ts:run()` / `assertionFailure()` | Scrollback used in capture + failure context |
| IA-08 | `errors.ts:DriverAssertionError` | Structured failure with breadcrumb |
| IA-09 | `index.ts:loadScenario()` | Validated load with shape guard |
| IA-10 | `index.ts` exports | SDK is importable; agent shells into `run.ts` |
| D-013 | `index.ts:preflight()` + `smoke.ts:findScenarios()` | Pre-flight check + ENOENT defense |
| D-014 | `tmux.ts:tmux()` | `execFileSync` over `execSync(args.join(" "))` |

---

## Quick reference — paste-ready signatures

```typescript
// === harness/driver/tmux.ts (primitives, all argv-array, all sync) ===

export function boot     (opts: BootOpts): Target;
export function teardown (t: Target): void;
export function hasSession(name: string): boolean;
export function inspect  (t: Target): PaneInfo;
export function assertAlive(t: Target): void;

export function type     (t: Target, text: string): void;
export function press    (t: Target, key: Key, n?: number): void;
export function paste    (t: Target, data: string, opts?: { bracketed?: boolean }): void;

export function capture  (t: Target, opts?: CaptureOpts): string;
export function record   (t: Target, path: string): { stop: () => void };

// === harness/driver/session.ts (high-level API) ===

export class Session {
	static start(opts: BootOpts & { recordPath?: string }): Promise<Session>;
	get id(): string;
	waitIdle(opts?: WaitIdleOpts): Promise<string>;
	run(input: string, expect: RegExp, opts?: { timeoutMs?: number; press?: Key }): Promise<string>;
	execute(step: Step): Promise<void>;
	capturedNamed(): Record<string, string>;
	teardown(): void;
}

// === harness/driver/index.ts (orchestrator) ===

export function preflight   (): PreflightResult;
export function loadScenario(path: string): Promise<Scenario>;
export function runScenario (scenario: Scenario, override?: { cwd?: string; cmd?: string; recordPath?: string }): Promise<RunReport>;
```

---

## Validation / Acceptance — restated

This workshop is Implementation Ready when the implementation phase of plan 004 can:

1. Create `harness/driver/{tmux.ts, session.ts, errors.ts, index.ts, run.ts}` by transcribing this document.
2. Pass `npm run typecheck` with no edits.
3. Pass a unit test suite (`harness/driver.test.ts`) using the `vi.mock("node:child_process")` pattern shown.
4. Rewrite `harness/scripts/smoke.ts` to ~35 lines, calling `runScenario`.
5. Rewrite `.pi/extensions/scratch/smoke.ts` to use `Scenario`/`Step` from this workshop.
6. Verify scratch smoke still passes against real `pi` (manual, since smoke is local-only per D-008).

Anything not covered here is by definition out of scope for the SDK module — scenario semantics, agent reporting, and magic-wand wishes belong to workshop 002 (extension-validator agent) and workshop 003 (magic-wand envelope).

---

## Next steps

- **Optional**: Run `/plan-2c-workshop --plan 004-agent-pilot-harness "Validator agent prompt + schemas"` to materialize workshop 002 (the minih `extension-validator` slug, `agent.json`, `prompt.md`, `input-schema.json`, `output-schema.json`).
- **Optional**: Run `/plan-2c-workshop --plan 004-agent-pilot-harness "Magic-wand farewell envelope"` for workshop 003.
- **Recommended next**: Run `/plan-1b-specify --simple` for plan 004 — this workshop is enough to specify the plan with confidence.
