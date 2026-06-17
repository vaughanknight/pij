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
	const pi = {
		on: (name: string, h: Handler) => {
			if (name === "session_start") sessionStart = h;
		},
		sendUserMessage: (text: string, opts?: unknown) => {
			sent.push({ text, opts });
		},
		registerCommand: () => {},
	};
	return { pi: pi as unknown as ExtensionAPI, sent, getStart: () => sessionStart };
}

function fakeCtx(isIdle: boolean) {
	return { isIdle: () => isIdle, ui: { setStatus: () => {}, notify: () => {} } };
}

function fakeWatchDeps() {
	let files: FileEntry[] = [];
	let listener: (() => void) | undefined;
	let timer: (() => void) | undefined;
	const deps: WatchDeps = {
		watch: (_d, _o, l) => {
			listener = l;
			return { close: () => {} };
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
});
