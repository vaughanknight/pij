import { mkdtempSync, rmSync } from "node:fs";
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
});
