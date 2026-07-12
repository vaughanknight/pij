import { describe, expect, it } from "vitest";

import { FakeEventLog, FakeInbox } from "../adapters/fakes.js";
import {
	consumeInbox,
	inboxTimeoutResult,
	parseInboxArgs,
	persistReceiptEnvelope,
	prepareReceiptEnvelopes,
	renderInboxRegistration,
	renderInboxResult,
	renderInboxWaiting,
} from "./inbox.js";
import { receiptBody } from "./message.js";
import type { EventLogPort, InboxPort } from "./ports.js";
import { type DeliveredMessage, err } from "./types.js";

function message(messageId: string, over: Partial<DeliveredMessage> = {}): DeliveredMessage {
	return {
		messageId,
		from: "pij-sender",
		to: "pij-self",
		body: `body-${messageId}`,
		...over,
	};
}

describe("parseInboxArgs", () => {
	it("aliases bare inbox to check and parses explicit check/register", () => {
		expect(parseInboxArgs([])).toEqual({
			ok: true,
			value: { verb: "check", wait: false, json: false },
		});
		expect(parseInboxArgs(["check", "--json"])).toEqual({
			ok: true,
			value: { verb: "check", wait: false, json: true },
		});
		expect(parseInboxArgs(["register", "--json"])).toEqual({
			ok: true,
			value: { verb: "register", json: true },
		});
	});

	it("parses indefinite and finite wait forms", () => {
		expect(parseInboxArgs(["--wait"])).toEqual({
			ok: true,
			value: { verb: "check", wait: true, json: false },
		});
		expect(parseInboxArgs(["check", "--wait", "5000", "--json"])).toEqual({
			ok: true,
			value: { verb: "check", wait: true, waitMs: 5000, json: true },
		});
		expect(parseInboxArgs(["--wait=25"])).toEqual({
			ok: true,
			value: { verb: "check", wait: true, waitMs: 25, json: false },
		});
	});

	it("rejects unknown subcommands/flags, invalid wait values, and register waits", () => {
		for (const argv of [
			["wait"],
			["check", "extra"],
			["check", "--bogus"],
			["check", "--wait", "soon"],
			["check", "--wait=-1"],
			["register", "--wait"],
			["register", "extra"],
		]) {
			expect(parseInboxArgs(argv)).toMatchObject({ ok: false, code: "E-ARG" });
		}
	});
});

