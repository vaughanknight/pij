import { describe, expect, it } from "vitest";

import { makeRecorder } from "../../../harness/test-utils.js";
import {
	formatPeacockList,
	PEACOCK_PRESETS,
	PEACOCK_SESSION_CUSTOM_TYPE,
	PiPeacockStore,
	parsePeacockCommand,
	type ReplayableEntry,
	replayPeacockSettings,
} from "./store.js";

function makeStore() {
	const { append, calls } = makeRecorder();
	const store = new PiPeacockStore(append, () => 1234);
	return { store, calls };
}

describe("peacock presets", () => {
	it("contains the nine VS Code Peacock preset colors", () => {
		expect(PEACOCK_PRESETS.map((preset) => [preset.id, preset.hex])).toEqual([
			["angularRed", "#dd0531"],
			["azureBlue", "#007fff"],
			["javascriptYellow", "#f9e64f"],
			["mandalorianBlue", "#1857a4"],
			["nodeGreen", "#215732"],
			["reactBlue", "#61dafb"],
			["somethingDifferent", "#832561"],
			["svelteOrange", "#ff3d00"],
			["vueGreen", "#42b883"],
		]);
	});

	it("formats /peacock list with exact labels and hex values", () => {
		const list = formatPeacockList();
		for (const preset of PEACOCK_PRESETS) {
			expect(list).toContain(`${preset.label}: ${preset.hex}`);
		}
		expect(list.split("\n")).toHaveLength(10);
	});
});

describe("parsePeacockCommand", () => {
	it("parses core command variants", () => {
		expect(parsePeacockCommand("")).toEqual({ ok: true, command: { action: "status" } });
		expect(parsePeacockCommand("list")).toEqual({ ok: true, command: { action: "list" } });
		expect(parsePeacockCommand("status --json")).toEqual({
			ok: true,
			command: { action: "status", json: true },
		});
		expect(parsePeacockCommand("off")).toEqual({ ok: true, command: { action: "off" } });
		expect(parsePeacockCommand("reset")).toEqual({ ok: true, command: { action: "reset" } });
		expect(parsePeacockCommand("surface footer")).toEqual({
			ok: true,
			command: { action: "surface", surface: "footer" },
		});
	});

	it("parses preset ids, aliases, and hex values", () => {
		expect(parsePeacockCommand("reactBlue")).toEqual({
			ok: true,
			command: { action: "apply", colorHex: "#61dafb", presetId: "reactBlue" },
		});
		expect(parsePeacockCommand("peacockGreen")).toEqual({
			ok: true,
			command: { action: "apply", colorHex: "#42b883", presetId: "vueGreen" },
		});
		expect(parsePeacockCommand("dd0531")).toEqual({
			ok: true,
			command: { action: "apply", colorHex: "#dd0531" },
		});
		expect(parsePeacockCommand("#ABCDEF")).toEqual({
			ok: true,
			command: { action: "apply", colorHex: "#abcdef" },
		});
	});

	it("rejects unknown colors and unsupported surfaces", () => {
		expect(parsePeacockCommand("chartreuse")).toMatchObject({ ok: false });
		expect(parsePeacockCommand("surface top")).toMatchObject({ ok: false });
		expect(parsePeacockCommand("#abcd")).toMatchObject({ ok: false });
	});
});

describe("PiPeacockStore", () => {
	it("starts disabled", () => {
		const { store } = makeStore();
		expect(store.snapshot()).toEqual({ enabled: false, surface: "footer" });
	});

	it("persists before mutating when applying a color", () => {
		const { store, calls } = makeStore();
		const result = store.applyColor({ colorHex: "#61dafb", presetId: "reactBlue" });
		expect(result.ok).toBe(true);
		expect(calls).toEqual([
			{
				customType: PEACOCK_SESSION_CUSTOM_TYPE,
				data: {
					op: "apply",
					colorHex: "#61dafb",
					presetId: "reactBlue",
					surface: "footer",
					at: 1234,
				},
			},
		]);
		expect(store.snapshot()).toEqual({
			enabled: true,
			colorHex: "#61dafb",
			presetId: "reactBlue",
			surface: "footer",
			updatedAt: 1234,
		});
	});

	it("replays latest valid setting, off, and reset entries", () => {
		const entries: ReplayableEntry[] = [
			{
				type: "custom",
				customType: PEACOCK_SESSION_CUSTOM_TYPE,
				data: { op: "apply", colorHex: "#dd0531", surface: "footer", at: 1 },
			},
			{ type: "custom", customType: PEACOCK_SESSION_CUSTOM_TYPE, data: { op: "off", at: 2 } },
			{
				type: "custom",
				customType: PEACOCK_SESSION_CUSTOM_TYPE,
				data: { op: "apply", colorHex: "#61dafb", presetId: "reactBlue", surface: "footer", at: 3 },
			},
		];
		expect(replayPeacockSettings(entries)).toEqual({
			enabled: true,
			colorHex: "#61dafb",
			presetId: "reactBlue",
			surface: "footer",
			updatedAt: 3,
		});
		expect(
			replayPeacockSettings([
				...entries,
				{ type: "custom", customType: PEACOCK_SESSION_CUSTOM_TYPE, data: { op: "reset", at: 4 } },
			]),
		).toEqual({ enabled: false, surface: "footer" });
	});

	it("ignores malformed replay entries", () => {
		const entries: ReplayableEntry[] = [
			{ type: "custom", customType: PEACOCK_SESSION_CUSTOM_TYPE, data: null },
			{
				type: "custom",
				customType: PEACOCK_SESSION_CUSTOM_TYPE,
				data: { op: "apply", colorHex: "#nope", surface: "footer", at: 1 },
			},
			{
				type: "custom",
				customType: "other",
				data: { op: "apply", colorHex: "#dd0531", surface: "footer", at: 2 },
			},
		];
		expect(replayPeacockSettings(entries)).toEqual({ enabled: false, surface: "footer" });
	});

	it("persists off and reset before state changes", () => {
		const { store, calls } = makeStore();
		store.applyColor({ colorHex: "#61dafb" });
		store.off();
		store.reset();
		expect(calls.map((call) => call.data)).toEqual([
			{ op: "apply", colorHex: "#61dafb", surface: "footer", at: 1234 },
			{ op: "off", at: 1234 },
			{ op: "reset", at: 1234 },
		]);
		expect(store.snapshot()).toEqual({ enabled: false, surface: "footer" });
	});
});
