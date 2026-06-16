import { describe, expect, it } from "vitest";

import { ALLOWED_COMMANDS, validateCommand } from "./commands.js";

describe("validateCommand", () => {
	it("accepts compact", () => {
		const r = validateCommand("compact");
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toBe("compact");
	});

	it("rejects unknown commands with E-CMD", () => {
		const r = validateCommand("rm-rf");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("E-CMD");
	});

	it("exposes the allow-list", () => {
		expect(ALLOWED_COMMANDS).toContain("compact");
	});
});
