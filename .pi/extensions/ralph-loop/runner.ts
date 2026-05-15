// .pi/extensions/ralph-loop/runner.ts
//
// SdkIterationRunner — implements `IterationRunner` against pi's
// `createAgentSession()`. Spins a FRESH agent session per iteration so
// each loop has a clean context (workshop 002 § Per-iteration sequence).
//
// Risk class: F-02 (SDK lifecycle leak). Mitigation:
//   - `dispose()` lives in a `finally` block reached on EVERY code path.
//   - The listener subscription is cancelled on exit via the unsubscribe
//     function returned by `session.subscribe()`.
//   - Resources are injected via constructor (P3) so leak-detection tests
//     can swap in a tracking factory.
//
// The SDK module surface is deliberately abstracted behind
// `AgentSessionFactory` + `AgentSessionLike` so the runner is independent
// of pi-coding-agent at test time. Production code wires the real factory
// via `defaultAgentSessionFactory()` below.

import {
	type IterationInput,
	type IterationResult,
	type IterationRunner,
	taskFingerprint,
} from "./store.js";

/**
 * Narrow shape we need from a pi `AgentSession`. The real type carries far
 * more — we only depend on what's listed here, which keeps the runner
 * testable and resilient to SDK additions.
 */
export interface AgentSessionLike {
	subscribe(listener: (event: AgentSessionEventLike) => void): () => void;
	prompt(text: string): Promise<void>;
	dispose(): void;
	abort?(): Promise<void>;
	getLastAssistantText?(): string | undefined;
	getSessionStats?(): { cost: number };
}

export type AgentSessionEventLike =
	| { type: "agent_end"; [k: string]: unknown }
	| { type: "message_end"; [k: string]: unknown }
	| { type: string; [k: string]: unknown };

export interface AgentSessionFactoryInput {
	readonly runId: string;
	readonly iteration: number;
	readonly cwd: string;
	readonly planPath: string;
	readonly signal: AbortSignal;
}

/**
 * Factory that creates a fresh `AgentSessionLike` per iteration. The default
 * implementation wraps `createAgentSession()` from `@earendil-works/pi-coding-agent`;
 * tests inject a tracking factory to verify dispose-call accounting.
 */
export type AgentSessionFactory = (input: AgentSessionFactoryInput) => Promise<AgentSessionLike>;

export interface SdkIterationRunnerOpts {
	readonly factory: AgentSessionFactory;
	readonly cwd: string;
	readonly promptBuilder?: (input: IterationInput) => string;
	readonly clock?: () => number;
}

const DEFAULT_PROMPT_TEMPLATE = `You are working through a plan file.

Pick the FIRST unchecked task (\`- [ ]\`) in the plan, do that ONE task only,
then check it off (\`- [x]\`) and stop. Do not pick a second task.

If every task is checked, emit exactly \`<promise>COMPLETE</promise>\` and stop.

Attribution: this loop follows Geoffrey Huntley's Ralph pattern
(<https://ghuntley.com/ralph/>). The prompt structure borrows from snarktank/ralph
and coleam00/ralph.

Plan file (PATH): {planPath}

Plan contents:

{planSnapshot}

NOTE: Never run \`git push\`. Per the pij agentic-loops contract, the loop is
local-only.`;

export class SdkIterationRunner implements IterationRunner {
	private readonly factory: AgentSessionFactory;
	private readonly cwd: string;
	private readonly promptBuilder: (input: IterationInput) => string;
	private readonly clock: () => number;

	constructor(opts: SdkIterationRunnerOpts) {
		this.factory = opts.factory;
		this.cwd = opts.cwd;
		this.promptBuilder = opts.promptBuilder ?? defaultPromptBuilder;
		this.clock = opts.clock ?? Date.now;
	}

