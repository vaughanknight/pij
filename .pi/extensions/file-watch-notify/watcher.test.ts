import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	type Change,
	compileWatch,
	DEFAULT_IGNORE,
	DEFAULT_NOTICE,
	WatchReconciler,
} from "./store.js";
import { FolderWatcher, nodeWatchDeps, type WatchDeps } from "./watcher.js";

function makeWatcher(dir: string, deps: WatchDeps, onNotices: (n: string[], c: Change[]) => void) {
	const compiled = compileWatch({ dir, patterns: ["*.md"] }, DEFAULT_IGNORE);
	const reconciler = new WatchReconciler(compiled, DEFAULT_NOTICE);
	return new FolderWatcher(compiled, reconciler, 20, onNotices, deps);
}

describe("FolderWatcher — real fs integration", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "fwn-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("detects create / modify / delete of a matching file via scan()", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, nodeWatchDeps(), (_n, c) => seen.push(...c));
		await w.start(); // primes empty baseline

		await writeFile(join(dir, "a.md"), "hello");
		await w.scan();
		expect(seen.at(-1)).toEqual({ path: "a.md", kind: "created" });

		await writeFile(join(dir, "a.md"), "hello world longer");
		await w.scan();
		expect(seen.at(-1)).toEqual({ path: "a.md", kind: "modified" });

		await rm(join(dir, "a.md"));
		await w.scan();
		expect(seen.at(-1)).toEqual({ path: "a.md", kind: "deleted" });

		w.dispose();
	});

	it("ignores non-matching files and editor artifacts", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, nodeWatchDeps(), (_n, c) => seen.push(...c));
		await w.start();

		await writeFile(join(dir, "note.txt"), "x"); // not *.md
		await writeFile(join(dir, "4913"), "x"); // vim artifact
		await writeFile(join(dir, ".hidden"), "x"); // dotfile
		await w.scan();
		expect(seen).toEqual([]);

		w.dispose();
	});
});

describe("FolderWatcher — debounce (fake deps)", () => {
	it("coalesces a burst of fs events into a single scan", async () => {
		const dir = "/virtual";
		let listener: (() => void) | undefined;
		let pending: (() => void) | undefined;
		let scans = 0;
		const files = [{ rel: "a.md", mtimeMs: 1, size: 1 }];

		const deps: WatchDeps = {
			watch: (_d, _o, l) => {
				listener = l;
				return { close: () => {} };
			},
			listFiles: async () => {
				scans++;
				return files;
			},
			now: () => 1000,
			setTimer: (fn) => {
				pending = fn; // last-wins, mirrors clearTimeout+setTimeout
				return () => {
					pending = undefined;
				};
			},
		};

		const w = makeWatcher(dir, deps, () => {});
		await w.start(); // 1 scan (prime)
		expect(scans).toBe(1);

		listener?.(); // burst
		listener?.();
		listener?.();
		expect(scans).toBe(1); // debounced — nothing ran yet
		pending?.(); // fire the single debounced timer
		await Promise.resolve();
		expect(scans).toBe(2); // exactly one extra scan for the whole burst

		w.dispose();
	});
});
