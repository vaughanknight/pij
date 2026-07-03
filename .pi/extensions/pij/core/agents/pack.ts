// 3-tier pack discovery with precedence + shadowing (AC-01 logic layer).
//
// A directory is an agent pack iff it contains `prompt.md` (minih's rule — no
// `agent.json` required). Discovery scans a list of source dirs in precedence
// order (project → user → built-in); the first source to define a slug wins,
// and lower-precedence duplicates are kept but marked `shadowed` — never
// dropped. Pi-free: imports only node:fs and minih's pure `parseFrontmatter`.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "minih/runner";
import type { AgentSource, DiscoveredAgent } from "./types.js";

/** Pack metadata pij surfaces in its list UX (a subset of frontmatter + the
 *  pij-only `harness` hint). `harness` is read but never written back — minih
 *  owns the pack format. */
export interface PackMeta {
	description: string;
	tags: string[];
	model?: string;
	reasoning?: string;
	harness?: string;
}

/** A dir is a pack iff it contains `prompt.md`. */
export function isPack(dir: string): boolean {
	return existsSync(join(dir, "prompt.md"));
}

/**
 * Parse a `prompt.md`'s frontmatter into pij's discovery meta. The canonical
 * fields (description/tags/model/reasoning) come from minih's `parseFrontmatter`
 * so pij stays byte-compatible with minih; `harness` is a pij-only optional hint
 * extracted separately (minih neither emits nor validates it).
 */
export function parsePackMeta(content: string): PackMeta {
	const fm = parseFrontmatter(content);
	const harness = extractHarness(content);
	return {
		description: fm.description,
		tags: fm.tags,
		...(fm.model ? { model: fm.model } : {}),
		...(fm.reasoning ? { reasoning: fm.reasoning } : {}),
		...(harness ? { harness } : {}),
	};
}

/** Pull an optional `harness: <name>` line from the leading `---` block only. */
function extractHarness(content: string): string | undefined {
	const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const body = block?.[1];
	if (!body) return undefined;
	const line = body.split(/\r?\n/).find((l) => /^harness\s*:/.test(l));
	if (!line) return undefined;
	const value = line
		.replace(/^harness\s*:/, "")
		.trim()
		.replace(/^["']|["']$/g, "");
	return value.length > 0 ? value : undefined;
}

/** Discover every pack directly under `dir`, tagged with `source`. Skips
 *  underscore/dot-prefixed dirs (minih's `_shared`/`_templates` convention) and
 *  non-pack dirs. A missing `dir` yields `[]` (never throws). */
export function discoverInDir(dir: string, source: AgentSource): DiscoveredAgent[] {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const out: DiscoveredAgent[] = [];
	for (const name of names.sort()) {
		if (name.startsWith("_") || name.startsWith(".")) continue;
		const packDir = join(dir, name);
		let isDir = false;
		try {
			isDir = statSync(packDir).isDirectory();
		} catch {
			isDir = false;
		}
		if (!isDir || !isPack(packDir)) continue;
		const meta = parsePackMeta(readFileSync(join(packDir, "prompt.md"), "utf8"));
		out.push({
			slug: name,
			source,
			dir: packDir,
			description: meta.description,
			tags: meta.tags,
			...(meta.model ? { model: meta.model } : {}),
			...(meta.reasoning ? { reasoning: meta.reasoning } : {}),
			...(meta.harness ? { harness: meta.harness } : {}),
			shadowed: false,
		});
	}
	return out;
}

/** A discovery source: a directory and the precedence tier it represents. */
export interface DiscoverySource {
	dir: string;
	source: AgentSource;
}

/**
 * Merge packs across sources given in **precedence order** (first wins). Every
 * discovered pack is returned; an entry is `shadowed: true` when a
 * higher-precedence source already defined its slug (AC-01 — marked, not
 * dropped).
 */
export function discoverAgents(sources: DiscoverySource[]): DiscoveredAgent[] {
	const claimed = new Set<string>();
	const out: DiscoveredAgent[] = [];
	for (const { dir, source } of sources) {
		for (const agent of discoverInDir(dir, source)) {
			out.push({ ...agent, shadowed: claimed.has(agent.slug) });
			claimed.add(agent.slug);
		}
	}
	return out;
}
