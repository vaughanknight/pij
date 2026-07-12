import { adjectives, animals } from "unique-names-generator";
import { describe, expect, it } from "vitest";

import {
	MEMORABLE_PIJ_ID_SPACE,
	memorablePijIdCandidate,
	memorablePijIdCandidates,
} from "./memorable-id.js";

function candidate(seed: string, attempt: number): string {
	const result = memorablePijIdCandidate(seed, attempt);
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

describe("memorable pij id candidates", () => {
	it("pins the exact lowercase, duplicate-free corpus contract", () => {
		expect(adjectives).toHaveLength(1202);
		expect(animals).toHaveLength(355);
		expect(new Set(adjectives).size).toBe(adjectives.length);
		expect(new Set(animals).size).toBe(animals.length);
		expect(adjectives.every((word) => /^[a-z]+$/.test(word))).toBe(true);
		expect(animals.every((word) => /^[a-z]+$/.test(word))).toBe(true);
		expect(MEMORABLE_PIJ_ID_SPACE).toBe(426_710);
	});

	it("preserves the proved PoC first-candidate vectors", () => {
		expect(candidate("4dffbee3-5d42-4b02-a739-74be162940bc", 0)).toBe("pij-arbitrary-locust");
		expect(candidate("copilot-session-alpha", 0)).toBe("pij-sure-cuckoo");
		expect(candidate("claude-session-beta", 0)).toBe("pij-appropriate-wildebeest");
		expect(candidate("pi-session-gamma", 0)).toBe("pij-flaky-leech");
	});

	it("is deterministic and always emits exactly two lowercase words", () => {
		for (const attempt of [0, 1, 17, MEMORABLE_PIJ_ID_SPACE - 1]) {
			const id = candidate("stable-seed", attempt);
			expect(candidate("stable-seed", attempt)).toBe(id);
			expect(id).toMatch(/^pij-[a-z]+-[a-z]+$/);
		}
	});

	it("walks the full Cartesian space without repeating", () => {
		const ids = new Set(memorablePijIdCandidates("full-space-seed"));
		expect(ids.size).toBe(MEMORABLE_PIJ_ID_SPACE);
		expect(candidate("full-space-seed", MEMORABLE_PIJ_ID_SPACE - 1)).toMatch(/^pij-[a-z]+-[a-z]+$/);
	});

	it("fails loudly for invalid attempts and exhaustion", () => {
		expect(memorablePijIdCandidate("seed", -1)).toMatchObject({ ok: false, code: "E-ARG" });
		expect(memorablePijIdCandidate("seed", 1.5)).toMatchObject({ ok: false, code: "E-ARG" });
		expect(memorablePijIdCandidate("seed", MEMORABLE_PIJ_ID_SPACE)).toMatchObject({
			ok: false,
			code: "E-FULL",
		});
	});
});
