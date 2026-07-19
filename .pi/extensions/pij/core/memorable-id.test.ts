import { describe, expect, it } from "vitest";

import {
	EXCLUDED_NAME_WORDS,
	MEMORABLE_PIJ_ID_SPACE,
	memorablePijIdCandidate,
	memorablePijIdCandidates,
} from "./memorable-id.js";
import { NAME_ADJECTIVES, NAME_NOUNS, SHIP_NAMES } from "./name-corpus.js";

function candidate(seed: string, attempt: number): string {
	const result = memorablePijIdCandidate(seed, attempt);
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

const NAME = /^pij(?:-[a-z]+)+$/;

describe("memorable pij id candidates", () => {
	it("pins the curated, lowercase, duplicate-free vendored corpus", () => {
		expect(NAME_ADJECTIVES).toHaveLength(1177);
		expect(NAME_NOUNS).toHaveLength(421);
		expect(SHIP_NAMES).toHaveLength(40);
		expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
		expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length);
		expect(new Set(SHIP_NAMES).size).toBe(SHIP_NAMES.length);
		expect(NAME_ADJECTIVES.every((word) => /^[a-z]+$/.test(word))).toBe(true);
		expect(NAME_NOUNS.every((word) => /^[a-z]+$/.test(word))).toBe(true);
		expect(SHIP_NAMES.every((ship) => /^[a-z]+(-[a-z]+)*$/.test(ship) && ship.length <= 26)).toBe(
			true,
		);
		// adjectives × nouns grid + standalone ship names appended after it
		expect(MEMORABLE_PIJ_ID_SPACE).toBe(
			NAME_ADJECTIVES.length * NAME_NOUNS.length + SHIP_NAMES.length,
		);
		expect(MEMORABLE_PIJ_ID_SPACE).toBe(495_557);
	});

	it("keeps every excluded word out of the corpus (hygiene guard)", () => {
		expect(EXCLUDED_NAME_WORDS.size).toBeGreaterThan(0);
		for (const word of EXCLUDED_NAME_WORDS) {
			expect(NAME_ADJECTIVES).not.toContain(word);
			expect(NAME_NOUNS).not.toContain(word);
			expect(SHIP_NAMES).not.toContain(word);
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

	it("weights standalone ship names into a meaningful share of seats", () => {
		const shipIds = new Set(SHIP_NAMES.map((s) => `pij-${s}`));
		let ships = 0;
		for (let i = 0; i < 300; i++) {
			if (shipIds.has(candidate(`seat-${i}`, 0))) ships++;
		}
		// ~1 in 6 by construction; assert a robust lower bound
		expect(ships).toBeGreaterThan(25);
		expect(ships).toBeLessThan(120);
	});

	it("is deterministic and always emits lowercase hyphen-joined tokens", () => {
		for (const attempt of [0, 1, 17, MEMORABLE_PIJ_ID_SPACE - 1]) {
			const id = candidate("stable-seed", attempt);
			expect(candidate("stable-seed", attempt)).toBe(id);
			expect(id).toMatch(NAME);
		}
	});

	it("walks the full space without repeating (pairs + ships)", () => {
		const ids = new Set(memorablePijIdCandidates("full-space-seed"));
		expect(ids.size).toBe(MEMORABLE_PIJ_ID_SPACE);
		// every ship name is reachable in the space
		for (const ship of SHIP_NAMES) expect(ids.has(`pij-${ship}`)).toBe(true);
		expect(candidate("full-space-seed", MEMORABLE_PIJ_ID_SPACE - 1)).toMatch(NAME);
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
