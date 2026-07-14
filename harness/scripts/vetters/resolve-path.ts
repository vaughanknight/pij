// Maps a manifest `source` string to the on-disk install path by
// parsing `pi list` output. Prefers project-scope paths over user-scope
// when both exist (project paths are what pi loads in this repo).

import { execFileSync } from "node:child_process";
import { piInvocation } from "../cli-invocation.js";

export interface PiListEntry {
	source: string;
	path: string;
	scope: "user" | "project";
}

// Strip CSI ANSI escapes (e.g. \x1b[1m, \x1b[22m, \x1b[2m).
function stripAnsi(s: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control chars.
	return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

export function parsePiListOutput(raw: string): PiListEntry[] {
	const out: PiListEntry[] = [];
	let scope: "user" | "project" | null = null;
	let pendingSource: string | null = null;

	for (const rawLine of raw.split("\n")) {
		const line = stripAnsi(rawLine).replace(/\s+$/, "");
		if (!line) continue;
		if (/^User packages:?$/i.test(line)) {
			scope = "user";
			pendingSource = null;
			continue;
		}
		if (/^Project packages:?$/i.test(line)) {
			scope = "project";
			pendingSource = null;
			continue;
		}
		if (scope === null) continue;
		// 2-space indented = source; 4+ space indented = path
		if (/^ {2}\S/.test(line) && !/^ {4}/.test(line)) {
			pendingSource = line.trim();
		} else if (/^ {4}\S/.test(line)) {
			const path = line.trim();
			if (pendingSource) {
				out.push({ source: pendingSource, path, scope });
				pendingSource = null;
			}
		}
	}
	return out;
}

export function piList(): PiListEntry[] {
	const invocation = piInvocation(["list"]);
	const raw = execFileSync(invocation.file, invocation.args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return parsePiListOutput(raw);
}

// Resolve a source to its on-disk path. Prefer project scope.
export function resolveSourcePath(
	source: string,
	entries: PiListEntry[] = piList(),
): string | null {
	const matches = entries.filter((e) => e.source === source);
	const project = matches.find((e) => e.scope === "project");
	if (project) return project.path;
	return matches[0]?.path ?? null;
}
