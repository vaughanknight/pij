// pij index wiring — status bar (plan 018).
//
// Pattern P8: tests target the wiring, not the core. This file owns ONE
// concern: session_start publishes the pij id through the host's persistent
// status surface — Pi's keyed extension status or OMP's default session_name
// segment. Fakes keep both paths at unit speed with no live TUI.
//
// Non-vacuous: removing either publication path from index.ts fails its
// corresponding assertion.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { GitRepositoryAdapter } from "./adapters/git-repository.js";
import { deriveSelfId, memorableIdentitySeed } from "./core/discovery.js";
import { receiptBody } from "./core/message.js";
import pijExtension from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fake ExtensionAPI — captures only what index.ts needs at wiring
 *  time + what session_start triggers (sendUserMessage for the boot announce). */
function makeFakePi(onSendUserMessage: (message: string) => void = () => {}) {
	const handlers = new Map<string, (...args: unknown[]) => unknown>();
	const sentUserMessages: string[] = [];
	const sessionNames: string[] = [];
	const pi = {
		on: (event: string, handler: (...args: unknown[]) => unknown) => {
			handlers.set(event, handler);
		},
		registerTool: () => {},
		registerCommand: () => {},
		events: { on: () => {}, emit: () => {} },
		sendUserMessage: (message: string) => {
			sentUserMessages.push(message);
			onSendUserMessage(message);
		},
		setSessionName: async (name: string) => {
			sessionNames.push(name);
		},
	} as unknown as ExtensionAPI;
	return { pi, handlers, sentUserMessages, sessionNames };
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
	let origParentId: string | undefined;
	let origOmpCode: string | undefined;
	let origAnnounceTo: string | undefined;

	beforeEach(() => {
		origPijHome = process.env.PIJ_HOME;
		origSessionId = process.env.PIJ_SESSION_ID;
		origParentId = process.env.PIJ_PARENT_ID;
		origOmpCode = process.env.OMPCODE;
		origAnnounceTo = process.env.PIJ_ANNOUNCE_TO;
		pijHome = mkdtempSync(join(tmpdir(), "pij-status-test-"));
		process.env.PIJ_HOME = pijHome;
		delete process.env.PIJ_PARENT_ID;
		delete process.env.OMPCODE;
		delete process.env.PIJ_ANNOUNCE_TO;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(pijHome, { recursive: true, force: true });
		if (origPijHome === undefined) delete process.env.PIJ_HOME;
		else process.env.PIJ_HOME = origPijHome;
		if (origSessionId === undefined) delete process.env.PIJ_SESSION_ID;
		else process.env.PIJ_SESSION_ID = origSessionId;
		if (origParentId === undefined) delete process.env.PIJ_PARENT_ID;
		else process.env.PIJ_PARENT_ID = origParentId;
		if (origOmpCode === undefined) delete process.env.OMPCODE;
		else process.env.OMPCODE = origOmpCode;
		if (origAnnounceTo === undefined) delete process.env.PIJ_ANNOUNCE_TO;
		else process.env.PIJ_ANNOUNCE_TO = origAnnounceTo;
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
		expect(pijStatus?.value).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);

		// Best-effort cleanup of any FS watcher opened by session_start.
		try {
			await handlers.get("session_shutdown")?.({}, ctx);
		} catch {
			// ignore
		}
	});

	it("publishes the pij id through OMP's default session_name segment", async () => {
		process.env.OMPCODE = "1";
		const { pi, handlers, sessionNames } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx("omp-session-statusbar");

		pijExtension(pi);
		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);

		expect(sessionNames.at(-1)).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);
		expect(statuses.some((status) => status.key === "pij")).toBe(false);
		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("reuses on reload, mints on new, and preserves an existing opaque id with prime metadata", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses, setSessionId } = makeFakeCtx("native-start");
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		const first = statuses.at(-1)?.value;
		expect(first).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);

		await handlers.get("session_start")?.({ type: "session_start", reason: "reload" }, ctx);
		expect(statuses.at(-1)?.value).toBe(first);

		setSessionId("native-new");
		await handlers.get("session_start")?.({ type: "session_start", reason: "new" }, ctx);
		const second = statuses.at(-1)?.value;
		expect(second).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);
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

	it("passes the exact shutdown reason: replacement dissolves, quit stays observable", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx("native-shutdown-contract");
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		const id = statuses.at(-1)?.value as string;
		await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "reload" }, ctx);
		expect(new FsRegistry(pijHome).read(id)).toMatchObject({ lifecycle: "dissolved" });

		await handlers.get("session_start")?.({ type: "session_start", reason: "reload" }, ctx);
		expect(new FsRegistry(pijHome).read(id)?.lifecycle).not.toBe("dissolved");
		await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctx);
		expect(new FsRegistry(pijHome).read(id)?.lifecycle).not.toBe("dissolved");
		expect(new FsRegistry(pijHome).read(id)?.terminal).toBeUndefined();
	});

	it("registers Pi with its structural parent and freshly resolved repository identity", async () => {
		process.env.PIJ_PARENT_ID = "pij-structural-parent";
		const gitCommonDir = vi
			.spyOn(GitRepositoryAdapter.prototype, "gitCommonDir")
			.mockReturnValue("/repo/.git");
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx("native-repository");
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);

		const id = statuses.at(-1)?.value;
		expect(gitCommonDir).toHaveBeenCalledWith(process.cwd());
		expect(new FsRegistry(pijHome).read(id as string)).toMatchObject({
			parentId: "pij-structural-parent",
			gitCommonDir: "/repo/.git",
		});
		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("blocks ask_user_question only for a structurally managed Pi peer and still captures it", async () => {
		process.env.PIJ_PARENT_ID = "pij-structural-parent";
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx("native-modal-guard");
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		const result = await handlers.get("tool_call")?.(
			{ toolCallId: "modal-call", toolName: "ask_user_question", input: {} },
			ctx,
		);

		expect(result).toMatchObject({
			block: true,
			reason: expect.stringContaining("pij invariant #9"),
		});
		expect(result).toMatchObject({
			reason: expect.stringContaining("pij_send"),
		});
		const id = statuses.at(-1)?.value;
		expect(new FsEventLog(pijHome, id as string).read({ type: "tool_call" })).toMatchObject([
			{ data: { toolCallId: "modal-call", toolName: "ask_user_question", input: {} } },
		]);

		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("does not block ask_user_question for an un-managed Pi session", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx } = makeFakeCtx("native-generic-modal-guard");
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		expect(
			await handlers.get("tool_call")?.(
				{ toolCallId: "generic-modal-call", toolName: "ask_user_question", input: {} },
				ctx,
			),
		).toBeUndefined();

		await handlers.get("session_shutdown")?.({}, ctx);
	});

	it("allocates a memorable SDK/test fallback when Pi exposes no native session id", async () => {
		const { pi, handlers } = makeFakePi();
		const { ctx, statuses } = makeFakeCtx(undefined);
		pijExtension(pi);

		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
		const id = statuses.at(-1)?.value;
		expect(id).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);
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
