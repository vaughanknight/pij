// pij-control-plane — pure canary packet, validation, and evidence rendering.

import { type ContextWindowObservation, expectedContextWindowLabel } from "./context/window.js";
import { isoTimestamp } from "./platform/time.js";
import type { CanaryRecord, Dispatch } from "./platform/types.js";
import type { SessionDescriptor } from "./types.js";

export const CANARY_IDENTITY_ERROR = "E-CANARY-IDENTITY";
export const CANARY_MODEL_ERROR = "E-CANARY-MODEL";
export const CANARY_CONTEXT_ERROR = "E-CANARY-CONTEXT";
export const CANARY_PACKET_ERROR = "E-CANARY-PACKET";
export const CANARY_TIMEOUT_ERROR = "E-CANARY-TIMEOUT";

export type CanaryErrorCode =
	| typeof CANARY_IDENTITY_ERROR
	| typeof CANARY_MODEL_ERROR
	| typeof CANARY_CONTEXT_ERROR
	| typeof CANARY_PACKET_ERROR;

export type CanaryResult =
	| { readonly ok: true; readonly value: CanaryRecord }
	| { readonly ok: false; readonly code: CanaryErrorCode; readonly message: string };

export interface BuildCanaryPacketInput {
	readonly nonce: string;
	readonly from: string;
	readonly to: string;
}

export function buildCanaryPacket(input: BuildCanaryPacketInput): string {
	return [
		"# pij canary packet",
		"",
		`nonce: ${input.nonce}`,
		`from: ${input.from}`,
		`to: ${input.to}`,
		"",
		"Read these bytes, then acknowledge with the standard command in the dispatch header.",
		"The packet sha proves the nonce bytes were read; the brief ack supplies declared runtime.",
	].join("\n");
}

export interface EvaluateCanaryInput {
	readonly dispatch: Dispatch;
	readonly descriptor: SessionDescriptor;
	readonly nonce: string;
	readonly expectedModel?: string;
	readonly expectedContextWindow?: number;
	readonly observedContextWindow?: ContextWindowObservation | null;
	readonly actor: string;
	readonly nowMs: number;
}

function refused(code: CanaryErrorCode, message: string): CanaryResult {
	return { ok: false, code, message };
}

