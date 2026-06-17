import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import factory from "./index.js";
import type { FileEntry, WatchDeps } from "./watcher.js";

type Handler = (event: unknown, ctx: unknown) => Promise<void> | void;

function fakePi() {
	const sent: Array<{ text: string; opts?: unknown }> = [];
	let sessionStart: Handler | undefined;
	let command: ((args: string, ctx: unknown) => Promise<void> | void) | undefined;
	const pi = {
		on: (name: string, h: Handler) => {
			if (name === "session_start") sessionStart = h;
		},
		sendUserMessage: (text: string, opts?: unknown) => {
			sent.push({ text, opts });
		},
		registerCommand: (
			_name: string,
			def: { handler: (args: string, ctx: unknown) => Promise<void> | void },
		) => {
			command = def.handler;
		},
	};
	return {
		pi: pi as unknown as ExtensionAPI,
		sent,
		getStart: () => sessionStart,
		getCommand: () => command,
	};
}

function fakeCmdCtx() {
	const notifies: Array<{ msg: string; level?: string }> = [];
	return {
		ctx: {
			ui: {
				notify: (msg: string, level?: string) => notifies.push({ msg, level }),
				setStatus: () => {},
			},
		} as unknown,
		notifies,
		last: () => notifies[notifies.length - 1]?.msg ?? "",
	};
}

function fakeCtx(isIdle: boolean) {
	return { isIdle: () => isIdle, ui: { setStatus: () => {}, notify: () => {} } };
}

function fakeWatchDeps(opts: { throwOnWatch?: boolean } = {}) {
	let files: FileEntry[] = [];
	let listener: (() => void) | undefined;
	let timer: (() => void) | undefined;
	let closes = 0;
	const deps: WatchDeps = {
		watch: (_d, _o, l) => {
			if (opts.throwOnWatch) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
			listener = l;
			return {
				close: () => {
					closes++;
				},
			};
		},
		listFiles: async () => files,
		now: () => 1000,
		setTimer: (fn) => {
			timer = fn;
			return () => {
				timer = undefined;
			};
		},
	};
	return {
		deps,
		setFiles: (f: FileEntry[]) => {
			files = f;
		},
		fireEvent: () => listener?.(),
		closes: () => closes,
		flush: async () => {
			timer?.();
			await new Promise((r) => setTimeout(r, 10));
		},
	};
}

async function makeProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fwn-wire-"));
	await mkdir(join(dir, ".pi"), { recursive: true });
	await writeFile(
		join(dir, ".pi/file-watch.json"),
		JSON.stringify({ watches: [{ dir: "docs", patterns: ["**/*.md"] }] }),
	);
	return dir;
}

describe("index wiring — config → watcher → inject end-to-end", () => {
	it("STEERS a no-tool-call notice on change when busy (AC-01/02/06)", async () => {
		const dir = await makeProject();
		const w = fakeWatchDeps();
		const { pi, sent, getStart } = fakePi();

		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		const start = getStart();
		expect(start).toBeDefined();
		await start?.({}, fakeCtx(false)); // busy at session_start; primes empty snapshot

		w.setFiles([{ rel: "guide.md", mtimeMs: 5, size: 5 }]);
		w.fireEvent();
		await w.flush();

		expect(sent).toEqual([{ text: "[file-watch] guide.md created", opts: { deliverAs: "steer" } }]);

		await rm(dir, { recursive: true, force: true });
	});

	it("delivers immediately (no steer) when idle", async () => {
		const dir = await makeProject();
		const w = fakeWatchDeps();
		const { pi, sent, getStart } = fakePi();

		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await getStart()?.({}, fakeCtx(true)); // idle

		w.setFiles([{ rel: "a.md", mtimeMs: 1, size: 1 }]);
		w.fireEvent();
		await w.flush();

		expect(sent).toEqual([{ text: "[file-watch] a.md created", opts: undefined }]);

		await rm(dir, { recursive: true, force: true });
	});

	it("stays silent and reports not-configured when no config file exists", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fwn-noconf-"));
		const w = fakeWatchDeps();
		const { pi, sent, getStart } = fakePi();

		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await getStart()?.({}, fakeCtx(false));
		w.fireEvent();
		await w.flush();

		expect(sent).toEqual([]); // no watcher armed, nothing injected

		await rm(dir, { recursive: true, force: true });
	});

	it("disposes the prior watcher on reload (second session_start) (AC-06)", async () => {
		const dir = await makeProject();
		const w = fakeWatchDeps();
		const { pi, getStart } = fakePi();

		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await getStart()?.({}, fakeCtx(true)); // boot
		expect(w.closes()).toBe(0);
		await getStart()?.({}, fakeCtx(true)); // reload — must close the first watcher
		expect(w.closes()).toBe(1);

		await rm(dir, { recursive: true, force: true });
	});

	it("survives an fs.watch setup failure without rejecting session_start (HIGH-3)", async () => {
		const dir = await makeProject();
		const w = fakeWatchDeps({ throwOnWatch: true });
		const { pi, sent, getStart } = fakePi();

		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await expect(getStart()?.({}, fakeCtx(false))).resolves.toBeUndefined();
		expect(sent).toEqual([]); // watcher never armed; no crash

		await rm(dir, { recursive: true, force: true });
	});
});

