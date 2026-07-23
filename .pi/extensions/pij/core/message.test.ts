import { describe, expect, it } from "vitest";

import {
	announceText,
	briefAckBody,
	frame,
	isBriefAckReceipt,
	parseBriefAckBody,
	parseFrame,
	parseReceiptBody,
	receiptBody,
	roleLabel,
} from "./message.js";
import type { ReceiptState } from "./types.js";

describe("frame/parseFrame", () => {
	it("round-trips sender id + body", () => {
		const text = frame("w3", "refactor store.ts");
		expect(text).toBe("[pij from w3] refactor store.ts");
		expect(parseFrame(text)).toEqual({ from: "w3", body: "refactor store.ts" });
	});

	it("handles multi-line bodies", () => {
		const text = frame("p1", "line1\nline2");
		expect(parseFrame(text)).toEqual({ from: "p1", body: "line1\nline2" });
	});

	it("returns null for unframed text", () => {
		expect(parseFrame("just some text")).toBeNull();
	});
});

describe("roleLabel", () => {
	it("labels parent/worker/unknown", () => {
		expect(roleLabel("parent")).toContain("PARENT");
		expect(roleLabel("worker")).toBe("WORKER");
		expect(roleLabel(undefined)).toBe("PEER");
	});
});

describe("shipped delivery receipt contract", () => {
	it("freezes the send --wait vocabulary and receipt wire shape before dispatch receipts", () => {
		const states: readonly ReceiptState[] = ["queued", "delivered", "unverified"];
		expect(states).toEqual(["queued", "delivered", "unverified"]);
		expect(receiptBody("msg-freeze", "delivered")).toBe("[pij receipt msg-freeze] delivered");
		expect(parseReceiptBody("[pij receipt msg-freeze] delivered")).toEqual({
			messageId: "msg-freeze",
			state: "delivered",
		});
		expect(parseReceiptBody("[pij receipt msg-freeze] acked")).toBeNull();
	});
});

describe("BriefAckReceipt — AC-05 additive receipt kind", () => {
	const ACK = {
		schema_version: 1,
		kind: "brief-ack",
		messageId: "msg-42",
		packetId: "dispatch-42",
		packetSha256: "a".repeat(64),
		declaredRuntime: {
			model: "github-copilot/gpt-5.6-sol",
			effort: "xhigh",
			source: "self-report",
		},
		seat: "pij-worker",
		ts: "2026-07-20T12:00:00.000Z",
	} as const;

	it("round-trips a structured brief ack without changing ReceiptState", () => {
		const body = briefAckBody(ACK);
		expect(body).toBe(`[pij brief-ack] ${JSON.stringify(ACK)}`);
		expect(parseBriefAckBody(body)).toEqual(ACK);
		expect(isBriefAckReceipt(ACK)).toBe(true);
		const shippedStates: readonly ReceiptState[] = ["queued", "delivered", "unverified"];
		expect(shippedStates).toEqual(["queued", "delivered", "unverified"]);
	});

	it("rejects malformed or identity-weak brief acks", () => {
		expect(parseBriefAckBody("[pij brief-ack] not-json")).toBeNull();
		expect(isBriefAckReceipt({ ...ACK, packetSha256: "short" })).toBe(false);
		expect(
			isBriefAckReceipt({ ...ACK, declaredRuntime: { ...ACK.declaredRuntime, source: "pin" } }),
		).toBe(false);
	});
});

describe("announceText", () => {
	it("names the session id, role, and how to reach a peer", () => {
		const t = announceText("w3", "worker");
		expect(t).toContain("w3");
		expect(t).toContain("pij_send");
		expect(t).toContain("WORKER");
	});

	describe("receiptBody/parseReceiptBody", () => {
		it("round-trips every receipt state, including injected-unverified", () => {
			const states: ReceiptState[] = ["queued", "delivered", "unverified", "injected-unverified"];
			for (const state of states) {
				const body = receiptBody("msg-1", state);
				expect(parseReceiptBody(body)).toEqual({ messageId: "msg-1", state });
			}
		});

		it("parses injected-unverified as itself, NOT as unverified (the shared suffix)", () => {
			// The honest wedge word must never collapse into the pre-type-failure word.
			expect(parseReceiptBody("[pij receipt msg-9] injected-unverified")).toEqual({
				messageId: "msg-9",
				state: "injected-unverified",
			});
			expect(parseReceiptBody("[pij receipt msg-9] unverified")).toEqual({
				messageId: "msg-9",
				state: "unverified",
			});
		});
	});

	it("is non-imperative and warns against acting on the inbox (D-040)", () => {
		const t = announceText("w3", "worker");
		expect(t).toContain("no action is required");
		expect(t).toMatch(/\[pij from <id>\]/);
		expect(t.toLowerCase()).toContain("do not read");
		expect(t.toLowerCase()).toContain("inbox");
	});
});
