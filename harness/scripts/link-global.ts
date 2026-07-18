#!/usr/bin/env tsx
// just link                  — symlink every .pi/extensions/<name>/ to ~/.pi/agent/extensions/<name>/
// just link -- <name>        — symlink only that one
// just unlink (or link -- --remove) — remove pij-owned symlinks from ~/.pi/agent/extensions/
//
// Idempotent. Refuses to clobber real directories, but replaces stale
// symlinks so this checkout remains the machine's extension source. After
// running, `pi` from any cwd autoloads pij's extensions in addition to
// whatever the cwd's package.json provides.
//
// Why ~/.pi/agent/extensions and not ~/.pi/extensions? Pi's loader
// resolves global extensions via `getAgentDir() + "/extensions"`, and
// `getAgentDir()` returns `~/.pi/agent` (see pi-mono
// `packages/coding-agent/src/config.ts:getAgentDir`). Linking into
// `~/.pi/extensions` looks plausible but is silently ignored.

import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE_ROOT = join(PIJ_ROOT, ".pi", "extensions");
const TARGET_ROOT = join(homedir(), ".pi", "agent", "extensions");

function listSourceExtensions(filter?: string): string[] {
	let entries: string[];
	try {
		entries = readdirSync(SOURCE_ROOT);
	} catch {
		return [];
	}
	return entries.filter((e) => {
		if (filter && e !== filter) return false;
		try {
			return lstatSync(join(SOURCE_ROOT, e)).isDirectory();
		} catch {
			return false;
		}
	});
}

function ensureTargetRoot(): void {
	if (!existsSync(TARGET_ROOT)) mkdirSync(TARGET_ROOT, { recursive: true });
}

function link(name: string): "linked" | "already" | "skipped" {
	const source = join(SOURCE_ROOT, name);
	const target = join(TARGET_ROOT, name);
	const stat = lstatSync(target, { throwIfNoEntry: false });

	if (!stat) {
		symlinkSync(source, target);
		return "linked";
	}

	if (stat.isSymbolicLink()) {
		const current = readlinkSync(target);
		if (current === source) return "already";
		unlinkSync(target);
		symlinkSync(source, target);
		return "linked";
	}

	console.error(`skip ${name}: ~/.pi/agent/extensions/${name} is a real directory, not a symlink`);
	return "skipped";
}

function unlink(name: string): "removed" | "missing" | "skipped" {
	const source = join(SOURCE_ROOT, name);
	const target = join(TARGET_ROOT, name);

	if (!existsSync(target) && !lstatSync(target, { throwIfNoEntry: false })) return "missing";
	try {
		const stat = lstatSync(target);
		if (!stat.isSymbolicLink()) {
			console.error(`skip ${name}: ~/.pi/agent/extensions/${name} is not a symlink`);
			return "skipped";
		}
		if (readlinkSync(target) !== source) {
			console.error(`skip ${name}: ~/.pi/agent/extensions/${name} points elsewhere`);
			return "skipped";
		}
		unlinkSync(target);
		return "removed";
	} catch {
		return "missing";
	}
}

function main(): void {
	const args = process.argv.slice(2);
	const removeMode = args.includes("--remove");
	const filter = args.find((a) => !a.startsWith("--"));

	const names = listSourceExtensions(filter);
	if (names.length === 0) {
		console.log(filter ? `no extension at .pi/extensions/${filter}` : "no extensions to link");
		process.exit(0);
	}

	ensureTargetRoot();

	let changed = 0;
	let skipped = 0;
	for (const name of names) {
		const verdict = removeMode ? unlink(name) : link(name);
		if (verdict === "linked" || verdict === "removed") {
			console.log(`${verdict === "linked" ? "→" : "✗"} ${name}`);
			changed++;
		} else if (verdict === "already") {
			console.log(`= ${name} (already linked)`);
		} else if (verdict === "missing") {
			console.log(`- ${name} (not linked)`);
		} else {
			skipped++;
		}
	}

	if (changed === 0 && skipped === 0)
		console.log(removeMode ? "nothing to remove" : "everything already linked");
	process.exit(skipped > 0 ? 1 : 0);
}

main();
