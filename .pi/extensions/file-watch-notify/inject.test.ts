import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	deliverNotices,
	type InjectMode,
	type InjectPort,
	makePiInjectPort,
	pickInjectMode,
	SteeredNoticeTracker,
} from "./inject.js";

function fakePort(isIdle: boolean) {
	const sent: Array<{ text: string; mode: InjectMode }> = [];
	const port: InjectPort = {
		isIdle: () => isIdle,
		send: (text, mode) => {
			sent.push({ text, mode });
			return { ok: true };
		},
	};
	return { port, sent };
}

describe("pickInjectMode", () => {
	it("idle ⇒ immediate, busy ⇒ steer", () => {
		expect(pickInjectMode(true)).toBe("immediate");
		expect(pickInjectMode(false)).toBe("steer");
	});
});

describe("makePiInjectPort", () => {
	it("treats a stale ctx.isIdle() as busy instead of throwing", () => {
		const sent: Array<{ text: string; opts?: unknown }> = [];
		const pi = {
			sendUserMessage: (text: string, opts?: unknown) => sent.push({ text, opts }),
		} as unknown as ExtensionAPI;
		const staleCtx = {
			isIdle: () => {
				throw new Error("stale ctx");
			},
		} as unknown as ExtensionContext;
		const port = makePiInjectPort(pi, () => staleCtx);

		expect(() => deliverNotices(port, ["[file-watch] stale.md modified"])).not.toThrow();
		expect(sent).toEqual([
			{ text: "[file-watch] stale.md modified", opts: { deliverAs: "steer" } },
		]);
	});

	it("drops a stale sendUserMessage() wake instead of throwing", () => {
		const pi = {
			sendUserMessage: () => {
				throw new Error("stale extension runner");
			},
		} as unknown as ExtensionAPI;
		const ctx = { isIdle: () => false } as unknown as ExtensionContext;
		const port = makePiInjectPort(pi, () => ctx);

		expect(() => deliverNotices(port, ["[file-watch] stale.md modified"])).not.toThrow();
	});

	it("does not poison pending steer dedup when a stale send is dropped", () => {
		const sent: Array<{ text: string; opts?: unknown }> = [];
		let shouldThrow = true;
		const pi = {
			sendUserMessage: (text: string, opts?: unknown) => {
				if (shouldThrow) throw new Error("stale extension runner");
				sent.push({ text, opts });
			},
		} as unknown as ExtensionAPI;
		const ctx = { isIdle: () => false } as unknown as ExtensionContext;
		const port = makePiInjectPort(pi, () => ctx);
		const pending = new Set<string>();

		expect(deliverNotices(port, ["[file-watch] stale.md modified"], pending)).toBeNull();
		shouldThrow = false;
		expect(deliverNotices(port, ["[file-watch] stale.md modified"], pending)).toBe("steer");

		expect(sent).toEqual([
			{ text: "[file-watch] stale.md modified", opts: { deliverAs: "steer" } },
		]);
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

	it("does not steer duplicate notice lines already pending", () => {
		const { port, sent } = fakePort(false);
		const pending = new Set<string>();

		expect(deliverNotices(port, ["[file-watch] a.md modified"], pending)).toBe("steer");
		expect(deliverNotices(port, ["[file-watch] a.md modified"], pending)).toBeNull();

		expect(sent).toEqual([{ text: "[file-watch] a.md modified", mode: "steer" }]);
	});

	it("keeps new steered lines from a mixed duplicate batch", () => {
		const { port, sent } = fakePort(false);
		const pending = new Set(["[file-watch] a.md modified"]);

		const mode = deliverNotices(
			port,
			["[file-watch] a.md modified", "[file-watch] b.md modified"],
			pending,
		);

		expect(mode).toBe("steer");
		expect(sent).toEqual([{ text: "[file-watch] b.md modified", mode: "steer" }]);
		expect([...pending].sort()).toEqual([
			"[file-watch] a.md modified",
			"[file-watch] b.md modified",
		]);
	});

	it("keeps queued notices pending across the current turn_end", () => {
		const pending = new SteeredNoticeTracker();
		pending.add("[file-watch] a.md modified");

		pending.onTurnEnd();
		expect(pending.has("[file-watch] a.md modified")).toBe(true);

		pending.onTurnStart();
		expect(pending.has("[file-watch] a.md modified")).toBe(true);

		pending.onTurnEnd();
		expect(pending.has("[file-watch] a.md modified")).toBe(false);
	});

	it("uses the max-size fallback to re-arm dedup after lifecycle anomalies", () => {
		const pending = new SteeredNoticeTracker({ maxPendingNotices: 1 });
		pending.add("[file-watch] a.md modified");
		pending.add("[file-watch] b.md modified");

		expect(pending.has("[file-watch] a.md modified")).toBe(false);
		expect(pending.has("[file-watch] b.md modified")).toBe(true);
	});
});
