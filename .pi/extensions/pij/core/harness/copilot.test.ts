import { describe, expect, it } from "vitest";

import { sessionEventsPath, summarizeCopilotEvent } from "./copilot.js";

describe("sessionEventsPath", () => {
	it("is ~/.copilot/session-state/<sid>/events.jsonl", () => {
		expect(sessionEventsPath("/Users/jo", "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad")).toBe(
			"/Users/jo/.copilot/session-state/9a8f8be6-3670-4e5c-b43e-09f46fe4dfad/events.jsonl",
		);
	});
});

describe("summarizeCopilotEvent", () => {
	// Shapes captured live from a real events.jsonl (Copilot v1.0.66, 2026-06-27).
	it("renders a user.message from data.content (not transformedContent)", () => {
		const raw = JSON.stringify({
			type: "user.message",
			data: {
				content: "say only the word PONG and nothing else",
				transformedContent: "<current_datetime>…</current_datetime>\n\nsay only the word PONG…",
			},
		});
		expect(summarizeCopilotEvent(raw)).toEqual({
			role: "user",
			text: "say only the word PONG and nothing else",
		});
	});

	it("renders an assistant.message from data.content", () => {
		const raw = JSON.stringify({
			type: "assistant.message",
			data: { messageId: "x", model: "gpt-5.5", content: "PONG", toolRequests: [] },
		});
		expect(summarizeCopilotEvent(raw)).toEqual({ role: "assistant", text: "PONG" });
	});

	it("appends tool requests as ⚙ name after assistant text", () => {
		const raw = JSON.stringify({
			type: "assistant.message",
			data: {
				content: "running it",
				toolRequests: [{ name: "bash" }, { name: "read" }],
			},
		});
		expect(summarizeCopilotEvent(raw)).toEqual({
			role: "assistant",
			text: "running it ⚙ bash ⚙ read",
		});
	});

	it("drops an empty-content user.message (deferred-tool/system injection)", () => {
		const raw = JSON.stringify({
			type: "user.message",
			data: { content: "", transformedContent: "IMPORTANT: deferred tools…" },
		});
		expect(summarizeCopilotEvent(raw)).toBeNull();
	});

	it("ignores non-conversational events (session/turn markers)", () => {
		expect(summarizeCopilotEvent(JSON.stringify({ type: "session.start", data: {} }))).toBeNull();
		expect(
			summarizeCopilotEvent(
				JSON.stringify({ type: "assistant.turn_start", data: { turnId: "0" } }),
			),
		).toBeNull();
	});

	it("returns null for malformed JSON", () => {
		expect(summarizeCopilotEvent("{not json")).toBeNull();
	});
});
