import { createRequire } from "node:module";

import { defineConfig } from "vitest/config";

const NODE_SQLITE_SHIM = "\0node-sqlite-shim";

const nodeRequire = createRequire(import.meta.url);

// `node:sqlite` is a built-in only on Node >= 22.5. On older runtimes — notably
// the CI matrix's Node 20 leg — it cannot be required at all, so every test file
// that imports the SQLite-backed store crashes at load (store.ts:10 statically
// imports it), which a per-test `describe.skipIf` cannot prevent. Probe once here
// and, when node:sqlite is absent, exclude exactly the two store tests so the
// suite stays green instead of erroring at collection time.
//
// This is a DELIBERATE, HONEST coverage gap, not a silent one: these two store
// tests still run in full on Node >= 22.5 (local dev today, and CI once the Node
// matrix is bumped — a separate call for Jordan). Everything else runs on every
// Node version.
function hasNodeSqlite(): boolean {
	try {
		nodeRequire("node:sqlite");
		return true;
	} catch {
		return false;
	}
}

const SQLITE_DEPENDENT_TESTS = [
	".pi/extensions/session-sql/store.test.ts",
	".pi/extensions/todo/store.test.ts",
];

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
		exclude: [
			"node_modules",
			".pi/git",
			".pi/npm",
			...(hasNodeSqlite() ? [] : SQLITE_DEPENDENT_TESTS),
		],
		testTimeout: 5000,
		// Skip physical fsync barriers in tests (adapters/atomic-file.ts
		// maybeFsyncSync): 18 fsync sites x 16 parallel workers on one disk
		// starved boot-path tests into 20s+ timeouts. Ordering/content
		// assertions are unaffected; production always fsyncs.
		env: { PIJ_TEST_NO_FSYNC: "1" },
		reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
		// A fresh clone with no extensions yet (and post-demo-teardown at
		// v1 ship) has no .test.ts files. Vitest's default is exit 1 in
		// that case. Treat empty-tests as success — the harness's value is
		// the framework, not a guarantee that tests exist.
		passWithNoTests: true,
	},
});
