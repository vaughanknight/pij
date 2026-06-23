import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	deliverNotices,
	type InjectPort,
	makeNoticeDedupKey,
	SteeredNoticeTracker,
} from "./inject.js";
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
		expect(seen.at(-1)).toMatchObject({
			path: "a.md",
			kind: "created",
			identityPath: join(dir, "a.md"),
		});

		await writeFile(join(dir, "a.md"), "hello world longer");
		await w.scan();
		expect(seen.at(-1)).toMatchObject({
			path: "a.md",
			kind: "modified",
			identityPath: join(dir, "a.md"),
		});

		await rm(join(dir, "a.md"));
		await w.scan();
		expect(seen.at(-1)).toMatchObject({
			path: "a.md",
			kind: "deleted",
			identityPath: join(dir, "a.md"),
		});

		w.dispose();
	});

	it("normalizes identity across nested real roots for steer dedup", async () => {
		const skillsDir = join(dir, "skills");
		const flowPairDir = join(skillsDir, "flow-pair");
		const filePath = join(flowPairDir, "lib/identity.ts");
		await mkdir(join(flowPairDir, "lib"), { recursive: true });
		await writeFile(filePath, "initial");

		const sent: string[] = [];
		const port: InjectPort = {
			isIdle: () => false,
			send: (text) => {
				sent.push(text);
				return { ok: true };
			},
		};
		const pending = new SteeredNoticeTracker();
		const onNotices = (notices: string[], changes: Change[]) => {
			deliverNotices(
				port,
				notices.map((text, i) => ({ text, dedupKey: makeNoticeDedupKey(changes[i], text) })),
				pending,
			);
		};
		const skillsCompiled = compileWatch(
			{ dir: skillsDir, patterns: ["**/*.ts"], recursive: true },
			DEFAULT_IGNORE,
		);
		const flowPairCompiled = compileWatch(
			{ dir: flowPairDir, patterns: ["**/*.ts"], recursive: true },
			DEFAULT_IGNORE,
		);
		const rootWatch = new FolderWatcher(
			skillsCompiled,
			new WatchReconciler(skillsCompiled, DEFAULT_NOTICE),
			20,
			onNotices,
			nodeWatchDeps(),
		);
		const nestedWatch = new FolderWatcher(
			flowPairCompiled,
			new WatchReconciler(flowPairCompiled, DEFAULT_NOTICE),
			20,
			onNotices,
			nodeWatchDeps(),
		);
		await rootWatch.start();
		await nestedWatch.start();

		await writeFile(filePath, "changed content");
		await rootWatch.scan();
		await nestedWatch.scan();

		expect(sent).toEqual(["[file-watch] flow-pair/lib/identity.ts modified"]);

		rootWatch.dispose();
		nestedWatch.dispose();
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
