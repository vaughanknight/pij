import { uniqueNamesGenerator } from "unique-names-generator";

import {
	NAME_ADJECTIVES as adjectives,
	NAME_NOUNS as nouns,
	SHIP_NAMES as ships,
} from "./name-corpus.js";
import { err, ok, type Result, type SessionId } from "./types.js";

// The seat-name corpus is vendored + curated in ./name-corpus.ts (edit the word
// lists there). We keep the lib's seeded generator, but feed it OUR dictionaries.
export { EXCLUDED_NAME_WORDS } from "./name-corpus.js";

// The id space is the adjective×noun grid PLUS the standalone ship names appended
// after it: index < PAIR_SPACE ⇒ `pij-<adjective>-<noun>`, otherwise ⇒ `pij-<ship>`.
const PAIR_SPACE = adjectives.length * nouns.length;
export const MEMORABLE_PIJ_ID_SPACE = PAIR_SPACE + ships.length;

// Ships are far too few to surface from a flat uniform draw over ~500k pairs, so
// we weight the seed's STARTING slot: roughly 1 seat in SHIP_NAME_EVERY starts on
// a ship name, the rest start on a pair. Linear probing still walks the whole
// space, so every name stays reachable and collision-free.
const SHIP_NAME_EVERY = 6;

/** Deterministic 32-bit FNV-1a hash of a seed (no Date/Math.random — resume-safe). */
function fnv1a(seed: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

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
	const nounIndex = nouns.indexOf(first.slice(separator + 1));
	if (adjectiveIndex < 0 || nounIndex < 0) return null;
	return adjectiveIndex * nouns.length + nounIndex;
}

/** The seed's starting slot in the combined pair+ship space. */
function initialIndex(seed: string): number | null {
	if (ships.length > 0 && fnv1a(seed) % SHIP_NAME_EVERY === 0) {
		return PAIR_SPACE + (fnv1a(`${seed}#ship`) % ships.length);
	}
	return initialPairIndex(seed);
}

function idAt(index: number): SessionId | null {
	if (index >= PAIR_SPACE) {
		const ship = ships[index - PAIR_SPACE];
		return ship ? `pij-${ship}` : null;
	}
	const adjective = adjectives[Math.floor(index / nouns.length)];
	const noun = nouns[index % nouns.length];
	return adjective && noun ? `pij-${adjective}-${noun}` : null;
}

/** One deterministic, non-repeating candidate from the pinned name space. */
export function memorablePijIdCandidate(seed: string, attempt: number): Result<SessionId> {
	if (!Number.isInteger(attempt) || attempt < 0) {
		return err("E-ARG", `memorable id attempt must be a non-negative integer (got ${attempt})`);
	}
	if (attempt >= MEMORABLE_PIJ_ID_SPACE) {
		return err("E-FULL", `memorable id space exhausted after ${MEMORABLE_PIJ_ID_SPACE} attempts`);
	}
	const start = initialIndex(seed);
	if (start === null) return err("E-NOREG", "pinned memorable-id corpus returned an invalid pair");
	const id = idAt((start + attempt) % MEMORABLE_PIJ_ID_SPACE);
	return id ? ok(id) : err("E-NOREG", "pinned memorable-id corpus index is invalid");
}

/** Full deterministic candidate sequence. Linear probing guarantees no repeats before exhaustion. */
export function* memorablePijIdCandidates(seed: string): Generator<SessionId> {
	const start = initialIndex(seed);
	if (start === null) return;
	for (let attempt = 0; attempt < MEMORABLE_PIJ_ID_SPACE; attempt++) {
		const id = idAt((start + attempt) % MEMORABLE_PIJ_ID_SPACE);
		if (id) yield id;
	}
}
