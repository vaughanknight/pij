import { describe, expect, it } from "vitest";
import type { BriefAckReceipt } from "../message.js";
import {
	acknowledgeDispatch,
	canonicalDispatchJson,
	isOpenDispatch,
	markDispatchDelivered,
	retireDispatch,
	unretireDispatch,
} from "./dispatch.js";
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

describe("Dispatch record retirement — AC-11", () => {
	it("names the two open states and excludes both terminal states", () => {
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		const acked = acknowledgeDispatch(delivered, ACK);
		if (!acked.ok) throw new Error(acked.message);
		const retired = retireDispatch(delivered, {
			reason: "stale",
			actor: "pij-parent",
			ts: TS2,
		});
		if (!retired.ok) throw new Error(retired.message);
		expect(isOpenDispatch(BASE)).toBe(true);
		expect(isOpenDispatch(delivered)).toBe(true);
		expect(isOpenDispatch(acked.value)).toBe(false);
		expect(isOpenDispatch(retired.value)).toBe(false);
	});

	it("retires open records with prior state and canonical retirement metadata", () => {
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		const retired = retireDispatch(delivered, {
			reason: "stale",
			actor: "pij-prime",
			ts: "2026-07-20T12:02:00.000Z",
		});
		expect(retired).toMatchObject({
			ok: true,
			value: {
				state: "retired",
				retirement: {
					reason: "stale",
					actor: "pij-prime",
					ts: "2026-07-20T12:02:00.000Z",
					priorState: "delivered-unacked",
				},
				updated: { actor: "pij-prime", ts: "2026-07-20T12:02:00.000Z" },
			},
		});
		if (!retired.ok) throw new Error(retired.message);
		expect(canonicalDispatchJson(retired.value)).toBe(
			`{"schema_version":1,"id":"dispatch-42","packetPath":"/repo/packet.md",` +
				`"packetSha256":"${SHA}","from":"pij-parent","to":"pij-worker",` +
				`"messageId":"msg-42","deliveryState":"delivered","state":"retired",` +
				`"created":{"actor":"pij-parent","ts":"${TS}"},` +
				`"updated":{"actor":"pij-prime","ts":"2026-07-20T12:02:00.000Z"},` +
				`"retirement":{"reason":"stale","actor":"pij-prime",` +
				`"ts":"2026-07-20T12:02:00.000Z","priorState":"delivered-unacked"}}`,
		);
	});

	it("is idempotent on terminal records and refuses acknowledgements after retirement", () => {
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		const acked = acknowledgeDispatch(delivered, ACK);
		if (!acked.ok) throw new Error(acked.message);
		expect(retireDispatch(acked.value, { reason: "stale", actor: "pij-prime", ts: TS2 })).toEqual({
			ok: true,
			value: acked.value,
		});
		const retired = retireDispatch(delivered, {
			reason: "stale",
			actor: "pij-prime",
			ts: TS2,
		});
		if (!retired.ok) throw new Error(retired.message);
		expect(retireDispatch(retired.value, { reason: "again", actor: "pij-prime", ts: TS2 })).toEqual(
			{ ok: true, value: retired.value },
		);
		expect(acknowledgeDispatch(retired.value, ACK)).toMatchObject({
			ok: false,
			code: "E-ARG",
			message: expect.stringMatching(/retired/i),
		});
	});

	it("unretires only recipient-closed records and preserves legacy records byte-identically", () => {
		const delivered = markDispatchDelivered(BASE, {
			messageId: "msg-42",
			deliveryState: "delivered",
			updated: { actor: "pij-parent", ts: TS2 },
		});
		const closeRetired = retireDispatch(delivered, {
			reason: "recipient-closed",
			actor: "daemon",
			ts: TS2,
		});
		if (!closeRetired.ok) throw new Error(closeRetired.message);
		expect(
			unretireDispatch(closeRetired.value, {
				actor: "pij-prime",
				ts: "2026-07-20T12:03:00.000Z",
			}),
		).toMatchObject({
			ok: true,
			value: {
				state: "delivered-unacked",
				retirement: undefined,
				updated: { actor: "pij-prime", ts: "2026-07-20T12:03:00.000Z" },
			},
		});
		const staleRetired = retireDispatch(delivered, {
			reason: "stale",
			actor: "pij-prime",
			ts: TS2,
		});
		if (!staleRetired.ok) throw new Error(staleRetired.message);
		expect(unretireDispatch(staleRetired.value, { actor: "pij-prime", ts: TS2 })).toEqual({
			ok: true,
			value: staleRetired.value,
		});

		const legacyJson = canonicalDispatchJson(BASE);
		const legacy = JSON.parse(legacyJson);
		expect(isDispatch(legacy)).toBe(true);
		expect(canonicalDispatchJson(legacy as Dispatch)).toBe(legacyJson);
	});
});
