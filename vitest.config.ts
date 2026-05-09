import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [".pi/extensions/**/*.test.ts", "harness/**/*.test.ts"],
		exclude: ["node_modules", ".pi/git", ".pi/npm"],
		testTimeout: 5000,
		reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
	},
});
