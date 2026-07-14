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

export function writeJsonAtomic(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmpPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
	let fd: number | undefined;
	try {
		fd = openSync(tmpPath, "wx");
		writeFileSync(fd, JSON.stringify(value));
		fsyncSync(fd);
		closeSync(fd);
		fd = undefined;
		renameReplaceWithRetry(tmpPath, path);
	} finally {
		if (fd !== undefined) closeSync(fd);
		rmSync(tmpPath, { force: true });
	}
}
