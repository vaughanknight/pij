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

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { deriveSelfId, memorableIdentitySeed } from "./core/discovery.js";
import { receiptBody } from "./core/message.js";
import pijExtension from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fake ExtensionAPI — captures only what index.ts needs at wiring
 *  time + what session_start triggers (sendUserMessage for the boot announce). */
function makeFakePi(onSendUserMessage: (message: string) => void = () => {}) {
	const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
	const sentUserMessages: string[] = [];
	const pi = {
		on: (event: string, handler: (...args: unknown[]) => Promise<void>) => {
			handlers.set(event, handler);
		},
		registerTool: () => {},
		registerCommand: () => {},
		events: { on: () => {}, emit: () => {} },
		sendUserMessage: (message: string) => {
			sentUserMessages.push(message);
			onSendUserMessage(message);
		},
	} as unknown as ExtensionAPI;
	return { pi, handlers, sentUserMessages };
}

/** Minimal fake ExtensionContext — captures setStatus calls. */
function makeFakeCtx(initialSessionId: string | undefined = "test-session-statusbar-018") {
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	let sessionId = initialSessionId;
	const ctx = {
		sessionManager: { getSessionId: () => sessionId },
		isIdle: () => true,
		compact: () => {},
		ui: {
			setStatus: (key: string, value: string | undefined) => statuses.push({ key, value }),
			notify: () => {},
		},
	} as unknown as ExtensionContext;
	return { ctx, statuses, setSessionId: (next: string | undefined) => (sessionId = next) };
}

function allocatePiIdentity(pijHome: string, nativeSessionId: string): string {
	const allocated = new FsRegistry(pijHome).allocateIdentity(
		"pi",
		nativeSessionId,
		memorableIdentitySeed("pi", nativeSessionId),
		deriveSelfId(nativeSessionId, process.pid),
	);
	if (!allocated.ok) throw new Error(allocated.message);
	return allocated.value.id;
}

function inboxPath(pijHome: string, id: string, name: string): string {
	return join(pijHome, id, "inbox", name);
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
		expect(pijStatus?.value).toMatch(/^pij-[a-z]+-[a-z]+$/);

		// Best-effort cleanup of any FS watcher opened by session_start.
		try {
			await handlers.get("session_shutdown")?.({}, ctx);
		} catch {
			// ignore
		}
	});

	it("reuses on reload, mints on new, and preserves an existing opaque id with prime metadata", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses, setSessionId } = makeFakeCtx("native-start");
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		const first = statuses.at(-1)?.value;
		expect(first).toMatch(/^pij-[a-z]+-[a-z]+$/);

		await handlers.get("session_start")?.({ type: "session_start", reason: "reload" }, ctx);
		expect(statuses.at(-1)?.value).toBe(first);

		setSessionId("native-new");
		await handlers.get("session_start")?.({ type: "session_start", reason: "new" }, ctx);
		const second = statuses.at(-1)?.value;
		expect(second).toMatch(/^pij-[a-z]+-[a-z]+$/);
		expect(second).not.toBe(first);

		const opaqueNative = "native-existing-opaque";
		const opaqueId = deriveSelfId(opaqueNative, process.pid);
		new FsRegistry(pijHome).write({
			id: opaqueId,
			prime: true,
			folder: process.cwd(),
			dataDir: join(pijHome, opaqueId),
			eventsPath: join(pijHome, opaqueId, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
		});
		setSessionId(opaqueNative);
		await handlers.get("session_start")?.({ type: "session_start", reason: "resume" }, ctx);
		expect(statuses.at(-1)?.value).toBe(opaqueId);
		expect(new FsRegistry(pijHome).read(opaqueId)?.prime).toBe(true);

		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("allocates a memorable SDK/test fallback when Pi exposes no native session id", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx(undefined);
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		const id = statuses.at(-1)?.value;
		expect(id).toMatch(/^pij-[a-z]+-[a-z]+$/);
		expect(new FsRegistry(pijHome).read(id as string)).toMatchObject({ id });

		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("marks a retained unread message only after onInbound injects it, then reload skips it", async () => {
		const nativeSessionId = "native-post-inbound";
		const id = allocatePiIdentity(pijHome, nativeSessionId);
		const channel = new FsChannel(pijHome);
		const delivered = channel.deliver({ from: "pij-boss", to: id, body: "post-outcome message" });
		if (!delivered.ok) throw new Error(delivered.message);
		const marker = inboxPath(pijHome, id, `read-${delivered.value.messageId}.json`);
		const message = inboxPath(pijHome, id, `msg-${delivered.value.messageId}.json`);
		const markerStateDuringInbound: boolean[] = [];
		const { pi, handlers, sentUserMessages } = makeFakePi((text) => {
			if (text.includes("post-outcome message")) {
				markerStateDuringInbound.push(existsSync(marker));
			}
		});
		const { ctx } = makeFakeCtx(nativeSessionId);
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);

		expect(markerStateDuringInbound).toEqual([false]);
		expect(existsSync(message)).toBe(true);
		expect(existsSync(marker)).toBe(true);
		expect(channel.listUnread(id)).toEqual({ ok: true, value: [] });
		expect(sentUserMessages.filter((text) => text.includes("post-outcome message"))).toHaveLength(
			1,
		);

		await handlers.get("session_start")?.({ type: "session_start", reason: "reload" }, ctx);
		expect(sentUserMessages.filter((text) => text.includes("post-outcome message"))).toHaveLength(
			1,
		);
		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("records and marks receipt history without injecting or replaying it", async () => {
		const nativeSessionId = "native-receipt-history";
		const id = allocatePiIdentity(pijHome, nativeSessionId);
		const channel = new FsChannel(pijHome);
		const body = receiptBody("original-message", "delivered");
		const delivered = channel.deliver({
			from: "pij-boss",
			to: id,
			body,
			kind: "receipt",
		});
		if (!delivered.ok) throw new Error(delivered.message);
		const marker = inboxPath(pijHome, id, `read-${delivered.value.messageId}.json`);
		const { pi, handlers, sentUserMessages } = makeFakePi();
		const { ctx } = makeFakeCtx(nativeSessionId);
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);

		expect(sentUserMessages.some((text) => text.includes(body))).toBe(false);
		expect(existsSync(marker)).toBe(true);
		expect(new FsEventLog(pijHome, id).read({ type: "receipt" })).toHaveLength(1);
		expect(
			readdirSync(join(pijHome, id, "inbox")).filter((name) => name.startsWith("msg-")),
		).toHaveLength(1);

		await handlers.get("session_start")?.({ type: "session_start", reason: "reload" }, ctx);
		expect(new FsEventLog(pijHome, id).read({ type: "receipt" })).toHaveLength(1);
		await handlers.get("session_shutdown")?.({}, ctx);
	});
});
