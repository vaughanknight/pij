import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { frame } from "../core/message.js";
import { PiRuntimeAdapter } from "./pi-runtime.js";

describe("draft-safe extension submission", () => {
	it.each([
		"immediate",
		"steer",
	] as const)("delivers %s without touching the composer", async (mode) => {
		const draft = "Unsubmitted human draft\nwith Unicode 你好";
		const incoming = frame("pij-sender", "Incoming pij message");
		let editorText = draft;
		const editorWrites: string[] = [];
		const modelMessages: string[] = [];
		const visibleMessages: string[] = [];
		const pending: Array<() => void> = [];
		const ui = {
			getEditorText: () => editorText,
			setEditorText: (text: string) => {
				editorWrites.push(text);
				editorText = text;
			},
			setStatus: () => {},
			notify: () => {},
		};
		const api = {
			// OMP cli.js:19099 message_start clears the editor for an external,
			// non-synthetic user message without a local-submit signature.
			sendUserMessage: (content: Parameters<ExtensionAPI["sendUserMessage"]>[0]) => {
				pending.push(() => {
					ui.setEditorText("");
					modelMessages.push(String(content));
					visibleMessages.push(String(content));
				});
			},
			// OMP cli.js:17381 uses custom messages directly: steer when busy,
			// trigger a prompt when idle. message_start renders without clearing.
			sendMessage: (
				message: Parameters<ExtensionAPI["sendMessage"]>[0],
				options?: Parameters<ExtensionAPI["sendMessage"]>[1],
			) => {
				// OMP also restores user-attributed custom messages into the editor on Escape.
				expect(message).not.toHaveProperty("attribution", "user");
				pending.push(() => {
					if (mode === "steer" || options?.triggerTurn) modelMessages.push(String(message.content));
					if (message.display) visibleMessages.push(String(message.content));
				});
			},
		};
		const adapter = new PiRuntimeAdapter(
			api,
			{
				isIdle: () => mode === "immediate",
				compact: () => {},
				ui,
			},
			"omp",
		);
		adapter.inject(incoming, mode);
		// Delivery occurs after the extension returns, not synchronously inside
		// sendUserMessage. Restoring a snapshot cannot defend this boundary.
		await Promise.resolve();
		for (const deliver of pending) deliver();
		expect(editorText).toBe(draft);
		expect(editorWrites).toEqual([]);
		expect(modelMessages).toEqual([incoming]);
		expect(visibleMessages).toEqual([incoming]);
	});

	it("starts an OMP turn if the runtime becomes idle before queued delivery", () => {
		const calls: Array<Parameters<ExtensionAPI["sendMessage"]>> = [];
		const adapter = new PiRuntimeAdapter(
			{
				sendUserMessage: () => {
					throw new Error("OMP must not use the user-message path");
				},
				sendMessage: (message, options) => {
					calls.push([message, options]);
				},
			},
			{
				isIdle: () => true,
				compact: () => {},
				ui: { setStatus: () => {}, notify: () => {} },
			},
			"omp",
		);
		adapter.inject("arrived while busy", "steer");
		expect(calls).toEqual([
			[
				{ customType: "pij", content: "arrived while busy", display: true },
				{ triggerTurn: true, deliverAs: "steer" },
			],
		]);
	});

	it.each(["immediate", "steer"] as const)("keeps Pi's %s user-message API", (mode) => {
		const calls: Array<Parameters<ExtensionAPI["sendUserMessage"]>> = [];
		const adapter = new PiRuntimeAdapter(
			{
				sendUserMessage: (...args) => {
					calls.push(args);
				},
				sendMessage: () => {
					throw new Error("Pi must retain user-message semantics");
				},
			},
			{
				isIdle: () => mode === "immediate",
				compact: () => {},
				ui: { setStatus: () => {}, notify: () => {} },
			},
			"pi",
		);
		// Pi interactive-mode.js:2314-2317 renders user message_start without an
		// editor mutation, unlike OMP. Keep the existing public submission path.
		adapter.inject("Incoming pij message", mode);
		expect(calls).toEqual(
			mode === "steer"
				? [["Incoming pij message", { deliverAs: "steer" }]]
				: [["Incoming pij message"]],
		);
	});
});
