import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const script = resolve(import.meta.dirname, "windows-compat.ts");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("fails the focused stage when no files match despite project passWithNoTests", () => {
	const root = mkdtempSync(join(tmpdir(), "pij-windows-compat-"));
	roots.push(root);
	writeFileSync(
		join(root, "vitest.config.mjs"),
		"export default { test: { passWithNoTests: true } };\n",
	);
	// Skip unrelated static stages; run the actual Vitest CLI for focused tests.
	const npmCli = join(root, "npm.cjs");
	const vitestCli = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
	writeFileSync(
		npmCli,
		`const { spawnSync } = require("node:child_process");
if (process.argv[3] === "test") {
  const result = spawnSync(process.execPath, [${JSON.stringify(vitestCli)}, "run", ...process.argv.slice(5)], {
    cwd: process.cwd(), env: process.env, stdio: "inherit", shell: false,
  });
  process.exitCode = result.status ?? 1;
}
`,
	);
	const result = spawnSync(
		process.execPath,
		["--import", pathToFileURL(require.resolve("tsx")).href, script],
		{
			cwd: root,
			env: { ...process.env, npm_execpath: npmCli, NO_COLOR: "1" },
			encoding: "utf8",
			timeout: 20_000,
		},
	);
	const output = result.stdout + result.stderr;
	expect(result.error).toBeUndefined();
	expect(output).toContain("No test files found");
	expect(result.status).toBe(1);
	expect(output).toContain("focused-tests failed with exit code 1");
});
