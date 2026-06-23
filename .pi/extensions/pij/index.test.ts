// pij index wiring — status bar (plan 018).
//
// Pattern P8: tests target the wiring, not the core. This file owns ONE
// concern: the pi-facing session_start handler calls ctx.ui.setStatus with
// PIJ_STATUS_KEY ("pij") and this session's pij id immediately after
// deriveSelfId fires. Uses a fake ctx.ui (pi-peacock test pattern) so the
// test is driven at unit speed with no live TUI.
//
// Non-vacuous: removing the ctx.ui.setStatus(PIJ_STATUS_KEY, self) call from
// index.ts causes this test to fail (no "pij" entry in captured statuses).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deriveSelfId } from "./core/discovery.js";
import pijExtension from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fake ExtensionAPI — captures only what index.ts needs at wiring
 *  time + what session_start triggers (sendUserMessage for the boot announce). */
function makeFakePi() {
	const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
	const pi = {
		on: (event: string, handler: (...args: unknown[]) => Promise<void>) => {
			handlers.set(event, handler);
		},
		registerTool: () => {},
		registerCommand: () => {},
		events: { on: () => {}, emit: () => {} },
		sendUserMessage: () => {}, // called by PiRuntimeAdapter.inject on fresh boot
	} as unknown as ExtensionAPI;
	return { pi, handlers };
}

/** Minimal fake ExtensionContext — captures setStatus calls. */
function makeFakeCtx() {
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	const ctx = {
		sessionManager: { getSessionId: () => "test-session-statusbar-018" },
		isIdle: () => true,
		compact: () => {},
		ui: {
			setStatus: (key: string, value: string | undefined) => statuses.push({ key, value }),
			notify: () => {},
		},
	} as unknown as ExtensionContext;
	return { ctx, statuses };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pij index — footer status bar", () => {
	let pijHome: string;
	let origPijHome: string | undefined;
	let origSessionId: string | undefined;

	beforeEach(() => {
		origPijHome = process.env.PIJ_HOME;
		origSessionId = process.env.PIJ_SESSION_ID;
		pijHome = mkdtempSync(join(tmpdir(), "pij-status-test-"));
		process.env.PIJ_HOME = pijHome;
	});

	afterEach(() => {
		rmSync(pijHome, { recursive: true, force: true });
		if (origPijHome === undefined) delete process.env.PIJ_HOME;
		else process.env.PIJ_HOME = origPijHome;
		if (origSessionId === undefined) delete process.env.PIJ_SESSION_ID;
		else process.env.PIJ_SESSION_ID = origSessionId;
	});

	it("publishes the pij id to the status bar on session_start", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx();

		pijExtension(pi);

		// Fire session_start — the handler calls setStatus(PIJ_STATUS_KEY, self)
		// right after deriveSelfId, before any further FS/boot work.
		try {
			await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		} catch {
			// handler may do further FS/boot work after setStatus; only the status
			// call itself is what we're testing — a throw here is irrelevant.
		}

		const pijStatus = statuses.find((s) => s.key === "pij");
		expect(pijStatus).toBeDefined();
		// deriveSelfId produces a deterministic id from the injected session id + pid.
		// toBe (exact match) ensures neither a static bogus value nor a missing setStatus call passes.
		expect(pijStatus?.value).toBe(deriveSelfId("test-session-statusbar-018", process.pid));

		// Best-effort cleanup of any FS watcher opened by session_start.
		try {
			await handlers.get("session_shutdown")?.({}, ctx);
		} catch {
			// ignore
		}
	});
});
