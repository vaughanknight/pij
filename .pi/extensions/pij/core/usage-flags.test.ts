import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EXT_ROOT = join(import.meta.dirname, "..");

/** A flag a parser accepts but the help never names is an INVISIBLE feature.
 *
 * s074 shipped `role` that way; s078 shipped `pij link --role` the same way,
 * and a prime's portable PA-standup recipe ended up carrying the note
 * "--role is undocumented in link --help" — a workaround standing in for a fix,
 * found by a peer rather than by us. It is worse than a plain omission here:
 * s078's own lineage refusal TELLS the operator to run
 * `pij link <id> --parent <prime> --role pa`, so the REMEDY named a flag the
 * help did not, and the only way to discover the flag was to trip the guard.
 *
 * Scraped from the parser's own registry rather than listed by hand, so a flag
 * added to a verb and not to USAGE fails HERE instead of being discovered by
 * someone reading a recipe that apologises for it.
 */
function flagRegistry(): readonly (readonly [string, readonly string[]])[] {
	const src = readFileSync(join(EXT_ROOT, "core", "cli.ts"), "utf8");
	const body = src.match(/const ALLOWED_FLAGS[\s\S]*?\n\};/)?.[0] ?? "";
	return [...body.matchAll(/^\t"?([a-z-]+)"?:\s*new Set\(\[([^\]]*)\]\)/gm)].map(
		([, verb, raw]) =>
			[
				verb as string,
				[...(raw ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1] as string),
			] as const,
	);
}

function usageBlock(): string {
	const src = readFileSync(join(EXT_ROOT, "cli.ts"), "utf8");
	const start = src.indexOf("const USAGE = `");
	return src.slice(start, src.indexOf("`;", start));
}

function usageLinesFor(verb: string, usage: string): string {
	return usage
		.split("\n")
		.filter((line) => new RegExp(`pij ${verb}\\b`).test(line))
		.join(" ");
}

/** Drift that PREDATES s078, named rather than tolerated in silence.
 *
 * Documenting these means inventing help text for flags this stream has not
 * studied, and a wrong description is worse than a missing one. Listing them
 * keeps the check TOTAL — every accepted flag is either documented or named
 * here, never merely unnoticed — so any NEW drift fails loudly while shrinking
 * this list stays a standalone chore with a visible target.
 */
const KNOWN_UNDOCUMENTED: Readonly<Record<string, readonly string[]>> = {
	send: ["file", "caption"],
	watchdog: ["capture", "max-lines", "max-bytes"],
};

describe("every flag a verb accepts appears in its usage line", () => {
	it("scrapes a real registry and a real usage block (guards a vacuous pass)", () => {
		expect(flagRegistry().length).toBeGreaterThan(5);
		expect(usageBlock().length).toBeGreaterThan(500);
	});

	it("documents every accepted flag, or names it as known-undocumented", () => {
		const usage = usageBlock();
		for (const [verb, flags] of flagRegistry()) {
			const text = usageLinesFor(verb, usage);
			if (text === "") continue;
			const tolerated = KNOWN_UNDOCUMENTED[verb] ?? [];
			for (const flag of flags) {
				if (flag === "json" || tolerated.includes(flag)) continue;
				expect(text, `pij ${verb} accepts --${flag} but its usage line never names it`).toContain(
					`--${flag}`,
				);
			}
		}
	});

	it("keeps the tolerated list honest — a flag that gets documented must leave it", () => {
		const usage = usageBlock();
		for (const [verb, flags] of Object.entries(KNOWN_UNDOCUMENTED)) {
			const text = usageLinesFor(verb, usage);
			for (const flag of flags) {
				expect(
					text.includes(`--${flag}`),
					`pij ${verb} --${flag} IS documented now — remove it from KNOWN_UNDOCUMENTED`,
				).toBe(false);
			}
		}
	});
});
