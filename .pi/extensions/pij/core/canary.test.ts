// pij-control-plane — canary legs (a)+(b), plan 061 phase 3.

import { describe, expect, it } from "vitest";
import {
	buildCanaryPacket,
	evaluateCanary,
	renderCanaryPass,
	renderCanaryTimeout,
} from "./canary.js";
import type { Dispatch } from "./platform/types.js";
import type { SessionDescriptor } from "./types.js";

const NOW = Date.parse("2026-07-20T12:00:00.000Z");

function ackReceipt(): NonNullable<Dispatch["ack"]> {
	return {
		schema_version: 1,
		kind: "brief-ack",
		messageId: "msg-canary-1",
		packetId: "dispatch-canary-1",
		packetSha256: "a".repeat(64),
		declaredRuntime: {
			model: "github-copilot/gpt-5.6-sol",
			effort: "xhigh",
			source: "self-report",
		},
		seat: "pij-worker",
		ts: new Date(NOW - 100).toISOString(),
	};
}

function dispatch(over: Partial<Dispatch> = {}): Dispatch {
	return {
		schema_version: 1,
		id: "dispatch-canary-1",
		packetPath: "/home/.pij/pij-parent/canary-packets/dispatch-canary-1.md",
		packetSha256: "a".repeat(64),
		from: "pij-parent",
		to: "pij-worker",
		messageId: "msg-canary-1",
		deliveryState: "delivered",
		state: "acked",
		ack: ackReceipt(),
		created: { actor: "pij-parent", ts: new Date(NOW - 1_000).toISOString() },
		updated: { actor: "pij-worker", ts: new Date(NOW - 100).toISOString() },
		...over,
	};
}

function descriptor(over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-worker",
		folder: "/repo",
		dataDir: "/home/.pij/pij-worker",
		eventsPath: "/home/.pij/pij-worker/events.ndjson",
		pid: 4242,
		startedAt: new Date(NOW - 60_000).toISOString(),
		lifecycle: "bound",
		paneId: "%42",
		harnessSessionId: "native-session-42",
		boundModel: "github-copilot/gpt-5.6-sol",
		effort: "xhigh",
		...over,
	};
}

