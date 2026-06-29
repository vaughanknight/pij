// pij-telegram — `resolveTarget` matcher tests (TDD, Plan Finding 06 / AC-02·AC-04).
// The matcher is pure: it maps an inbound address token + a live session list to a
// single {id} (or null). Ordering MUST be deterministic — newest activity wins.

import { describe, expect, it } from "vitest";
import type { SessionDescriptor, SessionId } from "../core/types.js";
import { resolveTarget } from "./match.js";

/** Minimal descriptor fixture; override only the fields a case cares about. */
function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 4242,
		startedAt: "2026-06-28T00:00:00.000Z",
		...over,
		id: over.id as SessionId,
	};
}

describe("resolveTarget", () => {
	it("matches an exact id-token (pij- stripped from the query)", () => {
		const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];
		expect(resolveTarget("pij-osn81b", sessions)).toEqual({ id: "pij-osn81b" });
		// query may omit the pij- prefix entirely
		expect(resolveTarget("osn81b", sessions)).toEqual({ id: "pij-osn81b" });
	});

	it("matches a partial start-of-id token", () => {
		const sessions = [desc({ id: "pij-osn81b" }), desc({ id: "pij-abc123" })];
		expect(resolveTarget("osn", sessions)).toEqual({ id: "pij-osn81b" });
		expect(resolveTarget("abc", sessions)).toEqual({ id: "pij-abc123" });
	});

	it("resolves every natural abbreviation form of an id (the `p5l` bug)", () => {
		const sessions = [desc({ id: "pij-5lztp8" }), desc({ id: "pij-abc123" })];
		// the four forms a human types: bare core, p+core, de-hyphenated, and full id
		expect(resolveTarget("5l", sessions)).toEqual({ id: "pij-5lztp8" }); // bare core
		expect(resolveTarget("p5l", sessions)).toEqual({ id: "pij-5lztp8" }); // p+core (ij- elided)
		expect(resolveTarget("pij5l", sessions)).toEqual({ id: "pij-5lztp8" }); // de-hyphenated
		expect(resolveTarget("pij-5l", sessions)).toEqual({ id: "pij-5lztp8" }); // full prefix
		expect(resolveTarget("pij-5lztp8", sessions)).toEqual({ id: "pij-5lztp8" }); // whole id
	});

	it("matches only the START of a name, not a mid-string substring", () => {
		const sessions = [desc({ id: "pij-5lztp8" })];
		// "ztp8" is inside the id but not a start-prefix of any form → no match
		expect(resolveTarget("ztp8", sessions)).toBeNull();
		expect(resolveTarget("lztp", sessions)).toBeNull();
	});

	it("treats a bare pij-/pij/p marker (no core) as a non-match, never match-all", () => {
		const sessions = [desc({ id: "pij-5lztp8" }), desc({ id: "pij-abc123" })];
		for (const marker of ["p", "pi", "pij", "pij-"]) {
			expect(resolveTarget(marker, sessions)).toBeNull();
		}
	});

	it("is case-insensitive", () => {
		const sessions = [desc({ id: "pij-OSN81b" })];
		expect(resolveTarget("osn81B", sessions)).toEqual({ id: "pij-OSN81b" });
	});

	it("orders multiple matches by lastEventAt, newest-first (first wins)", () => {
		const sessions = [
			desc({ id: "pij-worker-old", lastEventAt: "2026-06-29T10:00:00.000Z" }),
			desc({ id: "pij-worker-new", lastEventAt: "2026-06-29T12:00:00.000Z" }),
			desc({ id: "pij-worker-mid", lastEventAt: "2026-06-29T11:00:00.000Z" }),
		];
		// all three contain "worker"; the most-recently-active one wins
		expect(resolveTarget("worker", sessions)).toEqual({ id: "pij-worker-new" });
	});

	it("falls back to startedAt when lastEventAt is absent", () => {
		const sessions = [
			desc({ id: "pij-worker-a", startedAt: "2026-06-29T09:00:00.000Z" }),
			// b has no lastEventAt but a newer startedAt → b should win
			desc({ id: "pij-worker-b", startedAt: "2026-06-29T13:00:00.000Z" }),
		];
		expect(resolveTarget("worker", sessions)).toEqual({ id: "pij-worker-b" });
	});

	it("prefers a present lastEventAt over a peer's startedAt-only key", () => {
		const sessions = [
			// a: active recently
			desc({
				id: "pij-worker-a",
				startedAt: "2026-06-29T08:00:00.000Z",
				lastEventAt: "2026-06-29T14:00:00.000Z",
			}),
			// b: started later but never produced an event
			desc({ id: "pij-worker-b", startedAt: "2026-06-29T13:00:00.000Z" }),
		];
		expect(resolveTarget("worker", sessions)).toEqual({ id: "pij-worker-a" });
	});

	it("returns null when nothing matches", () => {
		const sessions = [desc({ id: "pij-osn81b" })];
		expect(resolveTarget("zzz", sessions)).toBeNull();
	});

	it("returns null for an empty or whitespace-only token", () => {
		const sessions = [desc({ id: "pij-osn81b" })];
		expect(resolveTarget("", sessions)).toBeNull();
		expect(resolveTarget("   ", sessions)).toBeNull();
		// a bare "pij-" strips to empty → null (not a match-all)
		expect(resolveTarget("pij-", sessions)).toBeNull();
	});

	it("returns null against an empty session list", () => {
		expect(resolveTarget("osn", [])).toBeNull();
	});
});
