// pij-control-plane — tmux capture-format parsing (plan 054 P2 T006, AC-09).
//
// The spawn format extends `-P -F '#{pane_id}'` to '#{pane_id} #{window_id}'
// so terminal addressability (`tmux select-window -t <windowId>`) is captured
// at birth. The parse is pinned here against the REAL format shapes tmux
// emits; the adapter itself stays a thin argv wrapper.

import { describe, expect, it } from "vitest";
import { parsePaneAndWindow } from "./tmux.js";

describe("parsePaneAndWindow (real capture-format pin)", () => {
	it("parses '%12 @3\\n' — the extended -F output", () => {
		expect(parsePaneAndWindow("%12 @3\n")).toEqual({ paneId: "%12", windowId: "@3" });
	});

	it("parses a bare pane id (legacy single-field format) with windowId absent", () => {
		expect(parsePaneAndWindow("%12\n")).toEqual({ paneId: "%12" });
	});

	it("a malformed window id degrades to paneId-only — never fails the spawn", () => {
		expect(parsePaneAndWindow("%12 win3\n")).toEqual({ paneId: "%12" });
	});

	it("a malformed pane id is null (the spawn must fail loudly, as today)", () => {
		expect(parsePaneAndWindow("pane12 @3\n")).toBeNull();
		expect(parsePaneAndWindow("")).toBeNull();
		expect(parsePaneAndWindow("@3\n")).toBeNull();
	});
});
