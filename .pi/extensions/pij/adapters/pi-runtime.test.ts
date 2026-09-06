import {
	getKeybindings,
	KeybindingsManager,
	setKeybindings,
	TUI_KEYBINDINGS,
} from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { HoldQueue } from "../core/hold-queue.js";
import { PiRuntimeAdapter } from "./pi-runtime.js";

function editorHarness() {
	let at = 0;
	let text = "draft";
	let input: ((data: string) => unknown) | undefined;
	const queue = new HoldQueue(() => at, 60_000);
	const adapter = new PiRuntimeAdapter(
		{ sendUserMessage: () => {} },
		{
			isIdle: () => true,
			compact: () => {},
			ui: {
				getEditorText: () => text,
				onTerminalInput: (handler) => {
					input = handler;
					return () => {
						input = undefined;
					};
				},
				setStatus: () => {},
				notify: () => {},
			},
		},
		undefined,
		() => at,
	);
	const stop = adapter.onEditorChange((time) => queue.noteEdit(time));
	return {
		queue,
		stop,
		async terminal(data: string, after = text) {
			input?.(data); // The real TUI calls listeners before the focused editor.
			text = after;
			await Promise.resolve();
		},
		setTime(time: number) {
			at = time;
		},
	};
}

describe("draft edit sensor", () => {
	it.each([
		["SGR mouse press", "\u001b[<0;12;4M"],
		["SGR mouse release", "\u001b[<0;12;4m"],
		["X10 mouse", "\u001b[M !!"],
		["focus in", "\u001b[I"],
		["focus out", "\u001b[O"],
		["left arrow", "\u001b[D"],
		["history up", "\u001b[A"],
		["application arrow", "\u001bOA"],
		["Kitty up", "\u001b[57352u"],
	])("%s leaves lastEditAt unchanged", async (_name, data) => {
		const h = editorHarness();
		h.queue.noteEdit(0);
		h.setTime(59_000);
		await h.terminal(data);
		expect(h.queue.shouldHold(60_000, "draft")).toBe(false);
	});

	it("does not count history navigation even when it replaces the draft", async () => {
		const h = editorHarness();
		await h.terminal("\u001b[A", "previous prompt");
		expect(h.queue.shouldHold(1, "previous prompt")).toBe(false);
	});

	it("does not count a batch of navigation and focus events", async () => {
		const h = editorHarness();
		await Promise.all([h.terminal("\u001b[I"), h.terminal("\u001b[A", "previous prompt")]);
		expect(h.queue.shouldHold(1, "previous prompt")).toBe(false);
	});

	it.each([
		["text", "x", "draftx"],
		["backspace", "\u007f", "draf"],
		["delete", "\u001b[3~", "draf"],
		["paste", "\u001b[200~paste\u001b[201~", "draftpaste"],
		["Kitty text", "\u001b[120u", "draftx"],
		["Unicode text", "你好", "draft你好"],
		["shifted Kitty text", "\u001b[120;2u", "draftX"],
		["Kitty Unicode text", "\u001b[20320u", "draft你"],
		["modifyOtherKeys Unicode text", "\u001b[27;2;233~", "drafté"],
	])("counts edit-capable %s input", async (_name, data, after) => {
		const h = editorHarness();
		await h.terminal(data, after);
		expect(h.queue.shouldHold(1, after)).toBe(true);
	});

	it("counts configured asynchronous clipboard paste before text appears", async () => {
		const previous = getKeybindings();
		setKeybindings(
			new KeybindingsManager(
				{
					...TUI_KEYBINDINGS,
					"app.clipboard.pasteTextRaw": { defaultKeys: "ctrl+shift+v" },
				},
				{ "app.clipboard.pasteTextRaw": "alt+v" },
			),
		);
		try {
			const h = editorHarness();
			await h.terminal("\u001bv");
			expect(h.queue.shouldHold(1, "")).toBe(false);
			await Promise.resolve(); // Clipboard completion can occur after the input turn.
			expect(h.queue.shouldHold(2, "pasted text")).toBe(true);
		} finally {
			setKeybindings(previous);
		}
	});

	it("unsubscribes from further terminal input", async () => {
		const h = editorHarness();
		h.stop();
		await h.terminal("x", "draftx");
		expect(h.queue.shouldHold(1, "draftx")).toBe(false);
	});
});
