// Import-boundary sensor (backpressure survey addition #2).
//
// The `agent-runtime` domain must never depend on the control-plane / transport
// layers: dependency direction is `cli → core/agents → minih`, never the reverse
// (domain constraint). This static scan flips that architectural rule from a
// review-tier concern into a computational one — every file under
// `core/agents/**` is parsed for import specifiers, and any import of a
// daemon / telegram / tmux / grammy module fails the build.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Forbidden module families — matched against import specifiers as path
 *  segments so a benign substring elsewhere can never false-positive. */
const FORBIDDEN = /(^|[./@])(daemon|telegram|tmux|grammy|@grammyjs)([./]|$)/;

function tsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__fixtures__") continue;
			out.push(...tsFiles(full));
		} else if (entry.name.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

/** Extract every import/export/require specifier from a source file. */
function importSpecifiers(source: string): string[] {
	const specs: string[] = [];
	const patterns = [
		/(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/g, // import … from "x" / export … from "x"
		/(?:^|\n)\s*import\s*["']([^"']+)["']/g, //             side-effect import "x"
		/\bimport\(\s*["']([^"']+)["']\s*\)/g, //               dynamic import("x")
		/\brequire\(\s*["']([^"']+)["']\s*\)/g, //              require("x")
	];
	for (const re of patterns) {
		for (const m of source.matchAll(re)) {
			if (m[1]) specs.push(m[1]);
		}
	}
	return specs;
}

describe("import boundary — core/agents must not import daemon/telegram/tmux/grammy", () => {
	const files = tsFiles(HERE);

	it("finds source files to scan (sanity)", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(
		files.map((f) => [f.slice(HERE.length + 1), f]),
	)("%s imports only permitted modules", (_label, file) => {
		const specs = importSpecifiers(readFileSync(file, "utf8"));
		const violations = specs.filter((s) => FORBIDDEN.test(s));
		expect(violations, `forbidden imports in ${file}: ${violations.join(", ")}`).toEqual([]);
	});
});
