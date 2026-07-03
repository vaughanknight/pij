// Peer-packet rendering (Plan 029 Phase 3, T001 / AC-14).
//
// A spawned agent pack becomes a daemon-bound pij peer. Its FIRST turn is a
// rendered "packet": the pack's own prompt + operating instructions + the
// coerced `-p` params + an explicit report contract that names the LITERAL
// `pij agent report` command (KF-08 — weak models follow *named* mechanisms;
// an inferred "report your result somehow" is not enough, field-proven by retro
// DL-001). Pure render: it reads the pack's own files (prompt.md / instructions.md
// / output-schema.json, the pack.ts fs precedent) and returns a string. No
// daemon/tmux/registry/channel imports — the import-boundary sensor guards that.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "minih/runner";

/** The EXACT command a spawned pack must run to report its result. Named
 *  verbatim in the packet so a weak model copies it rather than inventing a
 *  mechanism (KF-08 / DL-001). The `<json …>` placeholder is literal — the
 *  packet inlines the concrete schema below the command when the pack has one. */
export const REPORT_COMMAND = "pij agent report --json '<json matching the schema below>'";

/** The minimum a peer-packet render needs about a pack: its slug + the resolved
 *  pack directory. A full {@link DiscoveredAgent} is structurally assignable. */
export interface PeerPack {
	readonly slug: string;
	readonly dir: string;
}

/** Render options — reserved for future lifecycle/context hints; kept so the
 *  signature is stable as the packet grows. */
export interface RenderPacketOptions {
	/** Extra trailing note appended verbatim (e.g. a lifecycle reminder). */
	readonly note?: string;
}

/** Read a pack file, returning `undefined` when it is absent/unreadable. */
function readPackFile(dir: string, name: string): string | undefined {
	const path = join(dir, name);
	if (!existsSync(path)) return undefined;
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/** Render a single coerced param as `key: value` — strings bare, everything
 *  else JSON-encoded so numbers/booleans/objects round-trip unambiguously. */
function renderParam(key: string, value: unknown): string {
	const rendered = typeof value === "string" ? value : JSON.stringify(value);
	return `- ${key}: ${rendered}`;
}

/**
 * Render the first-turn packet for a pack spawned as a pij peer. The output is a
 * self-contained brief: the pack's prompt body (frontmatter stripped via minih's
 * `parseFrontmatter`), its operating instructions (when present), the caller's
 * coerced params, and a REQUIRED report contract naming {@link REPORT_COMMAND}
 * verbatim — with the pack's `output-schema.json` inlined as a fenced block when
 * the pack ships one. Pure: it only reads the pack's own files and returns text.
 */
export function renderPeerPacket(
	pack: PeerPack,
	params: Record<string, unknown>,
	opts: RenderPacketOptions = {},
): string {
	const promptRaw = readPackFile(pack.dir, "prompt.md");
	const body = promptRaw !== undefined ? parseFrontmatter(promptRaw).body.trim() : "";
	const instructions = readPackFile(pack.dir, "instructions.md")?.trim();
	const schema = readPackFile(pack.dir, "output-schema.json")?.trim();
	const paramKeys = Object.keys(params);

	const sections: string[] = [];
	sections.push(
		`# You are the \`${pack.slug}\` agent, running as a pij peer.\n\n` +
			"You were spawned into your own tmux pane. Do the task described below, then " +
			"report your result with the exact command in the **Reporting** section. You can " +
			"be re-tasked afterwards via `pij send` (a resident peer stays open).",
	);

	if (body) sections.push(body);

	if (instructions) {
		sections.push(`## Operating instructions\n\n${instructions}`);
	}

	if (paramKeys.length > 0) {
		const lines = paramKeys.map((k) => renderParam(k, params[k]));
		sections.push(`## Your inputs\n\n${lines.join("\n")}`);
	}

	// The report contract — always present, always names the literal command.
	const reportLines = [
		"## Reporting your result (REQUIRED)",
		"",
		"When you have finished, report back by running this EXACT command:",
		"",
		`    ${REPORT_COMMAND}`,
	];
	if (schema) {
		reportLines.push(
			"",
			"Your report JSON must satisfy this schema:",
			"",
			"```json",
			schema,
			"```",
		);
	} else {
		reportLines.push(
			"",
			"Your report JSON should be an object summarising your result (a `summary` field at minimum).",
		);
	}
	sections.push(reportLines.join("\n"));

	if (opts.note) sections.push(opts.note);

	return sections.join("\n\n");
}
