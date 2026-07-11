import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
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
	MAX_CONTENT_BYTES,
	WatchReconciler,
} from "./store.js";
import { FolderWatcher, nodeWatchDeps, type WatchDeps } from "./watcher.js";

function makeWatcher(dir: string, deps: WatchDeps, onNotices: (n: string[], c: Change[]) => void) {
	const compiled = compileWatch({ dir, patterns: ["*.md"] }, DEFAULT_IGNORE);
	const reconciler = new WatchReconciler(compiled, DEFAULT_NOTICE);
	return new FolderWatcher(compiled, reconciler, 20, onNotices, deps);
}

/** Deterministic deps for the scan()-driven integration tests: real fs listing, but
 *  NO live fs.watch events and NO debounce timers. Background debounce scans racing
 *  the explicit scan() calls under machine load were the flake (plan-036 ruling #8,
 *  DL-002/DL-003); these tests exercise scan-reconcile behaviour, not the event
 *  plumbing — the debounce path keeps its own fake-deps suite below. */
function scanOnlyDeps(): WatchDeps {
	return {
		...nodeWatchDeps(),
		watch: () => ({ close: () => {} }),
		setTimer: () => () => {},
	};
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
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
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
			scanOnlyDeps(),
		);
		const nestedWatch = new FolderWatcher(
			flowPairCompiled,
			new WatchReconciler(flowPairCompiled, DEFAULT_NOTICE),
			20,
			onNotices,
			scanOnlyDeps(),
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
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
		await w.start();

		await writeFile(join(dir, "note.txt"), "x"); // not *.md
		await writeFile(join(dir, "4913"), "x"); // vim artifact
		await writeFile(join(dir, ".hidden"), "x"); // dotfile
		await w.scan();
		expect(seen).toEqual([]);

		w.dispose();
	});

	it("captures under-cap text content → a modified reports a textual delta (AC-06)", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
		await writeFile(join(dir, "a.md"), "line1\nline2\n");
		await w.start(); // primes WITH content

		await writeFile(join(dir, "a.md"), "line1\nCHANGED\n");
		await w.scan();
		const c = seen.at(-1);
		expect(c?.kind).toBe("modified");
		expect(c?.added).toBe(1);
		expect(c?.removed).toBe(1);
		expect(c?.lineRanges).toEqual([{ start: 2, end: 2 }]);
		expect(c?.diff).toContain("+CHANGED");

		w.dispose();
	});

	it("suppresses an mtime-only touch once content is captured (AC-03)", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
		await writeFile(join(dir, "a.md"), "same\n");
		await w.start();

		// rewrite identical bytes but bump mtime
		const future = new Date(Date.now() + 5000);
		await writeFile(join(dir, "a.md"), "same\n");
		await utimes(join(dir, "a.md"), future, future);
		await w.scan();
		expect(seen).toEqual([]); // empty textual delta → no notice

		w.dispose();
	});

	it("skips content for a binary file → modified reports without a delta (AC-06)", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
		await writeFile(join(dir, "a.md"), Buffer.from([1, 2, 0, 3, 4])); // NUL byte
		await w.start();

		await writeFile(join(dir, "a.md"), Buffer.from([1, 2, 0, 3, 4, 5]));
		await w.scan();
		const c = seen.at(-1);
		expect(c?.kind).toBe("modified");
		expect(c?.diff).toBeUndefined();
		expect(c?.lineRanges).toBeUndefined();

		w.dispose();
	});

	it("skips content for an over-cap file → modified reports without a delta (AC-06)", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
		const big = "x".repeat(MAX_CONTENT_BYTES + 10);
		await writeFile(join(dir, "a.md"), big);
		await w.start();

		await writeFile(join(dir, "a.md"), `${big}y`);
		await w.scan();
		const c = seen.at(-1);
		expect(c?.kind).toBe("modified");
		expect(c?.diff).toBeUndefined();

		w.dispose();
	});

	it("advances the baseline exactly once per wake — successive edits are delta-only (AC-04, F-11)", async () => {
		const seen: Change[] = [];
		const w = makeWatcher(dir, scanOnlyDeps(), (_n, c) => seen.push(...c));
		await writeFile(join(dir, "a.md"), "v1\n");
		await w.start();

		// distinct sizes per write: a same-size rewrite inside one mtime tick is invisible
		// to the {mtimeMs,size} snapshot — the load-flake's second class (ruling #8)
		await writeFile(join(dir, "a.md"), "v2 second\n");
		await w.scan();
		expect(seen.at(-1)?.diff).toContain("+v2 second");
		expect(seen.at(-1)?.diff).toContain("-v1");

		await writeFile(join(dir, "a.md"), "v3 third pass\n");
		await w.scan();
		// delta is v2→v3 (baseline advanced past v1), NOT cumulative v1→v3
		expect(seen.at(-1)?.diff).toContain("+v3 third pass");
		expect(seen.at(-1)?.diff).toContain("-v2 second");
		expect(seen.at(-1)?.diff).not.toContain("-v1");

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
