import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PijEvent } from "../core/types.js";
import { FsEventLog } from "./event-log.js";

function ev(seq: number, type = "message"): PijEvent {
	return { seq, timestamp: `2026-06-16T00:00:0${seq}.000Z`, type, data: { n: seq } };
}

describe("FsEventLog", () => {
	let home: string;
	const id = "alice";
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-log-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("appends and reads back in order with count()", () => {
		const log = new FsEventLog(home, id);
		for (let s = 1; s <= 5; s++) log.append(ev(s));
		expect(log.read().map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
		expect(log.count()).toBe(5);
	});

	it("read({since}) returns only seq > since", () => {
		const log = new FsEventLog(home, id);
		for (let s = 1; s <= 5; s++) log.append(ev(s));
		expect(log.read({ since: 3 }).map((e) => e.seq)).toEqual([4, 5]);
	});

	it("read({type}) filters by type; read({last}) is present-minus-N", () => {
		const log = new FsEventLog(home, id);
		log.append(ev(1, "tool_call"));
		log.append(ev(2, "message"));
		log.append(ev(3, "tool_call"));
		expect(log.read({ type: "tool_call" }).map((e) => e.seq)).toEqual([1, 3]);
		expect(log.read({ last: 2 }).map((e) => e.seq)).toEqual([2, 3]);
	});

	it("lastSeq() recovers from disk in a fresh adapter (simulated reload)", () => {
		const first = new FsEventLog(home, id);
		for (let s = 1; s <= 4; s++) first.append(ev(s));
		// New process / reload: a fresh adapter over the same dir.
		const reopened = new FsEventLog(home, id);
		expect(reopened.lastSeq()).toBe(4);
		expect(reopened.count()).toBe(4);
		reopened.append(ev(5));
		expect(reopened.lastSeq()).toBe(5);
	});

	it("empty log: lastSeq()=0, count()=0, read()=[]", () => {
		const log = new FsEventLog(home, "fresh");
		expect(log.lastSeq()).toBe(0);
		expect(log.count()).toBe(0);
		expect(log.read()).toEqual([]);
	});

	it("appendOnce publishes one event per key and merges sequence order after reopen", () => {
		const log = new FsEventLog(home, id);
		log.append(ev(1));
		expect(log.appendOnce("receipt:m3", ev(3, "receipt"))).toBe("appended");
		expect(log.appendOnce("receipt:m3", ev(99, "receipt"))).toBe("existing");
		log.append(ev(2));
		expect(log.read().map((event) => event.seq)).toEqual([1, 2, 3]);
		expect(log.read({ last: 2 }).map((event) => event.seq)).toEqual([2, 3]);
		expect(log.count()).toBe(3);
		expect(log.lastSeq()).toBe(3);

		const reopened = new FsEventLog(home, id);
		expect(reopened.appendOnce("receipt:m3", ev(100, "receipt"))).toBe("existing");
		expect(reopened.read().map((event) => event.seq)).toEqual([1, 2, 3]);
	});

	it("appendOnce removes temp files and propagates non-EEXIST publication failures", () => {
		const log = new FsEventLog(home, id);
		expect(log.appendOnce("receipt:m1", ev(1, "receipt"))).toBe("appended");
		expect(readdirSync(join(home, id)).filter((name) => name.startsWith(".event-once-"))).toEqual(
			[],
		);

		const blocked = new FsEventLog(home, "blocked");
		const blockedDir = join(home, "blocked");
		rmSync(blockedDir, { recursive: true, force: true });
		writeFileSync(blockedDir, "not a directory");
		expect(() => blocked.appendOnce("receipt:m2", ev(2, "receipt"))).toThrow();
		expect(readdirSync(home).filter((name) => name.startsWith(".event-once-"))).toEqual([]);
	});

	it("preserves append/file order for legacy NDJSON-only out-of-order sequences", () => {
		const log = new FsEventLog(home, id);
		log.append(ev(3));
		log.append(ev(1));
		log.append(ev(2));
		expect(log.read().map((event) => event.seq)).toEqual([3, 1, 2]);
		expect(log.read({ last: 2 }).map((event) => event.seq)).toEqual([1, 2]);
		expect(log.count()).toBe(3);
		expect(log.lastSeq()).toBe(3);
	});
});
