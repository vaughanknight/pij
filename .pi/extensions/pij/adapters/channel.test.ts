import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PijMessage } from "../core/types.js";
import { type DeliveredMessage, FsChannel } from "./channel.js";

function msg(body: string): PijMessage {
	return { from: "alice", to: "bob", body };
}

function value<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

async function waitFor(pred: () => boolean, ms = 1500): Promise<void> {
	const start = Date.now();
	while (!pred()) {
		if (Date.now() - start > ms) throw new Error("waitFor: timed out");
		await new Promise((r) => setTimeout(r, 5));
	}
}

/** A deterministic fs.watch stand-in. The real OS watcher (FSEvents on macOS) is
 *  the dominant, highly-variable cost that made the live-delivery tests flake
 *  under full-suite parallel load (DL-004): the mocked-watcher tests below run
 *  in ~6ms, the real-watch ones took 0.6-1.6s and ballooned past the 5s budget
 *  under 16-way disk/FSEvents contention. `fire()` triggers the channel's
 *  onEvent exactly as a real inbox event would, but instantly. `pollMs` is
 *  pushed far out so `fire()` is the SOLE drain path — a broken drain HANGS the
 *  test (non-vacuous) instead of being silently rescued by the 1.5s fallback
 *  poll. The real fs.watch WIRING stays covered by "passes a canonical inbox
 *  path to fs.watch"; only the drain LOGIC is exercised here. */