export function evaluateCanary(input: EvaluateCanaryInput): CanaryResult {
	const { dispatch, descriptor } = input;
	if (dispatch.state !== "acked" || dispatch.ack === undefined) {
		return refused(
			CANARY_IDENTITY_ERROR,
			`dispatch '${dispatch.id}' has no durable brief ack to evaluate`,
		);
	}
	if (descriptor.id !== dispatch.to || dispatch.ack.seat !== descriptor.id) {
		return refused(
			CANARY_IDENTITY_ERROR,
			`dispatch '${dispatch.id}' reply seat '${dispatch.ack.seat}' does not match target descriptor '${descriptor.id}'`,
		);
	}
	if (
		descriptor.paneId === undefined ||
		descriptor.paneId.trim() === "" ||
		!Number.isSafeInteger(descriptor.pid) ||
		descriptor.pid <= 0 ||
		descriptor.harnessSessionId === undefined ||
		descriptor.harnessSessionId.trim() === ""
	) {
		return refused(
			CANARY_IDENTITY_ERROR,
			`target '${descriptor.id}' lacks the required pane+pid+native-session identity triple`,
		);
	}

	const declared = dispatch.ack.declaredRuntime;
	const pinnedModel = descriptor.boundModel;
	let modelCheck: CanaryRecord["modelCheck"];
	if (pinnedModel === undefined) {
		if (declared.model !== "default") {
			return refused(
				CANARY_MODEL_ERROR,
				`target '${descriptor.id}' is unpinned but declared model '${declared.model}' instead of honest default`,
			);
		}
		modelCheck = "unpinned-default";
	} else {
		if (declared.model !== pinnedModel) {
			return refused(
				CANARY_MODEL_ERROR,
				`target '${descriptor.id}' declared model '${declared.model}' but registry pin is '${pinnedModel}'`,
			);
		}
		if (input.expectedModel !== undefined && input.expectedModel !== pinnedModel) {
			return refused(
				CANARY_MODEL_ERROR,
				`target '${descriptor.id}' verified model '${pinnedModel}' does not match expected '${input.expectedModel}'`,
			);
		}
		modelCheck = "matched";
	}

	const pinnedEffort = descriptor.effort;
	if (pinnedEffort === undefined) {
		if (declared.effort !== "default") {
			return refused(
				CANARY_MODEL_ERROR,
				`target '${descriptor.id}' has no effort pin but declared '${declared.effort}' instead of honest default`,
			);
		}
	} else if (declared.effort !== pinnedEffort) {
		return refused(
			CANARY_MODEL_ERROR,
			`target '${descriptor.id}' declared effort '${declared.effort}' but registry pin is '${pinnedEffort}'`,
		);
	}

	let contextWindow: CanaryRecord["contextWindow"];
	if (input.expectedContextWindow !== undefined) {
		const expectedLabel = expectedContextWindowLabel(input.expectedContextWindow);
		if (expectedLabel === null) {
			return refused(
				CANARY_CONTEXT_ERROR,
				`target '${descriptor.id}' has invalid catalog context window '${input.expectedContextWindow}'`,
			);
		}
		if (input.observedContextWindow === null || input.observedContextWindow === undefined) {
			return refused(
				CANARY_CONTEXT_ERROR,
				`target '${descriptor.id}' cannot observe effective context tier for pinned model '${pinnedModel ?? "default"}'; catalog expects ${expectedLabel}`,
			);
		}
		const tolerance = Math.max(50_000, input.expectedContextWindow * 0.1);
		if (Math.abs(input.observedContextWindow.tokens - input.expectedContextWindow) > tolerance) {
			return refused(
				CANARY_CONTEXT_ERROR,
				`target '${descriptor.id}' pinned model '${pinnedModel ?? "default"}' expects ${expectedLabel} but pane footer reports ${input.observedContextWindow.label}`,
			);
		}
		contextWindow = {
			expected: input.expectedContextWindow,
			expectedLabel,
			observedLabel: input.observedContextWindow.label,
			source: input.observedContextWindow.source,
			check: "matched",
		};
	}

	const passedAt = isoTimestamp(input.nowMs);
	if (!passedAt.ok) {
		return refused(CANARY_IDENTITY_ERROR, passedAt.message);
	}
	return {
		ok: true,
		value: {
			schema_version: 1,
			kind: "canary",
			dispatchId: dispatch.id,
			nonce: input.nonce,
			target: descriptor.id,
			...(input.expectedModel === undefined ? {} : { expectedModel: input.expectedModel }),
			declaredRuntime: declared,
			modelCheck,
			...(contextWindow === undefined ? {} : { contextWindow }),
			identity: {
				paneId: descriptor.paneId,
				pid: descriptor.pid,
				harnessSessionId: descriptor.harnessSessionId,
			},
			passed: { actor: input.actor, ts: passedAt.value },
		},
	};
}

export function renderCanaryPass(record: CanaryRecord): string {
	const model =
		record.modelCheck === "unpinned-default"
			? "model=default check=UNPINNED"
			: `model=${record.declaredRuntime.model} check=matched`;
	const context = record.contextWindow
		? ` context=${record.contextWindow.observedLabel} check=matched source=${record.contextWindow.source}`
		: "";
	return `canary PASS target=${record.target} dispatch=${record.dispatchId} ${model}${context} identity=pane:${record.identity.paneId} pid:${record.identity.pid} native:${record.identity.harnessSessionId}`;
}

export function renderCanaryTimeout(dispatch: Dispatch): string {
	return `${CANARY_TIMEOUT_ERROR}: canary dispatch ${dispatch.id} state=${dispatch.state} (timeout awaiting brief ack)`;
}
