#!/usr/bin/env tsx
// Machine-wide pij link policy.
//
// `just link` links every repository extension into Pi, but only `pij` into
// OMP. OMP shares Pi's MCP configuration and deliberately loads no other local
// extensions or project package manifest. `--check-only` exposes the same
// linked-worktree guard to the global skill recipe without mutating either home.

import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

type Verdict = "linked" | "already" | "removed" | "missing" | "skipped";

export interface RunLinkGlobalOptions {
	readonly pijRoot: string;
	readonly home: string;
	readonly args: readonly string[];
	readonly stdout: (line: string) => void;
	readonly stderr: (line: string) => void;
}

function canonicalRootFromGitFile(pijRoot: string): string | undefined {
	const gitFile = join(pijRoot, ".git");
	const stat = lstatSync(gitFile, { throwIfNoEntry: false });
	if (!stat?.isFile()) return undefined;
	let raw: string;
	try {
		raw = readFileSync(gitFile, "utf8");
	} catch {
		return pijRoot;
	}
	const match = /^gitdir:\s*(.+)\s*$/m.exec(raw);
	if (!match?.[1]) return pijRoot;
	const gitDir = isAbsolute(match[1]) ? resolve(match[1]) : resolve(pijRoot, match[1]);
	const marker = `${sep}.git${sep}worktrees${sep}`;
	const markerAt = gitDir.lastIndexOf(marker);
	return markerAt === -1 ? pijRoot : gitDir.slice(0, markerAt);
}

function sourceExtensions(sourceRoot: string, filter?: string): string[] {
	let entries: string[];
	try {
		entries = readdirSync(sourceRoot);
	} catch {
		return [];
	}
	return entries
		.filter((name) => {
			if (filter && name !== filter) return false;
			return lstatSync(join(sourceRoot, name), { throwIfNoEntry: false })?.isDirectory() === true;
		})
		.sort();
}

function absoluteLinkTarget(linkPath: string, target: string): string {
	return isAbsolute(target) ? resolve(target) : resolve(dirname(linkPath), target);
}

function isPijOwnedExtensionTarget(linkPath: string, target: string, name: string): boolean {
	const absolute = absoluteLinkTarget(linkPath, target);
	if (basename(absolute) !== name) return false;
	if (basename(dirname(absolute)) !== "extensions") return false;
	if (basename(dirname(dirname(absolute))) !== ".pi") return false;
	try {
		const packageJson = JSON.parse(
			readFileSync(resolve(absolute, "..", "..", "..", "package.json"), "utf8"),
		) as unknown;
		return (
			typeof packageJson === "object" &&
			packageJson !== null &&
			"name" in packageJson &&
			(packageJson as { readonly name?: unknown }).name === "pij"
		);
	} catch {
		return false;
	}
}

