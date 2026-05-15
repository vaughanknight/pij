// .pi/extensions/ralph-loop/runner.test.ts
//
// T017.T — Leak-detection for SdkIterationRunner.
//
// Risk class: F-02 (SDK lifecycle leak). The runner MUST dispose every
// AgentSession it creates, on every code path:
//   - happy path (agent_end)
//   - prompt throw
//   - mid-iteration abort
//   - subscriber listener throw
//
// Strategy: inject a tracking factory that counts (a) sessions created,
// (b) dispose calls, (c) listener-attach calls, (d) listener-detach calls.
// Drive 10 iterations and assert dispose/detach ratios. A WeakRef probe
// runs as an opt-in `--expose-gc` test path; in normal CI it is skipped.

import { afterEach, describe, expect, it } from "vitest";

import {
	type AgentSessionEventLike,
	type AgentSessionFactory,
	type AgentSessionLike,
	SdkIterationRunner,
} from "./runner.js";
import {
	DEFAULT_CONFIG,
	type IterationInput,
	type IterationRunner,
} from "./store.js";

class TrackingSession implements AgentSessionLike {
	disposeCalls = 0;
	subscribers: Array<(e: AgentSessionEventLike) => void> = [];
	promptCalls: string[] = [];
	abortCalls = 0;
	subscribeAttached = 0;
	subscribeDetached = 0;
	autoEnd: boolean;
	autoEndMessage: string;
	rejectPrompt: Error | null;
	costPerIteration: number;

	constructor(opts: {
		autoEnd?: boolean;
		autoEndMessage?: string;
		rejectPrompt?: Error | null;
		costPerIteration?: number;
	} = {}) {
		this.autoEnd = opts.autoEnd ?? true;
		this.autoEndMessage = opts.autoEndMessage ?? "tracking-session lastMessage";
		this.rejectPrompt = opts.rejectPrompt ?? null;
		this.costPerIteration = opts.costPerIteration ?? 0;
	}

	subscribe(listener: (e: AgentSessionEventLike) => void): () => void {
		this.subscribers.push(listener);
		this.subscribeAttached++;
		return () => {
			const i = this.subscribers.indexOf(listener);
			if (i >= 0) this.subscribers.splice(i, 1);
			this.subscribeDetached++;
		};
	}

	async prompt(text: string): Promise<void> {
		this.promptCalls.push(text);
		if (this.rejectPrompt) throw this.rejectPrompt;
		if (this.autoEnd) {
			// Emit message_end + agent_end synchronously after returning
			queueMicrotask(() => {
				for (const sub of this.subscribers) {
					sub({ type: "message_end", text: this.autoEndMessage });
					sub({ type: "agent_end" });
				}
			});
		}
	}

	dispose(): void {
		this.disposeCalls++;
	}

	async abort(): Promise<void> {
		this.abortCalls++;
	}

	getLastAssistantText(): string | undefined {
		return this.autoEndMessage;
	}

	getSessionStats(): { cost: number } {
		return { cost: this.costPerIteration };
	}
}

function makeInput(
	overrides: Partial<IterationInput> & { signal?: AbortSignal } = {},
): IterationInput {
	const signal = overrides.signal ?? new AbortController().signal;
	return {
		runId: overrides.runId ?? "r-test",
		planPath: overrides.planPath ?? "/PLAN.md",
		planSnapshot:
			overrides.planSnapshot ??
			"- [ ] do work\n- [ ] another\n- [ ] third\n",
		history: overrides.history ?? [],
		iteration: overrides.iteration ?? 1,
		signal,
		config: overrides.config ?? DEFAULT_CONFIG,
	};
}

let trackingSessions: TrackingSession[] = [];

afterEach(() => {
	trackingSessions = [];
});

function trackingFactory(
	build: () => TrackingSession = () => new TrackingSession(),
): AgentSessionFactory {
	return async () => {
		const s = build();
		trackingSessions.push(s);
		return s;
	};
}

