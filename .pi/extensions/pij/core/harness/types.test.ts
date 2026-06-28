import { describe, expect, it } from "vitest";

import type { HarnessKind } from "../types.js";
import { selectTransport, supportsBranching } from "./types.js";

describe("selectTransport", () => {
	const cases: ReadonlyArray<[HarnessKind, "inbox" | "sendkeys"]> = [
		["pi", "inbox"],
		["claude", "sendkeys"],
		["copilot", "sendkeys"],
		["codex", "sendkeys"],
	];

	for (const [harness, transport] of cases) {
		it(`${harness} → ${transport}`, () => {
			expect(selectTransport(harness)).toBe(transport);
		});
	}

	it("only pi keeps the in-process inbox seam (every other harness is send-keys)", () => {
		expect(selectTransport("pi")).toBe("inbox");
		expect(selectTransport("claude")).not.toBe("inbox");
	});
});

describe("supportsBranching (branch-from-self capability seam, Plan 020)", () => {
	it("claude supports branch-from-self (forks via --fork-session)", () => {
		expect(supportsBranching("claude")).toBe(true);
	});

	it("copilot and pi do NOT support branching yet — the seam exists for later", () => {
		expect(supportsBranching("copilot")).toBe(false);
		expect(supportsBranching("pi")).toBe(false);
	});

	it("codex does NOT support branching yet (it has fork/resume — a clean future flip)", () => {
		expect(supportsBranching("codex")).toBe(false);
	});
});

describe("HarnessKind accepts codex (Plan 022 — 4th spawnable harness)", () => {
	it("codex is a valid HarnessKind and selects the send-keys transport", () => {
		const codex: HarnessKind = "codex";
		expect(selectTransport(codex)).toBe("sendkeys");
	});
});
