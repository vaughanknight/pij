// Store-level spec for the tick heartbeat (plan 100 Phase 1, P8: target the
// store, not the wiring). DELIBERATELY FREE OF ANY SUBPROCESS CALL — nothing
// here spawns a child or shells out. `mutate.mjs` refuses to mutate a spec that
// does, and M3 has to be able to run against this one.
//
// Do NOT name the banned APIs literally, even in a comment: the tool's scan is
// a plain substring match over the file's source (`src.includes(marker)`), so a
// comment that merely MENTIONS them makes the spec unmutable. Cost me one
// refusal (exit 3) to learn; recorded in the execution log as harness friction.

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildHeartbeat,
	FsTickHeartbeatStore,
	lastTickFor,
	parseHeartbeat,
	TICK_HEARTBEAT_FILE,
	TICK_HEARTBEAT_VERSION,
} from "./tick-heartbeat.js";

const TICK_AT = "2026-06-28T00:00:00.000Z";
const LATER = "2026-06-28T00:00:00.600Z";

describe("buildHeartbeat", () => {
	it("stamps every id with the tick's own timestamp", () => {
		expect(buildHeartbeat(["pij-a", "pij-b"], TICK_AT)).toEqual({
			v: TICK_HEARTBEAT_VERSION,
			tickAt: TICK_AT,
			sessions: { "pij-a": TICK_AT, "pij-b": TICK_AT },
		});
	});

	it("has NO top-level `id` — the property that keeps the file invisible to list()", () => {
		// `FsRegistry.readFile` admits a JSON file as a descriptor exactly when
		// `typeof parsed?.id === "string"` (adapters/fs-registry.ts:1132), and this
		// file lives beside the descriptors. A top-level `id` would make the
		// heartbeat a phantom session in every `pij list`.
		const built: Record<string, unknown> = buildHeartbeat(["pij-a"], TICK_AT);
		expect(Object.hasOwn(built, "id")).toBe(false);
		expect(built.id).toBeUndefined();
	});

	it("an empty owned set is a legal file, not an absent one", () => {
		expect(buildHeartbeat([], TICK_AT).sessions).toEqual({});
	});

	it("drops a departed id by construction — the whole file is rebuilt each tick", () => {
		const first = buildHeartbeat(["pij-a", "pij-gone"], TICK_AT);
		const second = buildHeartbeat(["pij-a"], LATER);

		expect(lastTickFor(first.sessions, "pij-gone")).toBe(TICK_AT);
		expect(lastTickFor(second.sessions, "pij-gone")).toBeUndefined();
		expect(lastTickFor(second.sessions, "pij-a")).toBe(LATER);
	});
});

describe("parseHeartbeat", () => {
	it("round-trips what buildHeartbeat serialised", () => {
		const text = JSON.stringify(buildHeartbeat(["pij-a", "pij-b"], TICK_AT));

		expect(parseHeartbeat(text)).toEqual({ "pij-a": TICK_AT, "pij-b": TICK_AT });
	});

	it.each([
		["a missing file (undefined)", undefined],
		["a missing file (null)", null],
		["an empty file", ""],
		["corrupt JSON", "{ this is not json"],
		["a truncated write", '{"v":1,"tickAt":"2026-06-28T00:00'],
		["a JSON scalar", "42"],
		["a JSON array", '["pij-a"]'],
		["JSON null", "null"],
		["a wrong version", '{"v":2,"tickAt":"x","sessions":{"pij-a":"x"}}'],
		["a missing version", '{"tickAt":"x","sessions":{"pij-a":"x"}}'],
		["a non-object sessions field", '{"v":1,"tickAt":"x","sessions":"nope"}'],
		["an absent sessions field", '{"v":1,"tickAt":"x"}'],
	] as const)("returns an empty map for %s — never throws", (_name, text) => {
		expect(parseHeartbeat(text)).toEqual({});
	});

	it("keeps the good entries when one value is not a string", () => {
		// Field-level tolerance: one bad entry must not discard live telemetry.
		const text = '{"v":1,"tickAt":"x","sessions":{"pij-a":"2026-06-28T00:00:00.000Z","pij-b":7}}';

		expect(parseHeartbeat(text)).toEqual({ "pij-a": TICK_AT });
	});
});

describe("lastTickFor", () => {
	it("returns the stamp for a known id and undefined for an unknown one", () => {
		const stamps = buildHeartbeat(["pij-a"], TICK_AT).sessions;

		expect(lastTickFor(stamps, "pij-a")).toBe(TICK_AT);
		expect(lastTickFor(stamps, "pij-unknown")).toBeUndefined();
	});
});

