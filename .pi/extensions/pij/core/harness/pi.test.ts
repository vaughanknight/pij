import { describe, expect, it } from "vitest";

import type { HarnessKind } from "../types.js";
import { daemonOwnsDelivery } from "./pi.js";

describe("daemonOwnsDelivery (the immovable seam, AC-08)", () => {
	it("pi is owned by the in-process receiver, NOT the daemon", () => {
		expect(daemonOwnsDelivery("pi")).toBe(false);
	});

	it("the daemon owns delivery for every send-keys harness", () => {
		const sendkeys: HarnessKind[] = ["claude", "copilot"];
		for (const h of sendkeys) expect(daemonOwnsDelivery(h)).toBe(true);
	});
});
