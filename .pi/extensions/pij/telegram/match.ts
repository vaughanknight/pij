// pij-telegram — address matcher (Plan Finding 06; AC-02·AC-04).
//
// Pure: maps an inbound address token (the first word of a Telegram message)
// plus a snapshot of live sessions to a single target id, or null. `registry.list()`
// order is undefined, so when a token matches more than one session we MUST break
// the tie deterministically — newest activity (`lastEventAt`, falling back to
// `startedAt`) wins, first-match thereafter.

import type { SessionDescriptor } from "../core/types.js";

const PIJ_PREFIX = "pij-";

/** Lower-case + trim a raw token. */
function normalizeToken(raw: string): string {
	return raw.trim().toLowerCase();
}

/**
 * The natural shorthand FORMS of a session id an operator might type from their phone, all
 * lower-cased — a token matches the session when it is a START prefix of ANY of these:
 *   - the full id              `pij-5lztp8`
 *   - the de-hyphenated id     `pij5lztp8`
 *   - the `p`+core abbreviation `p5lztp8`  (the `ij-` elided — what makes "p5l" resolve)
 *   - the bare core            `5lztp8`    (the `pij-` dropped — what makes "5l" resolve)
 * Matching the token against forms of the ID (rather than mutating the token) keeps a core
 * that legitimately starts with `p` from being mangled by a naive leading-`p` strip.
 */
function idForms(id: string): readonly string[] {
	const lower = id.toLowerCase();
	const core = lower.startsWith(PIJ_PREFIX) ? lower.slice(PIJ_PREFIX.length) : lower;
	return [lower, lower.replace(/-/g, ""), `p${core}`, core];
}

/**
 * True when the token is only a (partial) `pij-` marker with no session core — e.g. "",
 * "p", "pi", "pij", "pij-". Such a token is a prefix of EVERY session, so it is meaningless
 * as an address and must resolve to null (never match-all). `"pij-".startsWith(needle)` is
 * exactly "needle is a leading slice of the universal marker".
 */
function isMarkerOnly(needle: string): boolean {
	return PIJ_PREFIX.startsWith(needle);
}

/** The recency key used to order matches: the session's newest activity. ISO-8601
 *  strings sort lexicographically in chronological order, so plain `<`/`>` is safe.
 *  Exported so `/list` (commands.ts) orders sessions by the SAME rule the matcher
 *  uses to break ties — one source of truth for "newest". */
export function recencyKey(s: SessionDescriptor): string {
	return s.lastEventAt ?? s.startedAt;
}

/**
 * Resolve an address token to a single live session.
 *
 * @param token    the inbound address word — any start-prefix of a natural id form
 *                 (`pij-5lztp8`, `pij5lztp8`, `p5lztp8`, or the bare core `5lztp8`)
 * @param sessions the live session descriptors to match against
 * @returns `{ id }` of the best match, or `null` when none match / the token is marker-only
 */
export function resolveTarget(
	token: string,
	sessions: readonly SessionDescriptor[],
): { id: string } | null {
	const needle = normalizeToken(token);
	if (isMarkerOnly(needle)) return null; // empty or a bare pij-/pij/p marker → never match-all

	const matches = sessions.filter((s) => idForms(s.id).some((f) => f.startsWith(needle)));
	if (matches.length === 0) return null;

	// Newest-first. Array.prototype.sort is stable in V8, so equal-recency ties keep
	// the input order → "first wins" is the earliest-listed session among equals.
	const ordered = [...matches].sort((a, b) => {
		const ka = recencyKey(a);
		const kb = recencyKey(b);
		return ka < kb ? 1 : ka > kb ? -1 : 0;
	});

	const best = ordered[0];
	return best ? { id: best.id } : null;
}
