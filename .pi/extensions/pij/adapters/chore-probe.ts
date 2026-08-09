import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import type { ChoreProbePort, ChoreProbeResult } from "../core/chores/types.js";

const SCRIPT_INTERPRETERS = new Set([
	"bash",
	"bun",
	"deno",
	"node",
	"perl",
	"python",
	"python3",
	"ruby",
	"sh",
	"tsx",
	"zsh",
]);

function shellWords(command: string): string[] {
	const words: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	const flush = () => {
		if (current !== "") words.push(current);
		current = "";
	};
	for (const character of command) {
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) quote = undefined;
			else current += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "|" || character === ";" || character === "&") {
			flush();
			break;
		}
		if (/\s/.test(character)) {
			flush();
			continue;
		}
		current += character;
	}
	flush();
	return words;
}

function regularFile(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
}

function resolveFile(value: string, cwd: string): string | undefined {
	const path = isAbsolute(value) ? value : resolve(cwd, value);
	return regularFile(path) ? path : undefined;
}

function instrumentFiles(command: string, cwd: string): string[] {
	let words = shellWords(command);
	while (words[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words = words.slice(1);
	if (basename(words[0] ?? "") === "env") {
		words = words.slice(1);
		while (words[0] && (words[0].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))) {
			words = words.slice(1);
		}
	}
	const executable = words[0];
	if (!executable) return [];
	const files: string[] = [];
	if (executable.includes("/") || isAbsolute(executable)) {
		const resolved = resolveFile(executable, cwd);
		if (resolved) files.push(resolved);
	}
	if (SCRIPT_INTERPRETERS.has(basename(executable))) {
		for (const argument of words.slice(1)) {
			if (argument === "-c" || argument === "--eval") break;
			if (argument.startsWith("-")) continue;
			const resolved = resolveFile(argument, cwd);
			if (resolved) files.push(resolved);
			break;
		}
	}
	return [...new Set(files)];
}

export class ShellChoreProbe implements ChoreProbePort {
	instrumentFingerprint(command: string, cwd: string): string | null {
		const files = instrumentFiles(command, cwd);
		if (files.length === 0) return null;
		const hash = createHash("sha256");
		for (const path of files) {
			const content = readFileSync(path);
			hash.update(String(content.byteLength));
			hash.update("\0");
			hash.update(content);
			hash.update("\0");
		}
		return hash.digest("hex").slice(0, 12);
	}

	run(command: string, cwd: string, timeoutMs: number): ChoreProbeResult {
		try {
			const result = spawnSync("sh", ["-c", command], {
				cwd,
				encoding: "utf8",
				timeout: timeoutMs,
				stdio: ["ignore", "pipe", "pipe"],
			});
			if (result.error) {
				const code = (result.error as NodeJS.ErrnoException).code;
				return {
					ok: false,
					reason:
						code === "ETIMEDOUT"
							? `timeout after ${timeoutMs}ms`
							: `spawn failed: ${result.error.message}`,
				};
			}
			if (result.status !== 0) {
				const detail = result.stderr.trim();
				return {
					ok: false,
					reason: `exit ${result.status ?? "unknown"}${detail ? `: ${detail}` : ""}`,
				};
			}
			return { ok: true, output: result.stdout };
		} catch (error) {
			return {
				ok: false,
				reason: `spawn failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
