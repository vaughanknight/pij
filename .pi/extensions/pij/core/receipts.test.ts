import { describe, expect, it } from "vitest";

import {
	classifyOnInject,
	correlateDeliveredAt,
	initialReceipt,
	markDelivered,
} from "./receipts.js";

describe("classifyOnInject", () => {
	it("idle → delivered, busy → queued", () => {
		expect(classifyOnInject(true)).toBe("delivered");
		expect(classifyOnInject(false)).toBe("queued");
	});
});

describe("initialReceipt", () => {
	it("idle peer yields a single delivered receipt", () => {
		const r = initialReceipt("m1", "p1", "w3", true, "2026-06-16T00:00:00.000Z");
		expect(r.state).toBe("delivered");
		expect(r.deliveredAt).toBe("2026-06-16T00:00:00.000Z");
		expect(r.queuedAt).toBeUndefined();
	});
	it("busy peer yields a queued receipt", () => {
		const r = initialReceipt("m2", "p1", "w3", false, "2026-06-16T00:00:01.000Z");
		expect(r.state).toBe("queued");
		expect(r.queuedAt).toBe("2026-06-16T00:00:01.000Z");
		expect(r.deliveredAt).toBeUndefined();
	});
});

describe("markDelivered", () => {
	it("transitions queued → delivered", () => {
		const q = initialReceipt("m2", "p1", "w3", false, "2026-06-16T00:00:01.000Z");
		const d = markDelivered(q, "2026-06-16T00:00:15.000Z");
		expect(d.state).toBe("delivered");
		expect(d.queuedAt).toBe("2026-06-16T00:00:01.000Z");
		expect(d.deliveredAt).toBe("2026-06-16T00:00:15.000Z");
	});
});

describe("correlateDeliveredAt", () => {
	it("idle delivers immediately (returns the inject time)", () => {
		expect(correlateDeliveredAt("2026-06-16T00:00:00.000Z", false, [])).toBe(
			"2026-06-16T00:00:00.000Z",
		);
	});
	it("steered delivers at the next turn_start after inject", () => {
		const inject = "2026-06-16T00:00:02.500Z";
		const turnStarts = [
			"2026-06-16T00:00:01.000Z", // before inject — ignored
			"2026-06-16T00:00:16.300Z", // the delivery boundary
		];
		expect(correlateDeliveredAt(inject, true, turnStarts)).toBe("2026-06-16T00:00:16.300Z");
	});
	it("steered with no later turn_start is still queued (null)", () => {
		expect(
			correlateDeliveredAt("2026-06-16T00:00:02.500Z", true, ["2026-06-16T00:00:01.000Z"]),
		).toBeNull();
	});
});