	async runIteration(input: IterationInput): Promise<IterationResult> {
		const startedAt = this.clock();
		let session: AgentSessionLike | undefined;
		let unsubscribe: (() => void) | undefined;
		let lastMessage = "";

		try {
			session = await this.factory({
				runId: input.runId,
				iteration: input.iteration,
				cwd: this.cwd,
				planPath: input.planPath,
				signal: input.signal,
			});

			// Wait for agent_end via the subscription channel; capture last assistant
			// message as we go. Promise resolves on agent_end or rejects on abort.
			const runPromise = new Promise<void>((resolve, reject) => {
				unsubscribe = session?.subscribe((event) => {
					if (event.type === "message_end") {
						const text =
							typeof event.text === "string"
								? event.text
								: (event.lastAssistantText as string | undefined);
						if (text) lastMessage = text;
					}
					if (event.type === "agent_end") {
						resolve();
					}
				});

				if (input.signal.aborted) {
					reject(new Error("aborted before iteration start"));
					return;
				}
				const onAbort = () => {
					input.signal.removeEventListener("abort", onAbort);
					reject(new Error("aborted mid-iteration"));
				};
				input.signal.addEventListener("abort", onAbort, { once: true });

				const prompt = this.promptBuilder(input);
				session?.prompt(prompt).catch(reject);
			});

			await runPromise;

			// Fall back to getLastAssistantText() if the event payload didn't carry it.
			if (!lastMessage && session?.getLastAssistantText) {
				lastMessage = session.getLastAssistantText() ?? "";
			}

			const cost = session?.getSessionStats?.().cost ?? null;
			const taskTitle = extractTaskTitle(input, lastMessage);

			return {
				output: lastMessage,
				taskTitle,
				taskFingerprint: taskFingerprint(taskTitle),
				costUsd: cost,
				durationMs: this.clock() - startedAt,
				verdict: "ok",
			};
		} catch (e) {
			const aborted = input.signal.aborted;
			return {
				output: lastMessage,
				taskTitle: "",
				taskFingerprint: taskFingerprint(""),
				costUsd: null,
				durationMs: this.clock() - startedAt,
				verdict: aborted ? "session_error" : "agent_error",
				errorDetail: e instanceof Error ? e.message : String(e),
			};
		} finally {
			// F-02 mitigation: detach listener BEFORE dispose so we don't receive
			// events on a disposed session.
			try {
				unsubscribe?.();
			} catch {
				// listener detach must never crash the loop
			}
			try {
				session?.dispose();
			} catch {
				// dispose errors swallowed; we've already returned the IterationResult above
			}
		}
	}
}

function defaultPromptBuilder(input: IterationInput): string {
	return DEFAULT_PROMPT_TEMPLATE.replace("{planPath}", input.planPath).replace(
		"{planSnapshot}",
		input.planSnapshot,
	);
}

/** Pluck the first unchecked task title from the plan; fall back to "(unspecified)". */
function extractTaskTitle(input: IterationInput, _lastMessage: string): string {
	const m = /-\s+\[ \]\s+(.+?)\s*$/m.exec(input.planSnapshot);
	if (m?.[1]) return m[1].trim();
	return "(unspecified)";
}

/**
 * Default factory wrapping pi's `createAgentSession`. Lazily imports the SDK
 * so unit tests that don't use this factory can avoid pulling in the full
 * runtime. Marked `@returns Promise<AgentSessionLike>` so the structural
 * `AgentSession` shape compiles against `AgentSessionLike` without an `as`
 * cast at the runner boundary (P6).
 */
export async function defaultAgentSessionFactory(
	input: AgentSessionFactoryInput,
): Promise<AgentSessionLike> {
	// NB: top-level static import per AGENTS.md (no `await import(...)` ergonomics).
	// We can't depend on `@earendil-works/pi-coding-agent` at the runner level
	// without the structural binding. The wiring layer (index.ts) is the right
	// place to construct the default factory using its concrete imports.
	throw new Error(
		`defaultAgentSessionFactory: no factory has been wired (input: runId=${input.runId} iter=${input.iteration}). ` +
			`Either pass a factory to SdkIterationRunner or use FakeIterationRunner under PIJ_RALPH_FAKE_RUNNER=1.`,
	);
}
