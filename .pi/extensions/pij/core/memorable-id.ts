import { uniqueNamesGenerator } from "unique-names-generator";

import { NAME_ADJECTIVES as adjectives, NAME_NOUNS as nouns } from "./name-corpus.js";
import { err, ok, type Result, type SessionId } from "./types.js";

// The seat-name corpus is vendored + curated in ./name-corpus.ts (edit the word
// lists there). We keep the lib's seeded generator, but feed it OUR dictionaries.
export { EXCLUDED_NAME_WORDS } from "./name-corpus.js";

export const MEMORABLE_PIJ_ID_SPACE = adjectives.length * nouns.length;

function initialPairIndex(seed: string): number | null {
	const first = uniqueNamesGenerator({
		dictionaries: [adjectives, nouns],
		separator: "\0",
		length: 2,
		style: "lowerCase",
		seed,
	});
	const separator = first.indexOf("\0");
	if (separator < 1) return null;
	const adjectiveIndex = adjectives.indexOf(first.slice(0, separator));
	const animalIndex = nouns.indexOf(first.slice(separator + 1));
	if (adjectiveIndex < 0 || animalIndex < 0) return null;
	return adjectiveIndex * nouns.length + animalIndex;
}

function idAt(index: number): SessionId | null {
	const adjective = adjectives[Math.floor(index / nouns.length)];
	const animal = nouns[index % nouns.length];
	return adjective && animal ? `pij-${adjective}-${animal}` : null;
}

/** One deterministic, non-repeating candidate from the pinned adjective-animal space. */
export function memorablePijIdCandidate(seed: string, attempt: number): Result<SessionId> {
	if (!Number.isInteger(attempt) || attempt < 0) {
		return err("E-ARG", `memorable id attempt must be a non-negative integer (got ${attempt})`);
	}
	if (attempt >= MEMORABLE_PIJ_ID_SPACE) {
		return err("E-FULL", `memorable id space exhausted after ${MEMORABLE_PIJ_ID_SPACE} attempts`);
	}
	const start = initialPairIndex(seed);
	if (start === null) return err("E-NOREG", "pinned memorable-id corpus returned an invalid pair");
	const id = idAt((start + attempt) % MEMORABLE_PIJ_ID_SPACE);
	return id ? ok(id) : err("E-NOREG", "pinned memorable-id corpus index is invalid");
}

/** Full deterministic candidate sequence. Linear probing guarantees no repeats before exhaustion. */
export function* memorablePijIdCandidates(seed: string): Generator<SessionId> {
	const start = initialPairIndex(seed);
	if (start === null) return;
	for (let attempt = 0; attempt < MEMORABLE_PIJ_ID_SPACE; attempt++) {
		const id = idAt((start + attempt) % MEMORABLE_PIJ_ID_SPACE);
		if (id) yield id;
	}
}
