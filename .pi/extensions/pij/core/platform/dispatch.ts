// pij platform — dispatch record pure logic (plan 061 phase 2).

import type { BriefAckReceipt } from "../message.js";
import { err, ok, type Result } from "../types.js";
import { canonicalRecordLevel } from "./project.js";
import type { Dispatch, DispatchAck, DispatchDeliveryState } from "./types.js";

const DISPATCH_FIELD_ORDER = [
	"schema_version",
	"id",
	"packetPath",
	"packetSha256",
	"from",
	"to",
	"messageId",
	"deliveryState",
	"state",
	"ack",
	"created",
	"updated",
	"retirement",
] as const;

const ACK_FIELD_ORDER = [
	"schema_version",
	"kind",
	"messageId",
	"packetId",
	"packetSha256",
	"declaredRuntime",
	"seat",
	"ts",
] as const;

const RUNTIME_FIELD_ORDER = ["model", "effort", "source"] as const;
const STAMP_FIELD_ORDER = ["actor", "ts"] as const;
const RETIREMENT_FIELD_ORDER = ["reason", "actor", "ts", "priorState"] as const;

/** Canonical single-line JSON for the complete own dispatch record. */
export function canonicalDispatchJson(dispatch: Dispatch): string {
	const canonical = canonicalRecordLevel(
		dispatch as unknown as Record<string, unknown>,
		DISPATCH_FIELD_ORDER,
	);
	if (dispatch.ack) {
		canonical.ack = canonicalRecordLevel(
			dispatch.ack as unknown as Record<string, unknown>,
			ACK_FIELD_ORDER,
		);
		(canonical.ack as Record<string, unknown>).declaredRuntime = canonicalRecordLevel(
			dispatch.ack.declaredRuntime as unknown as Record<string, unknown>,
			RUNTIME_FIELD_ORDER,
		);
	}
	canonical.created = canonicalRecordLevel(
		dispatch.created as unknown as Record<string, unknown>,
		STAMP_FIELD_ORDER,
	);
	canonical.updated = canonicalRecordLevel(
		dispatch.updated as unknown as Record<string, unknown>,
		STAMP_FIELD_ORDER,
	);
	if (dispatch.retirement) {
		canonical.retirement = canonicalRecordLevel(
			dispatch.retirement as unknown as Record<string, unknown>,
			RETIREMENT_FIELD_ORDER,
		);
	}
	return JSON.stringify(canonical);
}

export interface MarkDispatchDeliveredInput {
	readonly messageId: string;
	readonly deliveryState: DispatchDeliveryState;
	readonly updated: {
		readonly actor: string;
		readonly ts: string;
	};
}

export function markDispatchDelivered(
	dispatch: Dispatch,
	input: MarkDispatchDeliveredInput,
): Dispatch {
	return {
		...dispatch,
		messageId: input.messageId,
		deliveryState: input.deliveryState,
		state: "delivered-unacked",
		ack: undefined,
		updated: input.updated,
	};
}

export function acknowledgeDispatch(dispatch: Dispatch, ack: BriefAckReceipt): Result<Dispatch> {
	if (dispatch.state === "retired") {
		return err("E-ARG", `dispatch '${dispatch.id}' is retired`);
	}
	if (dispatch.state === "undelivered" || !dispatch.messageId || !dispatch.deliveryState) {
		return err("E-ARG", `dispatch '${dispatch.id}' has not been delivered`);
	}
	if (ack.messageId !== dispatch.messageId) {
		return err("E-ARG", `brief ack message id does not match dispatch '${dispatch.id}'`);
	}
	if (ack.packetId !== dispatch.id) {
		return err("E-ARG", `brief ack packet id does not match dispatch '${dispatch.id}'`);
	}
	if (ack.packetSha256 !== dispatch.packetSha256) {
		return err("E-ARG", `brief ack packet sha does not match dispatch '${dispatch.id}'`);
	}
	if (ack.seat !== dispatch.to) {
		return err("E-ARG", `brief ack seat does not match dispatch target '${dispatch.to}'`);
	}
	if (
		dispatch.state === "acked" &&
		dispatch.ack &&
		JSON.stringify(dispatch.ack) === JSON.stringify(ack)
	) {
		return ok(dispatch);
	}
	return ok({
		...dispatch,
		state: "acked",
		ack: ack as DispatchAck,
		updated: { actor: ack.seat, ts: ack.ts },
	});
}

export interface RetireDispatchInput {
	readonly reason: string;
	readonly actor: string;
	readonly ts: string;
}

export function isOpenDispatch(
	dispatch: Dispatch,
): dispatch is Dispatch & { readonly state: "undelivered" | "delivered-unacked" } {
	return dispatch.state === "undelivered" || dispatch.state === "delivered-unacked";
}

export function retireDispatch(dispatch: Dispatch, input: RetireDispatchInput): Result<Dispatch> {
	if (dispatch.state === "acked" || dispatch.state === "retired") return ok(dispatch);
	return ok({
		...dispatch,
		state: "retired",
		ack: undefined,
		canary: undefined,
		retirement: {
			reason: input.reason,
			actor: input.actor,
			ts: input.ts,
			priorState: dispatch.state,
		},
		updated: { actor: input.actor, ts: input.ts },
	});
}

export function unretireDispatch(
	dispatch: Dispatch,
	input: { readonly actor: string; readonly ts: string },
): Result<Dispatch> {
	if (dispatch.state !== "retired" || dispatch.retirement?.reason !== "recipient-closed") {
		return ok(dispatch);
	}
	return ok({
		...dispatch,
		state: dispatch.retirement.priorState,
		retirement: undefined,
		updated: { actor: input.actor, ts: input.ts },
	});
}
