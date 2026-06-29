// pij-telegram — `chunk` message splitter tests (TDD, Plan Finding 07 / AC-05).
// Telegram's hard cap is 4096 chars per message; we split with a `(i/n) ` prefix
// and must never let prefix+content exceed that cap.

import { describe, expect, it } from "vitest";
import { chunk } from "./chunk.js";

const TELEGRAM_HARD_LIMIT = 4096;

describe("chunk", () => {
	it("returns a single unprefixed part when text is at or under the limit", () => {
		expect(chunk("hello", 4000)).toEqual(["hello"]);
		// exactly at the limit is still one part, no prefix
		const exact = "a".repeat(4000);
		expect(chunk(exact, 4000)).toEqual([exact]);
	});

	it("returns the empty string as a single part", () => {
		expect(chunk("", 4000)).toEqual([""]);
	});

	it("splits into multiple numbered parts once over the limit", () => {
		const text = "a".repeat(4001);
		const parts = chunk(text, 4000);
		expect(parts.length).toBeGreaterThan(1);
		const n = parts.length;
		parts.forEach((p, i) => {
			expect(p.startsWith(`(${i + 1}/${n}) `)).toBe(true);
		});
	});

	it("never emits a part (incl. prefix) longer than the Telegram hard limit", () => {
		const text = "x".repeat(50_000);
		for (const p of chunk(text, 4000)) {
			expect(p.length).toBeLessThanOrEqual(TELEGRAM_HARD_LIMIT);
		}
	});

	it("never emits a part longer than the requested limit", () => {
		const text = "y".repeat(20_000);
		for (const p of chunk(text, 4000)) {
			expect(p.length).toBeLessThanOrEqual(4000);
		}
	});

	it("preserves the original content across parts (prefixes stripped)", () => {
		const text = "z".repeat(9_500);
		const parts = chunk(text, 4000);
		const rejoined = parts.map((p) => p.replace(/^\(\d+\/\d+\) /, "")).join("");
		expect(rejoined).toBe(text);
	});

	it("respects a small custom limit", () => {
		const parts = chunk("abcdefghij", 4);
		expect(parts.length).toBeGreaterThan(1);
		const n = parts.length;
		parts.forEach((p, i) => {
			expect(p.startsWith(`(${i + 1}/${n}) `)).toBe(true);
			expect(p.length).toBeLessThanOrEqual(4 < `(${i + 1}/${n}) `.length ? p.length : 4);
		});
		// content preserved
		expect(parts.map((p) => p.replace(/^\(\d+\/\d+\) /, "")).join("")).toBe("abcdefghij");
	});

	it("prefers a newline boundary when splitting", () => {
		// two ~3000-char blocks separated by a newline; combined > 4000 forces a split,
		// and the natural break should land on the newline rather than mid-block.
		const blockA = "a".repeat(3000);
		const blockB = "b".repeat(3000);
		const parts = chunk(`${blockA}\n${blockB}`, 4000);
		expect(parts.length).toBe(2);
		const first = parts[0]?.replace(/^\(\d+\/\d+\) /, "");
		// the break lands on the newline, which stays with the leading part (no char lost)
		expect(first).toBe(`${blockA}\n`);
	});

	it("loses no characters when the only split point is a newline (AC-05 round-trip)", () => {
		// The newline is the sole viable boundary; the rejoined parts (prefixes stripped)
		// must equal the original input EXACTLY — the '\n' is preserved, not dropped.
		const original = `${"a".repeat(3000)}\n${"b".repeat(3000)}`;
		const parts = chunk(original, 4000);
		const rejoined = parts.map((p) => p.replace(/^\(\d+\/\d+\) /, "")).join("");
		expect(rejoined).toBe(original);
		expect(rejoined.length).toBe(original.length); // 6001, not 6000
	});
});
