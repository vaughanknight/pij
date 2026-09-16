import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertTempPijHome } from "./test-home.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = /(^|[./@])(daemon|telegram|tmux|grammy|@grammyjs)([./]|$)/;
let pijHome: string;
let previousPijHome: string | undefined;

beforeEach(() => {
	previousPijHome = process.env.PIJ_HOME;
	pijHome = mkdtempSync(join(tmpdir(), "pij-chore-boundary-"));
	process.env.PIJ_HOME = pijHome;
	assertTempPijHome();
});

afterEach(() => {
	if (previousPijHome === undefined) {
		delete process.env.PIJ_HOME;
	} else {
		process.env.PIJ_HOME = previousPijHome;
	}
	rmSync(pijHome, { recursive: true, force: true });
});

function tsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...tsFiles(full));
		} else if (entry.name.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

function importSpecifiers(source: string): string[] {
	const specs: string[] = [];
	const patterns = [
		/(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/g,
		/(?:^|\n)\s*import\s*["']([^"']+)["']/g,
		/\bimport\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			if (match[1]) specs.push(match[1]);
		}
	}
	return specs;
}

describe("import boundary — core/chores must not import daemon/telegram/tmux/grammy", () => {
	const files = tsFiles(HERE);

	it("refuses unset and non-temp PIJ_HOME values", () => {
		const tempHome = process.env.PIJ_HOME;
		delete process.env.PIJ_HOME;
		expect(() => assertTempPijHome()).toThrow("require PIJ_HOME");
		process.env.PIJ_HOME = process.cwd();
		expect(() => assertTempPijHome()).toThrow("refuse non-temp PIJ_HOME");
		process.env.PIJ_HOME = tempHome;
		expect(assertTempPijHome()).toBe(tempHome);
	});

	it("covers the complete chore core", () => {
		const names = files.map((file) => file.slice(HERE.length + 1));
		expect(names).toEqual(
			expect.arrayContaining(["types.ts", "resolve.ts", "reduce.ts", "report.ts", "cli-verbs.ts"]),
		);
	});

	it.each(
		files.map((file) => [file.slice(HERE.length + 1), file]),
	)("%s imports only permitted modules", (_label, file) => {
		const violations = importSpecifiers(readFileSync(file, "utf8")).filter((specifier) =>
			FORBIDDEN.test(specifier),
		);
		expect(violations, `forbidden imports in ${file}: ${violations.join(", ")}`).toEqual([]);
	});
});
