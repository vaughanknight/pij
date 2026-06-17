import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PijMessage } from "../core/types.js";
import { type DeliveredMessage, FsChannel } from "./channel.js";

function msg(body: string): PijMessage {
	return { from: "alice", to: "bob", body };
}

async function waitFor(pred: () => boolean, ms = 1500): Promise<void> {
	const start = Date.now();
	while (!pred()) {
		if (Date.now() - start > ms) throw new Error("waitFor: timed out");
		await new Promise((r) => setTimeout(r, 5));
	}
}

describe("FsChannel", () => {
	let home: string;
	let disposers: Array<() => void>;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-chan-"));
		disposers = [];
	});
	afterEach(() => {
		for (const d of disposers) d();
		rmSync(home, { recursive: true, force: true });
	});

	it("deliver returns ok with a message id", () => {
		const ch = new FsChannel(home);
		const r = ch.deliver(msg("hi"));
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.messageId).toMatch(/^\d+-\d{6}-\d+$/);
	});

	it("drains messages already present when watch starts, in order", async () => {
		const ch = new FsChannel(home);
		ch.deliver(msg("one"));
		ch.deliver(msg("two"));
		ch.deliver(msg("three"));
		const got: DeliveredMessage[] = [];
		disposers.push(ch.watch("bob", (m) => got.push(m)));
		await waitFor(() => got.length === 3);
		expect(got.map((m) => m.body)).toEqual(["one", "two", "three"]);
	});

	it("delivers live writes exactly once, in order (debounce + dedupe)", async () => {
		const ch = new FsChannel(home);
		const got: DeliveredMessage[] = [];
		disposers.push(ch.watch("bob", (m) => got.push(m)));
		for (let i = 1; i <= 5; i++) ch.deliver(msg(`m${i}`));
		await waitFor(() => got.length === 5);
		// settle: any duplicate fs.watch events would arrive within a debounce window
		await new Promise((r) => setTimeout(r, 60));
		expect(got.map((m) => m.body)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
		expect(new Set(got.map((m) => m.messageId)).size).toBe(5);
	});

	it("poll fallback drains a live message even when fs.watch never fires", async () => {
		// Inject a no-op watcher: with fs.watch effectively dead, the ONLY drain path
		// is the fallback poll. This reproduces the post-compaction stranded-message
		// failure mode (fs.watch dropped the inbox event). On the pre-fix code this
		// test hangs (nothing ever drains the message).
		const ch = new FsChannel(home, { pollMs: 30, watchFactory: () => ({ close() {} }) });
		const got: DeliveredMessage[] = [];
		disposers.push(ch.watch("bob", (m) => got.push(m)));
		// Deliver AFTER subscribe so the initial scan() misses it and no watch event fires.
		ch.deliver(msg("stranded"));
		await waitFor(() => got.length === 1);
		expect(got.map((m) => m.body)).toEqual(["stranded"]);
	});

	it("a watcher only sees its own inbox (routes by message.to)", async () => {
		const ch = new FsChannel(home);
		ch.deliver({ from: "alice", to: "carol", body: "for carol" });
		const bobGot: DeliveredMessage[] = [];
		disposers.push(ch.watch("bob", (m) => bobGot.push(m)));
		await new Promise((r) => setTimeout(r, 60));
		expect(bobGot).toEqual([]);
	});
});