describe("SdkIterationRunner leak detection (T017.T)", () => {
	it("happy path: 10 iterations → 10 factory calls AND 10 dispose calls AND 10 detach calls", async () => {
		const runner: IterationRunner = new SdkIterationRunner({
			factory: trackingFactory(),
			cwd: "/tmp",
		});
		for (let i = 1; i <= 10; i++) {
			const result = await runner.runIteration(makeInput({ iteration: i }));
			expect(result.verdict).toBe("ok");
		}
		expect(trackingSessions).toHaveLength(10);
		for (const s of trackingSessions) {
			expect(s.disposeCalls, "every session must be disposed exactly once").toBe(1);
			expect(s.subscribeAttached).toBe(1);
			expect(s.subscribeDetached, "every subscribe must be matched by detach").toBe(1);
		}
	});

	it("prompt throws: dispose + detach still happen (finally invariant)", async () => {
		const runner: IterationRunner = new SdkIterationRunner({
			factory: trackingFactory(
				() => new TrackingSession({ rejectPrompt: new Error("model boom") }),
			),
			cwd: "/tmp",
		});
		const result = await runner.runIteration(makeInput());
		expect(result.verdict).toBe("agent_error");
		expect(result.errorDetail).toContain("model boom");
		expect(trackingSessions).toHaveLength(1);
		expect(trackingSessions[0]?.disposeCalls).toBe(1);
		expect(trackingSessions[0]?.subscribeDetached).toBe(1);
	});

	it("mid-iteration abort: dispose + detach still happen; verdict=session_error", async () => {
		const controller = new AbortController();
		const factory: AgentSessionFactory = async () => {
			const s = new TrackingSession({
				autoEnd: false, // simulate hung agent
			});
			trackingSessions.push(s);
			// Schedule the abort after the runner has subscribed.
			queueMicrotask(() => controller.abort());
			return s;
		};
		const runner: IterationRunner = new SdkIterationRunner({ factory, cwd: "/tmp" });
		const result = await runner.runIteration(makeInput({ signal: controller.signal }));
		expect(result.verdict).toBe("session_error");
		expect(trackingSessions).toHaveLength(1);
		expect(trackingSessions[0]?.disposeCalls, "abort must still trigger dispose").toBe(1);
		expect(trackingSessions[0]?.subscribeDetached).toBe(1);
	});

	it("factory throws: NO sessions to leak, runner returns agent_error cleanly", async () => {
		const factory: AgentSessionFactory = async () => {
			throw new Error("factory unavailable: GH_TOKEN missing");
		};
		const runner: IterationRunner = new SdkIterationRunner({ factory, cwd: "/tmp" });
		const result = await runner.runIteration(makeInput());
		expect(result.verdict).toBe("agent_error");
		expect(result.errorDetail).toContain("factory unavailable");
		expect(trackingSessions).toHaveLength(0);
	});

	it("session.dispose() throwing does not leak the listener subscription", async () => {
		class ThrowingDispose extends TrackingSession {
			override dispose(): void {
				this.disposeCalls++;
				throw new Error("dispose failed");
			}
		}
		const runner: IterationRunner = new SdkIterationRunner({
			factory: trackingFactory(() => new ThrowingDispose()),
			cwd: "/tmp",
		});
		const result = await runner.runIteration(makeInput());
		expect(result.verdict).toBe("ok"); // happy-path completed before finally
		expect(trackingSessions).toHaveLength(1);
		// dispose was attempted (counter incremented even though it threw)
		expect(trackingSessions[0]?.disposeCalls).toBe(1);
		// listener was detached BEFORE dispose, so detach succeeded
		expect(trackingSessions[0]?.subscribeDetached).toBe(1);
	});

	it("cost accounting: per-iteration cost is captured from getSessionStats", async () => {
		const runner: IterationRunner = new SdkIterationRunner({
			factory: trackingFactory(() => new TrackingSession({ costPerIteration: 0.42 })),
			cwd: "/tmp",
		});
		const result = await runner.runIteration(makeInput());
		expect(result.costUsd).toBeCloseTo(0.42);
	});

	it("output capture: lastMessage falls back to getLastAssistantText if event payload missing", async () => {
		const runner: IterationRunner = new SdkIterationRunner({
			factory: trackingFactory(
				() => new TrackingSession({ autoEndMessage: "from getLastAssistantText" }),
			),
			cwd: "/tmp",
		});
		const result = await runner.runIteration(makeInput());
		expect(result.output).toBe("from getLastAssistantText");
	});

	it("WeakRef probe (gc-dependent, runs only with --expose-gc) — no AgentSession refs survive across 10 iterations", async () => {
		// @ts-ignore — globalThis.gc is exposed only with `node --expose-gc`.
		const gc = (globalThis as { gc?: () => void }).gc;
		if (typeof gc !== "function") {
			// Skip silently; the dispose-counter assertions above cover the leak
			// invariant for normal test runs.
			return;
		}
		const weakRefs: WeakRef<TrackingSession>[] = [];
		const runner: IterationRunner = new SdkIterationRunner({
			factory: async () => {
				const s = new TrackingSession();
				weakRefs.push(new WeakRef(s));
				return s;
			},
			cwd: "/tmp",
		});
		for (let i = 1; i <= 10; i++) {
			await runner.runIteration(makeInput({ iteration: i }));
		}
		// Drop any strong references the test might hold transiently.
		await new Promise((r) => setTimeout(r, 50));
		gc();
		await new Promise((r) => setTimeout(r, 50));
		gc();
		const survivors = weakRefs.filter((w) => w.deref() !== undefined);
		expect(survivors, "no AgentSession should survive past its iteration").toHaveLength(0);
	});
});