function ensureDirectory(path: string): void {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function linkExtension(
	sourceRoot: string,
	targetRoot: string,
	name: string,
	stderr: (line: string) => void,
): Verdict {
	const source = join(sourceRoot, name);
	const target = join(targetRoot, name);
	const stat = lstatSync(target, { throwIfNoEntry: false });
	if (!stat) {
		symlinkSync(source, target);
		return "linked";
	}
	if (!stat.isSymbolicLink()) {
		stderr(`skip ${target}: real directory or file; refusing to clobber`);
		return "skipped";
	}
	const current = readlinkSync(target);
	if (absoluteLinkTarget(target, current) === resolve(source)) return "already";
	if (!isPijOwnedExtensionTarget(target, current, name)) {
		stderr(`skip ${target}: refusing to replace foreign symlink -> ${current}`);
		return "skipped";
	}
	unlinkSync(target);
	symlinkSync(source, target);
	return "linked";
}

function removeExtension(
	targetRoot: string,
	name: string,
	stderr: (line: string) => void,
): Verdict {
	const target = join(targetRoot, name);
	const stat = lstatSync(target, { throwIfNoEntry: false });
	if (!stat) return "missing";
	if (!stat.isSymbolicLink()) {
		stderr(`skip ${target}: real directory or file; refusing to clobber`);
		return "skipped";
	}
	const current = readlinkSync(target);
	if (!isPijOwnedExtensionTarget(target, current, name)) {
		stderr(`skip ${target}: refusing to remove foreign symlink -> ${current}`);
		return "skipped";
	}
	unlinkSync(target);
	return "removed";
}

function enforceOmpPijOnly(
	sourceRoot: string,
	targetRoot: string,
	removeMode: boolean,
	filter: string | undefined,
	stdout: (line: string) => void,
	stderr: (line: string) => void,
): { changed: number; skipped: number } {
	let changed = 0;
	let skipped = 0;
	ensureDirectory(targetRoot);
	for (const name of readdirSync(targetRoot).sort()) {
		if (name === "pij") continue;
		const verdict = removeExtension(targetRoot, name, stderr);
		if (verdict === "removed") {
			stdout(`✗ omp/${name} (pij-only policy)`);
			changed++;
		} else if (verdict === "skipped") {
			skipped++;
		}
	}
	if (filter !== undefined && filter !== "pij") return { changed, skipped };
	const verdict = removeMode
		? removeExtension(targetRoot, "pij", stderr)
		: linkExtension(sourceRoot, targetRoot, "pij", stderr);
	if (verdict === "linked" || verdict === "removed") {
		stdout(`${verdict === "linked" ? "→" : "✗"} omp/pij`);
		changed++;
	} else if (verdict === "already") {
		stdout("= omp/pij (already linked)");
	} else if (verdict === "skipped") {
		skipped++;
	}
	return { changed, skipped };
}

function manageOmpMcp(
	home: string,
	removeMode: boolean,
	stdout: (line: string) => void,
	stderr: (line: string) => void,
): { changed: number; skipped: number } {
	const source = join(home, ".pi", "agent", "mcp.json");
	const target = join(home, ".omp", "agent", "mcp.json");
	const stat = lstatSync(target, { throwIfNoEntry: false });
	if (!stat) {
		if (removeMode) return { changed: 0, skipped: 0 };
		ensureDirectory(dirname(target));
		symlinkSync(source, target);
		stdout("→ omp/mcp.json -> pi/mcp.json");
		return { changed: 1, skipped: 0 };
	}
	if (!stat.isSymbolicLink()) {
		stderr(`skip ${target}: real file; refusing to clobber`);
		return { changed: 0, skipped: 1 };
	}
	const current = readlinkSync(target);
	if (absoluteLinkTarget(target, current) !== resolve(source)) {
		stderr(`skip ${target}: refusing to replace foreign symlink -> ${current}`);
		return { changed: 0, skipped: 1 };
	}
	if (!removeMode) {
		stdout("= omp/mcp.json (already linked)");
		return { changed: 0, skipped: 0 };
	}
	unlinkSync(target);
	stdout("✗ omp/mcp.json");
	return { changed: 1, skipped: 0 };
}

function doctorOmp(options: RunLinkGlobalOptions, sourceRoot: string): number {
	const ompExtensions = join(options.home, ".omp", "agent", "extensions");
	let names: string[] = [];
	try {
		names = readdirSync(ompExtensions).sort();
	} catch {
		options.stderr(`OMP extensions directory missing: ${ompExtensions}`);
		return 1;
	}
	if (names.length !== 1 || names[0] !== "pij") {
		options.stderr(
			`OMP extension policy violation: expected only pij, found ${names.join(", ") || "none"}`,
		);
		return 1;
	}
	const pijLink = join(ompExtensions, "pij");
	const mcpLink = join(options.home, ".omp", "agent", "mcp.json");
	const expectedPij = join(sourceRoot, "pij");
	const expectedMcp = join(options.home, ".pi", "agent", "mcp.json");
	if (
		!lstatSync(pijLink, { throwIfNoEntry: false })?.isSymbolicLink() ||
		absoluteLinkTarget(pijLink, readlinkSync(pijLink)) !== resolve(expectedPij)
	) {
		options.stderr(`OMP pij link mismatch: expected ${expectedPij}`);
		return 1;
	}
	if (
		!lstatSync(mcpLink, { throwIfNoEntry: false })?.isSymbolicLink() ||
		absoluteLinkTarget(mcpLink, readlinkSync(mcpLink)) !== resolve(expectedMcp)
	) {
		options.stderr(`OMP MCP link mismatch: expected ${expectedMcp}`);
		return 1;
	}
	options.stdout("✓ OMP policy: pij-only extension + shared Pi MCP config");
	return 0;
}

export function runLinkGlobal(options: RunLinkGlobalOptions): number {
	const worktreeCanonicalRoot = canonicalRootFromGitFile(options.pijRoot);
	if (worktreeCanonicalRoot !== undefined) {
		options.stderr(
			`refusing machine-wide links from linked worktree ${options.pijRoot}; run \`just link\` from ${worktreeCanonicalRoot}`,
		);
		return 1;
	}
	if (options.args.includes("--check-only")) return 0;
	const sourceRoot = join(options.pijRoot, ".pi", "extensions");
	if (options.args.includes("--doctor-omp")) return doctorOmp(options, sourceRoot);
	const removeMode = options.args.includes("--remove");
	const filter = options.args.find((arg) => !arg.startsWith("--"));
	const names = sourceExtensions(sourceRoot, filter);
	if (names.length === 0) {
		options.stdout(filter ? `no extension at .pi/extensions/${filter}` : "no extensions to link");
		return 0;
	}

	const piTargetRoot = join(options.home, ".pi", "agent", "extensions");
	const ompTargetRoot = join(options.home, ".omp", "agent", "extensions");
	ensureDirectory(piTargetRoot);
	let changed = 0;
	let skipped = 0;
	for (const name of names) {
		const verdict = removeMode
			? removeExtension(piTargetRoot, name, options.stderr)
			: linkExtension(sourceRoot, piTargetRoot, name, options.stderr);
		if (verdict === "linked" || verdict === "removed") {
			options.stdout(`${verdict === "linked" ? "→" : "✗"} pi/${name}`);
			changed++;
		} else if (verdict === "already") {
			options.stdout(`= pi/${name} (already linked)`);
		} else if (verdict === "skipped") {
			skipped++;
		}
	}
	const omp = enforceOmpPijOnly(
		sourceRoot,
		ompTargetRoot,
		removeMode,
		filter,
		options.stdout,
		options.stderr,
	);
	changed += omp.changed;
	skipped += omp.skipped;
	if (filter === undefined || filter === "pij") {
		const mcp = manageOmpMcp(options.home, removeMode, options.stdout, options.stderr);
		changed += mcp.changed;
		skipped += mcp.skipped;
	}
	if (changed === 0 && skipped === 0) {
		options.stdout(removeMode ? "nothing to remove" : "everything already linked");
	}
	return skipped > 0 ? 1 : 0;
}

const directEntry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (directEntry === import.meta.url) {
	process.exit(
		runLinkGlobal({
			pijRoot: resolve(import.meta.dirname, "..", ".."),
			home: homedir(),
			args: process.argv.slice(2),
			stdout: console.log,
			stderr: console.error,
		}),
	);
}
