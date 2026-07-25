// pij-control-plane — context-gauge pure parsers (plan 054 P2 T007, AC-09).
//
// Every fixture line mirrors a REAL on-disk shape captured live on 2026-07-17
// (claude transcript message.usage; codex rollout token_count payload; pi
// events.ndjson assistant usage). The honest-gauge law is pinned hard: a
// reading is a REAL number from the source or null — never an estimate, and
// never codex's cumulative total_token_usage (72M against a 258k window on a
// real rollout — a context gauge built from it would lie).

import { describe, expect, it } from "vitest";
import type { ModelEntry } from "../models/registry.js";
import {
	claudeContextFromTranscript,
	codexContextFromRollout,
	contextMaxFor,
	piContextFromEvents,
} from "./gauge.js";

function lines(...objects: unknown[]): string {
	return objects.map((o) => (typeof o === "string" ? o : JSON.stringify(o))).join("\n");
}

describe("claudeContextFromTranscript (last message.usage wins)", () => {
	const usageLine = (input: number, cacheCreate: number, cacheRead: number, output: number) => ({
		message: {
			role: "assistant",
			usage: {
				input_tokens: input,
				cache_creation_input_tokens: cacheCreate,
				cache_read_input_tokens: cacheRead,
				output_tokens: output,
				service_tier: "standard",
			},
		},
	});

	it("sums the LAST usage block's four token components", () => {
		const text = lines(
			{ type: "summary", summary: "irrelevant" },
			usageLine(10, 100, 1_000, 50),
			{ message: { role: "user", content: [] } },
			usageLine(2, 282, 305_911, 344),
		);
		expect(claudeContextFromTranscript(text)).toBe(2 + 282 + 305_911 + 344);
	});

	it("tolerates garbage lines and missing fields", () => {
		const text = lines("not json at all", '{"half":', usageLine(1, 2, 3, 4), "");
		expect(claudeContextFromTranscript(text)).toBe(10);
	});

	it("null when NO usage block exists — never a guess", () => {
		expect(claudeContextFromTranscript(lines({ message: { role: "user" } }))).toBeNull();
		expect(claudeContextFromTranscript("")).toBeNull();
	});
});

describe("codexContextFromRollout (last_token_usage tail; cumulative total NEVER used)", () => {
	const tokenLine = (input: number, output: number, totalCumulative: number, window: number) => ({
		timestamp: "2026-07-14T14:42:05.055Z",
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				total_token_usage: {
					input_tokens: totalCumulative,
					output_tokens: 0,
					total_tokens: totalCumulative,
				},
				last_token_usage: {
					input_tokens: input,
					cached_input_tokens: 0,
					output_tokens: output,
					reasoning_output_tokens: 0,
					total_tokens: input + output,
				},
				model_context_window: window,
			},
		},
	});

	it("reads the tail token_count's last_token_usage (input+output) as a bare number — the rollout-reported window is ignored (P3 T006c: contextMax is the models.json join)", () => {
		const text = lines(
			{ type: "session_meta" },
			tokenLine(19_607, 238, 19_845, 353_400),
			tokenLine(116_620, 238, 43_482_217, 258_400),
		);
		expect(codexContextFromRollout(text)).toBe(116_858);
	});

	it("NEVER reports the cumulative total (the 72M-against-258k lie, pinned)", () => {
		const text = lines(tokenLine(110_000, 238, 72_791_190, 258_400));
		const reading = codexContextFromRollout(text);
		expect(reading).toBe(110_238);
		expect(reading).not.toBe(72_791_190);
	});

	it("a zero-usage tail line falls back to the last NON-ZERO reading", () => {
		const text = lines(tokenLine(116_620, 238, 1, 258_400), tokenLine(0, 0, 2, 258_400));
		expect(codexContextFromRollout(text)).toBe(116_858);
	});

	it("null when no token_count line carries a usable reading", () => {
		expect(codexContextFromRollout(lines({ type: "session_meta" }))).toBeNull();
		expect(codexContextFromRollout(lines(tokenLine(0, 0, 0, 258_400)))).toBeNull();
		expect(codexContextFromRollout("")).toBeNull();
	});
});

describe("piContextFromEvents (last assistant usage.totalTokens)", () => {
	const assistantLine = (totalTokens: number | undefined, parts: Record<string, number> = {}) => ({
		seq: 1,
		timestamp: "2026-07-17T00:00:00.000Z",
		type: "message",
		data: {
			type: "message_end",
			message: {
				role: "assistant",
				usage:
					totalTokens === undefined
						? { input: 3, output: 174, cacheRead: 619_210, cacheWrite: 546, ...parts }
						: { input: 3, output: 174, cacheRead: 619_210, cacheWrite: 546, totalTokens },
			},
		},
	});

	it("reads the LAST assistant usage's totalTokens", () => {
		const text = lines(assistantLine(100), assistantLine(619_933));
		expect(piContextFromEvents(text)).toBe(619_933);
	});

	it("falls back to summing the components when totalTokens is absent", () => {
		expect(piContextFromEvents(lines(assistantLine(undefined)))).toBe(3 + 174 + 619_210 + 546);
	});

	it("null with no assistant usage anywhere", () => {
		const userOnly = {
			type: "message",
			data: { type: "message_end", message: { role: "user", content: [] } },
		};
		expect(piContextFromEvents(lines(userOnly))).toBeNull();
		expect(piContextFromEvents("")).toBeNull();
	});
});

describe("contextMaxFor (boundModel → models registry join)", () => {
	const models: ModelEntry[] = [
		{ id: "gpt-5.6-sol", name: "sol", provider: "copilot", verified: true, contextWindow: 258_400 },
		{ id: "claude-fable-5", name: "fable", provider: "claude", verified: false },
	];

	it("joins by exact model id", () => {
		expect(contextMaxFor("gpt-5.6-sol", models)).toBe(258_400);
	});

	it("joins provider-qualified selectors without dropping the context tier", () => {
		expect(contextMaxFor("copilot/gpt-5.6-sol", models)).toBe(258_400);
	});

	it("undefined when the model is unknown, has no window, or is unset", () => {
		expect(contextMaxFor("claude-fable-5", models)).toBeUndefined();
		expect(contextMaxFor("ghost-model", models)).toBeUndefined();
		expect(contextMaxFor(undefined, models)).toBeUndefined();
	});
});