describe("FsTickHeartbeatStore", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-heartbeat-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("persists to the named file and reads its own stamps back", () => {
		const store = new FsTickHeartbeatStore(home);

		store.write(["pij-a", "pij-b"], TICK_AT);

		expect(store.read()).toEqual({ "pij-a": TICK_AT, "pij-b": TICK_AT });
		const raw: unknown = JSON.parse(readFileSync(join(home, TICK_HEARTBEAT_FILE), "utf8"));
		expect(raw).toEqual({
			v: TICK_HEARTBEAT_VERSION,
			tickAt: TICK_AT,
			sessions: { "pij-a": TICK_AT, "pij-b": TICK_AT },
		});
	});

	it("reads an empty map when nothing has been written yet", () => {
		expect(new FsTickHeartbeatStore(home).read()).toEqual({});
	});

	it("replaces the file wholesale, so a departed id disappears from disk", () => {
		const store = new FsTickHeartbeatStore(home);

		store.write(["pij-a", "pij-gone"], TICK_AT);
		store.write(["pij-a"], LATER);

		expect(store.read()).toEqual({ "pij-a": LATER });
	});

	it("degrades to an empty map on a corrupt file instead of throwing", () => {
		writeFileSync(join(home, TICK_HEARTBEAT_FILE), "{ truncated", "utf8");

		expect(() => new FsTickHeartbeatStore(home).read()).not.toThrow();
		expect(new FsTickHeartbeatStore(home).read()).toEqual({});
	});

	it("never throws when the home directory is unwritable", () => {
		// A daemon must not die persisting telemetry.
		const store = new FsTickHeartbeatStore(join(home, "file-not-a-dir", "nested"));
		writeFileSync(join(home, "file-not-a-dir"), "x", "utf8");

		expect(() => store.write(["pij-a"], TICK_AT)).not.toThrow();
		expect(store.read()).toEqual({});
	});

	it("writes past a foreign staging file squatting the legacy fixed temp path", () => {
		// `persist` stages under a pid+UUID name rather than a fixed `.tmp`, so a
		// stale or foreign staging entry at the old path cannot block a write.
		// Kept from the deleted prune spec: the STAGING decision outlived the prune
		// that motivated it, and two processes can still be mid-write here.
		mkdirSync(`${join(home, TICK_HEARTBEAT_FILE)}.tmp`, { recursive: true });

		const store = new FsTickHeartbeatStore(home);
		store.write(["pij-a"], TICK_AT);

		expect(store.read()).toEqual({ "pij-a": TICK_AT });
	});
});

describe("FsTickHeartbeatStore.forget — the reincarnation drop (fix round 5)", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-heartbeat-forget-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("drops one id and leaves every other stamp intact", () => {
		const store = new FsTickHeartbeatStore(home);
		store.write(["pij-a", "pij-b"], TICK_AT);

		store.forget("pij-a");

		expect(store.read()).toEqual({ "pij-b": TICK_AT });
	});

	it("PERSISTS the removal — a fresh reader sees it, not just this instance", () => {
		// The whole point is that a CLI process's drop is visible to the daemon and
		// to every later reader. An in-memory-only removal would pass a same-object
		// assertion and change nothing on disk.
		new FsTickHeartbeatStore(home).write(["pij-a", "pij-b"], TICK_AT);

		new FsTickHeartbeatStore(home).forget("pij-a");

		expect(parseHeartbeat(readFileSync(join(home, TICK_HEARTBEAT_FILE), "utf8"))).toEqual({
			"pij-b": TICK_AT,
		});
	});

	it("preserves the record's tickAt, so the file stays a legal heartbeat", () => {
		// `forget` rewrites the whole file. Dropping `tickAt` would make the record
		// unparseable and silently wipe every remaining stamp.
		const store = new FsTickHeartbeatStore(home);
		store.write(["pij-a", "pij-b"], TICK_AT);

		store.forget("pij-a");

		const raw: unknown = JSON.parse(readFileSync(join(home, TICK_HEARTBEAT_FILE), "utf8"));
		expect(raw).toEqual({
			v: TICK_HEARTBEAT_VERSION,
			tickAt: TICK_AT,
			sessions: { "pij-b": TICK_AT },
		});
	});

	it("does not CREATE a file when there is no map yet", () => {
		// A revive on a home whose daemon has never ticked must not conjure an empty
		// heartbeat, which would read as "the daemon is here" to a shape check.
		new FsTickHeartbeatStore(home).forget("pij-a");

		expect(existsSync(join(home, TICK_HEARTBEAT_FILE))).toBe(false);
	});

	it("does not rewrite the file when the id is not in the map", () => {
		const store = new FsTickHeartbeatStore(home);
		store.write(["pij-a"], TICK_AT);
		const before = statSync(join(home, TICK_HEARTBEAT_FILE)).mtimeMs;

		store.forget("pij-absent");

		expect(statSync(join(home, TICK_HEARTBEAT_FILE)).mtimeMs).toBe(before);
		expect(store.read()).toEqual({ "pij-a": TICK_AT });
	});

	it("leaves a corrupt map alone rather than truncating it", () => {
		writeFileSync(join(home, TICK_HEARTBEAT_FILE), "{ truncated", "utf8");

		expect(() => new FsTickHeartbeatStore(home).forget("pij-a")).not.toThrow();
		expect(readFileSync(join(home, TICK_HEARTBEAT_FILE), "utf8")).toBe("{ truncated");
	});

	it("never throws when the home directory is unwritable", () => {
		const store = new FsTickHeartbeatStore(join(home, "file-not-a-dir", "nested"));
		writeFileSync(join(home, "file-not-a-dir"), "x", "utf8");

		expect(() => store.forget("pij-a")).not.toThrow();
	});

	it("THE SANCTIONED RACE, pinned as behaviour rather than left to be rediscovered", () => {
		// Two concurrent revives of DIFFERENT ids: both read the same map, both
		// write back their own removal, and the later write restores the other id.
		// Simulated by interleaving reads explicitly — this is the accepted cost of
		// the read-modify-write and is recorded on `forget()` in the source.
		//
		// It is asserted so that anyone who "fixes" it has to come here and read why
		// three previous attempts to close it were withdrawn.
		const store = new FsTickHeartbeatStore(home);
		store.write(["pij-a", "pij-b", "pij-c"], TICK_AT);
		const snapshot = readFileSync(join(home, TICK_HEARTBEAT_FILE), "utf8");

		store.forget("pij-a");
		// The second reviver had already read the pre-drop map.
		writeFileSync(join(home, TICK_HEARTBEAT_FILE), snapshot, "utf8");
		store.forget("pij-b");

		// pij-a is back. Bounded by the next heartbeat write — AC-13' as restated.
		expect(store.read()).toEqual({ "pij-a": TICK_AT, "pij-c": TICK_AT });
	});
});
