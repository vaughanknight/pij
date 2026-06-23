import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import factory from "./index.js";
import type { FileEntry, WatchDeps } from "./watcher.js";

type Handler = (event: unknown, ctx: unknown) => Promise<void> | void;
type ToolForTest = {
	name: string;
	execute: (
		id: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: unknown,
	) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
};

function fakePi() {
	const sent: Array<{ text: string; opts?: unknown }> = [];
	const tools = new Map<string, ToolForTest>();
	let sessionStart: Handler | undefined;
	let turnStart: Handler | undefined;
	let turnEnd: Handler | undefined;
	const pi = {
		on: (name: string, h: Handler) => {
			if (name === "session_start") sessionStart = h;
			if (name === "turn_start") turnStart = h;
			if (name === "turn_end") turnEnd = h;
		},
		sendUserMessage: (text: string, opts?: unknown) => {
			sent.push({ text, opts });
		},
		registerTool: (tool: ToolForTest) => tools.set(tool.name, tool),
	};
	return {
		pi: pi as unknown as ExtensionAPI,
		sent,
		getStart: () => sessionStart,
		getTurnStart: () => turnStart,
		getTurnEnd: () => turnEnd,
		getTool: (name: string) => tools.get(name),
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
	let lastWatchOpts: { recursive: boolean } | undefined;
	const deps: WatchDeps = {
		watch: (_d, o, l) => {
			if (opts.throwOnWatch) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
			lastWatchOpts = o;
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
		lastWatchOpts: () => lastWatchOpts,
		flush: async () => {
			timer?.();
			await new Promise((r) => setTimeout(r, 10));
		},
	};
}

function multiRootWatchDeps() {
	const filesByDir = new Map<string, FileEntry[]>();
	const listeners: Array<() => void> = [];
	let timers: Array<() => void> = [];
	let closes = 0;
	const deps: WatchDeps = {
		watch: (_d, _o, l) => {
			listeners.push(l);
			return {
				close: () => {
					closes++;
				},
			};
		},
		listFiles: async (dir) => filesByDir.get(dir) ?? [],
		now: () => 1000,
		setTimer: (fn) => {
			timers.push(fn);
			return () => {
				timers = timers.filter((timer) => timer !== fn);
			};
		},
	};
	return {
		deps,
		setFiles: (dir: string, files: FileEntry[]) => {
			filesByDir.set(dir, files);
		},
		fireAll: () => {
			for (const listener of listeners) listener();
		},
		closes: () => closes,
		flush: async () => {
			const pending = timers;
			timers = [];
			for (const timer of pending) timer();
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

	it("dedupes steered notices for the same file across overlapping watch roots", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fwn-overlap-"));
		await mkdir(join(dir, ".pi"), { recursive: true });
		await writeFile(
			join(dir, ".pi/file-watch.json"),
			JSON.stringify({
				watches: [
					{ dir: "skills", patterns: ["**/*.ts"], recursive: true },
					{ dir: "skills/flow-pair", patterns: ["**/*.ts"], recursive: true },
				],
			}),
		);
		const skillsDir = join(dir, "skills");
		const flowPairDir = join(dir, "skills/flow-pair");
		const w = multiRootWatchDeps();
		const { pi, sent, getStart, getTurnStart } = fakePi();

		w.setFiles(skillsDir, [{ rel: "flow-pair/lib/identity.ts", mtimeMs: 1, size: 1 }]);
		w.setFiles(flowPairDir, [{ rel: "lib/identity.ts", mtimeMs: 1, size: 1 }]);
		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await getStart()?.({}, fakeCtx(false));
		await getTurnStart()?.({ timestamp: 1230 }, fakeCtx(false));

		w.setFiles(skillsDir, [{ rel: "flow-pair/lib/identity.ts", mtimeMs: 2, size: 1 }]);
		w.setFiles(flowPairDir, [{ rel: "lib/identity.ts", mtimeMs: 2, size: 1 }]);
		w.fireAll();
		await w.flush();

		expect(sent.map((s) => s.text)).toEqual(["[file-watch] flow-pair/lib/identity.ts modified"]);

		await rm(dir, { recursive: true, force: true });
	});

	it("keeps steered notice dedup through current turn end and the consuming turn", async () => {
		const dir = await makeProject();
		const w = fakeWatchDeps();
		const { pi, sent, getStart, getTurnStart, getTurnEnd } = fakePi();

		factory(pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await getStart()?.({}, fakeCtx(false)); // busy; changes are steered
		await getTurnStart()?.({ timestamp: 1230 }, fakeCtx(false)); // active current turn

		w.setFiles([{ rel: "guide.md", mtimeMs: 5, size: 5 }]);
		w.fireEvent();
		await w.flush();

		w.setFiles([{ rel: "guide.md", mtimeMs: 6, size: 5 }]);
		w.fireEvent();
		await w.flush();

		w.setFiles([{ rel: "guide.md", mtimeMs: 7, size: 5 }]);
		w.fireEvent();
		await w.flush();

		expect(sent.map((s) => s.text)).toEqual([
			"[file-watch] guide.md created",
			"[file-watch] guide.md modified",
		]);

		// Pi delivers steer messages after the current turn ends, so this turn_end
		// must not clear pending notices before their consuming turn starts.
		await getTurnEnd()?.({ timestamp: 1231 }, fakeCtx(false));
		w.setFiles([{ rel: "guide.md", mtimeMs: 8, size: 5 }]);
		w.fireEvent();
		await w.flush();

		expect(sent.map((s) => s.text)).toEqual([
			"[file-watch] guide.md created",
			"[file-watch] guide.md modified",
		]);

		// The steered message has now begun its consuming turn, but the model is
		// still busy. A same-file change during that turn must not be re-steered.
		await getTurnStart()?.({ timestamp: 1232 }, fakeCtx(false));
		w.setFiles([{ rel: "guide.md", mtimeMs: 9, size: 5 }]);
		w.fireEvent();
		await w.flush();

		expect(sent.map((s) => s.text)).toEqual([
			"[file-watch] guide.md created",
			"[file-watch] guide.md modified",
		]);

		await getTurnEnd()?.({ timestamp: 1233 }, fakeCtx(false));
		w.setFiles([{ rel: "guide.md", mtimeMs: 10, size: 5 }]);
		w.fireEvent();
		await w.flush();

		expect(sent.map((s) => s.text)).toEqual([
			"[file-watch] guide.md created",
			"[file-watch] guide.md modified",
			"[file-watch] guide.md modified",
		]);

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

describe("index wiring — file_watch_notify tool (AC-07)", () => {
	async function bootNoConfig() {
		const dir = await mkdtemp(join(tmpdir(), "fwn-rt-"));
		const w = fakeWatchDeps();
		const harness = fakePi();
		factory(harness.pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await harness.getStart()?.({}, fakeCtx(true)); // boot, no config => 0 watches
		return {
			dir,
			w,
			...harness,
			tool: harness.getTool("file_watch_notify"),
		};
	}

	it("registers an LLM-callable tool for status/list/watch/stop", async () => {
		const { tool } = await bootNoConfig();
		expect(tool).toBeDefined();
	});

	it("tool arms, lists, and stops a runtime watch with no slash command", async () => {
		const { dir, w, tool } = await bootNoConfig();
		expect(tool).toBeDefined();

		const armed = await tool?.execute(
			"t1",
			{ action: "watch", dir: "docs", patterns: ["**/*.md"] },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(w.closes()).toBe(0);
		expect(armed?.content[0].text).toContain("now watching");
		expect(armed?.content[0].text).toContain("**/*.md");

		const listed = await tool?.execute(
			"t2",
			{ action: "list" },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(listed?.content[0].text).toContain("watching:");
		expect(listed?.content[0].text).toContain("(runtime)");

		const stopped = await tool?.execute(
			"t3",
			{ action: "stop", dir: "docs" },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(w.closes()).toBe(1);
		expect(stopped?.content[0].text).toContain("stopped watching");

		await rm(dir, { recursive: true, force: true });
	});

	it("tool passes recursive=true through when arming broad nested watches", async () => {
		const { dir, w, tool } = await bootNoConfig();
		expect(tool).toBeDefined();

		const armed = await tool?.execute(
			"t1",
			{ action: "watch", dir: "scratch", patterns: ["**/*"], recursive: true },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(armed?.content[0].text).toContain("now watching");
		expect(w.lastWatchOpts()).toEqual({ recursive: true });

		await rm(dir, { recursive: true, force: true });
	});

	it("tool validates required watch/stop fields", async () => {
		const { dir, tool } = await bootNoConfig();
		expect(tool).toBeDefined();

		const noPatterns = await tool?.execute(
			"t1",
			{ action: "watch", dir: "docs" },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(noPatterns?.content[0].text).toContain("watch needs dir and at least one pattern");

		const noDir = await tool?.execute(
			"t2",
			{ action: "stop" },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(noDir?.content[0].text).toContain("stop needs dir");

		await rm(dir, { recursive: true, force: true });
	});

	it("dedupes a second watch on the same dir (disposes the first)", async () => {
		const { dir, w, tool } = await bootNoConfig();
		expect(tool).toBeDefined();
		await tool?.execute(
			"t1",
			{ action: "watch", dir: "docs", patterns: ["**/*.md"] },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(w.closes()).toBe(0);
		await tool?.execute(
			"t2",
			{ action: "watch", dir: "docs", patterns: ["**/*.ts"] },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(w.closes()).toBe(1); // prior disposed

		const listed = await tool?.execute(
			"t3",
			{ action: "list" },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(listed?.content[0].text.split("\n")).toHaveLength(1); // still exactly one watch

		await rm(dir, { recursive: true, force: true });
	});

	it("reports a clear tool error when arming fails, without crashing (try-guard)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fwn-rt-bad-"));
		const w = fakeWatchDeps({ throwOnWatch: true });
		const h = fakePi();
		factory(h.pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await h.getStart()?.({}, fakeCtx(true));
		const tool = h.getTool("file_watch_notify");

		const armed = await tool?.execute(
			"t1",
			{ action: "watch", dir: "docs", patterns: ["**/*.md"] },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(armed?.content[0].text).toContain("cannot watch");

		await rm(dir, { recursive: true, force: true });
	});

	it("disposes a runtime tool watch on reload — it does NOT survive (HIGH-2 leak guard)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fwn-rt-reload-"));
		const w = fakeWatchDeps();
		const h = fakePi();
		factory(h.pi, { cwd: dir, makeWatchDeps: () => w.deps });
		await h.getStart()?.({}, fakeCtx(true)); // boot, no config
		const tool = h.getTool("file_watch_notify");

		await tool?.execute(
			"t1",
			{ action: "watch", dir: "docs", patterns: ["**/*.md"] },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(w.closes()).toBe(0);

		await h.getStart()?.({}, fakeCtx(true)); // reload — disposeAll must clear runtime watch
		expect(w.closes()).toBe(1);

		const listed = await tool?.execute(
			"t2",
			{ action: "list" },
			undefined,
			undefined,
			fakeCtx(true),
		);
		expect(listed?.content[0].text).toBe("file-watch: no active watches"); // gone, not leaked

		await rm(dir, { recursive: true, force: true });
	});
});