describe("index wiring — runtime commands (AC-07)", () => {
	async function bootNoConfig() {
		const dir = await mkdtemp(join(tmpdir(), "fwn-rt-"));
		const w = fakeWatchDeps();
		const harness = fakePi();
		factory(harness.pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await harness.getStart()?.({}, fakeCtx(true)); // boot, no config => 0 watches
		return { dir, w, ...harness, run: harness.getCommand() };
	}

	it("arms, lists, and stops a runtime watch with no reload", async () => {
		const { dir, w, run } = await bootNoConfig();
		expect(run).toBeDefined();

		const armed = fakeCmdCtx();
		await run?.("watch docs **/*.md", armed.ctx);
		expect(w.closes()).toBe(0);
		expect(armed.last()).toContain("now watching");
		expect(armed.last()).toContain("**/*.md");

		const listed = fakeCmdCtx();
		await run?.("list", listed.ctx);
		expect(listed.last()).toContain("watching:");
		expect(listed.last()).toContain("(runtime)");

		const stopped = fakeCmdCtx();
		await run?.("stop docs", stopped.ctx);
		expect(w.closes()).toBe(1);
		expect(stopped.last()).toContain("stopped watching");

		const empty = fakeCmdCtx();
		await run?.("list", empty.ctx);
		expect(empty.last()).toBe("file-watch: no active watches");

		await rm(dir, { recursive: true, force: true });
	});

	it("dedupes a second watch on the same dir (disposes the first)", async () => {
		const { dir, w, run } = await bootNoConfig();
		await run?.("watch docs **/*.md", fakeCmdCtx().ctx);
		expect(w.closes()).toBe(0);
		await run?.("watch docs **/*.ts", fakeCmdCtx().ctx); // same dir, re-arm
		expect(w.closes()).toBe(1); // prior disposed

		const listed = fakeCmdCtx();
		await run?.("list", listed.ctx);
		expect(listed.notifies).toHaveLength(1);
		expect(listed.last().split("\n")).toHaveLength(1); // still exactly one watch

		await rm(dir, { recursive: true, force: true });
	});

	it("reports a clear error when arming fails, without crashing (try-guard)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fwn-rt-bad-"));
		const w = fakeWatchDeps({ throwOnWatch: true });
		const h = fakePi();
		factory(h.pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await h.getStart()?.({}, fakeCtx(true));
		const run = h.getCommand();

		const armed = fakeCmdCtx();
		await expect(run?.("watch docs **/*.md", armed.ctx)).resolves.toBeUndefined();
		expect(armed.last()).toContain("cannot watch");

		await rm(dir, { recursive: true, force: true });
	});

	it("disposes a runtime watch on reload — it does NOT survive (HIGH-2 leak guard)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fwn-rt-reload-"));
		const w = fakeWatchDeps();
		const h = fakePi();
		factory(h.pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await h.getStart()?.({}, fakeCtx(true)); // boot, no config
		const run = h.getCommand();

		await run?.("watch docs **/*.md", fakeCmdCtx().ctx); // runtime-arm
		expect(w.closes()).toBe(0);

		await h.getStart()?.({}, fakeCtx(true)); // reload — disposeAll must clear runtime watch
		expect(w.closes()).toBe(1);

		const listed = fakeCmdCtx();
		await run?.("list", listed.ctx);
		expect(listed.last()).toBe("file-watch: no active watches"); // gone, not leaked

		await rm(dir, { recursive: true, force: true });
	});
});
