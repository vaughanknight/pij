import { describe, expect, it } from "vitest";

import { deliverNotices, type InjectMode, type InjectPort, pickInjectMode } from "./inject.js";

function fakePort(isIdle: boolean) {
	const sent: Array<{ text: string; mode: InjectMode }> = [];
	const port: InjectPort = {
		isIdle: () => isIdle,
		send: (text, mode) => sent.push({ text, mode }),
	};
	return { port, sent };
}

describe("pickInjectMode", () => {
	it("idle ⇒ immediate, busy ⇒ steer", () => {
		expect(pickInjectMode(true)).toBe("immediate");
		expect(pickInjectMode(false)).toBe("steer");
	});
});

describe("deliverNotices (AC-02)", () => {
	it("steers every notice when the model is busy", () => {
		const { port, sent } = fakePort(false);
		const mode = deliverNotices(port, ["[file-watch] a.md modified"]);
		expect(mode).toBe("steer");
		expect(sent).toEqual([{ text: "[file-watch] a.md modified", mode: "steer" }]);
	});

	it("delivers immediately when the model is idle", () => {
		const { port, sent } = fakePort(true);
		const mode = deliverNotices(port, ["[file-watch] a.md created"]);
		expect(mode).toBe("immediate");
		expect(sent[0].mode).toBe("immediate");
	});

	it("returns null and sends nothing for an empty batch", () => {
		const { port, sent } = fakePort(false);
		expect(deliverNotices(port, [])).toBeNull();
		expect(sent).toEqual([]);
	});

	it("coalesces a multi-file wake into ONE message (no per-file spam, AC-05)", () => {
		const { port, sent } = fakePort(false);
		const mode = deliverNotices(port, [
			"[file-watch] a.md created",
			"[file-watch] b.md modified",
			"[file-watch] c.md deleted",
		]);
		expect(mode).toBe("steer");
		expect(sent).toHaveLength(1);
		expect(sent[0].text).toBe(
			"[file-watch] a.md created\n[file-watch] b.md modified\n[file-watch] c.md deleted",
		);
	});
});
