import { describe, expect, it } from "vitest";

import {
	EXCLUDED_NAME_WORDS,
	MEMORABLE_PIJ_ID_SPACE,
	memorablePijIdCandidate,
	memorablePijIdCandidates,
} from "./memorable-id.js";
import { NAME_ADJECTIVES, NAME_NOUNS } from "./name-corpus.js";

function candidate(seed: string, attempt: number): string {
	const result = memorablePijIdCandidate(seed, attempt);
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

describe("memorable pij id candidates", () => {
	it("pins the curated, lowercase, duplicate-free vendored corpus", () => {
		expect(NAME_ADJECTIVES).toHaveLength(1177);
		expect(NAME_NOUNS).toHaveLength(421);
		expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
		expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length);
		expect(NAME_ADJECTIVES.every((word) => /^[a-z]+$/.test(word))).toBe(true);
		expect(NAME_NOUNS.every((word) => /^[a-z]+$/.test(word))).toBe(true);
		expect(MEMORABLE_PIJ_ID_SPACE).toBe(495_517);
	});

	it("keeps every excluded word out of the corpus (hygiene guard)", () => {
		expect(EXCLUDED_NAME_WORDS.size).toBeGreaterThan(0);
		for (const word of EXCLUDED_NAME_WORDS) {
			expect(NAME_ADJECTIVES).not.toContain(word);
			expect(NAME_NOUNS).not.toContain(word);
		}
	});

	it("pins the deterministic first-candidate vectors for the curated corpus", () => {
		expect(candidate("4dffbee3-5d42-4b02-a739-74be162940bc", 0)).toBe(
			"pij-appropriate-nightingale",
		);
		expect(candidate("copilot-session-alpha", 0)).toBe("pij-surprised-echidna");
		expect(candidate("claude-session-beta", 0)).toBe("pij-applicable-dudley");
		expect(candidate("pi-session-gamma", 0)).toBe("pij-fond-mole");
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