function controllableWatch(): {
	opts: { pollMs: number; watchFactory: (dir: string, onEvent: () => void) => { close(): void } };
	fire: () => void;
} {
	let onEvent = (): void => {};
	return {
		opts: {
			pollMs: 1_000_000,
			watchFactory: (_dir, cb) => {
				onEvent = cb;
				return { close() {} };
			},
		},
		fire: () => onEvent(),
	};
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
	}, 60_000);

	function writeDelivered(
		messageId: string,
		body: string,
		extra: Partial<DeliveredMessage> = {},
	): { path: string; bytes: string } {
		const dir = join(home, "bob", "inbox");
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `msg-${messageId}.json`);
		const bytes = JSON.stringify({
			from: "alice",
			to: "bob",
			body,
			messageId,
			...extra,
		});
		writeFileSync(path, bytes);
		return { path, bytes };
	}

	it("deliver returns ok with a message id", () => {
		const ch = new FsChannel(home);
		const r = ch.deliver(msg("hi"));
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.messageId).toMatch(/^\d+-\d{6}-\d+$/);
	});

	it("lists legacy unread messages in lexical message-id order", () => {
		writeDelivered("003", "three");
		writeDelivered("001", "one");
		writeDelivered("002", "two");

		const unread = value(new FsChannel(home).listUnread("bob"));

		expect(unread.map(({ messageId, body }) => ({ messageId, body }))).toEqual([
			{ messageId: "001", body: "one" },
			{ messageId: "002", body: "two" },
			{ messageId: "003", body: "three" },
		]);
	});

	it("claims by exclusive marker without mutating the message envelope", () => {
		const original = writeDelivered("001", "immutable");
		const ch = new FsChannel(home);

		const claimed = value(ch.claimUnread("bob", "001"));

		expect(claimed).toMatchObject({ kind: "claimed", message: { messageId: "001" } });
		expect(readFileSync(original.path, "utf8")).toBe(original.bytes);
		expect(existsSync(join(home, "bob", "inbox", "read-001.json"))).toBe(true);
		expect(value(ch.listUnread("bob"))).toEqual([]);
	});

	it("lets two concurrent processes collectively return each message exactly once", {
		timeout: 15_000,
	}, async () => {
		for (const id of ["001", "002", "003"]) writeDelivered(id, id);
		const channelUrl = pathToFileURL(join(import.meta.dirname, "channel.ts")).href;
		const script = `
			import { FsChannel } from ${JSON.stringify(channelUrl)};
			await new Promise((resolve) => process.stdin.once("data", resolve));
			const channel = new FsChannel(process.env.CLAIM_HOME);
			const listed = channel.listUnread("bob");
			if (!listed.ok) {
				process.stderr.write(listed.message);
				process.exit(1);
			}
			const claimed = [];
			for (const message of listed.value) {
				const result = channel.claimUnread("bob", message.messageId);
				if (!result.ok) {
					process.stderr.write(result.message);
					process.exit(1);
				}
				if (result.value.kind === "claimed") claimed.push(result.value.message.messageId);
			}
			process.stdout.write(JSON.stringify(claimed));
		`;
		const startClaimer = (): { start(): void; result: Promise<string[]> } => {
			const child = spawn(
				process.execPath,
				["--import", "tsx", "--input-type=module", "--eval", script],
				{
					cwd: import.meta.dirname,
					env: { ...process.env, CLAIM_HOME: home },
					stdio: ["pipe", "pipe", "pipe"],
				},
			);
			let stdout = "";
			let stderr = "";
			child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
				stderr += chunk;
			});
			return {
				start: () => child.stdin.end("\n"),
				result: new Promise((resolve, reject) => {
					child.on("error", reject);
					child.on("close", (code) => {
						if (code === 0) resolve(JSON.parse(stdout) as string[]);
						else reject(new Error(stderr || `claimer exited ${code}`));
					});
				}),
			};
		};
		const first = startClaimer();
		const second = startClaimer();
		first.start();
		second.start();
		const claimedIds = (await Promise.all([first.result, second.result])).flat();

		expect(claimedIds.sort()).toEqual(["001", "002", "003"]);
		expect(new Set(claimedIds).size).toBe(3);
	});

	it("marks read idempotently without replacing the first marker", () => {
		writeDelivered("001", "one");
		const ch = new FsChannel(home);
		const markerPath = join(home, "bob", "inbox", "read-001.json");

		expect(value(ch.markRead("bob", "001"))).toMatchObject({ kind: "marked" });
		const firstBytes = readFileSync(markerPath, "utf8");
		expect(value(ch.markRead("bob", "001"))).toEqual({
			kind: "already-read",
			messageId: "001",
		});
		expect(readFileSync(markerPath, "utf8")).toBe(firstBytes);
	});

	it("treats marker existence as authoritative even when marker metadata is malformed", () => {
		writeDelivered("001", "one");
		const markerPath = join(home, "bob", "inbox", "read-001.json");
		writeFileSync(markerPath, "{not-json");
		const ch = new FsChannel(home);

		expect(value(ch.listUnread("bob"))).toEqual([]);
		expect(value(ch.claimUnread("bob", "001"))).toEqual({
			kind: "already-read",
			messageId: "001",
		});
	});

	it("surfaces malformed messages without creating a read marker", () => {
		const dir = join(home, "bob", "inbox");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "msg-001.json"), "{not-json");
		const ch = new FsChannel(home);

		const result = ch.claimUnread("bob", "001");

		expect(result.ok).toBe(false);
		expect(existsSync(join(dir, "read-001.json"))).toBe(false);
	});

	it("keeps receipt envelopes classifiable at the inbox boundary", () => {
		writeDelivered("001", "delivered:m-1", { kind: "receipt" });

		const unread = value(new FsChannel(home).listUnread("bob"));

		expect(unread).toMatchObject([{ messageId: "001", kind: "receipt" }]);
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
		const { opts, fire } = controllableWatch();
		const ch = new FsChannel(home, opts);
		const got: DeliveredMessage[] = [];
		disposers.push(ch.watch("bob", (m) => got.push(m)));
		for (let i = 1; i <= 5; i++) ch.deliver(msg(`m${i}`));
		// A real write burst emits several fs.watch events; the debounce collapses
		// them to one scan and the per-id `seen` set drains each message once.
		fire();
		fire();
		fire();
		await waitFor(() => got.length === 5);
		// settle past the debounce window — the extra fires must not double-deliver
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

	it("passes a canonical inbox path to fs.watch", () => {
		let watchedDir = "";
		const realHome = join(home, "real-home");
		const linkedHome = join(home, "linked-home");
		mkdirSync(realHome);
		symlinkSync(realHome, linkedHome, "junction");
		const ch = new FsChannel(linkedHome, {
			watchFactory: (dir) => {
				watchedDir = dir;
				return { close() {} };
			},
		});

		disposers.push(ch.watch("bob", () => {}));

		expect(watchedDir).toBe(realpathSync.native(join(realHome, "bob", "inbox")));
	});

	it("a watcher only sees its own inbox (routes by message.to)", async () => {
		const { opts, fire } = controllableWatch();
		const ch = new FsChannel(home, opts);
		ch.deliver({ from: "alice", to: "carol", body: "for carol" });
		const bobGot: DeliveredMessage[] = [];
		disposers.push(ch.watch("bob", (m) => bobGot.push(m)));
		// Fire bob's watcher: its scan reads only bob's inbox, which never held
		// carol's message (routing is by recipient dir, not filter).
		fire();
		await new Promise((r) => setTimeout(r, 60));
		expect(bobGot).toEqual([]);
	});

	it("calls onScan on every executed scan — the poll-primary liveness heartbeat", async () => {
		const { opts, fire } = controllableWatch();
		const ch = new FsChannel(home, opts);
		const scans: number[] = [];
		disposers.push(
			ch.watch(
				"bob",
				() => {},
				new Set(),
				(atMs) => scans.push(atMs),
			),
		);
		// the drain-on-subscribe scan stamps once even with an empty inbox —
		// liveness must not depend on a delivery happening.
		const afterSubscribe = scans.length;
		expect(afterSubscribe).toBeGreaterThanOrEqual(1);
		fire();
		await waitFor(() => scans.length > afterSubscribe);
		// stamps are epoch-ms, monotonic non-decreasing
		expect(scans.every((t, i) => i === 0 || t >= (scans[i - 1] ?? 0))).toBe(true);
	});
});