describe("consumeInbox", () => {
	it("claims in lexical message order and projects stable JSON fields", () => {
		const inbox = new FakeInbox([
			message("m2", {
				body: "",
				command: "compact",
				attachments: [{ path: "/tmp/chart.png", caption: "review" }],
			}),
			message("m1"),
		]);
		const result = consumeInbox({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		expect(result).toEqual({
			ok: true,
			value: {
				self: "pij-self",
				messages: [
					{
						messageId: "m1",
						from: "pij-sender",
						body: "body-m1",
						command: null,
						attachments: [],
						readAt: "2026-07-12T00:55:00.000Z",
					},
					{
						messageId: "m2",
						from: "pij-sender",
						body: "",
						command: "compact",
						attachments: [{ path: "/tmp/chart.png", caption: "review" }],
						readAt: "2026-07-12T00:55:00.000Z",
					},
				],
				timedOut: false,
				actions: [
					{ kind: "send-delivered-receipt", to: "pij-sender", messageId: "m1" },
					{ kind: "send-delivered-receipt", to: "pij-sender", messageId: "m2" },
				],
				failure: undefined,
			},
		});
		expect(inbox.markers.size).toBe(2);
	});

	it("hides receipt envelopes while returning a durable event action", () => {
		const body = receiptBody("original-message", "delivered");
		const inbox = new FakeInbox([
			message("r1", { from: "pij-target", body, kind: "receipt" }),
			message("u1"),
		]);
		const result = consumeInbox({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		expect(result).toMatchObject({
			ok: true,
			value: {
				messages: [{ messageId: "u1" }],
				actions: [
					{
						kind: "persist-receipt-envelope",
						envelopeMessageId: "r1",
						from: "pij-target",
						body,
						receipt: { messageId: "original-message", state: "delivered" },
						readAt: "2026-07-12T00:55:00.000Z",
						reader: "pij-self",
					},
					{ kind: "send-delivered-receipt", to: "pij-sender", messageId: "u1" },
				],
			},
		});
		expect(inbox.markers.size).toBe(1);
	});

	it("prevalidates every receipt before the first destructive claim", () => {
		const inbox = new FakeInbox([
			message("a-user"),
			message("z-bad-receipt", { kind: "receipt", body: "not a receipt" }),
		]);
		const result = consumeInbox({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(inbox.markers.size).toBe(0);
		expect(inbox.listUnread("pij-self")).toMatchObject({
			ok: true,
			value: [{ messageId: "a-user" }, { messageId: "z-bad-receipt" }],
		});
	});

	it("returns earlier claimed users with a surfaced later claim failure", () => {
		const backing = new FakeInbox([message("m1"), message("m2")]);
		const inbox: InboxPort = {
			listUnread: (id) => backing.listUnread(id),
			claimUnread: (id, messageId, marker) =>
				messageId === "m2"
					? err("E-NOREG", "injected later claim failure")
					: backing.claimUnread(id, messageId, marker),
			markRead: (id, messageId, marker) => backing.markRead(id, messageId, marker),
		};
		const result = consumeInbox({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		expect(result).toMatchObject({
			ok: true,
			value: {
				messages: [{ messageId: "m1" }],
				actions: [{ kind: "send-delivered-receipt", messageId: "m1" }],
				failure: { code: "E-NOREG", message: "injected later claim failure" },
			},
		});
		if (!result.ok) throw new Error(result.message);
		expect(renderInboxResult(result.value, false)).toContain("[pij from pij-sender] body-m1");
		expect(backing.markers.has("pij-self\u0000m1")).toBe(true);
		expect(backing.markers.has("pij-self\u0000m2")).toBe(false);
	});
});

describe("receipt envelope durability", () => {
	it("prepares receipts without marking and leaves user messages unread", () => {
		const body = receiptBody("m1", "unverified");
		const inbox = new FakeInbox([
			message("r1", { from: "pij-target", body, kind: "receipt" }),
			message("u1"),
		]);
		expect(
			prepareReceiptEnvelopes({
				inbox,
				self: "pij-self",
				readAt: "2026-07-12T00:55:00.000Z",
			}),
		).toEqual({
			ok: true,
			value: [
				{
					kind: "persist-receipt-envelope",
					envelopeMessageId: "r1",
					from: "pij-target",
					body,
					receipt: { messageId: "m1", state: "unverified" },
					readAt: "2026-07-12T00:55:00.000Z",
					reader: "pij-self",
				},
			],
		});
		expect(inbox.listUnread("pij-self")).toMatchObject({
			ok: true,
			value: [{ messageId: "r1" }, { messageId: "u1" }],
		});
	});

	it("persists the receipt event before publishing its read marker", () => {
		const body = receiptBody("m1", "delivered");
		const inbox = new FakeInbox([message("r1", { from: "pij-target", body, kind: "receipt" })]);
		const log = new FakeEventLog();
		const prepared = prepareReceiptEnvelopes({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		if (!prepared.ok || !prepared.value[0]) throw new Error("missing receipt action");
		const persisted = persistReceiptEnvelope({
			inbox,
			eventLog: log,
			self: "pij-self",
			action: prepared.value[0],
			nowMs: Date.parse("2026-07-12T00:55:00.000Z"),
		});
		expect(persisted).toEqual({
			ok: true,
			value: { event: "appended", marker: "marked" },
		});
		expect(log.read({ type: "receipt" })).toHaveLength(1);
		expect(inbox.markers.has("pij-self\u0000r1")).toBe(true);
	});

	it("leaves the marker absent when event append fails", () => {
		const body = receiptBody("m1", "delivered");
		const inbox = new FakeInbox([message("r1", { from: "pij-target", body, kind: "receipt" })]);
		const failingLog: EventLogPort = {
			append: () => {
				throw new Error("disk full");
			},
			appendOnce: () => {
				throw new Error("disk full");
			},
			read: () => [],
			lastSeq: () => 0,
			count: () => 0,
		};
		const prepared = prepareReceiptEnvelopes({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		if (!prepared.ok || !prepared.value[0]) throw new Error("missing receipt action");
		expect(
			persistReceiptEnvelope({
				inbox,
				eventLog: failingLog,
				self: "pij-self",
				action: prepared.value[0],
				nowMs: Date.parse("2026-07-12T00:55:00.000Z"),
			}),
		).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(inbox.markers.has("pij-self\u0000r1")).toBe(false);
	});

	it("reuses an appended event when mark fails, then marks on retry", () => {
		const body = receiptBody("m1", "delivered");
		const backing = new FakeInbox([message("r1", { from: "pij-target", body, kind: "receipt" })]);
		let failMark = true;
		const inbox: InboxPort = {
			listUnread: (id) => backing.listUnread(id),
			claimUnread: (id, messageId, marker) => backing.claimUnread(id, messageId, marker),
			markRead: (id, messageId, marker) => {
				if (failMark) {
					failMark = false;
					return err("E-NOREG", "injected mark failure");
				}
				return backing.markRead(id, messageId, marker);
			},
		};
		const log = new FakeEventLog();
		const prepared = prepareReceiptEnvelopes({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		if (!prepared.ok || !prepared.value[0]) throw new Error("missing receipt action");
		const input = {
			inbox,
			eventLog: log,
			self: "pij-self",
			action: prepared.value[0],
			nowMs: Date.parse("2026-07-12T00:55:00.000Z"),
		};
		expect(persistReceiptEnvelope(input)).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(log.read({ type: "receipt" })).toHaveLength(1);
		expect(backing.markers.has("pij-self\u0000r1")).toBe(false);
		expect(persistReceiptEnvelope(input)).toEqual({
			ok: true,
			value: { event: "existing", marker: "marked" },
		});
		expect(log.read({ type: "receipt" })).toHaveLength(1);
		expect(backing.markers.has("pij-self\u0000r1")).toBe(true);
	});

	it("gives two stale consumers exactly one receipt event and one marker", () => {
		const body = receiptBody("m1", "delivered");
		const inbox = new FakeInbox([message("r1", { from: "pij-target", body, kind: "receipt" })]);
		const backingLog = new FakeEventLog();
		const staleLog: EventLogPort = {
			append: (event) => backingLog.append(event),
			appendOnce: (key, event) => backingLog.appendOnce(key, event),
			read: () => [],
			lastSeq: () => backingLog.lastSeq(),
			count: () => backingLog.count(),
		};
		const prepared = prepareReceiptEnvelopes({
			inbox,
			self: "pij-self",
			readAt: "2026-07-12T00:55:00.000Z",
		});
		if (!prepared.ok || !prepared.value[0]) throw new Error("missing receipt action");
		const staleInput = {
			inbox,
			eventLog: staleLog,
			self: "pij-self",
			action: prepared.value[0],
			nowMs: Date.parse("2026-07-12T00:55:00.000Z"),
		};
		expect(persistReceiptEnvelope(staleInput)).toEqual({
			ok: true,
			value: { event: "appended", marker: "marked" },
		});
		expect(persistReceiptEnvelope(staleInput)).toEqual({
			ok: true,
			value: { event: "existing", marker: "already-read" },
		});
		expect(backingLog.read({ type: "receipt" })).toHaveLength(1);
		expect(inbox.markers.size).toBe(1);
	});
});

describe("inbox rendering", () => {
	const result = {
		self: "pij-self",
		messages: [
			{
				messageId: "m1",
				from: "pij-sender",
				body: "review this",
				command: null,
				attachments: [],
				readAt: "2026-07-12T00:55:00.000Z",
			},
			{
				messageId: "m2",
				from: "pij-sender",
				body: "",
				command: "compact",
				attachments: [{ path: "/tmp/chart.png", caption: "review" }],
				readAt: "2026-07-12T00:55:00.000Z",
			},
		],
		timedOut: false,
		actions: [],
		failure: undefined,
	} as const;

	it("renders stable human and JSON output", () => {
		expect(renderInboxResult(result, false)).toBe(
			[
				"[pij from pij-sender] review this",
				"[pij from pij-sender] (command: /compact)",
				"  attachment: /tmp/chart.png (review)",
				"2 messages read",
			].join("\n"),
		);
		expect(JSON.parse(renderInboxResult(result, true))).toEqual({
			self: "pij-self",
			messages: result.messages,
			timedOut: false,
		});
	});

	it("renders empty, timeout, and waiting states", () => {
		expect(renderInboxResult({ ...result, messages: [] }, false)).toBe("(no unread messages)");
		const timeout = inboxTimeoutResult("pij-self");
		expect(renderInboxResult(timeout, false)).toBe("(timeout; no unread messages)");
		expect(JSON.parse(renderInboxResult(timeout, true))).toEqual({
			self: "pij-self",
			messages: [],
			timedOut: true,
		});
		expect(renderInboxWaiting(undefined)).toBe("waiting for pij inbox messages…");
		expect(renderInboxWaiting(5000)).toBe("waiting for pij inbox messages (timeout 5000ms)…");
	});

	it("renders idempotent registration in human and JSON forms", () => {
		const registration = {
			id: "pij-concrete-reptile",
			harness: "copilot",
			harnessSessionId: "6e470b55-8474-49d7-87ce-50a325420d64",
			deliveryMode: "pull",
			existing: true,
		} as const;
		expect(renderInboxRegistration(registration, false)).toBe(
			"registered pij-concrete-reptile ↔ copilot session 6e470b55-8474-49d7-87ce-50a325420d64 (pull; existing)",
		);
		expect(JSON.parse(renderInboxRegistration(registration, true))).toEqual(registration);
	});
});
