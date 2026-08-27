// PoC day-2 item 8: Codex app-server frame builders. BUILT + unit-proven against
// the documented protocol shape; NOT live-proven (the local codex binary is
// missing — see the adapter header and report §13).

import { describe, expect, it } from "vitest";
import { buildCodexDelivery, buildCodexPrompt, encodeCodexRequest } from "./codex-rpc.js";

const BIG = `HEAD sha 0001\n${Array.from({ length: 30 }, (_, i) => `L${i}: ${"z".repeat(90)}`).join("\n")}\nTAIL`;

describe("codex frame builders", () => {
	it("uses the standard pij frame for the prompt text", () => {
		expect(buildCodexPrompt("pij-a", "x\ny")).toBe("[pij from pij-a] x\ny");
	});

	it("start-a-new-turn when idle (turn/start), byte-exact body preserved", () => {
		const req = buildCodexDelivery({
			threadId: "T1",
			from: "pij-a",
			body: BIG,
			turnInFlight: false,
			clientMessageId: "cm-1",
		});
		expect(req.method).toBe("turn/start");
		expect(req.params).toEqual({
			threadId: "T1",
			clientUserMessageId: "cm-1",
			input: [{ type: "text", text: `[pij from pij-a] ${BIG}` }],
		});
	});

	it("steer-into-current-turn when a turn is in flight (turn/steer), scoped by expectedTurnId", () => {
		const req = buildCodexDelivery({
			threadId: "T1",
			from: "pij-a",
			body: "mid-turn",
			turnInFlight: true,
			clientMessageId: "cm-2",
			expectedTurnId: "turn-9",
		});
		expect(req.method).toBe("turn/steer");
		expect(req.params).toMatchObject({
			threadId: "T1",
			clientUserMessageId: "cm-2",
			expectedTurnId: "turn-9",
			input: [{ type: "text", text: "[pij from pij-a] mid-turn" }],
		});
	});

	it("encodes with the jsonrpc field omitted (README wire form)", () => {
		const wire = JSON.parse(
			encodeCodexRequest(
				buildCodexDelivery({
					threadId: "T1",
					from: "pij-a",
					body: "hi",
					turnInFlight: false,
					clientMessageId: "cm-3",
				}),
			),
		);
		expect(wire.jsonrpc).toBeUndefined();
		expect(wire).toMatchObject({ id: "cm-3", method: "turn/start" });
	});
});