describe("canary packet and pass record — AC-07", () => {
	it("puts the nonce in packet bytes and leaves the standard ack wire to the dispatch header", () => {
		const body = buildCanaryPacket({
			nonce: "canary-nonce-7391",
			from: "pij-parent",
			to: "pij-worker",
		});
		expect(body).toContain("canary-nonce-7391");
		expect(body).toContain("pij-parent");
		expect(body).toContain("pij-worker");
		expect(body).not.toContain("canary-ack");
	});

	it("passes pinned identity/model and captures pane+pid+native-id at pass time", () => {
		const result = evaluateCanary({
			dispatch: dispatch(),
			descriptor: descriptor(),
			nonce: "canary-nonce-7391",
			expectedModel: "github-copilot/gpt-5.6-sol",
			actor: "pij-parent",
			nowMs: NOW,
			expectedContextWindow: 1_050_000,
			observedContextWindow: { label: "1.1M", tokens: 1_100_000, source: "pane-footer" },
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.message);
		expect(result.value).toMatchObject({
			schema_version: 1,
			kind: "canary",
			dispatchId: "dispatch-canary-1",
			nonce: "canary-nonce-7391",
			target: "pij-worker",
			expectedModel: "github-copilot/gpt-5.6-sol",
			modelCheck: "matched",
			identity: {
				paneId: "%42",
				pid: 4242,
				harnessSessionId: "native-session-42",
			},
			declaredRuntime: {
				model: "github-copilot/gpt-5.6-sol",
				effort: "xhigh",
				source: "self-report",
			},
			contextWindow: {
				expected: 1_050_000,
				expectedLabel: "1.1M",
				observedLabel: "1.1M",
				source: "pane-footer",
				check: "matched",
			},
			passed: { actor: "pij-parent", ts: new Date(NOW).toISOString() },
		});
		expect(renderCanaryPass(result.value)).toContain("dispatch=dispatch-canary-1");
	});

	it("accepts an unpinned honest default with an explicit named caveat", () => {
		const unpinned = dispatch({
			ack: {
				...ackReceipt(),
				declaredRuntime: { model: "default", effort: "default", source: "self-report" },
			},
		});
		const result = evaluateCanary({
			dispatch: unpinned,
			descriptor: descriptor({ boundModel: undefined, effort: undefined }),
			nonce: "canary-nonce-7391",
			expectedModel: "github-copilot/gpt-5.6-sol",
			actor: "pij-parent",
			nowMs: NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.message);
		expect(result.value.modelCheck).toBe("unpinned-default");
		expect(renderCanaryPass(result.value)).toContain("UNPINNED");
	});

	it.each([
		[
			"reply seat/descriptor identity mismatch",
			dispatch(),
			descriptor({ id: "pij-other" }),
			undefined,
			"E-CANARY-IDENTITY",
		],
		[
			"missing defensive native identity",
			dispatch(),
			descriptor({ harnessSessionId: undefined }),
			undefined,
			"E-CANARY-IDENTITY",
		],
		[
			"declared model differs from registry pin",
			dispatch({
				ack: {
					...ackReceipt(),
					declaredRuntime: {
						model: "github-copilot/gpt-5.5",
						effort: "xhigh",
						source: "self-report",
					},
				},
			}),
			descriptor(),
			undefined,
			"E-CANARY-MODEL",
		],
		[
			"expected model differs from verified pin",
			dispatch(),
			descriptor(),
			"github-copilot/gpt-5.5",
			"E-CANARY-MODEL",
		],
	] as const)("%s refuses without a CanaryRecord", (_label, record, peer, expectedModel, code) => {
		const result = evaluateCanary({
			dispatch: record,
			descriptor: peer,
			nonce: "canary-nonce-7391",
			expectedModel,
			actor: "pij-parent",
			nowMs: NOW,
		});
		expect(result).toMatchObject({ ok: false, code });
		expect(record.canary).toBeUndefined();
	});

	it("refuses the right model at the wrong effective context tier (Dim-0)", () => {
		const result = evaluateCanary({
			dispatch: dispatch(),
			descriptor: descriptor(),
			nonce: "canary-nonce-7391",
			expectedModel: "github-copilot/gpt-5.6-sol",
			expectedContextWindow: 1_050_000,
			observedContextWindow: { label: "400K", tokens: 400_000, source: "pane-footer" },
			actor: "pij-parent",
			nowMs: NOW,
		});
		expect(result).toEqual({
			ok: false,
			code: "E-CANARY-CONTEXT",
			message:
				"target 'pij-worker' pinned model 'github-copilot/gpt-5.6-sol' expects 1.1M but pane footer reports 400K",
		});
	});

	it("fails honestly when the effective context tier is not observable", () => {
		const result = evaluateCanary({
			dispatch: dispatch(),
			descriptor: descriptor(),
			nonce: "canary-nonce-7391",
			expectedModel: "github-copilot/gpt-5.6-sol",
			expectedContextWindow: 1_050_000,
			observedContextWindow: null,
			actor: "pij-parent",
			nowMs: NOW,
		});
		expect(result).toEqual({
			ok: false,
			code: "E-CANARY-CONTEXT",
			message:
				"target 'pij-worker' cannot observe effective context tier for pinned model 'github-copilot/gpt-5.6-sol'; catalog expects 1.1M",
		});
	});

	it("renders a named timeout with the real dispatch id and no false pass", () => {
		const pending = dispatch({ state: "delivered-unacked", ack: undefined });
		expect(renderCanaryTimeout(pending)).toBe(
			"E-CANARY-TIMEOUT: canary dispatch dispatch-canary-1 state=delivered-unacked (timeout awaiting brief ack)",
		);
		expect(renderCanaryTimeout(pending)).not.toContain("PASS");
	});
});
