import { describe, expect, it } from "vitest";

import {
	announceText,
	frame,
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

describe("announceText", () => {
	it("names the session id, role, and how to reach a peer", () => {
		const t = announceText("w3", "worker");
		expect(t).toContain("w3");
		expect(t).toContain("pij_send");
		expect(t).toContain("WORKER");
	});

	describe("receiptBody/parseReceiptBody", () => {
		it("round-trips every receipt state, including unverified", () => {
			const states: ReceiptState[] = ["queued", "delivered", "unverified"];
			for (const state of states) {
				const body = receiptBody("msg-1", state);
				expect(parseReceiptBody(body)).toEqual({ messageId: "msg-1", state });
			}
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
