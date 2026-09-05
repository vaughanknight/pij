import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type HeldRow, HoldQueue } from "./hold-queue.js";

const contract = JSON.parse(
	readFileSync(
		new URL("../../../../crates/testkit/fixtures/delivery/hold-events.json", import.meta.url),
		"utf8",
	),
) as { grace: { default_ms: number } };
const grace = contract.grace.default_ms;
const row = (jobId: number): HeldRow => ({
	jobId,
	message: { messageId: `msg-${jobId}`, from: "sender", to: "seat", body: `${jobId}` },
});

// GREEN-on-new-code: this module had no predecessor. The seven runtime
// witnesses carry the behavioral RED provenance, not a missing-module error.
describe("HoldQueue", () => {
	it("starts outside the grace even when the injected clock starts at zero", () => {
		const queue = new HoldQueue(() => 0, grace);
		expect(queue.shouldHold(0)).toBe(false);
		expect(queue.drain(0)).toEqual([]);
	});

	it("holds at 59 seconds, drains at 60, and retains exact claim order", () => {
		const queue = new HoldQueue(() => 0, grace);
		const first = row(1);
		const second = row(2);
		queue.noteEdit(0);
		queue.push(first);
		queue.push(second);
		expect(queue.shouldHold(59_000)).toBe(true);
		expect(queue.drain(59_000)).toEqual([]);
		expect(queue.size()).toBe(2);
		expect(queue.shouldHold(grace)).toBe(false);
		expect(queue.drain(grace)).toEqual([first, second]);
		expect(queue.size()).toBe(0);
		expect(queue.drain(grace)).toEqual([]);
	});

	it("new terminal input restarts the grace without a maximum hold cap", () => {
		const queue = new HoldQueue(() => 0, grace);
		queue.noteEdit(0);
		queue.push(row(1));
		queue.noteEdit(grace - 1);
		expect(queue.drain(grace)).toEqual([]);
		expect(queue.drain(grace * 2 - 1)).toEqual([row(1)]);
	});

	it("deduplicates an already held claim without reordering it", () => {
		const queue = new HoldQueue(() => 0, grace);
		queue.push(row(1));
		queue.push(row(2));
		queue.push(row(1));
		expect(queue.size()).toBe(2);
		expect(queue.drain(0)).toEqual([row(1), row(2)]);
	});
});
