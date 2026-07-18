import { randomUUID } from "node:crypto";
import {
	closeSync,
	fsyncSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const WINDOWS_RENAME_RETRY_DELAYS_MS = [5, 10, 20, 40, 80, 160, 320, 640] as const;
const WINDOWS_RENAME_RETRY_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

export interface RenameReplaceDeps {
	readonly platform: NodeJS.Platform;
	readonly rename: (source: string, target: string) => void;
	readonly sleep: (delayMs: number) => void;
	readonly retryDelaysMs: readonly number[];
}

const NODE_RENAME_REPLACE_DEPS: RenameReplaceDeps = {
	platform: process.platform,
	rename: renameSync,
	sleep: (delayMs) => {
		Atomics.wait(SLEEP_BUFFER, 0, 0, delayMs);
	},
	retryDelaysMs: WINDOWS_RENAME_RETRY_DELAYS_MS,
};

/** fsync, unless tests opt out: PIJ_TEST_NO_FSYNC=1 skips the physical disk
 *  barrier. Under parallel vitest (16 workers x 170 files on one disk) fsync
 *  latency stacks into tens of seconds and starves boot-path tests (the
 *  "load-flake" family — never test infra, always this). Production always
 *  fsyncs: crash-durability is the product contract; test assertions cover
 *  ordering + content, which do not need the physical barrier. */
export function maybeFsyncSync(fd: number): void {
	if (process.env.PIJ_TEST_NO_FSYNC === "1") return;
	fsyncSync(fd);
}

export function renameReplaceWithRetry(
	source: string,
	target: string,
	deps: RenameReplaceDeps = NODE_RENAME_REPLACE_DEPS,
): void {
	let retry = 0;
	while (true) {
		try {
			deps.rename(source, target);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			const delayMs = deps.retryDelaysMs[retry];
			if (
				deps.platform !== "win32" ||
				code === undefined ||
				!WINDOWS_RENAME_RETRY_CODES.has(code) ||
				delayMs === undefined
			) {
				throw error;
			}
			deps.sleep(delayMs);
			retry += 1;
		}
	}
}

/** Best-effort directory fsync (audit F2): a rename/link publishes a directory
 *  ENTRY, and fsyncing the file alone leaves that entry in the page cache — a
 *  power loss could then drop a "durable" record even though a process crash
 *  could not (the spine-store.ts:91-94 threat model includes power loss).
 *  Directory fsync is platform-dependent (Windows disallows opening
 *  directories), so failures never throw: durability degrades to
 *  process-crash scope there, never to an error. Returns whether the sync
 *  actually succeeded — most callers ignore it, but a caller for whom entry
 *  durability is LOAD-BEARING (the op-journal resolution sweep, review 005
 *  K1: discarding resolution evidence is only safe once the op entry's
 *  absence is durable) must branch on it. */
export function fsyncDirBestEffort(dir: string): boolean {
	let fd: number | undefined;
	try {
		fd = openSync(dir, "r");
		maybeFsyncSync(fd);
		return true;
	} catch {
		return false; // never throws by contract — see doc comment
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				// closing a directory fd is best-effort too
			}
		}
	}
}

/** Atomic text publish: temp file + fsync + rename-replace + best-effort
 *  directory fsync — same durability contract as {@link writeJsonAtomic}
 *  (which delegates here). For non-JSON artifacts, e.g. spine/spine.md. */
export function writeTextAtomic(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmpPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
	let fd: number | undefined;
	try {
		fd = openSync(tmpPath, "wx");
		writeFileSync(fd, text);
		maybeFsyncSync(fd);
		closeSync(fd);
		fd = undefined;
		renameReplaceWithRetry(tmpPath, path);
		// Durability of the RENAME itself, not just the bytes (audit F2).
		fsyncDirBestEffort(dirname(path));
	} finally {
		if (fd !== undefined) closeSync(fd);
		rmSync(tmpPath, { force: true });
	}
}

export function writeJsonAtomic(path: string, value: unknown): void {
	writeTextAtomic(path, JSON.stringify(value));
}
