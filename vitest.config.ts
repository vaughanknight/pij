import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [".pi/extensions/**/*.test.ts", "harness/**/*.test.ts"],
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
