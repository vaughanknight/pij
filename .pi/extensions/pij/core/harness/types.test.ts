import { describe, expect, it } from "vitest";

import type { HarnessKind } from "../types.js";
import { selectTransport } from "./types.js";

describe("selectTransport", () => {
	const cases: ReadonlyArray<[HarnessKind, "inbox" | "sendkeys"]> = [
		["pi", "inbox"],
		["claude", "sendkeys"],
		["copilot", "sendkeys"],
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
