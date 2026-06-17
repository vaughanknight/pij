import { defineConfig } from "vitest/config";

const NODE_SQLITE_SHIM = "\0node-sqlite-shim";

export default defineConfig({
	plugins: [
		{
			name: "node-sqlite-shim",
			enforce: "pre",
			resolveId(id: string) {
				if (id === "node:sqlite" || id === "sqlite") return NODE_SQLITE_SHIM;
				return undefined;
			},
			load(id: string) {
				if (id !== NODE_SQLITE_SHIM) return undefined;
				return [
					"import { createRequire } from 'node:module';",
					"const require = createRequire(import.meta.url);",
					"const sqlite = require('node:sqlite');",
					"export const DatabaseSync = sqlite.DatabaseSync;",
				].join("\n");
			},
		},
	],
	test: {
		include: [".pi/extensions/**/*.test.ts", "harness/**/*.test.ts", "skills/**/*.test.ts"],
		exclude: ["node_modules", ".pi/git", ".pi/npm"],
		testTimeout: 5000,
		reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
		// A fresh clone with no extensions yet (and post-demo-teardown at
		// v1 ship) has no .test.ts files. Vitest's default is exit 1 in
		// that case. Treat empty-tests as success — the harness's value is
		// the framework, not a guarantee that tests exist.
		passWithNoTests: true,
	},
});
