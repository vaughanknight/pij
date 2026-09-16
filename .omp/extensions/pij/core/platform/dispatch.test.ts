import { describe, expect, it } from "vitest";
import type { BriefAckReceipt } from "../message.js";
import { acknowledgeDispatch, canonicalDispatchJson, markDispatchDelivered } from "./dispatch.js";
import { type Dispatch, isDispatch } from "./types.js";

const TS = "2026-07-20T12:00:00.000Z";
const TS2 = "2026-07-20T12:01:00.000Z";
const SHA = "a".repeat(64);

const BASE: Dispatch = {
	schema_version: 1,
	id: "dispatch-42",
	packetPath: "/repo/packet.md",
	packetSha256: SHA,
	from: "pij-parent",
	to: "pij-worker",
	state: "undelivered",
	created: { actor: "pij-parent", ts: TS },
	updated: { actor: "pij-parent", ts: TS },
};

const ACK: BriefAckReceipt = {
	schema_version: 1,
	kind: "brief-ack",
	messageId: "msg-42",
	packetId: BASE.id,
	packetSha256: SHA,
	declaredRuntime: {
		model: "github-copilot/gpt-5.6-sol",
		effort: "xhigh",
		source: "self-report",
	},
	seat: "pij-worker",
	ts: TS2,
};

describe("Dispatch record — AC-05", () => {
	it("keeps undelivered, delivered-unacked, and acked as distinct guarded states", () => {
		expect(isDispatch(BASE)).toBe(true);
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		expect(delivered).toMatchObject({ state: "delivered-unacked", ack: undefined });
		expect(isDispatch(delivered)).toBe(true);
		const acked = acknowledgeDispatch(delivered, ACK);
		expect(acked).toMatchObject({ ok: true, value: { state: "acked", ack: ACK } });
		if (!acked.ok) throw new Error(acked.message);
		expect(isDispatch(acked.value)).toBe(true);
		expect(new Set([BASE.state, delivered.state, acked.value.state])).toEqual(
			new Set(["undelivered", "delivered-unacked", "acked"]),
		);
	});

	it("refuses a packet sha mismatch without mutating the dispatch", () => {
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		const before = structuredClone(delivered);
		expect(acknowledgeDispatch(delivered, { ...ACK, packetSha256: "b".repeat(64) })).toMatchObject({
			ok: false,
			code: "E-ARG",
			message: expect.stringMatching(/packet sha/i),
		});
		expect(delivered).toEqual(before);
	});

	it("canonicalizes every state and nested ack in stable field order", () => {
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		const acked = acknowledgeDispatch(delivered, ACK);
		if (!acked.ok) throw new Error(acked.message);
		expect(canonicalDispatchJson(acked.value)).toBe(
			`{"schema_version":1,"id":"dispatch-42","packetPath":"/repo/packet.md",` +
				`"packetSha256":"${SHA}","from":"pij-parent","to":"pij-worker",` +
				`"messageId":"msg-42","deliveryState":"delivered","state":"acked",` +
				`"ack":{"schema_version":1,"kind":"brief-ack","messageId":"msg-42",` +
				`"packetId":"dispatch-42","packetSha256":"${SHA}",` +
				`"declaredRuntime":{"model":"github-copilot/gpt-5.6-sol","effort":"xhigh",` +
				`"source":"self-report"},"seat":"pij-worker","ts":"${TS2}"},` +
				`"created":{"actor":"pij-parent","ts":"${TS}"},` +
				`"updated":{"actor":"pij-worker","ts":"${TS2}"}}`,
		);
	});
});
